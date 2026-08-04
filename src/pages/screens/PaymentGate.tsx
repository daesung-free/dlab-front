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
import { Tabs } from '../../components/Tabs'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* 학원생 관리 > 결제 — 클라이언트 메뉴표 기준 추가 화면
 * 비고: "카드·가상계좌 등 앱 결제 연동 (별도 생성 예정)"
 *
 * 수납현황(F-4.8)과 반드시 구분해야 한다. 둘을 합치면 정산이 틀어진다.
 *   · 수납현황 = 회계 관점. "받아야 할 돈을 받았는가"(청구 ↔ 수납)
 *   · 결제     = 거래 관점. "PG에 어떤 트랜잭션이 오갔는가"(승인·취소·환불·입금대기)
 *   하나의 수납 건이 결제 트랜잭션 여러 개(부분환불·재결제)를 가질 수 있다.
 *
 * ⚠ 이 화면은 결제 상태모델이 먼저 확정돼야 한다. 화면부터 그리면 반드시 다시 만든다.
 *   · PG사가 급식(E-3)과 등록비(D-9)로 나뉘어 있어 상태값·웹훅 규격이 서로 다를 수 있다
 *   · 가상계좌는 "발급 → 입금대기 → 입금완료 / 만료" 라는 별도 생애주기를 가진다
 *   · 앱 취소(3일 전 자동환불)와 관리자 취소(즉시)는 환불 트랜잭션 성격이 다르다 */

type PayStatus = 'PAID' | 'READY' | 'CANCELED' | 'REFUNDED' | 'PARTIAL' | 'FAILED' | 'EXPIRED'

const STATUS_META: Record<PayStatus, { label: string; cls: string }> = {
  PAID: { label: '결제완료', cls: 'verified' },
  READY: { label: '입금대기', cls: 'supplement' },
  CANCELED: { label: '결제취소', cls: 'brandnew' },
  REFUNDED: { label: '전액환불', cls: 'brandnew' },
  PARTIAL: { label: '부분환불', cls: 'brandnew' },
  FAILED: { label: '결제실패', cls: 'brandnew' },
  EXPIRED: { label: '기한만료', cls: 'brandnew' },
}

type Method = '카드' | '가상계좌' | '간편결제'
type Item = '교습비' | '급식비' | '특강비' | '등록비'

const PG_OF: Record<Item, string> = {
  교습비: 'PG-A (등록비 계약 · D-9 확정 대기)',
  등록비: 'PG-A (등록비 계약 · D-9 확정 대기)',
  급식비: 'PG-B (급식업체 기확보 · E-3 연동정보 대기)',
  특강비: 'PG-A (등록비 계약 · D-9 확정 대기)',
}

const AMOUNTS: Record<Item, number> = {
  교습비: 1320000,
  급식비: 176000,
  특강비: 340000,
  등록비: 500000,
}

interface PayRow {
  id: string
  at: string
  txId: string
  studentNo: string
  name: string
  item: Item
  method: Method
  amount: number
  status: PayStatus
  channel: '앱' | '데스크'
  /** 가상계좌일 때만 — 입금 기한 */
  dueAt?: string
}

const ITEMS: Item[] = ['교습비', '급식비', '특강비', '등록비']
const METHODS: Method[] = ['카드', '가상계좌', '간편결제']

const ROWS: PayRow[] = MOCK_STUDENTS.flatMap((s, i) =>
  ITEMS.slice(0, (i % 3) + 1).map((item, j) => {
    const seed = i * 7 + j * 3
    const method = METHODS[seed % METHODS.length]
    const status: PayStatus =
      method === '가상계좌' && seed % 9 === 4
        ? 'READY'
        : method === '가상계좌' && seed % 23 === 7
          ? 'EXPIRED'
          : seed % 19 === 5
            ? 'PARTIAL'
            : seed % 29 === 11
              ? 'REFUNDED'
              : seed % 31 === 13
                ? 'CANCELED'
                : seed % 37 === 17
                  ? 'FAILED'
                  : 'PAID'
    const base = AMOUNTS[item]
    return {
      id: `pay-${s.id}-${item}`,
      at: `2026-05-${String(20 + (seed % 9)).padStart(2, '0')} ${String(9 + (seed % 12)).padStart(2, '0')}:${String(seed % 60).padStart(2, '0')}`,
      txId: `TX${2026}${String(100000 + seed * 137).slice(0, 6)}`,
      studentNo: s.studentNo,
      name: s.name,
      item,
      method,
      amount: status === 'PARTIAL' ? Math.round(base * 0.6) : base,
      status,
      channel: seed % 4 === 0 ? '데스크' : '앱',
      dueAt: method === '가상계좌' ? `2026-05-${String(24 + (seed % 6)).padStart(2, '0')} 23:59` : undefined,
    }
  }),
)

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

