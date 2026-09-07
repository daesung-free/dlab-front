import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, useServerData, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import {
  PAYMENT_METHOD_LABEL,
  SEAT_TYPE_LABEL,
  listBillingStandards,
  listRefundRules,
  listTuitionPrices,
  setBillingStandardActive,
  updateBillingStandard,
  type BillingStandard,
  type RefundRule,
  type TuitionPrice,
} from '../../api/billingStandards'
import { GRADE_LABEL, type GradeType } from '../../api/students'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.10-5 수납 관리(청구기준 관리) — GET /api/v1/admin/billing-standards
 *
 * ⚠ 금액이 정해지는 순서 — 세 화면이 한 줄로 이어진다.
 *   ① 여기(청구기준)      정가와 청구 시점을 정한다
 *   ② 수납현황 > 할인 정책  정가에서 할인을 적용해 실제 청구액을 만든다
 *   ③ 결제(F-C-5)         그 청구액으로 PG 결제 트랜잭션이 생긴다
 *   ②에 대응하는 API 가 아직 없다(할인 엔드포인트 자체가 없다) — 상단 안내가 그 얘기다.
 *
 * ★ 교습비 행만 예외다. amountSource=PRICE_MATRIX 면 금액이 학년 × 좌석유형으로 갈려
 *   한 칸에 못 넣는다. 그 행은 amountMin~amountMax 만 오고, 실제 값은 아래 단가표
 *   (/tuition/prices)에서 본다 — 이 화면의 하위 화면이다.
 *
 * ★ 환불 기준은 **읽기 전용이다.** 학원법 시행령 반환기준이라 학원이 정하는 것이 아니고,
 *   편집을 열면 임의 비율로 환불이 나간다. 등록·수정 API 가 없는 것이 의도다.
 */

const PAGE_SIZE = 10

/** 환불 기준의 항목 배지. 청구기준은 서버가 itemLabel 을 주는데 이쪽은 코드만 온다 */
const REFUND_ITEM_LABEL: Record<string, string> = {
  TUITION: '교습비',
  STUDY_ROOM: '독서실',
  MEAL: '급식비',
  LECTURE: '특강비',
  REGISTRATION: '등록비',
  ETC: '기타',
}

