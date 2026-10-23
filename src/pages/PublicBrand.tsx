import logoUrl from '../assets/logo.png'

/*
 * 공개 페이지(안내문·대기자 응답·접속 안내) 맨 위의 머리글.
 *
 * ★ **받는 사람이 「어디서 온 링크인지」 알아야 한다.** 알림톡에서 눌러 들어오는 자리라,
 *   글자 「D.Lab」만 있으면 흉내 낸 페이지와 구별되지 않는다 — 관리자 화면과 **같은 로고**를
 *   쓴다.
 * ★ **「통합관리 1.0」은 쓰지 않는다.** 그건 직원용 제품 이름이다. 학부모가 읽을 이유가
 *   없고, 버전 숫자는 더더욱 그렇다.
 * ★ 대신 **무슨 학원인지**를 한 줄 둔다(관리자 상단바와 같은 문구).
 */
export function PublicBrand() {
  return (
    <div className="pn-brand">
      <img className="pn-logo" src={logoUrl} alt="D.Lab" />
      <span>대성 · 관리형 독학재수</span>
    </div>
  )
}
