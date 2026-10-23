import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getPublicNotice, type PublicNotice as Notice } from '../api/publicNotices'
import { PublicBrand } from './PublicBrand'
import './public-notice.css'

/* 공개 안내문 — /notice/:token
 *
 * 알림톡 「등록비 안내」 버튼이 여는 자리다. 디랩 홈페이지에 쓸 만한 안내문 주소가 없는
 * 것으로 확인돼 우리가 만든다(2026-10-22 결정).
 *
 * ★ **로그인 밖이다.** App 의 Gate 보다 앞에서 라우팅해 인증을 타지 않는다 —
 *   알림톡을 받은 학부모가 관리자 계정을 가질 리 없다.
 * ★ **휴대폰 화면이다.** 관리자 공통 레이아웃·사이드바를 쓰지 않는다. 쓰면 PC 전용
 *   전제(최소 폭 1024)가 따라와 학부모 폰에서 가로로 잘린다(도어락 QR 과 같은 이유).
 * ★ **사유를 화면이 만들지 않는다.** 만료·철회·없는 토큰이 전부 `available: false` 로
 *   오고 문장은 서버가 준다. 「만료된 링크입니다」와 「없는 링크입니다」를 갈라 보여주면
 *   **주소를 두드려 보는 쪽에 그 차이가 힌트**가 된다.
 * ★ **다시 시도 버튼을 두지 않는다.** 학부모가 할 수 있는 일이 없다 — 링크를 새로 받아야
 *   한다. 누를 것을 주면 눌러 보다 같은 화면을 다시 본다.
 */

/** 본문이 길 수 있어 **제목을 탭에 올린다** — 여러 안내를 열어 두면 구분이 안 된다 */
function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return
    const before = document.title
    document.title = title
    return () => {
      document.title = before
    }
  }, [title])
}

function dateText(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

/** 받는 사람은 바이트를 모른다. KB·MB 로만 적는다 */
function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

export function PublicNotice() {
  /* ★ 토큰을 **경로와 쿼리 둘 다**에서 받는다. 카카오가 버튼 주소에 변수를 허용하지
     않으면 주소를 고정하고 토큰만 쿼리로 넘겨야 할 수 있다 — 그때 화면을 안 고치려고
     지금 열어 둔다(`/notice/{토큰}` · `/notice?t={토큰}`) */
  const { token: pathToken } = useParams()
  const [search] = useSearchParams()
  const token = pathToken ?? search.get('t') ?? ''
  const [notice, setNotice] = useState<Notice | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setNotice(null)
    setFailed(false)
    getPublicNotice(token)
      .then((n) => alive && setNotice(n))
      /* ★ 통신 실패만 여기로 온다 — 볼 수 없는 링크는 200 이라 `available` 로 간다.
            그때도 조건을 짐작할 수 있는 말은 쓰지 않는다 */
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [token])

  useDocumentTitle(notice?.title)

  return (
    <div className="pn-page">
      <main className="pn-card">
        <PublicBrand />

        {failed ? (
          <p className="pn-msg" role="status">
            지금은 안내문을 열 수 없습니다.
            <br />
            잠시 후 다시 시도해 주세요.
          </p>
        ) : notice === null ? (
          /* 글을 읽으러 온 화면이라 「불러오는 중」 대신 자리만 잡아 둔다 */
          <div aria-hidden>
            <div className="pn-skeleton" style={{ width: '70%', height: 20 }} />
            <div className="pn-skeleton" style={{ width: '40%' }} />
            <div className="pn-skeleton" style={{ width: '100%', marginTop: 22 }} />
            <div className="pn-skeleton" style={{ width: '92%' }} />
            <div className="pn-skeleton" style={{ width: '96%' }} />
          </div>
        ) : !notice.available ? (
          <p className="pn-msg" role="status">
            {notice.message ?? '안내문을 볼 수 없는 링크입니다.'}
          </p>
        ) : (
          <>
            <h1 className="pn-title">{notice.title}</h1>
            <div className="pn-meta">
              {[notice.academyName, dateText(notice.postedAt)].filter(Boolean).join(' · ')}
            </div>
            <div className="pn-body">{notice.content}</div>

            {notice.attachments !== undefined && notice.attachments.length > 0 && (
              <div className="pn-files">
                <div className="pn-files-tt">첨부파일</div>
                {notice.attachments.map((f) => (
                  /* ★ 주소를 그대로 쓴다. 관리자 첨부 경로로 바꾸면 토큰이 없어 안 열린다 */
                  <a key={f.url} className="pn-file" href={f.url} target="_blank" rel="noreferrer">
                    {f.originalName}
                    <span className="pn-file-size">{sizeText(f.sizeBytes)}</span>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
