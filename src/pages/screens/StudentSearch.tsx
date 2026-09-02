import { useMemo, useState } from 'react'
import {
  CopyButton,
  DataTable,
  ExcelButton,
  MaskToggle,
  PrintButton,
  SearchForm,
  Unfilled,
  useServerTable,
  type Column,
  type DateRangeValue,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Icon } from '../../components/Icon'
import {
  GRADE_LABEL,
  SORTABLE,
  STATUS_LABEL,
  TRACK_LABEL,
  searchStudents,
  type EnrollmentStatus,
  type GradeType,
  type Student,
  type TrackType,
} from '../../api/students'
import type { Mockup } from './types'

/* F-4.1-1 학원생 검색·조회 — GET /api/v1/admin/students
 *
 * ★ 다른 화면을 붙일 때 이 파일을 본뜬다. 목록 화면이 필요로 하는 것이 전부 들어 있다:
 *   검색조건 → 서버 파라미터 변환 → useServerTable → DataTable(서버 페이징·정렬) → 마스킹.
 *
 * ★ 이 화면만 지점 선택을 쓰지 않는다. /students 는 academyId 를 받지 않고,
 *   전 지점 권한 계정에는 전 지점이 한 번에 온다(응답의 academyName 으로 구분).
 *   TopNav 에서 지점을 골라도 이 목록은 안 좁혀진다 — docs/API_GAPS.md 에 적어둔 미해결 건이다.
 *   다른 화면(출결·상벌점 등)은 useAcademy()의 academyId 를 파라미터로 넘겨야 한다.
 *
 * ★ 서버가 안 주는 컬럼은 지우지 않고 <Unfilled/> 로 둔다(CLAUDE.md 1).
 *   재수 구분이 그렇다 — grade 가 N_SU 까지라 N수 안에서 재수/삼수가 안 갈린다(API_GAPS 2-2). */

const PAGE_SIZE = 20

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
  {
    key: 'repeat',
    header: '재수',
    width: '64px',
    align: 'center',
    value: () => '',
    render: (r) => <Unfilled reason={`재수 구분이 없다 (현재 학년: ${GRADE_LABEL[r.grade] ?? r.grade})`} />,
  },
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

function Content() {
  const [query, setQuery] = useState<SearchValues>({})
  const [selected, setSelected] = useState<string[]>([])
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
    }
  }, [query])

  const table = useServerTable({
    fetcher: searchStudents,
    params,
    pageSize: PAGE_SIZE,
    sortable: SORTABLE,
  })

  // 서버가 이미 가려서 보낸 경우(masked=true) 프론트에서 또 가리지 않는다 — 이중 마스킹이 된다.
  // 서버 마스킹은 권한에 따라 결정되므로 사용자가 토글로 풀 수 없다.
  const serverMasked = table.rows.some((r) => r.masked)
  const effectiveMasked = serverMasked ? false : masked

  return (
    <>
      <SearchForm fields={FIELDS} onSearch={setQuery} presetKey="student-search" />

      {table.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {table.error}
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={table.rows}
        rowKey={(r) => String(r.enrollmentId)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        masked={effectiveMasked}
        loading={table.loading}
        serverPaging={table.serverPaging}
        countLabel={<>검색결과 <b>{table.totalElements}</b>건</>}
        toolbar={
          <>
            {selected.length > 0 && (
              <button className="btn">
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
            {/* ⚠️ 아래 내보내기는 현재 페이지(20건)만 담는다.
                전체는 GET /api/v1/admin/students/export 로 바꿔야 한다 */}
            <CopyButton columns={COLUMNS} rows={table.rows} masked={effectiveMasked} />
            <ExcelButton filename="재원생_명부" columns={COLUMNS} rows={table.rows} masked={effectiveMasked} />
            <PrintButton />
          </>
        }
      />
    </>
  )
}

export const studentSearchMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn pri">+ 신규 접수 등록</button>
    </>
  ),
}
