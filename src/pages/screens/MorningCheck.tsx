import { useMemo } from 'react'
import { DataTable, useServerData, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import {
  alertState,
  hasNoRecipient,
  listMorningChecks,
  type MorningCheck as Row,
} from '../../api/morningCheck'
import type { Mockup } from './types'

/* 오전 출근 확인 (추가개발 11번)
 *
 * 연동(2026-10-12) — GET /api/v1/admin/staff-attendance/checks. src/api/morningCheck.ts 참고.
 *   매일 07:05 에 지점별 당일 출근 기록(IN)이 0건이면 관리자에게 문자가 간다.
 *
 * ★ **전 지점을 한 화면에 그린다.** 어느 지점이 안 찍혔는지가 이 화면의 목적이라 지점을
 *   좁히면 볼 이유가 없어진다 — `allBranches` 로 "지점을 먼저 고르세요" 안내를 끈다.
 *
 * ★ **휴일에도 검사한다**(요구사항 2-5 · 10/8 디랩 결정). 일요일에 결과가 줄줄이 찍히는 것이
 *   정상이다. 화면에서 휴일을 걸러 주면 "왜 그날은 없냐" 가 되고, 아무 말도 없으면
 *   "오작동 아니냐" 가 된다 — 그래서 안내 문구로 먼저 밝힌다.
 *
 * ★ **「문자 연동 전」과 「발송 실패」는 지금 구분할 수 없다.** 둘 다 `alertNeeded && !alertSent`
 *   다. 알리고가 붙기 전에는 전자이고 붙은 뒤에는 후자인데, 그걸 행마다 구분하는 필드를
 *   두면 연동되는 날 바로 의미가 없어진다 — 그래서 **배너로 가른다.**
 *   연동이 끝나면 이 배너를 지우는 것이 화면 쪽 마지막 작업이다.
 *
 * ★ **받을 사람이 0인 것은 `alertNeeded` 일 때만 문제다.** 보낼 필요가 없는 날에는 서버가
 *   수신 대상을 아예 세지 않아 0 이 온다 — 그걸 경고로 띄우면 **정상인 날에 전부 경고가
 *   뜬다**(2026-10-12 백엔드 회신).
 */

const STATE_LABEL = {
  NOT_NEEDED: '보낼 필요 없음',
  SENT: '발송',
  PENDING: '문자 연동 전',
} as const

const STATE_CLASS = {
  NOT_NEEDED: 'verified',
  SENT: 'supplement',
  PENDING: 'brandnew',
} as const

function Content() {
  /* 기간을 비우면 서버가 최근 2주를 준다. 조건이 없어도 useMemo 로 고정한다 —
     매 렌더 새 객체면 무한 요청이 된다 */
  const params = useMemo(() => ({}), [])
  const checks = useServerData({
    fetcher: listMorningChecks,
    params,
    errorMessage: '검사 내역을 불러오지 못했습니다.',
  })

  const rows = checks.data ?? []
  const noRecipient = rows.filter(hasNoRecipient).length

  const cols: Column<Row>[] = useMemo(
    () => [
      { key: 'checkDate', header: '근무일', width: '120px', sortable: true, value: (r) => r.checkDate ?? '-' },
      { key: 'academyName', header: '지점', width: '100px', value: (r) => r.academyName ?? '-' },
      {
        key: 'inCount',
        header: '출근 기록',
        width: '100px',
        align: 'right',
        sortable: true,
        /* ★ 0 만 색을 달리하지 않는다 — 같은 칸에서 글자 모양이 바뀌면 표가 들쭉날쭉하다.
              「보낼 일이 있었다」는 옆 「문자」 칸이 이미 말한다 */
        value: (r) => r.inCount,
      },
      {
        key: 'state',
        header: '문자',
        width: '130px',
        align: 'center',
        value: (r) => STATE_LABEL[alertState(r)],
        render: (r) => <span className={`mk ${STATE_CLASS[alertState(r)]}`}>{STATE_LABEL[alertState(r)]}</span>,
      },
      {
        key: 'recipientCount',
        header: '받을 사람',
        width: '150px',
        value: (r) => (r.alertNeeded ? r.recipientCount : '-'),
        /* ★ 숫자 0 만 두면 아무도 안 본다. 검사는 돌았는데 아무도 못 받은 것이라
              그 자리에서 이유를 말한다 */
        render: (r) =>
          hasNoRecipient(r) ? (
            <span className="mk brandnew">받을 사람 없음</span>
          ) : r.alertNeeded ? (
            `${r.recipientCount}명`
          ) : (
            '-'
          ),
      },
    ],
    [],
  )

  return (
    <>
      <div className="note-box">
        <div>
          매일 <b>아침 7시 5분</b>에 지점마다 출근 기록이 있는지 확인합니다. 한 건도 없으면 관리자에게
          문자가 갑니다. <b>일요일과 공휴일에도 똑같이 확인합니다.</b>
        </div>
      </div>

      {/* ★ 연동 전이라는 사실을 행에 섞지 않는다 — 붙는 날 이 배너만 지우면 된다 */}
      <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
        <div className="ic">
          <Icon name="triangle-alert" size={17} />
        </div>
        <div>
          <div className="tt">문자 발송은 아직 준비 중입니다</div>
          <div className="tx">
            확인은 매일 정상으로 돌고 있습니다. 보낼 일이 있었던 날은 <b>「문자 연동 전」</b>으로 남고,
            준비가 끝나면 그날부터 실제로 발송됩니다.
          </div>
        </div>
      </div>

      {noRecipient > 0 && (
        <div className="note-box" style={{ borderColor: 'var(--rose)' }} role="status">
          <div>
            <b>{noRecipient}건</b>은 알릴 사람이 지정되지 않아 아무에게도 가지 않습니다. 사용자 관리에서
            그 지점 담당자의 <b>「긴급 출입 · 출근 확인 알림 수신」</b>을 켜 주세요.
          </div>
        </div>
      )}

      {checks.error && (
        <div className="note-box" style={{ borderColor: 'var(--rose)' }} role="status">
          <div>{checks.error}</div>
        </div>
      )}

      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(r) => String(r.id)}
        loading={checks.loading}
        pageSize={20}
        emptyText="아직 검사 기록이 없습니다. 내일 아침 7시 5분에 처음 쌓입니다."
      />

      <div className="note-box" style={{ marginTop: 10 }}>
        <div>
          문자는 <b>「긴급 출입 · 출근 확인 알림 수신」 권한을 켠 계정</b>에게만 갑니다. 지점 담당자는
          자기 지점 건만, 본사 담당자는 전 지점 건을 받습니다.
        </div>
      </div>
    </>
  )
}

export const morningCheckMockup: Mockup = { Content, allBranches: true }
