import { useMemo, useState } from 'react'
import {
  CopyButton,
  DataTable,
  ExcelButton,
  MaskToggle,
  PrintButton,
  SearchForm,
  type Column,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS, type MockStudent } from './mockStudents'
import type { Mockup } from './types'

/* F-4.9 교무업무 — 명단 조회·출력 — 신규개발-요구사항보완
 *
 * ⚠ #21 / I-1 (최우선) — 교무업무 '구분 항목' 재정의.
 *   DSA 화면에 (!!) 로 표기돼 있던 항목이고, 실행가이드 4시트가
 *   "I-1은 우회 불가(운영팀 확정 필수)"로 분류한 유일한 항목이다.
 *   Phase 2 착수 전 체크리스트에도 "선결조건 유일한 '개발착수전 필수' 항목"으로 적혀 있다.
 *
 *   → 따라서 '구분' 컬럼은 값을 지어내지 않고 미정 상태로 렌더한다. */

interface RosterRow extends MockStudent {
  /** 청구기수 */
  round: string
  address: string
  parentPhone: string
  scholarship: string
}

const ROWS: RosterRow[] = MOCK_STUDENTS.map((s, i) => ({
  ...s,
  round: `${(i % 3) + 1}기`,
  address: ['경기도 성남시 분당구 정자동 178', '서울특별시 강남구 대치동 943', '경기도 안양시 동안구 평촌동 22'][i % 3],
  parentPhone: `010-${String(2000 + ((i * 211) % 8000)).padStart(4, '0')}-${String(3000 + ((i * 97) % 7000)).padStart(4, '0')}`,
  scholarship: i % 6 === 5 ? '수능100' : i % 9 === 8 ? '평가원50' : '-',
}))

const FIELDS: Field[] = [
  { type: 'select', name: 'round', label: '청구기수', options: ['1기', '2기', '3기'].map((v) => ({ value: v, label: v })) },
  { type: 'select', name: 'classNo', label: '반', options: ['1반', '2반', '3반', '4반'].map((v) => ({ value: v, label: v })) },
  { type: 'select', name: 'branch', label: '지점', options: ['분당', '대치', '평촌'].map((v) => ({ value: v, label: v })) },
  { type: 'chips', name: 'track', label: '계열', options: ['자연', '인문'] },
  { type: 'text', name: 'keyword', label: '이름 · 학번', placeholder: '예: 이승민', span: 2 },
  { type: 'chips', name: 'status', label: '상태', options: ['재원', '휴원', '퇴원'], multiple: true },
]

/** 구분 컬럼 — I-1 확정 전까지 값을 채우지 않는다 */
const UNDEFINED_COL: Column<RosterRow> = {
  key: 'gubun',
  header: (
    <span title="항목 정의 준비 중" style={{ color: 'var(--amber)' }}>
      구분 <Icon name="triangle-alert" size={11} />
    </span>
  ),
  width: '92px',
  align: 'center',
  value: () => '',
  render: () => (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--amber)',
        background: 'var(--amber-wash)',
        padding: '2px 8px',
        borderRadius: 5,
      }}
      title="항목 정의 준비 중"
    >
      미정
    </span>
  ),
}

const BASE: Column<RosterRow>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '성명', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'round', header: '청구기수', width: '76px', align: 'center', sortable: true, value: (r) => r.round },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  { key: 'track', header: '계열', width: '60px', align: 'center', value: (r) => r.track },
]

/** 수강생 대장 — DSA 실사: 성명/과정/주소/전화번호 + Copy/Excel/Print */
const ROSTER_COLUMNS: Column<RosterRow>[] = [
  ...BASE,
  UNDEFINED_COL,
  { key: 'school', header: '출신학교', width: '92px', value: (r) => r.school },
  { key: 'address', header: '주소', mask: 'address', value: (r) => r.address },
  { key: 'phone', header: '학생 연락처', width: '128px', mask: 'phone', value: (r) => r.phone },
  { key: 'parentPhone', header: '학부모 연락처', width: '128px', mask: 'phone', value: (r) => r.parentPhone },
]

/** 직반 명단 */
const CLASS_COLUMNS: Column<RosterRow>[] = [
  ...BASE,
  { key: 'teacher', header: '담임', width: '78px', value: (r) => r.teacher },
  { key: 'seat', header: '좌석', width: '68px', align: 'center', value: (r) => r.seat },
  { key: 'repeat', header: '재수 구분', width: '80px', align: 'center', value: (r) => r.repeat },
  { key: 'enrolledAt', header: '등원일', width: '100px', sortable: true, value: (r) => r.enrolledAt },
]

/** 장학생 명단 */
const SCHOLAR_COLUMNS: Column<RosterRow>[] = [
  ...BASE,
  {
    key: 'scholarship',
    header: '장학 유형',
    width: '96px',
    align: 'center',
    sortable: true,
    value: (r) => r.scholarship,
    render: (r) => <span className="mk verified">{r.scholarship}</span>,
  },
  { key: 'school', header: '출신학교', width: '92px', value: (r) => r.school },
  { key: 'phone', header: '연락처', width: '128px', mask: 'phone', value: (r) => r.phone },
]

const TABS = [
  { key: 'roster', label: '수강생 대장', icon: 'file-spreadsheet' },
  { key: 'class', label: '직반 명단', icon: 'layout-grid' },
  { key: 'scholar', label: '장학생 명단', icon: 'trophy' },
]

function matches(r: RosterRow, q: SearchValues): boolean {
  const kw = String(q.keyword ?? '').trim()
  if (kw && !`${r.name}${r.studentNo}`.includes(kw)) return false
  for (const k of ['round', 'classNo', 'branch'] as const) {
    const v = q[k]
    if (typeof v === 'string' && v && r[k] !== v) return false
  }
  if (typeof q.track === 'string' && q.track && r.track !== q.track) return false
  if (Array.isArray(q.status) && q.status.length > 0 && !q.status.includes(r.status)) return false
  return true
}

function Content() {
  const [tab, setTab] = useState('roster')
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)

  const filtered = useMemo(() => ROWS.filter((r) => matches(r, query)), [query])
  const rows = useMemo(
    () => (tab === 'scholar' ? filtered.filter((r) => r.scholarship !== '-') : filtered),
    [filtered, tab],
  )

  const columns = tab === 'roster' ? ROSTER_COLUMNS : tab === 'class' ? CLASS_COLUMNS : SCHOLAR_COLUMNS
  const label = TABS.find((t) => t.key === tab)!.label

  return (
    <>
      <SearchForm fields={FIELDS} onSearch={setQuery} presetKey="affairs" />

      <div className="card-sec">
        <Tabs items={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={setTab} />
        <div style={{ padding: 14 }}>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            masked={masked}
            pageSize={15}
            countLabel={
              <>
                {label} <b>{rows.length}</b>명
              </>
            }
            toolbar={
              <>
                <MaskToggle masked={masked} onChange={setMasked} />
                <CopyButton columns={columns} rows={rows} masked={masked} />
                <ExcelButton filename={label} columns={columns} rows={rows} masked={masked} />
                <PrintButton />
              </>
            }
          />
        </div>
      </div>

    </>
  )
}

export const affairsMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
    </>
  ),
}
