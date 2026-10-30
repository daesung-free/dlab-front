import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PaymentHistoryPrint } from './PaymentHistoryPrint'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  NotAllowed,
  SearchForm,
  type Column,
  type DateRangeValue,
  type Field,
  type SearchValues,
  Modal,
  todayStr,
} from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import {
  cancelCashReceipt,
  issueCashReceipt,
  listCashReceipts,
  RECEIPT_ID_LABEL,
  RECEIPT_PURPOSE_LABEL,
  RECEIPT_STATUS_LABEL,
  type CashReceipt,
  type ReceiptPurpose,
} from '../../api/cashReceipts'
import {
  closePaymentRequest,
  listPaymentRequests,
  PAY_METHOD_CODE_LABEL,
  PAY_METHOD_SELECTABLE,
  createPaymentRequest,
  issueVbank,
  recordTerminalPayment,
  type PayMethodCode,
  type PaymentRequestRow,
} from '../../api/paymentRequests'
import { useAcademy } from '../../auth/AcademyContext'
import { useAuth } from '../../auth/AuthContext'
import {
  BILLING_STATUS_LABEL,
  paymentLabel,
  BILLING_ITEM_LABEL,
  BILLING_TYPE_LABEL,
  PAY_METHOD_LABEL,
  createBilling,
  deleteBilling,
  exportReceiptStatus,
  deletePayment,
  getReceiptSummary,
  listReceiptStatus,
  recordPayment,
  type BillingType,
  type PayMethod,
  type ReceiptRow,
  type ReceiptSummary,
} from '../../api/billing'
import {
  SEAT_TYPE_LABEL,
  getFeeTable,
  getRemainingDays,
  issueAdmissionBilling,
  issueMonthlyBilling,
  issueMonthlyBillingsBulk,
  previewTuitionBilling,
  type BulkBillingResult,
  type TuitionBreakdown,
  type FeeTableRow,
  type SeatType,
} from '../../api/tuition'
import {
  listScholarshipMasters,
  listStudentScholarships,
  type ScholarshipMaster,
} from '../../api/masters'
import {
  executeRefund,
  listPendingTransfers,
  markRefundTransferred,
  previewRefund,
  REFUND_STATUS_LABEL,
  type RefundStatus,
  type RefundView,
} from '../../api/refunds'
import { GRADE_LABEL, searchStudents, type GradeType, type Student } from '../../api/students'
import { UnpaidNoticeButton, type UnpaidTarget } from './UnpaidNoticeButton'
import type { Mockup } from './types'
import '../../styles/forms.css'
import './payment.css'

/* F-4.8 수납현황 — /api/v1/admin/receipt-status
 *
 * 탭 3개 중 둘만 실연동이다.
 *   · 통합 매출장 · 미납자 관리 → /receipt-status (+ summary)
 *   · 할인 정책              → **API 없음.** 목업 그대로 둔다(아래 참고)
 *
 * ★ 청구 1건 = 한 달분이다. 한 학생이 여러 달 밀리면 행이 여러 개가 되므로
 *   '미납 건수'와 '미납 학생 수'가 다르다 — 서버 주석에도 그렇게 적혀 있다.
 *
 * ★ 결제 '거래' 축이 payments[] 로 들어왔다(2026-09-03). 결제일자·전표번호·결제수단을
 *   실제 값으로 그린다. **취소분은 빠져 있다** — 취소까지 세면 화면의 결제수단이
 *   "지금 실제로 결제된 수단"과 어긋나기 때문이다(서버 주석).
 *
 * ★ 한 청구에 결제가 여러 건일 수 있다(부분납). 컬럼은 마지막 결제를 대표로 보여주고
 *   여러 건이면 그 사실을 표시한다 — 합계는 receivedAmount 가 이미 갖고 있다.
 *
 * ★ 청구 등록·수납·취소를 여기에 붙였다(2026-09-14). 표는 조회용으로 두고 **모두 모달**이다.
 *   등록은 경로가 셋이다 — 교습비(월) · **입학 청구**(2026-09-25 추가) · 그 밖.
 *   ★ 입학 청구는 **입학금이 아니다.** 입학일이 1일이 아니면 **그 달 일할분 + 다음 달 정액**
 *     두 건이 한 번에 만들어진다(규정). 금액을 화면이 정하면 안 되는 청구다.
 *   교습비는 `POST /tuition/billings/monthly` 로 만든다 — 금액을 화면이 정하지 않고
 *   단가표와 교습일수를 서버가 본다. 그 밖(특강비·급식비·예외)은 금액을 직접 적는
 *   `POST /billings` 다. 둘을 바꿔 쓰면 단가표와 어긋난 금액이 조용히 들어간다.
 *
 * ★ 청구 취소는 **수납 거래를 먼저 지우고** 청구를 취소한다. 서버도 2026-09-16 부터
 *   같은 순서를 강제한다(수납이 남아 있으면 400). 그래도 모달이 수납액을 먼저 보여준다 —
 *   취소는 되돌릴 수 없고, 얼마가 함께 사라지는지는 누르기 전에 알아야 한다.
 *
 * ★ 아직 없는 것: 지점(행에는 없다. 조회가 지점 단위라 헤더로 대신한다).
 *
 * ★ 지점은 행에 없지만 조회 자체가 지점 단위다(academyId). 선택한 지점을 헤더에 보여준다.
 *   검색폼에 있던 '지점' 칸은 **뺐다** — 어디에도 안 쓰이는 칸이었고 값도 실재하지 않는
 *   지점(대치·평촌)이었다. 지점은 상단바에서 고른다. */

/* ★ **현금은 선택지에서 뺐다**(디랩 피드백 1013, 5-10 — "현금을 받지 않습니다").
     지난 기록에 현금 결제가 있으면 **표시는 그대로** 된다 — 라벨 맵은 건드리지 않는다.
     새로 선택할 수만 없게 하는 것이 목적이다. */
type Method = '카드' | '가상계좌' | '현금'
type Kind = '등록비' | '교습비' | '특강비' | '급식비'

/**
 * 청구 등록 입력.
 *
 * ★ `mode` 로 **경로가 셋으로 갈린다.** 교습비는 단가표를 서버가 보는 `monthly`,
 *   입학 청구는 입학일로 일할 계산하는 `admission`, 그 밖은 금액을 직접 적는 `etc` 다.
 *   한 모달에 담되 섞이지 않게 갈라 둔다.
 *
 * ★ 입학 청구를 `etc`(금액 직접 입력)로 넣지 않는다. 서버가 **그 달 교습비를 남은 교습일수로
 *   일할 계산**하고, 1일 입학이 아니면 **다음 달분까지 두 건**을 만든다 — 직원이 달력을
 *   세서 적을 값이 아니다(휴일이 지점마다 다르다).
 */
interface IssueDraft {
  mode: 'monthly' | 'admission' | 'etc'
  enrollmentId: string
  /** monthly */
  month: string
  /** admission — 학생을 고르면 학생 정보의 입학일로 채운다 */
  admissionDate: string
  /** admission — 남은 교습일수. 서버 제안값을 채워 두고 **데스크가 고칠 수 있게** 둔다 */
  remainingDays: string
  seatType: SeatType
  discountRate: string
  /** etc */
  name: string
  billingType: BillingType
  suppliedAmount: string
  discountAmount: string
  /** 공통 */
  dueDate: string
}

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const EMPTY_ISSUE: IssueDraft = {
  mode: 'monthly',
  enrollmentId: '',
  month: thisMonth(),
  admissionDate: '',
  remainingDays: '',
  seatType: 'GENERAL',
  discountRate: '',
  name: '',
  billingType: 'LECTURE',
  suppliedAmount: '',
  discountAmount: '',
  dueDate: '',
}

const KINDS: Kind[] = ['등록비', '교습비', '특강비', '급식비']
const METHODS: Method[] = ['카드', '가상계좌']

const FIELDS: Field[] = [
  { type: 'dateRange', name: 'period', label: '결제 기간', presets: true, span: 2 },
  { type: 'text', name: 'keyword', label: '이름 · 학번 · 전표번호', placeholder: '예: 이승민 / DS-2026-010001', span: 2 },
  { type: 'select', name: 'round', label: '청구기수', options: ['1기', '2기', '3기'].map((v) => ({ value: v, label: v })) },
  { type: 'chips', name: 'kind', label: '항목', options: KINDS, multiple: true },
  { type: 'chips', name: 'method', label: '결제수단', options: METHODS, multiple: true },
]

/* ★ '상태' 열은 두 축이 겹쳐 있다.
 *   - 납부 진행도(미납·부분 납부·완납)는 **금액**에서 나온다. 서버 enum 에 PARTIAL 이 없다.
 *   - 청구 생애주기(취소·기한 만료·환불)는 status 에서 나온다.
 *   목업이 열 하나라 생애주기가 종료된 건만 status 를 보여주고, 그 밖에는 금액으로 판정한다.
 *   status 만 찍었더니 절반 납부된 4건이 '미납'과 구분되지 않았다. */
const TERMINAL_STATUS = new Set(['CANCELLED', 'EXPIRED', 'REFUNDED'])

function statusText(r: ReceiptRow): string {
  if (TERMINAL_STATUS.has(r.status)) return BILLING_STATUS_LABEL[r.status] ?? r.status
  return paymentLabel(r)
}

const STATUS_TONE: Record<string, string> = {
  완납: 'verified',
  '부분 납부': 'supplement',
  미납: 'brandnew',
}

const wonOf = (n: number) => `${n.toLocaleString()}원`
/** `2026-11-15` → `11/15`. 대상월이 바로 앞에 있어 연도를 두 번 쓰지 않는다 */
const mdOf = (d: string) => d.slice(5).replace('-', '/')

/** 목업의 항목 이름 → 서버 billingType. 등록비는 서버에 대응 값이 없어 기타로 간다 */
const METHOD_TO_CODE: Record<Method, PayMethod> = { 카드: 'CARD', 가상계좌: 'VBANK', 현금: 'CASH' }

const KIND_TO_TYPE: Record<Kind, BillingType> = {
  등록비: 'ETC',
  교습비: 'TUITION',
  특강비: 'LECTURE',
  급식비: 'MEAL',
}

/** 대표 결제 = 마지막 거래. 부분납이면 여러 건이라 개수를 함께 보여준다 */
const lastPayment = (r: ReceiptRow) => (r.payments.length > 0 ? r.payments[r.payments.length - 1] : null)

