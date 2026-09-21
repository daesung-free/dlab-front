import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CopyButton,
  DataTable,
  MaskToggle,
  Modal,
  PrintButton,
  SearchForm,
  useServerTable,
  type Column,
  type DateRangeValue,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import {
  GRADE_LABEL,
  SORTABLE,
  STATUS_LABEL,
  TRACK_LABEL,
  retakeLabel,
  changeStudentStatus,
  listStatusLogs,
  reEnrollStudent,
  getStudent,
  updateStudent,
  type StatusLog,
  type StudentUpdateRequest,
  exportStudents,
  searchStudents,
  type EnrollmentStatus,
  type GradeType,
  type Student,
  type TrackType,
} from '../../api/students'
import {
  assignStudentsToClass,
  listClasses,
  type BulkAssignResult,
  type ClassGroup,
} from '../../api/classes'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.1-1 학원생 검색·조회 — GET /api/v1/admin/students
 *
 * ★ 다른 화면을 붙일 때 이 파일을 본뜬다. 목록 화면이 필요로 하는 것이 전부 들어 있다:
 *   검색조건 → 서버 파라미터 변환 → useServerTable → DataTable(서버 페이징·정렬) → 마스킹.
 *
 * ★ 지점은 **안 고르면 전 지점**이다. 다른 화면과 달리 본사 계정이 안 보내도 400 이 아니라,
 *   TopNav 에서 고른 지점이 있을 때만 좁힌다. 지점 컬럼은 그래서 계속 띄운다.
 *
 * ★ 서버가 안 주는 컬럼은 지우지 않고 <Unfilled/> 로 둔다(CLAUDE.md 1). */

const PAGE_SIZE = 20

/** 기본 조회 조건. 폼과 조회가 같은 값을 써야 화면과 결과가 어긋나지 않는다 */
/** UTC instant → 한국 날짜. 문자열을 자르면 자정 근처 기록이 하루 밀린다 */
function logDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const DEFAULT_QUERY: SearchValues = { status: 'ENROLLED' }

const FIELDS: Field[] = [
  { type: 'text', name: 'keyword', label: '통합검색 (이름 · 학번 · 전화)', placeholder: '예: 임민주 / 2026-0001 / 8760', span: 2 },
  { type: 'select', name: 'year', label: '연도', options: [
    { value: '2026', label: '2026' },
    { value: '2025', label: '2025' },
  ] },
  { type: 'select', name: 'grade', label: '학년', options: (['HIGH2', 'HIGH3', 'N_SU'] as GradeType[]).map((v) => ({ value: v, label: GRADE_LABEL[v] })) },
  // chips 는 options 가 string[] 이라 표시 라벨과 서버 enum 코드를 함께 실을 수 없다 → select
  { type: 'select', name: 'track', label: '계열', options: (['SCIENCE', 'HUMANITIES', 'ART', 'COMMON'] as TrackType[]).map((v) => ({ value: v, label: TRACK_LABEL[v] })) },
  { type: 'select', name: 'status', label: '상태', options: (['ENROLLED', 'LEAVE', 'WITHDRAWN', 'EXPELLED', 'GRADUATED'] as EnrollmentStatus[]).map((v) => ({ value: v, label: STATUS_LABEL[v] })) },
  { type: 'text', name: 'schoolName', label: '출신학교', placeholder: '예: 분당고' },
  { type: 'dateRange', name: 'admitted', label: '등원일', presets: true, span: 2 },
]

const STATUS_TONE: Record<EnrollmentStatus, string> = {
  ENROLLED: 'verified',
  LEAVE: 'supplement',
  WITHDRAWN: 'brandnew',
  EXPELLED: 'brandnew',
  GRADUATED: 'verified',
}

/** 정렬 가능 표시는 서버가 받아주는 키(SORTABLE)에만 붙인다 — 그 밖은 조용히 무시된다 */
const sortableKey = (key: string): boolean => (SORTABLE as readonly string[]).includes(key)

