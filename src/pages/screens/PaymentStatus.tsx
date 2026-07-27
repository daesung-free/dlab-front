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
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'

/* F-4.8 수납현황 — 신규개발-요구사항보완
 *
 * 실행가이드: "대성전산API 연동. ★수납API스펙(D-3)·등록비주체(D-9) 확정 후 착수 —
 *              우회 어려움, 지연 시 후순위 재배치 검토"
 *              "API 확정 전까지 목데이터 그리드로 레이아웃만 완성"
 * → 이 화면은 의도적으로 레이아웃만입니다. */

type Method = '카드' | '가상계좌' | '현금'
type PayStatus = '완납' | '부분납' | '미납'
type Kind = '등록비' | '교습비' | '특강비' | '급식비'

interface Payment {
  id: string
  paidAt: string
  voucherNo: string
  studentNo: string
  name: string
  classNo: string
  kind: Kind
  round: string
  method: Method
  amount: number
  paid: number
  status: PayStatus
  branch: string
}

const KINDS: Kind[] = ['등록비', '교습비', '특강비', '급식비']
const METHODS: Method[] = ['카드', '가상계좌', '현금']

const PAYMENTS: Payment[] = MOCK_STUDENTS.slice(0, 40).map((s, i) => {
  const kind = KINDS[i % KINDS.length]
  const amount = kind === '등록비' ? 500000 : kind === '교습비' ? 1_450_000 : kind === '특강비' ? 320000 : 117000
  const status: PayStatus = i % 9 === 8 ? '미납' : i % 13 === 12 ? '부분납' : '완납'
  const paid = status === '완납' ? amount : status === '부분납' ? Math.round(amount * 0.5) : 0
  return {
    id: `pay-${i + 1}`,
    paidAt: status === '미납' ? '-' : `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
    voucherNo: `DS-2026-${String(10000 + i).padStart(6, '0')}`,
    studentNo: s.studentNo,
    name: s.name,
    classNo: s.classNo,
    kind,
    round: `${(i % 3) + 1}기`,
    method: METHODS[i % METHODS.length],
    amount,
    paid,
    status,
    branch: s.branch,
  }
})

const FIELDS: Field[] = [
  { type: 'dateRange', name: 'period', label: '결제 기간', presets: true, span: 2 },
  { type: 'text', name: 'keyword', label: '이름 · 학번 · 전표번호', placeholder: '예: 이승민 / DS-2026-010001', span: 2 },
  { type: 'select', name: 'branch', label: '지점', options: ['분당', '대치', '평촌'].map((v) => ({ value: v, label: v })) },
  { type: 'select', name: 'round', label: '청구기수', options: ['1기', '2기', '3기'].map((v) => ({ value: v, label: v })) },
  { type: 'chips', name: 'kind', label: '항목', options: KINDS, multiple: true },
  { type: 'chips', name: 'method', label: '결제수단', options: METHODS, multiple: true },
]

const STATUS_TONE: Record<PayStatus, string> = { 완납: 'verified', 부분납: 'supplement', 미납: 'brandnew' }

const COLUMNS: Column<Payment>[] = [
  { key: 'paidAt', header: '결제일자', width: '100px', sortable: true, value: (r) => r.paidAt },
  {
    key: 'voucherNo',
    header: '전표번호',
    width: '150px',
    value: (r) => r.voucherNo,
    render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
  },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'branch', header: '지점', width: '64px', align: 'center', sortable: true, value: (r) => r.branch },
  { key: 'round', header: '기수', width: '58px', align: 'center', value: (r) => r.round },
  {
    key: 'kind',
    header: '항목',
    width: '82px',
    align: 'center',
    sortable: true,
    value: (r) => r.kind,
    render: (r) => <span className="mk supplement">{r.kind}</span>,
  },
  { key: 'method', header: '결제수단', width: '84px', align: 'center', value: (r) => r.method },
  {
    key: 'amount',
    header: '청구액',
    width: '106px',
    align: 'right',
    sortable: true,
    value: (r) => r.amount,
    render: (r) => `${r.amount.toLocaleString()}원`,
  },
  {
    key: 'paid',
    header: '수납액',
    width: '106px',
    align: 'right',
    value: (r) => r.paid,
    render: (r) => (
      <span style={{ color: r.paid === r.amount ? 'var(--ink)' : 'var(--red)', fontWeight: 700 }}>
        {r.paid.toLocaleString()}원
      </span>
    ),
  },
  {
    key: 'status',
    header: '상태',
    width: '76px',
    align: 'center',
    value: (r) => r.status,
    render: (r) => <span className={`mk ${STATUS_TONE[r.status]}`}>{r.status}</span>,
  },
]

const UNPAID_COLUMNS: Column<Payment>[] = [
  ...COLUMNS.slice(2, 9),
  {
    key: 'due',
    header: '미납액',
    width: '110px',
    align: 'right',
    sortable: true,
    value: (r) => r.amount - r.paid,
    render: (r) => (
      <b style={{ color: 'var(--red)', fontWeight: 800 }}>{(r.amount - r.paid).toLocaleString()}원</b>
    ),
  },
  {
    key: 'act',
    header: '',
    width: '104px',
    align: 'center',
    value: () => '',
    render: () => (
      <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
        <Icon name="bell" size={12} /> 알림톡
      </button>
    ),
  },
]

function matches(r: Payment, q: SearchValues): boolean {
  const kw = String(q.keyword ?? '').trim()
  if (kw && !`${r.name}${r.studentNo}${r.voucherNo}`.includes(kw)) return false
  if (typeof q.branch === 'string' && q.branch && r.branch !== q.branch) return false
  if (typeof q.round === 'string' && q.round && r.round !== q.round) return false
  if (Array.isArray(q.kind) && q.kind.length > 0 && !q.kind.includes(r.kind)) return false
  if (Array.isArray(q.method) && q.method.length > 0 && !q.method.includes(r.method)) return false
  return true
}

function Content() {
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)
  const [tab, setTab] = useState('all')

  const rows = useMemo(() => PAYMENTS.filter((r) => matches(r, query)), [query])
  const unpaid = useMemo(() => rows.filter((r) => r.status !== '완납'), [rows])

  const sum = useMemo(() => {
    const by = (k: Method) => rows.filter((r) => r.method === k).reduce((a, r) => a + r.paid, 0)
    return {
      total: rows.reduce((a, r) => a + r.paid, 0),
      card: by('카드'),
      vbank: by('가상계좌'),
      tuition: rows.filter((r) => r.kind === '등록비').reduce((a, r) => a + r.paid, 0),
      due: rows.reduce((a, r) => a + (r.amount - r.paid), 0),
    }
  }, [rows])

  return (
    <>
      <div className="blocked-note">
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <div>
          <div className="tt">이 화면은 레이아웃만입니다 — 우회가 어려운 미확정 3건</div>
          <div className="tx">
            <b>#5 / D-5 (최우선)</b> — 대성전산 API를 <b>수납만 남길지 전면 제거할지</b> 최종 확정. 아키텍처 전제
            자체가 미정입니다.
            <br />
            <b>#9 / D-9 (최우선)</b> — <b>등록비 결제 주체</b>. 기술문서는 학원명의 PG 직접결제 전제인데
            기획·미팅은 수납=대성전산으로 <b>상충</b>합니다.
            <br />
            <b>#3 / D-3 (높음)</b> — 대성전산 API 엔드포인트·인증·응답 필드·실시간성(webhook/polling)·미납자 명세.
            <br />
            <span style={{ color: 'var(--muted)' }}>
              ※ 실행가이드 지침 — "API 확정 전까지 <b>목데이터 그리드로 레이아웃만 완성</b>", "지연 시 후순위 재배치
              검토". 아래 숫자는 전부 목데이터입니다.
            </span>
          </div>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="banknote" size={13} /> 총 수납액
          </div>
          <div className="v">{Math.round(sum.total / 10000).toLocaleString()}</div>
          <div className="d">만원 · 조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="credit-card" size={13} /> 카드
          </div>
          <div className="v">{Math.round(sum.card / 10000).toLocaleString()}</div>
          <div className="d">만원</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="wallet" size={13} /> 가상계좌
          </div>
          <div className="v">{Math.round(sum.vbank / 10000).toLocaleString()}</div>
          <div className="d">만원</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="receipt" size={13} /> 등록비
          </div>
          <div className="v">{Math.round(sum.tuition / 10000).toLocaleString()}</div>
          <div className="d warn">결제주체 D-9 미확정</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 미납액
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {Math.round(sum.due / 10000).toLocaleString()}
          </div>
          <div className="d down">{unpaid.length}건</div>
        </div>
      </div>

      <SearchForm
        fields={FIELDS}
        onSearch={setQuery}
        presetKey="payment"
        headerRight={
          <span className="mk supplement" title="RBAC: SUPER_ADMIN / BRANCH_ADMIN 전체, STAFF 조회만">
            <Icon name="shield-check" size={11} /> STAFF 조회 전용
          </span>
        }
      />

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'all', label: '통합 매출장', count: rows.length },
            { key: 'unpaid', label: '미납자 관리', count: unpaid.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div style={{ padding: 14 }}>
          {tab === 'all' ? (
            <DataTable
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => r.id}
              masked={masked}
              pageSize={12}
              countLabel={
                <>
                  매출 <b>{rows.length}</b>건
                </>
              }
              toolbar={
                <>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="통합_매출장" columns={COLUMNS} rows={rows} masked={masked} />
                </>
              }
            />
          ) : (
            <DataTable
              columns={UNPAID_COLUMNS}
              rows={unpaid}
              rowKey={(r) => r.id}
              selectable
              masked={masked}
              pageSize={12}
              countLabel={
                <>
                  미납 <b>{unpaid.length}</b>건 · {sum.due.toLocaleString()}원
                </>
              }
              toolbar={
                <>
                  <button className="btn">
                    <Icon name="bell" size={14} /> 미납자 일괄 알림톡
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="미납자_명단" columns={UNPAID_COLUMNS} rows={unpaid} masked={masked} />
                </>
              }
              emptyText="미납 건이 없습니다."
            />
          )}
        </div>
      </div>

      <div className="note-box plain" style={{ marginTop: 14 }}>
        <div className="ic">
          <Icon name="info" size={17} />
        </div>
        <div>
          <div className="tt">전표번호 채번 규칙 미확정</div>
          <div className="tx">
            대성전산 API 연동 시 <b>대성전산 채번 체계를 그대로 쓸지</b>, 자체 채번할지가 D-3 확정 후 결정됩니다.
            위 전표번호(<code>DS-2026-XXXXXX</code>)는 임시 형식입니다. 급식 주문/결제 전표번호는 명시된 규칙이
            아예 없어 E-3 확보 후 신규 설계가 필요합니다.
          </div>
        </div>
      </div>
    </>
  )
}

export const paymentMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn">
        <Icon name="bar-chart-3" size={14} /> 기간·지점별 통계
      </button>
    </>
  ),
}
