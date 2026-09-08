import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DataTable, ExcelButton, Unfilled, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { listClasses } from '../../api/classes'
import { fetchPenaltyItems } from '../../api/penalties'
import {
  copyMastersToYear,
  createCourseType,
  createCurriculum,
  createDepartment,
  createRoom,
  createScholarshipMaster,
  createTrack,
  createTuitionMaster,
  deleteCourseType,
  deleteCurriculum,
  deleteDepartment,
  deleteRoom,
  deleteScholarshipMaster,
  deleteTrack,
  deleteTuitionMaster,
  listCourseTypes,
  listCurriculums,
  listDepartments,
  listRooms,
  listScholarshipMasters,
  listTracks,
  listTuitionMasters,
  renameCourseType,
  renameCurriculum,
  renameDepartment,
  renameTrack,
  updateRoom,
  updateScholarshipMaster,
  updateTuitionMaster,
} from '../../api/masters'
import {
  createLectureCategory,
  deleteLectureCategory,
  listLectureCategories,
  updateLectureCategory,
} from '../../api/lectureCategories'
import type { Mockup } from './types'

/* F-4.10-1 기초 관리 — 신규개발-요구사항검증됨
 * 학과계열·학과·과정(전형)·반·강의실·사물함·장학 마스터 + 전년도 복사.
 * 복사 의존 순서를 화면에서 그대로 보여준다(단순 INSERT SELECT 금지).
 *
 * 클라이언트 메뉴표는 '과정 관리 / 학과 관리 / 학과계열 관리'를 각각 별도 메뉴로 둔다.
 * 마스터마다 화면을 복제하면 전년도 복사 의존 그래프가 화면에 흩어져 버리므로,
 * 화면은 하나로 두고 `?tab=` 으로 진입 마스터만 달리한다.
 * (사이드바의 세 메뉴는 각각 track / department / course_type 탭으로 들어온다)
 *
 * ── 연동 범위 ──────────────────────────────────────────────
 * 마스터 **10종 전부 실연동**이다. 강의실(/masters/rooms)과 장학 종류
 * (/masters/scholarship-masters)가 신설되면서 마지막 둘이 풀렸다.
 *
 * ★ 장학은 셋이 다른 것이다 — **종류 마스터**(여기), 학생별 부여(/masters/scholarships),
 *   취소 판정 규칙(/scholarship/rules). 셋을 잇는 것이 code 다.
 *
 * ★ **마스터마다 되는 조작이 다르다.** 학과계열은 등록만 되고 수정·삭제가 없으며,
 *   교습비는 이름과 금액을 함께 고친다. 하나로 추상화하면 그 차이가 화면에서 사라져
 *   "왜 이건 수정이 안 되지"가 된다 — 표에 되는 것만 버튼을 낸다.
 *
 * ★ 목업의 **코드·비고·사용여부**는 마스터마다 갈린다. 없는 마스터(반·상벌점·사물함)는
 *   <Unfilled/> 로 두고, 있는 마스터는 실제 값을 보여준다.
 *
 * ⚠ 전년도 복사는 **되돌릴 수 없다.** 대상 연도에 데이터가 있으면 409 로 거부되므로
 *   덮어쓰지는 않는다. 복사 결과가 표별 건수로 오므로 그대로 보여준다. */

/** 화면이 다루는 한 줄. 마스터마다 실리는 값이 달라 선택 필드로 둔다 */
interface MasterRow {
  id: number
  name: string
  sortOrder?: number
  amount?: number
  className?: string | null
  point?: number
  memberCount?: number
  /** 강의실 — 코드 자리를 대신하고, 수정할 때 PUT 에 함께 실어야 한다 */
  roomNo?: string
  code?: string
  /** 장학 종류 — 수정할 때 PUT 에 함께 실어야 한다 */
  discountRate?: number
  memo?: string | null
  active?: boolean | null
}

interface MasterDef {
  key: string
  label: string
  icon: string
  /** 전년도 복사 의존 순서 (1부터). 없으면 복사 대상 아님 */
  copyOrder?: number
  /** 지점·연도 없이도 부를 수 있는가 */
  global?: boolean
  load: (academyId: number, year: number) => Promise<MasterRow[]>
  create?: (academyId: number, year: number, name: string) => Promise<unknown>
  /** row 를 함께 받는다 — 강의실·장학 종류는 PUT 에 다른 필드가 필수라 지금 값이 필요하다 */
  rename?: (id: number, name: string, row?: MasterRow) => Promise<unknown>
  remove?: (id: number) => Promise<unknown>
  /** 이 마스터에만 있는 추가 컬럼 */
  extra?: Column<MasterRow>
  /**
   * 이 마스터에 실제로 있는 공통 컬럼.
   *
   * ★ 없는 것을 <Unfilled/> 로 그리는 이유는 "서버가 아직 안 준다"를 드러내기 위해서다.
   *   있는 마스터까지 미제공으로 두면 그게 거짓말이 된다.
   */
  has?: { code?: boolean; memo?: boolean; active?: boolean }
  /** 왜 등록·수정이 없는지 */
  note?: string
}

