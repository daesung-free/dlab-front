import { request } from './client'
import { listClasses, type ClassGroup } from './classes'

/* 기초 관리 (F-4.10-1) — 마스터 10종
 *
 * ★ 화면은 표 하나인데 **엔드포인트가 마스터마다 다르다.** 경로도(`/masters/*` 밖에
 *   `/classes`·`/penalty-items` 가 있다), 필수 파라미터도, 쓰기 가능 범위도 다르다.
 *   그래서 화면이 분기하지 않도록 여기서 공통 행(MasterRow)으로 맞춘다.
 *
 * ★ 공통 컬럼이 마스터마다 **있기도 없기도 하다.** 없는 것을 `<Unfilled/>`로 그리면
 *   "서버가 아직 안 준다"는 뜻이 되는데, 실제로는 **의도적으로 없는 것**이다
 *   (강의실 코드는 roomNo 가 그 역할이라 안 두고, 학과계열은 참조하는 곳이 없다).
 *   그래서 컬럼 자체를 숨긴다 — `columns` 플래그가 그 판단이다.
 *
 * ★ 연도·지점 축이 셋으로 갈린다. 화면이 파라미터를 잘못 보내면 400이다.
 *   · 지점 + 연도 : 학과 · 과정 · 교육과정 · 교습비 · 반 · 장학 종류
 *   · 지점만      : 강의실 · 사물함  (물리 공간이라 연도가 없다 — 전년도 복사 대상도 아니다)
 *   · 연도만      : 상벌점 항목
 *   · 둘 다 없음  : 학과계열 (전 지점 공통 고정값)
 */

/** 화면 표 한 줄. 마스터마다 다른 응답을 이 모양으로 맞춘다 */
export interface MasterRow {
  id: number
  /** 없는 마스터가 있다 — 그때는 컬럼을 숨긴다 */
  code: string | null
  name: string
  /** 마스터마다 성격이 다른 부가정보(담임·점수·수용인원 등)를 여기 넣는다 */
  memo: string | null
  sortOrder: number | null
  /** 없는 마스터가 있다 — 그때는 컬럼을 숨긴다 */
  active: boolean | null
  /**
   * 이름을 고칠 때 서버가 **함께 요구하는** 값. 마스터마다 다르다.
   *
   * ★ 강의실은 `roomNo`, 장학 종류는 `discountRate` 가 PUT 의 필수값이다. 이름만 보내면
   *   400이라, 지금 값을 그대로 실어 보내야 이름만 바꿀 수 있다.
   */
  extra?: Record<string, unknown>
}

/** 조회에 필요한 축. 마스터가 자기에게 필요한 것만 꺼내 쓴다 */
export interface MasterContext {
  academyId: number
  year: number
}

/** 어느 공통 컬럼을 그릴 수 있는가 */
export interface MasterColumns {
  code: boolean
  sortOrder: boolean
  active: boolean
}

export interface MasterDef {
  key: string
  label: string
  icon: string
  /** 실제 DB 표 이름. 화면이 그대로 보여주므로 목업 값이 아니라 서버 값이어야 한다 */
  table: string
  /** 전년도 복사 대상이면 true. 강의실·사물함은 연도가 없어 대상이 아니다 */
  copied: boolean
  columns: MasterColumns
  /** 비고 칸에 무엇이 들어가는지 — 화면이 헤더 툴팁으로 쓴다 */
  memoLabel?: string
  list: (ctx: MasterContext) => Promise<MasterRow[]>
  /** 이름만 받는 최소 등록. 없으면 등록 버튼을 숨긴다 */
  create?: (ctx: MasterContext, name: string) => Promise<unknown>
  /** 이름 수정. 없으면 수정 버튼을 숨긴다. row.extra 를 함께 보내야 하는 마스터가 있다 */
  rename?: (row: MasterRow, name: string) => Promise<unknown>
  remove?: (id: number) => Promise<unknown>
  setActive?: (id: number, active: boolean) => Promise<unknown>
}

/* ── 마스터별 응답 타입 ───────────────────────────────────────── */

interface NamedMaster {
  id: number
  name: string
  code?: string | null
  memo?: string | null
  sortOrder?: number | null
  active?: boolean | null
}