function won(n: number): string {
  return `${n.toLocaleString()}원`
}

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('billing')
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const year = new Date().getFullYear()

  // ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다
  const params = useMemo(() => ({ year, academyId: academyId ?? undefined }), [year, academyId])
  const noParams = useMemo(() => ({}), [])

  const list = useServerData({
    fetcher: listBillingStandards,
    params,
    errorMessage: '청구 기준을 불러오지 못했습니다.',
  })

  const refunds = useServerData({
    fetcher: listRefundRules,
    params: noParams,
    errorMessage: '환불 기준을 불러오지 못했습니다.',
  })

  const prices = useServerData({
    fetcher: listTuitionPrices,
    params,
    errorMessage: '교습비 단가표를 불러오지 못했습니다.',
  })

  const rows = list.data ?? []
  const refundRows = refunds.data ?? []
  const priceRows = prices.data ?? []
  // 단가표는 교습비 행이 있을 때만 의미가 있다 — 그 행의 하위 화면이기 때문
  const hasMatrix = rows.some((r) => r.amountSource === 'PRICE_MATRIX')

  async function act(row: BillingStandard, label: string, fn: () => Promise<unknown>) {
    setBusy(row.id)
    setMsg(null)
    try {
      await fn()
      setMsg(`'${row.name}' ${label} 완료`)
      list.reload()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : `${label}에 실패했습니다.`)
    } finally {
      setBusy(null)
    }
  }

  function rename(row: BillingStandard) {
    const name = window.prompt('청구 기준명을 수정합니다.', row.name)?.trim()
    if (!name || name === row.name) return
    // ★ name·amountSource 가 PUT 의 필수값이다. 지금 값을 함께 실어야 이름만 바꿀 수 있다
    void act(row, '수정', () =>
      updateBillingStandard(row.id, {
        name,
        amountSource: row.amountSource,
        roundName: row.roundName ?? undefined,
        amount: row.amount ?? undefined,
        dueDesc: row.dueDesc ?? undefined,
        paymentMethod: row.paymentMethod ?? undefined,
        sortOrder: row.sortOrder ?? undefined,
        memo: row.memo ?? undefined,
      }),
    )
  }

  const columns: Column<BillingStandard>[] = useMemo(
    () => [
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
        width: '150px',
        align: 'right',
        sortable: true,
        // 정렬은 대표값으로 — 단가표 행은 하한을 쓴다
        value: (r) => r.amount ?? r.amountMin ?? 0,
        render: (r) =>
          r.amountSource === 'FIXED' ? (
            r.amount === null ? (
              <span style={{ color: 'var(--muted)' }}>-</span>
            ) : (
              won(r.amount)
            )
          ) : (
            // 학년 × 좌석유형으로 갈려 한 칸에 못 넣는다. 아래 단가표가 실제 값이다
            <span title="학년 · 좌석유형에 따라 갈립니다. 아래 단가표에서 확인하세요">
              {r.amountMin !== null && r.amountMax !== null ? `${won(r.amountMin)} ~ ${won(r.amountMax)}` : '—'}
              <span className="mk" style={{ marginLeft: 6, fontSize: 10 }}>단가표</span>
            </span>
          ),
      },
      {
        key: 'paymentMethod',
        header: '결제 경로',
        width: '116px',
        align: 'center',
        sortable: true,
        value: (r) => (r.paymentMethod ? PAYMENT_METHOD_LABEL[r.paymentMethod] : '-'),
        render: (r, shown) =>
          r.paymentMethod === null ? (
            <span style={{ color: 'var(--muted)' }}>-</span>
          ) : (
            <span className="mk verified" title={r.paymentMethod}>
              {shown}
            </span>
          ),
      },
      { key: 'dueDesc', header: '청구일', width: '104px', align: 'center', value: (r) => r.dueDesc ?? '-' },
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
            disabled={busy === r.id}
            title="눌러서 전환"
            onClick={() => void act(r, r.active ? '중지' : '사용', () => setBillingStandardActive(r.id, !r.active))}
          >
            {shown}
          </button>
        ),
      },
      {
        key: 'act',
        header: '',
        width: '150px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {/* 수납·메시지는 이 화면 소관이 아니다 — 청구기준은 마스터고,
                실제 수납은 수납현황(F-4.8), 발송은 문자 발송(F-4.4)에서 한다 */}
            <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled title="수납 처리는 수납현황(F-4.8) 화면에서 합니다">
              수납
            </button>
            <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled title="발송은 문자 발송(F-4.4) 화면에서 합니다">
              메시지
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy === r.id}
              onClick={() => rename(r)}
            >
              수정
            </button>
          </div>
        ),
      },
    ],
    [busy],
  )

  /** 환불 기준 — 목업 3컬럼을 유지하고 항목은 경과 시점 앞에 배지로 붙인다 */
  const refundColumns: Column<RefundRule>[] = useMemo(
    () => [
      {
        key: 'period',
        header: '경과 시점',
        width: '280px',
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
        width: '120px',
        align: 'center',
        value: (r) => r.rate,
        render: (r) => (
          <b style={{ color: r.rate.includes('없음') ? 'var(--red)' : 'var(--mint-d)' }}>{r.rate}</b>
        ),
      },
      { key: 'note', header: '비고', value: (r) => r.note ?? '-' },
    ],
    [],
  )

  const priceColumns: Column<TuitionPrice>[] = useMemo(
    () => [
      // 서버가 enum 코드로 준다 — 화면에 HIGH2·GENERAL 이 그대로 보이면 안 된다
      {
        key: 'gradeType',
        header: '학년',
        width: '90px',
        align: 'center',
        sortable: true,
        value: (r) => GRADE_LABEL[r.gradeType as GradeType] ?? r.gradeType,
      },
      {
        key: 'seatType',
        header: '좌석유형',
        width: '100px',
        align: 'center',
        sortable: true,
        value: (r) => SEAT_TYPE_LABEL[r.seatType] ?? r.seatType,
      },
      { key: 'tuitionFee', header: '교습비', width: '120px', align: 'right', value: (r) => r.tuitionFee, render: (r) => won(r.tuitionFee) },
      { key: 'studyRoomFee', header: '독서실비', width: '120px', align: 'right', value: (r) => r.studyRoomFee, render: (r) => won(r.studyRoomFee) },
      {
        key: 'monthlyTotal',
        header: '월 합계',
        width: '130px',
        align: 'right',
        sortable: true,
        // 서버가 합계를 준다 — 화면에서 더하지 않는다
        value: (r) => r.monthlyTotal,
        render: (r) => <b>{won(r.monthlyTotal)}</b>,
      },
    ],
    [],
  )

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

      {list.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {list.error}
        </div>
      )}

      {msg && <div className="note-box">{msg}</div>}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'billing', label: '청구 기준', count: rows.length },
            { key: 'refund', label: '환불 기준', count: refundRows.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div style={{ padding: 14 }}>
          {tab === 'billing' ? (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => String(r.id)}
              masked={false}
              loading={list.loading}
              pageSize={PAGE_SIZE}
              countLabel={
                <>
                  {year}년 청구 기준 <b>{rows.length}</b>건
                </>
              }
              toolbar={
                <>
                  <ExcelButton filename="청구기준" columns={columns} rows={rows} masked={false} />
                  {/* 등록은 코드·항목·금액방식이 필수라 이름만으로는 못 만든다 — 전용 폼이 필요하다 */}
                  <button className="btn pri" disabled title="코드·항목·금액 방식이 필수라 전용 등록 폼이 필요합니다">
                    <Icon name="plus" size={14} /> 청구 기준 등록
                  </button>
                </>
              }
            />
          ) : (
            <DataTable
              columns={refundColumns}
              rows={refundRows}
              rowKey={(r) => `${r.itemType}:${r.period}`}
              masked={false}
              loading={refunds.loading}
              pageSize={PAGE_SIZE}
              countLabel={
                <>
                  환불 기준 <b>{refundRows.length}</b>건 · 학원법 시행령 반환기준
                </>
              }
              toolbar={
                // 학원이 정하는 값이 아니다. 편집을 열면 임의 비율로 환불이 나간다
                <button className="btn pri" disabled title="학원법 시행령 반환기준이라 학원이 바꿀 수 없습니다">
                  <Icon name="plus" size={14} /> 기준 추가
                </button>
              }
            />
          )}
        </div>
      </div>

      {tab === 'billing' && hasMatrix && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="badge-dollar-sign" size={15} />
              </span>
              교습비 단가표 — 위 목록의 &lsquo;단가표&rsquo; 행이 여기서 갈립니다
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <DataTable
              columns={priceColumns}
              rows={priceRows}
              rowKey={(r) => String(r.id)}
              masked={false}
              loading={prices.loading}
              pageSize={PAGE_SIZE}
              countLabel={
                <>
                  {year}년 단가 <b>{priceRows.length}</b>건 · 학년 × 좌석유형
                </>
              }
            />
          </div>
        </div>
      )}
    </>
  )
}

export const adminBillingMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled>
        {new Date().getFullYear()} 시즌
      </button>
      {/* 청구기준은 전년도 복사(/masters/yearly-copy) 대상이 아니다 */}
      <button className="btn" disabled title="청구 기준은 전년도 복사 대상이 아닙니다">
        <Icon name="history" size={14} /> 전년도 기준 복사
      </button>
    </>
  ),
}
