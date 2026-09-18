import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { DataTable, Modal, addDaysStr, todayStr, type Column } from '../../components/common'
import {
  REQUEST_TYPE_CATEGORY,
  REQUEST_TYPE_LABEL,
  listApprovalBoard,
  listApprovalItems,
  saveApprovalItem,
  type ApprovalBoardRow,
  type ApprovalItem,
  type ApproverType,
} from '../../api/approvals'
import {
  UNLOCK_STATUS_LABEL,
  getViolations,
  listActiveUnlocks,
  listFirewallRequests,
  recordViolation,
  releaseRestriction,
  type FirewallRow,
  type ViolationSummary,
} from '../../api/firewall'
import type { Mockup } from './types'
import './matrix.css'
import '../../styles/forms.css'

/* F-4.11-5 승인 라우팅 관리 — 신규개발-요구사항신규
 *
 * Phase 1 사유 신청 관리(F-4.1-5)에서 임시로 쓰던 모델을 정식화한다.
 * 두 화면은 approval_items / approval_requests 스키마를 공유한다.
 *
 * ⚠ #32 / I-12 (높음) — 항목별 승인 주체 매트릭스 미확정. 방화벽 해제는 특히 미결.
 * ⚠ #40 / I-20 (중)  — 미응답 전환 응답시간·입학 시 승인자 사전지정, 클라이언트 미확약.
 *
 * ★ 화면 문구에서 개발자 용어를 걷어냈다(2026-09-18, CLAUDE.md 1-1). 아래가 옮겨온 근거다 —
 *   **지운 것이 아니라 여기로 옮긴 것이니 화면에 되돌리지 말 것.**
 *
 *   · 화면의 '미응답 시 전환' 은 서버 필드 `escalationApproverType`(= escalate_to) 이다.
 *     제한시간은 `timeoutMinutes`(= timeout_min) 다.
 *   · 승인 주체 3종은 서버 enum `ApproverType` = PARENT · TEACHER · AUTO.
 *   · 신청 유형 3종은 `RequestType` = ABSENCE_REASON · REGULAR_SCHEDULE · FIREWALL_UNLOCK.
 *     목업은 10종이었다(API_GAPS 9-2) — 화면에 코드를 병기해 두면 그 차이가 보였지만,
 *     그건 우리 사정이라 주석으로 내린다.
 *   · 흐름 5단계의 실제 동작 — ① 앱 신청 시 `approval_requests` 가 생성되고 상태는 대기
 *     ② `approverType = PARENT` 인 항목은 학부모에게 푸시 ③ `timeoutMinutes` 경과
 *     ④ `escalationApproverType`(대개 TEACHER) 으로 재라우팅 ⑤ 확정분이 출결·벌점에 반영. */

const APPROVERS: { key: ApproverType; label: string; cls: string; icon: string; desc: string }[] = [
  { key: 'PARENT', label: '학부모', cls: 'p-read', icon: 'users', desc: '앱 알림으로 승인' },
  { key: 'TEACHER', label: '담임', cls: 'p-own', icon: 'user-check', desc: '담당 반 교사가 승인' },
  { key: 'AUTO', label: '자동', cls: 'p-full', icon: 'zap', desc: '조건을 채우면 즉시 승인' },
]

const CAT_TONE: Record<string, string> = {
  출결: 'verified',
  생활: 'supplement',
  학습: 'brandnew',
  기타: 'verified',
}

/** 응답 제한시간 후보 — I-20(응답시간) 미확약이라 화면에서 고르게 한다 */
const TIMEOUT_CHOICES = [30, 60, 120, 240]

interface ApprovalItemSaveInput {
  approverType: ApproverType | null
  timeoutMinutes: number | null
  escalationApproverType: ApproverType | null
}


function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function localDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 끝나는 시각까지 남은 분. 이미 지났으면 0 — 음수를 그리면 "-3분" 이 된다 */
function minutesLeft(endAt: string | null): number {
  if (endAt === null) return 0
  return Math.max(0, Math.round((new Date(endAt).getTime() - Date.now()) / 60000))
}

