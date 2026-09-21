import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, Modal, PrintButton, Unfilled, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  LECTURE_STATUS_LABEL,
  LECTURE_STATUS_TONE,
  LECTURE_TYPE_LABEL,
  listLectureApplicants,
  listLectureSessions,
  listSessionAttendances,
  saveSessionAttendance,
  LECTURE_ATTENDANCE_LABEL,
  type LectureAttendanceStatus,
  listLectures,
  changeLectureStatus,
  createLecture,
  deleteLecture,
  deleteLectureSession,
  createLectureSession,
  setLectureVisible,
  cancelApplication,
  promoteApplicant,
  updateLecture,
  type Lecture as ApiLecture,
  type LectureApplicant,
  type LectureSession,
} from '../../api/lectures'
import { listTeachers, type TeacherRow } from '../../api/accounts'
import { createBilling } from '../../api/billing'
import { searchStudents } from '../../api/students'
import type { Mockup } from './types'
import { createScreenSignal } from './screenSignal'
import '../../styles/forms.css'

/* F-4.7 특강 관리 — 신규개발-요구사항보완
 * DSA '특강관리>접수>신청명단'에서 신청명단·출석부 요구사항은 검증됨.
 * '설명회 신청' 항목만 화면에 없어 보완 개발 대상.
 *
 * ⚠ 특강 개설이 만드는 것은 특강 1건이 아니다 — 3개가 동시에 생긴다.
 *   ① 특강 레코드      : 정원·기간·대상
 *   ② 회차(수업일) N건 : 출석부가 이걸 열로 쓴다. 회차 없이 개설하면 출석부를 못 만든다
 *   ③ 청구 항목        : 특강비는 수납(F-4.8)·청구기준(F-4.10-5)과 엮인다
 *   따라서 개설 폼에서 회차를 생성해두지 않으면 출석부 탭이 빈 채로 남는다.
 *
 * ⚠ 다만 **③ 은 개설 폼이 만들지 않는다**(2026-09-13 확인). 서버에 그런 경로가 없어서
 *   수납 관리의 청구 기준에서 따로 등록한다. 화면 안내가 "3가지가 함께 생성됩니다"라고
 *   적고 있었는데, 개설 후 수납에 안 뜬다는 말이 그래서 나왔다.
 *
 * ⚠ 개설 후 정원을 줄이는 것은 막아야 한다.
 *   이미 신청한 인원보다 적게 줄이면 누구를 대기자로 밀어낼지 결정할 수 없다.
 *   서버에서 capacity >= applied 제약을 걸고, 줄이려면 개별 취소를 먼저 하게 한다. */

/** 출결 배지 색. 미입력은 아무 색도 안 준다 — 결석과 구분해야 한다 */
const ATT_TONE: Record<string, string> = { PRESENT: 'verified', LATE: 'supplement', ABSENT: 'brandnew' }

const won = (n: number) => `${n.toLocaleString()}원`