interface Room {
  id: number
  academyId: number
  roomNo: string
  name: string | null
  capacity: number | null
  memo: string | null
  active: boolean
}

interface Locker {
  id: number
  lockerNo: string
  enrollmentId: number | null
  studentName: string | null
}

interface PenaltyItemMaster {
  id: number
  itemName: string
  category: 'MERIT' | 'DEMERIT'
  point: number
}

export interface ScholarshipMaster {
  id: number
  academyId: number | null
  year: number
  code: string
  name: string
  /** 할인율(%) */
  discountRate: number
  active: boolean
  sortOrder: number | null
  memo: string | null
}

/** 장학 부여 드롭다운용. 여기 없는 코드로 부여하면 서버가 막는다 */
export function listSelectableScholarships(ctx: MasterContext): Promise<ScholarshipMaster[]> {
  return request<ScholarshipMaster[]>('/api/v1/admin/masters/scholarship-masters/selectable', {
    query: { year: ctx.year, academyId: ctx.academyId },
  })
}

/* ── 공통 행 변환 ─────────────────────────────────────────────── */

function fromNamed(m: NamedMaster): MasterRow {
  return {
    id: m.id,
    code: m.code ?? null,
    name: m.name,
    memo: m.memo ?? null,
    sortOrder: m.sortOrder ?? null,
    active: m.active ?? null,
  }
}

/* ── 전년도 복사 ──────────────────────────────────────────────── */

/**
 * 복사 결과. `copied` 는 표 이름 → 건수다.
 *
 * ★ 대상 연도에 데이터가 있으면 409로 거부된다 — 덮어쓰지 않는다.
 * ★ 상위 관리자만 실행할 수 있다.
 */
export interface SnapshotResult {
  fromYear: number
  toYear: number
  copied: Record<string, number>
}

export function copyYear(body: { academyId: number; fromYear: number; toYear: number }): Promise<SnapshotResult> {
  return request<SnapshotResult>('/api/v1/admin/masters/yearly-copy', { method: 'POST', body })
}

/* ── 마스터 정의 ──────────────────────────────────────────────── */

const ALL: MasterColumns = { code: true, sortOrder: true, active: true }

