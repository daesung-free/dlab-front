import { useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.10-5 수납 관리(청구기준 관리) — 신규개발-요구사항검증됨
 * DSA '관리자>수납관리>청구기준 관리'에서 상태필터·청구기준목록(가상계좌/PG·VAN)·
 * 수납/메시지/수정/삭제 UI 확인. 등록비 결제주체(D-9)가 최우선 미확정. */

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
  { id: 'r6', period: '급식 — 데스크 취소', rate: '협의', note: '주체·방식 미확정 (I-13)' },
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
        title={r.pg === '대성전산' ? '주체 미확정 — D-9' : undefined}
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
      <div className="blocked-note">
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <div>
          <div className="tt">등록비 결제 주체 — 상충 상태 (오픈이슈 #9 / D-9, 최우선)</div>
          <div className="tx">
            <b>기술문서</b>는 학원명의 PG 직접결제(<code>TuitionPgClient</code>) 전제인데,{' '}
            <b>기획·미팅</b>은 수납=대성전산으로 정리돼 있어 서로 <b>상충</b>합니다. 위 결제 경로 컬럼에서{' '}
            <span className="mk brandnew" style={{ display: 'inline-block' }}>
              대성전산
            </span>{' '}
            으로 표시된 항목이 여기 걸립니다. D-5(대성 API 존치 범위)와 함께 결정되어야 하며,{' '}
            <b>결제·수납 아키텍처의 근간</b>이라 확정 전에는 구현을 시작할 수 없습니다.
            <br />
            <span style={{ color: 'var(--muted)' }}>
              ※ 급식 PG는 별개입니다 — 급식업체가 이미 쓰는 PG사와 연동하며 신규 선정 대상이 아닙니다(E-3).
            </span>
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
              <div className="note-box plain" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="ic">
                  <Icon name="percent" size={17} />
                </div>
                <div>
                  <div className="tt">환불 기준은 교습비와 급식비가 서로 다릅니다</div>
                  <div className="tx">
                    교습비·특강비는 <b>학원법 시행령 기준</b>(경과 비율)을 따르고, 급식비는{' '}
                    <b>이용일 3일 전 앱 취소 시 PG 자동환불</b>이라는 별도 규칙입니다. 데스크 취소는 기간 제한 없이
                    즉시 처리되지만 <b>환불 주체·방식이 미확정</b>(I-13)이라 위 표에 '협의'로 남겨 뒀습니다.
                  </div>
                </div>
              </div>
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
