import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, Unfilled, useServerData, type Column, Modal } from '../../components/common'
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
  registerAbsenceRequest,
  rejectRequest,
  type AbsenceRequestRow,
  type AbsenceType,
  type ApprovalStatus,
} from '../../api/absenceRequests'
import type { Mockup } from './types'
import { createScreenSignal } from './screenSignal'
import { searchStudents, type Student } from '../../api/students'
import { listAbsenceCategories, type AbsenceCategory } from '../../api/schoolMasters'

/* 헤더 '관리자 직접 등록' 이 넣은 뒤 본문 목록을 다시 읽게 잇는다(CLAUDE.md 5-1) */
const registered = createScreenSignal()

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

/** 승인 주체별 한 줄 설명. 뱃지만 보고는 "왜 이 사람인지" 를 모른다 */
const APPROVER_TIP: Record<string, string> = {
  PARENT: '학부모가 앱에서 승인합니다',
  TEACHER: '담당 반 교사가 승인합니다',
  AUTO: '조건을 채우면 자동으로 승인됩니다',
}

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
  const { academyId, ready: academyReady } = useAcademy()
  const [tab, setTab] = useState<ApprovalStatus>('PENDING')
  const [acting, setActing] = useState<number | null>(null)
  /** 반려 사유 입력 모달. 사유는 학생·학부모에게 그대로 전달된다 */
  const [rejecting, setRejecting] = useState<{ row: AbsenceRequestRow; reason: string } | null>(null)
  const [rejectErr, setRejectErr] = useState<string | null>(null)
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
  const regVer = registered.useVersion()
  useEffect(() => {
    if (regVer > 0) board.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regVer])

  const all = board.data?.rows ?? []
  const summary = board.data?.summary
  // 건수는 서버 summary 기준이다(머리 주석) — rows 를 세면 페이징이 붙는 날 조용히 틀린다
  const countOf = (s: ApprovalStatus): number =>
    ({ PENDING: summary?.pending, APPROVED: summary?.approved, REJECTED: summary?.rejected, CANCELED: summary?.canceled })[s] ?? 0
  const canceled = countOf('CANCELED')
  const rows = useMemo(() => all.filter((r) => r.status === tab), [all, tab])

  /**
   * ★ 반려는 **성공한 뒤에** 모달을 닫는다. 먼저 닫으면 서버가 거부했을 때 길게 쓴 사유가
   *   통째로 날아가고, 오류는 뒤 화면에 떠서 무엇이 문제인지도 모른다.
   */
  async function act(row: AbsenceRequestRow, kind: 'approve' | 'reject', reason = '') {
    setActing(row.approvalRequestId)
    setActionMsg(null)
    try {
      if (kind === 'approve') await approveRequest(row.approvalRequestId)
      else await rejectRequest(row.approvalRequestId, reason)
      setActionMsg(`${row.name} · ${ABSENCE_TYPE_LABEL[row.type]} 건을 ${kind === 'approve' ? '승인' : '반려'}했습니다.`)
      setRejecting(null)
      board.reload()
    } catch (err) {
      // 권한(대리승인 허용 범위)·이미 처리됨이 여기로 온다. 서버 문구를 그대로 보여준다
      const msg = err instanceof ApiError ? err.message : '처리에 실패했습니다.'
      // 반려 모달이 열려 있으면 그 안에서 보여준다 — 뒤 화면 배너는 모달에 가려 안 보인다
      if (kind === 'reject') setRejectErr(msg)
      else setActionMsg(msg)
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
        key: 'rejectReason',
        header: '반려 사유',
        width: '160px',
        // 반려 건에만 값이 있다. 학생·학부모에게 그대로 전달된 문구라 그대로 보여준다
        value: (r) => r.rejectReason ?? '',
        render: (r) =>
          r.rejectReason ? (
            <span style={{ color: 'var(--red)' }}>{r.rejectReason}</span>
          ) : (
            <span style={{ color: 'var(--muted)' }}>-</span>
          ),
      },
      {
        key: 'approverType',
        header: '승인 주체',
        width: '116px',
        align: 'center',
        sortable: true,
        value: (r) => APPROVER_TYPE_LABEL[r.approverType] ?? r.approverType,
        /* ★ 툴팁도 화면이다(CLAUDE.md 1-1). 예전에는 `approver_type: PARENT` 를 띄웠는데
             서버 필드명이라 읽는 사람에게 쓸모가 없다 — 지금 누가 답할 차례인지를 쓴다 */
        render: (r, shown) => (
          <span className={`mk ${APPROVER_CLASS[r.approverType] ?? ''}`} title={APPROVER_TIP[r.approverType] ?? ''}>
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
                onClick={() => setRejecting({ row: r, reason: '' })}
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
      {rejecting && (
        <Modal
          title="반려 사유"
          sub="적으신 내용이 학생·학부모에게 그대로 전달됩니다."
          confirmLabel="반려"
          danger
          busy={acting === rejecting.row.approvalRequestId}
          confirmDisabled={rejecting.reason.trim() === ''}
          error={rejectErr}
          onConfirm={() => void act(rejecting.row, 'reject', rejecting.reason.trim())}
          onClose={() => setRejecting(null)}
        >
          <div className="frow">
            <label className="req">사유</label>
            <textarea
              className="ta"
              value={rejecting.reason}
              maxLength={200}
              placeholder="예: 제출한 증빙으로는 확인이 어렵습니다."
              onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })}
            />
          </div>
        </Modal>
      )}

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
          <div className="d">앱 알림 보낸 뒤 대기</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-check" size={13} /> 담임 대기
          </div>
          <div className="v">{summary?.waitingTeacher ?? 0}</div>
          <div className="d">담임이 답할 차례</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="arrow-right" size={13} /> 담임에게 넘어갈 건
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
            <Unfilled reason="아직 표시할 수 없는 값입니다" />
          </div>
          <div className="d warn">벌점 확정 건</div>
        </div>
      </div>

      {academyId === null && academyReady && (
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
            nowrap
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
                {/* 이 화면에는 마스킹 토글이 없다(서버가 가려서 줄 때도 있고 권한에 달렸다).
                    표가 가리고 있다는 것을 여기서 적는다 — 예전에는 DataTable 이 대신 적었다 */}
                {!(board.data?.masked ?? false) && (
                  <span style={{ color: 'var(--muted)' }}> · 이름·연락처는 가려서 보입니다</span>
                )}
              </>
            }
          />
        </div>
      </div>
    </>
  )
}

