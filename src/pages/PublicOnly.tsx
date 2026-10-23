import { PublicBrand } from './PublicBrand'
import './public-notice.css'

/*
 * 학부모용 도메인에서 **공개 페이지가 아닌 주소**로 들어왔을 때.
 *
 * ★ 관리자 화면과 같은 빌드가 두 도메인에 올라가 있어, 받은 링크에서 앞부분만 지우면
 *   **관리자 로그인 창**이 열린다. 로그인해야 아무것도 안 보이지만 받은 사람이 볼
 *   이유가 없는 화면이고, 「여기서 뭘 해야 하나」로 전화가 온다.
 * ★ **관리자 주소를 안내하지 않는다.** 학부모에게 알려 줄 주소가 아니다.
 * ★ 고장이 아니라 **주소가 다르다**는 것만 말한다. 버튼도 두지 않는다 —
 *   할 수 있는 일이 없다(받은 링크로 다시 들어와야 한다).
 */
export function PublicOnly() {
  return (
    <div className="pn-page">
      <main className="pn-card">
        <PublicBrand />
        <p className="pn-msg" role="status">
          접속 주소를 확인해 주세요.
          <br />
          서비스 이용은 안내 문자에 포함된 링크로 접속해 주시기 바랍니다.
        </p>
      </main>
    </div>
  )
}