const COLUMNS: Column<Student>[] = [
  { key: 'studentNo', header: '학번', width: '104px', sortable: sortableKey('studentNo'), value: (r) => r.studentNo ?? '-' },
  {
    key: 'name',
    header: '이름',
    width: '92px',
    sortable: sortableKey('name'),
    mask: 'name',
    value: (r) => r.name,
    render: (_r, shown) => <b style={{ fontWeight: 700 }}>{shown}</b>,
  },
  { key: 'academyName', header: '지점', width: '64px', align: 'center', value: (r) => r.academyName ?? '-' },
  { key: 'grade', header: '학년', width: '64px', align: 'center', sortable: sortableKey('grade'), value: (r) => GRADE_LABEL[r.grade] ?? r.grade },
  { key: 'track', header: '계열', width: '64px', align: 'center', sortable: sortableKey('track'), value: (r) => (r.track ? TRACK_LABEL[r.track] : '-') },
  { key: 'repeat', header: '재수', width: '64px', align: 'center', value: (r) => retakeLabel(r.retakeCount) },
  { key: 'className', header: '반', width: '58px', align: 'center', value: (r) => r.className ?? '-' },
  { key: 'seatCd', header: '좌석', width: '68px', align: 'center', value: (r) => r.seatCd ?? '-' },
  { key: 'schoolName', header: '출신학교', width: '90px', value: (r) => r.schoolName ?? '-' },
  { key: 'homeroomTeacher', header: '담임', width: '72px', value: (r) => r.homeroomTeacher ?? '-' },
  { key: 'phone', header: '전화번호', width: '128px', mask: 'phone', value: (r) => r.phone ?? '-' },
  { key: 'birthDate', header: '생년월일', width: '104px', mask: 'birth', value: (r) => r.birthDate ?? '-' },
  { key: 'admissionDate', header: '등원일', width: '100px', sortable: sortableKey('admissionDate'), value: (r) => r.admissionDate ?? '-' },
  {
    key: 'enrollmentStatus',
    header: '상태',
    width: '72px',
    align: 'center',
    sortable: sortableKey('enrollmentStatus'),
    value: (r) => STATUS_LABEL[r.enrollmentStatus] ?? r.enrollmentStatus,
    render: (r, shown) => <span className={`mk ${STATUS_TONE[r.enrollmentStatus] ?? ''}`}>{shown}</span>,
  },

]

/** SearchForm 값(문자열·배열·기간 혼재)에서 단일 문자열만 꺼낸다. 빈 값은 client 가 뺀다 */
function one(v: unknown): string | undefined {
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : undefined
  if (typeof v === 'string' && v !== '') return v
  return undefined
}


/* ── 학생 정보 수정 폼 ─────────────────────────────────────────── */

const INFO_KEYS = ['name', 'phone', 'birthDate', 'gender', 'schoolName', 'address', 'grade', 'track'] as const
type InfoKey = (typeof INFO_KEYS)[number]

const INFO_FIELDS: { key: InfoKey; label: string; max?: number; placeholder?: string; hint?: string }[] = [
  { key: 'name', label: '이름', max: 30 },
  { key: 'phone', label: '연락처', max: 20, placeholder: '010-0000-0000' },
  { key: 'birthDate', label: '생년월일' },
  {
    key: 'gender',
    label: '성별',
    /* 서버가 저장은 하는데 돌려주지 않는다 — 비어 보이는 게 '미입력' 이 아니다 */
    hint: '저장된 값을 불러올 수 없어 비어 보입니다. 바꿀 때만 고르세요.',
  },
  { key: 'schoolName', label: '출신학교', max: 40 },
  { key: 'address', label: '주소', max: 120, hint: '칸을 비우고 저장하면 저장된 값이 지워집니다.' },
  { key: 'grade', label: '학년' },
  { key: 'track', label: '계열' },
]

function emptyInfo(): Record<InfoKey, string> {
  return { name: '', phone: '', birthDate: '', gender: '', schoolName: '', address: '', grade: '', track: '' }
}

function infoOf(s: Student): Record<InfoKey, string> {
  return {
    name: s.name ?? '',
    phone: s.phone ?? '',
    birthDate: s.birthDate ?? '',
    gender: '',
    schoolName: s.schoolName ?? '',
    address: s.address ?? '',
    grade: s.grade ?? '',
    track: s.track ?? '',
  }
}

