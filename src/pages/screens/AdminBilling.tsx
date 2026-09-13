import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, Unfilled, type Column, Modal } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { GRADE_LABEL } from '../../api/students'
import {
  PAYMENT_METHOD_LABEL,
  createBillingStandard,
  deleteBillingStandard,
  listBillingStandards,
  listRefundRules,
  setBillingStandardActive,
  type AmountSource,
  type BillingItemType,
  type PaymentMethod,
  type BillingStandard,
  type RefundRule,
} from '../../api/billingStandards'
import {
  SEAT_TYPE_LABEL,
  listTuitionMonths,
  listTuitionPrices,
  saveTuitionMonth,
  type TuitionMonth,
  type TuitionPrice,
} from '../../api/tuition'
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
 *   지금 문제는 ②가 빠져서 ①의 정가가 그대로 ③으로 넘어가는 것이다.
 *
 * ── 연동 범위 ──────────────────────────────────────────────
 * 두 탭 모두 실연동이다. /billing-standards 가 신설되면서 목업의 축(코드·항목·기수·
 * 결제경로·청구일)이 그대로 들어왔고, 환불 기준도 /billing-standards/refund-rules 로 온다.
 *
 * ★ 교습비 행만 예외다. amountSource=PRICE_MATRIX 면 금액이 학년 × 좌석유형으로 갈려
 *   한 칸에 못 넣는다 — amountMin~amountMax 만 오고, 실제 값은 아래 단가표에서 본다.
 *
 * ★ 환불 기준은 **읽기 전용이 의도다.** 값이 학원법 시행령 반환기준이라 학원이 정하는
 *   것이 아니고, 편집을 열면 임의 비율로 환불이 나간다.
 *
 * ★ **월별 교습일수가 비어 있으면 그 해 청구가 계산되지 않는다.** 목업에 없던 축인데,
 *   비어 있는 걸 모르고 넘어가면 청구 시점에야 알게 된다 — 상단에 드러낸다. */

const MONTHS_IN_YEAR = Array.from({ length: 12 }, (_, i) => i + 1)

/** 청구 기준 — 목업의 코드·항목·기수·금액·결제경로·청구일이 그대로 대응한다 */
function standardColumns(
  onToggle: (r: BillingStandard) => void,
  onDelete: (r: BillingStandard) => void,
  busy: boolean,
): Column<BillingStandard>[] {
  return [
    {
      key: 'code',
      header: '코드',
      width: '104px',
      sortable: true,
      value: (r) => r.code,
      render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
    },
    {
      key: 'itemLabel',
      header: '항목',
      width: '82px',
      align: 'center',
      sortable: true,
      value: (r) => r.itemLabel,
      render: (_r, v) => <span className="mk supplement">{v}</span>,
    },
    { key: 'name', header: '청구 기준명', sortable: true, value: (r) => r.name },
    { key: 'roundName', header: '기수', width: '62px', align: 'center', value: (r) => r.roundName ?? '-' },
    {
      key: 'amount',
      header: '금액',
      width: '160px',
      align: 'right',
      sortable: true,
      // 정렬은 대표값으로 — 단가표 행은 하한을 쓴다
      value: (r) => r.amount ?? r.amountMin ?? 0,
      render: (r) =>
        r.amountSource === 'FIXED' ? (
          r.amount === null ? <span style={{ color: 'var(--muted)' }}>-</span> : `${r.amount.toLocaleString()}원`
        ) : (
          // 학년 × 좌석유형으로 갈려 한 칸에 못 넣는다 — 아래 단가표가 실제 값이다
          <span title="학년 · 좌석유형에 따라 갈립니다. 아래 단가표에서 확인하세요">
            {r.amountMin !== null && r.amountMax !== null
              ? `${r.amountMin.toLocaleString()} ~ ${r.amountMax.toLocaleString()}원`
              : '—'}
            <span className="mk" style={{ marginLeft: 6, fontSize: 10 }}>단가표</span>
          </span>
        ),
    },
    {
      key: 'paymentMethod',
      header: '결제 경로',
      width: '104px',
      align: 'center',
      sortable: true,
      value: (r) => (r.paymentMethod ? PAYMENT_METHOD_LABEL[r.paymentMethod] : '-'),
      render: (r, shown) =>
        r.paymentMethod === null ? (
          <span style={{ color: 'var(--muted)' }}>-</span>
        ) : (
          <span className="mk verified" title={r.paymentMethod}>{shown}</span>
        ),
    },
    { key: 'dueDesc', header: '청구일', width: '100px', align: 'center', value: (r) => r.dueDesc ?? '-' },
    {
      key: 'active',
      header: '사용',
      width: '72px',
      align: 'center',
      sortable: true,
      value: (r) => (r.active ? '사용' : '중지'),
      render: (r, shown) => (
        <button
          className={`mk ${r.active ? 'verified' : 'brandnew'}`}
          style={{ border: 'none', cursor: 'pointer', font: 'inherit' }}
          disabled={busy}
          title="눌러서 전환"
          onClick={() => onToggle(r)}
        >
          {shown}
        </button>
      ),
    },
    {
      /* ★ '사용 중지'와 삭제는 다른 일이다. 중지는 과거 청구를 그대로 두고 앞으로만 안 쓰는
           것이고, 삭제는 기준 자체를 없앤다. 잘못 만든 것을 치우려면 삭제가 필요하다 —
           없으면 중지된 껍데기가 목록에 계속 쌓인다. */
      key: 'del',
      header: '',
      width: '60px',
      align: 'center',
      value: () => '',
      render: (r) => (
        <button
          className="btn"
          style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
          disabled={busy}
          onClick={() => onDelete(r)}
        >
          삭제
        </button>
      ),
    },
  ]
}

