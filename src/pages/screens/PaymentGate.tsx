import { useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  Modal,
  SearchForm,
  useServerData,
  type Column,
  type Field,
  type SearchValues,
} from '../../components/common'
import { ApiError } from '../../api/client'
import {
  PG_CHANNEL_LABEL,
  PG_PURPOSE_LABEL,
  listPgSites,
  setPgSiteActive,
  type PgSite,
} from '../../api/pgSites'
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
 *
 * ⚠ 화면 문구에서 내부 사정을 뺐다(2026-09-10). 클라이언트가 보는 URL 이라 이슈 코드와
 *   '7종 상태모델 초안' 같은 말을 화면에 두지 않는다. 근거는 위 주석에 그대로 있다.
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
  /* selectable 만으로는 체크박스가 안 눌린다 — DataTable 이 제어 컴포넌트다 */
  const [sel, setSel] = useState<string[]>([])

  /* ── PG 연동 설정 — **이 탭만 실연동이다** ──────────────────────────
     ★ 나머지 탭은 **붙일 경로가 없다.** 결제 목록이 `billingId` 단위라 전체를 훑을 수
       없다 — 결제 기록은 수납현황의 **청구 한 건**에서 본다(API_GAPS 42부). */
  const pg = useServerData({
    fetcher: listPgSites,
    params: useMemo(() => ({}), []),
    errorMessage: 'PG 연동 설정을 불러오지 못했습니다.',
  })
  const [pgBusy, setPgBusy] = useState(false)
  const [pgErr, setPgErr] = useState<string | null>(null)
  /** 중지는 되돌릴 수 있지만 **그동안 결제가 안 만들어진다** — 한 번 더 묻는다 */
  const [toggling, setToggling] = useState<PgSite | null>(null)

  async function runToggle(site: PgSite) {
    setPgBusy(true)
    setPgErr(null)
    try {
      await setPgSiteActive(site.id, !site.active)
      pg.reload()
      setToggling(null)
    } catch (e) {
      setPgErr(e instanceof ApiError ? e.message : '바꾸지 못했습니다.')
    } finally {
      setPgBusy(false)
    }
  }

  const PG_COLUMNS: Column<PgSite>[] = [
    { key: 'academy', header: '지점', width: '92px', value: (r) => r.academyName ?? '전 지점' },
    {
      key: 'purpose',
      header: '용도',
      width: '80px',
      align: 'center',
      value: (r) => PG_PURPOSE_LABEL[r.purpose] ?? r.purpose,
    },
    {
      key: 'channel',
      header: '결제 방식',
      width: '100px',
      align: 'center',
      value: (r) => PG_CHANNEL_LABEL[r.channel] ?? r.channel,
    },
    { key: 'displayName', header: '이름', value: (r) => r.displayName },
    { key: 'siteCd', header: '상점 코드', width: '130px', value: (r) => r.siteCd },
    { key: 'vendor', header: 'PG사', width: '90px', value: (r) => r.vendorName ?? '-' },
    {
      key: 'ready',
      header: '상태',
      width: '104px',
      align: 'center',
      value: (r) => (!r.active ? '중지' : r.ready ? '연동 완료' : '연동 대기'),
      /* ★★ **「사용」과 「지금 결제가 되는가」는 다르다.** 등록만 해두고 인증키가 안 들어온
         상태가 있어서, 하나로 보여주면 **되는 줄 알고 링크를 보낸다** */
      render: (r) =>
        !r.active ? (
          <span className="mk">중지</span>
        ) : r.ready ? (
          <span className="mk verified">연동 완료</span>
        ) : (
          <span className="mk brandnew">연동 대기</span>
        ),
    },
    {
      key: 'act',
      header: '',
      width: '76px',
      align: 'center',
      value: () => '',
      render: (r) => (
        <button
          className="btn"
          style={{ padding: '4px 9px', fontSize: 11.5 }}
          disabled={pgBusy}
          onClick={() => setToggling(r)}
        >
          {r.active ? '중지' : '사용'}
        </button>
      ),
    },
  ]

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
          <div className="tt">결제 연동은 준비 중입니다</div>
          <div className="tx">
            결제 대행사와의 연동이 아직 끝나지 않아 <b>이 화면의 내용은 예시</b>입니다.
            실제 결제·환불 내역은 연동이 끝난 뒤에 표시됩니다.
          </div>
        </div>
      </div>

      <SearchForm
        fields={FIELDS}
        onSearch={setQuery}
        presetKey="PAYMENT"
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

      {/* ★ 표를 비운다. 위에 "준비 중"을 적어도 **15행 × 7쪽이 차 있으면 그 안내가 묻힌다** —
          거래번호(TX2026100000)와 금액(1,320,000원)까지 들어 있어 실데이터로 읽힌다.
          PG 연동 도메인 자체가 서버에 없어 채울 값이 없다 */}
      {tab !== 'pg' && (
        <DataTable
          columns={COLUMNS}
          rows={[]}
          rowKey={(r) => r.id}
          selectable
          selected={sel}
          onSelectedChange={setSel}
          masked={masked}
          pageSize={15}
          emptyText="결제 기록이 없습니다 — PG 연동이 아직 준비되지 않았습니다."
          countLabel={<>결제 <b>0</b>건</>}
          toolbar={
            <>
              {tab === 'vbank' && (
                <button className="btn" disabled data-soon title="준비 중입니다">
                  <Icon name="send" size={14} /> 입금 안내 재발송
                </button>
              )}
              {tab === 'refund' && (
                <button className="btn" disabled data-soon title="준비 중입니다">
                  <Icon name="refresh-cw" size={14} /> 환불 재시도
                </button>
              )}
              <MaskToggle masked={masked} onChange={setMasked} />
              <ExcelButton filename={`결제내역_${tab}`} columns={COLUMNS} rows={rows} masked={masked} />
            </>
          }
        />
      )}

      {toggling !== null && (
        <Modal
          title={`${toggling.displayName} 를 ${toggling.active ? '중지' : '사용'}할까요?`}
          sub={
            toggling.active
              ? '중지하면 이 지점·용도·방식으로는 결제를 만들 수 없습니다. 이미 받은 결제는 그대로 남습니다.'
              : '다시 사용하면 이 방식으로 결제를 만들 수 있습니다.'
          }
          confirmLabel={toggling.active ? '중지' : '사용'}
          danger={toggling.active}
          busy={pgBusy}
          error={pgErr}
          onConfirm={() => void runToggle(toggling)}
          onClose={() => setToggling(null)}
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
              <span className="mk supplement">
                {(pg.data ?? []).filter((x) => x.ready).length} / {(pg.data ?? []).length} 연동 완료
              </span>
            </div>
          </div>
          <div className="card-sec-b">
            {/* ★ 담당자가 할 수 있는 일만 적는다. 인증서·개인키는 서버가 갖고 있고
                화면에 보일 이유가 없다 — 보이면 캡처하는 순간 새어 나간다 */}
            <div className="note-box">
              <div>
                지점·용도·결제 방식마다 상점이 따로입니다. <b>「연동 대기」</b>는 등록은 됐지만 아직
                결제가 되지 않는 상태입니다.
              </div>
            </div>
            <DataTable
              columns={PG_COLUMNS}
              rows={pg.data ?? []}
              rowKey={(r) => String(r.id)}
              loading={pg.loading}
              emptyText={pg.error ?? '등록된 상점이 없습니다.'}
              countLabel={
                <>
                  상점 <b>{(pg.data ?? []).length}</b>건
                </>
              }
            />
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
      <button className="btn" disabled data-soon title="준비 중입니다">기간 선택 ▾</button>
      <button className="btn" disabled data-soon title="준비 중입니다">
        <Icon name="file-spreadsheet" size={14} /> 정산 대사
      </button>
    </>
  ),
}