function Content() {
  const { academyId } = useAcademy()
  /* 상태를 안 고르면 **재원생**이다. 비워두면 휴원·퇴원생이 첫 쪽에 섞여 들어와
   * "재원생 명부"를 뽑는 기본 용도와 어긋난다. 전체를 보려면 '전체'를 고르면 된다 */
  /* 기본은 재원생만 본다 — 평소 명단에 휴원·퇴원이 섞이면 안 된다.
     ★ 그 값을 **폼에도 채운다.** 예전에는 query 에만 넣어서, 검색 칸은 '전체'인데
       실제로는 재원만 조회됐다 — 퇴원으로 바꾼 학생이 어디서도 안 보인다는 말이 나왔다. */
  const [query, setQuery] = useState<SearchValues>(DEFAULT_QUERY)
  const [selected, setSelected] = useState<string[]>([])

  /* ── 선택 건 반 배정 ── */
  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [assign, setAssign] = useState<{ classId: string } | null>(null)
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignErr, setAssignErr] = useState<string | null>(null)
  const [assignResult, setAssignResult] = useState<BulkAssignResult | null>(null)

  /**
   * 반 목록은 배정 모달의 드롭다운에 쓴다. 지점이 바뀌면 다시 읽는다.
   *
   * ★ **연도를 반드시 넘긴다.** 안 넘기면 전 연도가 섞여 와서 「고3 1반」이 두 번 뜨고,
   *   다음 해 반을 고르면 **전원이 실패한다** — 서버가 "학생의 등록 연도와 반의 연도가
   *   다릅니다" 로 건별로 거절한다. 실측으로 3명 모두 실패했다(2026-09-16).
   */
  useEffect(() => {
    if (academyId === null) {
      setClasses([])
      return
    }
    let cancelled = false
    listClasses(new Date().getFullYear(), academyId)
      .then((l) => !cancelled && setClasses(l))
      .catch(() => !cancelled && setClasses([]))
    return () => {
      cancelled = true
    }
  }, [academyId])

  /**
   * 선택한 학생을 한 반에 넣는다.
   *
   * ★ 서버가 **건별 결과**를 준다. 한 명이 틀렸다고 전부 되돌리지 않으므로
   *   "몇 명이 됐고 누가 안 됐는지"를 그대로 보여준다 — 뭉뚱그리면 다시 눌러
   *   이미 들어간 학생을 또 넣으려 한다.
   *
   * ★ **정원을 넘겨도 배정된다.** 정원 초과가 필요한 운영이 실제로 있어 서버가 막지 않고
   *   `overCapacity` 로 알린다. 경고는 화면이 띄운다.
   */
  async function runAssign() {
    if (!assign) return
    setAssignBusy(true)
    setAssignErr(null)
    try {
      const res = await assignStudentsToClass(Number(assign.classId), selected.map(Number))
      setAssign(null)
      setAssignResult(res)
      /* 배정된 학생은 더 이상 그 선택으로 할 일이 없다 — 남겨두면 또 누르게 된다 */
      setSelected([])
      table.reload()
    } catch (err) {
      setAssignErr(err instanceof ApiError ? err.message : '배정하지 못했습니다.')
    } finally {
      setAssignBusy(false)
    }
  }
  const [masked, setMasked] = useState(true)

  // ★ useMemo 필수 — 매 렌더 새 객체를 넘기면 useServerTable 이 무한 요청한다
  const params = useMemo(() => {
    const admitted = query.admitted as DateRangeValue | undefined
    const year = one(query.year)
    return {
      keyword: one(query.keyword),
      year: year ? Number(year) : undefined,
      grade: one(query.grade) as GradeType | undefined,
      track: one(query.track) as TrackType | undefined,
      status: one(query.status) as EnrollmentStatus | undefined,
      schoolName: one(query.schoolName),
      admittedFrom: admitted?.from || undefined,
      admittedTo: admitted?.to || undefined,
      academyId: academyId ?? undefined,
    }
  }, [query, academyId])

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [changing, setChanging] = useState<number | null>(null)
  /* 상태 변경 모달. 예전에는 window.prompt 두 번이었는데 값을 못 받는 환경이 있어
     눌러도 아무 일이 없었다 — 무엇보다 이 레포는 prompt 를 전부 걷어낸 상태다 */
  /* ★ `next` 가 처음에 비어 있다. 예전에는 'WITHDRAWN' 을 기본값으로 뒀는데, 아무것도 안
       고르고 [변경] 을 누르면 **가장 위험한 퇴원이 그대로 저장됐다.** 퇴원은 되돌릴 수 없다 —
       서버가 재원 복귀를 막고("재등록으로 처리하세요") 재등록하면 학번이 새로 매겨진다. */
  const [statusEdit, setStatusEdit] = useState<{
    row: Student
    next: EnrollmentStatus | ''
    reason: string
  } | null>(null)
  const [statusErr, setStatusErr] = useState<string | null>(null)
  /* 지난 변경 기록. 모달을 열 때 같이 읽는다 — 왜 퇴원했는지 그 자리에서 봐야 판단이 된다 */
  const [logs, setLogs] = useState<StatusLog[] | null>(null)

  /**
   * 재등록 — 퇴원한 학생을 **새 기수로 다시 들인다.**
   *
   * ★ 상태를 재원으로 되돌리는 게 아니다. 서버가 `WITHDRAWN → ENROLLED` 를 막고
   *   "재등록으로 처리하세요"라고 답한다.
   * ★ **학번이 새로 매겨진다.** 지금 학번은 퇴원 이력으로 남는다 — 되돌릴 수 없으므로
   *   모달에서 먼저 알린다.
   */
  /**
   * 학생 정보 수정.
   *
   * ★ **여는 순간 상세를 다시 읽는다.** 목록 값은 서버가 가려서 준다(`010-****-3153`).
   *   그걸 입력칸에 채우면 가린 값이 **그대로 저장된다.** 상세는 원본을 준다.
   * ★ **바뀐 칸만 보낸다.** 서버는 빈 문자열을 받으면 그 값을 지운다 — 폼 전체를 보내면
   *   손대지 않은 칸까지 건드리게 된다.
   * ★ 재원 상태는 여기서 안 바꾼다. 사유를 받고 이력을 남기는 '상태 변경' 이 따로 있다.
   */
  const [infoEdit, setInfoEdit] = useState<{
    row: Student
    loaded: Student | null
    form: Record<InfoKey, string>
  } | null>(null)
  const [infoBusy, setInfoBusy] = useState(false)
  const [infoErr, setInfoErr] = useState<string | null>(null)
  const [infoDone, setInfoDone] = useState<string | null>(null)

  function openInfo(r: Student) {
    setInfoErr(null)
    setInfoDone(null)
    setInfoEdit({ row: r, loaded: null, form: emptyInfo() })
    void getStudent(r.enrollmentId)
      .then((d) => setInfoEdit((cur) => (cur && cur.row.enrollmentId === r.enrollmentId ? { ...cur, loaded: d, form: infoOf(d) } : cur)))
      .catch((e) => setInfoErr(e instanceof ApiError ? e.message : '학생 정보를 불러오지 못했습니다.'))
  }

  async function submitInfo() {
    if (!infoEdit?.loaded) return
    const before = infoOf(infoEdit.loaded)
    const body: StudentUpdateRequest = {}
    for (const k of INFO_KEYS) {
      const v = infoEdit.form[k].trim()
      /* 성별은 서버가 돌려주지 않아 '전' 값을 모른다 — 고른 경우에만 보낸다 */
      if (k === 'gender') {
        if (v !== '') body.gender = v
        continue
      }
      if (v !== before[k].trim()) (body as Record<string, string>)[k] = v
    }
    if (Object.keys(body).length === 0) {
      setInfoEdit(null)
      return
    }
    setInfoBusy(true)
    setInfoErr(null)
    try {
      await updateStudent(infoEdit.loaded.enrollmentId, body)
      table.reload()
      setInfoDone(`${infoEdit.loaded.name} 학생 정보를 고쳤습니다.`)
      setInfoEdit(null)
    } catch (e) {
      setInfoErr(e instanceof ApiError ? e.message : '저장하지 못했습니다.')
    } finally {
      setInfoBusy(false)
    }
  }

  const [reEnroll, setReEnroll] = useState<{ row: Student; year: string; grade: GradeType } | null>(null)
  const [reBusy, setReBusy] = useState(false)
  const [reErr, setReErr] = useState<string | null>(null)
  const [reDone, setReDone] = useState<string | null>(null)

  async function submitReEnroll() {
    if (!reEnroll || academyId === null) return
    setReBusy(true)
    setReErr(null)
    try {
      const res = await reEnrollStudent(reEnroll.row.enrollmentId, {
        academyId,
        year: Number(reEnroll.year),
        grade: reEnroll.grade,
      })
      table.reload()
      setReEnroll(null)
      /* 새 학번을 알려준다 — 바뀐 값을 모르면 목록에서 못 찾는다 */
      setReDone(`재등록했습니다. 새 학번은 ${res.studentNo ?? '(발급 중)'} 입니다.`)
    } catch (err) {
      setReErr(err instanceof ApiError ? err.message : '재등록하지 못했습니다.')
    } finally {
      setReBusy(false)
    }
  }

  const table = useServerTable({
    fetcher: searchStudents,
    params,
    pageSize: PAGE_SIZE,
    sortable: SORTABLE,
  })

  // 서버가 이미 가려서 보낸 경우(masked=true) 프론트에서 또 가리지 않는다 — 이중 마스킹이 된다.
  // 서버 마스킹은 권한에 따라 결정되므로 사용자가 토글로 풀 수 없다.
  const columns = useMemo<Column<Student>[]>(
    () => [
      ...COLUMNS,
      {
        key: 'act',
        header: '',
        width: '84px',
        align: 'center',
        value: () => '',
        // 삭제가 아니라 상태 변경이다 — 이력이 붙은 학생은 서버가 삭제를 막는다
        render: (r) => (
          <button
            className="btn"
            /* ★ 줄바꿈을 막는다 — '정보 수정' 칸이 생기면서 좁아져 '상/태/변/경' 으로 눌렸다 */
            style={{ padding: '4px 9px', fontSize: 11.5, whiteSpace: 'nowrap' }}
            disabled={changing === r.enrollmentId}
            title="퇴원·제적·휴원으로 바꿉니다. 삭제는 이력 때문에 막혀 있습니다"
            onClick={(e) => {
              /* 줄을 누르면 정보 수정이 열린다 — 이 버튼 클릭이 줄로 번지면 모달이 둘 뜬다 */
              e.stopPropagation()
              setStatusErr(null)
              setStatusEdit({ row: r, next: '', reason: '' })
              setLogs(null)
              void listStatusLogs(r.enrollmentId)
                .then(setLogs)
                /* 이력을 못 읽어도 상태 변경 자체는 되게 둔다 — 빈 배열로 넘긴다 */
                .catch(() => setLogs([]))
            }}
          >
            상태 변경
          </button>
        ),
      },
      {
        /* ★ 퇴원·제적한 학생에게만 뜬다. 상태를 되돌리는 게 아니라 새 기수로 다시 들이는 것이다 */
        key: 're',
        header: '',
        width: '76px',
        align: 'center',
        value: () => '',
        render: (r) =>
          r.enrollmentStatus === 'WITHDRAWN' || r.enrollmentStatus === 'EXPELLED' ? (
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5, whiteSpace: 'nowrap' }}
              onClick={(e) => {
                e.stopPropagation()
                setReErr(null)
                setReDone(null)
                setReEnroll({ row: r, year: String(new Date().getFullYear()), grade: r.grade })
              }}
            >
              재등록
            </button>
          ) : null,
      },
    ],
    [changing],
  )

  const serverMasked = table.rows.some((r) => r.masked)
  const effectiveMasked = serverMasked ? false : masked

  /**
   * 재원 상태 변경 — **삭제 대신 쓰는 경로다.**
   *
   * 이력이 붙은 학생은 서버가 삭제를 막는다(409 STUDENT_HAS_HISTORY). 잘못 만든 학생을
   * 되돌릴 수단이 이것뿐이라, 이 화면에 없으면 명단에 영구히 남는다.
   */
  /**
   * 재원 상태 변경 — **삭제 대신 쓰는 경로다.**
   *
   * 이력이 붙은 학생은 서버가 삭제를 막는다(409 STUDENT_HAS_HISTORY). 잘못 만든 학생을
   * 되돌릴 수단이 이것뿐이라, 이 화면에 없으면 명단에 영구히 남는다.
   *
   * ★ 예전에는 `window.prompt` 를 두 번 띄웠다. 값을 못 받는 환경에서는 즉시 null 이 되어
   *   **눌러도 아무 일이 없다** — 요청도 안 나가고 화면도 안 바뀌어 고장으로 읽힌다.
   *   이 레포는 같은 이유로 prompt·confirm 을 전부 모달로 걷어냈다(Modal.tsx 주석).
   */
  async function submitStatus() {
    if (!statusEdit) return
    const { row, next, reason } = statusEdit
    if (!next || !reason.trim()) return
    setChanging(row.enrollmentId)
    setStatusErr(null)
    try {
      await changeStudentStatus(row.enrollmentId, next, reason.trim())
      table.reload()
      setStatusEdit(null)
    } catch (err) {
      /* 모달을 닫지 않는다 — 사유를 다시 쓰게 하면 안 된다 */
      setStatusErr(err instanceof ApiError ? err.message : '상태를 바꾸지 못했습니다.')
    } finally {
      setChanging(null)
    }
  }

  async function exportExcel() {
    setExporting(true)
    setExportError(null)
    try {
      await exportStudents(params, '재원생_명부.xlsx')
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : '엑셀을 내보내지 못했습니다.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      {statusEdit && (
        <Modal
          title="재원 상태 변경"
          sub={`${statusEdit.row.name}(${statusEdit.row.studentNo ?? '-'}) 의 상태를 바꿉니다.`}
          confirmLabel="변경"
          busy={changing !== null}
          error={statusErr}
          danger
          /* 되돌릴 수 없는 동작이라 둘 다 받기 전에는 못 누른다.
             사유는 이력에 남는 유일한 설명이라 비워두면 나중에 왜 바꿨는지 알 길이 없다 */
          confirmDisabled={statusEdit.next === '' || statusEdit.reason.trim() === ''}
          onConfirm={() => void submitStatus()}
          onClose={() => setStatusEdit(null)}
        >
          <div className="frow">
            <label className="req">바꿀 상태</label>
            <select
              className="sel"
              value={statusEdit.next}
              onChange={(e) => setStatusEdit({ ...statusEdit, next: e.target.value as EnrollmentStatus | '' })}
            >
              <option value="">선택하세요</option>
              {/* ★ 지금과 같은 상태는 빼둔다. 서버가 "이미 같은 상태입니다"로 거절하는데,
                     고를 수 있게 두면 그 오류를 보고서야 안다. */}
              {(['ENROLLED', 'LEAVE', 'WITHDRAWN', 'EXPELLED', 'GRADUATED'] as EnrollmentStatus[])
                .filter((v) => v !== statusEdit.row.enrollmentStatus)
                .map((v) => (
                  <option key={v} value={v}>
                    {STATUS_LABEL[v]}
                  </option>
                ))}
            </select>
          </div>
          <div className="frow">
            <label className="req">사유</label>
            <div>
              <input
                className="inp"
                value={statusEdit.reason}
                placeholder="예: 타 지점 이동"
                onChange={(e) => setStatusEdit({ ...statusEdit, reason: e.target.value })}
              />
              <div className="hint">이력에 남는 유일한 설명입니다.</div>
            </div>
          </div>

          {/* ★ 되돌릴 수 없다는 것을 고른 뒤에 알린다. 퇴원·제적은 서버가 재원 복귀를 막고,
                 재등록하면 학번이 새로 매겨져 원래 학번이 사라진다. */}
          {(statusEdit.next === 'WITHDRAWN' || statusEdit.next === 'EXPELLED') && (
            <div className="note-box risk">
              <div className="ic">
                <Icon name="alert-triangle" size={17} />
              </div>
              <div>
                <div className="tt">되돌릴 수 없습니다</div>
                <div className="tx">
                  재원으로 되돌릴 수 없고 <b>재등록해야 합니다.</b> 그러면 학번이 새로 매겨져 지금 학번은
                  사라집니다.
                </div>
              </div>
            </div>
          )}

          {/* ★ 지난 기록을 같이 보여준다. 왜 휴원했는지 모르면 무엇으로 바꿀지 판단할 수 없다 */}
          <div style={{ marginTop: 14 }}>
            <div className="fs-title" style={{ marginBottom: 6 }}>
              지난 변경 기록
            </div>
            {logs === null ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>불러오는 중…</div>
            ) : logs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>변경된 적이 없습니다.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {logs.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '96px 132px 1fr',
                      gap: 8,
                      fontSize: 12,
                      alignItems: 'baseline',
                    }}
                  >
                    <span style={{ color: 'var(--muted)' }}>{logDay(g.changedAt)}</span>
                    <span>
                      {g.fromStatus ? (STATUS_LABEL[g.fromStatus] ?? g.fromStatus) : '신규'}
                      {' → '}
                      <b>{STATUS_LABEL[g.toStatus] ?? g.toStatus}</b>
                    </span>
                    <span style={{ color: 'var(--ink-2)' }}>
                      {g.reason || <span style={{ color: 'var(--muted)' }}>사유 없음</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {reEnroll && (
        <Modal
          title="재등록"
          sub={`${reEnroll.row.name}(${reEnroll.row.studentNo ?? '-'}) 을(를) 새 기수로 다시 등록합니다.`}
          confirmLabel="재등록"
          danger
          busy={reBusy}
          error={reErr}
          confirmDisabled={academyId === null || reEnroll.year.trim() === ''}
          onConfirm={() => void submitReEnroll()}
          onClose={() => setReEnroll(null)}
        >
          {/* ★ 되돌릴 수 없다. 학번이 바뀌는 것을 누르기 전에 알아야 한다 */}
          <div className="note-box risk">
            <div className="ic">
              <Icon name="alert-triangle" size={17} />
            </div>
            <div>
              <div className="tt">학번이 새로 매겨집니다</div>
              <div className="tx">
                지금 학번 <b>{reEnroll.row.studentNo ?? '-'}</b> 은 퇴원 이력으로 남고, 새 학번을 받습니다.
                되돌릴 수 없습니다.
              </div>
            </div>
          </div>

          <div className="frow">
            <label className="req">연도</label>
            <input
              className="inp"
              type="number"
              value={reEnroll.year}
              onChange={(e) => setReEnroll({ ...reEnroll, year: e.target.value })}
            />
          </div>
          <div className="frow">
            <label className="req">학년 구분</label>
            <select
              className="sel"
              value={reEnroll.grade}
              onChange={(e) => setReEnroll({ ...reEnroll, grade: e.target.value as GradeType })}
            >
              {(Object.keys(GRADE_LABEL) as GradeType[]).map((g) => (
                <option key={g} value={g}>
                  {GRADE_LABEL[g]}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {infoEdit && (
        <Modal
          wide
          title={`${infoEdit.loaded?.name ?? infoEdit.row.name} 학생 정보`}
          sub={infoEdit.loaded ? `${infoEdit.loaded.studentNo ?? '학번 없음'} · ${infoEdit.loaded.academyName ?? ''}` : '불러오는 중…'}
          confirmLabel="저장"
          busy={infoBusy}
          error={infoErr}
          confirmDisabled={!infoEdit.loaded || infoEdit.form.name.trim() === ''}
          onConfirm={() => void submitInfo()}
          onClose={() => setInfoEdit(null)}
        >
          {infoEdit.loaded === null ? (
            <div style={{ padding: 18, color: 'var(--muted)' }}>불러오는 중…</div>
          ) : (
            <>
              {INFO_FIELDS.map((f) => (
                <div className="frow" key={f.key}>
                  <label className={f.key === 'name' ? 'req' : undefined}>{f.label}</label>
                  <div>
                    {f.key === 'grade' ? (
                      <select
                        className="sel"
                        value={infoEdit.form.grade}
                        onChange={(e) => setInfoEdit({ ...infoEdit, form: { ...infoEdit.form, grade: e.target.value } })}
                      >
                        {(Object.keys(GRADE_LABEL) as GradeType[]).map((g) => (
                          <option key={g} value={g}>
                            {GRADE_LABEL[g]}
                          </option>
                        ))}
                      </select>
                    ) : f.key === 'track' ? (
                      <select
                        className="sel"
                        value={infoEdit.form.track}
                        onChange={(e) => setInfoEdit({ ...infoEdit, form: { ...infoEdit.form, track: e.target.value } })}
                      >
                        <option value="">미정</option>
                        {(Object.keys(TRACK_LABEL) as TrackType[]).map((t) => (
                          <option key={t} value={t}>
                            {TRACK_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    ) : f.key === 'gender' ? (
                      <select
                        className="sel"
                        value={infoEdit.form.gender}
                        onChange={(e) => setInfoEdit({ ...infoEdit, form: { ...infoEdit.form, gender: e.target.value } })}
                      >
                        <option value="">바꾸지 않음</option>
                        <option value="M">남</option>
                        <option value="F">여</option>
                      </select>
                    ) : (
                      <input
                        className="inp"
                        type={f.key === 'birthDate' ? 'date' : 'text'}
                        maxLength={f.max}
                        placeholder={f.placeholder}
                        value={infoEdit.form[f.key]}
                        onChange={(e) =>
                          setInfoEdit({ ...infoEdit, form: { ...infoEdit.form, [f.key]: e.target.value } })
                        }
                      />
                    )}
                    {f.hint && <div className="hint">{f.hint}</div>}
                  </div>
                </div>
              ))}
            </>
          )}
        </Modal>
      )}

      {infoDone && (
        <div className="note-box plain" role="status">
          <div className="ic">
            <Icon name="check" size={17} />
          </div>
          <div style={{ flex: 1 }}>{infoDone}</div>
          <button className="btn" onClick={() => setInfoDone(null)}>
            닫기
          </button>
        </div>
      )}

      {reDone && (
        <div className="note-box plain" role="status">
          <div className="ic">
            <Icon name="check" size={17} />
          </div>
          <div style={{ flex: 1 }}>{reDone}</div>
          <button className="btn" onClick={() => setReDone(null)}>
            닫기
          </button>
        </div>
      )}

      <SearchForm fields={FIELDS} onSearch={setQuery} initial={DEFAULT_QUERY} presetKey="student-search" />

      {exportError && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {exportError}
        </div>
      )}

      {table.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {table.error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={table.rows}
        rowKey={(r) => String(r.enrollmentId)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        masked={effectiveMasked}
        loading={table.loading}
        serverPaging={table.serverPaging}
        /* ★ 줄을 누르면 정보 수정이 열린다. 버튼 칸을 따로 두면 표 폭이 그대로라 데이터 칸이
             좁아져 '분/당' · 'N/수/2/반' 처럼 세로로 쪼개졌다 */
        onRowClick={openInfo}
        countLabel={
          <>
            검색결과 <b>{table.totalElements}</b>건
            <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--muted)' }}>줄을 누르면 정보를 고칠 수 있습니다</span>
          </>
        }
        toolbar={
          <>
            {selected.length > 0 && (
              <button
                className="btn"
                disabled={academyId === null}
                title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
                onClick={() => {
                  setAssignErr(null)
                  setAssign({ classId: String(classes[0]?.id ?? '') })
                }}
              >
                <Icon name="users" size={14} /> 선택 {selected.length}건 반 배정
              </button>
            )}
            {serverMasked ? (
              <span className="dt-count" style={{ color: 'var(--muted)' }}>
                권한상 마스킹됨
              </span>
            ) : (
              <MaskToggle masked={masked} onChange={setMasked} />
            )}
            {/* 복사는 눈에 보이는 쪽을 옮기는 용도라 현재 쪽 그대로 둔다 */}
            <CopyButton columns={COLUMNS} rows={table.rows} masked={effectiveMasked} />
            {/* ★ 엑셀은 서버가 만든다 — 화면에서 만들면 보고 있는 쪽(20건)만 담긴다.
                마스킹 해제 권한도 서버가 판단한다(파일은 회수가 안 된다) */}
            <button className="btn" disabled={exporting} onClick={() => void exportExcel()}>
              <Icon name="download" size={14} /> {exporting ? '내보내는 중…' : '엑셀'}
            </button>
            <PrintButton />
          </>
        }
      />

      {/* ── 선택 건 반 배정 ── */}
      {assign && (
        <Modal
          title="선택한 학생 반 배정"
          sub={`${selected.length}명을 한 반에 넣습니다.`}
          confirmLabel="배정"
          busy={assignBusy}
          error={assignErr}
          confirmDisabled={assign.classId === ''}
          onConfirm={() => void runAssign()}
          onClose={() => setAssign(null)}
        >
          <div className="frow">
            <label className="req">반</label>
            <div>
              <select
                className="sel"
                value={assign.classId}
                onChange={(e) => setAssign({ classId: e.target.value })}
              >
                {classes.length === 0 && <option value="">등록된 반이 없습니다</option>}
                {classes.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} ({c.memberCount ?? 0}/{c.capacity ?? '정원 없음'})
                  </option>
                ))}
              </select>
              {/* 서버가 정원 초과를 막지 않는다. 미리 알려 두면 결과 화면에서 덜 놀란다 */}
              <div className="hint">정원을 넘겨도 배정됩니다. 넘기면 결과에 알려 드립니다.</div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 배정 결과 ── */}
      {/* ★ 건별 결과를 그대로 보여준다. "3명 배정" 만 쓰면 못 들어간 학생을 모른 채
             다시 눌러 이미 들어간 학생을 또 넣으려 한다 */}
      {assignResult && (
        <Modal
          title="배정 결과"
          hideCancel
          confirmLabel="닫기"
          onConfirm={() => setAssignResult(null)}
          onClose={() => setAssignResult(null)}
        >
          {assignResult.overCapacity && (
            <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
              <div className="ic">
                <Icon name="triangle-alert" size={17} />
              </div>
              <div>
                <div className="tt">정원을 넘겼습니다</div>
                <div className="tx">
                  지금 <b>{assignResult.memberCount}명</b>
                  {assignResult.capacity !== null && <> / 정원 {assignResult.capacity}명</>}. 배정은 됐습니다.
                </div>
              </div>
            </div>
          )}
          <div className="frow">
            <label>결과</label>
            <div style={{ fontSize: 13.5 }}>
              <b>{assignResult.assignedCount}명</b> 배정
              {assignResult.failedCount > 0 && (
                <span style={{ color: 'var(--red)' }}> · {assignResult.failedCount}명 실패</span>
              )}
            </div>
          </div>
          {assignResult.results.some((r) => r.status !== 'ASSIGNED') && (
            <div style={{ overflowX: 'auto' }}>
              <table className="dt">
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>사유</th>
                  </tr>
                </thead>
                <tbody>
                  {assignResult.results
                    .filter((r) => r.status !== 'ASSIGNED')
                    .map((r) => (
                      <tr key={r.enrollmentId}>
                        {/* 서버가 이름을 주지만 없을 때가 있다. 학번 대신 등록 id 를 보이면
                               누구인지 못 알아본다 — 그래도 아무것도 안 쓰는 것보단 낫다 */}
                        <td>{r.studentName ?? `등록 ${r.enrollmentId}`}</td>
                        <td style={{ color: 'var(--red)' }}>
                          {r.message ?? (r.status === 'DUPLICATE' ? '같은 요청에 두 번 들어왔습니다' : r.status)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

export const studentSearchMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled data-soon title="준비 중입니다">기수 선택 ▾</button>
      {/* 새 화면이 아니라 신규 접수 등록(F-4.1-3)으로 보내는 입구다 — 막아둘 이유가 없었다 */}
      <Link className="btn pri" to="/s/student-enroll">
        <Icon name="user-plus" size={14} /> 신규 접수 등록
      </Link>
    </>
  ),
}
