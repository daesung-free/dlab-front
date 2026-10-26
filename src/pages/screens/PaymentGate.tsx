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
import { useAcademy } from '../../auth/AcademyContext'
import {
  BILLING_TYPE_LABEL,
  PAY_METHOD_LABEL,
  listReceiptStatus,
  type BillingType,
  type ReceiptRow,
} from '../../api/billing'
import { REFUND_STATUS_LABEL, listRefunds, type RefundView } from '../../api/refunds'
import {
  PG_CHANNEL_LABEL,
  PG_PURPOSE_LABEL,
  listPgSites,
  setPgSiteActive,
  type PgSite,
} from '../../api/pgSites'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
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
 * ★★ **「결제는 서버에 없다」가 아니었다**(2026-10-26 확인). 청구·결제·환불 도메인이
 *   이미 있고 운영에 실제 데이터가 있다 — 이 화면이 오래 목업이었던 이유는
 *   **KCP 실가맹점 값이 없어서**(지금은 스테이징 가맹점)이지 코드가 없어서가 아니다.
 *
 *   받은 결제·환불 내역    ✅ 실연동 (아래 탭들)
 *   결제창 호출(카드 승인)  ❌ 실가맹점 전환 후
 *
 * ★ **거래 목록 경로가 따로 없다.** 수납현황(`/receipt-status`)이 청구마다 `payments[]` 를
 *   함께 주므로 **청구 × 결제로 펼쳐** 쓴다. 청구마다 N번 부르던 방식이 아니다.
 *
 * ⚠ PG사가 급식(E-3)과 등록비(D-9)로 나뉘어 있어 상태값·웹훅 규격이 서로 다를 수 있다
 *
 * ⚠ 화면 문구에서 내부 사정을 뺐다(2026-09-10). 클라이언트가 보는 URL 이라 이슈 코드와
 *   '7종 상태모델 초안' 같은 말을 화면에 두지 않는다. 근거는 위 주석에 그대로 있다.
 *   · 가상계좌는 "발급 → 입금대기 → 입금완료 / 만료" 라는 별도 생애주기를 가진다
 *   · 앱 취소(3일 전 자동환불)와 관리자 취소(즉시)는 환불 트랜잭션 성격이 다르다 */

/* ── 거래 한 줄 ──
 *
 * ★ **서버에 「결제 거래 목록」 경로가 따로 없다.** 수납현황(`/receipt-status`)이 청구마다
 *   `payments[]` 를 함께 주므로, 그것을 **청구 × 결제로 펼쳐** 거래 목록을 만든다.
 *   청구 단위로 N번 부르던 예전 방식과 달리 한 번에 받는다.
 *
 * ★ **취소된 결제는 애초에 안 온다**(`billing.ts` 의 `PaymentView` 주석). 그래서 이 표의
 *   행은 전부 살아 있는 결제다 — 상태 칸이 늘 「결제완료」인 것이 정상이고, 취소·환불은
 *   성격이 달라 **별도 탭**에서 환불 경로로 본다.
 */