const FIELDS: Field[] = [
  { type: 'dateRange', name: 'date', label: '결제일', presets: true, span: 2 },
  { type: 'text', name: 'keyword', label: '학생 · 거래번호', placeholder: '예: 이승민 / TX2026100', span: 2 },
  { type: 'select', name: 'item', label: '결제 항목', options: ITEMS.map((v) => ({ value: v, label: v })) },
  { type: 'chips', name: 'method', label: '결제수단', options: METHODS, multiple: true },
  {
    type: 'chips',
    name: 'status',
    label: '상태',
    options: ['PAID', 'READY', 'CANCELED', 'REFUNDED', 'PARTIAL', 'FAILED', 'EXPIRED'],
    multiple: true,
  },
  { type: 'chips', name: 'channel', label: '채널', options: ['앱', '데스크'] },
]

const COLUMNS: Column<PayRow>[] = [
  { key: 'at', header: '결제일시', width: '132px', sortable: true, value: (r) => r.at },
  {
    key: 'txId',
    header: '거래번호',
    width: '116px',
    value: (r) => r.txId,
    render: (_r, v) => <code style={{ fontSize: 10.5 }}>{v}</code>,
  },
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '78px', mask: 'name', value: (r) => r.name },
  { key: 'item', header: '항목', width: '80px', align: 'center', sortable: true, value: (r) => r.item },
  {
    key: 'method',
    header: '수단',
    width: '86px',
    align: 'center',
    sortable: true,
    value: (r) => r.method,
    render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
        <Icon name={r.method === '카드' ? 'credit-card' : r.method === '가상계좌' ? 'banknote' : 'smartphone'} size={13} />
        {r.method}
      </span>
    ),
  },
  {
    key: 'amount',
    header: '금액',
    width: '112px',
    align: 'right',
    sortable: true,
    value: (r) => r.amount,
    render: (r) => <b>{won(r.amount)}</b>,
  },
  {
    key: 'status',
    header: '상태',
    width: '96px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => <span className={`mk ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</span>,
  },
  { key: 'channel', header: '채널', width: '68px', align: 'center', value: (r) => r.channel },
  {
    key: 'due',
    header: '입금기한',
    width: '124px',
    align: 'center',
    value: (r) => r.dueAt ?? '-',
    render: (r) =>
      r.dueAt ? (
        <span style={{ fontSize: 11.5, color: r.status === 'EXPIRED' ? 'var(--red)' : 'var(--ink-2)' }}>{r.dueAt}</span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
]

function matches(r: PayRow, q: SearchValues): boolean {
  const kw = String(q.keyword ?? '').trim()
  if (kw && !`${r.name}${r.studentNo}${r.txId}`.includes(kw)) return false
  if (typeof q.item === 'string' && q.item && r.item !== q.item) return false
  if (Array.isArray(q.method) && q.method.length > 0 && !q.method.includes(r.method)) return false
  if (Array.isArray(q.status) && q.status.length > 0 && !q.status.includes(r.status)) return false
  if (typeof q.channel === 'string' && q.channel && r.channel !== q.channel) return false
  return true
}

function Content() {
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)

  const base = useMemo(() => ROWS.filter((r) => matches(r, query)), [query])

  const rows = useMemo(() => {
    if (tab === 'vbank') return base.filter((r) => r.method === '가상계좌')
    if (tab === 'refund') return base.filter((r) => ['CANCELED', 'REFUNDED', 'PARTIAL'].includes(r.status))
    return base
  }, [base, tab])

  const sum = (list: PayRow[]) => list.reduce((n, r) => n + r.amount, 0)
  const paid = base.filter((r) => r.status === 'PAID')
  const ready = base.filter((r) => r.status === 'READY')
  const refunds = base.filter((r) => ['REFUNDED', 'PARTIAL', 'CANCELED'].includes(r.status))
  const failed = base.filter((r) => ['FAILED', 'EXPIRED'].includes(r.status))

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="wallet" size={13} /> 결제 완료
          </div>
          <div className="v">{won(sum(paid))}</div>
          <div className="d up">{paid.length}건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="banknote" size={13} /> 입금 대기
          </div>
          <div className="v">{won(sum(ready))}</div>
          <div className="d warn">가상계좌 {ready.length}건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="refresh-cw" size={13} /> 취소 · 환불
          </div>
          <div className="v">{won(sum(refunds))}</div>
          <div className="d down">{refunds.length}건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 실패 · 만료
          </div>
          <div className="v">{failed.length}</div>
          <div className="d down">재결제 안내 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="smartphone" size={13} /> 앱 결제 비중
          </div>
          <div className="v">{base.length ? Math.round((base.filter((r) => r.channel === '앱').length / base.length) * 100) : 0}%</div>
          <div className="d">데스크 결제 대비</div>
        </div>
      </div>

      <div className="blocked-note">
        <div className="ic">
          <Icon name="triangle-alert" size={17} />
        </div>
        <div>
          <div className="tt">PG 연동정보 미수급 — 상태값과 웹훅 규격을 아직 고정할 수 없습니다</div>
          <div className="tx">
            급식은 <code>E-3</code>(급식업체 PG 연동정보), 교습비·등록비는 <code>D-9</code>(등록비 PG 주체)가 열려 있습니다.
            PG사가 둘로 나뉘면 <b>상태값·부분환불 지원 여부·정산주기가 서로 다를 수 있어</b> 이 화면의 상태 배지 정의가 바뀝니다.
            현재 화면은 <b>7종 상태모델 초안</b>을 전제로 그린 것이며, 연동정보 수급 후 확정합니다.
          </div>
        </div>
      </div>

      <SearchForm
        fields={FIELDS}
        onSearch={setQuery}
        presetKey="payment-gate"
        headerRight={
          <span className="mk supplement" title="가상계좌 만료 스케줄러 10분 주기">
            <Icon name="timer" size={11} /> 만료 스케줄러 10분 주기
          </span>
        }
      />

      <Tabs
        items={[
          { key: 'all', label: '전체 결제', count: base.length },
          { key: 'vbank', label: '가상계좌', count: base.filter((r) => r.method === '가상계좌').length },
          { key: 'refund', label: '취소 · 환불', count: refunds.length },
          { key: 'pg', label: 'PG 연동 설정' },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {tab !== 'pg' && (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          selectable
          masked={masked}
          pageSize={15}
          countLabel={
            <>
              결제 <b>{rows.length}</b>건 · 합계 <b>{won(sum(rows))}</b>
            </>
          }
          toolbar={
            <>
              {tab === 'vbank' && (
                <button className="btn">
                  <Icon name="send" size={14} /> 입금 안내 재발송
                </button>
              )}
              {tab === 'refund' && (
                <button className="btn">
                  <Icon name="refresh-cw" size={14} /> 환불 재시도
                </button>
              )}
              <MaskToggle masked={masked} onChange={setMasked} />
              <ExcelButton filename={`결제내역_${tab}`} columns={COLUMNS} rows={rows} masked={masked} />
            </>
          }
        />
      )}

      {tab === 'pg' && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="link" size={15} />
              </span>
              PG 연동 설정
            </div>
            <div className="r">
              <span className="mk brandnew">연동정보 수급 전 · 편집 불가</span>
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(['급식비', '교습비'] as Item[]).map((item) => (
              <div key={item} className="link-box" style={{ display: 'block' }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 7 }}>
                  {item === '급식비' ? '급식 결제' : '교습비 · 특강비 · 등록비 결제'}
                </div>
                <div className="kv">
                  <div className="row">
                    <span className="k">PG사</span>
                    <span className="v">{PG_OF[item]}</span>
                  </div>
                  <div className="row">
                    <span className="k">지원 수단</span>
                    <span className="v">카드 · 가상계좌{item === '급식비' ? ' · 간편결제' : ''}</span>
                  </div>
                  <div className="row">
                    <span className="k">취소 정책</span>
                    <span className="v">
                      {item === '급식비'
                        ? '앱 3일 전 취소 시 PG 자동환불 / 관리자 취소는 즉시 처리'
                        : '환불 기준은 청구기준 관리(관리자 > 수납관리)에서 정의'}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">미확정</span>
                    <span className="v" style={{ color: 'var(--amber)', fontWeight: 700 }}>
                      {item === '급식비' ? 'E-3 연동정보(키·웹훅 URL·테스트 계정)' : 'D-9 결제 개발주체 · 정산주기'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export const paymentGateMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-05 ▾</button>
      <button className="btn">
        <Icon name="file-spreadsheet" size={14} /> 정산 대사
      </button>
    </>
  ),
}