const MASTERS: MasterDef[] = [
  {
    key: 'track',
    label: '학과계열',
    icon: 'git-compare',
    copyOrder: 1,
    global: true,
    load: () => listTracks(),
    create: (_a, _y, name) => createTrack(name),
    rename: renameTrack,
    remove: deleteTrack,
    has: { code: true, memo: true, active: true },
    note: '학과계열은 전 지점·전 연도 공통입니다. 전년도 복사 대상이 아닙니다.',
  },
  {
    key: 'department',
    label: '학과',
    icon: 'graduation-cap',
    copyOrder: 2,
    load: (a, y) => listDepartments(a, y),
    create: (academyId, year, name) => createDepartment({ academyId, year, name }),
    rename: renameDepartment,
    remove: deleteDepartment,
    has: { code: true, memo: true, active: true },
  },
  {
    key: 'course_type',
    label: '과정(전형)',
    icon: 'layers',
    copyOrder: 3,
    load: (a, y) => listCourseTypes(a, y),
    create: (academyId, year, name) => createCourseType({ academyId, year, name }),
    rename: renameCourseType,
    remove: deleteCourseType,
    has: { code: true, memo: true, active: true },
  },
  {
    key: 'class_group',
    label: '반',
    icon: 'layout-grid',
    copyOrder: 4,
    load: async (a, y) => {
      const list = await listClasses(y, a)
      return list.map((c) => ({ id: c.id, name: c.name, memberCount: c.memberCount }))
    },
    extra: {
      key: 'memberCount',
      header: '인원',
      width: '76px',
      align: 'center',
      sortable: true,
      value: (r) => r.memberCount ?? '',
    },
    note: '반은 반 배정 화면에서 관리합니다. 여기서는 목록만 봅니다.',
  },
  {
    key: 'curriculum',
    label: '교육과정',
    icon: 'book-open',
    copyOrder: 5,
    load: (a, y) => listCurriculums(a, y),
    create: (academyId, year, name) => createCurriculum({ academyId, year, name }),
    rename: renameCurriculum,
    remove: deleteCurriculum,
    has: { code: true, memo: true, active: true },
    extra: {
      key: 'className',
      header: '소속 반',
      width: '96px',
      align: 'center',
      value: (r) => r.className ?? '전체 공통',
    },
  },
  {
    key: 'penalty_item',
    label: '상벌점 항목',
    icon: 'scale',
    copyOrder: 6,
    load: async (a, y) => {
      const list = await fetchPenaltyItems({ academyId: a, year: y })
      return list.map((i) => ({ id: i.id, name: i.itemName, point: i.point }))
    },
    extra: {
      key: 'point',
      header: '점수',
      width: '76px',
      align: 'right',
      sortable: true,
      value: (r) => r.point ?? 0,
      render: (r) => (r.point == null ? '-' : `${r.point > 0 ? '+' : ''}${r.point}`),
    },
    note: '상벌점 항목은 상벌점 관리 화면에서 부여에 쓰입니다. 여기서는 목록만 봅니다.',
  },
  {
    key: 'tuition',
    label: '교습비',
    icon: 'credit-card',
    copyOrder: 7,
    load: (a, y) => listTuitionMasters(a, y),
    create: (academyId, year, name) => createTuitionMaster({ academyId, year, name, amount: 0 }),
    rename: (id, name) => updateTuitionMaster(id, { name }),
    remove: deleteTuitionMaster,
    has: { code: true, memo: true, active: true },
    extra: {
      key: 'amount',
      header: '금액',
      width: '120px',
      align: 'right',
      sortable: true,
      value: (r) => r.amount ?? 0,
      render: (r) => (r.amount == null ? '-' : `${r.amount.toLocaleString()}원`),
    },
  },
  {
    key: 'room',
    label: '강의실',
    icon: 'door-open',
    // 물리 공간이라 연도가 없다 — 전년도 복사 대상이 아니다(copyOrder 없음)
    load: async (a) => {
      const list = await listRooms(a)
      return list.map((r) => ({
        id: r.id,
        // 코드 자리를 방 번호가 대신한다. 이름이 비면 번호를 이름으로 쓴다
        name: r.name ?? r.roomNo,
        roomNo: r.roomNo,
        capacity: r.capacity,
        memo: r.memo,
        active: r.active,
      }))
    },
    // roomNo 가 필수라 이름만으로는 못 만든다 — 번호를 함께 묻는다
    create: async (academyId, _y, name) => {
      const roomNo = window.prompt(`'${name}' 의 호실 번호를 입력하세요. (예: 201)`)?.trim()
      if (!roomNo) throw new Error('호실 번호가 필요합니다.')
      return createRoom({ academyId, roomNo, name })
    },
    // ★ PUT 의 필수값이 roomNo 라 지금 번호를 함께 실어야 이름만 바꿀 수 있다
    rename: (id, name, row) => updateRoom(id, { roomNo: row?.roomNo ?? name, name }),
    remove: deleteRoom,
    // 코드 자리는 roomNo 가 대신하므로 code 컬럼은 안 쓴다
    has: { memo: true, active: true },
    extra: {
      key: 'roomNo',
      header: '호실',
      width: '84px',
      align: 'center',
      sortable: true,
      value: (r) => r.roomNo ?? '',
    },
    note: '강의실은 연도와 무관합니다 — 물리 공간이라 기수가 바뀌어도 그대로입니다. 자습 구역(좌석이 속하는 단위)과는 다른 것입니다.',
  },
  {
    key: 'locker',
    label: '사물함',
    icon: 'archive',
    load: async () => [],
    note: '사물함은 배정 관리 화면에서 다룹니다 — 목록이 학생 배정과 함께 옵니다.',
  },
  {
    key: 'scholarship',
    label: '장학 종류',
    icon: 'award',
    copyOrder: 8,
    load: async (a, y) => {
      const list = await listScholarshipMasters(y, a)
      return list.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        discountRate: m.discountRate,
        memo: m.memo,
        active: m.active,
        sortOrder: m.sortOrder ?? undefined,
      }))
    },
    // code·discountRate 가 필수라 이름만으로는 못 만든다
    create: async (academyId, year, name) => {
      const code = window.prompt(`'${name}' 의 코드를 입력하세요. (예: SC-100)`)?.trim()
      if (!code) throw new Error('코드가 필요합니다.')
      const rate = window.prompt(`'${name}' 의 할인율(%)을 입력하세요.`, '100')?.trim()
      if (!rate || !Number.isFinite(Number(rate))) throw new Error('할인율이 필요합니다.')
      return createScholarshipMaster({ academyId, year, code, name, discountRate: Number(rate) })
    },
    // ★ PUT 의 필수값이 name·discountRate 다 — 지금 할인율을 함께 실어야 한다
    rename: (id, name, row) => updateScholarshipMaster(id, { name, discountRate: row?.discountRate ?? 0 }),
    remove: deleteScholarshipMaster,
    has: { code: true, memo: true, active: true },
    extra: {
      key: 'discountRate',
      header: '할인율',
      width: '84px',
      align: 'right',
      sortable: true,
      value: (r) => r.discountRate ?? 0,
      render: (r) => (r.discountRate == null ? '-' : `${r.discountRate}%`),
    },
    note: '장학 종류는 부여(학생별)·취소 규칙과 code 로 이어집니다. 여기 없는 코드로는 부여할 수 없습니다.',
  },
  {
    key: 'lecture_category',
    label: '특강 유형',
    icon: 'layers',
    // 특강의 세분류(단과·실전·해설)다. lectureType(특강/설명회)과 다른 축이고
    // **설명회에는 붙지 않는다**
    load: async (a, y) => {
      const list = await listLectureCategories({ academyId: a, year: y })
      return list.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        active: c.active,
        // 전 지점 공통인지 — 지점 관리자는 이 항목을 못 고친다
        memo: c.nationwide ? '전 지점 공통' : null,
      }))
    },
    create: (academyId, year, name) => createLectureCategory({ academyId, year, name }),
    rename: (id, name) => updateLectureCategory(id, { name }),
    remove: deleteLectureCategory,
    has: { memo: true, active: true },
    note: '특강의 세부 유형입니다. 설명회에는 붙지 않습니다. 지점을 비우고 만들면 전 지점 공통이 되는데 본사만 가능합니다.',
  },
]

