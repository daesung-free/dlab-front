import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/common/Modal'
import { ApiError } from '../../api/client'
import {
  listReceiptStatus,
  BILLING_TYPE_LABEL,
  PAY_METHOD_LABEL,
  type ReceiptRow,
} from '../../api/billing'

/* 결제 내역 출력 — 학부모에게 건네는 서류 (F-4.8 부속)
 *
 * 디랩 요청(`md/급식비.md` 4항):
 *   「결제 내역에 대해 궁금해 하시는 부모님들이 계셔서 결제항목/금액/결제기간 등이
 *    ★ 결제일자순으로 모두 조회되어 한꺼번에 출력 가능 하도록 요청 드립니다」
 *
 * ★★ **지금 있는 엑셀이 이걸 대신하지 못한다.** 그쪽은 **데스크가 보는 전체 목록**이라
 *   학생 여럿이 섞이고 **대상월 기준**이다. 이건 **학부모 한 명에게 건네는 종이**라
 *   한 학생 분만, **결제일자순**으로 간다. 용도가 다르면 서류도 다르다.
 *
 * ★ **받는 사람이 학부모다.** 그래서 내부 코드(`TUITION`·`PAID`)와 전표번호를 쓰지 않고,
 *   미납·과납 같은 **독촉으로 읽힐 말**도 넣지 않는다. 낸 것만 보여준다.
 *
 * ★ **결제가 아직 없는 청구는 빼지 않고 「미납」으로 적는다.** 빼면 학부모가 **청구가
 *   없었던 것으로** 읽는다 — 그게 제일 흔한 분쟁이다.
 *
 * ★ `window.print()` 를 쓴다. PDF 라이브러리를 들이면 번들이 커지고 한글 폰트를 따로
 *   실어야 한다. 브라우저 인쇄 대화상자에서 **PDF 저장도 된다.**
 *
 * ⚠️ **`window.open` 으로 새 창을 띄우지 않는다** — 팝업 차단에 걸리면 **눌러도 아무 일이
 *   없다.** 같은 문서 안에 숨겨 두고 `@media print` 로 **그것만** 인쇄한다.
 */

/** `2026-09-10T01:11:30Z` → `2026-09-10`. ★ 서버가 UTC 로 주므로 현지 날짜로 바꿔 자른다 */
function dayOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 대상기간. 일할이면 괄호로 날짜를 붙인다 — 전부 붙이면 중도입학 건이 안 보인다 */
function periodOf(r: ReceiptRow): string {
  if (r.serviceMonth === null) return '-'
  if (r.wholeMonth === false && r.serviceFrom && r.serviceTo) {
    return `${r.serviceMonth} (${r.serviceFrom.slice(5)}~${r.serviceTo.slice(5)})`
  }
  return r.serviceMonth
}

/** 출력 한 줄. 결제가 여럿이면 청구 하나가 여러 줄이 된다 */
interface PrintRow {
  /** 정렬 키. 미납은 결제일이 없어 맨 뒤로 보낸다 */
  sortKey: string
  paidAt: string | null
  name: string
  type: string
  period: string
  method: string
  amount: number
}