interface PayRow {
  id: string
  /** 결제 시각(ISO) */
  at: string
  /** PG 전표번호. 가상계좌·현금은 비어 있을 수 있다 */
  txId: string | null
  studentNo: string
  name: string
  /** 청구 이름 — "2026년 10월 교습비" */
  billingName: string
  item: BillingType
  method: string
  amount: number
  billingId: number
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

/** ISO → 'MM-DD HH:mm'. 연도는 검색 조건이 이미 고정하므로 줄에서 뺀다 */
function dateTime(iso: string | null): string {
  if (iso === null || iso === '') return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const ITEM_CODES: BillingType[] = ['TUITION', 'MEAL', 'LECTURE', 'ETC']
/** 서버가 받는 결제수단 코드. ★ 가상계좌는 `VBANK` 가 아니라 `VIRTUAL_ACCOUNT` 다 */
const METHOD_CODES = ['CARD', 'VIRTUAL_ACCOUNT', 'CASH', 'TRANSFER'] as const
const METHOD_CHIP_LABEL: Record<string, string> = {
  CARD: '카드',
  VIRTUAL_ACCOUNT: '가상계좌',
  CASH: '현금',
  TRANSFER: '계좌이체',
}
const CHIP_TO_METHOD = new Map(Object.entries(METHOD_CHIP_LABEL).map(([k, v]) => [v, k]))
const CHIP_TO_ITEM = new Map(ITEM_CODES.map((c) => [BILLING_TYPE_LABEL[c], c]))

const FIELDS: Field[] = [
  { type: 'dateRange', name: 'date', label: '결제일', presets: true, span: 2 },
  { type: 'text', name: 'keyword', label: '학생 · 거래번호', placeholder: '이름 · 학번 · 전표번호', span: 2 },
  {
    type: 'select',
    name: 'item',
    label: '결제 항목',
    options: ITEM_CODES.map((c) => ({ value: BILLING_TYPE_LABEL[c], label: BILLING_TYPE_LABEL[c] })),
  },
  {
    type: 'chips',
    name: 'method',
    label: '결제수단',
    options: METHOD_CODES.map((c) => METHOD_CHIP_LABEL[c]),
    multiple: true,
  },
  {
    /* ★ **지우지 않고 막는다**(CLAUDE.md 4). 살아 있는 결제만 오므로 상태로 거를 것이 없고,
         칸을 지우면 「원래 없던 조건」으로 보여 나중에 요청할 것이 사라진다.
       ★ 살려두면 더 나쁘다 — 골라도 결과가 안 바뀌는 것을 담당자는 「필터 고장」이 아니라
         「해당 데이터가 원래 그만큼」으로 읽는다. */
    type: 'chips',
    name: 'status',
    label: '상태',
    options: ['결제완료', '입금대기', '결제취소', '부분환불', '결제실패', '기한만료'],
    multiple: true,
    disabled: true,
    disabledReason: '취소·환불은 「취소 · 환불」 탭에서 봅니다. 이 목록에는 완료된 결제만 옵니다.',
  },
  {
    type: 'chips',
    name: 'channel',
    label: '채널',
    options: ['앱', '데스크'],
    disabled: true,
    disabledReason: '앱에서 한 결제인지 데스크에서 받은 것인지가 아직 기록되지 않습니다.',
  },
]

const COLUMNS: Column<PayRow>[] = [
  { key: 'at', header: '결제일시', width: '122px', sortable: true, value: (r) => r.at, render: (r) => dateTime(r.at) },
  {
    key: 'txId',
    header: '거래번호',
    width: '128px',
    sortable: true,
    value: (r) => r.txId ?? '',
    /* ★ 가상계좌·현금은 전표번호가 없다 — **빈 것이 정상**이라 「미제공」이 아니라 '-' 다 */
    render: (r) =>
      r.txId === null || r.txId === '' ? (
        <span style={{ color: 'var(--ink-3)' }}>-</span>
      ) : (
        <code style={{ fontSize: 10.5 }}>{r.txId}</code>
      ),
  },
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '78px', mask: 'name', value: (r) => r.name },
  { key: 'billingName', header: '청구', sortable: true, value: (r) => r.billingName },
  {
    key: 'item',
    header: '항목',
    width: '78px',
    align: 'center',
    sortable: true,
    value: (r) => BILLING_TYPE_LABEL[r.item] ?? r.item,
  },
  {
    key: 'method',
    header: '수단',
    width: '82px',
    align: 'center',
    sortable: true,
    /* 서버가 모르는 코드를 보내도 **그대로 보여준다** — 영문이 보이면 라벨을 보태면 되지만,
       빈칸이면 결제가 없는 것으로 읽힌다 */
    value: (r) => PAY_METHOD_LABEL[r.method as keyof typeof PAY_METHOD_LABEL] ?? r.method,
  },
  {
    key: 'amount',
    header: '금액',
    width: '110px',
    align: 'right',
    sortable: true,
    value: (r) => r.amount,
    render: (r) => <b>{won(r.amount)}</b>,
  },
  {
    key: 'status',
    header: '상태',
    width: '86px',
    align: 'center',
    /* ★ 취소분은 응답에 아예 안 온다. 그래서 여기 남은 행은 전부 살아 있는 결제다 */
    value: () => '결제완료',
    render: () => <span className="mk verified">결제완료</span>,
  },
]

/** 취소 · 환불 탭. 거래와 축이 달라 **표를 따로 쓴다** — 합치면 환불액이 결제액처럼 더해진다 */
const REFUND_COLUMNS: Column<RefundView>[] = [
  {
    key: 'createdAt',
    header: '처리일시',
    width: '122px',
    sortable: true,
    value: (r) => r.createdAt ?? '',
    render: (r) => dateTime(r.createdAt ?? null),
  },
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo ?? '-' },
  { key: 'studentName', header: '이름', width: '78px', mask: 'name', value: (r) => r.studentName ?? '-' },
  {
    key: 'paidAmount',
    header: '납부액',
    width: '108px',
    align: 'right',
    sortable: true,
    value: (r) => r.paidAmount ?? 0,
    render: (r) => (r.paidAmount === undefined ? '-' : won(r.paidAmount)),
  },
  {
    key: 'refundAmount',
    header: '환불액',
    width: '120px',
    align: 'right',
    sortable: true,
    value: (r) => r.refundAmount,
    /* ★★ **음수면 돌려주는 게 아니라 더 받아야 한다.** 0 으로 자르거나 절댓값으로 그리면
         담당자가 **반대로 송금한다.** 방향을 글자로도 적는다 */
    render: (r) =>
      r.refundAmount < 0 ? (
        <b style={{ color: 'var(--red)' }}>추가 징수 {won(-r.refundAmount)}</b>
      ) : (
        <b>{won(r.refundAmount)}</b>
      ),
  },
  {
    key: 'usedDays',
    header: '이용일수',
    width: '84px',
    align: 'center',
    sortable: true,
    value: (r) => r.usedDays ?? 0,
    /* ★ 출석일수가 아니다 — 경과한 날이라 결석해도 줄지 않는다(refunds.ts 주석) */
    render: (r) => (r.usedDays === undefined ? '-' : `${r.usedDays}일`),
  },
  {
    key: 'status',
    header: '상태',
    width: '96px',
    align: 'center',
    sortable: true,
    value: (r) => (r.status === undefined ? '' : REFUND_STATUS_LABEL[r.status]),
    render: (r) => {
      if (r.status === undefined) return '-'
      const cls = r.status === 'DONE' ? 'verified' : r.status === 'FAILED' ? 'brandnew' : 'supplement'
      return (
        <span className={`mk ${cls}`} title={r.failReason ?? undefined}>
          {REFUND_STATUS_LABEL[r.status]}
        </span>
      )
    },
  },
  {
    key: 'transferredAt',
    header: '이체',
    width: '112px',
    align: 'center',
    sortable: true,
    value: (r) => r.transferredAt ?? '',
    /* 환불 결정과 **실제 송금은 다른 일이다.** 비어 있으면 아직 돈이 안 나갔다 */
    render: (r) =>
      r.transferredAt === null || r.transferredAt === undefined ? (
        <span className="mk supplement">이체 전</span>
      ) : (
        dateTime(r.transferredAt)
      ),
  },
]

