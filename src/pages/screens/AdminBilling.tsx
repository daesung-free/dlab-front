import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, Unfilled, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { GRADE_LABEL } from '../../api/students'
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
 * **'청구 기준' 탭이 실연동.** 다만 서버의 축은 목업과 다르다 —
 * 목업은 항목별(교습비·특강비·등록비·급식비)인데 **서버는 (학년 × 좌석유형) 정가**뿐이다.
 * 특강비·등록비·급식비와 결제채널·납기일은 둘 곳이 없다(API_GAPS 18-1).
 * '환불 기준' 탭은 API가 없어 목업이다.
 *
 * ★ **월별 교습일수가 비어 있으면 그 해 청구가 계산되지 않는다.** 목업에 없던 축인데,
 *   비어 있는 걸 모르고 넘어가면 청구 시점에야 알게 된다 — 상단에 드러낸다. */

const MONTHS_IN_YEAR = Array.from({ length: 12 }, (_, i) => i + 1)

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
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('billing')
  const [year, setYear] = useState(new Date().getFullYear())
  const [prices, setPrices] = useState<TuitionPrice[]>([])
  const [months, setMonths] = useState<TuitionMonth[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, m] = await Promise.all([
        listTuitionPrices(year, academyId ?? undefined),
        listTuitionMonths(year, academyId ?? undefined),
      ])
      setPrices(p)
      setMonths(m)
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

  const daysByMonth = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of months) m.set(r.month, r.teachingDays)
    return m
  }, [months])

  const missingMonths = MONTHS_IN_YEAR.filter((mo) => !daysByMonth.has(mo))

  /**
   * 교습일수는 **달력 일수가 아니다.** 학원이 아는 값을 그대로 받는다 —
   * 화면이 규칙을 추측해 채우면 조용히 틀린 금액이 나온다. 그래서 한 달씩 물어본다.
   */
  async function editMonth(mo: number) {
    if (academyId === null) {
      setNotice('먼저 지점을 고르세요.')
      return
    }
    const key = `${year}-${String(mo).padStart(2, '0')}`
    const cur = daysByMonth.get(mo)
    const next = window.prompt(`${year}년 ${mo}월 교습일수\n달력 일수가 아니라 실제 교습일수를 넣으세요.`, cur ? String(cur) : '')
    if (next === null || next.trim() === '') return
    const days = Number(next)
    if (!Number.isInteger(days) || days < 0) {
      setNotice('교습일수는 0 이상의 정수여야 합니다.')
      return
    }
    setBusy(true)
    try {
      await saveTuitionMonth({ academyId, month: key, teachingDays: days })
      setNotice(`${mo}월 교습일수를 ${days}일로 저장했습니다.`)
      await load()
    } catch (err) {
      setNotice(err instanceof ApiError ? `저장 실패 — ${err.message}` : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

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
            { key: 'billing', label: '청구 기준', count: prices.length },
            { key: 'refund', label: '환불 기준', count: REFUNDS.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div style={{ padding: 14 }}>
          {tab === 'billing' ? (
            <>
              <DataTable
                columns={PRICE_COLUMNS}
                rows={prices}
                rowKey={(r) => String(r.id)}
                masked={false}
                loading={loading}
                pageSize={10}
                countLabel={
                  <>
                    {year}년 정가 <b>{prices.length}</b>건 · 학년 × 좌석유형 기준
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
                    <button className="btn pri" disabled title="정가 등록은 학년·좌석유형 단위 폼이 필요합니다">
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
                          onClick={() => void editMonth(mo)}
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
              {/* 환불 기준은 서버에 없다. 학원법 시행령 기준이라 값 자체는 맞다 */}
              <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
                <div className="ic">
                  <Icon name="triangle-alert" size={17} />
                </div>
                <div>
                  <div className="tt">아래 기준은 저장되지 않습니다 — 학원법 시행령 내용을 적어 둔 것입니다</div>
                  <div className="tx">
                    환불 기준을 시스템에 등록하는 기능은 아직 준비되지 않았습니다. 환불은 지금 데스크에서
                    개별 처리합니다.
                  </div>
                </div>
              </div>
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
                  <button className="btn pri" disabled title="환불 기준 API가 없습니다">
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