export function PaymentHistoryPrint({
  academyId,
  enrollmentId,
  studentNo,
  studentName,
  onClose,
}: {
  academyId: number
  /**
   * 등록 건 id. ⚠️ **옵솨이다** — 서버가 생답에 담기 전(2026-10-30 추가)엔 없다.
   * 있으면 서버에 넘겨 **그 등록 건만** 받고, 없으면 학번으로 검색한다.
   */
  enrollmentId?: number
  studentNo: string | null
  studentName: string
  onClose: () => void
}) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [rows, setRows] = useState<ReceiptRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load(y: number) {
    setBusy(true)
    setErr(null)
    setRows(null)
    try {
      /* ★ **등록 건 id 가 있으면 그걸 보내 서버가 거르게 한다**(2026-10-30 에 열렸다).
         ★ 학생 목록을 따로 부르지 않는다 — 학번으로 되짚으면 재등록한 학생의
           **어느 기수인지를 화면이 짐작**하게 된다. */
      const all = await listReceiptStatus({
        year: y,
        academyId,
        enrollmentId,
        /* ★ `enrollmentId` 가 없는 동안의 검색어다. 내려가는 서버는 모를 파라미터를
             그냥 무시하므로, 둘을 함께 보내도 안전하다 */
        keyword: studentNo ?? studentName,
      })
      /* ⚠️ **화면 거르기를 걷어내지 않는다.** 서버가 배포되기 전엔 `enrollmentId` 가
           무시되어 **`keyword` 결과가 그대로 오고**, `keyword` 는 이름·청구항목도 훑어
           **남의 행이 섞여 온다** — 거르지 않으면 **남의 결제가 학부모 손에 들어간다.**
           둘이 다 살아 있어도 남기는 행은 같으니 삼이 없다.
         ★ 서버 배포가 확인되고 모든 행에 `enrollmentId` 가 오면 이 블록을 걷어낸다. */
      setRows(
        all.filter((r) =>
          enrollmentId !== undefined && r.enrollmentId !== undefined
            ? r.enrollmentId === enrollmentId
            : studentNo !== null
              ? r.studentNo === studentNo
              : r.studentName === studentName,
        ),
      )
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '결제 내역을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 청구 × 결제로 펼쳐 **결제일자순**으로 세운다 */
  const printRows = useMemo<PrintRow[]>(() => {
    const out: PrintRow[] = []
    for (const r of rows ?? []) {
      const base = {
        name: r.name,
        type: BILLING_TYPE_LABEL[r.billingType] ?? r.billingType,
        period: periodOf(r),
      }
      if (r.payments.length > 0) {
        for (const p of r.payments) {
          out.push({
            ...base,
            sortKey: p.paidAt,
            paidAt: dayOf(p.paidAt),
            method: PAY_METHOD_LABEL[p.method] ?? p.method,
            amount: p.amount,
          })
        }
      } else {
        /* ★ 결제가 없는 청구도 넣는다 — 빼면 학부모가 **청구가 없었던 것으로** 읽는다 */
        out.push({ ...base, sortKey: '￿', paidAt: null, method: '미납', amount: r.billedAmount })
      }
    }
    return out.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [rows])

  const paidTotal = printRows.filter((r) => r.paidAt !== null).reduce((s, r) => s + r.amount, 0)
  const unpaidTotal = printRows.filter((r) => r.paidAt === null).reduce((s, r) => s + r.amount, 0)

  return (
    <>
      {/* ★ 인쇄할 때만 이 영역만 남긴다. `window.open` 은 팝업 차단에 걸려
             **눌러도 아무 일이 없는** 버튼이 된다 */}
      <style>{`
        @media print {
          /* ★★ 'body > *' 로 숨기면 안 된다. 이 영역은 화면 트리 안쪽에 있어
                 body 직계가 아니다 — 그렇게 쓰면 인쇄물이 빈 종이로 나온다.
             ★ visibility 로 가리면 조상이 보이든 말든 이것만 나온다. */
          body * { visibility: hidden; }
          .phprint, .phprint * { visibility: visible; }
          .phprint {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page { margin: 16mm; }
        }
      `}</style>

      {/* ★ 공통 `Modal` 을 쓴다(CLAUDE.md 1-2). 직접 껍데기를 만들었더니 **본문에 그대로
             박혀** 모달로 안 보였다 — 배경도 Esc 도 스크롤 잠금도 없었다.
         ★ `onConfirm` 이 **인쇄**다. Modal 이 내용을 `<form>` 으로 감싸고 확인 버튼이
           submit 이라, 여기서는 저장이 아니라 인쇄가 그 자리에 온다. */}
      <Modal
        title="결제 내역 출력"
        sub={`${studentName} 학생`}
        wide
        confirmLabel="인쇄"
        confirmDisabled={printRows.length === 0}
        onConfirm={() => window.print()}
        onClose={onClose}
        error={err ?? undefined}
      >
        <div className="note-box">
              <div>
                <b>{studentName}</b> 학생의 결제 내역을 <b>결제일자순</b>으로 출력합니다.
                학부모에게 전달하는 서류입니다.
              </div>
            </div>

            <div className="frow">
              <label>조회 연도</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  className="inp"
                  style={{ width: 120 }}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
                <button type="button" className="btn" disabled={busy} onClick={() => void load(year)}>
                  <Icon name="search" size={13} /> 조회
                </button>
              </div>
            </div>

            {rows !== null && printRows.length === 0 && (
              <div className="note-box">
                <div>{year}년 결제 내역이 없습니다.</div>
              </div>
            )}

            {printRows.length > 0 && (
              <>
                <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 10 }}>
                  <table className="dt" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 100 }}>결제일</th>
                        <th>항목</th>
                        <th style={{ width: 130 }}>대상기간</th>
                        <th style={{ width: 80 }}>결제수단</th>
                        <th style={{ width: 100, textAlign: 'right' }}>금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.paidAt ?? <span style={{ color: 'var(--muted)' }}>-</span>}</td>
                          <td>{r.name}</td>
                          <td style={{ textAlign: 'center' }}>{r.period}</td>
                          <td style={{ textAlign: 'center' }}>{r.method}</td>
                          <td style={{ textAlign: 'right' }}>{r.amount.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="hint">
                  결제 {printRows.filter((r) => r.paidAt !== null).length}건 ·{' '}
                  <b>{paidTotal.toLocaleString()}원</b>
                  {unpaidTotal > 0 && (
                    <>
                      {' '}
                      · 미납 <b>{unpaidTotal.toLocaleString()}원</b>
                    </>
                  )}
                </div>
              </>
            )}
      </Modal>

      {/* 인쇄용 — 화면에서는 안 보인다 */}
      <div className="phprint" style={{ display: 'none' }}>
        <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>결제 내역</h2>
        <div style={{ fontSize: 12, marginBottom: 12 }}>
          {studentName}
          {studentNo !== null && ` (${studentNo})`} · {year}년 · 출력일{' '}
          {dayOf(new Date().toISOString())}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['결제일', '항목', '대상기간', '결제수단', '금액'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    border: '1px solid #999',
                    padding: '5px 7px',
                    textAlign: i === 4 ? 'right' : i === 0 || i === 1 ? 'left' : 'center',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printRows.map((r, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #999', padding: '5px 7px' }}>{r.paidAt ?? '-'}</td>
                <td style={{ border: '1px solid #999', padding: '5px 7px' }}>{r.name}</td>
                <td style={{ border: '1px solid #999', padding: '5px 7px', textAlign: 'center' }}>
                  {r.period}
                </td>
                <td style={{ border: '1px solid #999', padding: '5px 7px', textAlign: 'center' }}>
                  {r.method}
                </td>
                <td style={{ border: '1px solid #999', padding: '5px 7px', textAlign: 'right' }}>
                  {r.amount.toLocaleString()}원
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} style={{ border: '1px solid #999', padding: '5px 7px', textAlign: 'right' }}>
                <b>결제 합계</b>
              </td>
              <td style={{ border: '1px solid #999', padding: '5px 7px', textAlign: 'right' }}>
                <b>{paidTotal.toLocaleString()}원</b>
              </td>
            </tr>
            {unpaidTotal > 0 && (
              <tr>
                <td colSpan={4} style={{ border: '1px solid #999', padding: '5px 7px', textAlign: 'right' }}>
                  미납 합계
                </td>
                <td style={{ border: '1px solid #999', padding: '5px 7px', textAlign: 'right' }}>
                  {unpaidTotal.toLocaleString()}원
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
