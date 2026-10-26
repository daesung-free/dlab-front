import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  Modal,
  NotAllowed,
  Unfilled,
  todayStr,
  type Column,
} from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  MEAL_STATUS_LABEL,
  MEAL_STATUS_TONE,
  createMealClosure,
  deleteMealClosure,
  listMealClosures,
  listMealMonthly,
  getMealPolicy,
  saveMealPolicy,
  listMealOrders,
  listMealOrderWindows,
  setMealOrderWindow,
  cancelMealOrderItem,
  getMealDailyRoster,
  issueMealBillingsMonthly,
  type MealBillingResult,
  type MealDailyRoster,
  type MealRosterRow,
  type MealClosure,
  type MealDay,
  type MealOrder,
  type MealPolicy,
} from '../../api/meals'
import { studentNoText } from '../../lib/studentNo'
import type { Mockup } from './types'
import { createScreenSignal } from './screenSignal'
import '../../styles/forms.css'
import './meal.css'

/** 일자별 명단 컬럼. **좌석번호까지 낸다** — 배식대에서 자리로 찾는다 */
const ROSTER_COLUMNS: Column<MealRosterRow>[] = [
  { key: 'studentNo', header: '학번', width: '110px', value: (r) => studentNoText(r.studentNo) },
  { key: 'studentName', header: '이름', width: '90px', mask: 'name', value: (r) => r.studentName ?? '-' },
  /* ★ 미배정이면 null 이다 — '-' 로 두면 「반이 없는 학생」임이 드러난다 */
  { key: 'className', header: '반', width: '100px', align: 'center', value: (r) => r.className ?? '미배정' },
  { key: 'seatCd', header: '좌석', width: '90px', align: 'center', value: (r) => r.seatCd ?? '미배정' },
]

/* F-4.5 급식 관리 — 신규개발-요구사항신규 (디멤버 급식신청 대체)
 *
 * 실행가이드 Phase 2 주의사항:
 *   "화면보다 결제/정산 상태모델을 먼저 확정할 것"
 *   "Webhook 재시도 + 정합성 배치를 처음부터 설계에 포함"(리스크#4 수납↔급식 동기화오류)
 *
 * PG사는 급식업체가 이미 쓰는 곳과 연동한다 — 신규 선정 대상이 아니다(E-3은 정보 수급 건).
 *
 * 이 화면은 3개 축을 다룬다.
 *   1) 신청·결제  — 누가 며칠치를 결제했는가
 *   2) 일정 관리  — 어느 날 급식을 운영하는가 → 중단일로 등록하면 그날 신청이 막힌다
 *   3) 배식 체크  — 신청한 사람이 실제로 먹었는가 (키오스크·태블릿 RFID/QR)
 *
 * ⚠ 일정과 신청의 관계 — 순서를 지켜야 한다.
 *   중단일 등록은 "앞으로의 신청을 막는" 것이지 "이미 결제된 건을 지우는" 것이 아니다.
 *   이미 신청·결제된 날을 중단으로 바꾸면 해당 건은 전부 환불 대상이 되므로,
 *   서버가 (결제건 존재 여부) 확인 후 환불 배치를 태우고 나서 중단 처리해야 한다.
 *
 * ⚠ 화면 문구에서 내부 사정을 뺐다(2026-09-10). 클라이언트가 보는 URL 이라 이슈 코드·
 *   회신서 메모·Webhook/HMAC 같은 말을 화면에 두지 않는다.
 *   ★ QR 설계 근거는 지우지 말고 여기 남긴다 — 구현할 때 반드시 지켜야 하는 조건이다:
 *     학번을 인코딩한 **정적 QR 은 캡처 한 장으로 대리 수령**이 된다. 앱이 30초 내외로
 *     회전하는 1회용 토큰을 발급하고, 서버가 1회 사용 후 소진시켜야 한다.
 *     태깅 수신은 출결과 같은 Webhook 직접 수신(HMAC 서명검증) 구조를 재사용한다.
 *
 * ⚠ #38 / I-18 (중) — 식사체크 방식.
 *   [0723 메모] "식사체크 주체 = 관리자(교직원), 학생 아님"
 *   [운영 확인] 실제로는 반대다. 학생이 본인 휴대폰에서 앱 QR을 꺼내 스캐너에 태깅하고,
 *              관리자는 그 결과를 옆에서 확인·입회한다. → 운영 기준으로 화면을 맞춘다.
 *              0723 메모와 상충하므로 I-18 종결 시 이 내용으로 확정할 것.
 *
 * ⚠ 태깅이 실패하는 경우가 반드시 생긴다 — 이게 이 화면의 핵심이다.
 *   앱 미설치 · 휴대폰 미소지 · QR 만료 · 스캔 인식 실패 · 단말 오프라인.
 *   배식 줄을 세워둘 수 없으므로 관리자가 즉시 수기 확인으로 통과시키고,
 *   그 건을 나중에 되짚을 수 있도록 사유와 처리자를 남긴다.
 *   → 수기 확인은 예외가 아니라 정상 경로의 일부로 설계한다.
 *
 * ⚠ QR 도용 — 학생이 QR을 캡처해 다른 학생에게 보내면 대리 수령이 된다.
 *   앱이 짧은 만료(30초 내외)의 회전 토큰을 발급하고 서버가 1회용으로 소진시켜야 한다.
 *   정적 QR(학번 인코딩)은 쓰면 안 된다.
 *
 *   안면·지문 생체인식은 검토 대상이며 채택 시 개인정보/ISMS 검토 필수. */


/** 관리자가 등록하는 중단 사유 — 기초관리 마스터로 뺄 후보 */
const CLOSURE_REASONS = ['학원 휴무', '급식업체 휴무', '단축수업', '모의고사', '자체 행사']

/** 초기 등록분 — 실제로는 서버에서 내려온다 */
/* ── 주문/결제 내역 ── */

const won = (n: number) => `${n.toLocaleString()}원`