function one(v: unknown): string | undefined {
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : undefined
  if (typeof v === 'string' && v !== '') return v
  return undefined
}

function many(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v !== '') return [v]
  return []
}

function Content() {
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)
  /* selectable 만으로는 체크박스가 안 눌린다 — DataTable 이 제어 컴포넌트다 */
  const [sel, setSel] = useState<string[]>([])
  const { academyId, ready: academyReady } = useAcademy()

  /* ★ **연도가 필수다.** 안 보내면 400 이라 화면이 빈 것처럼 보인다.
       검색에서 고른 기간의 **시작 연도**를 쓴다 — 기간을 안 고르면 올해다. */
  const dateFrom = one((query as Record<string, unknown>).date_from ?? (query as Record<string, unknown>).dateFrom)
  const dateTo = one((query as Record<string, unknown>).date_to ?? (query as Record<string, unknown>).dateTo)
  const year = Number((dateFrom ?? '').slice(0, 4)) || new Date().getFullYear()

  const payParams = useMemo(() => {
    const methods = many((query as Record<string, unknown>).method)
      .map((label) => CHIP_TO_METHOD.get(label))
      .filter((v): v is string => v !== undefined)
    const item = one((query as Record<string, unknown>).item)
    const type = item === undefined ? undefined : CHIP_TO_ITEM.get(item)
    return {
      year,
      academyId: academyId ?? undefined,
      from: dateFrom,
      to: dateTo,
      keyword: one((query as Record<string, unknown>).keyword),
      type: type === undefined ? undefined : [type],
      /* ★ 서버가 **한 개만** 받는다. 여러 개 고르면 첫 번째만 보내고 나머지는
           화면에서 거른다 — 조용히 무시하면 「필터가 안 먹는다」가 된다 */
      method: methods.length === 1 ? methods[0] : undefined,
    }
  }, [query, academyId, year, dateFrom, dateTo])

  const receipts = useServerData({
    fetcher: listReceiptStatus,
    params: payParams,
    enabled: academyId !== null,
    errorMessage: '결제 내역을 불러오지 못했습니다.',
  })

  /** 청구 × 결제로 펼친다. 한 청구에 결제가 여럿일 수 있다(부분 납부·재결제) */
  const payRows: PayRow[] = useMemo(() => {
    const picked = many((query as Record<string, unknown>).method)
      .map((label) => CHIP_TO_METHOD.get(label))
      .filter((v): v is string => v !== undefined)
    const rows = (receipts.data ?? []).flatMap((r: ReceiptRow) =>
      (r.payments ?? []).map((pay) => ({
        id: `${r.billingId}-${pay.id}`,
        at: pay.paidAt,
        txId: pay.pgTid,
        studentNo: r.studentNo ?? '-',
        name: r.studentName,
        billingName: r.name,
        item: r.billingType,
        method: pay.method as string,
        amount: pay.amount,
        billingId: r.billingId,
      })),
    )
    /* 서버가 한 개만 거르므로 2개 이상 고른 경우는 여기서 마저 거른다 */
    const byMethod = picked.length > 1 ? rows.filter((r) => picked.includes(r.method)) : rows
    return tab === 'vbank' ? byMethod.filter((r) => r.method === 'VIRTUAL_ACCOUNT') : byMethod
  }, [receipts.data, query, tab])

  const refundParams = useMemo(
    () => ({ academyId: academyId ?? 0, year }),
    [academyId, year],
  )
  const refunds = useServerData({
    /* ★ 인자 2개짜리라 객체로 감싼다 — `useServerData` 는 params 하나를 넘긴다 */
    fetcher: (prm: { academyId: number; year: number }) => listRefunds(prm.academyId, prm.year),
    params: refundParams,
    enabled: academyId !== null && tab === 'refund',
    errorMessage: '환불 내역을 불러오지 못했습니다.',
  })

  /* ── PG 연동 설정 ── */
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

  /* ★★ **숫자를 지어내지 않는다.** 전에는 예시 데이터를 합쳐 「결제 완료 55,472,000원
     · 70건」을 띄우고 있었다 — 아래 표는 비어 있는데 위에는 돈이 찍혀 있어 실제 집계로
     읽혔다. 지금은 **받아온 거래를 그대로 센다.** 못 세는 칸은 여전히 '-' 다. */
  const paidSum = payRows.reduce((a, r) => a + r.amount, 0)
  const refundList = refunds.data ?? []
  const refundSum = refundList.reduce((a, r) => a + Math.max(0, r.refundAmount), 0)

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="wallet" size={13} /> 결제 완료
          </div>
          <div className="v">{receipts.loading && receipts.data === null ? '…' : won(paidSum)}</div>
          <div className="d">{payRows.length}건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="refresh-cw" size={13} /> 취소 · 환불
          </div>
          {/* ★ 환불은 그 탭을 열어야 읽는다. 전 탭에서 미리 부르면 안 볼 수도 있는 조회를
                매번 하게 되고, 「0원」이 **아직 안 읽은 것**인지 **정말 없는 것**인지 섞인다 */}
          <div className="v">{tab === 'refund' ? won(refundSum) : '-'}</div>
          <div className="d">{tab === 'refund' ? `${refundList.length}건` : '탭을 열면 집계합니다'}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="banknote" size={13} /> 입금 대기
          </div>
          <div className="v">-</div>
          {/* 발급만 하고 입금이 안 된 가상계좌는 **청구 한 건씩** 봐야 알 수 있다 */}
          <div className="d">집계 준비 중</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 실패 · 만료
          </div>
          <div className="v">-</div>
          <div className="d">집계 준비 중</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="smartphone" size={13} /> 앱 결제 비중
          </div>
          <div className="v">-</div>
          <div className="d">집계 준비 중</div>
        </div>
      </div>

      {/* ★★ **두 사정을 섞지 않는다.** 결제창(카드 승인)은 대행사 연동을 기다리지만,
             **받은 결제 내역은 지금도 실제 값이다.** 「연동 준비 중」만 크게 적어 두면
             아래 표의 진짜 금액까지 예시로 읽힌다 — 반대로 아무 말도 없으면 카드 결제가
             왜 안 생기는지 알 수 없다. 그래서 **무엇이 되고 무엇이 안 되는지**를 가른다. */}
      <div className="note-box">
        <div className="ic">
          <Icon name="info" size={17} />
        </div>
        <div>
          <div className="tt">결제창 연동만 준비 중입니다</div>
          <div className="tx">
            아래 <b>결제 내역과 환불 내역은 실제 값</b>입니다. 결제 대행사 연동이 끝나지 않아
            <b> 이 화면에서 새 결제를 일으키는 것</b>만 아직 되지 않습니다.
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
          /* ★ 탭 숫자도 **예시 데이터를 센 것**이었다. 표가 빈 채로 「전체 결제 93」이
             붙어 있으면 **93건이 어딘가 있다고 읽는다** */
          { key: 'all', label: '전체 결제' },
          { key: 'vbank', label: '가상계좌' },
          { key: 'refund', label: '취소 · 환불' },
          { key: 'pg', label: 'PG 연동 설정' },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {academyId === null && academyReady && (
        <div className="note-box">지점을 먼저 선택하세요. 결제 내역은 지점 단위로 조회합니다.</div>
      )}

      {(receipts.error !== null || refunds.error !== null) && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {receipts.error ?? refunds.error}
        </div>
      )}

      {tab === 'vbank' && (
        /* ★ **발급했는데 아직 입금이 안 된 건은 여기 안 나온다.** 이 표는 「입금된 가상계좌」다 —
             그 말을 안 하면 담당자가 **미입금 건이 없다고 읽는다.** 발급 내역 전체를 훑는
             경로가 서버에 없어(청구 한 건 단위) 지금은 수납현황에서 청구별로 본다 */
        <div className="note-box">
          <div>
            <b>입금이 확인된 가상계좌</b>만 표시됩니다. 발급 후 아직 입금되지 않은 건은 수납현황에서
            청구별로 확인해 주시기 바랍니다.
          </div>
        </div>
      )}

      {(tab === 'all' || tab === 'vbank') && (
        <DataTable
          columns={COLUMNS}
          rows={payRows}
          rowKey={(r) => r.id}
          selectable
          selected={sel}
          onSelectedChange={setSel}
          masked={masked}
          loading={receipts.loading}
          pageSize={15}
          emptyText={
            tab === 'vbank'
              ? '입금이 확인된 가상계좌 결제가 없습니다.'
              : '조건에 맞는 결제 내역이 없습니다.'
          }
          countLabel={
            <>
              결제 <b>{payRows.length}</b>건 · 합계 <b>{won(paidSum)}</b>
            </>
          }
          toolbar={
            <>
              {tab === 'vbank' && (
                /* 입금 안내 재발송 경로가 서버에 없다. 키오스크 쪽과 달리 **만들기로 한 것**이라
                   준비 중으로 둔다 */
                <button className="btn" disabled data-soon title="준비 중입니다">
                  <Icon name="send" size={14} /> 입금 안내 재발송
                </button>
              )}
              <MaskToggle masked={masked} onChange={setMasked} />
              {/* ★ 이제 **실제 행이 물린다.** 예전에는 표가 빈 채로 예시가 내려받혔다 */}
              <ExcelButton
                filename={`결제내역_${tab === 'vbank' ? '가상계좌' : '전체'}_${year}`}
                columns={COLUMNS}
                rows={payRows}
                masked={masked}
              />
            </>
          }
        />
      )}

      {tab === 'refund' && (
        <DataTable
          columns={REFUND_COLUMNS}
          rows={refundList}
          rowKey={(r) => String(r.id ?? r.billingId ?? '')}
          masked={masked}
          loading={refunds.loading}
          pageSize={15}
          emptyText="환불·취소 내역이 없습니다."
          countLabel={
            <>
              환불 <b>{refundList.length}</b>건 · 합계 <b>{won(refundSum)}</b>
              {/* ★ 추가 징수 건은 **합계에서 뺀다**(음수). 섞으면 돌려준 돈이 줄어 보인다 */}
              {refundList.some((r) => r.refundAmount < 0) && (
                <span className="mk brandnew" style={{ marginLeft: 6 }}>
                  추가 징수 {refundList.filter((r) => r.refundAmount < 0).length}건 별도
                </span>
              )}
            </>
          }
          toolbar={
            <>
              <MaskToggle masked={masked} onChange={setMasked} />
              <ExcelButton
                filename={`환불내역_${year}`}
                columns={REFUND_COLUMNS}
                rows={refundList}
                masked={masked}
              />
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
              /* ⚠️ 운영은 지금 0건이다(MID 를 받아 두고 아직 넣지 않았다). 「없다」로만
                 끝내면 담당자가 **화면 고장으로 읽는다** */
              emptyText={pg.error ?? '등록된 상점이 없습니다. 결제 대행사에서 받은 상점 정보를 먼저 등록해야 합니다.'}
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
      {/* ★ 「기간 선택」을 뺐다. 본문 검색에 결제일 기간이 있는데 헤더에 같은 이름의
             눌리지 않는 버튼을 두면 **본문 쪽이 고장난 것처럼** 읽힌다. 헤더는 본문과
             상태를 공유하지 못해(CLAUDE.md 5-1) 기간을 넘겨 줄 수도 없다. */}
      <button className="btn" disabled data-soon title="준비 중입니다">
        <Icon name="file-spreadsheet" size={14} /> 정산 대사
      </button>
    </>
  ),
}
