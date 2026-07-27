import { useMemo, useState } from 'react'
import {
  CopyButton,
  DataTable,
  ExcelButton,
  MaskToggle,
  PrintButton,
  SearchForm,
  type Column,
  type DateRangeValue,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS, type MockStudent } from './mockStudents'
import type { Mockup } from './types'

/* F-4.1-1 학원생 검색·조회
 * DSA 실사에서 확인된 12개 조건 검색필터를 SearchForm으로 재현하고,
 * 화면에 없어 '신규 요구사항'으로 분류된 정렬·검색조건 저장을 얹었다. */

const FIELDS: Field[] = [
  { type: 'text', name: 'keyword', label: '통합검색 (이름 · 학번 · 전화)', placeholder: '예: 이승민 / 2026-0001 / 5678', span: 2 },
  { type: 'select', name: 'branch', label: '지점', options: [
    { value: '분당', label: '분당' },
    { value: '대치', label: '대치' },
    { value: '평촌', label: '평촌' },
  ] },
  { type: 'select', name: 'year', label: '연도', options: [
    { value: '2026', label: '2026' },
    { value: '2025', label: '2025' },
  ] },
  { type: 'chips', name: 'track', label: '계열', options: ['자연', '인문'] },
  { type: 'chips', name: 'repeat', label: '재수 구분', options: ['재수', '삼수', 'N수'], multiple: true },
  { type: 'select', name: 'classNo', label: '반', options: ['1반', '2반', '3반', '4반'].map((v) => ({ value: v, label: v })) },
  { type: 'select', name: 'teacher', label: '담임', options: ['이장원', '김유진', '최지원', '박서영', '정하람'].map((v) => ({ value: v, label: v })) },
  { type: 'select', name: 'school', label: '출신학교', options: ['태원고', '송림고', '유신고', '분당고', '보평고', '낙생고', '한솔고', '이매고'].map((v) => ({ value: v, label: v })) },
  { type: 'chips', name: 'status', label: '상태', options: ['재원', '휴원', '퇴원'], multiple: true },
  { type: 'dateRange', name: 'enrolled', label: '등원일', presets: true, span: 2 },
]

const STATUS_TONE: Record<MockStudent['status'], string> = {
  재원: 'verified',
  휴원: 'supplement',
  퇴원: 'brandnew',
}

const COLUMNS: Column<MockStudent>[] = [
  { key: 'studentNo', header: '학번', width: '104px', sortable: true, value: (r) => r.studentNo },
  {
    key: 'name',
    header: '이름',
    width: '92px',
    sortable: true,
    mask: 'name',
    value: (r) => r.name,
    render: (_r, shown) => <b style={{ fontWeight: 700 }}>{shown}</b>,
  },
  { key: 'branch', header: '지점', width: '64px', align: 'center', sortable: true, value: (r) => r.branch },
  { key: 'track', header: '계열', width: '64px', align: 'center', value: (r) => r.track },
  { key: 'repeat', header: '재수', width: '64px', align: 'center', value: (r) => r.repeat },
  { key: 'classNo', header: '반', width: '58px', align: 'center', sortable: true, value: (r) => r.classNo },
  { key: 'seat', header: '좌석', width: '68px', align: 'center', value: (r) => r.seat },
  { key: 'school', header: '출신학교', width: '90px', value: (r) => r.school },
  { key: 'teacher', header: '담임', width: '72px', value: (r) => r.teacher },
  { key: 'phone', header: '전화번호', width: '128px', mask: 'phone', value: (r) => r.phone },
  { key: 'birth', header: '생년월일', width: '104px', mask: 'birth', sortable: true, value: (r) => r.birth },
  { key: 'enrolledAt', header: '등원일', width: '100px', sortable: true, value: (r) => r.enrolledAt },
  {
    key: 'status',
    header: '상태',
    width: '72px',
    align: 'center',
    value: (r) => r.status,
    render: (r) => <span className={`mk ${STATUS_TONE[r.status]}`}>{r.status}</span>,
  },
]

function matches(s: MockStudent, q: SearchValues): boolean {
  const kw = String(q.keyword ?? '').trim()
  if (kw && !`${s.name}${s.studentNo}${s.phone}`.includes(kw)) return false

  for (const key of ['branch', 'classNo', 'teacher', 'school'] as const) {
    const v = q[key]
    if (typeof v === 'string' && v && s[key] !== v) return false
  }

  const track = q.track
  if (typeof track === 'string' && track && s.track !== track) return false

  const repeat = q.repeat
  if (Array.isArray(repeat) && repeat.length > 0 && !repeat.includes(s.repeat)) return false

  const status = q.status
  if (Array.isArray(status) && status.length > 0 && !status.includes(s.status)) return false

  const enrolled = q.enrolled as DateRangeValue | undefined
  if (enrolled?.from && s.enrolledAt < enrolled.from) return false
  if (enrolled?.to && s.enrolledAt > enrolled.to) return false

  return true
}

function Content() {
  const [query, setQuery] = useState<SearchValues>({})
  const [selected, setSelected] = useState<string[]>([])
  const [masked, setMasked] = useState(true)

  const rows = useMemo(() => MOCK_STUDENTS.filter((s) => matches(s, query)), [query])

  return (
    <>
      <SearchForm fields={FIELDS} onSearch={setQuery} presetKey="student-search" />

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        masked={masked}
        pageSize={15}
        countLabel={
          <>
            검색결과 <b>{rows.length}</b>건 / 전체 {MOCK_STUDENTS.length}건
          </>
        }
        toolbar={
          <>
            {selected.length > 0 && (
              <button className="btn">
                <Icon name="users" size={14} /> 선택 {selected.length}건 반 배정
              </button>
            )}
            <MaskToggle masked={masked} onChange={setMasked} />
            <CopyButton columns={COLUMNS} rows={rows} masked={masked} />
            <ExcelButton filename="재원생_명부" columns={COLUMNS} rows={rows} masked={masked} />
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
