import { useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  SearchForm,
  type Column,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.1-2 상벌점 관리 — 신규개발-요구사항보완
 * DSA에는 수기 '선택 일괄 점수부여'만 있었고 자동 룰이 없었다.
 * 규칙 엔진(PenaltyRuleEngine)은 I-5(트리거→점수 매핑) 확정이 블로커이므로
 * 실행가이드 지침대로 '수기 부여 우선 + 자동규칙 UI는 자리만' 으로 만든다. */

type Kind = '상점' | '벌점'
type Source = '수기' | '자동'

interface PenaltyLog {
  id: string
  date: string
  studentNo: string
  name: string
  classNo: string
  kind: Kind
  item: string
  point: number
  reason: string
  by: string
  source: Source
  /** 자동 부여 시 트리거 */
  trigger?: string
}

const ITEMS: { kind: Kind; item: string; point: number; trigger?: string }[] = [
  { kind: '벌점', item: '지각', point: -2, trigger: 'ATTENDANCE_LATE' },
  { kind: '벌점', item: '무단결석', point: -5, trigger: 'ATTENDANCE_ABSENT' },
  { kind: '벌점', item: '루틴 미완료', point: -1, trigger: 'ROUTINE_INCOMPLETE' },
  { kind: '벌점', item: '순찰 졸음 2회', point: -2, trigger: 'PATROL_SLEEP_X2' },
  { kind: '벌점', item: '면학 분위기 저해', point: -3 },
  { kind: '상점', item: '데일리테스트 만점', point: 3 },
  { kind: '상점', item: '개근', point: 5 },
  { kind: '상점', item: '멘토링 참여', point: 2 },
]

const LOGS: PenaltyLog[] = MOCK_STUDENTS.slice(0, 34).map((s, i) => {
  const def = ITEMS[i % ITEMS.length]
  const source: Source = def.trigger && i % 3 !== 0 ? '자동' : '수기'
  return {
    id: `pl-${i + 1}`,
    date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
    studentNo: s.studentNo,
    name: s.name,
    classNo: s.classNo,
    kind: def.kind,
    item: def.item,
    point: def.point,
    reason: def.kind === '벌점' ? `${def.item} 확인` : `${def.item} 달성`,
    by: source === '자동' ? '규칙 엔진' : s.teacher,
    source,
    trigger: source === '자동' ? def.trigger : undefined,
  }
})

const FIELDS: Field[] = [
  { type: 'text', name: 'keyword', label: '이름 · 학번', placeholder: '예: 이승민 / 2026-0001', span: 2 },
  { type: 'select', name: 'classNo', label: '반', options: ['1반', '2반', '3반', '4반'].map((v) => ({ value: v, label: v })) },
  { type: 'chips', name: 'kind', label: '구분', options: ['상점', '벌점'] },
  { type: 'chips', name: 'source', label: '부여 방식', options: ['수기', '자동'], multiple: true },
  { type: 'chips', name: 'enrollStatus', label: '재원 상태', options: ['전체보기', '재원생', '퇴원생'] },
  { type: 'dateRange', name: 'period', label: '기간', presets: true, span: 2 },
]

const COLUMNS: Column<PenaltyLog>[] = [
  { key: 'date', header: '일자', width: '100px', sortable: true, value: (r) => r.date },
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  {
    key: 'kind',
    header: '구분',
    width: '64px',
    align: 'center',
    value: (r) => r.kind,
    render: (r) => <span className={`mk ${r.kind === '상점' ? 'verified' : 'brandnew'}`}>{r.kind}</span>,
  },
  { key: 'item', header: '항목', width: '140px', value: (r) => r.item },
  {
    key: 'point',
    header: '점수',
    width: '64px',
    align: 'right',
    sortable: true,
    value: (r) => r.point,
    render: (r) => (
      <b style={{ color: r.point > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>
        {r.point > 0 ? `+${r.point}` : r.point}
      </b>
    ),
  },
  { key: 'reason', header: '사유', value: (r) => r.reason },
  { key: 'by', header: '부여자', width: '90px', value: (r) => r.by },
  {
    key: 'source',
    header: '방식',
    width: '86px',
    align: 'center',
    value: (r) => r.source,
    render: (r) =>
      r.source === '자동' ? (
        <span className="mk supplement" title={r.trigger}>
          자동
        </span>
      ) : (
        <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>수기</span>
      ),
  },
]

function matches(r: PenaltyLog, q: SearchValues): boolean {
  const kw = String(q.keyword ?? '').trim()
  if (kw && !`${r.name}${r.studentNo}`.includes(kw)) return false
  if (typeof q.classNo === 'string' && q.classNo && r.classNo !== q.classNo) return false
  if (typeof q.kind === 'string' && q.kind && r.kind !== q.kind) return false
  if (Array.isArray(q.source) && q.source.length > 0 && !q.source.includes(r.source)) return false
  const p = q.period as { from: string; to: string } | undefined
  if (p?.from && r.date < p.from) return false
  if (p?.to && r.date > p.to) return false
  return true
}

function Content() {
  const [query, setQuery] = useState<SearchValues>({})
  const [selected, setSelected] = useState<string[]>([])
  const [masked, setMasked] = useState(true)
  const [grantOpen, setGrantOpen] = useState(false)

  const rows = useMemo(() => LOGS.filter((r) => matches(r, query)), [query])

  const sum = useMemo(() => {
    const plus = rows.filter((r) => r.kind === '상점').reduce((a, r) => a + r.point, 0)
    const minus = rows.filter((r) => r.kind === '벌점').reduce((a, r) => a + r.point, 0)
    const auto = rows.filter((r) => r.source === '자동').length
    return { plus, minus, auto }
  }, [rows])

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="star" size={13} /> 상점 합계
          </div>
          <div className="v" style={{ color: 'var(--green)' }}>
            +{sum.plus}
          </div>
          <div className="d">조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 벌점 합계
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {sum.minus}
          </div>
          <div className="d">조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="zap" size={13} /> 자동 부여
          </div>
          <div className="v">{sum.auto}</div>
          <div className="d warn">규칙 확정 시 활성</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="history" size={13} /> 전년도 복사
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            항목 {ITEMS.length}종
          </div>
          <div className="d">YearlySnapshotService</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="smartphone" size={13} /> 앱 반영
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            실시간
          </div>
          <div className="d">Daily Report 연동</div>
        </div>
      </div>

      <SearchForm fields={FIELDS} onSearch={setQuery} presetKey="penalty" />

      {grantOpen && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="pencil" size={15} />
              </span>
              선택 {selected.length}건 일괄 점수부여 (수기)
            </div>
            <div className="r">
              <button className="btn" onClick={() => setGrantOpen(false)}>
                닫기
              </button>
            </div>
          </div>
          <div className="card-sec-b">
            <div className="frow">
              <label className="req">항목</label>
              <select className="sel">
                {ITEMS.map((it) => (
                  <option key={it.item}>
                    [{it.kind}] {it.item} ({it.point > 0 ? `+${it.point}` : it.point})
                  </option>
                ))}
              </select>
            </div>
            <div className="frow">
              <label className="req">일자</label>
              <div className="two">
                <input className="inp" type="date" defaultValue="2026-05-28" />
                <input className="inp" placeholder="사유 (선택)" />
              </div>
            </div>
            <div className="frow">
              <label>&nbsp;</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn pri">
                  <Icon name="check" size={14} /> {selected.length}건 부여
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', alignSelf: 'center' }}>
                  저장 시 학생 앱 Daily Report에 즉시 반영됩니다.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

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
            내역 <b>{rows.length}</b>건
          </>
        }
        toolbar={
          <>
            <button className="btn" disabled={selected.length === 0} onClick={() => setGrantOpen(true)}>
              <Icon name="plus" size={14} /> 선택 일괄 점수부여
            </button>
            <MaskToggle masked={masked} onChange={setMasked} />
            <ExcelButton filename="상벌점_내역" columns={COLUMNS} rows={rows} masked={masked} />
          </>
        }
      />
    </>
  )
}

export const penaltyMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="history" size={14} /> 항목 전년도 복사
      </button>
      <button className="btn">
        <Icon name="settings" size={14} /> 상벌점 항목 관리
      </button>
    </>
  ),
}