const LECTURE_COLUMNS: Column<ApiLecture>[] = [
  {
    key: 'period',
    header: '기간',
    width: '150px',
    align: 'center',
    value: (r) => r.startDate ?? '',
    render: (r) => (r.startDate ? `${r.startDate.slice(5)} ~ ${(r.endDate ?? '').slice(5)}` : '-'),
  },
  { key: 'name', header: '특강명', sortable: true, value: (r) => r.name },
  {
    key: 'lectureType',
    header: '유형',
    width: '76px',
    align: 'center',
    value: (r) => LECTURE_TYPE_LABEL[r.lectureType] ?? r.lectureType,
    render: (r) => <span className="mk supplement">{LECTURE_TYPE_LABEL[r.lectureType] ?? r.lectureType}</span>,
  },
  // 전부 '미지정'으로 보이는 것은 시드에 담당이 안 들어가 있어서다. 필드명 문제가 아니다
  // (`instructorName` 은 서버 응답에도 스펙에도 없는 이름이다 — lectures.ts 주석 참고)
  { key: 'teacherName', header: '담당', width: '86px', align: 'center', value: (r) => r.teacherName ?? '미지정' },
  {
    key: 'confirmedCount',
    header: '신청 / 정원',
    width: '110px',
    align: 'center',
    sortable: true,
    value: (r) => r.confirmedCount,
    render: (r) => (
      <span
        style={{
          fontWeight: 700,
          color: r.capacity !== null && r.confirmedCount >= r.capacity ? 'var(--red)' : 'var(--ink)',
        }}
      >
        {r.confirmedCount} / {r.capacity ?? '-'}
      </span>
    ),
  },
  {
    key: 'waitlistedCount',
    header: '대기',
    width: '68px',
    align: 'center',
    value: (r) => r.waitlistedCount,
    render: (r) =>
      r.waitlistedCount > 0 ? (
        <span className="mk brandnew">{r.waitlistedCount}</span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
  {
    key: 'fee',
    header: '특강비',
    width: '96px',
    align: 'right',
    value: (r) => r.fee ?? 0,
    render: (r) => (r.fee ? won(r.fee) : '무료'),
  },
  {
    key: 'status',
    header: '상태',
    width: '80px',
    align: 'center',
    sortable: true,
    value: (r) => LECTURE_STATUS_LABEL[r.status] ?? r.status,
    render: (r) => (
      <span className={`mk ${LECTURE_STATUS_TONE[r.status] ?? ''}`}>
        {LECTURE_STATUS_LABEL[r.status] ?? r.status}
      </span>
    ),
  },
  {
    key: 'visible',
    header: '앱 노출',
    width: '76px',
    align: 'center',
    // status 와 별개 축이다 — "마감됐지만 앱에는 보이는" 상태가 있다
    value: (r) => (r.visible ? '노출' : '숨김'),
    render: (r) => (
      <span style={{ color: r.visible ? 'var(--mint-d)' : 'var(--muted)', fontWeight: 700 }}>
        {r.visible ? '노출' : '숨김'}
      </span>
    ),
  },
]

/* ── 신청 명단 / 대기자 ── */

/** 순번은 응답에 없다. 화면에서 조회 순서대로 매긴다 */
interface ApplicantRow extends LectureApplicant {
  seq: number
}

const APPLICANT_COLUMNS: Column<ApplicantRow>[] = [
  { key: 'seq', header: '순번', width: '64px', align: 'center', sortable: true, value: (r) => r.seq },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo ?? '-' },
  { key: 'studentName', header: '이름', width: '84px', mask: 'name', value: (r) => r.studentName },
  { key: 'className', header: '반', width: '56px', align: 'center', value: (r) => r.className ?? '-' },
  { key: 'phone', header: '연락처', width: '128px', mask: 'phone', value: (r) => r.phone ?? '-' },
  {
    key: 'appliedAt',
    header: '신청일',
    width: '120px',
    sortable: true,
    value: (r) => r.appliedAt ?? '',
    render: (r) => (r.appliedAt ? r.appliedAt.slice(0, 10) : '-'),
  },
  {
    key: 'paid',
    header: '수납',
    width: '80px',
    align: 'center',
    // 특강비 수납 여부는 청구(F-4.8) 쪽 데이터다. 신청자 응답에는 없다
    value: () => '',
    render: () => <Unfilled reason="수납 현황은 수납 화면에서 확인하세요" />,
  },
]

/* ── 출석부 ── */

/* ══ 특강 개설 ══ */

const ROOMS = ['201호', '202호', '301호', '302호', '401호']
const TRACK_TARGETS = ['전체', '자연계열', '인문계열']
const DOW_LABELS = ['월', '화', '수', '목', '금', '토']

/** 상세 모달의 수정 폼. 서버가 PATCH 로 받는 것만 든다 */
interface LectureEdit {
  name: string
  description: string
  capacity: string
  fee: string
  startDate: string
  endDate: string
  /** 접수 기간은 **날짜가 아니라 시점**이다 — 저장할 때 변환한다 */
  applyFrom: string
  applyTo: string
  teacherId: number | null
}

interface LectureDraft {
  name: string
  month: string
  /**
   * 담당 강사 **id**. 서버가 id 로 받는다.
   * ★ 예전에는 이름 문자열을 들고 저장할 때 목록에서 찾았는데, 초기값이 목업 이름
   *   ('김유진')이라 서버 목록에 없었다. 브라우저는 일치하는 option 이 없으면 첫 항목을
   *   **보여주기만** 하고 onChange 를 안 낸다 — 화면에는 강사가 떠 있는데 값은 목업 이름이라
   *   저장할 때 조용히 빠졌다. 고른 적이 없어도 값이 맞도록 id 를 직접 든다.
   */
  teacherId: number | null
  room: string
  capacity: number
  fee: number
  target: string
  /** 수업 요일 — 회차 자동 생성에 쓴다 */
  dows: number[]
  startDate: string
  endDate: string
  applyFrom: string
  applyTo: string
  /** 정원 초과 시 대기자 접수 허용 */
  allowWaiting: boolean
  /** 설명회 신청도 함께 받을지 — 보완 개발 항목 */
  withBriefing: boolean
  memo: string
}

const EMPTY_DRAFT: LectureDraft = {
  name: '',
  month: '2026-07',
  teacherId: null,
  room: ROOMS[0],
  capacity: 25,
  fee: 280000,
  target: '전체',
  dows: [1, 3],
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  applyFrom: '2026-06-15',
  applyTo: '2026-06-28',
  allowWaiting: true,
  withBriefing: false,
  memo: '',
}

/**
 * UTC 시점 → 한국 날짜 `yyyy-MM-dd`.
 *
 * ★ 문자열을 그냥 자르면 UTC 날짜가 나온다. 접수 시작이 한국 09-20 00:00 이면 서버에는
 *   `09-19T15:00Z` 로 있어서, 자르면 **하루 전으로 보인다.**
 */
function localDay(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 상세(서버 값) → 수정 폼. 접수 기간은 시점이라 날짜만 떼어 입력칸에 넣는다 */
function toEdit(l: ApiLecture): LectureEdit {
  return {
    name: l.name,
    description: l.description ?? '',
    capacity: l.capacity === null ? '' : String(l.capacity),
    fee: String(l.fee ?? 0),
    startDate: l.startDate ?? '',
    endDate: l.endDate ?? '',
    applyFrom: l.applyFrom ? localDay(l.applyFrom) : '',
    applyTo: l.applyTo ? localDay(l.applyTo) : '',
    teacherId: l.teacherId,
  }
}

/**
 * `yyyy-MM-dd` + 시각 → UTC 시점.
 *
 * ★ 문자열에 `Z` 를 이어 붙이면 안 된다. 입력은 한국 시각인데 `…T00:00:00Z` 로 보내면
 *   서버가 UTC 자정으로 받아 한국 09:00 이 된다 — 설문에서 정확히 그렇게 9시간이 밀렸다.
 */
function toInstant(day: string, time: string): string | undefined {
  if (!day) return undefined
  const d = new Date(`${day}T${time}:00`)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** 기간 + 요일 → 회차(수업일) 목록 `yyyy-MM-dd`. 출석부의 열이 되고 그대로 서버에 보낸다 */
function buildSessions(d: LectureDraft): string[] {
  const start = new Date(`${d.startDate}T00:00:00`)
  const end = new Date(`${d.endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const out: string[] = []
  const cur = new Date(start)
  // 상한을 둬서 잘못된 기간 입력에도 루프가 폭주하지 않게 한다
  while (cur <= end && out.length < 60) {
    if (d.dows.includes(cur.getDay())) {
      /* ★ toISOString 을 쓰면 안 된다 — UTC 로 바뀌면서 한국 시간 자정이 전날이 된다 */
      out.push(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
      )
    }
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function Content() {
  const [tab, setTab] = useState('list')
  const [masked, setMasked] = useState(true)
  /**
   * 선택은 **탭마다 따로 갖는다.**
   *
   * ★ 예전에는 하나를 두 탭이 같이 썼다. 신청자 탭에서 한 명, 대기자 탭에서 한 명을 고른 뒤
   *   「선택 확정」을 누르면 **신청자 탭에서 고른 사람까지 승격 대상에 들어가** 정원 경고가
   *   '2명 추가'로 떴다. 이미 확정된 사람을 다시 올리는 셈이라 인원이 어긋난다(2026-09-14).
   *   표는 탭마다 행이 다르므로 선택도 탭에 속한다.
   */
  const [selectedApply, setSelectedApply] = useState<string[]>([])
  const [selectedWait, setSelectedWait] = useState<string[]>([])
  const [draft, setDraft] = useState<LectureDraft | null>(null)

  /* ── 실연동 ── */
  const { academyId } = useAcademy()
  const [lectures, setLectures] = useState<ApiLecture[]>([])
  /* 헤더 '기간 선택' 이 정하는 연도 — 예전엔 올해로 고정이라 작년 특강을 볼 방법이 없었다 */
  const [lectureYear, setLectureYear] = useState(new Date().getFullYear())
  const yearVer = yearSignal.useVersion()
  useEffect(() => {
    if (yearVer > 0 && pickedYear !== null) setLectureYear(pickedYear)
  }, [yearVer])
  /* 설명회만 보기 — 헤더 '설명회 신청 관리' 가 켠다. 설명회는 특강과 같은 목록에 유형만 다르게 온다 */
  const [briefingOnly, setBriefingOnly] = useState(false)
  const briefingVer = briefingSignal.useVersion()
  useEffect(() => {
    if (briefingVer === 0) return
    setBriefingOnly(true)
    setTab('list')
  }, [briefingVer])
  const [lectureId, setLectureId] = useState<number | null>(null)
  const [applicants, setApplicants] = useState<LectureApplicant[]>([])
  const [sessionList, setSessionList] = useState<LectureSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /* 확정 전에 한 번 묻는다. 정원을 넘기는 경우가 있어서다 — 아래 confirmPromote 주석 참고 */
  const [promoting, setPromoting] = useState<{ ids: number[] } | null>(null)
  /*
   * 수납청구 — 고른 신청자에게 특강비 청구를 한 명씩 만든다(일괄 API 가 없다).
   * ★ 건별 결과를 모아 보여준다. 중간에 실패하면 일부만 청구된 채 남는데, 안 알리면 전부 된 줄 안다.
   * ★ 청구는 등록 ID(enrollmentId)로 한다. 신청자 응답에 2026-09-21 부터 온다(API_GAPS 33-4).
   *   비어 있으면 재원생 목록에서 학생 ID로 찾고, 못 찾으면 그 학생은 실패로 남긴다.
   */
  const [billing, setBilling] = useState<{
    rows: ApplicantRow[]
    name: string
    amount: string
    dueDate: string
    results: { name: string; ok: boolean; msg: string }[] | null
  } | null>(null)
  const [billBusy, setBillBusy] = useState(false)

  async function runBilling() {
    if (!billing || academyId === null) return
    setBillBusy(true)
    const results: { name: string; ok: boolean; msg: string }[] = []
    try {
      // 신청자에 등록 ID 가 온다(2026-09-21). 비어 있는 줄이 있을 때만 재원생 목록으로 찾는다
      const needLookup = billing.rows.some((r) => r.enrollmentId == null)
      const enrollmentOf = needLookup
        ? new Map((await searchStudents({ academyId, size: 1000 })).rows.map((st) => [st.studentId, st.enrollmentId]))
        : new Map<number, number>()
      for (const r of billing.rows) {
        const enrollmentId = r.enrollmentId ?? enrollmentOf.get(r.studentId)
        if (enrollmentId === undefined) {
          results.push({ name: r.studentName, ok: false, msg: '재원생 목록에서 찾지 못했습니다' })
          continue
        }
        try {
          await createBilling({
            enrollmentId,
            name: billing.name.trim(),
            billingType: 'LECTURE',
            suppliedAmount: Number(billing.amount),
            dueDate: billing.dueDate || undefined,
          })
          results.push({ name: r.studentName, ok: true, msg: '청구함' })
        } catch (e) {
          results.push({ name: r.studentName, ok: false, msg: e instanceof ApiError ? e.message : '청구하지 못했습니다' })
        }
      }
    } catch (e) {
      results.push({ name: '전체', ok: false, msg: e instanceof ApiError ? e.message : '재원생 목록을 불러오지 못했습니다' })
    } finally {
      setBilling((b) => (b ? { ...b, results } : b))
      setBillBusy(false)
    }
  }
  const [promoteBusy, setPromoteBusy] = useState(false)

  /* 담당 강사는 서버가 **id 로** 받는다. 이름 문자열을 보내면 조용히 무시되고 '미지정'이 된다 */
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [saving, setSaving] = useState<'' | 'draft' | 'open'>('')
  /** 저장 결과. 3단계로 나뉘어 나가므로 **어디까지 됐는지**를 그대로 적는다 */
  const [saveNote, setSaveNote] = useState<{ ok: boolean; text: string } | null>(null)

  /* 삭제. 신청자가 있으면 서버가 400 을 주는데, 그 메시지가 대안까지 알려주므로 그대로 쓴다 */
  const [deleting, setDeleting] = useState<ApiLecture | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  /** 회차 삭제. 출석부의 열이 하나 사라지는 것이라 먼저 묻는다 */
  const [deletingSession, setDeletingSession] = useState<LectureSession | null>(null)

  /**
   * 특강 상세.
   *
   * ★ 목록 행을 눌러도 아무 일이 없었다. 수정·상태·노출을 부르는 코드는 있었는데
   *   **들어갈 입구가 없어** 닫혀 있었다. 목록에 보이는 것이 기간·이름·구분·정원·금액·
   *   상태·노출뿐이라 어떤 특강인지 볼 방법도 없었다.
   * ★ 단건 조회 API 는 쓰지 않는다 — `GET /lectures` 목록이 설명·담당교사·분류·확정/대기
   *   인원까지 다 내려준다(2026-09-14 확인). 목록에서 받은 값으로 채운다.
   */
  const [detail, setDetail] = useState<ApiLecture | null>(null)
  const [editing, setEditing] = useState<LectureEdit | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [detailErr, setDetailErr] = useState<string | null>(null)

  /**
   * 출석부 — 회차별 출결.
   *
   * ★ 회차마다 따로 조회한다(`sessions/{id}/attendances`). 한 번에 받는 경로가 없다.
   * ★ 아직 아무도 안 찍은 회차는 **빈 배열**이다 — 0건은 "결석"이 아니라 "미입력"이다.
   *   표에서도 그 둘을 구분해야 한다.
   * ★ `Map<sessionId, Map<applicationId, status>>` 로 들고 있다. 표가 학생 × 회차라
   *   셀 하나를 그릴 때 두 키로 바로 찾아야 한다.
   */
  const [attendance, setAttendance] = useState<Map<number, Map<number, LectureAttendanceStatus>>>(new Map())
  const [attBusy, setAttBusy] = useState<string | null>(null)

  /** ★ 목록을 돌려준다 — 저장 뒤 상세 모달을 새 값으로 갈아끼우는 데 쓴다 */
  const loadLectures = useCallback(async (): Promise<ApiLecture[]> => {
    if (academyId === null) {
      setLoading(false)
      return []
    }
    setLoading(true)
    try {
      const list = await listLectures(academyId, lectureYear)
      setLectures(list)
      setLectureId((prev) => (list.some((l) => l.id === prev) ? prev : (list[0]?.id ?? null)))
      setError(null)
      return list
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '특강 목록을 불러오지 못했습니다.')
      setLectures([])
      return []
    } finally {
      setLoading(false)
    }
  }, [academyId, lectureYear])

  useEffect(() => {
    void loadLectures()
  }, [loadLectures])

  /* 담당 강사 선택지. 직원 목록에는 안 나온다 — 강사는 kind 가 따로다(accounts.ts listTeachers) */
  useEffect(() => {
    if (academyId === null) return
    let alive = true
    listTeachers(academyId)
      .then((v) => alive && setTeachers(v))
      .catch(() => alive && setTeachers([]))
    return () => {
      alive = false
    }
  }, [academyId])

  // 선택한 특강의 신청자·회차. 목록에서 특강을 고르면 아래 탭이 그 특강 기준이 된다
  useEffect(() => {
    if (lectureId === null) {
      setApplicants([])
      setSessionList([])
      return
    }
    let cancelled = false
    void Promise.all([listLectureApplicants(lectureId), listLectureSessions(lectureId)])
      .then(([apps, sess]) => {
        if (cancelled) return
        setApplicants(apps)
        setSessionList(sess)
      })
      .catch(() => {
        if (cancelled) return
        setApplicants([])
        setSessionList([])
      })
    return () => {
      cancelled = true
    }
  }, [lectureId])

  /* ★ 취소는 행을 지우지 않고 status 만 CANCELED 로 바꾼다. **waitlisted 는 false 로 남는다** —
       `!waitlisted` 만 보면 취소자가 확정자에 섞여 서버 집계와 어긋나고 출석부에도 줄이 생긴다
       (api/lectures.ts LectureApplicant 주석). */
  const applied: ApplicantRow[] = useMemo(
    () =>
      applicants
        .filter((a) => !a.waitlisted && a.status !== 'CANCELED')
        .map((a, i) => ({ ...a, seq: i + 1 })),
    [applicants],
  )
  const waiting: ApplicantRow[] = useMemo(
    () =>
      applicants
        .filter((a) => a.waitlisted && a.status !== 'CANCELED')
        .map((a, i) => ({ ...a, seq: i + 1 })),
    [applicants],
  )
  /** 취소된 신청. 명단에 남아 있으므로 섞지 않고 따로 센다 */
  const canceled = useMemo(() => applicants.filter((a) => a.status === 'CANCELED'), [applicants])

  /** 모듈 상수 APPLICANT_COLUMNS 는 그대로 두고 행 액션만 더한다 */
  const applicantColumns: Column<ApplicantRow>[] = useMemo(
    () => [
      ...APPLICANT_COLUMNS,
      {
        key: 'cancel',
        header: '',
        width: '72px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <button
            className="btn"
            style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
            onClick={() => setCanceling(r)}
          >
            취소
          </button>
        ),
      },
    ],
    [],
  )

  /* ★ 특강을 바꾸면 선택을 비운다. 안 비우면 **앞 특강에서 고른 사람이 그대로 남아**
       다음 특강의 「선택 확정」에 섞인다 — 표에는 안 보이는데 대상에는 들어간다 */
  useEffect(() => {
    setSelectedApply([])
    setSelectedWait([])
  }, [lectureId])

  const selectedLecture = lectures.find((l) => l.id === lectureId) ?? null

  /* 신청 취소. 확정자를 취소하면 정원이 하나 비고 자동 승격이 그때 돈다 */
  const [canceling, setCanceling] = useState<ApplicantRow | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)

  async function runCancel(row: ApplicantRow) {
    setCancelBusy(true)
    setError(null)
    try {
      await cancelApplication(row.applicationId)
      if (lectureId !== null) setApplicants(await listLectureApplicants(lectureId))
      await loadLectures()
      setCanceling(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '취소하지 못했습니다.')
    } finally {
      setCancelBusy(false)
    }
  }

  /**
   * 대기자 → 확정.
   *
   * ★ 서버는 **정원을 넘겨도 승격을 막지 않는다.** 일부러 그렇게 돼 있다 — 요구사항 F-4.7
   *   '일괄 이동'이 "한 명 더 받자"는 관리자 판단을 허용하는 기능이라, 막으면 그 기능이
   *   안 된다. 자동 승격(확정자가 취소했을 때)은 자리가 빈 경우에만 돌아서 이 경로와 다르다.
   *
   * ★ 그래서 **넘긴다는 사실을 화면이 알려야 한다.** 서버가 조용히 받아주므로, 경고가 없으면
   *   관리자는 정원이 넘은 줄 모르고 지나간다. 승격 전에 결과 인원을 보여주고 한 번 묻는다.
   *
   * ★ 일괄 API 가 없어 건별로 나간다. 중간에 실패해도 앞의 것은 이미 올라가 있으므로
   *   "몇 건 됐고 몇 건 안 됐는지"를 그대로 알린다. 뭉뚱그리면 다시 눌러 중복으로 올린다.
   */
  async function runPromote(ids: number[]) {
    setPromoteBusy(true)
    setError(null)
    let done = 0
    const failed: string[] = []
    for (const id of ids) {
      try {
        await promoteApplicant(id)
        done += 1
      } catch (err) {
        failed.push(err instanceof ApiError ? err.message : `#${id}`)
      }
    }
    if (lectureId !== null) setApplicants(await listLectureApplicants(lectureId))
    await loadLectures()
    setPromoteBusy(false)
    setSelectedWait([])
    setPromoting(null)
    if (failed.length > 0) {
      setError(`${ids.length}명 중 ${done}명만 확정됐습니다. 실패 ${failed.length}건 — ${failed[0]}`)
    }
  }

  const sessions = useMemo(() => (draft ? buildSessions(draft) : []), [draft])

  function patch(p: Partial<LectureDraft>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  function toggleDow(n: number) {
    setDraft((d) => (d ? { ...d, dows: d.dows.includes(n) ? d.dows.filter((x) => x !== n) : [...d.dows, n].sort() } : d))
  }

  /**
   * 개설 저장.
   *
   * ★ **한 번에 안 끝난다.** 서버가 이렇게 나눠 놨다.
   *     ① POST /lectures           이름·종류만 받는다
   *     ② PATCH /lectures/{id}     정원·비용·기간·담당
   *     ③ POST .../sessions        회차 1건씩 (일괄이 없다)
   *   중간에 실패하면 **앞 단계는 이미 서버에 남아 있다.** 그래서 "저장 실패"로 뭉뚱그리지 않고
   *   어디까지 됐는지 그대로 알린다 — 안 그러면 다시 눌러 **특강이 두 개** 생긴다.
   *
   * ★ 회차가 없으면 출석부가 0회차라 신청·대기·출결이 전부 막힌다. 그래서 회차까지 한 번에 만든다.
   */
  async function saveDraft(mode: 'draft' | 'open') {
    if (!draft || academyId === null) return
    setSaving(mode)
    setSaveNote(null)
    setError(null)

    let made: ApiLecture | null = null
    try {
      made = await createLecture({
        academyId,
        year: Number(draft.month.slice(0, 4)),
        lectureType: 'LECTURE',
        name: draft.name.trim(),
      })
    } catch (err) {
      setSaving('')
      setSaveNote({ ok: false, text: err instanceof ApiError ? err.message : '특강을 만들지 못했습니다.' })
      return
    }

    const steps: string[] = ['특강을 만들었습니다']

    try {
      await updateLecture(made.id, {
        capacity: draft.capacity,
        fee: draft.fee,
        startDate: draft.startDate,
        endDate: draft.endDate,
        /* ★ 접수 기간만 시점이다(lectures.ts 주석). 날짜 문자열 그대로 보내면 400.
             ★ `+'T00:00:00Z'` 로 붙이면 UTC 자정 = 한국 09:00 이 된다. 로컬로 해석시켜 변환한다. */
        applyFrom: toInstant(draft.applyFrom, '00:00'),
        applyTo: toInstant(draft.applyTo, '23:59'),
        teacherId: draft.teacherId ?? undefined,
        description: draft.memo || undefined,
      })
      steps.push('상세 정보를 저장했습니다')
    } catch {
      steps.push('상세 정보(정원·기간·담당)는 저장하지 못했습니다 — 목록에서 수정해 주세요')
    }

    let done = 0
    for (const date of sessions) {
      try {
        await createLectureSession(made.id, { sessionDate: date, room: draft.room })
        done += 1
      } catch {
        break
      }
    }
    steps.push(
      done === sessions.length
        ? `회차 ${done}건을 만들었습니다`
        : `회차는 ${sessions.length}건 중 ${done}건만 만들어졌습니다 — 나머지는 다시 추가해 주세요`,
    )

    if (mode === 'open') {
      try {
        await changeLectureStatus(made.id, 'OPEN')
        await setLectureVisible(made.id, true)
        steps.push('접수를 열고 앱에 노출했습니다')
      } catch {
        steps.push('접수 열기는 실패했습니다 — 목록에서 상태를 바꿔 주세요')
      }
    }

    await loadLectures()
    setSaving('')
    setDraft(null)
    setTab('list')
    setSaveNote({ ok: true, text: steps.join(' · ') })
  }

  /**
   * 특강 삭제.
   *
   * ★ 신청자가 있으면 400 이다. 서버 메시지가 "신청자가 있는 특강은 삭제할 수 없습니다(5명).
   *   접수를 마감하거나 취소해 주세요." 처럼 **무엇을 해야 하는지까지** 말해주므로 그대로 띄운다.
   * ★ 회차는 함께 지워진다 — 회차만 남는 일은 없다.
   */
  async function removeLecture() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteErr(null)
    try {
      await deleteLecture(deleting.id)
      if (lectureId === deleting.id) setLectureId(null)
      await loadLectures()
      setDeleting(null)
    } catch (err) {
      setDeleteErr(err instanceof ApiError ? err.message : '특강을 삭제하지 못했습니다.')
    } finally {
      setDeleteBusy(false)
    }
  }

  /* 회차가 바뀌면 출결을 다시 읽는다. 회차마다 따로 조회해야 해서 한 번에 모은다 */
  useEffect(() => {
    if (sessionList.length === 0) {
      setAttendance(new Map())
      return
    }
    let cancelled = false
    void Promise.all(
      sessionList.map((se) =>
        listSessionAttendances(se.id)
          .then((rows) => [se.id, new Map(rows.map((r) => [r.applicationId, r.status]))] as const)
          /* 한 회차가 실패해도 나머지는 보여준다 — 표 전체가 비는 것보다 낫다 */
          .catch(() => [se.id, new Map<number, LectureAttendanceStatus>()] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setAttendance(new Map(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [sessionList])

  /**
   * 출결 한 칸을 찍는다.
   *
   * ★ 서버가 **한 건씩** 받는다(lectures.ts 주석). 셀을 누를 때마다 한 번 나간다.
   * ★ 출석 → 지각 → 결석 → 미입력 순으로 돈다. 잘못 찍었을 때 되돌릴 방법이 그것뿐이다
   *   — 서버에 "지우기"가 없어 미입력으로는 못 돌아간다. 그래서 세 값만 순환한다.
   */
  async function toggleAttendance(sessionId: number, applicationId: number) {
    const key = `${sessionId}:${applicationId}`
    const cur = attendance.get(sessionId)?.get(applicationId)
    const next: LectureAttendanceStatus =
      cur === 'PRESENT' ? 'LATE' : cur === 'LATE' ? 'ABSENT' : 'PRESENT'
    setAttBusy(key)
    setError(null)
    try {
      await saveSessionAttendance(sessionId, { applicationId, status: next })
      setAttendance((prev) => {
        const copy = new Map(prev)
        const row = new Map(copy.get(sessionId) ?? [])
        row.set(applicationId, next)
        copy.set(sessionId, row)
        return copy
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '출결을 저장하지 못했습니다.')
    } finally {
      setAttBusy(null)
    }
  }

  /** 목록을 다시 읽고 열려 있는 상세도 새 값으로 바꾼다 — 안 그러면 고친 값이 안 보인다 */
  async function refreshDetail() {
    const next = await loadLectures()
    setDetail((cur) => (cur ? (next.find((x) => x.id === cur.id) ?? cur) : cur))
  }

  /** 상세에서 고친 것을 저장한다. 접수 기간만 시점이라 따로 변환한다(lectures.ts 주석) */
  async function saveDetail() {
    if (!detail || !editing) return
    setDetailBusy(true)
    setDetailErr(null)
    try {
      await updateLecture(detail.id, {
        name: editing.name.trim(),
        description: editing.description.trim() || undefined,
        capacity: editing.capacity === '' ? undefined : Number(editing.capacity),
        fee: editing.fee === '' ? undefined : Number(editing.fee),
        startDate: editing.startDate || undefined,
        endDate: editing.endDate || undefined,
        applyFrom: toInstant(editing.applyFrom, '00:00'),
        applyTo: toInstant(editing.applyTo, '23:59'),
        teacherId: editing.teacherId ?? undefined,
      })
      await refreshDetail()
      setEditing(null)
    } catch (err) {
      /* 모달을 닫지 않는다 — 고친 값을 다시 치게 하면 안 된다 */
      setDetailErr(err instanceof ApiError ? err.message : '특강을 수정하지 못했습니다.')
    } finally {
      setDetailBusy(false)
    }
  }

  /**
   * 상태·노출 전환.
   *
   * ★ 둘은 **별개 축이다.** 접수를 열어도(OPEN) 노출을 안 켜면 앱에 안 보인다 —
   *   "왜 신청이 안 들어오지"의 흔한 원인이라 상세에서 둘을 따로 보여준다.
   */
  async function changeDetail(fn: () => Promise<unknown>) {
    setDetailBusy(true)
    setDetailErr(null)
    try {
      await fn()
      await refreshDetail()
    } catch (err) {
      setDetailErr(err instanceof ApiError ? err.message : '바꾸지 못했습니다.')
    } finally {
      setDetailBusy(false)
    }
  }

  /** 회차 삭제. 출결이 찍힌 회차는 서버가 400 을 준다 */
  async function removeSession() {
    if (!deletingSession || lectureId === null) return
    setDeleteBusy(true)
    setDeleteErr(null)
    try {
      await deleteLectureSession(deletingSession.id)
      setSessionList(await listLectureSessions(lectureId))
      setDeletingSession(null)
    } catch (err) {
      setDeleteErr(err instanceof ApiError ? err.message : '회차를 삭제하지 못했습니다.')
    } finally {
      setDeleteBusy(false)
    }
  }

  /* 목록에 삭제 버튼을 더한다. 열 정의가 모듈 상수라 화면 상태를 못 써서 여기서 잇는다 */
  const columns = useMemo<Column<ApiLecture>[]>(
    () => [
      ...LECTURE_COLUMNS,
      {
        key: 'act',
        header: '',
        width: '64px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <button
            className="btn"
            style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
            /* 행을 누르면 특강이 선택되므로 여기서 끊는다 */
            onClick={(e) => {
              e.stopPropagation()
              setDeleteErr(null)
              setDeleting(r)
            }}
          >
            삭제
          </button>
        ),
      },
    ],
    [],
  )

  /* 저장을 막는 이유를 하나로 모은다 — 버튼이 왜 안 눌리는지 마우스를 올리면 나온다 */
  const canSave =
    draft !== null && draft.name.trim().length > 0 && sessions.length > 0 && academyId !== null
  const saveBlockReason =
    academyId === null
      ? '지점을 먼저 선택하세요'
      : draft && draft.name.trim().length === 0
        ? '특강명을 입력하세요'
        : sessions.length === 0
          ? '수업 요일과 기간을 정해 회차를 1건 이상 만들어 주세요'
          : undefined

  /* ══ 특강 개설 폼 ══ */
  if (draft) {
    return (
      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="calendar-plus" size={15} />
            </span>
            특강 개설
          </div>
          <div className="r">
            <button className="btn" onClick={() => setDraft(null)}>
              취소
            </button>
            {/* ★ 저장이 3단계로 나뉜다(saveDraft 주석). 회차까지 만들어야 출석부가 열린다.
                   ★ 회차 0건이면 막는다 — 회차 없는 특강은 신청·대기·출결이 전부 막힌 채로
                     목록에만 남고, 지울 경로도 없다. */}
            <button
              className="btn"
              disabled={!canSave || saving !== ''}
              title={saveBlockReason}
              onClick={() => void saveDraft('draft')}
            >
              <Icon name="save" size={14} /> {saving === 'draft' ? '저장 중…' : '임시 저장'}
            </button>
            <button
              className="btn pri"
              disabled={!canSave || saving !== ''}
              title={saveBlockReason}
              onClick={() => void saveDraft('open')}
            >
              <Icon name="send" size={14} /> {saving === 'open' ? '개설 중…' : '개설 · 접수 시작'}
            </button>
          </div>
        </div>

        <div className="card-sec-b">
          <div className="split-3-2">
            {/* ── 기본 정보 ── */}
            <div>
              <div className="frow">
                <label className="req">특강명</label>
                <input
                  className="inp"
                  value={draft.name}
                  placeholder="예: 수학 미적 킬러문항 특강"
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>

              <div className="frow">
                <label className="req">담당 강사</label>
                {/* ★ 서버가 강사를 id 로 받는다. 목업의 이름 목록을 그대로 두면 아무리 골라도
                       매칭이 안 돼 담당이 '미지정'으로 저장된다 — 실제로 그렇게 들어간 적이 있다. */}
                <select
                  className="sel"
                  value={draft.teacherId ?? ''}
                  onChange={(e) => patch({ teacherId: e.target.value ? Number(e.target.value) : null })}
                >
                  {/* 빈 값을 **선택지로 둔다.** 안 고르면 '미지정'이라는 것이 화면에 보여야 한다 */}
                  <option value="">{teachers.length === 0 ? '등록된 강사가 없습니다' : '미지정'}</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="frow">
                <label className="req">강의실</label>
                <select className="sel" value={draft.room} onChange={(e) => patch({ room: e.target.value })}>
                  {ROOMS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="frow">
                <label className="req">수강 대상</label>
                <div className="type-picks">
                  {TRACK_TARGETS.map((t) => (
                    <button
                      type="button"
                      key={t}
                      className={`type-pick${draft.target === t ? ' on' : ''}`}
                      onClick={() => patch({ target: t })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="frow">
                <label className="req">정원 · 특강비</label>
                <div className="two">
                  <input
                    className="inp"
                    type="number"
                    min={1}
                    value={draft.capacity}
                    onChange={(e) => patch({ capacity: Number(e.target.value) })}
                  />
                  <input
                    className="inp"
                    type="number"
                    step={10000}
                    value={draft.fee}
                    onChange={(e) => patch({ fee: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="frow">
                <label className="req">수업 기간</label>
                <div className="two">
                  <input className="inp" type="date" value={draft.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
                  <input className="inp" type="date" value={draft.endDate} onChange={(e) => patch({ endDate: e.target.value })} />
                </div>
              </div>

              <div className="frow">
                <label className="req">수업 요일</label>
                <div className="sf-chips">
                  {DOW_LABELS.map((d, i) => {
                    const n = i + 1
                    return (
                      <button
                        type="button"
                        key={d}
                        className={`chip${draft.dows.includes(n) ? ' on' : ''}`}
                        onClick={() => toggleDow(n)}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="frow">
                <label>접수 기간</label>
                <div className="two">
                  <input className="inp" type="date" value={draft.applyFrom} onChange={(e) => patch({ applyFrom: e.target.value })} />
                  <input className="inp" type="date" value={draft.applyTo} onChange={(e) => patch({ applyTo: e.target.value })} />
                </div>
              </div>

              <div className="frow">
                <label>옵션</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={draft.allowWaiting}
                      onChange={(e) => patch({ allowWaiting: e.target.checked })}
                    />
                    정원 초과 시 대기자 접수
                  </label>
                  {/* ★ 이 값은 서버로 가지 않는다 — 켜도 아무 일이 없는데 켜지는 것처럼 보였다.
                         '함께 받기' 가 무엇인지(설명회를 따로 만드는지, 한 특강에 두 신청을 받는지)
                         정해지기 전까지 막아 둔다. 설명회는 목록에서 유형 '설명회' 로 관리한다 */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)' }} title="준비 중입니다">
                    <input type="checkbox" checked={false} disabled data-soon readOnly />
                    설명회 신청도 함께 받기
                  </label>
                </div>
              </div>

              <div className="frow">
                <label>비고</label>
                <textarea
                  className="ta"
                  value={draft.memo}
                  placeholder="교재·준비물·유의사항 등"
                  onChange={(e) => patch({ memo: e.target.value })}
                />
              </div>
            </div>

            {/* ── 회차 미리보기 ── */}
            <div className="card-sec" style={{ marginBottom: 0 }}>
              <div className="card-sec-h">
                <div className="t">
                  <span className="ico">
                    <Icon name="calendar-check" size={15} />
                  </span>
                  회차 미리보기
                </div>
                <div className="r">
                  <span className={`mk ${sessions.length ? 'verified' : 'brandnew'}`}>{sessions.length}회차</span>
                </div>
              </div>
              <div className="card-sec-b">
                {sessions.length === 0 ? (
                  <div className="mock-stub" style={{ padding: '28px 18px' }}>
                    <div className="t">회차가 생성되지 않았습니다</div>
                    <div className="x">수업 기간과 요일을 확인하세요. 회차가 없으면 출석부를 만들 수 없어 개설할 수 없습니다.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {sessions.map((s, i) => (
                      <span
                        key={s}
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: '5px 10px',
                          borderRadius: 8,
                          background: 'var(--mint-wash)',
                          color: 'var(--mint-d)',
                        }}
                      >
                        {/* 서버에 보내는 값은 yyyy-MM-dd 지만 화면에는 월/일만 있으면 된다 */}
                        {i + 1}. {s.slice(5).replace('-', '/')}
                      </span>
                    ))}
                  </div>
                )}

                <div className="kv" style={{ marginTop: 16 }}>
                  <div className="row">
                    <span className="k">총 수강료</span>
                    <span className="v">
                      <b>{draft.fee.toLocaleString()}원</b>
                      <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                        {' '}
                        · 회당 {sessions.length ? Math.round(draft.fee / sessions.length).toLocaleString() : 0}원
                      </span>
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">최대 매출</span>
                    <span className="v">{(draft.fee * draft.capacity).toLocaleString()}원</span>
                  </div>
                  <div className="row">
                    <span className="k">강의실</span>
                    <span className="v">
                      {draft.room} · {draft.target}
                    </span>
                  </div>
                </div>

                <div className="note-box plain" style={{ marginTop: 14, marginBottom: 0 }}>
                  <div className="ic">
                    <Icon name="info" size={17} />
                  </div>
                  <div>
                    {/* ★ 청구 항목은 **여기서 안 만들어진다.** 그렇게 적어뒀더니 개설하고 나서
                           수납에 안 뜬다는 말이 나왔다 — 특강비 청구는 수납 관리에서 따로 만든다. */}
                    <div className="tt">개설하면 특강과 회차가 함께 생성됩니다</div>
                    <div className="tx">
                      <b>① 특강</b> · <b>② 회차 {sessions.length}건</b>(출석부의 열).
                      <br />
                      회차 없이는 출석부를 만들 수 없어 <b>개설 자체가 막힙니다.</b>
                      <br />
                      <b>특강비 청구는 따로 만듭니다</b> — 수납 관리의 청구 기준에서 등록합니다.
                      <br />
                      개설 후 <b>정원을 신청 인원보다 적게 줄일 수 없습니다</b> — 누구를 대기자로 밀어낼지 결정할 수 없기
                      때문입니다.
                    </div>
                  </div>
                </div>

                <div className="blocked-note" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="ic">
                    <Icon name="triangle-alert" size={16} />
                  </div>
                  <div>
                    <div className="tt">강의실 중복 확인이 필요합니다</div>
                    <div className="tx">
                      같은 시간대에 <b>{draft.room}</b>이 반 시간표(고정수업·이동수업)에 이미 배정돼 있을 수 있습니다.
                      개설하기 전에 같은 요일·교시에 이 강의실이 비어 있는지 확인하세요.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="presentation" size={13} /> 개설 특강
          </div>
          <div className="v">{lectures.length}</div>
          <div className="d">{new Date().getFullYear()}년</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 총 신청
          </div>
          <div className="v">{lectures.reduce((a, l) => a + l.confirmedCount, 0)}</div>
          <div className="d">건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="list-ordered" size={13} /> 대기자
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {lectures.reduce((a, l) => a + l.waitlistedCount, 0)}
          </div>
          <div className="d warn">정원 초과분</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="banknote" size={13} /> 특강비 수납
          </div>
          {/* 수납 여부는 청구 도메인이라 특강 응답에 없다 */}
          <div className="v" style={{ fontSize: 14, paddingTop: 8 }}>
            <Unfilled reason="수납 현황은 수납 화면에서 확인하세요" />
          </div>
          <div className="d">수납현황(F-4.8) 참조</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="megaphone" size={13} /> 설명회 신청
          </div>
          <div className="v">
            {lectures.filter((l) => l.lectureType === 'BRIEFING').reduce((n, l) => n + (l.confirmedCount ?? 0), 0)}
          </div>
          <div className="d">설명회 {lectures.filter((l) => l.lectureType === 'BRIEFING').length}개 · 확정 인원</div>
        </div>
      </div>

      {error && (
        <div className="note-box risk" role="alert">
          {error}
        </div>
      )}

      {/* ★ 저장이 3단계라 '성공/실패' 둘로는 못 적는다. 어디까지 됐는지 그대로 보여주고,
             사용자가 닫기 전에는 안 사라지게 둔다 — 사라지면 다시 눌러 특강이 두 개 생긴다. */}
      {saveNote && (
        <div className={`note-box ${saveNote.ok ? 'plain' : 'risk'}`} role="status">
          <div className="ic">
            <Icon name={saveNote.ok ? 'check' : 'alert-triangle'} size={17} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="tt">{saveNote.ok ? '개설 결과' : '개설하지 못했습니다'}</div>
            <div className="tx">{saveNote.text}</div>
          </div>
          <button className="btn" onClick={() => setSaveNote(null)}>
            닫기
          </button>
        </div>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '특강 목록', count: lectures.length },
            { key: 'apply', label: '신청 명단', count: applied.length },
            { key: 'wait', label: '대기자', count: waiting.length },
            { key: 'att', label: '출석부' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {tab === 'list' && (
            <DataTable
              columns={columns}
              rows={briefingOnly ? lectures.filter((l) => l.lectureType === 'BRIEFING') : lectures}
              rowKey={(r) => String(r.id)}
              masked={false}
              loading={loading}
              pageSize={10}
              /* 행을 누르면 상세를 열고, 아래 탭(신청자·대기자·출석부)도 그 특강으로 맞춘다 */
              onRowClick={(r) => {
                setLectureId(r.id)
                setDetailErr(null)
                setEditing(null)
                setDetail(r)
              }}
              emptyText={academyId === null ? '지점을 먼저 선택하세요.' : '등록된 특강이 없습니다.'}
              countLabel={
                <>
                  {lectureYear}년 {briefingOnly ? '설명회' : '특강'}{' '}
                  <b>{briefingOnly ? lectures.filter((l) => l.lectureType === 'BRIEFING').length : lectures.length}</b>건
                  {selectedLecture && (
                    <span style={{ color: 'var(--muted)' }}> · 선택: {selectedLecture.name}</span>
                  )}
                </>
              }
              toolbar={
                <>
                  <button type="button" className={`chip${briefingOnly ? ' on' : ''}`} onClick={() => setBriefingOnly((v) => !v)}>
                    설명회만
                  </button>
                  <ExcelButton filename="특강_목록" columns={LECTURE_COLUMNS} rows={lectures} masked={false} />
                  <button className="btn pri" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                    <Icon name="plus" size={14} /> 특강 개설
                  </button>
                </>
              }
            />
          )}

          {(tab === 'apply' || tab === 'wait') && (
            <DataTable
              columns={applicantColumns}
              rows={tab === 'apply' ? applied : waiting}
              rowKey={(r) => String(r.applicationId)}
              selectable
              selected={tab === 'apply' ? selectedApply : selectedWait}
              onSelectedChange={tab === 'apply' ? setSelectedApply : setSelectedWait}
              masked={masked}
              pageSize={12}
              emptyText={selectedLecture ? '해당하는 인원이 없습니다.' : '특강 목록에서 특강을 먼저 선택하세요.'}
              countLabel={
                <>
                  {selectedLecture?.name ?? '특강 미선택'} · {tab === 'apply' ? '신청자' : '대기자'}{' '}
                  <b>{(tab === 'apply' ? applied : waiting).length}</b>명
                  {/* 취소분은 명단에 남지만 세지 않는다 — 안 적으면 "아까 그 학생 어디 갔냐"가 된다 */}
                  {canceled.length > 0 && (
                    <span style={{ color: 'var(--muted)' }}> · 취소 {canceled.length}명</span>
                  )}
                </>
              }
              toolbar={
                <>
                  {/* 대기자 → 확정. 서버가 한 건씩 받으므로 순차로 보낸다 */}
                  <button
                    className="btn"
                    disabled={selectedWait.length === 0 || tab !== 'wait'}
                    title={tab === 'wait' ? '선택한 대기자를 확정으로 올립니다' : '대기자 탭에서 사용합니다'}
                    onClick={() => setPromoting({ ids: selectedWait.map(Number) })}
                  >
                    <Icon name="arrow-right" size={14} /> 선택 확정
                  </button>
                  <button
                    className="btn"
                    disabled={tab !== 'apply' || selectedApply.length === 0 || !selectedLecture}
                    title={tab === 'apply' ? '고른 신청자에게 특강비 청구를 만듭니다' : '신청자 탭에서 사용합니다'}
                    onClick={() =>
                      selectedLecture &&
                      setBilling({
                        rows: applied.filter((a) => selectedApply.includes(String(a.applicationId))),
                        name: `${selectedLecture.name} 특강비`,
                        amount: String(selectedLecture.fee ?? ''),
                        dueDate: '',
                        results: null,
                      })
                    }
                  >
                    수납청구
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton
                    filename={tab === 'apply' ? '특강_신청명단' : '특강_대기자'}
                    columns={APPLICANT_COLUMNS}
                    rows={tab === 'apply' ? applied : waiting}
                    masked={masked}
                  />
                </>
              }
            />
          )}

          {tab === 'att' && (
            <div className="dt-wrap">
              <div className="dt-toolbar">
                <span className="dt-count">
                  {selectedLecture?.name ?? '특강 미선택'} · <b>{sessionList.length}</b>회차
                </span>
                <div className="dt-right">
                  <MaskToggle masked={masked} onChange={setMasked} />
                  {/* 지금 보이는 출석부를 그대로 인쇄한다 — 따로 만든 출력 양식은 없다 */}
                  <PrintButton label="출석부 인쇄" />
                </div>
              </div>
              <div className="dt-scroll">
                <table className="dt">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>학번</th>
                      <th style={{ width: 84 }}>이름</th>
                      <th style={{ width: 56 }} className="al-center">
                        반
                      </th>
                      {sessionList.map((se) => (
                        <th key={se.id} className="al-center" style={{ width: 68 }} title={se.room ?? ''}>
                          {se.sessionDate.slice(5)}
                          {/* 회차가 곧 이 표의 열이라 지우는 자리도 여기가 맞다 */}
                          <button
                            type="button"
                            aria-label={`${se.sessionNo}회차 삭제`}
                            title="이 회차를 지웁니다"
                            onClick={() => {
                              setDeleteErr(null)
                              setDeletingSession(se)
                            }}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: 'var(--muted)',
                              cursor: 'pointer',
                              padding: '0 0 0 4px',
                            }}
                          >
                            <Icon name="x" size={11} />
                          </button>
                        </th>
                      ))}
                      <th className="al-center" style={{ width: 80 }}>
                        출석률
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* ★ 빈 표를 머리만 남기고 두지 않는다. 출석을 찍으러 온 사람이
                           "칸이 어디 있냐"고 묻게 된다 — 실제로 그랬다(2026-09-14).
                           비는 이유가 셋이라 무엇을 해야 하는지까지 갈라서 적는다. */}
                    {applied.length === 0 && (
                      <tr>
                        <td colSpan={sessionList.length + 4} className="al-center" style={{ padding: '26px 12px' }}>
                          {selectedLecture === null ? (
                            <span style={{ color: 'var(--muted)' }}>위 목록에서 특강을 먼저 고르세요.</span>
                          ) : sessionList.length === 0 ? (
                            <span style={{ color: 'var(--muted)' }}>
                              이 특강에 수업 회차가 없습니다. 회차를 만들어야 출석을 찍을 수 있습니다.
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>
                              확정된 신청자가 없습니다. <b>신청자</b> 탭에서 확정하면 여기에 줄이 생깁니다.
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                    {applied.map((a) => (
                      <tr key={a.applicationId}>
                        <td>{a.studentNo ?? '-'}</td>
                        <td className="masked">
                          {masked ? `${a.studentName[0]}*${a.studentName.slice(2)}` : a.studentName}
                        </td>
                        <td className="al-center">{a.className ?? '-'}</td>
                        {/* ★ 눌러서 찍는다. 출석 → 지각 → 결석 순으로 돈다 —
                               서버에 '지우기' 가 없어 미입력으로는 못 돌아간다 */}
                        {sessionList.map((se) => {
                          const st = attendance.get(se.id)?.get(a.applicationId)
                          const busy = attBusy === `${se.id}:${a.applicationId}`
                          return (
                            <td key={se.id} className="al-center">
                              <button
                                type="button"
                                className={`mk ${ATT_TONE[st ?? ''] ?? ''}`}
                                style={{ border: 'none', cursor: 'pointer', font: 'inherit', opacity: busy ? 0.5 : 1 }}
                                disabled={busy}
                                title={st ? '눌러서 바꿉니다' : '아직 입력하지 않았습니다'}
                                onClick={() => void toggleAttendance(se.id, a.applicationId)}
                              >
                                {st ? LECTURE_ATTENDANCE_LABEL[st] : '—'}
                              </button>
                            </td>
                          )
                        })}
                        <td className="al-center">
                          {/* ★ 미입력을 결석으로 세지 않는다. 찍은 회차만 분모에 넣는다 —
                                 안 그러면 아직 안 한 수업 때문에 출석률이 떨어져 보인다 */}
                          {(() => {
                            const marked = sessionList.filter((se) =>
                              attendance.get(se.id)?.has(a.applicationId),
                            )
                            if (marked.length === 0) return <span style={{ color: 'var(--muted)' }}>-</span>
                            const ok = marked.filter(
                              (se) => attendance.get(se.id)?.get(a.applicationId) !== 'ABSENT',
                            ).length
                            return `${Math.round((ok / marked.length) * 100)}% (${marked.length}회)`
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {canceling && (
        <Modal
          title="신청 취소"
          sub={`${canceling.studentName}(${canceling.studentNo ?? '-'}) 의 신청을 취소합니다.`}
          confirmLabel="취소 처리"
          danger
          busy={cancelBusy}
          onConfirm={() => void runCancel(canceling)}
          onClose={() => setCanceling(null)}
        >
          <div className="note-box risk">
            <div className="ic">
              <Icon name="alert-triangle" size={17} />
            </div>
            <div>
              <div className="tt">되돌릴 수 없습니다</div>
              <div className="tx">
                {canceling.waitlisted ? (
                  <>대기 명단에서 빠집니다.</>
                ) : (
                  <>
                    확정 인원이 하나 줄고 <b>출석부에서도 빠집니다.</b> 자리가 비면 대기자가 자동으로
                    올라올 수 있습니다.
                  </>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal
          title={detail.name}
          sub={
            editing
              ? '고친 내용을 저장합니다.'
              : `${LECTURE_TYPE_LABEL[detail.lectureType] ?? detail.lectureType} · ${
                  LECTURE_STATUS_LABEL[detail.status] ?? detail.status
                } · ${detail.visible ? '앱에 노출 중' : '앱에 안 보임'}`
          }
          confirmLabel={editing ? '저장' : '닫기'}
          hideCancel={!editing}
          busy={detailBusy}
          error={detailErr}
          confirmDisabled={editing ? editing.name.trim() === '' : false}
          wide
          onConfirm={() => (editing ? void saveDetail() : setDetail(null))}
          onClose={() => (editing ? setEditing(null) : setDetail(null))}
        >
          {/* ★ 폭은 모달이 정한다(`wide`). 여기에 minWidth 를 박으면 바깥 .mo 가 440px 에
                 묶여 있어 **내용이 그대로 잘린다** — 실제로 그렇게 잘려 있었다(2026-09-14) */}
          <div>
            {editing ? (
              <>
                <div className="frow">
                  <label className="req">특강명</label>
                  <input
                    className="inp"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div className="frow">
                  <label>설명</label>
                  <textarea
                    className="ta"
                    rows={3}
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </div>
                <div className="frow">
                  <label>담당 강사</label>
                  <select
                    className="sel"
                    value={editing.teacherId ?? ''}
                    onChange={(e) =>
                      setEditing({ ...editing, teacherId: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">{teachers.length === 0 ? '등록된 강사가 없습니다' : '미지정'}</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="frow">
                  <label>정원 · 특강비</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="inp"
                      type="number"
                      min={0}
                      style={{ width: 110 }}
                      value={editing.capacity}
                      placeholder="정원"
                      onChange={(e) => setEditing({ ...editing, capacity: e.target.value })}
                    />
                    <input
                      className="inp"
                      type="number"
                      min={0}
                      value={editing.fee}
                      placeholder="특강비"
                      onChange={(e) => setEditing({ ...editing, fee: e.target.value })}
                    />
                  </div>
                </div>
                <div className="frow">
                  <label>수업 기간</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="inp"
                      type="date"
                      value={editing.startDate}
                      onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                    />
                    <span style={{ color: 'var(--muted)' }}>~</span>
                    <input
                      className="inp"
                      type="date"
                      value={editing.endDate}
                      onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="frow">
                  <label>접수 기간</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="inp"
                      type="date"
                      value={editing.applyFrom}
                      onChange={(e) => setEditing({ ...editing, applyFrom: e.target.value })}
                    />
                    <span style={{ color: 'var(--muted)' }}>~</span>
                    <input
                      className="inp"
                      type="date"
                      value={editing.applyTo}
                      onChange={(e) => setEditing({ ...editing, applyTo: e.target.value })}
                    />
                  </div>
                </div>
                {/* ★ 회차는 여기서 못 고친다. 기간·요일을 바꿔도 이미 만들어진 회차는 그대로다 —
                       출결이 그 회차에 붙어 있기 때문이다. 회차는 출석부에서 하나씩 지운다. */}
                <div className="hint">수업 기간을 바꿔도 이미 만들어진 회차는 그대로입니다.</div>
              </>
            ) : (
              <>
                <div className="kv">
                  <div className="row">
                    <span className="k">설명</span>
                    <span className="v">
                      {detail.description || <span style={{ color: 'var(--muted)' }}>-</span>}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">담당 강사</span>
                    <span className="v">
                      {detail.teacherName || <span style={{ color: 'var(--muted)' }}>미지정</span>}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">세부 유형</span>
                    <span className="v">
                      {detail.categoryName || <span style={{ color: 'var(--muted)' }}>-</span>}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">정원</span>
                    <span className="v">
                      확정 {detail.confirmedCount}명
                      {detail.capacity !== null && ` / 정원 ${detail.capacity}명`}
                      {detail.waitlistedCount > 0 && ` · 대기 ${detail.waitlistedCount}명`}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">특강비</span>
                    <span className="v">{won(detail.fee ?? 0)}</span>
                  </div>
                  <div className="row">
                    <span className="k">수업 기간</span>
                    <span className="v">
                      {detail.startDate ? `${detail.startDate} ~ ${detail.endDate ?? ''}` : '-'}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">접수 기간</span>
                    <span className="v">
                      {detail.applyFrom ? `${localDay(detail.applyFrom)} ~ ${localDay(detail.applyTo ?? '')}` : '-'}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">회차</span>
                    <span className="v">
                      {sessionList.length > 0 ? (
                        `${sessionList.length}회차 · ${sessionList[0].sessionDate} ~ ${
                          sessionList[sessionList.length - 1].sessionDate
                        }`
                      ) : (
                        <span style={{ color: 'var(--red)' }}>회차가 없습니다 — 출석부를 만들 수 없습니다</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* ★ 상태와 노출은 별개 축이다. 접수를 열어도 노출을 안 켜면 앱에 안 보인다 */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <button
                    className="btn"
                    disabled={detailBusy}
                    onClick={() => setEditing(toEdit(detail))}
                  >
                    <Icon name="pencil" size={14} /> 수정
                  </button>
                  <button
                    className="btn"
                    disabled={detailBusy}
                    onClick={() =>
                      void changeDetail(() =>
                        changeLectureStatus(detail.id, detail.status === 'OPEN' ? 'CLOSED' : 'OPEN'),
                      )
                    }
                  >
                    {detail.status === 'OPEN' ? '접수 마감' : '접수 열기'}
                  </button>
                  <button
                    className="btn"
                    disabled={detailBusy}
                    onClick={() => void changeDetail(() => setLectureVisible(detail.id, !detail.visible))}
                  >
                    {detail.visible ? '앱에서 숨기기' : '앱에 노출'}
                  </button>
                  <button
                    className="btn"
                    style={{ color: 'var(--red)', marginLeft: 'auto' }}
                    disabled={detailBusy}
                    onClick={() => {
                      setDeleteErr(null)
                      setDeleting(detail)
                      setDetail(null)
                    }}
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {deletingSession && (
        <Modal
          title={`${deletingSession.sessionNo}회차 삭제`}
          sub={`${deletingSession.sessionDate} 수업을 지웁니다.`}
          confirmLabel="삭제"
          danger
          busy={deleteBusy}
          error={deleteErr}
          onConfirm={() => void removeSession()}
          onClose={() => setDeletingSession(null)}
        >
          {/* ★ 서버가 번호를 다시 안 매긴다. 3회차를 지워도 4회차는 그대로 4회차라
                 번호가 비어 보이는데, 미리 말하지 않으면 그걸 결함으로 읽는다. */}
          <div className="note-box warn">
            <div className="ic">
              <Icon name="alert-triangle" size={17} />
            </div>
            <div>
              <div className="tt">회차 번호는 다시 매기지 않습니다</div>
              <div className="tx">
                {deletingSession.sessionNo}회차를 지워도 뒤 회차 번호는 <b>그대로</b>입니다. 출결이 기록된
                회차는 지울 수 없습니다.
              </div>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="특강 삭제"
          sub={`${deleting.name} 을(를) 지웁니다.`}
          confirmLabel="삭제"
          danger
          busy={deleteBusy}
          error={deleteErr}
          onConfirm={() => void removeLecture()}
          onClose={() => setDeleting(null)}
        >
          {/* ★ 회차가 함께 지워진다. 출석부의 열이 사라지는 것이라 미리 말한다 */}
          <div className="note-box risk">
            <div className="ic">
              <Icon name="alert-triangle" size={17} />
            </div>
            <div>
              <div className="tt">되돌릴 수 없습니다</div>
              <div className="tx">
                회차도 <b>함께 지워집니다.</b> 신청자가 있으면 지울 수 없고, 그때는 접수를 마감하거나 취소로
                두시면 됩니다.
              </div>
            </div>
          </div>
        </Modal>
      )}

      {billing && (
        <Modal
          title={billing.results ? '수납청구 결과' : `특강비 청구 — ${billing.rows.length}명`}
          sub={billing.results ? undefined : '학생마다 청구가 하나씩 만들어집니다. 수납현황의 미납자 관리에 바로 잡힙니다.'}
          confirmLabel={billing.results ? '닫기' : '청구'}
          busy={billBusy}
          confirmDisabled={!billing.results && (billing.name.trim() === '' || !(Number(billing.amount) > 0))}
          onConfirm={() => (billing.results ? setBilling(null) : void runBilling())}
          onClose={() => setBilling(null)}
        >
          {billing.results ? (
            <>
              <div className="note-box" role="status">
                <div>
                  <b>{billing.results.filter((x) => x.ok).length}명 청구</b> · 실패{' '}
                  <b style={{ color: billing.results.some((x) => !x.ok) ? 'var(--red)' : undefined }}>
                    {billing.results.filter((x) => !x.ok).length}명
                  </b>
                  {billing.results.some((x) => !x.ok) && ' — 실패한 학생은 청구되지 않았습니다. 이유를 확인하고 다시 청구하세요.'}
                </div>
              </div>
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                {billing.results.map((x, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '4px 0' }}>
                    <span style={{ width: 90 }}>{x.name}</span>
                    <span style={{ color: x.ok ? 'var(--mint-d)' : 'var(--red)' }}>{x.msg}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="frow">
                <label className="req">청구명</label>
                <input className="inp" maxLength={100} value={billing.name} onChange={(e) => setBilling({ ...billing, name: e.target.value })} />
              </div>
              <div className="frow">
                <label className="req">금액</label>
                <div>
                  <input
                    className="inp"
                    type="number"
                    min={1}
                    value={billing.amount}
                    onChange={(e) => setBilling({ ...billing, amount: e.target.value })}
                  />
                  <div className="hint">특강에 적힌 금액을 채워 뒀습니다. 할인이 있으면 수납현황에서 조정합니다.</div>
                </div>
              </div>
              <div className="frow">
                <label>납기</label>
                <input className="inp" type="date" value={billing.dueDate} onChange={(e) => setBilling({ ...billing, dueDate: e.target.value })} />
              </div>
              <div className="hint">대상: {billing.rows.map((r) => r.studentName).join(', ')}</div>
            </>
          )}
        </Modal>
      )}

      {promoting && (
        <PromoteConfirm
          count={promoting.ids.length}
          capacity={selectedLecture?.capacity ?? null}
          confirmed={selectedLecture?.confirmedCount ?? 0}
          busy={promoteBusy}
          onClose={() => setPromoting(null)}
          onConfirm={() => void runPromote(promoting.ids)}
        />
      )}
    </>
  )
}

/**
 * 대기자 확정 전 확인.
 *
 * ★ 정원을 넘기는 것 자체는 허용된다(runPromote 주석). 다만 **넘긴다는 사실**을 여기서
 *   숫자로 보여준다 — "정원 20명 / 확정 후 22명". 서버가 조용히 받아주기 때문에 화면이
 *   말하지 않으면 아무도 모른다.
 * ★ 정원이 없는 특강(capacity null)은 넘길 것이 없으므로 경고를 띄우지 않는다.
 */
function PromoteConfirm({
  count,
  capacity,
  confirmed,
  busy,
  onClose,
  onConfirm,
}: {
  count: number
  capacity: number | null
  confirmed: number
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const after = confirmed + count
  const over = capacity !== null && after > capacity

  return (
    <Modal
      title="대기자 확정"
      sub={`선택한 ${count}명을 확정 인원으로 올립니다.`}
      confirmLabel={over ? '정원을 넘겨 확정' : '확정'}
      danger={over}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <div className="frow">
        <label>확정 인원</label>
        <div>
          {confirmed}명 → <b>{after}명</b>
          {capacity !== null && <span style={{ color: 'var(--muted)' }}> (정원 {capacity}명)</span>}
        </div>
      </div>

      {over && (
        /* ★ risk 클래스를 쓴다. 인라인으로 빨갛게 칠하면 <b> 는 `.note-box b`(민트)를 그대로
             받아서, 경고 상자 안에서 정작 강조한 숫자만 초록으로 나온다. 실제로 그랬다. */
        <div className="note-box risk" role="alert">
          <div>
            정원 {capacity}명을 <b>{after - capacity}명 넘깁니다.</b> 그래도 확정하시겠습니까?
          </div>
        </div>
      )}
    </Modal>
  )
}

const briefingSignal = createScreenSignal()
const yearSignal = createScreenSignal()
let pickedYear: number | null = null

export const lectureMockup: Mockup = {
  Content,
  actions: (
    <>
      <select
        className="sel"
        style={{ width: 130 }}
        value=""
        onChange={(e) => {
          if (e.target.value === '') return
          pickedYear = Number(e.target.value)
          yearSignal.bump()
        }}
      >
        <option value="">기간 선택 ▾</option>
        {[-1, 0, 1].map((d) => (
          <option key={d} value={new Date().getFullYear() + d}>
            {new Date().getFullYear() + d}년 특강
          </option>
        ))}
      </select>
      <button className="btn" onClick={() => briefingSignal.bump()} title="설명회만 모아 봅니다. 줄을 누르면 신청 명단을 볼 수 있습니다">
        <Icon name="megaphone" size={14} /> 설명회 신청 관리
      </button>
    </>
  ),
}
