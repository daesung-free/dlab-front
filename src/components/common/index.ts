/* 실행가이드 Phase 0 / FE 1순위 공통 컴포넌트
 * "SearchForm / DataTable / ExcelButton / DateRange — 이후 전 화면 재사용"
 * "이후 모든 화면의 개발 속도를 좌우"
 */
export { DataTable, displayCell } from './DataTable'
export type { Column, ServerPaging } from './DataTable'

/* 서버 목록 조회 훅 — 검색조건→호출→페이징·정렬·로딩·에러.
 * 목록 화면은 이걸 쓴다. 직접 useEffect로 짜면 취소 처리·페이지 초기화를 빠뜨린다. */
export { useServerTable } from './useServerTable'

/* 서버 페이징이 없는 조회(출결·사유신청·상벌점·상담·루틴)는 이쪽.
 * page·size·sort 를 안 받는 엔드포인트에 useServerTable 을 쓰면 페이저와 정렬이
 * 통째로 죽는다 — 어느 쪽을 쓸지는 useServerData.ts 첫 주석에 적어뒀다. */
export { useServerData } from './useServerData'

export { SearchForm } from './SearchForm'
export type { Field, SearchValues, SearchValue } from './SearchForm'

export { DateRange } from './DateRange'
export type { DateRangeValue } from './DateRange'

export { ExcelButton, CopyButton, PrintButton, MaskToggle } from './ExcelButton'

/* 아직 API가 값을 주지 않는 셀. 컬럼을 지우는 대신 이걸 쓴다 */
export { Unfilled } from './Unfilled'