const PRICE_COLUMNS: Column<TuitionPrice>[] = [
  {
    key: 'grade',
    header: '학년',
    width: '90px',
    sortable: true,
    value: (r) => GRADE_LABEL[r.gradeType] ?? r.gradeType,
  },
  {
    key: 'seat',
    header: '좌석 유형',
    width: '100px',
    align: 'center',
    sortable: true,
    value: (r) => SEAT_TYPE_LABEL[r.seatType] ?? r.seatType,
  },
  {
    key: 'tuitionFee',
    header: '교습비',
    width: '130px',
    align: 'right',
    sortable: true,
    value: (r) => r.tuitionFee,
    render: (r) => `${r.tuitionFee.toLocaleString()}원`,
  },
  {
    key: 'studyRoomFee',
    header: '독서실비',
    width: '130px',
    align: 'right',
    sortable: true,
    value: (r) => r.studyRoomFee,
    render: (r) => `${r.studyRoomFee.toLocaleString()}원`,
  },
  {
    key: 'monthlyTotal',
    header: '월 합계',
    width: '140px',
    align: 'right',
    sortable: true,
    // 서버가 더해 준다 — 화면이 다시 더하지 않는다
    value: (r) => r.monthlyTotal,
    render: (r) => (
      <b>{r.monthlyTotal.toLocaleString()}원</b>
    ),
  },
  {
    key: 'pg',
    header: '결제 채널',
    width: '110px',
    align: 'center',
    value: () => '',
    render: () => <Unfilled reason="결제 채널이 청구 기준에 없다" />,
  },
  {
    key: 'dueDay',
    header: '납기',
    width: '110px',
    align: 'center',
    value: () => '',
    render: () => <Unfilled reason="납기일이 청구 기준에 없다" />,
  },
]

/** 환불 기준의 항목 배지. 청구기준은 itemLabel 을 주는데 이쪽은 코드만 온다 */
const REFUND_ITEM_LABEL: Record<string, string> = {
  TUITION: '교습비',
  STUDY_ROOM: '독서실',
  MEAL: '급식비',
  LECTURE: '특강비',
  REGISTRATION: '등록비',
  ETC: '기타',
}

const REFUND_COLUMNS: Column<RefundRule>[] = [
  {
    key: 'period',
    header: '경과 시점',
    width: '260px',
    value: (r) => `${REFUND_ITEM_LABEL[r.itemType] ?? r.itemType} ${r.period}`,
    render: (r) => (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <span className="mk supplement">{REFUND_ITEM_LABEL[r.itemType] ?? r.itemType}</span>
        {r.period}
      </span>
    ),
  },
  {
    key: 'rate',
    header: '환불 비율',
    width: '110px',
    align: 'center',
    value: (r) => r.rate,
    render: (r) => (
      <b style={{ color: r.rate.includes('없음') ? 'var(--red)' : 'var(--mint-d)' }}>
        {r.rate}
      </b>
    ),
  },
  { key: 'note', header: '비고', value: (r) => r.note ?? '-' },
]

