import { useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.10-5 수납 관리(청구기준 관리) — 신규개발-요구사항검증됨
 * DSA '관리자>수납관리>청구기준 관리'에서 상태필터·청구기준목록(가상계좌/PG·VAN)·
 * 수납/메시지/수정/삭제 UI 확인. 등록비 결제주체(D-9)가 최우선 미확정.
 *
 * ⚠ 금액이 정해지는 순서 — 세 화면이 한 줄로 이어진다.
 *   ① 여기(청구기준)      정가와 청구 시점을 정한다
 *   ② 수납현황 > 할인 정책  정가에서 할인을 적용해 실제 청구액을 만든다
 *   ③ 결제(F-C-5)         그 청구액으로 PG 결제 트랜잭션이 생긴다
 *   지금 문제는 ②가 빠져서 ①의 정가가 그대로 ③으로 넘어가는 것이다. */

interface Billing {
  id: string
  code: string
  kind: '교습비' | '특강비' | '등록비' | '급식비'
  name: string
  round: string
  amount: number
  pg: '가상계좌' | 'PG·VAN' | '대성전산' | '급식업체 PG'
  dueDay: string
  active: boolean
}

const BILLINGS: Billing[] = [
  { id: 'b1', code: 'BL-TU-01', kind: '교습비', name: '정규 교습비 (재수 정규)', round: '1기', amount: 1_450_000, pg: '대성전산', dueDay: '매월 25일', active: true },
  { id: 'b2', code: 'BL-TU-02', kind: '교습비', name: '정규 교습비 (삼수 이상)', round: '1기', amount: 1_520_000, pg: '대성전산', dueDay: '매월 25일', active: true },
  { id: 'b3', code: 'BL-RG-01', kind: '등록비', name: '신규 등록비', round: '-', amount: 500_000, pg: 'PG·VAN', dueDay: '등록 시', active: true },
  { id: 'b4', code: 'BL-SP-01', kind: '특강비', name: '단과 특강 (30명 기준)', round: '-', amount: 320_000, pg: 'PG·VAN', dueDay: '개강 3일 전', active: true },
  { id: 'b5', code: 'BL-SP-02', kind: '특강비', name: '해설 특강', round: '-', amount: 90_000, pg: 'PG·VAN', dueDay: '개강 3일 전', active: true },
  { id: 'b6', code: 'BL-ML-01', kind: '급식비', name: '월 급식비 (1식 6,500원)', round: '-', amount: 6_500, pg: '급식업체 PG', dueDay: '전월 말일', active: true },
  { id: 'b7', code: 'BL-TU-03', kind: '교습비', name: '2025 정규 교습비 (종료)', round: '3기', amount: 1_380_000, pg: '대성전산', dueDay: '매월 25일', active: false },
]

interface Refund {
  id: string
  period: string
  rate: string
  note: string
}

const REFUNDS: Refund[] = [
  { id: 'r1', period: '개강 전', rate: '100%', note: '전액 환불' },
  { id: 'r2', period: '개강 후 1/3 경과 전', rate: '2/3', note: '학원법 시행령 기준' },
  { id: 'r3', period: '개강 후 1/2 경과 전', rate: '1/2', note: '학원법 시행령 기준' },
  { id: 'r4', period: '개강 후 1/2 경과 후', rate: '0%', note: '환불 없음' },
  { id: 'r5', period: '급식 — 이용 3일 전', rate: '100%', note: '앱 취소 · PG 자동환불' },
  { id: 'r6', period: '급식 — 데스크 취소', rate: '협의', note: '데스크 개별 처리' },
]

const BILLING_COLUMNS: Column<Billing>[] = [
  {
    key: 'code',
    header: '코드',
    width: '104px',
    sortable: true,
    value: (r) => r.code,
    render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
  },
  {
    key: 'kind',
    header: '항목',
    width: '82px',
    align: 'center',
    sortable: true,
    value: (r) => r.kind,
    render: (r) => <span className="mk supplement">{r.kind}</span>,
  },
  { key: 'name', header: '청구 기준명', sortable: true, value: (r) => r.name },
  { key: 'round', header: '기수', width: '62px', align: 'center', value: (r) => r.round },
  {
    key: 'amount',
    header: '금액',
    width: '112px',
    align: 'right',
    sortable: true,
    value: (r) => r.amount,
    render: (r) => `${r.amount.toLocaleString()}원`,
  },
  {
    key: 'pg',
    header: '결제 경로',
    width: '116px',
    align: 'center',
    sortable: true,
    value: (r) => r.pg,
    render: (r) => (
      <span
        className={`mk ${r.pg === '대성전산' ? 'brandnew' : 'verified'}`}
        title={r.pg}
      >
        {r.pg}
      </span>
    ),
  },
  { key: 'dueDay', header: '청구일', width: '104px', align: 'center', value: (r) => r.dueDay },
  {
    key: 'active',
    header: '사용',
    width: '72px',
    align: 'center',
    value: (r) => (r.active ? '사용' : '중지'),
    render: (r) => <span className={`mk ${r.active ? 'verified' : 'brandnew'}`}>{r.active ? '사용' : '중지'}</span>,
  },
  {
    key: 'act',
    header: '',
    width: '150px',
    align: 'center',
    value: () => '',
    render: () => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          수납
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          메시지
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          수정
        </button>
      </div>
    ),
  },
]