/**
 * 관리자 직접 등록 — 학생 대신 사유를 넣는다.
 *
 * ★ **자동 승인이 아니다.** 서버가 승인 라우팅을 그대로 태운다 — 관리자가 넣었다고 건너뛰면
 *   학부모 승인이 필요한 유형에서 학부모가 모르는 사이에 처리된다. 화면에도 그렇게 적는다.
 * ★ 그 해·지점에 승인 정책이 없으면 서버가 막는다 — 문구를 그대로 보인다.
 */
function RegisterButton() {
  const { academyId } = useAcademy()
  const [open, setOpen] = useState(false)
  const [students, setStudents] = useState<Student[] | null>(null)
  const [cats, setCats] = useState<AbsenceCategory[]>([])
  const [f, setF] = useState({ enrollmentId: '', date: '', type: 'ABSENCE' as AbsenceType, categoryId: '', startTime: '', endTime: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function openIt() {
    if (academyId === null) return
    setOpen(true)
    setErr(null)
    setF({ enrollmentId: '', date: localDate(new Date()), type: 'ABSENCE', categoryId: '', startTime: '', endTime: '', reason: '' })
    searchStudents({ academyId, status: 'ENROLLED', size: 500, sort: 'studentNo,asc' })
      .then((p) => setStudents(p.rows))
      .catch(() => setStudents([]))
    listAbsenceCategories({ academyId, activeOnly: true })
      .then(setCats)
      .catch(() => setCats([]))
  }

  /* 시간은 외출·조퇴만 받는다 — 결석·지각은 종일이다. 조퇴는 돌아오지 않아 끝 시간이 없다 */
  const needStart = f.type === 'EARLY_LEAVE' || f.type === 'OUTING'
  const needEnd = f.type === 'OUTING'

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      await registerAbsenceRequest({
        enrollmentId: Number(f.enrollmentId),
        date: f.date,
        type: f.type,
        reason: f.reason.trim() || undefined,
        startTime: needStart && f.startTime ? f.startTime : undefined,
        endTime: needEnd && f.endTime ? f.endTime : undefined,
        categoryId: f.categoryId ? Number(f.categoryId) : undefined,
      })
      const who = students?.find((x) => String(x.enrollmentId) === f.enrollmentId)?.name ?? ''
      setDone(`${who} ${f.date} ${ABSENCE_TYPE_LABEL[f.type]} 사유를 등록했습니다. 승인 절차는 학생이 낸 것과 똑같이 진행됩니다.`)
      setOpen(false)
      registered.bump()
    } catch (e) {
      /* 서버 문구가 '승인 정책이 없습니다: ABSENCE' 처럼 유형 코드를 달고 온다 — 할 일이 보이게 바꾼다 */
      setErr(
        e instanceof ApiError
          ? e.message.startsWith('승인 정책이 없습니다')
            ? '이 지점에 사유 신청 승인 설정이 없습니다. 승인 라우팅 화면에서 먼저 정해 주세요.'
            : e.message
          : '등록하지 못했습니다.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn pri" disabled={academyId === null} onClick={openIt} title={academyId === null ? '지점을 먼저 선택하세요' : undefined}>
        <Icon name="plus" size={14} /> 관리자 직접 등록
      </button>
      {done && !open && (
        <Modal title="등록했습니다" hideCancel confirmLabel="확인" onConfirm={() => setDone(null)} onClose={() => setDone(null)}>
          <div className="note-box">
            <div>{done}</div>
          </div>
        </Modal>
      )}
      {open && (
        <Modal
          title="사유 신청 — 관리자 직접 등록"
          sub="학생이 앱에서 낸 것과 똑같이 승인 절차(학부모·담임)를 거칩니다. 바로 승인되지 않습니다."
          confirmLabel="등록"
          busy={busy}
          error={err}
          confirmDisabled={f.enrollmentId === '' || f.date === '' || (needStart && f.startTime === '') || (needEnd && f.endTime === '')}
          onConfirm={() => void submit()}
          onClose={() => setOpen(false)}
        >
          <div className="frow">
            <label className="req">학생</label>
            <select className="sel" value={f.enrollmentId} disabled={students === null} onChange={(e) => setF({ ...f, enrollmentId: e.target.value })}>
              <option value="">{students === null ? '불러오는 중…' : '학생 선택'}</option>
              {(students ?? []).map((st) => (
                <option key={st.enrollmentId} value={st.enrollmentId}>
                  {st.name} · {st.studentNo ?? '학번 없음'}
                  {st.className ? ` · ${st.className}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="frow">
            <label className="req">날짜</label>
            <input className="inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          <div className="frow">
            <label className="req">유형</label>
            <select className="sel" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as AbsenceType })}>
              {(Object.keys(ABSENCE_TYPE_LABEL) as AbsenceType[]).map((t) => (
                <option key={t} value={t}>
                  {ABSENCE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          {needStart && (
            <div className="frow">
              <label className="req">{needEnd ? '외출 시간' : '조퇴 시각'}</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="inp" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
                {needEnd && (
                  <>
                    <span>~</span>
                    <input className="inp" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
                  </>
                )}
              </div>
            </div>
          )}
          <div className="frow">
            <label>분류</label>
            <select className="sel" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              <option value="">선택 안 함</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="frow">
            <label>사유</label>
            <input className="inp" maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </div>
        </Modal>
      )}
    </>
  )
}

export const absenceMockup: Mockup = {
  Content,
  actions: (
    <>
      {/* 누가 승인하는지는 승인 라우팅 화면이 정한다 — 같은 설정을 두 곳에 두지 않는다 */}
      <Link className="btn" to="/s/approval" title="사유 신청을 누가 승인하는지 정합니다">
        <Icon name="settings" size={14} /> 승인 항목 설정
      </Link>
      <RegisterButton />
    </>
  ),
}
