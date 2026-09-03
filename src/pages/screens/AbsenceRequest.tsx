import { useMemo, useState } from 'react'
import { DataTable, Unfilled, useServerData, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import {
  ABSENCE_TYPE_LABEL,
  APPROVAL_STATUS_LABEL,
  APPROVER_TYPE_LABEL,
  approveRequest,
  fetchAbsenceRequests,
  rejectRequest,
  type AbsenceRequestRow,
  type ApprovalStatus,
} from '../../api/absenceRequests'
import type { Mockup } from './types'

/* F-4.1-5 사유 신청 관리 — GET /api/v1/admin/absence-requests
 *
 * ★ 서버 페이징이 없어 useServerData 를 쓴다(Attendance.tsx 머리 주석과 같은 이유).
 *
 * ★ 탭(대기/승인/반려)을 status 파라미터로 걸지 않고 **기간 전량을 한 번 받아 화면에서 나눈다.**
 *   어차피 기간 전량이 한 번에 오기 때문이다.
 *
 * ★ 다만 **탭 건수는 rows 를 세지 않고 summary 를 쓴다.** 서버 페이징이 들어오면 rows 는
 *   한 페이지가 되지만 summary 는 필터 전체 기준을 유지한다고 확인받았다. 세는 쪽을 미리
 *   옮겨두지 않으면 페이징이 붙는 날 "승인 완료 5"가 실제 40건인 상태가 되고, 에러도 안 난다.
 *
 * ★ 기간을 안 주면 서버가 **이번 달 1일 ~ 오늘**로 본다. 그 전의 미처리 건은 목록에서
 *   사라지는데 화면에는 아무 표시가 안 남는다 — 그래서 조회 기간을 명시해 보내고
 *   건수 라벨에 그대로 적는다.
 *
 * ★ 승인·반려는 이 엔드포인트가 아니라 /approvals/{approvalRequestId}/approve|reject 다.
 *   관리자가 누르면 approverType=ADMIN(대리 처리)으로 남는다 — 담임으로 기록하면
 *   "누가 승인했나"에 답할 수 없기 때문이다. 남의 지점 건은 서버가 막는다.
 */

const PAGE_SIZE = 12

const APPROVER_CLASS: Record<string, string> = {
  PARENT: 'supplement',
  TEACHER: 'verified',
  AUTO: 'brandnew',
  ADMIN: 'verified',
}

/** 목업 탭 3개. CANCELED 는 건수가 있을 때만 탭을 띄운다 — 없는 척하면 행이 조용히 사라진다 */
const TABS: ApprovalStatus[] = ['PENDING', 'APPROVED', 'REJECTED']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 서버가 UTC instant 로 준다. 그대로 찍으면 9시간 어긋난다 */
function localDateTime(iso: string): string {
  const d = new Date(iso)
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState<ApprovalStatus>('PENDING')
  const [acting, setActing] = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // 서버 기본값과 같은 범위를 명시해서 보낸다 — 화면에 적은 기간과 실제 조회 범위를 맞추려는 것
  const period = useMemo(() => {
    const now = new Date()
    return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: localDate(now) }
  }, [])

  // ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다
  const params = useMemo(
    () => ({ academyId: academyId ?? undefined, from: period.from, to: period.to }),
    [academyId, period],
  )

  const board = useServerData({
    fetcher: fetchAbsenceRequests,
    params,
    enabled: academyId !== null,
    errorMessage: '사유 신청 목록을 불러오지 못했습니다.',
  })

  const all = board.data?.rows ?? []
  const summary = board.data?.summary
  // 건수는 서버 summary 기준이다(머리 주석) — rows 를 세면 페이징이 붙는 날 조용히 틀린다
  const countOf = (s: ApprovalStatus): number =>
    ({ PENDING: summary?.pending, APPROVED: summary?.approved, REJECTED: summary?.rejected, CANCELED: summary?.canceled })[s] ?? 0
  const canceled = countOf('CANCELED')
  const rows = useMemo(() => all.filter((r) => r.status === tab), [all, tab])

  async function act(row: AbsenceRequestRow, kind: 'approve' | 'reject') {
    let reason = ''
    if (kind === 'reject') {
      // 반려 사유는 학생·학부모에게 그대로 전달된다. 서버도 필수값이다
      reason = window.prompt('반려 사유를 입력하세요. 학생·학부모에게 그대로 전달됩니다.')?.trim() ?? ''
      if (reason === '') return
    }

    setActing(row.approvalRequestId)
    setActionMsg(null)
    try {
      if (kind === 'approve') await approveRequest(row.approvalRequestId)
      else await rejectRequest(row.approvalRequestId, reason)
      setActionMsg(`${row.name} · ${ABSENCE_TYPE_LABEL[row.type]} 건을 ${kind === 'approve' ? '승인' : '반려'}했습니다.`)
      board.reload()
    } catch (err) {
      // 권한(대리승인 허용 범위)·이미 처리됨이 여기로 온다. 서버 문구를 그대로 보여준다
      setActionMsg(err instanceof ApiError ? err.message : '처리에 실패했습니다.')
    } finally {
      setActing(null)
    }
  }

  const columns: Column<AbsenceRequestRow>[] = useMemo(
    () => [
      { key: 'submittedAt', header: '신청일시', width: '140px', sortable: true, value: (r) => localDateTime(r.submittedAt) },
      { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo ?? '-' },
      { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
      { key: 'className', header: '반', width: '56px', align: 'center', value: (r) => r.className ?? '-' },
      {
        key: 'type',
        header: '유형',
        width: '68px',
        align: 'center',
        value: (r) => ABSENCE_TYPE_LABEL[r.type] ?? r.type,
        render: (_r, shown) => <span className="mk supplement">{shown}</span>,
      },
      { key: 'period', header: '기간', width: '110px', value: (r) => r.period },
      { key: 'reason', header: '사유', value: (r) => r.reason ?? '-' },
      {
        key: 'approverType',
        header: '승인 주체',
        width: '116px',
        align: 'center',
        sortable: true,
        value: (r) => APPROVER_TYPE_LABEL[r.approverType] ?? r.approverType,
        render: (r, shown) => (
          <span className={`mk ${APPROVER_CLASS[r.approverType] ?? ''}`} title={`approver_type: ${r.approverType}`}>
            {shown}
          </span>
        ),
      },
      {
        key: 'status',
        header: '상태',
        width: '150px',
        align: 'center',
        value: (r) => APPROVAL_STATUS_LABEL[r.status] ?? r.status,
        render: (r, shown) => {
          if (r.status !== 'PENDING') {
            const color =
              r.status === 'APPROVED' ? 'var(--green)' : r.status === 'REJECTED' ? 'var(--red)' : 'var(--muted)'
            return <span style={{ fontSize: 11.5, fontWeight: 700, color }}>{shown}</span>
          }
          const busy = acting === r.approvalRequestId
          return (
            <div style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
              <button
                className="btn"
                style={{ padding: '4px 10px', fontSize: 11.5 }}
                disabled={busy}
                onClick={() => void act(r, 'approve')}
              >
                승인
              </button>
              <button
                className="btn"
                style={{ padding: '4px 10px', fontSize: 11.5, color: 'var(--red)' }}
                disabled={busy}
                onClick={() => void act(r, 'reject')}
              >
                반려
              </button>
            </div>
          )
        },
      },
    ],
    [acting],
  )

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="clock" size={13} /> 승인 대기
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {summary?.pending ?? 0}
          </div>
          <div className="d">실시간 수신</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 학부모 대기
          </div>
          <div className="v">{summary?.waitingParent ?? 0}</div>
          <div className="d">PARENT</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-check" size={13} /> 담임 대기
          </div>
          <div className="v">{summary?.waitingTeacher ?? 0}</div>
          <div className="d">TEACHER</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="arrow-right" size={13} /> 에스컬레이션 후보
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {summary?.escalationCandidate ?? 0}
          </div>
          <div className="d warn">학부모 미응답 타임아웃</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 벌점 확정 충돌
          </div>
          {/* ★ 이 타일은 유지한다(2026-09-02 백엔드 회신). 요구사항 F-4.1-6·A-6 에
              "벌점 확정 후 승인 불가"가 박혀 있고 앱도 is_penalty_finalized 로 버튼을 막는다.
              미정인 것은 **확정 시점(I-10)** 하나뿐이라 목업을 고칠 건이 아니다.
              서버는 그때까지 penaltyConflictUnavailable 로 "판정 못 함"을 명시한다 */}
          <div className="v" style={{ fontSize: 15, paddingTop: 8 }}>
            <Unfilled reason="벌점 확정 시점(I-10) 미정이라 서버가 판정하지 않음" />
          </div>
          <div className="d warn">벌점 확정 건</div>
        </div>
      </div>

      {academyId === null && (
        <div className="note-box">지점을 먼저 선택하세요. 사유 신청은 지점 단위로 조회합니다.</div>
      )}

      {board.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {board.error}
        </div>
      )}

      {actionMsg && <div className="note-box">{actionMsg}</div>}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'PENDING', label: '승인 대기', count: countOf('PENDING') },
            { key: 'APPROVED', label: '승인 완료', count: countOf('APPROVED') },
            { key: 'REJECTED', label: '반려', count: countOf('REJECTED') },
            // 취소 건이 있을 때만. 탭이 없으면 그 행들이 어느 탭에도 안 잡혀 조용히 사라진다
            ...(canceled > 0 ? [{ key: 'CANCELED', label: '취소', count: canceled }] : []),
          ]}
          active={tab}
          onChange={(k) => setTab(k as ApprovalStatus)}
        />
        <div style={{ padding: 14 }}>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => String(r.id)}
            loading={board.loading}
            pageSize={PAGE_SIZE}
            // 서버가 이미 가려서 보냈으면(masked) 프론트에서 또 가리지 않는다 — 이중 마스킹이 된다
            masked={!(board.data?.masked ?? false)}
            countLabel={
              <>
                {period.from} ~ {period.to} · {TABS.includes(tab) ? APPROVAL_STATUS_LABEL[tab] : '취소'}{' '}
                <b>{rows.length}</b>건
              </>
            }
          />
        </div>
      </div>
    </>
  )
}

export const absenceMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="settings" size={14} /> 승인 항목 설정
      </button>
      <button className="btn pri">
        <Icon name="plus" size={14} /> 관리자 직접 등록
      </button>
    </>
  ),
}