export const MASTERS: MasterDef[] = [
  {
    key: 'track',
    label: '학과계열',
    icon: 'git-compare',
    table: 'track_master',
    // 전 지점 공통 고정값이라 지점·연도 축이 없다. 복사 대상도 아니다
    copied: false,
    // 코드가 없다 — 이 마스터를 참조하는 곳이 아직 없어 코드를 둘 이유가 없다.
    // active·수정·삭제가 없는 것은 구멍이다(docs/API_GAPS.md)
    columns: { code: false, sortOrder: false, active: false },
    list: () => request<NamedMaster[]>('/api/v1/admin/masters/tracks').then((r) => r.map(fromNamed)),
    create: (_ctx, name) => request('/api/v1/admin/masters/tracks', { method: 'POST', body: { name } }),
  },
  {
    key: 'department',
    label: '학과',
    icon: 'graduation-cap',
    table: 'department_master',
    copied: true,
    columns: { code: true, sortOrder: false, active: true },
    list: (ctx) =>
      request<NamedMaster[]>('/api/v1/admin/masters/departments', { query: { year: ctx.year } }).then((r) =>
        r.map(fromNamed),
      ),
    create: (ctx, name) =>
      request('/api/v1/admin/masters/departments', {
        method: 'POST',
        body: { academyId: ctx.academyId, year: ctx.year, name },
      }),
    rename: (row, name) => request(`/api/v1/admin/masters/departments/${row.id}`, { method: 'PUT', body: { name } }),
    remove: (id) => request(`/api/v1/admin/masters/departments/${id}`, { method: 'DELETE' }),
    setActive: (id, active) =>
      request(`/api/v1/admin/masters/departments/${id}/active`, { method: 'PATCH', body: { active } }),
  },
  {
    key: 'course_type',
    label: '과정(전형)',
    icon: 'award',
    table: 'course_type',
    copied: true,
    columns: ALL,
    list: (ctx) =>
      request<NamedMaster[]>('/api/v1/admin/masters/course-types', {
        query: { academyId: ctx.academyId, year: ctx.year },
      }).then((r) => r.map(fromNamed)),
    create: (ctx, name) =>
      request('/api/v1/admin/masters/course-types', {
        method: 'POST',
        body: { academyId: ctx.academyId, year: ctx.year, name },
      }),
    rename: (row, name) => request(`/api/v1/admin/masters/course-types/${row.id}`, { method: 'PUT', body: { name } }),
    remove: (id) => request(`/api/v1/admin/masters/course-types/${id}`, { method: 'DELETE' }),
    setActive: (id, active) =>
      request(`/api/v1/admin/masters/course-types/${id}/active`, { method: 'PATCH', body: { active } }),
  },
  {
    key: 'class_group',
    label: '반',
    icon: 'layout-grid',
    table: 'class_master',
    copied: true,
    // 반은 코드·사용여부가 없고 담임·정원이 그 자리를 대신한다
    columns: { code: false, sortOrder: false, active: false },
    memoLabel: '담임 · 인원',
    list: (ctx) =>
      listClasses(ctx.year).then((list: ClassGroup[]) =>
        list
          .filter((c) => c.academyId === ctx.academyId)
          .map((c) => ({
            id: c.id,
            code: null,
            name: c.name,
            memo: [
              c.homeroomTeacherName ? `담임 ${c.homeroomTeacherName}` : '담임 미지정',
              c.capacity === null ? `${c.memberCount}명` : `${c.memberCount}/${c.capacity}명`,
            ].join(' · '),
            sortOrder: null,
            active: null,
          })),
      ),
    create: (ctx, name) =>
      request('/api/v1/admin/classes', {
        method: 'POST',
        body: { academyId: ctx.academyId, year: ctx.year, name, classType: 'FIXED' },
      }),
    rename: (row, name) => request(`/api/v1/admin/classes/${row.id}`, { method: 'PUT', body: { name } }),
    // 삭제 API 가 없다 (docs/API_GAPS.md)
  },
  {
    key: 'curriculum',
    label: '교육과정',
    icon: 'clipboard-list',
    table: 'curriculum',
    copied: true,
    columns: ALL,
    list: (ctx) =>
      request<(NamedMaster & { className?: string | null })[]>('/api/v1/admin/masters/curriculums', {
        query: { academyId: ctx.academyId, year: ctx.year },
      }).then((r) =>
        r.map((m) => ({ ...fromNamed(m), memo: m.memo ?? (m.className ? `반 ${m.className}` : null) })),
      ),
    create: (ctx, name) =>
      request('/api/v1/admin/masters/curriculums', {
        method: 'POST',
        body: { academyId: ctx.academyId, year: ctx.year, name },
      }),
    rename: (row, name) => request(`/api/v1/admin/masters/curriculums/${row.id}`, { method: 'PUT', body: { name } }),
    remove: (id) => request(`/api/v1/admin/masters/curriculums/${id}`, { method: 'DELETE' }),
  },
  {
    key: 'penalty_item',
    label: '상벌점 항목',
    icon: 'star',
    table: 'penalty_item',
    copied: true,
    columns: { code: false, sortOrder: false, active: false },
    memoLabel: '구분 · 점수',
    list: (ctx) =>
      request<PenaltyItemMaster[]>('/api/v1/admin/penalty-items', {
        query: { academyId: ctx.academyId, year: ctx.year },
      }).then((r) =>
        r.map((m) => ({
          id: m.id,
          code: null,
          name: m.itemName,
          memo: `${m.category === 'MERIT' ? '상점' : '벌점'} ${m.point > 0 ? `+${m.point}` : m.point}점`,
          sortOrder: null,
          active: null,
        })),
      ),
    // 등록에 구분·점수가 필수라 이름만으로는 못 만든다 — 전용 폼이 필요하다
    remove: (id) => request(`/api/v1/admin/penalty-items/${id}`, { method: 'DELETE' }),
  },
  {
    key: 'tuition',
    label: '교습비',
    icon: 'badge-dollar-sign',
    table: 'tuition',
    copied: true,
    columns: ALL,
    memoLabel: '금액',
    list: (ctx) =>
      request<(NamedMaster & { amount?: number | null })[]>('/api/v1/admin/masters/tuitions', {
        query: { academyId: ctx.academyId, year: ctx.year },
      }).then((r) =>
        r.map((m) => ({
          ...fromNamed(m),
          memo: m.memo ?? (m.amount != null ? `${m.amount.toLocaleString()}원` : null),
        })),
      ),
    create: (ctx, name) =>
      request('/api/v1/admin/masters/tuitions', {
        method: 'POST',
        body: { academyId: ctx.academyId, year: ctx.year, name, amount: 0 },
      }),
    remove: (id) => request(`/api/v1/admin/masters/tuitions/${id}`, { method: 'DELETE' }),
    setActive: (id, active) =>
      request(`/api/v1/admin/masters/tuitions/${id}/active`, { method: 'PATCH', body: { active } }),
  },
  {
    key: 'room',
    label: '강의실',
    icon: 'building-2',
    table: 'room_master',
    // 물리 공간이라 연도가 없다 — 기수가 바뀌어도 그대로다
    copied: false,
    // 코드 자리를 roomNo 가 대신한다. 둘을 같이 두면 방을 어느 쪽으로 부르는지 갈린다
    columns: { code: true, sortOrder: false, active: true },
    memoLabel: '수용 인원',
    list: (ctx) =>
      request<Room[]>('/api/v1/admin/masters/rooms', { query: { academyId: ctx.academyId } }).then((r) =>
        r.map((m) => ({
          id: m.id,
          code: m.roomNo,
          name: m.name ?? m.roomNo,
          memo: m.memo ?? (m.capacity != null ? `수용 ${m.capacity}명` : null),
          sortOrder: null,
          active: m.active,
          extra: { roomNo: m.roomNo },
        })),
      ),
    // roomNo 가 필수라 이름만으로는 못 만든다 — 전용 폼이 필요하다
    // ★ roomNo 가 PUT 의 필수값이다. 지금 값을 그대로 실어야 이름만 바꿀 수 있다
    rename: (row, name) =>
      request(`/api/v1/admin/masters/rooms/${row.id}`, { method: 'PUT', body: { name, ...row.extra } }),
    remove: (id) => request(`/api/v1/admin/masters/rooms/${id}`, { method: 'DELETE' }),
    setActive: (id, active) =>
      request(`/api/v1/admin/masters/rooms/${id}/active`, { method: 'PATCH', body: { active } }),
  },
  {
    key: 'locker',
    label: '사물함',
    icon: 'lock',
    table: 'locker_master',
    copied: false,
    columns: { code: true, sortOrder: false, active: false },
    memoLabel: '배정 학생',
    list: (ctx) =>
      request<Locker[]>('/api/v1/admin/masters/lockers', { query: { academyId: ctx.academyId } }).then((r) =>
        r.map((m) => ({
          id: m.id,
          code: m.lockerNo,
          name: m.lockerNo,
          memo: m.studentName ?? '미배정',
          sortOrder: null,
          active: null,
        })),
      ),
    // 마스터 수정·삭제가 없다. PUT/DELETE /{id}/assignment 는 배정 전용이다
  },
  {
    key: 'scholarship',
    label: '장학 종류',
    icon: 'trophy',
    table: 'scholarship_master',
    copied: true,
    columns: ALL,
    memoLabel: '할인율',
    list: (ctx) =>
      request<ScholarshipMaster[]>('/api/v1/admin/masters/scholarship-masters', {
        query: { year: ctx.year, academyId: ctx.academyId },
      }).then((r) =>
        r.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          memo: m.memo ?? `${m.discountRate}% 할인`,
          sortOrder: m.sortOrder ?? null,
          active: m.active,
          extra: { discountRate: m.discountRate },
        })),
      ),
    // code·discountRate 가 필수라 이름만으로는 못 만든다 — 전용 폼이 필요하다
    // ★ discountRate 가 PUT 의 필수값이다 (위 extra 주석 참고)
    rename: (row, name) =>
      request(`/api/v1/admin/masters/scholarship-masters/${row.id}`, {
        method: 'PUT',
        body: { name, ...row.extra },
      }),
    remove: (id) => request(`/api/v1/admin/masters/scholarship-masters/${id}`, { method: 'DELETE' }),
    setActive: (id, active) =>
      request(`/api/v1/admin/masters/scholarship-masters/${id}/active`, { method: 'PATCH', body: { active } }),
  },
]