const REFUND_COLUMNS: Column<Refund>[] = [
  { key: 'period', header: '경과 시점', width: '200px', value: (r) => r.period },
  {
    key: 'rate',
    header: '환불 비율',
    width: '110px',
    align: 'center',
    value: (r) => r.rate,
    render: (r) => (
      <b style={{ color: r.rate === '0%' ? 'var(--red)' : r.rate === '협의' ? 'var(--amber)' : 'var(--mint-d)' }}>
        {r.rate}
      </b>
    ),
  },
  { key: 'note', header: '비고', value: (r) => r.note },
]

function Content() {
  const [tab, setTab] = useState('billing')

  return (
    <>
      <div className="note-box plain">
        <div className="ic">
          <Icon name="git-compare" size={17} />
        </div>
        <div>
          <div className="tt">여기서 정하는 것은 &lsquo;정가&rsquo;입니다 — 할인은 다음 단계입니다</div>
          <div className="tx">
            금액은 <b>① 청구기준(여기, 정가)</b> → <b>② 수납현황 &gt; 할인 정책(실제 청구액)</b> →{' '}
            <b>③ 결제(PG 트랜잭션)</b> 순으로 확정됩니다.
            <br />
            <b>현재 ②가 빠져 있어 여기의 정가가 그대로 PG로 넘어갑니다.</b> 결제창에 할인 전 금액이 뜨는 원인이며,
            할인 정책은 <b>수납현황 화면</b>에서 등록합니다.
          </div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'billing', label: '청구 기준', count: BILLINGS.length },
            { key: 'refund', label: '환불 기준', count: REFUNDS.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div style={{ padding: 14 }}>
          {tab === 'billing' ? (
            <DataTable
              columns={BILLING_COLUMNS}
              rows={BILLINGS}
              rowKey={(r) => r.id}
              masked={false}
              pageSize={10}
              countLabel={
                <>
                  청구 기준 <b>{BILLINGS.length}</b>건
                </>
              }
              toolbar={
                <>
                  <ExcelButton filename="청구기준" columns={BILLING_COLUMNS} rows={BILLINGS} masked={false} />
                  <button className="btn pri">
                    <Icon name="plus" size={14} /> 청구 기준 등록
                  </button>
                </>
              }
            />
          ) : (
            <>
              <DataTable
                columns={REFUND_COLUMNS}
                rows={REFUNDS}
                rowKey={(r) => r.id}
                masked={false}
                pageSize={10}
                countLabel={
                  <>
                    환불 기준 <b>{REFUNDS.length}</b>건
                  </>
                }
                toolbar={
                  <button className="btn pri">
                    <Icon name="plus" size={14} /> 기준 추가
                  </button>
                }
              />
            </>
          )}
        </div>
      </div>
    </>
  )
}

export const adminBillingMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn">
        <Icon name="history" size={14} /> 전년도 기준 복사
      </button>
    </>
  ),
}