function Content() {
  /* 진입 마스터는 URL이 결정한다 — 사이드바의 '과정/학과/학과계열 관리'가
   * 각각 다른 탭으로 들어오고, 새로고침·뒤로가기에도 그 상태가 유지된다. */
  const [params, setParams] = useSearchParams()
  const { academyId } = useAcademy()
  const active = MASTERS.find((m) => m.key === params.get('tab')) ?? MASTERS[0]

  const [year, setYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<MasterRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  function setActive(m: MasterDef) {
    setParams({ tab: m.key }, { replace: true })
  }

  const load = useCallback(async () => {
    // 학과계열만 지점 없이 부를 수 있다. 나머지는 지점을 고르기 전엔 호출하지 않는다
    if (academyId === null && !active.global) {
      setRows([])
      setLoading(false)
      setLoadError(null)
      return
    }
    setLoading(true)
    try {
      setRows(await active.load(academyId ?? 0, year))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : `${active.label}을(를) 불러오지 못했습니다.`)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [active, academyId, year])

  useEffect(() => {
    void load()
  }, [load])

  /* 왼쪽 목록의 건수. 실패한 마스터는 세지 않는다 — 0과 '못 불러옴'은 다르다 */
  useEffect(() => {
    if (academyId === null) return
    let alive = true
    void (async () => {
      const entries = await Promise.all(
        MASTERS.map(async (m) => {
          try {
            return [m.key, (await m.load(academyId, year)).length] as const
          } catch {
            return null
          }
        }),
      )
      if (alive) setCounts(Object.fromEntries(entries.filter((e) => e !== null)))
    })()
    return () => {
      alive = false
    }
  }, [academyId, year])

  async function run(what: string, fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      setNotice(`${what} 했습니다.`)
      await load()
    } catch (err) {
      setNotice(err instanceof ApiError ? `${what} 실패 — ${err.message}` : `${what}에 실패했습니다.`)
    } finally {
      setBusy(false)
    }
  }

  function add() {
    if (!active.create) return
    if (academyId === null && !active.global) {
      setNotice('먼저 지점을 고르세요.')
      return
    }
    const name = window.prompt(`${active.label} 이름`)
    if (name === null || name.trim() === '') return
    void run(`${active.label}을(를) 등록`, () => active.create!(academyId ?? 0, year, name.trim()))
  }

  /**
   * 전년도 복사.
   * ⚠️ 되돌릴 수 없다. 대상 연도에 데이터가 있으면 서버가 409 로 막으므로 덮어쓰진 않는다.
   */
  function copyYear() {
    if (academyId === null) {
      setNotice('먼저 지점을 고르세요.')
      return
    }
    const from = year - 1
    if (
      !window.confirm(
        `${from}년 기초 데이터를 ${year}년으로 복사합니다.\n되돌릴 수 없습니다. ${year}년에 이미 데이터가 있으면 복사되지 않습니다.\n\n진행할까요?`,
      )
    )
      return
    setBusy(true)
    void (async () => {
      try {
        const res = await copyMastersToYear({ academyId, fromYear: from, toYear: year })
        const summary = Object.entries(res.copied ?? {})
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k} ${n}건`)
          .join(' · ')
        setNotice(summary === '' ? `${from} → ${year} 복사했지만 넘어온 것이 없습니다.` : `${from} → ${year} 복사 — ${summary}`)
        await load()
      } catch (err) {
        setNotice(err instanceof ApiError ? `복사 실패 — ${err.message}` : '복사하지 못했습니다.')
      } finally {
        setBusy(false)
      }
    })()
  }

  const COLUMNS: Column<MasterRow>[] = useMemo(() => {
    const base: Column<MasterRow>[] = [
      { key: 'order', header: '순서', width: '64px', align: 'center', sortable: true, value: (r) => r.sortOrder ?? '' },
      {
        key: 'code',
        header: '코드',
        width: '96px',
        align: 'center',
        value: (r) => r.code ?? '',
        render: (_r, shown) =>
          active.has?.code ? (
            <code style={{ fontSize: 11 }}>{shown || '-'}</code>
          ) : (
            <Unfilled reason="마스터에 코드가 없다" />
          ),
      },
      { key: 'name', header: '명칭', width: '180px', sortable: true, value: (r) => r.name },
    ]
    if (active.extra) base.push(active.extra)
    base.push(
      {
        key: 'memo',
        header: '비고',
        value: (r) => r.memo ?? '',
        render: (_r, shown) =>
          active.has?.memo ? shown || '-' : <Unfilled reason="마스터에 비고가 없다" />,
      },
      {
        key: 'active',
        header: '사용',
        width: '72px',
        align: 'center',
        value: (r) => (r.active === true ? '사용' : r.active === false ? '중지' : ''),
        render: (r, shown) =>
          active.has?.active ? (
            <span className={`mk ${r.active ? 'verified' : 'brandnew'}`}>{shown}</span>
          ) : (
            <Unfilled reason="사용여부 축이 없다" />
          ),
      },
    )
    if (active.rename || active.remove) {
      base.push({
        key: 'act',
        header: '',
        width: '92px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {active.rename && (
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5 }}
                disabled={busy}
                onClick={() => {
                  const name = window.prompt('새 이름', r.name)
                  if (name === null || name.trim() === '' || name === r.name) return
                  void run('이름을 바꾸', () => active.rename!(r.id, name.trim(), r))
                }}
              >
                수정
              </button>
            )}
            {active.remove && (
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`${r.name} 을(를) 지울까요?`)) return
                  void run('지우', () => active.remove!(r.id))
                }}
              >
                삭제
              </button>
            )}
          </div>
        ),
      })
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, busy])

  return (
    <>
      <div className="note-box plain">
        <div className="ic">
          <Icon name="history" size={17} />
        </div>
        <div>
          <div className="tt">전년도 복사는 이 순서를 지켜 넘어갑니다</div>
          <div className="tx">
            {MASTERS.filter((m) => m.copyOrder)
              .sort((a, b) => a.copyOrder! - b.copyOrder!)
              .map((m, i, arr) => (
                <span key={m.key}>
                  <b>{m.label}</b>
                  {i < arr.length - 1 && ' → '}
                </span>
              ))}
            <br />
            앞 단계가 만든 새 연도 항목을 뒤 단계가 참조하므로 순서가 바뀌면 연결이 끊깁니다.
            <b> 복사는 되돌릴 수 없습니다</b> — 다만 그 해에 이미 데이터가 있으면 복사되지 않습니다.
          </div>
        </div>
      </div>

      {academyId === null && !active.global && (
        <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
          위에서 지점을 먼저 고르세요. 기초 데이터는 지점마다 따로 관리합니다.
        </div>
      )}
      {active.note && (
        <div className="note-box">
          <div className="ic">
            <Icon name="info" size={17} />
          </div>
          <div>{active.note}</div>
        </div>
      )}
      {loadError && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {loadError}
        </div>
      )}
      {notice && (
        <div className="note-box" role="status" style={{ borderColor: 'var(--violet)' }}>
          {notice}
        </div>
      )}

      <div className="split-3-2">
        <div>
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => String(r.id)}
            masked={false}
            loading={loading}
            pageSize={10}
            countLabel={
              <>
                {active.label} <b>{rows.length}</b>건{active.global ? ' · 전 지점 공통' : ` · ${year}년`}
              </>
            }
            toolbar={
              <>
                <select className="sel" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 106 }}>
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y} value={y}>
                      {y} 시즌
                    </option>
                  ))}
                </select>
                <button className="btn" disabled={busy || academyId === null} onClick={copyYear}>
                  <Icon name="history" size={14} /> 전년도 복사
                </button>
                <ExcelButton filename={`기초_${active.label}`} columns={COLUMNS} rows={rows} masked={false} />
                <button
                  className="btn pri"
                  disabled={busy || !active.create}
                  title={active.create ? undefined : '이 마스터는 여기서 등록할 수 없습니다'}
                  onClick={add}
                >
                  <Icon name="plus" size={14} /> 등록
                </button>
              </>
            }
          />
        </div>

        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="sliders-horizontal" size={15} />
              </span>
              기초 데이터 종류
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 11 }}>
            {MASTERS.map((m) => (
              <button
                type="button"
                key={m.key}
                onClick={() => setActive(m)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: active.key === m.key ? 'var(--mint-wash)' : 'transparent',
                  color: active.key === m.key ? 'var(--mint-d)' : 'var(--ink-2)',
                  fontWeight: active.key === m.key ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <Icon name={m.icon} size={15} />
                <span style={{ flex: 1 }}>{m.label}</span>
                {m.copyOrder && (
                  <span className="ph p1" title="전년도 복사 대상">
                    복사 {m.copyOrder}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{counts[m.key] ?? '-'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export const basicSettingsMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn">
        <Icon name="history" size={14} /> 전체 전년도 복사
      </button>
    </>
  ),
}