/* ── 와이파이 해제 · 위반 (계획서 2-10) ──────────────────────────
 *
 * 승인·거절은 위 라우팅이 이미 처리한다. 여기는 **그 뒤**다 —
 * 지금 열려 있는 해제를 보고, 딴 짓하는 것을 적발해 남긴다.
 *
 * ★ 위반이 몇 번 쌓이면 제한이 걸리는지 **화면에 적지 않는다.** 지금은 2회에 2주지만
 *   운영팀이 정한 값이 아니라 바뀔 수 있다(2026-09-18). 서버가 주는 실제 값만 보여준다.
 */
function FirewallSection({ academyId }: { academyId: number | null }) {
  const [active, setActive] = useState<FirewallRow[]>([])
  const [recent, setRecent] = useState<FirewallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  /** 적발 확인 */
  const [confirm, setConfirm] = useState<FirewallRow | null>(null)
  /** 학생별 위반 이력 */
  const [detail, setDetail] = useState<{ row: FirewallRow; sum: ViolationSummary } | null>(null)

  const load = useCallback(async () => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [a, r] = await Promise.all([
        listActiveUnlocks(academyId),
        listFirewallRequests({ academyId }),
      ])
      setActive(a)
      setRecent(r)
      setErr(null)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '와이파이 해제 내역을 불러오지 못했습니다.')
      setActive([])
      setRecent([])
    } finally {
      setLoading(false)
    }
  }, [academyId])

  useEffect(() => {
    void load()
  }, [load])

  async function openDetail(row: FirewallRow) {
    setBusy(true)
    try {
      setDetail({ row, sum: await getViolations(row.enrollmentId) })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '위반 이력을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function doRecord(): Promise<boolean> {
    if (!confirm) return false
    setBusy(true)
    try {
      await recordViolation(confirm.enrollmentId, confirm.id)
      /* ★ 적발 직후 요약을 다시 읽는다. 이번 건으로 제한이 걸렸는지는 **서버만 안다** —
           화면이 횟수를 세어 판단하면 규칙이 바뀌는 날 조용히 틀린다 */
      const sum = await getViolations(confirm.enrollmentId)
      setNotice(
        sum.restrictedUntil !== null
          ? `${confirm.studentName} · 위반 ${sum.count}회로 ${localDate(sum.restrictedUntil)}까지 신청이 제한됩니다.`
          : `${confirm.studentName} · 위반 ${sum.count}회로 기록했습니다.`,
      )
      await load()
      return true
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '위반을 기록하지 못했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function doRelease(restrictionId: number, name: string) {
    setBusy(true)
    try {
      await releaseRestriction(restrictionId)
      setNotice(`${name} 의 신청 제한을 풀었습니다. 적발 기록은 남습니다.`)
      setDetail(null)
      await load()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '제한을 풀지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const ACTIVE_COLUMNS: Column<FirewallRow>[] = [
    { key: 'studentName', header: '학생', width: '96px', value: (r) => r.studentName },
    { key: 'studentNo', header: '학번', width: '104px', value: (r) => r.studentNo },
    { key: 'reason', header: '사유', value: (r) => r.reason },
    {
      key: 'left',
      header: '남은 시간',
      width: '96px',
      align: 'right',
      /* 서버가 종료 임박순으로 준다 — 화면에서 다시 세지 않고 끝나는 시각만 환산한다 */
      value: (r) => minutesLeft(r.unlockEndAt),
      render: (r) => {
        const m = minutesLeft(r.unlockEndAt)
        return <b style={{ color: m <= 5 ? 'var(--amber)' : 'var(--ink)' }}>{m}분</b>
      },
    },
    {
      key: 'act',
      header: '',
      width: '150px',
      align: 'center',
      value: () => '',
      render: (r) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <button
            className="btn"
            style={{ padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap', color: 'var(--red)' }}
            disabled={busy}
            onClick={() => setConfirm(r)}
          >
            위반 적발
          </button>
          <button
            className="btn"
            style={{ padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap' }}
            disabled={busy}
            onClick={() => void openDetail(r)}
          >
            이력
          </button>
        </div>
      ),
    },
  ]

  const RECENT_COLUMNS: Column<FirewallRow>[] = [
    { key: 'requestedAt', header: '신청', width: '128px', sortable: true, value: (r) => localDateTime(r.requestedAt) },
    { key: 'studentName', header: '학생', width: '92px', value: (r) => r.studentName },
    { key: 'requestedMinutes', header: '요청', width: '68px', align: 'right', value: (r) => `${r.requestedMinutes}분` },
    { key: 'reason', header: '사유', value: (r) => r.reason },
    {
      key: 'unlockStatus',
      header: '해제',
      width: '80px',
      align: 'center',
      /* ★ 승인 상태와 다른 축이다. 승인됐어도 시간이 지나면 해제는 끝난다 */
      value: (r) => UNLOCK_STATUS_LABEL[r.unlockStatus] ?? r.unlockStatus,
      render: (r) => (
        <span className={`mk ${r.unlockStatus === 'ACTIVE' ? 'brandnew' : ''}`}>
          {UNLOCK_STATUS_LABEL[r.unlockStatus] ?? r.unlockStatus}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      width: '150px',
      align: 'center',
      value: () => '',
      /* ★ 적발은 해제중인 건에만 달면 안 된다. 자리를 뜨고 나서 알게 되는 경우가 있고,
           그때는 이미 시간이 끝나 해제중 목록에서 사라진 뒤다 — 그러면 남길 방법이 없다 */
      render: (r) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <button
            className="btn"
            style={{ padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap', color: 'var(--red)' }}
            disabled={busy}
            onClick={() => setConfirm(r)}
          >
            위반 적발
          </button>
          <button
            className="btn"
            style={{ padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap' }}
            disabled={busy}
            onClick={() => void openDetail(r)}
          >
            이력
          </button>
        </div>
      ),
    },
  ]

  return (
    /* ★ 위가 `.split` 이고 그 안 카드는 margin-bottom: 0 이다 — 여백 없이 이어 붙이면
         바로 위 카드와 테두리가 맞닿아 한 덩어리로 보인다. 다른 섹션 간격(14px)에 맞춘다 */
    <div className="card-sec" style={{ marginTop: 14 }}>
      <div className="card-sec-h">
        <div className="t">
          <span className="ico">
            <Icon name="wifi" size={15} />
          </span>
          와이파이 해제 · 위반
        </div>
        <div className="r">
          <span className="mk brandnew">지금 해제중 {active.length}</span>
        </div>
      </div>
      <div className="card-sec-b">
        {err && (
          <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
            {err}
          </div>
        )}
        {notice && <div className="note-box">{notice}</div>}

        <div className="note-box">
          <div>
            신청과 승인은 위 라우팅이 처리합니다. 여기서는 <b>지금 열려 있는 해제</b>를 보고,
            인강 외 사용을 발견하면 <b>위반으로 남깁니다.</b> 위반이 쌓이면 서버가 신청 제한을 겁니다 —
            걸린 기간은 학생 이력에서 확인합니다.
          </div>
        </div>

        <DataTable
          columns={ACTIVE_COLUMNS}
          rows={active}
          rowKey={(r) => String(r.id)}
          masked={false}
          loading={loading}
          pageSize={8}
          countLabel={<>지금 해제중 <b>{active.length}</b>건</>}
          emptyText="지금 열려 있는 해제가 없습니다."
        />

        <div style={{ marginTop: 16 }}>
          <DataTable
            columns={RECENT_COLUMNS}
            rows={recent}
            rowKey={(r) => String(r.id)}
            masked={false}
            loading={loading}
            pageSize={8}
            countLabel={<>신청 이력 <b>{recent.length}</b>건</>}
            emptyText="신청 이력이 없습니다."
          />
        </div>
      </div>

      {confirm && (
        <Modal
          title={`${confirm.studentName} 을(를) 위반으로 남길까요?`}
          sub="해제를 받아놓고 인강 외 용도로 쓴 것을 기록합니다."
          confirmLabel="위반 기록"
          danger
          busy={busy}
          onConfirm={() => void doRecord().then((ok) => ok && setConfirm(null))}
          onClose={() => setConfirm(null)}
        >
          <div className="note-box">
            <div>
              {/* 임계치를 화면이 말하지 않는다 — 서버가 판단하고, 결과만 받아 적는다 */}
              위반이 쌓이면 <b>그 자리에서 신청 제한이 걸리고</b>, 지금 해제중이었다면 즉시 차단됩니다.
              <br />
              <b>적발 기록은 지울 수 없습니다.</b> 제한만 나중에 풀 수 있습니다.
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal
          wide
          title={`${detail.row.studentName} 위반 이력`}
          sub={`학번 ${detail.row.studentNo}`}
          hideCancel
          confirmLabel="닫기"
          onConfirm={() => setDetail(null)}
          onClose={() => setDetail(null)}
        >
          <div className="note-box" style={{ borderColor: detail.sum.restrictedUntil ? 'var(--red)' : undefined }}>
            <div>
              위반 <b>{detail.sum.count}회</b>
              {detail.sum.restrictedUntil === null ? (
                <> · 지금 걸린 제한은 없습니다.</>
              ) : (
                <>
                  {' '}
                  · <b>{localDateTime(detail.sum.restrictedUntil)}까지</b> 신청이 제한됩니다.
                </>
              )}
            </div>
          </div>

          {detail.sum.items.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>적발된 기록이 없습니다.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {detail.sum.items.map((v) => (
                <div
                  key={v.id}
                  style={{ display: 'flex', gap: 12, fontSize: 13, borderBottom: '1px solid var(--line)', padding: '6px 0' }}
                >
                  <span style={{ color: 'var(--muted)' }}>{localDateTime(v.occurredAt)}</span>
                  <span style={{ flex: 1 }}>인강 외 사용 적발</span>
                </div>
              ))}
            </div>
          )}

          {detail.sum.restrictionId !== null && (
            <div style={{ marginTop: 12 }}>
              <button
                className="btn"
                style={{ color: 'var(--red)' }}
                disabled={busy}
                onClick={() => void doRelease(detail.sum.restrictionId as number, detail.row.studentName)}
              >
                <Icon name="undo-2" size={14} /> 신청 제한 풀기
              </button>
              {/* 봐주는 버튼이 아니다 — 잘못 눌렀을 때 되돌리는 자리다 */}
              <div className="hint">잘못 적발한 경우에만 쓰세요. 적발 기록 자체는 남습니다.</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

function Content() {
  const { academyId } = useAcademy()
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [escalation, setEscalation] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const year = new Date().getFullYear()

  const load = useCallback(async () => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setItems(await listApprovalItems(academyId, year))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '승인 항목을 불러오지 못했습니다.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [academyId, year])

  useEffect(() => {
    void load()
  }, [load])

  // configured=false 는 "안 정했다"가 아니라 "그 신청이 거절된다"는 뜻이다
  const undecided = items.filter((i) => !i.configured).length

  /** 셀을 누르면 그 자리에서 저장한다. 매트릭스라 '저장' 버튼을 따로 누르게 하면
   *  무엇이 저장됐는지 알기 어렵다 */
  async function apply(item: ApprovalItem, patch: Partial<ApprovalItemSaveInput>) {
    if (academyId === null) return
    const approverType = patch.approverType ?? item.approverType
    if (!approverType) return // 승인 주체는 필수다

    setBusy(true)
    setNotice(null)
    try {
      await saveApprovalItem(item.requestType, {
        academyId,
        year,
        approverType,
        timeoutMinutes: patch.timeoutMinutes ?? item.timeoutMinutes ?? undefined,
        escalationApproverType:
          'escalationApproverType' in patch
            ? (patch.escalationApproverType ?? undefined)
            : (item.escalationApproverType ?? undefined),
      })
      await load()
      setNotice(`${REQUEST_TYPE_LABEL[item.requestType]} 설정을 저장했습니다.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-matrix">
      {/* 서버가 다루는 신청 유형이 3종뿐이다. 목업은 10종이었다 — docs/API_GAPS.md */}
      <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
        <div className="ic">
          <Icon name="triangle-alert" size={17} />
        </div>
        <div>
          <div className="tt">서버가 다루는 신청 유형은 3종입니다</div>
          <div className="tx">
            사유 신청 · 정기일정 · 방화벽 해제만 승인 대상입니다. 좌석 이탈·급식 취소·
            질의응답 예약 등은 <b>승인 대상이 아닙니다</b> — 각자 다른 방식으로 처리합니다.
            <b> 진행 중인 승인 요청은 담임 선생님 화면에서 봅니다.</b>
          </div>
        </div>
      </div>

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {notice && (
        <div className="note-box" role="status">
          <div className="ic">
            <Icon name="check" size={17} />
          </div>
          <div>
            <div className="tt">{notice}</div>
          </div>
        </div>
      )}

      <div className="stat-strip">
        {APPROVERS.map((a) => (
          <div className="stat" key={a.key}>
            <div className="l">
              <Icon name={a.icon} size={13} /> {a.label} 승인
            </div>
            <div className="v">{items.filter((i) => i.approverType === a.key).length}</div>
            {/* 예전에는 여기에 서버 코드(PARENT 등)를 모노스페이스로 찍었다 — 화면에 둘 말이 아니다 */}
            <div className="d">{a.desc}</div>
          </div>
        ))}
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 미결
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {undecided}
          </div>
          <div className="d down">신청이 거절됨</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="arrow-right" size={13} /> 미응답 시 전환
          </div>
          <div className="v">{items.filter((i) => i.escalationApproverType).length}</div>
          <div className="d warn">전환까지 기다리는 시간 미확정</div>
        </div>
      </div>

      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="route" size={15} />
            </span>
            승인 항목별 주체 설정
          </div>
          <div className="r">
            {/* ★ 켜고 끄는 버튼은 **지금 누르면 무엇이 되는지**를 써야 한다. 열이 이미 보이는데
                   '보기' 라고 쓰여 있으면 눌렀을 때 반대로 숨겨져서 고장으로 읽힌다 */}
            <button
              className={`chip${escalation ? ' on' : ''}`}
              title="미응답 시 전환 대상과 기다리는 시간 열을 보여주거나 감춥니다"
              onClick={() => setEscalation(!escalation)}
            >
              전환 열 {escalation ? '숨기기' : '보기'}
            </button>
            {/* 셀을 누르면 그 자리에서 저장된다. 매트릭스에서 '저장' 버튼을 따로 두면
                무엇이 저장됐는지 알기 어렵다 */}
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {busy ? '저장 중…' : loading ? '불러오는 중…' : '선택하면 바로 저장됩니다'}
            </span>
          </div>
        </div>
        <div className="card-sec-b">
          <div className="mx-scroll">
            <table className="mx">
              <thead>
                <tr>
                  <th className="area">신청 항목</th>
                  <th style={{ width: 90 }}>분류</th>
                  {/* 영문 코드(PARENT 등)는 뺐다 — 근거는 파일 상단 주석 */}
                  {APPROVERS.map((a) => (
                    <th key={a.key} style={{ width: 100 }}>
                      {a.label}
                    </th>
                  ))}
                  {escalation && (
                    <>
                      <th style={{ width: 118 }}>미응답 시 전환</th>
                      <th style={{ width: 110 }}>기다리는 시간</th>
                    </>
                  )}
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.requestType}>
                    <th className="area">{REQUEST_TYPE_LABEL[it.requestType]}</th>
                    <td>
                      <span className={`mk ${CAT_TONE[REQUEST_TYPE_CATEGORY[it.requestType]] ?? ''}`}>
                        {REQUEST_TYPE_CATEGORY[it.requestType]}
                      </span>
                    </td>
                    {APPROVERS.map((a) => (
                      <td key={a.key}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void apply(it, { approverType: a.key })}
                          className={`pm ${it.approverType === a.key ? a.cls : 'p-none'}`}
                          style={{ border: 'none', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}
                          title={`${REQUEST_TYPE_LABEL[it.requestType]} → ${a.label} 승인`}
                        >
                          {it.approverType === a.key ? '지정' : '—'}
                        </button>
                      </td>
                    ))}
                    {escalation && (
                      <>
                        <td>
                          <select
                            className="sel"
                            style={{ width: 104, padding: '4px 8px', fontSize: 11.5 }}
                            disabled={busy || !it.approverType}
                            value={it.escalationApproverType ?? ''}
                            onChange={(e) =>
                              void apply(it, {
                                escalationApproverType: e.target.value === '' ? null : (e.target.value as ApproverType),
                              })
                            }
                          >
                            {/* ★ 옵션에 '→' 를 붙이지 않는다. 열 제목이 이미 '미응답 시 전환' 이라
                                   같은 말을 두 번 하고, '없음' 에는 화살표가 없어 줄도 안 맞았다 */}
                            <option value="">없음</option>
                            {APPROVERS.map((a) => (
                              <option key={a.key} value={a.key}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="sel"
                            style={{ width: 96, padding: '4px 8px', fontSize: 11.5 }}
                            disabled={busy || !it.approverType}
                            value={it.timeoutMinutes ?? ''}
                            onChange={(e) =>
                              void apply(it, { timeoutMinutes: e.target.value === '' ? null : Number(e.target.value) })
                            }
                          >
                            <option value="">없음</option>
                            {TIMEOUT_CHOICES.map((m) => (
                              <option key={m} value={m}>
                                {m}분
                              </option>
                            ))}
                          </select>
                        </td>
                      </>
                    )}
                    <td style={{ textAlign: 'left', fontSize: 11.5, color: it.configured ? 'var(--muted)' : 'var(--red)' }}>
                      {it.configured
                        ? it.copiedFrom
                          ? '전년도에서 복사됨'
                          : '올해 설정'
                        : '미설정 — 이 신청은 거절됩니다'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mx-legend">
            <span>
              <span className="pm p-full">자동</span> 조건 충족 시 즉시 승인
            </span>
            <span>
              <span className="pm p-own">담임</span> 담당 반 교사
            </span>
            <span>
              <span className="pm p-read">학부모</span> 앱 알림 → 승인
            </span>
            <span style={{ color: 'var(--amber)', fontWeight: 700 }}>
              * 정해진 시간 안에 답이 없으면 다음 사람에게 자동으로 넘어갑니다
            </span>
          </div>
        </div>
      </div>

      <div className="split">
        <div className="card-sec" style={{ marginBottom: 0 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="arrow-right" size={15} />
              </span>
              승인이 넘어가는 순서
            </div>
          </div>
          <div className="card-sec-b">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                /* 코드·테이블 이름은 파일 상단 주석으로 내렸다(CLAUDE.md 1-1) */
                { n: 1, t: '학생이 앱에서 신청', d: '승인 대기 상태로 접수됩니다', c: 'var(--mint)' },
                { n: 2, t: '학부모에게 알림', d: '학부모가 승인하도록 정한 항목만', c: 'var(--blue)' },
                { n: 3, t: '정해진 시간이 지나면', d: '학부모가 답하지 않은 경우입니다', c: 'var(--amber)' },
                { n: 4, t: '담임에게 넘어감', d: '항목마다 넘길 사람을 정해둡니다', c: 'var(--violet)' },
                { n: 5, t: '승인 또는 반려', d: '출결·상벌점에 반영됩니다', c: 'var(--green)' },
              ].map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: s.c,
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {s.n}
                  </span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.t}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-sec" style={{ marginBottom: 0 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="settings" size={15} />
              </span>
              기본 정책
            </div>
          </div>
          {/* ★ '승인 대기 UI (시안 1/2)' 줄은 지웠다. 정적 HTML 시안을 옮길 때 딸려 온
                 **작업 흔적**이라 제품에 있을 이유가 없었다 — 클라이언트에게 '시안' 을 고르게
                 하는 칸이었다(2026-09-18).
             ★ 남은 셋은 **진짜 설정인데 저장할 서버 경로가 없다.** 지우면 "원래 없던 설정" 이
                 되어 백엔드에 요청할 것이 조용히 사라지므로(CLAUDE.md 1) 남겨두고 막는다.
                 값을 바꿀 수 있는 것처럼 두면 바꿔놓고 저장된 줄 안다. */}
          <div className="card-sec-b">
            <div className="note-box">
              <div>
                아래 값은 <b>아직 저장되지 않습니다.</b> 지금 동작하는 기준은 왼쪽 표의 항목별
                설정이고, 여기 정책은 준비되는 대로 열립니다.
              </div>
            </div>

            <div className="frow">
              <label>기본 응답 제한</label>
              <div className="two">
                <input className="inp" type="number" defaultValue={120} disabled data-soon title="준비 중입니다" />
                <select className="sel" disabled data-soon title="준비 중입니다">
                  <option>분</option>
                  <option>시간</option>
                </select>
              </div>
            </div>
            <div className="frow">
              <label>승인자 사전지정</label>
              <div style={{ paddingTop: 9 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)' }}>
                  <input type="checkbox" disabled data-soon title="준비 중입니다" />
                  입학 시 학부모 승인자를 미리 지정
                </label>
              </div>
            </div>
            <div className="frow">
              <label>벌점 연계</label>
              <div style={{ paddingTop: 9 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)' }}>
                  <input type="checkbox" defaultChecked disabled data-soon title="준비 중입니다" />
                  벌점 확정 후에는 사유 승인 불가
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <FirewallSection academyId={academyId} />
    </div>
  )
}


/* ── 승인 이력 ──────────────────────────────────────────────────────────────
 *
 * ★ 버튼이 화면 본문 밖(`Mockup.actions`)에 있어서 Content 의 상태를 못 쓴다. 지점은
 *   컨텍스트라 여기서도 읽히므로 작은 컴포넌트로 따로 둔다.
 * ★ 조회 경로가 `/approvals` 가 아니라 **`/approvals/board`** 다. `/approvals` 는
 *   `hasRole('TEACHER')` 라 "내가 담당인 대기 목록"이고 관리자는 못 본다.
 */

const STATUS_LABEL: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
  TIMEOUT: '시간 초과',
}

const STATUS_TONE: Record<string, string> = {
  APPROVED: 'verified',
  REJECTED: 'brandnew',
  PENDING: 'supplement',
}

/** UTC instant → 한국 시각 `MM-DD HH:mm`. 문자열을 자르면 날짜가 하루 밀린다 */
function atLabel(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const HISTORY_COLUMNS: Column<ApprovalBoardRow>[] = [
  { key: 'requestedAt', header: '신청', width: '104px', value: (r) => atLabel(r.requestedAt) },
  { key: 'studentName', header: '학생', width: '86px', mask: 'name', value: (r) => r.studentName },
  {
    key: 'requestType',
    header: '유형',
    width: '190px',
    value: (r) => REQUEST_TYPE_LABEL[r.requestType] ?? r.requestType,
  },
  {
    key: 'status',
    header: '결과',
    width: '78px',
    align: 'center',
    value: (r) => STATUS_LABEL[r.status] ?? r.status,
    render: (r) => (
      <span className={`mk ${STATUS_TONE[r.status] ?? ''}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
    ),
  },
  { key: 'resolvedAt', header: '처리', width: '104px', value: (r) => atLabel(r.resolvedAt) },
  {
    key: 'rejectReason',
    header: '반려 사유',
    value: (r) => r.rejectReason ?? '',
    render: (r) =>
      r.rejectReason ? <>{r.rejectReason}</> : <span style={{ color: 'var(--muted)' }}>-</span>,
  },
]

function HistoryButton() {
  const { academyId } = useAcademy()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ApprovalBoardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open || academyId === null) return
    let alive = true
    setLoading(true)
    setErr(null)
    /* 기본 30일. 기간을 안 주면 서버가 전체를 훑어 느려지고, 이력은 최근 것부터 본다 */
    listApprovalBoard({ academyId, from: addDaysStr(todayStr(), -30), to: todayStr() })
      .then((v) => alive && setRows(v.rows))
      .catch((e) => alive && setErr(e instanceof ApiError ? e.message : '승인 이력을 불러오지 못했습니다.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open, academyId])

  return (
    <>
      <button
        className="btn"
        disabled={academyId === null}
        title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
        onClick={() => setOpen(true)}
      >
        <Icon name="history" size={14} /> 승인 이력
      </button>

      {open && (
        <Modal
          title="승인 이력"
          sub="최근 30일"
          confirmLabel="닫기"
          /* 조회만 하는 모달이라 '취소'를 감춘다 — 되돌릴 것이 없다 */
          hideCancel
          /* 폭은 모달이 정한다. 안쪽에 minWidth 를 박으면 바깥 .mo 가 440px 에 묶여 있어
             내용이 잘린다 — 특강 상세에서 실제로 그렇게 잘려 있었다(2026-09-14) */
          wide
          onConfirm={() => setOpen(false)}
          onClose={() => setOpen(false)}
        >
          <div>
            <DataTable
              columns={HISTORY_COLUMNS}
              rows={rows}
              rowKey={(r) => String(r.id)}
              loading={loading}
              pageSize={10}
              countLabel={<>최근 30일 <b>{rows.length}</b>건</>}
              emptyText={err ?? '최근 30일에 처리된 승인이 없습니다.'}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

export const approvalMockup: Mockup = {
  Content,
  actions: (
    <>
      <HistoryButton />
    </>
  ),
}