const COLUMNS: Column<ReceiptRow>[] = [
  {
    key: 'paidAt',
    header: '결제일자',
    width: '110px',
    value: (r) => lastPayment(r)?.paidAt ?? '',
    render: (r) => {
      const p = lastPayment(r)
      if (!p) return <span style={{ color: 'var(--muted)' }}>-</span>
      return (
        <>
          {p.paidAt.slice(0, 10)}
          {r.payments.length > 1 && (
            <span style={{ color: 'var(--muted)', fontSize: 11 }} title={`결제 ${r.payments.length}건`}>
              {' '}
              +{r.payments.length - 1}
            </span>
          )}
        </>
      )
    },
  },
  {
    key: 'voucherNo',
    header: '전표번호',
    width: '150px',
    value: (r) => lastPayment(r)?.pgTid ?? '',
    render: (r) => {
      const p = lastPayment(r)
      // 가상계좌·현금은 PG 거래번호가 없다
      if (!p?.pgTid) return <span style={{ color: 'var(--muted)' }}>-</span>
      return <code style={{ fontSize: 11 }}>{p.pgTid}</code>
    },
  },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo ?? '-' },
  { key: 'studentName', header: '이름', width: '84px', mask: 'name', value: (r) => r.studentName },
  {
    /* ★★ **일할 청구만 기간을 괄호로 붙인다**(1016 피드백 2-6).
         > 「대상월보다 대상기간(10/15~10/31)으로 설정한 날짜가 확인되는 것이 용이」
       ★ **전부 괄호가 붙으면 중도입학 건이 눈에 안 띈다** — 그게 골라내야 할 것이다.
       ★ 시작일을 모르면 서버가 `wholeMonth: true` 로 내려준다. **역산하지 않는다** —
         `remainingDays` 는 교습일수 기준(설·추석 제외)이라 달력과 어긋난다 */
    key: 'serviceMonth',
    header: '대상월',
    width: '150px',
    align: 'center',
    value: (r) =>
      r.serviceMonth === null
        ? '-'
        : r.wholeMonth === false && r.serviceFrom && r.serviceTo
          ? `${r.serviceMonth} (${mdOf(r.serviceFrom)}~${mdOf(r.serviceTo)})`
          : r.serviceMonth,
  },
  {
    /* 1016 피드백 2-5 — 「장학명(수능, 평가원 등), 할인율 항목의 표기 필요」
       ★ **발행 시점 스냅샷**이라, 나중에 장학이 취소돼도 과거 청구의 근거가 남는다 */
    key: 'discountSource',
    header: '장학',
    width: '104px',
    align: 'center',
    value: (r) => r.discountSource ?? '-',
    render: (r) =>
      r.discountSource ? (
        <span className="mk verified">{r.discountSource}</span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
  {
    key: 'billingType',
    header: '항목',
    width: '82px',
    align: 'center',
    value: (r) => BILLING_TYPE_LABEL[r.billingType] ?? r.billingType,
    render: (r) => <span className="mk supplement">{BILLING_TYPE_LABEL[r.billingType] ?? r.billingType}</span>,
  },
  {
    key: 'method',
    header: '결제수단',
    width: '96px',
    align: 'center',
    value: (r) => [...new Set(r.payments.map((p) => p.method))].join(', '),
    render: (r) => {
      const methods = [...new Set(r.payments.map((p) => PAY_METHOD_LABEL[p.method] ?? p.method))]
      return methods.length > 0 ? methods.join(', ') : <span style={{ color: 'var(--muted)' }}>-</span>
    },
  },
  { key: 'year', header: '기수', width: '68px', align: 'center', value: (r) => r.year ?? '-' },
  { key: 'billedAmount', header: '청구액', width: '106px', align: 'right', value: (r) => r.billedAmount, render: (r) => wonOf(r.billedAmount) },
  {
    key: 'receivedAmount',
    header: '수납액',
    width: '106px',
    align: 'right',
    value: (r) => r.receivedAmount,
    render: (r) => (
      <span style={{ color: r.unpaid === 0 ? 'var(--ink)' : 'var(--red)', fontWeight: 700 }}>
        {wonOf(r.receivedAmount)}
      </span>
    ),
  },
  { key: 'dueDate', header: '납기일', width: '100px', align: 'center', value: (r) => r.dueDate ?? '-' },
  {
    key: 'status',
    header: '상태',
    width: '76px',
    align: 'center',
    value: (r) => statusText(r),
    render: (r) => {
      const t = statusText(r)
      return <span className={`mk ${STATUS_TONE[t] ?? ''}`}>{t}</span>
    },
  },
]

const UNPAID_COLUMNS: Column<ReceiptRow>[] = [
  ...COLUMNS.slice(2, 10),
  {
    key: 'unpaid',
    header: '미납액',
    width: '110px',
    align: 'right',
    value: (r) => r.unpaid,
    render: (r) => <b style={{ color: 'var(--red)', fontWeight: 800 }}>{wonOf(r.unpaid)}</b>,
  },
  /* ★ 행마다 보내는 버튼을 두지 않는다. **한 학생이 여러 달 밀리면 행이 여러 개**라
       행 단위로 보내면 같은 학부모에게 여러 통이 간다 — 묶어 보내는 것이 맞다.
       체크해서 위 「미납 안내 보내기」로 보낸다(선택한 건을 학생으로 묶는다). */
]

/* ══ 할인 정책 ══
 *
 * ⚠ 지금 문제 — 앱/웹 온라인 결제에서 할인이 반영되지 않는다.
 *   KCP 연동 자체는 됐는데 그 앞단(학원 시스템)이 할인 없는 '정가'를 그대로 넘기고 있다.
 *   즉 결제창에 정가가 뜨고, 할인은 나중에 수기 환불로 메꾸는 상태.
 *   → 결제 요청을 만들기 전에 할인을 적용해 '실제 청구액'을 산출하는 단계가 필요하다.
 *
 * ⚠ 계산 주체는 서버다. 이 화면은 정책을 입력하고 결과를 확인하는 곳이다.
 *   프론트가 계산한 금액을 그대로 KCP에 넘기면 결제 금액을 조작할 수 있다.
 *   서버가 같은 정책으로 재계산해 일치할 때만 결제창을 띄워야 한다.
 *
 * ⚠ 적용 순서가 금액을 바꾼다.
 *   정률 → 정액 순서와 정액 → 정률 순서의 결과가 다르므로 order를 정책에 못박는다. */

/* ★★ **예시 할인 정책 7건을 지웠다**(2026-10-26).
 *
 *   「수능 성적 장학 100%」·「형제 할인 10%」·「설명회 쿠폰 50,000원」처럼 코드·기간·중복
 *   가능 여부까지 지어내고 있었다. 탭 숫자에도 붙어 있어 **실제 운영 정책으로 읽혔다.**
 *
 * ★ **서버에 있는 것은 「장학」뿐이다**(`/masters/scholarship-masters`, 2026-10-26 실측
 *   — 전 지점 공통 5종). 형제 할인·재등록·조기납부·쿠폰은 **개념 자체가 서버에 없다.**
 *   만들어 보여주면 담당자가 「왜 형제 할인이 청구에 안 붙지」를 찾게 된다.
 *
 * ★ **등록·수정은 기초 관리에서 한다.** 같은 것을 두 화면에서 고치게 하면 어긋난다 —
 *   여기서는 **읽기만** 하고 어디서 고치는지 알려준다.
 *
 * ★★ **화면이 할인을 곱하지 않는다.** 예전에는 정가(`BASE_PRICE` — 이것도 지어낸 값이다)에
 *   화면이 순서대로 할인을 적용해 최종 금액을 보여줬다. 그런데 **서버 단가표가 할인율별
 *   금액을 이미 계산해서 준다**(`/tuition/fee-table`) — 게다가 **독서실비에는 할인이
 *   붙지 않는다.** 화면이 따로 곱하면 그 규칙을 놓쳐 **조용히 틀린 금액**이 나온다.
 *   그래서 계산기 자리를 **서버 단가표를 그대로 보여주는 자리**로 바꿨다.
 */


const DISCOUNT_COLUMNS: Column<ScholarshipMaster>[] = [
  {
    key: 'sortOrder',
    header: '순서',
    width: '58px',
    align: 'center',
    sortable: true,
    value: (r) => r.sortOrder ?? 0,
    render: (r) => (r.sortOrder === null ? '-' : r.sortOrder),
  },
  {
    key: 'code',
    header: '코드',
    width: '124px',
    sortable: true,
    value: (r) => r.code,
    render: (r) => <code style={{ fontSize: 10.5 }}>{r.code}</code>,
  },
  { key: 'name', header: '장학명', sortable: true, value: (r) => r.name },
  {
    key: 'discountRate',
    header: '할인율',
    width: '92px',
    align: 'right',
    sortable: true,
    value: (r) => r.discountRate,
    render: (r) => <b>{r.discountRate}%</b>,
  },
  {
    key: 'scope',
    header: '적용 범위',
    width: '104px',
    align: 'center',
    sortable: true,
    /* ★ `academyId` 가 null 이면 **전 지점 공통**이다. 지점 것과 섞어 보여주면
         어느 것을 고치는지 알 수 없다 */
    value: (r) => (r.academyId === null ? '전 지점' : '이 지점'),
    render: (r) => (
      <span className={`mk ${r.academyId === null ? 'verified' : 'supplement'}`}>
        {r.academyId === null ? '전 지점' : '이 지점'}
      </span>
    ),
  },
  {
    key: 'active',
    header: '사용',
    width: '80px',
    align: 'center',
    sortable: true,
    value: (r) => (r.active ? '사용' : '중지'),
    render: (r) => (
      <span className={`mk ${r.active ? 'verified' : 'brandnew'}`}>{r.active ? '사용' : '중지'}</span>
    ),
  },
  { key: 'memo', header: '메모', value: (r) => r.memo ?? '-' },
]

function BreakdownBox({ b }: { b: TuitionBreakdown }) {
  const line = (label: string, expr: string, amount: number) => (
    <tr>
      <td>{label}</td>
      <td style={{ color: 'var(--muted)', fontSize: 11.5 }}>{expr}</td>
      <td style={{ textAlign: 'right' }}>{wonOf(amount)}</td>
    </tr>
  )
  return (
    <div className="frow">
      <label>계산 내역</label>
      <div>
        <table className="mini-tbl">
          <tbody>
            {/* ★★ **`wholeMonth` 하나만 믿지 않는다.** 그 칸이 빠져 `undefined` 로 오면
                falsy 라 **월 전체 청구에 나눗셈 식이 붙는다** — 그 결과가 청구액과
                18원 어긋나 데스크가 「계산이 틀렸다」로 읽는다. 실제로 서버에서 한 번
                빠졌다(2026-10-16, 레코드 파생 메서드가 직렬화에서 누락).
                ★ **단가가 있어야만** 나눗셈을 쓴다. 서버는 월 전체에서 단가를 `null` 로
                  내리므로, 그 값이 곧 「나눗셈을 써도 되는가」의 답이다 */}
            {b.wholeMonth !== false || b.dailyTuition === null || b.remainingDays === null
              ? /* 월 전체 — 정액이다. 나눗셈을 적지 않는다 */
                [
                  line('교습비', '월 정액', b.suppliedTuition),
                  line('독서실비', '월 정액', b.suppliedStudyRoom),
                ]
              : [
                  line(
                    '교습비',
                    `${b.monthlyTuition.toLocaleString()} ÷ ${b.teachingDays}일 × ${b.remainingDays}일`,
                    b.suppliedTuition,
                  ),
                  line(
                    '독서실비',
                    `${b.monthlyStudyRoom.toLocaleString()} ÷ ${b.teachingDays}일 × ${b.remainingDays}일`,
                    b.suppliedStudyRoom,
                  ),
                ]}
            <tr>
              <td colSpan={2}>소계</td>
              <td style={{ textAlign: 'right' }}>{wonOf(b.suppliedTotal)}</td>
            </tr>
            {b.discountAmount > 0 && (
              <tr>
                <td colSpan={2}>할인 {b.discountRate}%</td>
                <td style={{ textAlign: 'right', color: 'var(--red)' }}>-{wonOf(b.discountAmount)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={2}>
                <b>청구액</b>
              </td>
              <td style={{ textAlign: 'right' }}>
                <b>{wonOf(b.billedAmount)}</b>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="hint">
          {b.rounding === 'FLOOR' ? '금액은 원 단위 버림으로 계산합니다.' : `절사 규칙: ${b.rounding}`}
          {b.wholeMonth === false && b.remainingDays !== null && (
            <> 교습일수 {b.remainingDays}일은 기본값이며, 수정 가능합니다.</>
          )}
        </div>
      </div>
    </div>
  )
}

function Content() {
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)
  const [tab, setTab] = useState('all')

  /* 단가표 조회 — 할인율별 금액을 **서버가 계산해서 준다**. 화면이 곱하지 않는다 */
  const [calcGrade, setCalcGrade] = useState<GradeType>('HIGH3')
  const [calcSeat, setCalcSeat] = useState<SeatType>('GENERAL')
  const [calcMonth, setCalcMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [calcFee, setCalcFee] = useState<FeeTableRow[] | null>(null)
  const [calcErr, setCalcErr] = useState<string | null>(null)
  const [calcBusy, setCalcBusy] = useState(false)
  const [schols, setSchols] = useState<ScholarshipMaster[] | null>(null)
  const [scholErr, setScholErr] = useState<string | null>(null)

  /* ── 실연동: 수납현황 ── */
  const { academyId } = useAcademy()
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [summary, setSummary] = useState<ReceiptSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 이 계정에 안 열린 화면인가(403). 숫자를 하나도 안 그린다 */
  const [denied, setDenied] = useState(false)

  const period = query.period as DateRangeValue | undefined
  const params = useMemo(() => {
    /* ★ 2026-09-25 부터 서버가 항목 **여럿**·검색어·결제수단을 받는다(목록·합계·엑셀이 같은 조건).
         그전에는 항목 하나만 받아 나머지를 화면에서 걸렀고, 그래서 합계가 목록과 어긋났다.
         결제수단만 아직 하나라 여럿 고르면 그것만 화면에서 거른다. */
    const kinds = Array.isArray(query.kind) ? (query.kind as Kind[]) : []
    const methods = Array.isArray(query.method) ? (query.method as Method[]) : []
    return {
      // 연도를 2026 으로 박아 두었었다 — 해가 바뀌면 조용히 작년 것을 보여준다. 기간 시작일의 해를 쓴다
      year: period?.from ? Number(period.from.slice(0, 4)) : new Date().getFullYear(),
      academyId: academyId ?? undefined,
      from: period?.from || undefined,
      to: period?.to || undefined,
      type: kinds.length > 0 ? kinds.map((k) => KIND_TO_TYPE[k]) : undefined,
      keyword: typeof query.keyword === 'string' && query.keyword.trim() !== '' ? query.keyword.trim() : undefined,
      method: methods.length === 1 ? METHOD_TO_CODE[methods[0]] : undefined,
    }
  }, [academyId, period?.from, period?.to, query.kind, query.keyword, query.method])

  const load = useCallback(async () => {
    /* ★ 지점을 고르기 전에는 부르지 않는다. 예전에는 academyId 없이 먼저 던지고
         선택한 뒤 다시 던져서, **화면에 들어갈 때마다 400 이 두 건씩** 쌓였다.
         화면은 결과적으로 정상으로 보여 아무도 몰랐다. */
    if (academyId === null) {
      setRows([])
      setSummary(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [list, sum] = await Promise.all([listReceiptStatus(params), getReceiptSummary(params)])
      setRows(list)
      setSummary(sum)
    } catch (err) {
      /* ★ 권한으로 막힌 것은 고장이 아니다 — 표를 0 으로 그리면 "오늘 0건" 으로 읽힌다 */
      if (err instanceof ApiError && err.code === 'FORBIDDEN') setDenied(true)
      setError(err instanceof ApiError ? err.message : '수납현황을 불러오지 못했습니다.')
      setRows([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => {
    void load()
  }, [load])

  /* 장학 종류 — ★ **연도 단위다.** `academyId` 를 안 넘기면 전 지점 공통이 온다.
     지점 전용 장학이 따로 있을 수 있어 둘을 합쳐 보여준다(화면에서 범위를 구분해 찍는다) */
  useEffect(() => {
    if (tab !== 'discount') return
    let cancelled = false
    const year = Number(calcMonth.slice(0, 4)) || new Date().getFullYear()
    void (async () => {
      try {
        const common = await listScholarshipMasters(year)
        const mine = academyId === null ? [] : await listScholarshipMasters(year, academyId)
        if (cancelled) return
        /* 같은 id 가 양쪽에 오면 한 번만 쓴다 */
        const seen = new Map<number, ScholarshipMaster>()
        for (const x of [...common, ...mine]) seen.set(x.id, x)
        setSchols([...seen.values()])
        setScholErr(null)
      } catch (e) {
        if (!cancelled) setScholErr(e instanceof ApiError ? e.message : '장학 종류를 불러오지 못했습니다.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, academyId, calcMonth])

  /* 단가표 — ★ 할인율별 금액을 **서버가 계산해서 준다.** 화면이 곱하지 않는다.
     ★ 독서실비에는 할인이 안 붙는다(tuition.ts 주석) — 그 규칙도 서버 쪽에 있다 */
  useEffect(() => {
    if (tab !== 'discount' || calcMonth === '') return
    let cancelled = false
    setCalcBusy(true)
    void (async () => {
      try {
        const r = await getFeeTable(calcMonth, calcGrade, calcSeat, academyId ?? undefined)
        if (cancelled) return
        setCalcFee(r)
        setCalcErr(null)
      } catch (e) {
        if (cancelled) return
        setCalcFee(null)
        setCalcErr(e instanceof ApiError ? e.message : '단가표를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setCalcBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, calcMonth, calcGrade, calcSeat, academyId])

  // 미납은 서버 조건(unpaidOnly)이 있지만, 같은 조회 결과에서 걸러도 값이 같다.
  // 요청을 하나 아끼려고 여기서 거른다 — unpaid 는 서버가 계산해준 값이다.
  /* 서버가 안 받는 조건(검색어 · 결제수단 · 항목 여럿)은 여기서 거른다. 이 목록은 서버가 조건 안의
     전량을 주므로 화면에서 걸러도 빠지는 줄이 없다. ★ 청구기수는 뜻이 정해지지 않아 아직 안 먹는다 */
  /* 서버가 못 받는 조건만 남았다 — 결제수단을 **둘 이상** 고른 경우다.
     하나면 서버가 거르므로 여기서는 아무것도 안 한다 */
  const filtered = useMemo(() => {
    const methods = Array.isArray(query.method) ? (query.method as Method[]).map((m) => METHOD_TO_CODE[m]) : []
    if (methods.length < 2) return rows
    return rows.filter((r) => r.payments.some((p) => methods.includes(p.method)))
  }, [rows, query.method])
  /** 화면에서 걸렀으면 서버 요약과 줄이 달라진다 — 그때는 합계를 걸러진 줄로 낸다 */
  const clientFiltered = filtered.length !== rows.length

  const unpaid = useMemo(() => filtered.filter((r) => r.unpaid > 0), [filtered])

  /* ── 환불 집행 (0820 규정 · 디랩 2026-10-12 확정) ──────────
   *
   * ★★ **「돌려준다」와 「더 받는다」를 가른다.** 규정이 정상가 기준 차감이라
   *   할인받은 학생은 **차감이 납부액을 넘는다** — 그때는 추가 징수다.
   *   「돌려드립니다」로 띄우면 **데스크가 반대로 처리한다.**
   * ★★ **집행 결과의 `status` 를 그대로 본다.** 200 이어도 `FAILED` 일 수 있다
   *   (PG 취소 거절). 「완료」로 띄우면 **돈이 안 갔는데 갔다고 기록**된다. */
  const [refund, setRefund] = useState<{
    row: ReceiptRow
    usedDays: string
    preview: RefundView | null
    busy: boolean
    err: string | null
    done: RefundView | null
  } | null>(null)

  /* 미리보기는 일수를 고칠 때마다 다시 본다 — **집행 전에** 금액과 방향을 봐야 뜻이 있다 */
  useEffect(() => {
    if (refund === null || refund.done !== null) return
    /* ★ **입력 전에는 계산하지 않는다.** 빈 칸이면 0일로 읽혀 **전액 환불**이 뜨는데,
       담당자가 그 금액을 보고 그대로 누를 수 있다 — 되돌릴 수 없는 일이다 */
    if (refund.usedDays.trim() === '') return
    const d = Number(refund.usedDays)
    if (!Number.isFinite(d) || d < 0) return
    let cancelled = false
    previewRefund(refund.row.billingId, d)
      .then((v) => !cancelled && setRefund((c) => (c && c.done === null ? { ...c, preview: v, err: null } : c)))
      .catch((e) =>
        !cancelled &&
        setRefund((c) =>
          c && c.done === null
            ? { ...c, preview: null, err: e instanceof ApiError ? e.message : '환불액을 계산하지 못했습니다.' }
            : c,
        ),
      )
    return () => {
      cancelled = true
    }
  }, [refund?.row.billingId, refund?.usedDays, refund?.done])

  /* ── 환불 이체 대기 ──────────────────────────────────────── */

  const [transfers, setTransfers] = useState<RefundView[]>([])
  const [transferBusy, setTransferBusy] = useState<number | null>(null)

  const loadTransfers = useCallback(async () => {
    if (academyId === null) {
      setTransfers([])
      return
    }
    try {
      setTransfers(await listPendingTransfers(academyId, new Date().getFullYear()))
    } catch {
      /* 서버가 아직 이 경로를 모르면 빈 목록으로 둔다 — 화면이 먼저 배포될 수 있다 */
      setTransfers([])
    }
  }, [academyId])

  useEffect(() => {
    void loadTransfers()
  }, [loadTransfers])

  async function markTransferred(r: RefundView) {
    if (r.id === undefined) return
    setTransferBusy(r.id)
    try {
      await markRefundTransferred(r.id)
      await loadTransfers()
    } catch (err) {
      setActErr(err instanceof ApiError ? err.message : '이체 완료로 바꾸지 못했습니다.')
    } finally {
      setTransferBusy(null)
    }
  }

  const transferColumns: Column<RefundView>[] = useMemo(
    () => [
      { key: 'studentNo', header: '학번', width: '104px', value: (r) => r.studentNo ?? '-' },
      { key: 'studentName', header: '이름', width: '90px', mask: 'name', value: (r) => r.studentName ?? '-' },
      {
        key: 'refundAmount',
        header: '환불액',
        width: '110px',
        align: 'right',
        value: (r) => r.refundAmount,
        render: (r) => <b>{wonOf(r.refundAmount)}</b>,
      },
      {
        key: 'status',
        header: '상태',
        width: '92px',
        align: 'center',
        value: (r) => (r.status ? (REFUND_STATUS_LABEL[r.status] ?? r.status) : '-'),
        render: (r) => {
          const st = r.status as RefundStatus | undefined
          /* ★ `FAILED` 는 **돈이 안 간 것**이다. 사유를 그대로 띄운다 */
          return (
            <>
              <span className={`mk ${st === 'FAILED' ? 'brandnew' : st === 'DONE' ? 'verified' : 'supplement'}`}>
                {st ? (REFUND_STATUS_LABEL[st] ?? st) : '-'}
              </span>
              {st === 'FAILED' && r.failReason && <div className="hint">{r.failReason}</div>}
            </>
          )
        },
      },
      { key: 'createdAt', header: '신청일', width: '110px', align: 'center', value: (r) => (r.createdAt ?? '').slice(0, 10) || '-' },
      {
        key: 'act',
        header: '',
        width: '104px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <button
            className="btn"
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            disabled={transferBusy !== null}
            onClick={() => void markTransferred(r)}
          >
            {transferBusy === r.id ? '처리 중…' : '이체 완료'}
          </button>
        ),
      },
    ],
    [transferBusy],
  )

  async function runRefund() {
    if (refund === null) return
    setRefund({ ...refund, busy: true, err: null })
    try {
      const r = await executeRefund(refund.row.billingId, Number(refund.usedDays))
      setRefund((c) => (c ? { ...c, busy: false, done: r } : c))
      void load()
    } catch (err) {
      setRefund((c) =>
        c ? { ...c, busy: false, err: err instanceof ApiError ? err.message : '환불을 처리하지 못했습니다.' } : c,
      )
    }
  }

  /* ── 일괄 청구(1016 피드백 2-1) ────────────────────────────
   * > 「매월 수백명의 학생을 설정하기에는 매우 번거로울 것 같습니다」
   *
   * ★ **누구에게 나가는지 보고 누른다.** 검색 조건을 보내 서버가 추리는 방식이면
   *   데스크가 **대상을 보지 못한 채** 수백 건이 발행된다 — 되돌릴 수 없는 일이다.
   * ★ **할인율은 학생마다 다르다.** 장학값을 끌어와 채워 두고 행마다 고칠 수 있게 둔다. */
  const [bulk, setBulk] = useState<{
    month: string
    dueDate: string
    seatType: SeatType
    rows: {
      enrollmentId: number
      name: string
      studentNo: string | null
      className: string | null
      rate: string
      source: string | null
      /** 마스터에 없는 장학 코드 — 취소 판정에서 빠진다 */
      unregistered: boolean
    }[] | null
    picked: string[]
    busy: boolean
    err: string | null
    result: BulkBillingResult | null
  } | null>(null)

  const { teacherOnly, readOnly } = useAuth()
  /* 장학은 담임·조회전용에게 막혀 있다 — 호출 자체를 안 한다 */
  const canSeeScholarship = !teacherOnly && !readOnly

  const openBulk = useCallback(() => {
    const m = thisMonth()
    const [y, mm] = m.split('-').map(Number)
    setBulk({
      month: m,
      /* 납기일을 비우면 통합 매출장에서 기간으로 좁힐 때 안 보인다 — 말일로 채운다 */
      dueDate: `${m}-${String(new Date(y, mm, 0).getDate()).padStart(2, '0')}`,
      seatType: 'GENERAL',
      rows: null,
      picked: [],
      busy: false,
      err: null,
      result: null,
    })
    void (async () => {
      try {
        /* ★ **서버가 `displayName` 을 준다.** 화면에서 코드→이름을 만들지 않는다 —
           화면마다 다르게 만들면 매출장·취소 판정·청구 근거가 **서로 다른 이름**을 본다
           (2026-10-20 서버 추가). */
        const res = await searchStudents({ academyId: academyId ?? undefined, status: 'ENROLLED', size: 500 })
        /* ★ 장학을 학생마다 읽는다. 500명이면 500번이라 **동시에 던지되** 실패는
           무시한다 — 장학이 없는 학생이 대부분이고, 못 읽었다고 청구를 막을 일은 아니다.
           ★ **담임·조회전용은 아예 안 부른다.** 그 계정은 장학이 403 이라 500번이
             전부 403 으로 떨어진다 — 점검 리포트가 403 으로 뒤덮인다.
             데스크(STAFF)는 읽을 수 있다(2026-10-16 서버가 열었다). */
        const rows = await Promise.all(
          res.rows.map(async (r) => {
            let rate = ''
            let source: string | null = null
            let unregistered = false
            if (!canSeeScholarship)
              return { enrollmentId: r.enrollmentId, name: r.name, studentNo: r.studentNo, className: r.className, rate, source, unregistered }
            try {
              const sch = (await listStudentScholarships(r.enrollmentId)).find((x) => x.discountRate !== null)
              if (sch) {
                rate = String(sch.discountRate)
                source = sch.displayName ?? sch.scholarshipType
                /* ★★ 마스터에 없는 코드면 **취소 판정이 이 학생을 건너뛴다.** 알려야 한다 */
                unregistered = sch.registered === false
              }
            } catch {
              /* 장학을 못 읽어도 청구는 할 수 있다 — 기본값 0으로 둔다 */
            }
            return {
              enrollmentId: r.enrollmentId,
              name: r.name,
              studentNo: r.studentNo,
              className: r.className,
              rate,
              source,
              unregistered,
            }
          }),
        )
        setBulk((v) => (v ? { ...v, rows } : v))
      } catch (e) {
        setBulk((v) =>
          v ? { ...v, rows: [], err: e instanceof ApiError ? e.message : '학생을 불러오지 못했습니다.' } : v,
        )
      }
    })()
  }, [academyId, canSeeScholarship])

  async function runBulk() {
    if (bulk === null || bulk.picked.length === 0) return
    setBulk({ ...bulk, busy: true, err: null })
    try {
      const targets = (bulk.rows ?? [])
        .filter((r) => bulk.picked.includes(String(r.enrollmentId)))
        .map((r) => ({
          enrollmentId: r.enrollmentId,
          seatType: bulk.seatType,
          discountRate: r.rate.trim() === '' ? undefined : Number(r.rate),
          /* 발행 시점 장학명을 박아 둔다 — 나중에 장학이 취소돼도 근거가 남는다 */
          discountSource: r.source ?? undefined,
        }))
      const result = await issueMonthlyBillingsBulk({
        month: bulk.month,
        dueDate: bulk.dueDate || undefined,
        targets,
      })
      setBulk((v) => (v ? { ...v, busy: false, result, picked: [] } : v))
      void load()
    } catch (err) {
      setBulk((v) =>
        v ? { ...v, busy: false, err: err instanceof ApiError ? err.message : '청구를 발행하지 못했습니다.' } : v,
      )
    }
  }

  /* ── 청구 등록 · 수납 · 취소 ── */

  const [students, setStudents] = useState<Student[]>([])
  const [issueOpen, setIssueOpen] = useState(false)
  const [issue, setIssue] = useState<IssueDraft>(EMPTY_ISSUE)
  const [pay, setPay] = useState<{ row: ReceiptRow; amount: string; method: PayMethod } | null>(null)
  /* 결제 요청. 「받아야 할 돈」(청구)과 「어떻게 받는가」(결제)는 다른 축이라 모달을 나눈다.
     ★ 결제만 모아 보는 화면은 못 만든다 — 목록 조회가 billingId 단위다(API_GAPS 42부) */
  const [payReq, setPayReq] = useState<{
    row: ReceiptRow
    kind: 'link' | 'terminal' | 'vbank'
    payMethod: PayMethodCode
    sendSms: boolean
    approvalNo: string
    cardName: string
    approvedAt: string
    bankCode: string
    days: string
  } | null>(null)
  const [payReqDone, setPayReqDone] = useState<PaymentRequestRow | null>(null)
  const [cancelRow, setCancelRow] = useState<ReceiptRow | null>(null)

  /* ── 현금영수증(1016 피드백 1-2) ──────────────────────────
   * 서버는 완성돼 있었는데 **화면이 없어 아무도 못 쓰고 있었다.**
   * ★ **수납 건마다** 낸다(`transactionId`). 청구 단위가 아니다 — 한 청구를 나눠 받으면
   *   영수증도 건별로 나간다. 그래서 어느 수납 건인지 **고르게** 한다.
   * ★ 발급분과 취소분을 **함께** 보여준다. 취소해도 행이 남는 것은 「발급한 적 없음」과
   *   구분하기 위해서다 — 신고 내역과 대조해야 한다. */
  const [rcp, setRcp] = useState<{
    row: ReceiptRow
    list: CashReceipt[] | null
    txId: string
    purpose: ReceiptPurpose
    idInfo: string
    busy: boolean
    err: string | null
  } | null>(null)

  const openReceipt = useCallback((row: ReceiptRow) => {
    /* 카드 수납은 대상이 아니라 고르는 목록에서도 뺀다 */
    const first = row.payments.find((p) => p.method !== 'CARD')
    setRcp({
      row,
      list: null,
      txId: first ? String(first.id) : '',
      purpose: 'PERSONAL',
      idInfo: '',
      busy: false,
      err: null,
    })
    listCashReceipts(row.billingId)
      .then((v) => setRcp((c) => (c && c.row.billingId === row.billingId ? { ...c, list: v } : c)))
      .catch((e) =>
        setRcp((c) =>
          c && c.row.billingId === row.billingId
            ? { ...c, list: [], err: e instanceof ApiError ? e.message : '영수증을 불러오지 못했습니다.' }
            : c,
        ),
      )
  }, [])

  async function runIssueReceipt() {
    if (rcp === null || rcp.txId === '' || rcp.idInfo.trim() === '') return
    setRcp({ ...rcp, busy: true, err: null })
    try {
      await issueCashReceipt({
        transactionId: Number(rcp.txId),
        purpose: rcp.purpose,
        idInfo: rcp.idInfo.replace(/[^0-9]/g, ''),
      })
      const list = await listCashReceipts(rcp.row.billingId)
      setRcp((c) => (c ? { ...c, list, busy: false, idInfo: '' } : c))
    } catch (err) {
      /* ★ 「카드사가 소득공제를 처리합니다」처럼 **담당자가 고칠 수 있는** 문구는 그대로 쓴다.
         ★ 다만 `PG_SITE_NOT_FOUND` 는 **우리 사정**이다 — 결제업체 등록이 안 끝난 것이라
           담당자가 할 수 있는 일이 없다. 「사이트코드」를 그대로 보여주면 데스크가 무엇을
           잘못했나 찾게 된다(CLAUDE.md 1-1) */
      setRcp((c) =>
        c
          ? {
              ...c,
              busy: false,
              err:
                err instanceof ApiError
                  ? err.code === 'PG_SITE_NOT_FOUND'
                    ? '현금영수증 발급은 아직 준비 중입니다.'
                    : err.message
                  : '발급하지 못했습니다.',
            }
          : c,
      )
    }
  }

  async function runCancelReceipt(id: number) {
    if (rcp === null) return
    setRcp({ ...rcp, busy: true, err: null })
    try {
      await cancelCashReceipt(id)
      const list = await listCashReceipts(rcp.row.billingId)
      setRcp((c) => (c ? { ...c, list, busy: false } : c))
    } catch (err) {
      setRcp((c) =>
        c ? { ...c, busy: false, err: err instanceof ApiError ? err.message : '취소하지 못했습니다.' } : c,
      )
    }
  }
  const [actBusy, setActBusy] = useState(false)
  const [actErr, setActErr] = useState<string | null>(null)
  const [actDone, setActDone] = useState<string | null>(null)
  /* 교습비는 서버가 금액을 정한다. 그 값을 등록 전에 보여주지 않으면 얼마가 청구될지
     모르고 누르게 된다 — 단가표를 미리 읽어 합계를 띄운다 */
  /* 미납자 표의 체크박스. DataTable 은 selectable 만으로는 못 켜진다 —
     selected/onSelectedChange 를 안 주면 값이 undefined 로 고정돼 **눌러도 안 찍힌다** */
  const [unpaidSel, setUnpaidSel] = useState<string[]>([])
  /* ★ 체크한 행만 보낸다. `rowKey` 가 `billingId` 라 그 값으로 되찾는다.
       **고른 게 없으면 전원에게 보내지 않는다** — 그런 실수는 되돌릴 수 없다 */
  const unpaidTargets: UnpaidTarget[] = useMemo(() => {
    const picked = new Set(unpaidSel)
    return unpaid
      .filter((r) => picked.has(String(r.billingId)))
      .map((r) => ({
        billingId: r.billingId,
        studentNo: r.studentNo,
        studentName: r.studentName,
        serviceMonth: r.serviceMonth,
        unpaid: r.unpaid,
      }))
  }, [unpaid, unpaidSel])
  const [fee, setFee] = useState<FeeTableRow[] | null>(null)
  const [feeErr, setFeeErr] = useState<string | null>(null)
  /* 입학금은 남은 교습일수로 일할 계산된다. 화면이 달력으로 세지 않는다 — 휴일이 지점마다 다르다.
     보여주기만 하고 **보내지는 않는다**. 서버가 다시 세게 두는 편이 등록 시점과 어긋나지 않는다 */
  const [remainDays, setRemainDays] = useState<number | null>(null)

  /* 청구를 만들려면 학생을 골라야 한다. 재원생만 — 퇴원생에게 새 청구를 낼 일은 없다 */
  useEffect(() => {
    if (academyId === null) {
      setStudents([])
      return
    }
    let cancelled = false
    searchStudents({ status: 'ENROLLED', size: 2000, academyId })
      .then((p) => !cancelled && setStudents(p.rows))
      .catch(() => !cancelled && setStudents([]))
    return () => {
      cancelled = true
    }
  }, [academyId])

  const issueStudent = students.find((st) => String(st.enrollmentId) === issue.enrollmentId) ?? null

  /* 입학일은 학생 정보에 있다 — 직원이 다시 입력하면 오타로 일할 계산이 통째로 틀어진다.
     비어 있는 학생(예전 자료)이 있어 칸은 수정할 수 있게 둔다.
     ★ **학생을 바꾸면 그 학생 입학일로 다시 채운다.** 전에는 「비어 있을 때만」 채워서
       **앞 학생의 입학일이 그대로 남았다** — 그 날짜로 일할이 계산된다. */
  const filledFor = useRef<string | null>(null)
  useEffect(() => {
    if (issue.mode !== 'admission' || issueStudent === null) return
    const key = String(issueStudent.enrollmentId)
    if (filledFor.current === key) return
    filledFor.current = key
    setIssue((prev) =>
      prev.mode === 'admission' && prev.enrollmentId === key
        ? { ...prev, admissionDate: issueStudent.admissionDate ?? '' }
        : prev,
    )
  }, [issue.mode, issueStudent])

  /* 남은 교습일수. 입학일·지점이 정해져야 답이 나온다 */
  useEffect(() => {
    if (!issueOpen || issue.mode !== 'admission' || academyId === null || issue.admissionDate === '') {
      setRemainDays(null)
      return
    }
    let cancelled = false
    getRemainingDays({ academyId, admissionDate: issue.admissionDate })
      .then((d) => {
        if (cancelled) return
        setRemainDays(d)
        // 제안값을 칸에 채워 둔다. 데스크가 고치면 그 값이 이긴다
        setIssue((prev) => (prev.mode === 'admission' ? { ...prev, remainingDays: String(d) } : prev))
      })
      .catch(() => !cancelled && setRemainDays(null))
    return () => {
      cancelled = true
    }
  }, [issueOpen, issue.mode, issue.admissionDate, academyId])

  /* 학생·월·좌석이 정해지면 단가표를 읽는다. 학년에 따라 단가가 달라 학생이 먼저다 */
  useEffect(() => {
    if (!issueOpen || issue.mode !== 'monthly' || issueStudent === null || issue.month === '' || academyId === null) {
      setFee(null)
      setFeeErr(null)
      return
    }
    let cancelled = false
    setFeeErr(null)
    getFeeTable(issue.month, issueStudent.grade, issue.seatType, academyId)
      .then((r) => !cancelled && setFee(r))
      .catch((err) => {
        if (cancelled) return
        setFee(null)
        // 단가가 없는 달이 실제로 있다. 등록을 눌러보고 알게 하지 않는다
        setFeeErr(err instanceof ApiError ? err.message : '단가표를 불러오지 못했습니다.')
      })
    return () => {
      cancelled = true
    }
  }, [issueOpen, issue.mode, issue.month, issue.seatType, issueStudent, academyId])

  /** 고른 할인율에 해당하는 줄. 없으면 할인 0% 줄을 쓴다 */
  const feeRow = useMemo(() => {
    if (fee === null || fee.length === 0) return null
    const want = issue.discountRate.trim() === '' ? 0 : Number(issue.discountRate)
    return fee.find((r) => r.discountRate === want) ?? null
  }, [fee, issue.discountRate])

  /* ── 일할 근거(1016 피드백 2-4) ────────────────────────────
   * > 「일할계산의 **과정과 값이 함께** 출력되도록 해주시면 좋을 것 같습니다」
   *
   * ★ **등록을 누르기 전에** 봐야 뜻이 있다. 등록 뒤에 보여주면 틀린 것을 되돌려야 한다.
   * ★★ **월 전체면 나눗셈 식을 쓰지 않는다.** 월 전체는 **정액**이라 단가 × 일수와
   *   값이 다르다(660,000 vs 22,758×29 = 659,982 — **18원이 어긋난다**).
   *   그 식을 적으면 결과가 청구액과 달라 **데스크가 「계산이 틀렸다」로 읽는다.**
   *   서버도 월 전체에서는 단가를 `null` 로 내려 화면이 못 쓰게 해 뒀다. */
  const [breakdown, setBreakdown] = useState<TuitionBreakdown | null>(null)

  useEffect(() => {
    const id = Number(issue.enrollmentId)
    /* ★ **대상월이 정해지기 전에는 부르지 않는다.** 입학 모드는 입학일을 고르기 전까지
       `month` 가 빈 값이라 **400 이 난다** — 화면에는 아무 일도 안 일어나는데 점검
       리포트에는 400 으로 올라간다(실제로 그랬다) */
    const month = issue.mode === 'monthly' ? issue.month : issue.admissionDate.slice(0, 7)
    if (!issueOpen || issue.mode === 'etc' || !id || month.length !== 7) {
      setBreakdown(null)
      return
    }
    let cancelled = false
    previewTuitionBilling({
      enrollmentId: id,
      month,
      seatType: issue.seatType,
      discountRate: issue.discountRate.trim() === '' ? undefined : Number(issue.discountRate),
      remainingDays:
        issue.mode === 'admission' && issue.remainingDays.trim() !== ''
          ? Number(issue.remainingDays)
          : undefined,
    })
      .then((b) => !cancelled && setBreakdown(b))
      /* 단가가 없는 달이면 404 다 — 근거를 못 보여줄 뿐 등록은 서버가 판단한다 */
      .catch(() => !cancelled && setBreakdown(null))
    return () => {
      cancelled = true
    }
  }, [
    issueOpen,
    issue.mode,
    issue.enrollmentId,
    issue.month,
    issue.admissionDate,
    issue.seatType,
    issue.discountRate,
    issue.remainingDays,
  ])

  async function submitIssue() {
    setActBusy(true)
    setActErr(null)
    try {
      const enrollmentId = Number(issue.enrollmentId)
      if (issue.mode === 'monthly') {
        const r = await issueMonthlyBilling({
          enrollmentId,
          month: issue.month,
          seatType: issue.seatType,
          discountRate: issue.discountRate.trim() === '' ? undefined : Number(issue.discountRate),
          dueDate: issue.dueDate || undefined,
        })
        setActDone(`${r.name} ${r.billedAmount.toLocaleString()}원으로 등록했습니다.`)
      } else if (issue.mode === 'admission') {
        /* 금액을 안 보낸다 — 입학금과 그 달 교습비 일할분을 서버가 계산한다.
           그 달 교습비가 이미 있으면 409 이고, 그 문구를 그대로 보여준다 */
        const made = await issueAdmissionBilling({
          enrollmentId,
          admissionDate: issue.admissionDate,
          seatType: issue.seatType,
          discountRate: issue.discountRate.trim() === '' ? undefined : Number(issue.discountRate),
          remainingDays: issue.remainingDays.trim() === '' ? undefined : Number(issue.remainingDays),
          dueDate: issue.dueDate || undefined,
        })
        /* 한 건이 아니다 — 입학금과 그 달 교습비가 따로 만들어진다.
           무엇이 몇 건 생겼는지 그대로 알린다. 합계만 말하면 두 건인 줄 모른다 */
        const total = made.reduce((a, b) => a + b.billedAmount, 0)
        setActDone(
          `${made.map((b) => b.name).join(' · ')} — 청구 ${made.length}건 합계 ${total.toLocaleString()}원으로 등록했습니다.`,
        )
      } else {
        const r = await createBilling({
          enrollmentId,
          name: issue.name.trim(),
          billingType: issue.billingType,
          suppliedAmount: Number(issue.suppliedAmount),
          discountAmount: issue.discountAmount.trim() === '' ? undefined : Number(issue.discountAmount),
          dueDate: issue.dueDate || undefined,
        })
        setActDone(`${r.name} ${r.billedAmount.toLocaleString()}원으로 등록했습니다.`)
      }
      setIssueOpen(false)
      setIssue(EMPTY_ISSUE)
      await load()
    } catch (err) {
      /* 409 는 "이미 그 달 청구가 있다"는 뜻이다. 서버 문구가 그대로 쓸 만하다 */
      setActErr(err instanceof ApiError ? err.message : '등록하지 못했습니다.')
    } finally {
      setActBusy(false)
    }
  }

  /**
   * 결제 요청 3종.
   *
   * ★ 셋이 서로 다른 일이라 한 번에 하나만 보낸다.
   *   · 링크 — 학부모가 열 주소를 만든다. 문자를 끄면 **그 주소를 화면이 알려줘야** 한다
   *   · 단말기 — 이미 승인된 결제를 **기록**한다. 결제를 일으키지 않는다
   *   · 가상계좌 — 계좌를 발급한다. 입금은 나중에 웹훅으로 들어온다
   */
  async function submitPayReq() {
    if (!payReq) return
    setActBusy(true)
    setActErr(null)
    try {
      const id = payReq.row.billingId
      let res: PaymentRequestRow
      if (payReq.kind === 'link') {
        res = await createPaymentRequest({ billingId: id, payMethod: payReq.payMethod, sendSms: payReq.sendSms })
      } else if (payReq.kind === 'terminal') {
        if (!payReq.approvalNo.trim() || !payReq.cardName.trim() || !payReq.approvedAt) {
          setActErr('승인번호 · 카드사 · 승인 시각을 모두 입력해 주세요. 정산 대사에 쓰는 값입니다.')
          setActBusy(false)
          return
        }
        res = await recordTerminalPayment({
          billingId: id,
          amount: payReq.row.unpaid,
          approvalNo: payReq.approvalNo.trim(),
          cardName: payReq.cardName.trim(),
          approvedAt: new Date(payReq.approvedAt).toISOString(),
        })
      } else {
        res = await issueVbank({ billingId: id, bankCode: payReq.bankCode, days: Number(payReq.days) || 3 })
      }
      setPayReq(null)
      setPayReqDone(res)
      await load()
    } catch (err) {
      setActErr(err instanceof ApiError ? err.message : '요청하지 못했습니다.')
    } finally {
      setActBusy(false)
    }
  }

  async function submitPay() {
    if (!pay) return
    setActBusy(true)
    setActErr(null)
    try {
      await recordPayment(pay.row.billingId, Number(pay.amount), pay.method)
      setActDone(`${pay.row.studentName} · ${Number(pay.amount).toLocaleString()}원 수납했습니다.`)
      setPay(null)
      await load()
    } catch (err) {
      setActErr(err instanceof ApiError ? err.message : '수납하지 못했습니다.')
    } finally {
      setActBusy(false)
    }
  }

  async function submitCancel() {
    if (!cancelRow) return
    setActBusy(true)
    setActErr(null)
    try {
      /* 수납이 붙어 있으면 그 거래부터 취소한다. 청구만 취소하면 받은 돈이
         매출장에서 통째로 사라진다 — 어디에도 안 보이는 수납이 된다 */
      for (const p of cancelRow.payments) await deletePayment(p.id)
      await deleteBilling(cancelRow.billingId)

      /* ★★ **발급해 둔 가상계좌를 함께 닫는다**(디랩 2026-10-12 회신 ①).
         계좌를 그대로 두면 **기한까지 계속 입금을 받는다** — 학부모가 그 번호로 넣으면
         **어디에 붙일지 모르는 입금**이 된다.
         ★ **청구 취소가 끝난 뒤에 한다.** 계좌부터 닫고 청구 취소가 실패하면
           **받을 길만 막고 청구는 살아 있는** 상태가 된다.
         ★ 실패해도 **청구 취소를 되돌리지 않는다.** 대신 무엇이 안 됐는지 그대로 쓴다 —
           「취소 실패」로 뭉뚱그리면 담당자가 다시 취소하려 든다(CLAUDE.md 4장). */
      let vbankLeft: string[] = []
      try {
        const reqs = await listPaymentRequests(cancelRow.billingId)
        for (const q of reqs.filter((x) => x.status === 'CREATED' && x.vbankAccount)) {
          const no = q.vbankAccount ?? String(q.id)
          try {
            const r = await closePaymentRequest(q.id)
            /* ⚠️ PG 가 받아들여야 서버가 상태를 바꾼다. 안 바뀌었으면 **계좌는 살아 있다** */
            if (r.status === 'CREATED') vbankLeft.push(no)
          } catch (e) {
            /* ★ **서버 사유를 버리지 않는다.** 「이미 입금된 가상계좌입니다. 말소가 아니라
               환불로 처리해야 합니다」처럼 **담당자가 할 일**이 거기 들어 있다 */
            vbankLeft.push(e instanceof ApiError ? `${no} — ${e.message}` : no)
          }
        }
      } catch {
        /* 목록을 못 읽었으면 계좌가 있는지도 모른다 — 있다고 단정하지 않는다 */
      }

      setActDone(
        [
          cancelRow.payments.length > 0
            ? `청구를 취소하고 수납 ${cancelRow.payments.length}건도 함께 취소했습니다.`
            : '청구를 취소했습니다.',
          vbankLeft.length > 0
            ? `⚠️ 가상계좌 ${vbankLeft.join(' · ')}가 해지되지 않았습니다. 해당 계좌로 입금될 수 있으므로 결제업체에 확인합니다.`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      setCancelRow(null)
      await load()
    } catch (err) {
      setActErr(err instanceof ApiError ? err.message : '취소하지 못했습니다.')
    } finally {
      setActBusy(false)
    }
  }

  /* ★ **청구를 이루는 항목을 펼쳐 보여준다**(1016 피드백 1-4).
     > 「일괄 또는 일할결제 시 독서실비/교습비가 따로 보일 수 있도록」
     ★ **할인이 항목마다 다르다.** 합계 한 줄만 보면 교습비에만 붙은 할인을
       데스크가 **독서실비도 깎인 것으로** 읽는다.
     ★ **정가(`suppliedAmount`)를 함께 보여준다.** 퇴원 환불 차감이 **정상가 기준**이라
       그 값이 있어야 되짚을 수 있다.
     ★ 항목이 없는 청구(급식·특강)는 `undefined` 를 돌려 **펼치기 단추도 안 그린다** —
       나눌 것이 없는데 단추만 있으면 눌러도 아무 일이 없는 것처럼 보인다. */
  const renderBillingItems = useCallback((r: ReceiptRow) => {
    const items = r.items ?? []
    if (items.length < 2) return undefined
    return (
      <table className="mini-tbl">
        <thead>
          <tr>
            <th>항목</th>
            <th style={{ textAlign: 'right' }}>정가</th>
            <th style={{ textAlign: 'right' }}>할인</th>
            <th style={{ textAlign: 'right' }}>청구액</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>
                {BILLING_ITEM_LABEL[it.itemType] ?? it.itemType}
                {/* 서버가 알려준다 — 화면이 「독서실비는 할인 없음」을 코드로 들지 않는다 */}
                {!it.discountable && (
                  <span className="mk supplement" style={{ marginLeft: 6 }}>
                    할인 없음
                  </span>
                )}
              </td>
              <td style={{ textAlign: 'right' }}>{wonOf(it.suppliedAmount)}</td>
              <td style={{ textAlign: 'right', color: it.discountAmount > 0 ? 'var(--red)' : undefined }}>
                {it.discountAmount > 0 ? `-${wonOf(it.discountAmount)}` : '-'}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{wonOf(it.billedAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }, [])

  /* ★ 결제 내역 출력(디랩 `md/급식비.md` 4항) — **학부모에게 건네는 서류**다.
       ★ **행이 아니라 학생 단위**로 띄운다. 요청이 *「결제일자순으로 모두 조회되어
         한꺼번에」* 라 **한 청구만 뽑으면 요청을 만족하지 못한다.** */
  const [printFor, setPrintFor] = useState<ReceiptRow | null>(null)

  /** 표 끝에 붙는 행 액션. 모듈 상수 COLUMNS 는 그대로 두고 여기서만 더한다 */
  const columnsWithAct: Column<ReceiptRow>[] = useMemo(
    () => [
      ...COLUMNS,
      {
        key: 'act',
        header: '',
        width: '206px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={r.unpaid <= 0}
              title={r.unpaid <= 0 ? '이미 완납된 청구입니다' : undefined}
              onClick={() => {
                setActErr(null)
                setPay({ row: r, amount: String(r.unpaid), method: 'CARD' })
              }}
            >
              수납
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={r.unpaid <= 0}
              title={r.unpaid <= 0 ? '이미 완납된 청구입니다' : '결제 링크·단말기 기록·가상계좌'}
              onClick={() => {
                setActErr(null)
                setPayReq({
                  row: r,
                  kind: 'link',
                  payMethod: 'CARD',
                  sendSms: true,
                  approvalNo: '',
                  cardName: '',
                  approvedAt: '',
                  bankCode: '004',
                  days: '3',
                })
              }}
            >
              결제
            </button>
            {/* ★ 학부모가 데스크에서 물어볼 때 바로 뽑는 것이라 **행마다** 둔다.
                   ★ 미납만 있는 학생도 눌러야 한다 — 「낸 게 없다」도 答이다 */}
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              title="이 학생의 결제 내역을 결제일자순으로 출력합니다"
              onClick={() => setPrintFor(r)}
            >
              출력
            </button>
            {/* ★ **현금영수증은 카드 수납에 못 낸다** — 카드사가 소득공제를 처리한다.
                서버가 400 으로 막으므로 **아예 안 띄운다.** 띄워 두면 눌러보고 거절당한다.
                계좌이체·가상계좌·현금 수납이 있는 행에만 보인다(1016 피드백 1-2) */}
            {r.payments.some((p) => p.method !== 'CARD') && (
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5 }}
                title="현금영수증 발급·취소"
                onClick={() => {
                  setActErr(null)
                  openReceipt(r)
                }}
              >
                현금영수증
              </button>
            )}
            {/* ★ **급식비에는 안 띄운다.** 업체 명의 TID 라 처리 주체가 아직 안 정해져
                서버가 400 으로 막는다 — 띄워 두면 눌러보고 거절당한다.
                ★ 받은 돈이 없으면 돌려줄 것도 없다 */}
            {r.billingType !== 'MEAL' && r.receivedAmount > 0 && (
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5 }}
                title="퇴원·중도해지 환불액을 계산합니다"
                onClick={() => {
                  setActErr(null)
                  setRefund({ row: r, usedDays: '', preview: null, busy: false, err: null, done: null })
                }}
              >
                환불
              </button>
            )}
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
              onClick={() => {
                setActErr(null)
                setCancelRow(r)
              }}
            >
              취소
            </button>
          </div>
        ),
      },
    ],
    [openReceipt],
  )

  const sum = useMemo(() => {
    // 결제수단별 집계는 서버 요약에 없다. 행의 payments[] 를 더해 만든다 —
    // 조회 조건 안에서만 맞는 값이라 "조회 조건 기준"이라고 적어둔다
    const byMethod = new Map<string, number>()
    for (const r of filtered) {
      for (const p of r.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
    }
    const add = (f: (r: ReceiptRow) => number) => filtered.reduce((a, r) => a + f(r), 0)
    return {
      total: clientFiltered ? add((r) => r.receivedAmount) : (summary?.receivedAmount ?? 0),
      billed: clientFiltered ? add((r) => r.billedAmount) : (summary?.billedAmount ?? 0),
      due: clientFiltered ? add((r) => r.unpaid) : (summary?.unpaidAmount ?? 0),
      unpaidCount: clientFiltered ? filtered.filter((r) => r.unpaid > 0).length : (summary?.unpaidCount ?? 0),
      card: byMethod.get('CARD') ?? 0,
      vbank: byMethod.get('VBANK') ?? 0,
    }
  }, [summary, filtered, clientFiltered])

  // 권한으로 막힌 계정에는 숫자를 하나도 그리지 않는다 — 0 으로 보이면 "오늘 0건" 이 된다
  if (denied) return <NotAllowed what="수납현황" />

  return (
    <>
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
          <div className="d">만원 · 조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="wallet" size={13} /> 가상계좌
          </div>
          <div className="v">{Math.round(sum.vbank / 10000).toLocaleString()}</div>
          <div className="d">만원 · 조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 수납률
          </div>
          <div className="v">{sum.billed > 0 ? Math.round((sum.total / sum.billed) * 100) : 0}%</div>
          <div className="d">수납 / 청구</div>
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

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* 할인 정책 탭에서도 감추지 않는다 — 감추면 탭 줄이 320px 위로 튀었다(2026-09-21 사용자 결정) */}
      <SearchForm
        fields={FIELDS}
        onSearch={setQuery}
        presetKey="RECEIPT_STATUS"
        headerRight={
          <span className="mk supplement" title="직원 계정은 조회만 할 수 있습니다">
            <Icon name="shield-check" size={11} /> STAFF 조회 전용
          </span>
        }
      />

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'all', label: '통합 매출장', count: filtered.length },
            { key: 'unpaid', label: '미납자 관리', count: unpaid.length },
            /* ★ **이 탭이 없으면 가상계좌 환불이 영원히 안 끝난다.** 우리가 이체하는 게
               아니라 사람이 은행에서 보내고 여기에 찍어야 목록이 줄어든다 */
            { key: 'transfer', label: '환불 이체 대기', count: transfers.length },
            /* ★ 숫자를 붙이지 않는다. 장학은 **탭을 열어야 읽는데**, 열기 전에는 0 이라
                 「장학이 없다」로 읽힌다. 게다가 처리할 일이 쌓이는 축도 아니다 */
            { key: 'discount', label: '장학 · 단가표' },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="p-pay" style={{ padding: 14 }}>
          {/* ═══ 할인 정책 · 청구액 계산 ═══ */}
          {tab === 'transfer' && (
            <div style={{ padding: 14 }}>
              {/* ★ **우리가 이체하지 않는다.** 가상계좌 환불은 사람이 은행에서 보내고
                  여기에 찍는다 — 안 찍으면 이 목록이 **영원히 안 줄어든다** */}
              <div className="note-box">
                <div>
                  이체 대기 중인 환불 내역입니다. 은행에서 이체한 후 [이체 완료]를 선택합니다. 완료 처리
                  전까지 이 목록에 표시됩니다.
                </div>
              </div>
              <DataTable
                columns={transferColumns}
                rows={transfers}
                rowKey={(r) => String(r.id)}
                masked={masked}
                pageSize={15}
                emptyText={
                  academyId === null ? '지점을 먼저 선택해 주세요.' : '이체할 환불이 없습니다.'
                }
              />
            </div>
          )}

          {tab === 'discount' && (
            <>
              {/* ★ 이 경고는 **아직 사실이다** — 결제창에 정가가 넘어간다(PG 실가맹점 전환 대기) */}
              <div className="blocked-note">
                <div className="ic">
                  <Icon name="triangle-alert" size={17} />
                </div>
                <div>
                  <div className="tt">지금은 온라인 결제에 할인이 반영되지 않습니다</div>
                  <div className="tx">
                    <b>할인 전 정가가 그대로 결제창에 넘어가고</b> 있습니다. 학생·학부모 결제창에
                    정가가 뜨고 할인은 나중에 수기 환불로 메꾸는 상태입니다.
                    <br />
                    결제 요청을 만들기 <b>전에</b> 아래 장학으로 <b>실제 청구액을 산출하는 단계</b>가
                    들어가야 합니다.
                  </div>
                </div>
              </div>

              <div className="split-3-2">
                <div>
                  {scholErr !== null && (
                    <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                      {scholErr}
                    </div>
                  )}
                  <DataTable
                    nowrap
                    columns={DISCOUNT_COLUMNS}
                    rows={schols ?? []}
                    rowKey={(r) => String(r.id)}
                    masked={false}
                    loading={schols === null && scholErr === null}
                    pageSize={10}
                    emptyText={`${Number(calcMonth.slice(0, 4)) || ''}년에 등록된 장학이 없습니다. 기초 관리에서 먼저 등록해야 합니다.`}
                    countLabel={
                      <>
                        장학 <b>{(schols ?? []).length}</b>종 · 사용{' '}
                        <b>{(schols ?? []).filter((d) => d.active).length}</b>종
                      </>
                    }
                    toolbar={
                      <ExcelButton
                        filename={`장학종류_${calcMonth.slice(0, 4)}`}
                        columns={DISCOUNT_COLUMNS}
                        rows={schols ?? []}
                        masked={false}
                      />
                    }
                  />

                  {/* ★ **등록 버튼을 여기 두지 않는다.** 같은 것을 두 화면에서 고치면 어긋난다 —
                         어디서 고치는지만 알려준다 */}
                  <div className="note-box" style={{ marginTop: 14 }}>
                    <div>
                      장학 종류는 <b>기초 관리</b>에서 등록·수정합니다. 할인율을 바꾸면{' '}
                      <b>이미 발행된 청구는 그대로</b>이고, 다음 발행부터 반영됩니다.
                    </div>
                  </div>

                  <div className="note-box plain" style={{ marginTop: 14, marginBottom: 0 }}>
                    <div className="ic">
                      <Icon name="git-compare" size={17} />
                    </div>
                    <div>
                      <div className="tt">서버에 있는 할인은 장학뿐입니다</div>
                      <div className="tx">
                        형제 할인·재등록 할인·조기납부·쿠폰은 <b>아직 시스템에 없습니다.</b> 그런
                        할인을 주기로 했다면 지금은 <b>청구를 만들 때 금액으로 직접 깎아야</b> 합니다 —
                        장학으로 등록하면 성적 기준으로 판정되는 쪽에 섞입니다.
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="card-sec" style={{ marginBottom: 0 }}>
                    <div className="card-sec-h">
                      <div className="t">
                        <span className="ico">
                          <Icon name="calculator" size={15} />
                        </span>
                        할인율별 단가
                      </div>
                    </div>
                    <div className="card-sec-b">
                      {/* ★★ **화면이 할인을 곱하지 않는다.** 서버 단가표가 할인율별 금액을
                             이미 계산해서 준다 — 독서실비에 할인이 안 붙는 규칙도 거기 들어 있다.
                             화면이 따로 곱하면 그 규칙을 놓쳐 조용히 틀린 금액이 나온다 */}
                      <div className="frow">
                        <label>대상월</label>
                        <div>
                          <input
                            className="inp"
                            type="month"
                            value={calcMonth}
                            onChange={(e) => setCalcMonth(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="frow">
                        <label>학년</label>
                        <div>
                          <select
                            className="inp"
                            value={calcGrade}
                            onChange={(e) => setCalcGrade(e.target.value as GradeType)}
                          >
                            {(['HIGH2', 'HIGH3', 'N_SU'] as GradeType[]).map((g) => (
                              <option key={g} value={g}>
                                {GRADE_LABEL[g]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="frow">
                        <label>좌석</label>
                        <div>
                          <select
                            className="inp"
                            value={calcSeat}
                            onChange={(e) => setCalcSeat(e.target.value as SeatType)}
                          >
                            {(['GENERAL', 'SINGLE'] as SeatType[]).map((t) => (
                              <option key={t} value={t}>
                                {SEAT_TYPE_LABEL[t]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {calcErr !== null && (
                        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                          {calcErr}
                        </div>
                      )}

                      <table className="dt nowrap" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ width: 72 }}>할인율</th>
                            <th>교습비(월)</th>
                            <th>독서실비(월)</th>
                            <th>합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(calcFee ?? []).map((f) => (
                            <tr key={f.discountRate}>
                              <td>
                                <b>{f.discountRate}%</b>
                              </td>
                              <td>{wonOf(f.monthlyTuition)}</td>
                              <td>{wonOf(f.monthlyStudyRoom)}</td>
                              <td>
                                <b>{wonOf(f.monthlyTotal)}</b>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(calcFee === null || calcFee.length === 0) && (
                        <div className="dt-empty">
                          {calcBusy ? '불러오는 중…' : '이 달 단가표가 등록되지 않았습니다.'}
                        </div>
                      )}

                      <div className="note-box" style={{ marginTop: 12, marginBottom: 0 }}>
                        <div>
                          금액은 <b>서버 단가표 그대로</b>입니다. <b>독서실비에는 할인이 붙지 않아</b>{' '}
                          어느 줄이든 정가입니다. 일할 계산은 청구를 만들 때 교습일수로 다시 셉니다.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {printFor !== null && academyId !== null && (
            <PaymentHistoryPrint
              academyId={academyId}
              enrollmentId={printFor.enrollmentId}
              studentNo={printFor.studentNo}
              studentName={printFor.studentName}
              onClose={() => setPrintFor(null)}
            />
          )}

          {tab === 'all' && (
            <DataTable
              nowrap
              columns={columnsWithAct}
              renderExpanded={renderBillingItems}
              rows={filtered}
              rowKey={(r) => String(r.billingId)}
              masked={masked}
              loading={loading}
              pageSize={12}
              countLabel={
                <>
                  청구 <b>{filtered.length}</b>건 · 수납 {sum.total.toLocaleString()}원
                </>
              }
              toolbar={
                <>
                  <button
                    className="btn pri"
                    disabled={academyId === null}
                    onClick={() => {
                      setActErr(null)
                      setIssue(EMPTY_ISSUE)
                      setIssueOpen(true)
                    }}
                  >
                    <Icon name="plus" size={14} /> 청구 등록
                  </button>
                  {/* ★ 매월 수백 명을 한 명씩 등록하던 것(1016 피드백 2-1).
                      `data-write` 는 **조회 전용에서 숨기는 표시**다 — 주 동작 버튼도
                      표 안 버튼도 아니라 가드에 안 걸린다 */}
                  <button className="btn" data-write disabled={academyId === null} onClick={openBulk}>
                    <Icon name="users" size={14} /> 교습비 일괄 청구
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  {/* 서버 엑셀(2026-09-25). 결제수단을 둘 이상 선택한 경우만 화면이 거르므로,
                      그때는 파일이 화면보다 넓어진다 — 그 경우에만 화면 값으로 만든다 */}
                  <ExcelButton
                    filename="통합_매출장"
                    columns={COLUMNS}
                    rows={filtered}
                    masked={masked}
                    download={
                      clientFiltered
                        ? undefined
                        : () => exportReceiptStatus({ ...params, unmask: !masked || undefined }, '통합_매출장.xlsx')
                    }
                  />
                </>
              }
            />
          )}

          {tab === 'unpaid' && (
            <DataTable
              nowrap
              columns={UNPAID_COLUMNS}
              rows={unpaid}
              rowKey={(r) => String(r.billingId)}
              selectable
              selected={unpaidSel}
              onSelectedChange={setUnpaidSel}
              masked={masked}
              loading={loading}
              pageSize={12}
              countLabel={
                <>
                  미납 <b>{sum.unpaidCount}</b>건 · {sum.due.toLocaleString()}원
                  <span style={{ color: 'var(--muted)' }}> (학생 수가 아니라 건수)</span>
                  {unpaidSel.length > 0 && (
                    <span style={{ color: 'var(--mint-d)', fontWeight: 700 }}> · {unpaidSel.length}건 선택</span>
                  )}
                </>
              }
              toolbar={
                <>
                  <UnpaidNoticeButton
                    academyId={academyId}
                    targets={unpaidTargets}
                    onSent={() => {
                      /* 발송 이력이 수납 숫자를 바꾸지는 않지만, 고른 상태는 비운다 —
                         남겨 두면 **같은 사람에게 또 보내기 쉽다** */
                      setUnpaidSel([])
                      void load()
                    }}
                  />
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="미납자_명단" columns={UNPAID_COLUMNS} rows={unpaid} masked={masked} />
                </>
              }
              emptyText="미납 건이 없습니다."
            />
          )}
        </div>
      </div>

      {bulk && (
        <Modal
          wide
          title="교습비 일괄 청구"
          sub="체크한 학생에게만 발행합니다."
          confirmLabel={bulk.result ? '닫기' : `${bulk.picked.length}명 발행`}
          busy={bulk.busy}
          confirmDisabled={!bulk.result && bulk.picked.length === 0}
          error={bulk.err}
          onConfirm={() => (bulk.result ? setBulk(null) : void runBulk())}
          onClose={() => setBulk(null)}
        >
          {bulk.result ? (
            <>
              <div className="note-box">
                <div>
                  <b>{bulk.result.issuedCount}건</b>을 발행했습니다.
                </div>
              </div>
              {/* ★ **빠진 사람을 사유별로 가른다.** 「이미 청구가 있습니다」는 그냥 두면
                  되지만 **「가격이 등록되지 않았습니다」는 손을 쓰지 않으면 그 학생
                  교습비가 안 나간다.** 발행 건수만 보면 그게 안 보인다 */}
              {bulk.result.failed.length > 0 &&
                (() => {
                  const already = bulk.result!.failed.filter((f) => f.reason.includes('이미'))
                  const needFix = bulk.result!.failed.filter((f) => !f.reason.includes('이미'))
                  const nameOf = (id: number) =>
                    (bulk.rows ?? []).find((r) => r.enrollmentId === id)
                  return (
                    <>
                      {needFix.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <b style={{ fontSize: 12.5, color: 'var(--red)' }}>
                            청구되지 않은 {needFix.length}명 — 확인이 필요합니다
                          </b>
                          <div className="hint" style={{ marginBottom: 6 }}>
                            해당 학생들의 교습비를 청구하려면 청구를 생성해야 합니다.
                          </div>
                          <table className="mini-tbl">
                            <thead>
                              <tr>
                                <th>학번</th>
                                <th>이름</th>
                                <th>사유</th>
                              </tr>
                            </thead>
                            <tbody>
                              {needFix.map((f) => {
                                const r = nameOf(f.enrollmentId)
                                return (
                                  <tr key={f.enrollmentId}>
                                    <td>{r?.studentNo ?? '-'}</td>
                                    <td>{r?.name ?? `등록 ${f.enrollmentId}`}</td>
                                    <td>{f.reason}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {already.length > 0 && (
                        <div className="hint" style={{ marginTop: 12 }}>
                          이미 청구가 등록된 학생 <b>{already.length}명</b>은 생성 대상에서 제외되었습니다.
                        </div>
                      )}
                    </>
                  )
                })()}
            </>
          ) : (
            <>
              <div className="frow">
                <label className="req">대상월</label>
                <input
                  className="inp"
                  type="month"
                  value={bulk.month}
                  onChange={(e) => setBulk({ ...bulk, month: e.target.value })}
                />
              </div>
              <div className="frow">
                <label>납기일</label>
                <div>
                  <input
                    className="inp"
                    type="date"
                    value={bulk.dueDate}
                    onChange={(e) => setBulk({ ...bulk, dueDate: e.target.value })}
                  />
                  {/* 비우면 통합 매출장에서 기간으로 좁힐 때 안 보인다 */}
                  <div className="hint">기간을 입력하지 않으면 기간별 검색 결과에 표시되지 않습니다.</div>
                </div>
              </div>
              <div className="frow">
                <label className="req">좌석</label>
                <select
                  className="sel"
                  value={bulk.seatType}
                  onChange={(e) => setBulk({ ...bulk, seatType: e.target.value as SeatType })}
                >
                  {(Object.keys(SEAT_TYPE_LABEL) as SeatType[]).map((k) => (
                    <option key={k} value={k}>
                      {SEAT_TYPE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="frow">
                <label className="req">대상 학생</label>
                <div>
                  {bulk.rows === null ? (
                    <div className="hint">불러오는 중…</div>
                  ) : bulk.rows.length === 0 ? (
                    <div className="hint">재원 중인 학생이 없습니다.</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <button
                          type="button"
                          className="lnk"
                          onClick={() =>
                            setBulk({
                              ...bulk,
                              picked:
                                bulk.picked.length === bulk.rows!.length
                                  ? []
                                  : bulk.rows!.map((r) => String(r.enrollmentId)),
                            })
                          }
                        >
                          {bulk.picked.length === bulk.rows.length ? '모두 해제' : '모두 선택'}
                        </button>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                          {bulk.picked.length} / {bulk.rows.length}명
                        </span>
                      </div>
                      <div className="pick-list" style={{ maxHeight: 300 }}>
                        <table className="mini-tbl">
                          <thead>
                            <tr>
                              <th />
                              <th>학번</th>
                              <th>이름</th>
                              <th>반</th>
                              <th>장학</th>
                              {/* ★ 머리글과 입력칸의 **가운데를 맞춘다.** 오른쪽 정렬이면
                                  머리글만 칸 끝에 붙어 입력칸과 어긋나 보인다 */}
                              <th style={{ textAlign: 'center', width: 96 }}>할인율</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulk.rows.map((r) => {
                              const key = String(r.enrollmentId)
                              const on = bulk.picked.includes(key)
                              return (
                                <tr key={key}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={(e) =>
                                        setBulk({
                                          ...bulk,
                                          picked: e.target.checked
                                            ? [...bulk.picked, key]
                                            : bulk.picked.filter((x) => x !== key),
                                        })
                                      }
                                    />
                                  </td>
                                  <td>{r.studentNo ?? '-'}</td>
                                  <td>{r.name}</td>
                                  <td>{r.className ?? '-'}</td>
                                  <td>
                                    {r.source ?? '-'}
                                    {/* ★★ 마스터에 없는 코드다. **장학 취소 판정이 이 학생을
                                        제외한다** — 오류도 안 나고 검토 목록에도 안 뜬다 */}
                                    {r.unregistered && (
                                      <span
                                        className="mk brandnew"
                                        style={{ marginLeft: 4 }}
                                        title="장학 기준에 등록되지 않은 코드입니다. 장학 취소 판정 대상에서 제외됩니다."
                                      >
                                        미등록
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {/* ★ 장학값을 채워 두고 **행마다 수정할 수 있게** 둔다.
                                        `step` 을 안 건다 — Modal 이 form 이라 배수가 아니면 저장이 막힌다 */}
                                    <input
                                      className="inp"
                                      type="number"
                                      min={0}
                                      max={100}
                                      style={{ width: 72, textAlign: 'center' }}
                                      value={r.rate}
                                      placeholder="0"
                                      onChange={(e) =>
                                        setBulk({
                                          ...bulk,
                                          rows: bulk.rows!.map((x) =>
                                            x.enrollmentId === r.enrollmentId ? { ...x, rate: e.target.value } : x,
                                          ),
                                        })
                                      }
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="hint">
                        학생별 장학 정보에 따라 할인율이 자동 입력됩니다. 각 행에서 수정할 수 있습니다.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ── 청구 등록 ── */}
      {issueOpen && (
        <Modal
          title="청구 등록"
          sub="교습비·입학 청구는 금액이 자동 계산되며, 그 밖은 금액을 직접 입력합니다."
          confirmLabel="등록"
          busy={actBusy}
          error={actErr}
          confirmDisabled={
            issue.enrollmentId === '' ||
            (issue.mode === 'monthly'
              ? issue.month.trim() === ''
              : issue.mode === 'admission'
                ? issue.admissionDate === '' || issue.remainingDays.trim() === ''
                : issue.name.trim() === '' || issue.suppliedAmount.trim() === '')
          }
          onConfirm={() => void submitIssue()}
          onClose={() => setIssueOpen(false)}
        >
          <div className="frow">
            <label className="req">청구 종류</label>
            {/* ★ .frow 는 112px + 1fr 2열 그리드다. 안내문을 컨트롤의 **형제**로 두면
                   라벨 칸으로 떨어져 왼쪽에 눌려 붙는다 — 한 칸에 묶는다 */}
            <div>
              {/* ★ 버튼이 좁아지면 브라우저가 **공백이 있는 아무 데서나** 자른다 —
                  「입학 (첫 / 달)」 처럼 괄호 안에서 잘린다. 괄호 안 공백을 줄바꿈 없는
                  공백(`\u00a0`)으로 두어 **괄호 앞에서만** 잘리게 한다 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`btn${issue.mode === 'monthly' ? ' pri' : ''}`}
                  onClick={() => setIssue({ ...issue, mode: 'monthly' })}
                >
                  교습비 (월)
                </button>
                <button
                  type="button"
                  className={`btn${issue.mode === 'admission' ? ' pri' : ''}`}
                  onClick={() => setIssue({ ...issue, mode: 'admission' })}
                >
                  {'입학 (첫\u00a0달)'}
                </button>
                <button
                  type="button"
                  className={`btn${issue.mode === 'etc' ? ' pri' : ''}`}
                  onClick={() => setIssue({ ...issue, mode: 'etc' })}
                >
                  {'특강비 · 급식비 · 그\u00a0밖'}
                </button>
              </div>
              <div className="hint">
                {issue.mode === 'monthly'
                  ? '금액은 단가표와 그 달 교습일수로 계산됩니다. 아래에서 미리 확인합니다.'
                  : issue.mode === 'admission'
                    ? '입학일부터 남은 교습일수로 그 달 교습비를 계산합니다. 1일 입학이 아니면 다음 달분도 함께 청구됩니다.'
                    : '금액을 직접 입력합니다. 교습비는 위쪽으로 등록해야 단가표와 어긋나지 않습니다.'}
              </div>
            </div>
          </div>

          <div className="frow">
            <label className="req">학생</label>
            <select
              className="sel"
              value={issue.enrollmentId}
              onChange={(e) => setIssue({ ...issue, enrollmentId: e.target.value })}
            >
              <option value="">선택</option>
              {students.map((st) => (
                <option key={st.enrollmentId} value={String(st.enrollmentId)}>
                  {st.studentNo ?? '-'} · {st.name}
                </option>
              ))}
            </select>
          </div>

          {issue.mode === 'monthly' ? (
            <>
              <div className="frow">
                <label className="req">청구 월</label>
                <div>
                  <input
                    className="inp"
                    type="month"
                    value={issue.month}
                    onChange={(e) => setIssue({ ...issue, month: e.target.value })}
                  />
                  <div className="hint">청구 한 건이 한 달분입니다. 같은 달을 두 번 등록할 수 없습니다.</div>
                </div>
              </div>
              <div className="frow">
                <label className="req">좌석 · 할인율</label>
                <div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      className="sel"
                      value={issue.seatType}
                      onChange={(e) => setIssue({ ...issue, seatType: e.target.value as SeatType })}
                    >
                      {(Object.keys(SEAT_TYPE_LABEL) as SeatType[]).map((t) => (
                        <option key={t} value={t}>
                          {SEAT_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="inp"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="할인율 %"
                      value={issue.discountRate}
                      onChange={(e) => setIssue({ ...issue, discountRate: e.target.value })}
                    />
                  </div>
                  {/* 월 청구는 율, 아래 그 밖 청구는 금액이다 — 서버 계약이 그렇게 갈려 있다 */}
                  <div className="hint">할인율은 퍼센트로 입력합니다. 비우면 할인 없이 청구됩니다.</div>
                </div>
              </div>

              {/* ── 청구될 금액 ── */}
              {/* ★ 금액을 서버가 정하므로, 안 보여주면 **얼마가 청구되는지 모르고 누르게 된다.**
                     단가표를 읽어 미리 띄운다 — 등록 뒤에 알게 하지 않는다 */}
              <div className="frow">
                <label>청구될 금액</label>
                <div>
                  {feeErr !== null ? (
                    <div className="hint bad">{feeErr}</div>
                  ) : issueStudent === null ? (
                    <div className="hint">학생을 고르면 금액이 나옵니다.</div>
                  ) : fee === null ? (
                    <div className="hint">불러오는 중…</div>
                  ) : feeRow === null ? (
                    <div className="hint bad">
                      할인율 {issue.discountRate || 0}% 단가가 없습니다. 등록된 할인율:{' '}
                      {fee.map((r) => `${r.discountRate}%`).join(' · ')}
                    </div>
                  ) : (
                    <>
                      <table className="dt">
                        <tbody>
                          <tr>
                            <td>교습비</td>
                            <td style={{ textAlign: 'right' }}>{wonOf(feeRow.monthlyTuition)}</td>
                          </tr>
                          <tr>
                            <td>독서실비</td>
                            <td style={{ textAlign: 'right' }}>{wonOf(feeRow.monthlyStudyRoom)}</td>
                          </tr>
                          <tr>
                            <td>
                              <b>합계</b>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <b>{wonOf(feeRow.monthlyTotal)}</b>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="hint">
                        {GRADE_LABEL[issueStudent.grade] ?? issueStudent.grade} ·{' '}
                        {SEAT_TYPE_LABEL[issue.seatType]} · 교습일수 {feeRow.teachingDays}일 기준
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ★ **서버가 어떻게 계산했는지**를 그대로 보여준다(1016 피드백 2-4).
                  위 표는 단가표라 「얼마인가」만 말하고, 여기는 「왜 그 금액인가」를 말한다 */}
              {breakdown && <BreakdownBox b={breakdown} />}
            </>
          ) : issue.mode === 'admission' ? (
            <>
              <div className="frow">
                <label className="req">입학일</label>
                <div>
                  <input
                    className="inp"
                    type="date"
                    value={issue.admissionDate}
                    onChange={(e) => setIssue({ ...issue, admissionDate: e.target.value })}
                  />
                  <div className="hint">
                    학생을 고르면 등록된 입학일이 들어옵니다. 이 날짜부터 그 달 교습비를 계산합니다.
                  </div>
                </div>
              </div>
              <div className="frow">
                <label className="req">좌석 · 할인율</label>
                <div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      className="sel"
                      value={issue.seatType}
                      onChange={(e) => setIssue({ ...issue, seatType: e.target.value as SeatType })}
                    >
                      {(Object.keys(SEAT_TYPE_LABEL) as SeatType[]).map((t) => (
                        <option key={t} value={t}>
                          {SEAT_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="inp"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="할인율 %"
                      value={issue.discountRate}
                      onChange={(e) => setIssue({ ...issue, discountRate: e.target.value })}
                    />
                  </div>
                  <div className="hint">할인율은 퍼센트로 입력합니다. 비우면 할인 없이 청구됩니다.</div>
                </div>
              </div>
              <div className="frow">
                <label className="req">남은 교습일수</label>
                <div>
                  {/* ★ 서버 값을 그대로 사용하면 조용히 틀린다 — 서버는 그 달 교습일수 총합만 알고
                         어느 날이 휴원일인지는 모른다. 데스크가 수정할 수 있어야 한다 */}
                  <input
                    className="inp"
                    type="number"
                    min={1}
                    max={31}
                    value={issue.remainingDays}
                    onChange={(e) => setIssue({ ...issue, remainingDays: e.target.value })}
                  />
                  <div className="hint">
                    {issue.admissionDate === ''
                      ? '입학일을 고르면 일수가 자동 입력됩니다.'
                      : remainDays === null
                        ? '불러오는 중…'
                        : `기본값은 ${remainDays}일입니다. 필요한 경우 수정합니다.`}
                  </div>
                </div>
              </div>

              {/* ★ 일할이 실제로 어떻게 계산됐는지(1016 피드백 2-4). **입학 청구가 바로
                  일할이라** 여기가 그 근거를 가장 필요로 하는 자리다 */}
              {breakdown && <BreakdownBox b={breakdown} />}
            </>
          ) : (
            <>
              <div className="frow">
                <label className="req">청구 이름</label>
                <div>
                  <input
                    className="inp"
                    placeholder="예: 2026년 10월 급식비"
                    value={issue.name}
                    onChange={(e) => setIssue({ ...issue, name: e.target.value })}
                  />
                  <div className="hint">청구서에 그대로 찍힙니다.</div>
                </div>
              </div>
              <div className="frow">
                <label className="req">항목 · 금액</label>
                <div>
                  <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    className="sel"
                    value={issue.billingType}
                    onChange={(e) => setIssue({ ...issue, billingType: e.target.value as BillingType })}
                  >
                    {(Object.keys(BILLING_TYPE_LABEL) as BillingType[]).map((t) => (
                      <option key={t} value={t}>
                        {BILLING_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <input
                    className="inp"
                    type="number"
                    min={0}
                    placeholder="공급가"
                    value={issue.suppliedAmount}
                    onChange={(e) => setIssue({ ...issue, suppliedAmount: e.target.value })}
                  />
                  <input
                    className="inp"
                    type="number"
                    min={0}
                    placeholder="할인 금액"
                    value={issue.discountAmount}
                    onChange={(e) => setIssue({ ...issue, discountAmount: e.target.value })}
                  />
                  </div>
                  <div className="hint">할인은 퍼센트가 아니라 금액으로 입력합니다.</div>
                </div>
              </div>
            </>
          )}

          <div className="frow">
            <label>납기일</label>
            <div>
              <input
                className="inp"
                type="date"
                value={issue.dueDate}
                onChange={(e) => setIssue({ ...issue, dueDate: e.target.value })}
              />
              <div className="hint">비워 두면 납기일 없이 등록됩니다.</div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 결제 요청(링크 · 단말기 기록 · 가상계좌) ── */}
      {payReq && (
        <Modal
          title="결제"
          sub={`${payReq.row.studentName} · ${payReq.row.name} · 미납 ${wonOf(payReq.row.unpaid)}`}
          confirmLabel={payReq.kind === 'terminal' ? '기록' : payReq.kind === 'vbank' ? '계좌 발급' : '링크 만들기'}
          busy={actBusy}
          error={actErr}
          onConfirm={() => void submitPayReq()}
          onClose={() => setPayReq(null)}
        >
          <div className="frow">
            <label>무엇을</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                ['link', '결제 링크'],
                ['terminal', '단말기 결제 기록'],
                ['vbank', '가상계좌 발급'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`chip${payReq.kind === k ? ' on' : ''}`}
                  onClick={() => setPayReq({ ...payReq, kind: k })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {payReq.kind === 'link' && (
            <>
              <div className="frow">
                <label>결제 수단</label>
                <div>
                  <select
                    className="sel"
                    value={payReq.payMethod}
                    onChange={(e) => setPayReq({ ...payReq, payMethod: e.target.value as PayMethodCode })}
                  >
                    {PAY_METHOD_SELECTABLE.map((m) => (
                      <option key={m} value={m}>
                        {PAY_METHOD_CODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                  {/* 왜 둘뿐인지 적는다 — 전에 넷이던 것을 아는 사람이 「없어졌다」고 묻는다 */}
                  <div className="hint">카드 결제창에서 네이버페이·카카오페이도 사용할 수 있습니다.</div>
                </div>
              </div>
              <div className="frow">
                <label>문자 발송</label>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={payReq.sendSms}
                      onChange={(e) => setPayReq({ ...payReq, sendSms: e.target.checked })}
                    />
                    학부모에게 결제 링크를 문자로 보냅니다
                  </label>
                  {/* ★ 끄면 링크만 만들어지고 아무도 모른다 — 그때는 화면이 주소를 알려준다 */}
                  <div className="hint">
                    끄면 만들어진 주소를 <b>이 화면에서 복사해 전달</b>해야 합니다.
                  </div>
                </div>
              </div>
            </>
          )}

          {payReq.kind === 'terminal' && (
            <>
              <div className="note-box">
                <div>
                  데스크 단말기에서 <b>이미 승인된 결제를 적는 것</b>입니다. 여기서 결제가 일어나지
                  않습니다 — 영수증 값을 그대로 옮겨 주세요.
                </div>
              </div>
              <div className="frow">
                <label>승인번호</label>
                <div>
                  <input
                    className="inp"
                    value={payReq.approvalNo}
                    onChange={(e) => setPayReq({ ...payReq, approvalNo: e.target.value })}
                  />
                </div>
              </div>
              <div className="frow">
                <label>카드사</label>
                <div>
                  <input
                    className="inp"
                    placeholder="예: 신한"
                    value={payReq.cardName}
                    onChange={(e) => setPayReq({ ...payReq, cardName: e.target.value })}
                  />
                </div>
              </div>
              <div className="frow">
                <label>승인 시각</label>
                <div>
                  <input
                    className="inp"
                    type="datetime-local"
                    value={payReq.approvedAt}
                    onChange={(e) => setPayReq({ ...payReq, approvedAt: e.target.value })}
                  />
                  <div className="hint">금액은 미납액 {wonOf(payReq.row.unpaid)} 로 기록됩니다.</div>
                </div>
              </div>
            </>
          )}

          {payReq.kind === 'vbank' && (
            <>
              <div className="frow">
                <label>은행</label>
                <div>
                  <input
                    className="inp"
                    value={payReq.bankCode}
                    onChange={(e) => setPayReq({ ...payReq, bankCode: e.target.value })}
                  />
                  <div className="hint">은행 코드입니다(예: 004 국민).</div>
                </div>
              </div>
              <div className="frow">
                <label>입금 기한</label>
                <div>
                  {/* ★ Modal 안 숫자 입력에 step 을 걸지 않는다 — 배수가 아니면 제출이 막힌다 */}
                  <input
                    className="inp"
                    type="number"
                    min={1}
                    value={payReq.days}
                    onChange={(e) => setPayReq({ ...payReq, days: e.target.value })}
                  />
                  <div className="hint">며칠 안에 입금해야 하는지입니다. 지나면 계좌가 만료됩니다.</div>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}

      {payReqDone && (
        <Modal
          title="만들었습니다"
          confirmLabel="닫기"
          hideCancel
          onConfirm={() => setPayReqDone(null)}
          onClose={() => setPayReqDone(null)}
        >
          {payReqDone.payUrl && (
            <div className="frow ro">
              <label>결제 주소</label>
              <div>
                <input className="inp" readOnly value={payReqDone.payUrl} onFocus={(e) => e.currentTarget.select()} />
                <div className="hint">학부모에게 전달합니다. 문자를 켜 두었으면 이미 나갔습니다.</div>
              </div>
            </div>
          )}
          {payReqDone.vbankAccount && (
            <>
              <div className="frow ro">
                <label>입금 계좌</label>
                <div>
                  {payReqDone.vbankBankName ?? ''} {payReqDone.vbankAccount}
                </div>
              </div>
              <div className="frow ro">
                <label>예금주</label>
                <div>{payReqDone.vbankDepositor ?? '-'}</div>
              </div>
            </>
          )}
          {payReqDone.approvedAt && (
            <div className="frow ro">
              <label>승인</label>
              <div>
                {payReqDone.payDetail ?? ''} {payReqDone.tno ? `· ${payReqDone.tno}` : ''}
              </div>
            </div>
          )}
          {!payReqDone.payUrl && !payReqDone.vbankAccount && !payReqDone.approvedAt && (
            <div className="hint">처리됐습니다.</div>
          )}
        </Modal>
      )}

      {/* ── 수납 ── */}
      {pay && (
        <Modal
          title="수납 등록"
          sub={`${pay.row.studentName} · ${pay.row.name}`}
          confirmLabel="수납"
          busy={actBusy}
          error={actErr}
          confirmDisabled={pay.amount.trim() === '' || Number(pay.amount) <= 0}
          onConfirm={() => void submitPay()}
          onClose={() => setPay(null)}
        >
          <div className="frow">
            <label className="req">금액</label>
            <div>
              <input
                className="inp"
                type="number"
                min={1}
                value={pay.amount}
                onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              />
              {/* 부분납이면 여러 건이 쌓인다. 미납액을 기본값으로 넣어 두고 고치게 한다 */}
              <div className="hint">
                미납액 {pay.row.unpaid.toLocaleString()}원. 나눠 받으면 금액을 수정해 입력합니다.
              </div>
            </div>
          </div>
          <div className="frow">
            <label className="req">수단</label>
            <select
              className="sel"
              value={pay.method}
              onChange={(e) => setPay({ ...pay, method: e.target.value as PayMethod })}
            >
              {(Object.keys(PAY_METHOD_LABEL) as PayMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAY_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {/* ── 청구 취소 ── */}
      {refund && (
        <Modal
          wide
          title={`${refund.row.studentName} · ${refund.row.name} — 환불`}
          sub="환불 규정에 따라 이용일수 기준으로 계산합니다."
          confirmLabel={
            refund.done
              ? '닫기'
              : refund.preview?.requiresAdditionalPayment
                ? '추가 납부 확정'
                : '환불'
          }
          busy={refund.busy}
          confirmDisabled={!refund.done && (refund.preview === null || refund.usedDays === '')}
          error={refund.err}
          danger={!refund.done}
          onConfirm={() => (refund.done ? setRefund(null) : void runRefund())}
          onClose={() => setRefund(null)}
        >
          {refund.done ? (
            /* ★★ **집행 결과는 `status` 로 가른다.** 200 이어도 `FAILED` 일 수 있다 —
               「완료」로 띄우면 **돈이 안 갔는데 갔다고 기록**된다 */
            <>
              <div className={`note-box${refund.done.status === 'FAILED' ? ' bad' : ''}`}>
                <div>
                  {refund.done.status === 'FAILED' ? (
                    <>
                      <b style={{ color: 'var(--red)' }}>환불이 되지 않았습니다.</b>{' '}
                      {refund.done.failReason ?? '결제사에서 거절했습니다.'}
                    </>
                  ) : refund.done.status === 'ADDITIONAL_PAYMENT' ? (
                    <>
                      추가 납부가 필요한 금액은 <b>{wonOf(Math.abs(refund.done.refundAmount))}</b>입니다.
                      학부모에게 추가 납부를 안내해 주세요.
                    </>
                  ) : refund.done.status === 'PENDING' ? (
                    <>
                      <b>{wonOf(refund.done.refundAmount)}이 이체 대기로 등록되었습니다.</b> 아직 이체되지
                      않았습니다. 은행에서 이체한 후 [이체 완료]를 선택합니다.
                    </>
                  ) : (
                    <>
                      <b>{wonOf(refund.done.refundAmount)} 환불이 완료되었습니다.</b> 카드 결제 건은 결제사를
                      통해 부분 취소되었습니다.
                    </>
                  )}
                </div>
              </div>
              {refund.done.detail && (
                <div className="hint" style={{ marginTop: 10, whiteSpace: 'pre-line' }}>
                  {refund.done.detail}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="frow">
                <label className="req">이용일수</label>
                <div>
                  {/* ★ `step` 을 안 건다 — Modal 이 form 이라 배수가 아니면 저장이 막힌다 */}
                  <input
                    className="inp"
                    type="number"
                    min={0}
                    value={refund.usedDays}
                    placeholder="예: 12"
                    onChange={(e) => setRefund({ ...refund, usedDays: e.target.value })}
                  />
                  {/* ★★ **출석일수가 아니다.** 「다닌」·「수강한」이라고 사용하면 담당자가
                      출석부를 보고 결석을 뺀다 — **그러면 환불액이 틀린다.** 규정은
                      경과 비율이라 결석해도 줄지 않는다(0820 규정 원문 확인).
                      ★ 분모(교습일수)는 **관리자가 연 1회 등록한 값**을 서버가 읽는다 —
                      화면에서 받는 값이 아니다. 여기는 이용일수만 받는다 */}
                  <div className="hint">
                    등록일부터 환불일까지의 일수가 필요합니다. 실제 출석 여부와 무관합니다.
                  </div>
                </div>
              </div>

              {refund.preview && (
                <div className="frow">
                  <label>계산 결과</label>
                  <div>
                    {/* ★★ **방향을 먼저 말한다.** 규정이 정상가 기준 차감이라 할인받은
                        학생은 차감이 납부액을 넘어 **추가 징수**가 된다 —
                        「돌려드립니다」로 띄우면 데스크가 반대로 처리한다 */}
                    {/* ★★ **한 숫자만 보여주면 안 된다**(1021 피드백 4-2). 디랩 표가
                        「총 환불 금액 395,000」이라 적었는데 그건 **학생이 최종 부담하는
                        금액**이고 실제 환불액은 1,506,000 이었다 — **110만원 넘게 차이난다.**
                        세 줄로 나눠 **무엇이 얼마인지** 못박는다.
                        ★ 디랩 표의 「재결제」는 쓰지 않는다 — **다시 결제하는 것이 아니라
                          학원이 갖는 몫**이다. 아래 항목 표의 「차감」과 같은 값이라
                          **같은 말**로 쓴다 */}
                    {(() => {
                      const paid = (refund.preview.items ?? []).reduce((a, x) => a + x.paidAmount, 0)
                      const ded = (refund.preview.items ?? []).reduce((a, x) => a + x.deduction, 0)
                      if (paid === 0) return null
                      return (
                        <table className="mini-tbl" style={{ marginBottom: 10 }}>
                          <tbody>
                            <tr>
                              <td>납부액</td>
                              <td style={{ textAlign: 'right' }}>{wonOf(paid)}</td>
                            </tr>
                            <tr>
                              <td>
                                <b>환불액</b>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                {wonOf(refund.preview.refundAmount)}
                              </td>
                            </tr>
                            <tr>
                              <td>
                                차감액
                                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
                                  학원 수납 확정
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>{wonOf(ded)}</td>
                            </tr>
                          </tbody>
                        </table>
                      )
                    })()}
                    {refund.preview.requiresAdditionalPayment ? (
                      <div className="note-box bad">
                        <div>
                          실제 수강한 기간의 수강료가 납부액을 초과하여 환불액이 없습니다. 추가 납부가 필요한
                          금액은 <b style={{ color: 'var(--red)' }}>{wonOf(Math.abs(refund.preview.refundAmount))}</b>
                          입니다.
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 18, fontWeight: 800 }}>
                        {wonOf(refund.preview.refundAmount)}
                        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginLeft: 8 }}>
                          환불 금액
                        </span>
                      </div>
                    )}
                    {/* ★ **금액만 보여주면 「왜 이 금액인가」에 답할 수 없다.**
                        클라이언트가 요청한 「추가결제 시 상세 내역 출력」이 이 자리다.
                        항목별로 **납부·차감·결과**를 나란히 둔다 — 차감이 납부를 넘는
                        항목이 어느 것인지 거기서 보인다 */}
                    {refund.preview.items && refund.preview.items.length > 0 ? (
                      <table className="mini-tbl" style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>항목</th>
                            <th style={{ textAlign: 'right' }}>납부</th>
                            <th style={{ textAlign: 'right' }}>차감</th>
                            <th style={{ textAlign: 'right' }}>환불</th>
                          </tr>
                        </thead>
                        <tbody>
                          {refund.preview.items.map((it) => (
                            <tr key={it.itemType}>
                              <td>
                                {BILLING_ITEM_LABEL[it.itemType] ?? it.itemType}
                                {it.detail && <div className="hint">{it.detail}</div>}
                              </td>
                              <td style={{ textAlign: 'right' }}>{wonOf(it.paidAmount)}</td>
                              <td style={{ textAlign: 'right' }}>-{wonOf(it.deduction)}</td>
                              <td
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: it.refund < 0 ? 'var(--red)' : undefined,
                                }}
                              >
                                {wonOf(it.refund)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      refund.preview.detail && (
                        /* 항목이 없으면 문자열을 그대로 — **여러 줄이라 `pre-line` 이어야 한다** */
                        <div className="hint" style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
                          {refund.preview.detail}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              <div className="note-box">
                <div>
                  환불 후에는 되돌릴 수 없습니다. 카드 결제 건은 결제사를 통해 즉시 부분 취소됩니다. 가상계좌
                  결제 건은 <b>이체 대기</b>로 등록되며, 은행에서 직접 이체해야 합니다.
                </div>
              </div>
            </>
          )}
        </Modal>
      )}

      {rcp && (
        <Modal
          wide
          title={`${rcp.row.studentName} · ${rcp.row.name} — 현금영수증`}
          sub="카드 수납은 카드사가 소득공제를 처리하므로 대상이 아닙니다."
          confirmLabel="발급"
          busy={rcp.busy}
          confirmDisabled={rcp.txId === '' || rcp.idInfo.trim() === ''}
          error={rcp.err}
          onConfirm={() => void runIssueReceipt()}
          onClose={() => setRcp(null)}
        >
          {/* ── 이미 낸 것 ── */}
          <div style={{ marginBottom: 14 }}>
            <b style={{ fontSize: 12.5 }}>발급 내역</b>
            {rcp.list === null ? (
              <div className="hint">불러오는 중…</div>
            ) : rcp.list.length === 0 ? (
              <div className="hint">아직 발급한 현금영수증이 없습니다.</div>
            ) : (
              <table className="mini-tbl">
                <thead>
                  <tr>
                    <th>용도</th>
                    <th>번호</th>
                    <th style={{ textAlign: 'right' }}>금액</th>
                    <th>국세청 승인번호</th>
                    <th>상태</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rcp.list.map((c) => (
                    <tr key={c.id}>
                      <td>{c.purpose ? RECEIPT_PURPOSE_LABEL[c.purpose] : '-'}</td>
                      <td>{c.idInfo ?? '-'}</td>
                      <td style={{ textAlign: 'right' }}>{wonOf(c.amount)}</td>
                      {/* 국세청 조회·신고 대조에 쓰는 값이라 그대로 보여준다 */}
                      <td>{c.cashNo ?? '-'}</td>
                      <td>
                        <span
                          className={`mk ${c.status === 'ISSUED' ? 'verified' : c.status === 'CANCELED' ? 'supplement' : 'brandnew'}`}
                        >
                          {RECEIPT_STATUS_LABEL[c.status] ?? c.status}
                        </span>
                        {c.status === 'FAILED' && c.failReason && (
                          <div className="hint">{c.failReason}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {c.status === 'ISSUED' && (
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '3px 8px', fontSize: 11.5, color: 'var(--red)' }}
                            disabled={rcp.busy}
                            onClick={() => void runCancelReceipt(c.id)}
                          >
                            취소
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── 새로 내기 ── */}
          <div className="frow">
            <label className="req">수납 건</label>
            <div>
              <select className="sel" value={rcp.txId} onChange={(e) => setRcp({ ...rcp, txId: e.target.value })}>
                {rcp.row.payments
                  .filter((p) => p.method !== 'CARD')
                  .map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {(p.paidAt ?? '').slice(0, 10)} · {PAY_METHOD_LABEL[p.method] ?? p.method} · {wonOf(p.amount)}
                    </option>
                  ))}
              </select>
              {/* ★ 청구가 아니라 수납 건에 붙는다 — 나눠 받으면 영수증도 건별이다 */}
              <div className="hint">한 청구를 나눠 받았다면 받은 건마다 따로 냅니다.</div>
            </div>
          </div>

          <div className="frow">
            <label className="req">용도</label>
            <div className="type-picks">
              {(['PERSONAL', 'BUSINESS'] as ReceiptPurpose[]).map((k) => (
                <button
                  type="button"
                  key={k}
                  className={`type-pick${rcp.purpose === k ? ' on' : ''}`}
                  onClick={() => setRcp({ ...rcp, purpose: k, idInfo: '' })}
                >
                  {RECEIPT_PURPOSE_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="frow">
            <label className="req">{RECEIPT_ID_LABEL[rcp.purpose]}</label>
            <div>
              <input
                className="inp"
                value={rcp.idInfo}
                placeholder={rcp.purpose === 'PERSONAL' ? '010-0000-0000' : '000-00-00000'}
                onChange={(e) => setRcp({ ...rcp, idInfo: e.target.value })}
              />
              <div className="hint">
                {rcp.purpose === 'PERSONAL'
                  ? '학부모 휴대폰번호로 소득공제가 반영됩니다.'
                  : '사업자등록번호로 지출증빙이 발급됩니다.'}
              </div>
            </div>
          </div>

          <div className="note-box">
            <div>
              부가세는 자동으로 나뉘어 기록됩니다. <b>취소해도 내역은 남습니다</b> — 국세청 신고 내역과
              대조할 수 있어야 하기 때문입니다.
            </div>
          </div>
        </Modal>
      )}

      {cancelRow && (
        <Modal
          title="청구 취소"
          sub={`${cancelRow.studentName} · ${cancelRow.name}`}
          confirmLabel="청구 취소"
          danger
          busy={actBusy}
          error={actErr}
          onConfirm={() => void submitCancel()}
          onClose={() => setCancelRow(null)}
        >
          <div className="note-box risk">
            <div className="ic">
              <Icon name="triangle-alert" size={17} />
            </div>
            <div>
              <div className="tt">되돌릴 수 없습니다</div>
              <div className="tx">
                {cancelRow.receivedAmount > 0 ? (
                  <>
                    <b>{cancelRow.receivedAmount.toLocaleString()}원</b>이 수납된 청구입니다. 수납 내역을 먼저
                    취소한 뒤 청구를 취소하며, 두 건 모두 매출장에서 제외됩니다.
                  </>
                ) : (
                  <>청구 {cancelRow.billedAmount.toLocaleString()}원이 매출장에서 제외됩니다.</>
                )}
                {/* ★ 발급해 둔 가상계좌는 **기한까지 계속 입금을 받는다.** 함께 닫는다는 것을
                    미리 말한다 — 안 입력하면 「계좌는 어떻게 되나」를 따로 묻게 된다 */}
                <div style={{ marginTop: 6 }}>
                  취소 시 발급된 가상계좌도 함께 해지됩니다.
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 결과는 모달을 닫은 뒤에도 보여야 한다 — 무엇이 됐는지 알려주지 않으면 다시 누른다 */}
      {actDone && (
        <Modal title="완료" hideCancel confirmLabel="닫기" onConfirm={() => setActDone(null)} onClose={() => setActDone(null)}>
          <div style={{ fontSize: 13.5 }}>{actDone}</div>
        </Modal>
      )}
    </>
  )
}

/**
 * 기간·지점별 통계 — 지점마다 수납 요약(`/receipt-status/summary`)을 불러 한 표로 놓는다.
 * ★ 지점별 합계 API 가 따로 없어 지점 수만큼 부른다(본사 11곳). 지점 관리자는 자기 지점만 나온다 —
 *   목록은 서버가 권한에 맞게 준다(AcademyContext).
 * ★ 청구 연도(year)와 기간(from~to)은 다른 축이다 — 기간은 청구일 기준이다.
 */
function BranchStatsButton() {
  const { academies } = useAcademy()
  const now = new Date()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
  const [to, setTo] = useState(todayStr())
  const [rows, setRows] = useState<{ name: string; s: ReceiptSummary | null; err?: string }[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    const year = Number(from.slice(0, 4))
    const out = await Promise.all(
      academies.map(async (a) => {
        try {
          return { name: a.acadNm, s: await getReceiptSummary({ academyId: a.id, year, from, to }) }
        } catch (e) {
          return { name: a.acadNm, s: null, err: e instanceof ApiError ? e.message : '불러오지 못함' }
        }
      }),
    )
    setRows(out)
    setBusy(false)
  }

  const won = (n: number) => `${n.toLocaleString()}원`
  const total = (rows ?? []).reduce(
    (t, r) =>
      r.s
        ? { billed: t.billed + r.s.billedAmount, received: t.received + r.s.receivedAmount, unpaid: t.unpaid + r.s.unpaidAmount }
        : t,
    { billed: 0, received: 0, unpaid: 0 },
  )
  const rate = (b: number, r: number) => (b > 0 ? `${Math.round((r / b) * 100)}%` : '-')

  return (
    <>
      <button
        className="btn"
        onClick={() => {
          setOpen(true)
          setRows(null)
        }}
      >
        <Icon name="bar-chart-3" size={14} /> 기간·지점별 통계
      </button>
      {open && (
        <Modal wide title="기간·지점별 수납 통계" hideCancel confirmLabel="닫기" onConfirm={() => setOpen(false)} onClose={() => setOpen(false)}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input className="inp" type="date" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>~</span>
            <input className="inp" type="date" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
            <button type="button" className="btn pri" disabled={busy || !from || !to || from > to} onClick={() => void run()}>
              {busy ? '계산 중…' : '조회'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>청구일 기준</span>
          </div>
          {rows && (
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              <table className="dt nowrap" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>지점</th>
                    <th style={{ textAlign: 'right' }}>청구</th>
                    <th style={{ textAlign: 'right' }}>수납</th>
                    <th style={{ textAlign: 'right' }}>미납</th>
                    <th style={{ textAlign: 'right' }}>미납 건</th>
                    <th style={{ textAlign: 'right' }}>수납률</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      {r.s ? (
                        <>
                          <td style={{ textAlign: 'right' }}>{won(r.s.billedAmount)}</td>
                          <td style={{ textAlign: 'right' }}>{won(r.s.receivedAmount)}</td>
                          <td style={{ textAlign: 'right', color: r.s.unpaidAmount > 0 ? 'var(--red)' : undefined }}>{won(r.s.unpaidAmount)}</td>
                          <td style={{ textAlign: 'right' }}>{r.s.unpaidCount}건</td>
                          <td style={{ textAlign: 'right' }}>
                            <b>{rate(r.s.billedAmount, r.s.receivedAmount)}</b>
                          </td>
                        </>
                      ) : (
                        <td colSpan={5} style={{ color: 'var(--red)' }}>
                          {r.err}
                        </td>
                      )}
                    </tr>
                  ))}
                  {rows.length > 1 && (
                    <tr style={{ fontWeight: 800 }}>
                      <td>합계</td>
                      <td style={{ textAlign: 'right' }}>{won(total.billed)}</td>
                      <td style={{ textAlign: 'right' }}>{won(total.received)}</td>
                      <td style={{ textAlign: 'right' }}>{won(total.unpaid)}</td>
                      <td />
                      <td style={{ textAlign: 'right' }}>{rate(total.billed, total.received)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

export const paymentMockup: Mockup = {
  Content,
  actions: (
    <>
      <BranchStatsButton />
    </>
  ),
}