const ORDER_COLUMNS: Column<MealOrder>[] = [
  {
    key: 'orderNo',
    header: '주문번호',
    width: '148px',
    value: (r) => r.orderNo,
    // 뒤 6자리가 곧 id라, 학부모가 불러준 번호로 되짚을 수 있다
    render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
  },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo ?? '-' },
  { key: 'studentName', header: '이름', width: '84px', mask: 'name', value: (r) => r.studentName },
  { key: 'className', header: '반', width: '56px', align: 'center', value: (r) => r.className ?? '-' },
  { key: 'targetMonth', header: '대상월', width: '84px', align: 'center', value: (r) => r.targetMonth },
  { key: 'activeCount', header: '식수', width: '68px', align: 'right', sortable: true, value: (r) => r.activeCount },
  {
    key: 'paymentMethods',
    header: '결제수단',
    width: '96px',
    align: 'center',
    value: (r) => r.paymentMethods.join(', '),
    render: (r) =>
      r.paymentMethods.length > 0 ? r.paymentMethods.join(', ') : <span style={{ color: 'var(--muted)' }}>-</span>,
  },
  {
    key: 'amount',
    header: '금액',
    width: '104px',
    align: 'right',
    sortable: true,
    /* ★ **`null` 은 0원이 아니라 「금액을 모른다」**다 — 단가가 등록되지 않은 끼니가 있다.
       0 으로 그리면 데스크가 **무료로 읽고**, 손써야 할 것이 청구 발행 때까지 안 보인다 */
    value: (r) => r.amount ?? '',
    render: (r) =>
      r.amount === null ? (
        <span style={{ color: 'var(--red)', fontWeight: 600 }} title="급식업체 단가를 먼저 등록해야 청구할 수 있습니다">
          단가 미등록
        </span>
      ) : (
        won(r.amount)
      ),
  },
  {
    /* ★ 청구가 **발행됐는지**를 목록에서 본다(1016 피드백 1-3). 전에는 칸이 없어
       「이 달 청구 발행」을 눌러 봐야 알 수 있었다.
       ★ **취소된 청구도 번호가 남는다**(이력이다). 상태를 같이 보여주지 않으면
       「이미 발행됨」으로 읽어 **왜 또 발행되는지** 모른다 */
    key: 'billing',
    header: '청구',
    width: '110px',
    align: 'center',
    value: (r) => (r.billingId === null ? '미발행' : r.billingStatus === 'CANCELLED' ? '취소됨' : '발행됨'),
    render: (r) =>
      r.billingId === null ? (
        <span style={{ color: 'var(--muted)' }}>미발행</span>
      ) : r.billingStatus === 'CANCELLED' ? (
        <span className="mk supplement" title="청구가 취소됐습니다. 다시 발행할 수 있습니다">
          취소됨
        </span>
      ) : (
        <span className="mk verified">발행됨</span>
      ),
  },
  {
    key: 'status',
    header: '상태',
    width: '90px',
    align: 'center',
    sortable: true,
    value: (r) => MEAL_STATUS_LABEL[r.status] ?? r.status,
    render: (r) => (
      <span className={`mk ${MEAL_STATUS_TONE[r.status] ?? ''}`}>{MEAL_STATUS_LABEL[r.status] ?? r.status}</span>
    ),
  },
  {
    key: 'cancelPath',
    header: '취소 경로',
    width: '90px',
    align: 'center',
    // 취소는 항목(item) 단위라 주문 하나로 정해지지 않는다. 취소된 항목의 경로를 모아 보여준다
    value: (r) => r.items.filter((i) => i.cancelPath).map((i) => i.cancelPath).join(', '),
    render: (r) => {
      const paths = [...new Set(r.items.filter((i) => i.cancelPath).map((i) => i.cancelPath))]
      return paths.length > 0 ? paths.join(', ') : <span style={{ color: 'var(--muted)' }}>-</span>
    },
  },
  {
    key: 'refundableAmount',
    header: '환불 가능',
    width: '104px',
    align: 'right',
    value: (r) => r.refundableAmount,
    render: (r) =>
      r.refundableAmount > 0 ? (
        <b style={{ color: 'var(--amber)' }}>{won(r.refundableAmount)}</b>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
]

/* ══ 배식 체크 — 학생 앱 QR 태깅 + 관리자 확인 ══ */

/** 학생이 QR을 못 찍는 상황. 배식 줄을 세울 수 없으므로 전부 수기 확인으로 흡수한다 */
const FAIL_REASONS = ['앱 미설치', '휴대폰 미소지', 'QR 만료', '스캔 인식 실패', '단말 오프라인'] as const
type FailReason = (typeof FAIL_REASONS)[number]

type TagMethod = 'QR' | '수기'
type TagResult = 'OK' | 'MANUAL' | 'DUP' | 'NOORDER' | 'FAIL'

const RESULT_META: Record<TagResult, { label: string; cls: string; desc: string }> = {
  OK: { label: 'QR 확인', cls: 'ok', desc: '학생 앱 QR 태깅으로 정상 확인' },
  MANUAL: { label: '수기 확인', cls: 'manual', desc: '태깅 불가 → 관리자가 학번 조회로 직접 확인' },
  DUP: { label: '중복 태깅', cls: 'dup', desc: '이미 배식 처리된 학생' },
  NOORDER: { label: '미신청', cls: 'noorder', desc: '금일 급식 신청 내역 없음 — 배식 거부' },
  FAIL: { label: '확인 필요', cls: 'fail', desc: '태깅 실패 — 관리자 확인 대기' },
}

interface Device {
  id: string
  name: string
  place: string
  /** 학생이 QR을 찍는 스캐너인지, 관리자가 확인·수기처리하는 단말인지 */
  role: '학생 QR 스캐너' | '관리자 확인 단말'
  online: boolean
  lastTagAt: string
  todayCount: number
}

/* ★★ **예시 단말 3대를 지웠다**(2026-10-26).
 *
 *   「QR 스캐너 A · 마지막 처리 12:41:08 · 금일 142건」처럼 **연결 상태와 처리 건수까지
 *   지어내고 있었다.** 한 대는 일부러 오프라인으로 그려 뒀는데, 그걸 보고 현장에
 *   전화하면 멀쩡한 단말이다. 서버에 배식 단말이라는 개념 자체가 없다.
 *
 *   ⚠️ 키오스크(지점당 1대, 출결용)와는 **다른 장비**다 — 그쪽은 `/branch-configs` 로
 *     상태를 받지만 배식 스캐너는 서버가 모른다.
 */
const DEVICES: Device[] = []

interface TagLog {
  id: string
  at: string
  studentNo: string
  name: string
  classNo: string
  device: string
  method: TagMethod
  result: TagResult
  /** 실패·수기 확인일 때의 사유 */
  reason?: FailReason
  /** 수기 확인을 처리한 관리자 */
  handledBy?: string
}

/* ★★ **예시 태깅 로그 38건을 지웠다**(2026-10-26).
 *
 *   위에 「준비 중」 상자를 띄워 뒀는데 **그 아래 표가 38행 차 있었다** — 학번·이름·
 *   시각·실패 사유까지 들어 있어 **실제 배식 기록으로 읽힌다.** 결제 관리에서 걷어낸
 *   것과 같은 종류다. 안내 상자는 숫자와 표보다 늦게 읽힌다.
 *
 *   ★ 요약 칸도 예시를 센 것이었다(「금일 신청 231」은 **상수**였고 날짜는 2026-05-28
 *     로 굳어 있었다). 표를 비우면서 **숫자도 같이 지운다** — 표는 비었는데 위에
 *     숫자가 남으면 그게 제일 나쁘다.
 *
 *   ⚠️ 관리자용 태깅 로그 조회 경로가 서버에 없다. 키오스크 쪽 `getMealApplyYN` 만 있어
 *     「누가 실제로 먹었는가」를 관리자가 되짚을 수 없다(API_GAPS 6-7). 화면 구성·컬럼은
 *     **지우지 않고 둔다**(CLAUDE.md 1) — 지우면 요청해야 할 것이 조용히 사라진다.
 */
const TAG_LOGS: TagLog[] = []
const PENDING: TagLog[] = []

const TAG_COLUMNS: Column<TagLog>[] = [
  { key: 'at', header: '시각', width: '96px', align: 'center', sortable: true, value: (r) => r.at },
  { key: 'studentNo', header: '학번', width: '104px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '82px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  {
    key: 'method',
    header: '방식',
    width: '76px',
    align: 'center',
    sortable: true,
    value: (r) => r.method,
    render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700 }}>
        <Icon name={r.method === 'QR' ? 'qr-code' : 'pencil'} size={13} />
        {r.method}
      </span>
    ),
  },
  { key: 'device', header: '단말', width: '124px', sortable: true, value: (r) => r.device },
  {
    key: 'result',
    header: '결과',
    width: '100px',
    align: 'center',
    sortable: true,
    value: (r) => RESULT_META[r.result].label,
    render: (r) => (
      <span className={`tag-r ${RESULT_META[r.result].cls}`} title={RESULT_META[r.result].desc}>
        {RESULT_META[r.result].label}
      </span>
    ),
  },
  {
    key: 'reason',
    header: '사유',
    width: '116px',
    value: (r) => r.reason ?? '-',
    render: (r) =>
      r.reason ? (
        <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{r.reason}</span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
  {
    key: 'handledBy',
    header: '확인자',
    width: '92px',
    value: (r) => r.handledBy ?? '-',
    render: (r) =>
      r.handledBy ? (
        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{r.handledBy}</span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>자동</span>
      ),
  },
]

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/* toISOString 은 UTC 라 매월 1일 오전 9시 전에는 지난달이 나왔다 — 로컬 날짜로 만든다 */
function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('cal')

  /* ── 일자별 명단 (피드백 5-4) ──
   * ★ **배식대가 보는 것은 숫자가 아니라 명단**이다. 달력은 인원 수까지만 알려준다.
   * ★ **「신청 vs 배식 대조」는 만들지 않는다** — 배식 태깅이 키오스크에서 우리 쪽으로
   *   오는 경로가 없어 「실제로 먹은 사람」 칸을 채울 값이 없다. **빈 칸은 「안 먹었다」로
   *   읽혀** 신청자를 결식 처리하게 된다. */
  const [rosterDate, setRosterDate] = useState(() => todayStr())
  const [roster, setRoster] = useState<MealDailyRoster | null>(null)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterErr, setRosterErr] = useState<string | null>(null)
  const [cancelRow, setCancelRow] = useState<{ row: MealRosterRow; meal: '중식' | '석식' } | null>(null)
  const [rosterCancelBusy, setRosterCancelBusy] = useState(false)

  /** 명단 컬럼 + 취소 버튼. **명단에서 바로 취소**할 수 있게 `orderItemId` 가 함께 온다 */
  const rosterColumns = useCallback(
    (meal: '중식' | '석식'): Column<MealRosterRow>[] => [
      ...ROSTER_COLUMNS,
      {
        key: 'act',
        header: '',
        width: '76px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <button
            className="btn"
            style={{ padding: '3px 9px', fontSize: 11.5 }}
            onClick={() => setCancelRow({ row: r, meal })}
          >
            취소
          </button>
        ),
      },
    ],
    [],
  )

  const loadRoster = useCallback(async () => {
    setRosterLoading(true)
    setRosterErr(null)
    try {
      setRoster(await getMealDailyRoster({ academyId: academyId ?? undefined, date: rosterDate }))
    } catch (e) {
      setRosterErr(e instanceof ApiError ? e.message : '명단을 불러오지 못했습니다.')
      setRoster(null)
    } finally {
      setRosterLoading(false)
    }
  }, [academyId, rosterDate])

  useEffect(() => {
    if (tab === 'roster') void loadRoster()
  }, [tab, loadRoster])
  const [masked, setMasked] = useState(true)

  /* ── 급식비 청구 발행(1016 피드백 1-3) ─────────────────────
   * ⚠️ **`skipped` 를 반드시 보여준다.** 발행 건수만 보면 빠진 사람이 안 보이는데,
   *   사유마다 **조치가 다르다** — 「이미 발행」은 그냥 두면 되지만 **「단가 미등록」은
   *   손을 쓰지 않으면 그 학생 급식비가 영영 청구되지 않는다.** */
  const [billBusy, setBillBusy] = useState(false)
  /* ★ **납기일을 비우고 발행하면 통합 매출장에서 기간으로 좁힐 때 안 보인다**
     (`dueDate IS NULL` 이라 기간 필터에 안 걸린다 — 2026-10-16 서버 확인).
     기본값을 그 달 말일로 채워 둔다 — 비워 두는 쪽이 기본이면 매번 안 보이는 청구가 생긴다 */
  const [billDue, setBillDue] = useState('')
  const [billResult, setBillResult] = useState<MealBillingResult | null>(null)
  const [billErr, setBillErr] = useState<string | null>(null)

  async function issueMonthBillings() {
    if (academyId === null) return
    setBillBusy(true)
    setBillErr(null)
    try {
      setBillResult(await issueMealBillingsMonthly(academyId, month, billDue || undefined))
    } catch (err) {
      setBillErr(err instanceof ApiError ? err.message : '청구를 발행하지 못했습니다.')
    } finally {
      setBillBusy(false)
    }
  }
  const [reason, setReason] = useState(CLOSURE_REASONS[0])
  const [deadlineDays, setDeadlineDays] = useState(3)
  /* 월 접수 기간. **이 기간 밖에는 앱에서 다음 달 신청 화면이 열리지 않는다** —
     저장 전 값과 비교해야 '바뀐 것 없음' 판정이 맞는다 */
  /* 관리자 취소. **3일 제한을 받지 않는 유일한 경로**라 어느 끼니를 지우는지 고르게 한다 */
  const [canceling, setCanceling] = useState<MealOrder | null>(null)
  const [cancelPick, setCancelPick] = useState<number[]>([])
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelErr, setCancelErr] = useState<string | null>(null)
  const [win, setWin] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [savedWin, setSavedWin] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [month, setMonth] = useState(thisMonth())

  /* 달이 바뀌면 납기일을 그 달 말일로 다시 채운다 */
  useEffect(() => {
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) return
    const last = new Date(y, m, 0).getDate()
    setBillDue(`${month}-${String(last).padStart(2, '0')}`)
  }, [month])

  /* 헤더 '기간 선택' — 이번 달·지난 달·다음 달을 한 번에. 본문 월 칸과 같은 값을 쓴다 */
  const monthVer = monthSignal.useVersion()
  useEffect(() => {
    if (monthVer > 0 && pickedMonth) setMonth(pickedMonth)
  }, [monthVer])

  const [dayList, setDayList] = useState<MealDay[]>([])
  const [closureList, setClosureList] = useState<MealClosure[]>([])
  const [orders, setOrders] = useState<MealOrder[]>([])
  const [policy, setPolicy] = useState<MealPolicy | null>(null)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [policyNote, setPolicyNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 이 계정에 안 열린 화면인가(403). 숫자를 하나도 안 그린다 */
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState(false)
  /* 중단일 등록 확인 — ★ 서버는 등록하는 순간 그날 신청을 전부 취소하고, 중단을 풀어도
       되살리지 않는다. 날짜 한 번 눌러 수십 건이 취소되던 것을 막으려고 먼저 묻는다 */
  const [closureAsk, setClosureAsk] = useState<MealDay | null>(null)
  const [closureNote, setClosureNote] = useState<string | null>(null)

  /**
   * 마감 정책 저장.
   *
   * ★ 이 값은 **앱의 신청·취소를 막는 기준**이다. D-3 을 D-5 로 바꾸면 이용 5일 전부터
   *   학생이 신청·취소를 못 한다. 조용히 저장하면 안 되는 값이라 결과를 화면에 남긴다.
   * ★ 저장 뒤 policy 를 갱신해야 '되돌리기'와 '바뀐 것 없음' 판정이 맞는다.
   */
  async function savePolicy() {
    if (academyId === null) return
    setSavingPolicy(true)
    setPolicyNote(null)
    /* ★ 두 가지를 저장한다 — 마감 일수와 월 접수 기간. **바뀐 것만** 보낸다.
         둘 다 앱 화면을 여닫는 값이라 무엇이 저장됐는지 그대로 알린다 */
    const done: string[] = []
    try {
      const year = Number(month.slice(0, 4))
      if (policy === null || deadlineDays !== policy.deadlineDays) {
        const saved = await saveMealPolicy(academyId, year, deadlineDays)
        setPolicy({ academyId, year, deadlineDays: saved, registered: true })
        setDeadlineDays(saved)
        done.push(`마감은 이용일 ${saved}일 전까지`)
      }
      if (win.from !== savedWin.from || win.to !== savedWin.to) {
        if (win.from === '' || win.to === '') {
          throw new ApiError(0, 'INVALID', '접수 시작일과 종료일을 모두 정해 주세요.')
        }
        const saved = await setMealOrderWindow({
          academyId,
          targetMonth: month,
          startsOn: win.from,
          endsOn: win.to,
        })
        const next = { from: saved.startsOn, to: saved.endsOn }
        setWin(next)
        setSavedWin(next)
        done.push(`${month} 접수는 ${saved.startsOn} ~ ${saved.endsOn}`)
      }
      setPolicyNote({
        ok: true,
        text: done.length > 0 ? `${done.join(' · ')} 로 저장했습니다.` : '바뀐 것이 없습니다.',
      })
    } catch (err) {
      setPolicyNote({ ok: false, text: err instanceof ApiError ? err.message : '저장하지 못했습니다.' })
    } finally {
      setSavingPolicy(false)
    }
  }

  /**
   * 고른 끼니를 취소한다.
   *
   * ★ **일괄 API 가 없어 한 건씩 부른다.** 중간에 실패하면 앞의 것은 이미 취소된 상태로
   *   남으므로, 몇 건이 됐고 몇 건이 안 됐는지 그대로 알린다(CLAUDE.md 4).
   * ★ 취소한 끼니는 되살릴 수 없다 — 다시 신청해야 한다.
   */
  async function runCancel() {
    if (canceling === null || cancelPick.length === 0) return
    setCancelBusy(true)
    setCancelErr(null)
    let done = 0
    try {
      for (const id of cancelPick) {
        await cancelMealOrderItem(id)
        done += 1
      }
      setCanceling(null)
      setCancelPick([])
      await load()
      setPolicyNote({ ok: true, text: `${done}끼니를 취소했습니다.` })
    } catch (err) {
      const why = err instanceof ApiError ? err.message : '취소하지 못했습니다.'
      setCancelErr(done > 0 ? `${done}건은 취소됐고 나머지에서 멈췄습니다 — ${why}` : why)
      if (done > 0) await load()
    } finally {
      setCancelBusy(false)
    }
  }

  /** 취소 버튼이 붙은 주문 표. 남은(취소 안 된) 끼니가 있어야 누를 수 있다 */
  const orderColumns: Column<MealOrder>[] = useMemo(
    () => [
      ...ORDER_COLUMNS,
      {
        key: 'act',
        header: '',
        width: '92px',
        align: 'center',
        value: () => '',
        render: (r) => {
          const left = r.items.filter((i) => i.canceledAt === null).length
          return (
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={left === 0}
              title={left === 0 ? '취소할 끼니가 없습니다' : '이용일이 지나지 않은 끼니를 취소합니다'}
              onClick={() => {
                setCanceling(r)
                setCancelPick([])
                setCancelErr(null)
              }}
            >
              취소
            </button>
          )
        },
      },
    ],
    [],
  )

  /** 마감 일수든 접수 기간이든 하나라도 바뀌었나 */
  const dirty =
    (policy !== null && deadlineDays !== policy.deadlineDays) ||
    win.from !== savedWin.from ||
    win.to !== savedWin.to

  const load = useCallback(async () => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [days, cls, ords, pol, wins] = await Promise.all([
        listMealMonthly(academyId, month),
        listMealClosures(academyId, month),
        listMealOrders(academyId, month),
        getMealPolicy(academyId, Number(month.slice(0, 4))),
        listMealOrderWindows(academyId, Number(month.slice(0, 4))),
      ])
      setDayList(days)
      setClosureList(cls)
      setOrders(ords)
      setPolicy(pol)
      setDeadlineDays(pol.deadlineDays)
      // 기간은 달마다 따로다 — 지금 보고 있는 달의 것만 칸에 올린다
      const w = wins.find((x) => x.targetMonth === month)
      const next = { from: w?.startsOn ?? '', to: w?.endsOn ?? '' }
      setWin(next)
      setSavedWin(next)
    } catch (err) {
      /* ★ 권한으로 막힌 것은 고장이 아니다 — 표를 0 으로 그리면 "오늘 0건" 으로 읽힌다 */
      if (err instanceof ApiError && err.code === 'FORBIDDEN') setDenied(true)
      setError(err instanceof ApiError ? err.message : '급식 정보를 불러오지 못했습니다.')
      setDayList([])
      setClosureList([])
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [academyId, month])

  useEffect(() => {
    void load()
  }, [load])

  const available = dayList.filter((d) => d.available)
  const totalOrders = dayList.reduce((a, d) => a + d.lunchCount + d.dinnerCount, 0)
  const closedCount = closureList.length

  const stats = useMemo(() => {
    const paid = orders.filter((o) => o.status === 'PAID')
    return {
      paid: paid.length,
      pending: orders.filter((o) => o.status === 'PENDING' || o.status === 'ISSUED').length,
      canceled: orders.filter((o) => o.status === 'CANCELLED' || o.status === 'REFUNDED').length,
      expired: orders.filter((o) => o.status === 'EXPIRED').length,
      /* 금액을 모르는 주문은 **0으로 더하지 않는다** — 0으로 치면 합계가 조용히 모자란다.
         몇 건이 빠졌는지는 아래 `unpriced` 로 함께 보여준다 */
      revenue: paid.reduce((a, o) => a + (o.amount ?? 0), 0),
      unpriced: orders.filter((o) => o.amount === null).length,
    }
  }, [orders])

  /** 중단일 등록·해제 — 서버가 결제건 확인 후 처리한다 */
  async function addClosure(date: string) {
    if (academyId === null) return
    setBusy(true)
    setClosureNote(null)
    try {
      const saved = await createMealClosure(academyId, date, reason)
      setClosureNote(
        saved.canceledCount > 0
          ? `${date} 을 중단일로 등록했습니다 — 신청 ${saved.canceledCount}건이 취소됐습니다. 결제된 건은 환불해 주세요.`
          : `${date} 을 중단일로 등록했습니다. 취소된 신청은 없습니다.`,
      )
      setClosureAsk(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '중단일을 등록하지 못했습니다.')
      setClosureAsk(null)
    } finally {
      setBusy(false)
    }
  }

  async function removeClosure(closureId: number) {
    setBusy(true)
    setClosureNote(null)
    try {
      await deleteMealClosure(closureId)
      setClosureNote('중단을 풀었습니다. 중단 때 취소된 신청은 되살아나지 않으니, 필요한 학생은 다시 신청해야 합니다.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '중단일을 해제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 배식 체크 집계 — 금일 신청자 대비 */
  const check = useMemo(() => {
    const ok = TAG_LOGS.filter((t) => t.result === 'OK').length
    const manual = TAG_LOGS.filter((t) => t.result === 'MANUAL').length
    /* ★ 예전에는 `const ordered = 231` 이었다 — **지어낸 숫자**다. 신청 인원은 이 탭이
         아니라 「일자별 명단」이 서버에서 받아온다. 여기서는 세지 않는다 */
    const ordered = 0
    return {
      ordered,
      ok,
      manual,
      /** QR + 수기 = 실제 배식 확인 인원 */
      confirmed: ok + manual,
      missing: Math.max(0, ordered - ok - manual),
      pending: PENDING.length,
      rejected: TAG_LOGS.filter((t) => t.result === 'DUP' || t.result === 'NOORDER').length,
    }
  }, [])

  /** 중단일 토글 — 주말·공휴일은 애초에 운영일이 아니라 손댈 수 없다 */
  function toggleClosure(d: MealDay) {
    if (d.closedReason === 'WEEKEND' || d.closedReason === 'HOLIDAY') return
    const existing = closureList.find((c) => c.date === d.date)
    if (existing) void removeClosure(existing.id)
    else setClosureAsk(d)
  }

  if (denied) return <NotAllowed what="급식 관리" />

  return (
    <div className="p-meal">
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="calendar-check" size={13} /> 급식 운영일
          </div>
          <div className="v">{available.length}</div>
          <div className="d">
            {dayList.length}일 중 · 중단 {closedCount}일 반영
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="utensils" size={13} /> 월 총 식수
          </div>
          <div className="v">{totalOrders.toLocaleString()}</div>
          <div className="d">{month}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="check-check" size={13} /> 결제 확정
          </div>
          <div className="v" style={{ color: 'var(--green)' }}>
            {stats.paid}
          </div>
          <div className="d up">
            {stats.revenue.toLocaleString()}원
            {/* ★ 금액을 모르는 주문은 안 더했다. **안 적으면 합계가 조용히 모자란다** */}
            {stats.unpriced > 0 && (
              <span style={{ color: 'var(--red)', marginLeft: 6 }}>· 단가 미등록 {stats.unpriced}건 제외</span>
            )}
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="clock" size={13} /> 가상계좌 대기
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {stats.pending}
          </div>
          <div className="d warn">10분 주기 스케줄러</div>
        </div>
        {/* ★ 이 두 칸은 **예시 값이었다.** 배식 태깅 기록이 서버에 없어(키오스크 대기) 아래
               '배식 체크' 탭은 예시로 두는데, 위 통계 줄은 실데이터 칸과 나란히 있어
               **예시인 줄 모르고 읽힌다.** 월 총 식수 0 인데 배식 확인 31 로 보였다(09-25). */}
        <div className="stat">
          <div className="l">
            <Icon name="qr-code" size={13} /> 금일 배식 확인
          </div>
          <div className="v">
            <Unfilled reason="배식 태깅 기록이 서버에 없다 (키오스크 대기)" />
          </div>
          <div className="d">신청 인원 중 확인</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 확인 필요
          </div>
          <div className="v">
            <Unfilled reason="배식 태깅 기록이 서버에 없다 (키오스크 대기)" />
          </div>
          <div className="d">태깅 실패</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>대상 월</span>
        <input className="inp" type="month" style={{ width: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}
      {closureNote && (
        <div className="note-box" role="status">
          <div>{closureNote}</div>
        </div>
      )}

      {closureAsk && (
        <Modal
          title={`${closureAsk.date} 급식을 중단할까요?`}
          sub={`사유: ${reason}`}
          confirmLabel="중단일로 등록"
          danger
          busy={busy}
          onConfirm={() => void addClosure(closureAsk.date)}
          onClose={() => setClosureAsk(null)}
        >
          <div className="note-box">
            <div>
              {closureAsk.lunchCount + closureAsk.dinnerCount > 0 ? (
                <>
                  그날 신청 <b>{closureAsk.lunchCount + closureAsk.dinnerCount}건</b>(점심 {closureAsk.lunchCount} · 저녁{' '}
                  {closureAsk.dinnerCount})이 <b>바로 취소</b>됩니다. 결제된 건은 환불해야 합니다.
                </>
              ) : (
                <>그날 들어온 신청은 없습니다.</>
              )}
              <br />
              중단을 나중에 풀어도 <b>취소된 신청은 되살아나지 않습니다.</b>
            </div>
          </div>
        </Modal>
      )}

      {canceling && (
        <Modal
          title={`${canceling.studentName} 님의 급식을 취소할까요?`}
          sub={`${canceling.targetMonth} · 주문번호 ${canceling.orderNo}`}
          confirmLabel={`${cancelPick.length}끼니 취소`}
          danger
          busy={cancelBusy}
          error={cancelErr}
          confirmDisabled={cancelPick.length === 0}
          onConfirm={() => void runCancel()}
          onClose={() => setCanceling(null)}
        >
          <div className="note-box">
            <div>
              앱에서는 <b>이용일 {deadlineDays}일 전까지만</b> 취소됩니다. 여기서는 그 제한 없이 취소되지만,
              <b> 취소한 끼니는 되살릴 수 없습니다</b> — 다시 신청해야 합니다. 결제된 건은 환불이 따로 필요합니다.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, maxHeight: 260, overflowY: 'auto' }}>
            {canceling.items
              .filter((i) => i.canceledAt === null)
              .map((i) => (
                <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={cancelPick.includes(i.id)}
                    onChange={(e) =>
                      setCancelPick((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((x) => x !== i.id)))
                    }
                  />
                  <span>
                    {i.mealDate} · {i.mealType === 'LUNCH' ? '점심' : i.mealType === 'DINNER' ? '저녁' : i.mealType}
                  </span>
                  {i.unitPrice !== null && <span style={{ color: 'var(--muted)' }}>{won(i.unitPrice)}</span>}
                </label>
              ))}
          </div>
        </Modal>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'cal', label: '월별 신청 현황' },
            { key: 'roster', label: '일자별 명단' },
            { key: 'schedule', label: '급식 일정 관리', count: closedCount },
            { key: 'check', label: '배식 체크', count: TAG_LOGS.length },
            { key: 'orders', label: '결제 · 취소 내역', count: orders.length },
            { key: 'policy', label: '결제 · 취소 정책' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {/* ═══ 월별 신청 현황 ═══ */}
        {tab === 'roster' && (
          <div style={{ padding: 14 }}>
            {/* ★ 대조 화면을 만들지 않은 이유를 적어 둔다 — 안 적으면 「왜 먹은 사람이 없냐」가 된다 */}
            <div className="note-box">
              <div>
                그날 <b>신청한 사람</b>의 명단입니다. 실제로 받아 갔는지는 키오스크에서 넘어오는 값이 없어
                표시하지 않습니다.
              </div>
            </div>

            <div className="frow" style={{ marginTop: 10 }}>
              <label>날짜</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="inp"
                  type="date"
                  style={{ width: 170 }}
                  value={rosterDate}
                  onChange={(e) => setRosterDate(e.target.value)}
                />
                <MaskToggle masked={masked} onChange={setMasked} />
              </div>
            </div>

            {rosterErr && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {rosterErr}
              </div>
            )}

            {([
              { key: '중식' as const, rows: roster?.lunch ?? [], count: roster?.lunchCount ?? 0 },
              { key: '석식' as const, rows: roster?.dinner ?? [], count: roster?.dinnerCount ?? 0 },
            ]).map((g) => (
              <div key={g.key} style={{ marginTop: 14 }}>
                <DataTable
                  columns={rosterColumns(g.key)}
                  rows={g.rows}
                  rowKey={(r) => String(r.orderItemId)}
                  masked={masked}
                  loading={rosterLoading}
                  pageSize={20}
                  emptyText={`${g.key} 신청자가 없습니다.`}
                  countLabel={
                    <>
                      {g.key} <b>{g.count}</b>명
                    </>
                  }
                  toolbar={
                    <ExcelButton
                      filename={`급식명단_${rosterDate}_${g.key}`}
                      columns={ROSTER_COLUMNS}
                      rows={g.rows}
                      masked={masked}
                    />
                  }
                />
              </div>
            ))}
          </div>
        )}

        {tab === 'cal' && (
          <div className="card-sec-b">
            <div className="cal">
              {DOW.map((d, i) => (
                <div className={`cal-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`} key={d}>
                  {d}
                </div>
              ))}
              {/* 달의 첫날 요일만큼 앞을 비운다. 서버가 준 날짜에서 계산한다 */}
              {dayList.length > 0 &&
                Array.from({ length: new Date(`${dayList[0].date}T00:00:00`).getDay() }, (_, i) => (
                  <div className="cal-cell pad" key={`pad-${i}`} />
                ))}
              {dayList.map((d) => {
                const dayNum = Number(d.date.slice(8))
                const count = d.lunchCount + d.dinnerCount
                const cls =
                  d.closedReason === 'CLOSURE'
                    ? ' closed'
                    : d.closedReason === 'HOLIDAY'
                      ? ' holiday'
                      : d.closedReason === 'WEEKEND'
                        ? ' off'
                        : ' on'
                return (
                  <div
                    className={`cal-cell${cls}`}
                    key={d.date}
                    title={d.closureReason ?? (d.available ? `${count}식` : (d.closedReason ?? ''))}
                    onClick={() => toggleClosure(d)}
                    style={{ cursor: d.closedReason === 'WEEKEND' || d.closedReason === 'HOLIDAY' ? 'default' : 'pointer' }}
                  >
                    <div className="dnum">{dayNum}</div>
                    {d.closedReason === 'CLOSURE' ? (
                      <div className="closed-lbl">
                        신청 차단
                        <br />
                        {d.closureReason ?? ''}
                      </div>
                    ) : !d.available ? (
                      <div className="off-lbl">{d.closedReason === 'HOLIDAY' ? '공휴일' : '주말'}</div>
                    ) : (
                      <>
                        <div className="cnt">{count}</div>
                        <div className="lbl">식</div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="cal-legend">
              <span>
                <span className="sw" style={{ background: 'var(--mint-soft)', border: '1px solid var(--mint-b)' }} />
                급식 운영일
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--line-2)' }} />
                주말 제외
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--red-wash)', border: '1px solid #f3cfc7' }} />
                공휴일 제외
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--amber-wash)', border: '1px solid #f6dcb4' }} />
                관리자 등록 중단일 — 신청 차단
              </span>
              <span style={{ marginLeft: 'auto' }}>주말·공휴일은 자동 제외됩니다</span>
            </div>
          </div>
        )}

        {/* ═══ 급식 일정 관리 ═══ */}
        {tab === 'schedule' && (
          <div className="card-sec-b">
            <div className="note-box">
              <div className="ic">
                <Icon name="calendar-days" size={17} />
              </div>
              <div>
                <div className="tt">중단일로 등록하면 그날은 앱·데스크 모두 신청이 막힙니다</div>
                <div className="tx">
                  날짜를 눌러 <b>운영 ↔ 중단</b>을 전환합니다. 주말·공휴일은 정책상 이미 제외돼 있어 손댈 수 없습니다.
                  <br />
                  <b>중단일로 등록하면 그날 신청이 바로 취소</b>되고, 결제된 건은 환불 대상이 됩니다. 등록 전에 건수를
                  한 번 더 보여 드립니다. 중단을 풀어도 취소된 신청은 되살아나지 않습니다.
                </div>
              </div>
            </div>

            <div className="frow" style={{ marginBottom: 16 }}>
              <label>중단 사유</label>
              <div className="sf-chips">
                {CLOSURE_REASONS.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={`chip${reason === r ? ' on' : ''}`}
                    onClick={() => setReason(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="cal">
              {DOW.map((d, i) => (
                <div className={`cal-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`} key={d}>
                  {d}
                </div>
              ))}
              {dayList.length > 0 &&
                Array.from({ length: new Date(`${dayList[0].date}T00:00:00`).getDay() }, (_, i) => (
                  <div className="cal-cell pad" key={`pad-${i}`} />
                ))}
              {dayList.map((d) => {
                const locked = d.closedReason === 'WEEKEND' || d.closedReason === 'HOLIDAY'
                const isClosure = d.closedReason === 'CLOSURE'
                const dayNum = Number(d.date.slice(8))
                return (
                  <button
                    type="button"
                    className={`cal-cell editable${isClosure ? ' closed' : d.closedReason === 'HOLIDAY' ? ' holiday' : d.closedReason === 'WEEKEND' ? ' off' : ' on'}`}
                    key={d.date}
                    disabled={locked || busy}
                    onClick={() => toggleClosure(d)}
                    title={
                      locked
                        ? '주말·공휴일은 정책상 자동 제외'
                        : isClosure
                          ? `중단 해제 (현재 사유: ${d.closureReason ?? ''})`
                          : `${reason} 사유로 중단 등록`
                    }
                  >
                    <div className="dnum">{dayNum}</div>
                    {isClosure ? (
                      <div className="closed-lbl">
                        중단
                        <br />
                        {d.closureReason ?? ''}
                      </div>
                    ) : locked ? (
                      <div className="off-lbl">{d.closedReason === 'HOLIDAY' ? '공휴일' : '주말'}</div>
                    ) : (
                      <>
                        <div className="cnt">{d.lunchCount + d.dinnerCount}</div>
                        <div className="lbl">신청 가능</div>
                      </>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="track-grid" style={{ marginTop: 18 }}>
              <div className="track">
                <div className="th" style={{ color: 'var(--mint-d)' }}>
                  <Icon name="timer" size={15} /> 신청 마감 규칙
                </div>
                <div className="frow" style={{ marginTop: 4, marginBottom: 8 }}>
                  <label>마감</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5 }}>이용일</span>
                    <select
                      className="sel"
                      style={{ width: 78 }}
                      value={deadlineDays}
                      onChange={(e) => setDeadlineDays(Number(e.target.value))}
                    >
                      {[1, 2, 3, 5, 7].map((n) => (
                        <option key={n} value={n}>
                          D-{n}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 12.5 }}>23:59까지</span>
                    {/* registered=false 면 지점 정책이 없어 서버 기본값을 쓰는 중이다 */}
                    {policy && !policy.registered && (
                      <span className="mk supplement" title="지점 정책이 등록되지 않아 기본값을 쓰고 있습니다">
                        기본값
                      </span>
                    )}
                  </div>
                </div>
                <ul>
                  <li>
                    앱 신청·취소 모두 <b>이용일 {deadlineDays}일 전</b>까지
                  </li>
                  <li>마감 후에는 데스크 당일 신청만 가능</li>
                  <li>마감 하루 전 알림톡 자동 발송</li>
                </ul>
              </div>

              <div className="track desk">
                <div className="th" style={{ color: 'var(--amber)' }}>
                  <Icon name="calendar-range" size={15} /> 월 접수 기간
                </div>
                <div className="two" style={{ margin: '4px 0 10px' }}>
                  {/* 지금 보고 있는 달({month})의 기간이다. 달을 바꾸면 그 달 값으로 다시 올라온다 */}
                  <input
                    className="inp"
                    type="date"
                    value={win.from}
                    onChange={(e) => setWin({ ...win, from: e.target.value })}
                  />
                  <input
                    className="inp"
                    type="date"
                    value={win.to}
                    onChange={(e) => setWin({ ...win, to: e.target.value })}
                  />
                </div>
                <ul>
                  <li>기간 밖에는 다음 달 신청 화면이 열리지 않음</li>
                  <li>접수 시작 시 앱 푸시 자동 발송</li>
                  <li>급식업체 식수 통보 마감과 일치시킬 것</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              {/* 되돌리기 = 서버에 저장된 값으로 입력칸을 되돌린다. 저장 전이면 바뀐 것이 없다 */}
              {policyNote && (
                <span
                  role="status"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: policyNote.ok ? 'var(--mint-d)' : 'var(--red)',
                    marginRight: 6,
                  }}
                >
                  {policyNote.text}
                </span>
              )}
              <button
                className="btn"
                disabled={savingPolicy || !dirty}
                onClick={() => {
                  if (policy) setDeadlineDays(policy.deadlineDays)
                  setWin(savedWin)
                  setPolicyNote(null)
                }}
              >
                되돌리기
              </button>
              <button
                className="btn pri"
                disabled={savingPolicy || academyId === null || !dirty}
                title={
                  academyId === null ? '지점을 먼저 선택하세요' : !dirty ? '바뀐 것이 없습니다' : undefined
                }
                onClick={() => void savePolicy()}
              >
                <Icon name="save" size={14} /> {savingPolicy ? '저장 중…' : '일정 저장 · 신청 차단 반영'}
              </button>
            </div>
          </div>
        )}

        {/* ═══ 배식 체크 ═══
            ⚠️ 관리자용 태깅 로그 조회 API가 없다. 키오스크 쪽 getMealApplyYN 만 있어
               "누가 실제로 먹었는가"를 관리자가 되짚을 수 없다 — docs/API_GAPS.md 6-7.
               아래는 목업 데이터다. */}
        {tab === 'check' && (
          <div style={{ padding: '14px 14px 0' }}>
            <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
              <div className="ic">
                <Icon name="triangle-alert" size={17} />
              </div>
              <div>
                <div className="tt">배식 확인 내역은 준비 중입니다</div>
                <div className="tx">
                  배식대에서 확인하는 것은 되지만, <b>관리자가 "누가 실제로 먹었는가"를
                  되짚는 조회</b>가 없습니다. 수기 확인 건의 사유·처리자도 같이 필요합니다.
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'check' && (
          <div className="card-sec-b">
            <div className="note-box">
              <div className="ic">
                <Icon name="qr-code" size={17} />
              </div>
              <div>
                <div className="tt">학생이 본인 휴대폰 QR을 찍고, 관리자가 그 결과를 확인합니다</div>
                <div className="tx">
                  배식대 입구에서 <b>학생이 앱에서 QR을 꺼내 스캐너에 태깅</b>하면 스캐너 화면과 관리자 태블릿에 즉시 결과가
                  뜹니다. 관리자는 옆에서 <b>통과 / 거부를 확인</b>하는 역할입니다.
                  <br />
                  <b>태깅이 안 되는 경우가 반드시 생깁니다</b> — 앱 미설치, 휴대폰 미소지, QR 만료, 인식 실패, 단말 오프라인.
                  배식 줄을 세워둘 수 없으므로 관리자가 <b>학번으로 조회해 수기 확인</b>으로 즉시 통과시키고, 사유와 확인자를
                  기록으로 남깁니다.
                </div>
              </div>
            </div>

            {/* ── 태깅 실패 처리 큐 — 지금 줄 서 있는 학생들 ── */}
            {check.pending > 0 && (
              <div className="card-sec" style={{ border: '1.5px solid #f3cfc7', marginBottom: 14 }}>
                <div className="card-sec-h" style={{ background: 'var(--red-wash)', borderRadius: '16px 16px 0 0' }}>
                  <div className="t" style={{ color: 'var(--red)' }}>
                    <span className="ico" style={{ color: 'var(--red)' }}>
                      <Icon name="triangle-alert" size={15} />
                    </span>
                    확인 필요 — 태깅 실패 {check.pending}건
                  </div>
                  <div className="r">
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      배식대에서 대기 중입니다. 학번 확인 후 통과시키세요.
                    </span>
                  </div>
                </div>
                <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {PENDING.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '11px 13px',
                        border: '1px solid var(--line)',
                        borderRadius: 11,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
                        {p.at}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                        {masked ? `${p.name[0]}*${p.name.slice(2)}` : p.name}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {p.studentNo} · {p.classNo}
                      </span>
                      <span className="tag-r fail">{p.reason}</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button className="btn pri" style={{ padding: '6px 12px', fontSize: 12 }} disabled data-soon title="준비 중입니다">
                          <Icon name="check" size={13} /> 수기 확인 통과
                        </button>
                        <button className="btn" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--red)' }} disabled data-soon title="준비 중입니다">
                          거부
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {DEVICES.length === 0 && (
              <div className="note-box" style={{ marginBottom: 14 }}>
                <div>
                  배식대 단말의 연결 상태는 아직 표시되지 않습니다. 단말이 멈추면 그 줄은{' '}
                  <b>수기 확인으로 처리</b>해 주시기 바랍니다.
                </div>
              </div>
            )}

            <div className="dev-grid">
              {DEVICES.map((d) => (
                <div className={`dev${d.online ? '' : ' off'}`} key={d.id}>
                  <div className="dh">
                    <Icon name={d.role === '학생 QR 스캐너' ? 'qr-code' : 'monitor'} size={15} />
                    <b>{d.name}</b>
                    <span className="dot" title={d.online ? '연결됨' : '오프라인'} />
                  </div>
                  <div className="dm">
                    <code style={{ fontSize: 10 }}>{d.id}</code> · {d.place}
                    <br />
                    역할 <b>{d.role}</b>
                    <br />
                    {d.online ? (
                      <>
                        마지막 처리 <b>{d.lastTagAt}</b> · 금일 <b>{d.todayCount}</b>건
                      </>
                    ) : (
                      <span style={{ color: 'var(--red)', fontWeight: 700 }}>
                        오프라인 — {d.lastTagAt} 이후 응답 없음 · 이 줄은 수기 확인으로 처리
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ★★ **0 을 숫자로 띄우지 않는다.** 조회 경로가 없어 못 센 것인데 0 으로 찍으면
                   「오늘 아무도 안 먹었다」로 읽힌다 — 그게 예시 숫자보다 나을 것이 없다.
                   ★ 날짜도 `2026-05-28` 로 굳어 있었다. 못 세는 칸에 날짜를 붙이면
                     그 날짜 집계가 있는 것처럼 보인다 */}
            <div className="stat-strip" style={{ marginBottom: 16 }}>
              <div className="stat">
                <div className="l">
                  <Icon name="utensils" size={13} /> 금일 신청
                </div>
                <div className="v">-</div>
                <div className="d">일자별 명단에서 확인합니다</div>
              </div>
              <div className="stat">
                <div className="l">
                  <Icon name="qr-code" size={13} /> QR 확인
                </div>
                <div className="v">-</div>
                <div className="d">집계 준비 중</div>
              </div>
              <div className="stat">
                <div className="l">
                  <Icon name="pencil" size={13} /> 수기 확인
                </div>
                <div className="v">-</div>
                <div className="d">집계 준비 중</div>
              </div>
              <div className="stat">
                <div className="l">
                  <Icon name="user-x" size={13} /> 미체크
                </div>
                <div className="v">-</div>
                <div className="d">신청했으나 미방문</div>
              </div>
              <div className="stat">
                <div className="l">
                  <Icon name="shield-off" size={13} /> 거부
                </div>
                <div className="v">-</div>
                <div className="d">중복 · 미신청</div>
              </div>
            </div>

            <DataTable
              columns={TAG_COLUMNS}
              rows={TAG_LOGS}
              rowKey={(r) => r.id}
              masked={masked}
              pageSize={12}
              emptyText="배식 확인 내역은 아직 제공되지 않습니다. 배식대에서 확인하는 것은 그대로 됩니다."
              countLabel={<>금일 태깅 <b>{TAG_LOGS.length}</b>건</>}
              toolbar={
                <>
                  <button className="btn" disabled data-soon title="준비 중입니다">
                    <Icon name="user-x" size={14} /> 미체크자 조회
                  </button>
                  <button className="btn" disabled data-soon title="준비 중입니다">
                    <Icon name="search" size={14} /> 학번으로 수기 확인
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="급식_배식체크" columns={TAG_COLUMNS} rows={TAG_LOGS} masked={masked} />
                </>
              }
            />

          </div>
        )}

        {/* ═══ 결제 · 취소 내역 ═══ */}
        {tab === 'orders' && (
          <div style={{ padding: 14 }}>
            {/* ★ **이게 없어서 급식비가 통합 매출장에 안 들어오고 있었다**(1016 피드백 1-3).
                서버에 로직은 다 있었는데 컨트롤러에 안 붙어 있었다 — 2026-10-16 에 열렸다.
                ★ 두 번 눌러도 안전하다. 이미 발행된 주문은 건너뛴다 */}
            <div className="frow" style={{ marginBottom: 12 }}>
              <label>급식비 청구</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn pri"
                  disabled={academyId === null || billBusy || orders.length === 0}
                  title={orders.length === 0 ? '이 달 주문이 없습니다' : undefined}
                  onClick={() => void issueMonthBillings()}
                >
                  <Icon name="receipt" size={14} /> {billBusy ? '발행 중…' : `${month} 청구 발행`}
                </button>
                <label style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  납기일
                  <input
                    className="inp"
                    type="date"
                    style={{ width: 150 }}
                    value={billDue}
                    onChange={(e) => setBillDue(e.target.value)}
                  />
                </label>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  발행 시 수납현황의 통합 매출장에 반영됩니다. 이미 발행된 주문은 발행 대상에서 제외됩니다.
                </span>
              </div>
            </div>
            <DataTable
              columns={orderColumns}
              rows={orders}
              rowKey={(r) => String(r.id)}
              masked={masked}
              loading={loading}
              pageSize={12}
              emptyText={academyId === null ? '지점을 먼저 선택하세요.' : '해당 월 주문이 없습니다.'}
              countLabel={
                <>
                  {month} 주문 <b>{orders.length}</b>건
                </>
              }
              toolbar={
                <>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="급식_결제내역" columns={ORDER_COLUMNS} rows={orders} masked={masked} />
                </>
              }
            />
          </div>
        )}

        {/* ═══ 결제 · 취소 정책 ═══ */}
        {tab === 'policy' && (
          <div className="card-sec-b">
            <div className="track-grid">
              <div className="track">
                <div className="th" style={{ color: 'var(--violet)' }}>
                  <Icon name="smartphone" size={15} /> 앱 취소 (학생·학부모)
                </div>
                <ul>
                  <li>
                    이용일 <b>{deadlineDays}일 전까지</b>만 취소 가능
                  </li>
                  <li>
                    취소 시 <b>PG 자동환불</b> 처리
                  </li>
                  <li>급식업체에 취소 자동 전달</li>
                  <li>수납에 자동 반영</li>
                </ul>
              </div>
              <div className="track desk">
                <div className="th" style={{ color: 'var(--amber)' }}>
                  <Icon name="monitor" size={15} /> 데스크 취소 (관리자)
                </div>
                <ul>
                  <li>
                    <b>기간 제한 없이 즉시</b> 취소
                  </li>
                  <li>환불은 데스크에서 개별 처리</li>
                  <li>
                    데스크 당일 신청은 앱 월말 일괄과 <b>별개 flow</b>
                  </li>
                  <li>당일 신청은 데스크에서 직접 등록</li>
                </ul>
              </div>
            </div>

            <div className="track" style={{ marginTop: 12 }}>
              <div className="th" style={{ color: 'var(--red)' }}>
                <Icon name="calendar-days" size={15} /> 중단일 등록으로 인한 취소
              </div>
              <ul>
                <li>
                  관리자가 <b>운영일 → 중단일</b>로 바꾸면 해당일 결제건은 전액 환불 대상
                </li>
                <li>
                  저장 즉시 확정되지 않고, <b>결제건 확인 → 환불 → 중단 확정</b> 순으로 처리
                </li>
                <li>환불 실패 건은 데스크 수기 처리 목록으로 넘어감</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* ★ 취소하면 **되살릴 수 없다** — 다시 신청해야 한다. 그래서 누구의 어느 끼니인지
             그대로 보여주고 확인받는다 */}
      {(billResult || billErr) && (
        <Modal
          wide
          title="급식비 청구 발행 결과"
          confirmLabel="닫기"
          error={billErr}
          onConfirm={() => {
            setBillResult(null)
            setBillErr(null)
          }}
          onClose={() => {
            setBillResult(null)
            setBillErr(null)
          }}
        >
          {billResult && (
            <>
              <div className="note-box">
                <div>
                  <b>{billResult.issuedCount}건</b>을 발행했습니다. 수납현황 통합 매출장에서 확인할 수 있습니다.
                </div>
              </div>

              {/* ★ **빠진 사람을 사유별로 가른다.** 발행 건수만 보면 안 보이는데, 사유마다
                  조치가 다르다 — 「이미 발행」은 그냥 두면 되지만 다른 사유는 손을 써야 하고,
                  **안 그러면 그 학생 급식비는 영영 청구되지 않는다** */}
              {billResult.skipped.length > 0 &&
                (() => {
                  const already = billResult.skipped.filter((x) => x.reason.includes('이미 청구'))
                  const needFix = billResult.skipped.filter((x) => !x.reason.includes('이미 청구'))
                  return (
                    <>
                      {needFix.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <b style={{ fontSize: 12.5, color: 'var(--red)' }}>
                            청구되지 않은 {needFix.length}명 — 확인이 필요합니다
                          </b>
                          <div className="hint" style={{ marginBottom: 6 }}>
                            해당 학생들의 급식비를 청구하려면 청구를 생성해야 합니다.
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
                              {needFix.map((x) => (
                                <tr key={x.orderId}>
                                  <td>{x.studentNo ?? '-'}</td>
                                  <td>{x.studentName}</td>
                                  <td>{x.reason}</td>
                                </tr>
                              ))}
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
          )}
        </Modal>
      )}

      {cancelRow && (
        <Modal
          title="급식 신청을 취소합니다"
          sub={`${rosterDate} ${cancelRow.meal}`}
          confirmLabel="취소하기"
          danger
          busy={rosterCancelBusy}
          onConfirm={() => {
            setRosterCancelBusy(true)
            void cancelMealOrderItem(cancelRow.row.orderItemId)
              .then(async () => {
                setCancelRow(null)
                await loadRoster()
              })
              .catch((e) => setRosterErr(e instanceof ApiError ? e.message : '취소하지 못했습니다.'))
              .finally(() => setRosterCancelBusy(false))
          }}
          onClose={() => setCancelRow(null)}
        >
          <div className="note-box">
            <div>
              {masked ? '***' : (cancelRow.row.studentName ?? '-')} ({studentNoText(cancelRow.row.studentNo)}) ·{' '}
              {cancelRow.row.className ?? '미배정'}
            </div>
          </div>
          <div className="hint">되살릴 수 없습니다. 다시 신청해야 합니다.</div>
        </Modal>
      )}
    </div>
  )
}

const monthSignal = createScreenSignal()
let pickedMonth: string | null = null

function monthShift(delta: number): string {
  const d = new Date()
  const t = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

function MonthMenu() {
  return (
    <select
      className="sel"
      style={{ width: 130 }}
      value=""
      onChange={(e) => {
        if (e.target.value === '') return
        pickedMonth = monthShift(Number(e.target.value))
        monthSignal.bump()
      }}
    >
      <option value="">기간 선택 ▾</option>
      <option value="-1">지난 달</option>
      <option value="0">이번 달</option>
      <option value="1">다음 달</option>
    </select>
  )
}

export const mealMockup: Mockup = {
  Content,
  actions: (
    <>
      <MonthMenu />
      {/* ★ 「식수 마감」을 뺐다. **이미 되는 기능이다** — 「급식 일정 관리」 탭의 달력에서
             날짜를 눌러 중단일로 등록하면 서버가 신청까지 취소해 준다. 헤더에 같은 이름의
             눌리지 않는 버튼을 두면 **그 기능이 아직 안 되는 것처럼** 읽힌다.
             헤더는 본문과 상태를 공유하지 못해(CLAUDE.md 5-1) 탭을 열어 줄 수도 없다.
          ★ 「데스크 당일 신청」은 그대로 둔다 — 주문 생성 경로가 서버에 없다(조회만 있다). */}
      <button className="btn pri" disabled data-soon title="준비 중입니다">
        <Icon name="plus" size={14} /> 데스크 당일 신청
      </button>
    </>
  ),
}