/** 청구 기준 등록 폼의 입력값. 금액은 문자열로 들고 있다 — 빈 칸과 0 을 구분해야 한다 */
interface NewStandard {
  code: string
  itemType: BillingItemType
  name: string
  amountSource: AmountSource
  amount: string
  dueDesc: string
  paymentMethod: PaymentMethod | ''
  memo: string
}

const EMPTY_STANDARD: NewStandard = {
  code: '',
  itemType: 'TUITION',
  name: '',
  amountSource: 'FIXED',
  amount: '',
  dueDesc: '',
  paymentMethod: '',
  memo: '',
}

/* 화면에 쓰는 이름. 서버는 목록 응답에 itemLabel 을 주지만 등록 전에는 그 값이 없다 */
const ITEM_TYPE_LABEL: Record<BillingItemType, string> = {
  TUITION: '교습비',
  STUDY_ROOM: '독서실',
  MEAL: '급식비',
  LECTURE: '특강비',
  REGISTRATION: '등록비',
  ETC: '기타',
}

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('billing')
  const [year, setYear] = useState(new Date().getFullYear())
  const [prices, setPrices] = useState<TuitionPrice[]>([])
  const [months, setMonths] = useState<TuitionMonth[]>([])
  const [standards, setStandards] = useState<BillingStandard[]>([])
  const [refunds, setRefunds] = useState<RefundRule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** 교습일수 입력 모달 */
  const [monthEdit, setMonthEdit] = useState<{ mo: number; days: string } | null>(null)
  const [monthErr, setMonthErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /* 청구 기준 등록. **코드·항목·금액 방식이 필수**라 이름만 받는 창으로는 못 만든다 */
  const [newStd, setNewStd] = useState<NewStandard | null>(null)
  const [newStdErr, setNewStdErr] = useState<string | null>(null)
  const [delStd, setDelStd] = useState<BillingStandard | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, m, st, rf] = await Promise.all([
        listTuitionPrices(year, academyId ?? undefined),
        listTuitionMonths(year, academyId ?? undefined),
        listBillingStandards({ year, academyId: academyId ?? undefined }),
        listRefundRules(),
      ])
      setPrices(p)
      setMonths(m)
      setStandards(st)
      setRefunds(rf)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '청구 기준을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [year, academyId])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 청구 기준 등록.
   *
   * ★ `amountSource` 가 화면을 가른다.
   *     FIXED         한 값으로 끝난다 — 금액을 여기서 받는다
   *     PRICE_MATRIX  학년 × 좌석유형 단가표에서 갈린다 — 금액을 받지 않는다.
   *                   아래 '교습비 단가표'가 그 표이고, 금액은 거기서 채운다
   *   두 방식을 한 칸으로 합치면 단가표 기준인데 금액이 박혀 버린다.
   * ★ `code` 는 나중에 바꿀 수 없다(PUT 에 code 가 없다). 등록할 때만 정한다.
   */
  async function submitStandard() {
    if (!newStd) return
    setBusy(true)
    setNewStdErr(null)
    try {
      await createBillingStandard({
        academyId: academyId ?? undefined,
        year,
        code: newStd.code.trim().toUpperCase(),
        itemType: newStd.itemType,
        name: newStd.name.trim(),
        amountSource: newStd.amountSource,
        amount: newStd.amountSource === 'FIXED' ? Number(newStd.amount) || 0 : undefined,
        dueDesc: newStd.dueDesc.trim() || undefined,
        paymentMethod: newStd.paymentMethod || undefined,
        memo: newStd.memo.trim() || undefined,
      })
      await load()
      setNewStd(null)
      setNotice('청구 기준을 등록했습니다.')
    } catch (err) {
      /* ★ 모달을 닫지 않는다. 코드 중복이 흔한데, 닫아버리면 입력한 것을 다시 쳐야 한다 */
      setNewStdErr(err instanceof ApiError ? err.message : '청구 기준을 등록하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 청구 기준 삭제. 이미 청구가 나간 기준은 서버가 막는다 — 그 메시지를 모달 안에 띄운다 */
  async function removeStandard() {
    if (!delStd) return
    setBusy(true)
    setNewStdErr(null)
    try {
      await deleteBillingStandard(delStd.id)
      await load()
      setDelStd(null)
      setNotice('청구 기준을 삭제했습니다.')
    } catch (err) {
      setNewStdErr(err instanceof ApiError ? err.message : '청구 기준을 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const daysByMonth = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of months) m.set(r.month, r.teachingDays)
    return m
  }, [months])

  const missingMonths = MONTHS_IN_YEAR.filter((mo) => !daysByMonth.has(mo))

  async function toggleStandard(row: BillingStandard) {
    setBusy(true)
    setNotice(null)
    try {
      await setBillingStandardActive(row.id, !row.active)
      setNotice(`'${row.name}' ${row.active ? '중지' : '사용'}으로 바꿨습니다.`)
      await load()
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : '변경하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 교습일수는 **달력 일수가 아니다.** 학원이 아는 값을 그대로 받는다 —
   * 화면이 규칙을 추측해 채우면 조용히 틀린 금액이 나온다. 그래서 한 달씩 물어본다.
   */
  /**
   * ★ **성공한 뒤에** 모달을 닫는다. 먼저 닫으면 서버가 거부했을 때 오류가 뒤 화면에 떠서,
   *   사용자는 무엇을 고쳐야 하는지 모른 채 입력값도 잃는다.
   */
  async function editMonth(mo: number, days: number) {
    if (academyId === null) {
      setNotice('먼저 지점을 고르세요.')
      return
    }
    const key = `${year}-${String(mo).padStart(2, '0')}`
    setBusy(true)
    setMonthErr(null)
    try {
      await saveTuitionMonth({ academyId, month: key, teachingDays: days })
      setNotice(`${mo}월 교습일수를 ${days}일로 저장했습니다.`)
      setMonthEdit(null)
      await load()
    } catch (err) {
      setMonthErr(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {delStd && (
        <Modal
          title="청구 기준 삭제"
          sub={`${delStd.name} (${delStd.code}) 을(를) 지웁니다.`}
          confirmLabel="삭제"
          danger
          busy={busy}
          error={newStdErr}
          onConfirm={() => void removeStandard()}
          onClose={() => {
            setNewStdErr(null)
            setDelStd(null)
          }}
        >
          {/* ★ 중지와 삭제는 다르다. 쓰던 기준을 치우는 것이면 '사용' 을 중지로 두는 쪽이 맞다 */}
          <div className="note-box warn">
            <div className="ic">
              <Icon name="alert-triangle" size={17} />
            </div>
            <div>
              <div className="tt">쓰던 기준이면 '사용'을 중지로 두세요</div>
              <div className="tx">
                삭제는 기준을 <b>아예 없앱니다.</b> 이미 청구가 나간 기준은 지울 수 없습니다.
              </div>
            </div>
          </div>
        </Modal>
      )}

      {newStd && (
        <Modal
          title="청구 기준 등록"
          sub={`${year}년 청구 항목을 하나 만듭니다. 코드는 나중에 바꿀 수 없습니다.`}
          confirmLabel="등록"
          busy={busy}
          error={newStdErr}
          confirmDisabled={
            newStd.code.trim() === '' ||
            newStd.name.trim() === '' ||
            (newStd.amountSource === 'FIXED' && Number(newStd.amount) <= 0)
          }
          onConfirm={() => void submitStandard()}
          onClose={() => setNewStd(null)}
        >
          <div className="frow">
            <label className="req">코드</label>
            <div>
              <input
                className="inp"
                value={newStd.code}
                placeholder="예: TUITION-2026"
                onChange={(e) => setNewStd({ ...newStd, code: e.target.value })}
              />
              <div className="hint">등록 후에는 바꿀 수 없습니다. 영문·숫자·하이픈을 씁니다.</div>
            </div>
          </div>

          <div className="frow">
            <label className="req">항목</label>
            <select
              className="sel"
              value={newStd.itemType}
              onChange={(e) => setNewStd({ ...newStd, itemType: e.target.value as BillingItemType })}
            >
              {(Object.keys(ITEM_TYPE_LABEL) as BillingItemType[]).map((k) => (
                <option key={k} value={k}>
                  {ITEM_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="frow">
            <label className="req">이름</label>
            <input
              className="inp"
              value={newStd.name}
              placeholder="예: 2026년 교습비"
              onChange={(e) => setNewStd({ ...newStd, name: e.target.value })}
            />
          </div>

          <div className="frow">
            <label className="req">금액 방식</label>
            <div>
              <select
                className="sel"
                value={newStd.amountSource}
                onChange={(e) => setNewStd({ ...newStd, amountSource: e.target.value as AmountSource })}
              >
                <option value="FIXED">정액 — 한 값으로 청구합니다</option>
                <option value="PRICE_MATRIX">단가표 — 학년·좌석유형에 따라 갈립니다</option>
              </select>
              {newStd.amountSource === 'PRICE_MATRIX' && (
                <div className="hint">금액은 아래 &lsquo;교습비 단가표&rsquo;에서 학년·좌석유형별로 채웁니다.</div>
              )}
            </div>
          </div>

          {/* ★ 단가표 방식일 때는 금액 칸을 아예 없앤다. 남겨두면 단가표 기준인데
                 금액이 박힌 기준이 생겨서, 어느 값으로 청구되는지 알 수 없어진다 */}
          {newStd.amountSource === 'FIXED' && (
            <div className="frow">
              <label className="req">금액</label>
              <input
                className="inp"
                type="number"
                min={0}
                value={newStd.amount}
                placeholder="예: 660000"
                onChange={(e) => setNewStd({ ...newStd, amount: e.target.value })}
              />
            </div>
          )}

          <div className="frow">
            <label>납부 기한</label>
            <input
              className="inp"
              value={newStd.dueDesc}
              placeholder="예: 매월 25일까지"
              onChange={(e) => setNewStd({ ...newStd, dueDesc: e.target.value })}
            />
          </div>

          <div className="frow">
            <label>결제 수단</label>
            <select
              className="sel"
              value={newStd.paymentMethod}
              onChange={(e) => setNewStd({ ...newStd, paymentMethod: e.target.value as PaymentMethod | '' })}
            >
              <option value="">선택 안 함</option>
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_METHOD_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="frow">
            <label>메모</label>
            <input
              className="inp"
              value={newStd.memo}
              onChange={(e) => setNewStd({ ...newStd, memo: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {monthEdit && (
        <Modal
          title={`${year}년 ${monthEdit.mo}월 교습일수`}
          sub="달력 일수가 아니라 실제 수업한 날수입니다. 학원이 아는 값을 그대로 넣으세요."
          confirmLabel="저장"
          busy={busy}
          error={monthErr}
          confirmDisabled={
            monthEdit.days.trim() === '' ||
            !Number.isInteger(Number(monthEdit.days)) ||
            Number(monthEdit.days) < 0
          }
          onConfirm={() => void editMonth(monthEdit.mo, Number(monthEdit.days))}
          onClose={() => setMonthEdit(null)}
        >
          <div className="frow">
            <label className="req">교습일수</label>
            <input
              className="inp"
              type="number"
              min={0}
              max={31}
              value={monthEdit.days}
              placeholder="예: 29"
              onChange={(e) => setMonthEdit({ ...monthEdit, days: e.target.value })}
            />
          </div>
        </Modal>
      )}

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

      {/* 교습일수가 비면 그 달 청구가 계산되지 않는다. 청구 시점에야 알게 되면 늦다 */}
      {!loading && missingMonths.length > 0 && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)' }}>
          <div className="ic">
            <Icon name="triangle-alert" size={17} />
          </div>
          <div>
            <div className="tt">
              {missingMonths.join('·')}월 교습일수가 비어 있어 그 달 청구가 계산되지 않습니다
            </div>
            <div className="tx">
              아래 <b>월별 교습일수</b>에서 채우세요. <b>달력 일수가 아닙니다</b> — 2026년 기준 2월은 27일,
              9월은 29일입니다. 학원이 아는 값을 그대로 넣으면 됩니다.
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {loadError}
        </div>
      )}
      {notice && (
        <div className="note-box" role="status" style={{ borderColor: 'var(--violet)' }}>
          {notice}
        </div>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'billing', label: '청구 기준', count: standards.length },
            { key: 'refund', label: '환불 기준', count: refunds.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div style={{ padding: 14 }}>
          {tab === 'billing' ? (
            <>
              <DataTable
                columns={standardColumns(toggleStandard, setDelStd, busy)}
                rows={standards}
                rowKey={(r) => String(r.id)}
                masked={false}
                loading={loading}
                pageSize={10}
                countLabel={
                  <>
                    {year}년 청구 기준 <b>{standards.length}</b>건
                  </>
                }
                toolbar={
                  <button className="btn pri" onClick={() => setNewStd({ ...EMPTY_STANDARD })}>
                    <Icon name="plus" size={14} /> 청구 기준 등록
                  </button>
                }
              />

              {/* 위 목록의 '단가표' 행이 여기서 갈린다 — 학년 × 좌석유형 */}
              <div style={{ marginTop: 14 }} />
              <DataTable
                columns={PRICE_COLUMNS}
                rows={prices}
                rowKey={(r) => String(r.id)}
                masked={false}
                loading={loading}
                pageSize={10}
                countLabel={
                  <>
                    교습비 단가표 <b>{prices.length}</b>건 · 학년 × 좌석유형 — 위 &lsquo;단가표&rsquo; 행의 실제 금액
                  </>
                }
                toolbar={
                  <>
                    <ExcelButton filename={`청구기준_${year}`} columns={PRICE_COLUMNS} rows={prices} masked={false} />
                    <select
                      className="sel"
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      style={{ width: 110 }}
                    >
                      {[year - 1, year, year + 1].map((y) => (
                        <option key={y} value={y}>
                          {y} 시즌
                        </option>
                      ))}
                    </select>
                    {/* ★ 같은 등록 폼이다. 단가표 금액은 여기서 안 받는다 —
                           '단가표' 방식을 고르면 금액 칸이 사라지고, 실제 금액은 아래 표에서 채운다 */}
                    <button className="btn pri" onClick={() => setNewStd({ ...EMPTY_STANDARD })}>
                      <Icon name="plus" size={14} /> 청구 기준 등록
                    </button>
                  </>
                }
              />

              {/* 목업에 없던 축이지만 이게 비면 청구가 안 돈다 — 안 보여줄 수 없다 */}
              <div className="card-sec" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="card-sec-h">
                  <div className="t">
                    <span className="ico">
                      <Icon name="calendar-days" size={15} />
                    </span>
                    월별 교습일수
                  </div>
                  <div className="r">
                    <span className="mk supplement" title="달력 일수가 아니라 실제 교습일수입니다">
                      달력 일수 아님
                    </span>
                  </div>
                </div>
                <div className="card-sec-b">
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {MONTHS_IN_YEAR.map((mo) => {
                      const days = daysByMonth.get(mo)
                      return (
                        <button
                          type="button"
                          key={mo}
                          className="btn"
                          disabled={busy}
                          onClick={() => setMonthEdit({ mo, days: String(daysByMonth.get(mo) ?? '') })}
                          style={{
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 2,
                            padding: '9px 11px',
                            borderColor: days === undefined ? 'var(--red)' : undefined,
                          }}
                        >
                          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{mo}월</span>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: days === undefined ? 'var(--red)' : 'var(--ink)',
                            }}
                          >
                            {days === undefined ? '미입력' : `${days}일`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* 학원이 정하는 값이 아니다 — 편집을 열면 임의 비율로 환불이 나간다 */}
              <div className="note-box plain">
                <div className="ic">
                  <Icon name="scale" size={17} />
                </div>
                <div>
                  <div className="tt">학원법 시행령 반환기준입니다 — 학원이 바꾸는 값이 아닙니다</div>
                  <div className="tx">
                    서버가 내려주는 값이고 <b>읽기 전용</b>입니다. 차감은 <b>정상가 기준</b>이라
                    할인을 받은 학생은 환불액이 음수가 될 수 있습니다.
                  </div>
                </div>
              </div>
              <DataTable
                columns={REFUND_COLUMNS}
                rows={refunds}
                rowKey={(r) => `${r.itemType}:${r.period}`}
                masked={false}
                loading={loading}
                pageSize={10}
                countLabel={
                  <>
                    환불 기준 <b>{refunds.length}</b>건 · 학원법 시행령
                  </>
                }
                toolbar={
                  <button className="btn pri" disabled title="학원법 시행령 반환기준이라 학원이 바꿀 수 없습니다">
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
      <button className="btn" disabled data-soon title="준비 중입니다">기수 선택 ▾</button>
      <button className="btn" disabled data-soon title="준비 중입니다">
        <Icon name="history" size={14} /> 전년도 기준 복사
      </button>
    </>
  ),
}
