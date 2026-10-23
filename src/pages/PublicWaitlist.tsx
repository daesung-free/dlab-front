import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  answerWaitlist,
  getWaitlistInvite,
  WAITLIST_ANSWER_LABEL,
  type WaitlistAnswer,
  type WaitlistInvite,
} from '../api/publicWaitlist'
import { PublicBrand } from './PublicBrand'
import './public-notice.css'

/* 대기자 응답 — /waitlist/:token
 *
 * 자리가 났을 때 보내는 알림톡의 [등록 희망]·[등록 포기] 가 여기로 온다.
 * 누른 결과가 **대기자 상태를 바로 바꾼다** — 전화를 받아 적는 일을 없애는 것이 목적이다.
 *
 * ★ **로그인 밖·휴대폰 화면이다**(도어락·안내문과 같다). 관리자 레이아웃을 쓰면 PC 전용
 *   전제(최소 폭 1024)가 따라와 학부모 폰에서 가로로 잘린다.
 *
 * ★★ **답은 한 번만 할 수 있다**(사장님 결정 2026-10-22). 그런데 **링크는 계속 열린다** —
 *   토큰까지 죽이면 누른 뒤 다시 열었을 때 페이지가 안 떠서 **「눌렀는데 아무 일도
 *   없었다」로 전화가 온다.** 답만 고정하고, 자기가 **무엇을 언제** 눌렀는지 보여준다.
 *
 * ★ **두 버튼의 무게를 다르게 두지 않는다.** 「등록 희망」만 크고 진하면 그쪽으로
 *   손이 간다 — 되돌릴 수 없는 답이라 **고르는 화면이지 권하는 화면이 아니다.**
 *
 * ★ **누르기 전에 한 번 더 묻는다.** 알림톡에서 바로 들어와 손가락이 닿는 자리라,
 *   확인 없이 처리하면 **잘못 눌러도 되돌릴 수 없다.**
 */

function dateTimeText(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`
}

export function PublicWaitlist() {
  /* ★ 토큰을 **경로와 쿼리 둘 다**에서 받는다. 카카오가 버튼 주소에 변수를 허용하지
     않으면 주소를 고정하고 토큰만 쿼리로 넘겨야 할 수 있다 — 그때 화면을 안 고치려고
     지금 열어 둔다(`/notice/{토큰}` · `/notice?t={토큰}`) */
  const { token: pathToken } = useParams()
  const [search] = useSearchParams()
  const token = pathToken ?? search.get('t') ?? ''
  const [invite, setInvite] = useState<WaitlistInvite | null>(null)
  const [failed, setFailed] = useState(false)
  /** 누르기 전 확인 단계. 되돌릴 수 없어서 한 번 더 묻는다 */
  const [asking, setAsking] = useState<WaitlistAnswer | null>(null)
  const [busy, setBusy] = useState(false)
  const [replyMsg, setReplyMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getWaitlistInvite(token)
      .then((v) => alive && setInvite(v))
      /* 통신 실패만 여기로 온다 — 기한 지남·없는 토큰은 200 이라 available 로 간다 */
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [token])

  async function submit(answer: WaitlistAnswer) {
    setBusy(true)
    try {
      const r = await answerWaitlist(token, answer)
      setReplyMsg(r.message)
      /* ★ 보낸 뒤 **다시 읽는다.** 이미 답한 상태였다면 서버가 가진 답이 정본이다 —
           화면이 방금 누른 값을 들고 있으면 **서버와 다른 답을 보여준다** */
      setInvite(await getWaitlistInvite(token))
    } catch {
      setReplyMsg('지금은 응답을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
      setAsking(null)
    }
  }

  return (
    <div className="pn-page">
      <main className="pn-card">
        <PublicBrand />

        {failed ? (
          <p className="pn-msg" role="status">
            지금은 열 수 없습니다.
            <br />
            잠시 후 다시 시도해 주세요.
          </p>
        ) : invite === null ? (
          <div aria-hidden>
            <div className="pn-skeleton" style={{ width: '60%', height: 20 }} />
            <div className="pn-skeleton" style={{ width: '85%', marginTop: 18 }} />
            <div className="pn-skeleton" style={{ width: '70%' }} />
          </div>
        ) : !invite.available ? (
          /* 기한 지남·철회·없는 토큰이 전부 여기다. 사유를 화면이 가르지 않는다 */
          <p className="pn-msg" role="status">
            {invite.message ?? (
              <>
                등록 안내를 확인할 수 없습니다.
                <br />
                유효하지 않은 링크이거나, 응답 기간이 지났습니다.
                <br />
                자세한 내용은 학원으로 문의해 주시기 바랍니다.
              </>
            )}
          </p>
        ) : (
          <>
            <h1 className="pn-title">등록 안내</h1>
            <div className="pn-meta">{invite.academyName}</div>

            <div className="pn-body">
              <b>{invite.studentName}</b> 학생의 대기 신청에 따른 등록이 가능합니다.
              {invite.deadline ? (
                <>
                  {'\n'}
                  등록을 희망하시는지 {dateTimeText(invite.deadline)}까지 응답해 주시기 바랍니다.
                </>
              ) : (
                <>
                  {'\n'}
                  등록을 희망하시는지 응답해 주시기 바랍니다.
                </>
              )}
            </div>

            {invite.answered ? (
              <div className="pw-done">
                <div className="pw-done-tt">{WAITLIST_ANSWER_LABEL[invite.answered]}</div>
                <div className="pw-done-sub">
                  {invite.answeredAt
                    ? `${dateTimeText(invite.answeredAt)}에 응답이 접수되었습니다.`
                    : '응답이 접수되었습니다.'}
                  {'\n'}변경이 필요하신 경우 학원으로 문의해 주시기 바랍니다.
                </div>
              </div>
            ) : asking !== null ? (
              <div className="pw-confirm">
                <div className="pw-confirm-tt">
                  「{WAITLIST_ANSWER_LABEL[asking]}」으로 응답합니다.
                  {'\n'}
                  <b>응답 후에는 변경할 수 없습니다.</b>
                </div>
                <div className="pw-btns">
                  <button className="pw-btn" type="button" disabled={busy} onClick={() => setAsking(null)}>
                    취소
                  </button>
                  <button
                    className="pw-btn pw-btn-fill"
                    type="button"
                    disabled={busy}
                    onClick={() => void submit(asking)}
                  >
                    {busy ? '처리 중…' : '응답'}
                  </button>
                </div>
              </div>
            ) : (
              /* ★ 두 버튼을 같은 모양으로 둔다 — 한쪽을 권하는 화면이 아니다 */
              <div className="pw-btns pw-btns-col">
                {(Object.keys(WAITLIST_ANSWER_LABEL) as WaitlistAnswer[]).map((a) => (
                  <button key={a} className="pw-btn" type="button" onClick={() => setAsking(a)}>
                    {WAITLIST_ANSWER_LABEL[a]}
                  </button>
                ))}
              </div>
            )}

            {replyMsg !== null && (
              <p className="pw-msg" role="status">
                {replyMsg}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
