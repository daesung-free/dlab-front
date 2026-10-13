import { useAuth } from '../../auth/AuthContext'

/**
 * 이름 마스킹을 **켠 채로 시작할지** 정한다.
 *
 * ★ 디랩 회신(2026-10-13): *"담임 권한으로 로그인한 경우에는 마스킹이 필요합니다.
 *   지점관리자는 해제되어도 무방합니다. 다만 **언제든지 마스킹 ON/OFF가 되도록**"*.
 *   그래서 이건 **기본값일 뿐**이고, 쓰는 화면은 반드시 `MaskToggle` 을 함께 둔다 —
 *   기본값만 바꾸고 토글을 안 주면 담임은 영영 이름을 못 본다.
 *
 * ★ 권한을 아직 못 읽었으면(`roles` 가 비었으면) **가린 쪽**으로 시작한다.
 *   늦게 도착한 권한 때문에 이름이 잠깐 노출되는 것보다, 잠깐 가려졌다 풀리는 쪽이 낫다.
 *
 * ★ 서버가 이미 가려 보내는 응답(`masked: true`)과는 **다른 축이다.** 저건 값 자체가
 *   `2007-**-**` 로 와서 되돌릴 수 없고, 이건 화면이 가리는 것이라 토글로 풀린다.
 */
export function useMaskDefault(): boolean {
  const { me, principal } = useAuth()
  const roles = me?.roles ?? principal?.roles ?? []
  if (roles.length === 0) return true
  return !roles.some((r) => r === 'SUPER_ADMIN' || r === 'BRANCH_ADMIN')
}
