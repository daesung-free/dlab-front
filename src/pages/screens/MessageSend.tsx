import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Unfilled, type Column, Modal } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import {
  CHANNEL_LABEL,
  EVENT_LABEL,
  RECIPIENT_LABEL,
  REVIEW_STATUS_LABEL,
  listNotificationTemplates,
  recordTemplateReviewResult,
  setTemplateActive,
  submitTemplateReview,
  templateVars,
  updateTemplateContent,
  type NotificationTemplate,
} from '../../api/notifications'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.4 알림 발송 — 신규개발-요구사항보완
 *
 * SMS(문자) 발송은 제외한다. 발송 채널은 카카오 알림톡 + FCM 푸시 2종뿐이다.
 *
 * ⚠ SMS를 빼면서 생기는 제약 — 화면이 이걸 드러내야 한다.
 *   알림톡은 사전 승인된 템플릿 문안만 보낼 수 있다. 자유 문안은 알림톡으로 못 나간다.
 *   따라서 자유 문안 발송 수단은 FCM 푸시 하나뿐이고, 그 결과
 *   "앱 미설치 + 템플릿에 없는 내용" 조합은 발송 수단이 존재하지 않는다.
 *   → 공지성 자유 문안은 템플릿으로 사전 등록해 두는 운영이 전제된다.
 *
 * ⚠ #19 / E-5 (최우선) — 알림톡 발신프로필·템플릿 사전승인. 승인 전에는 실발송 불가.
 *
 * ── 연동 범위 ──────────────────────────────────────────────
 * **'템플릿 관리' 탭만 실연동이다.** 서버에 있는 건 템플릿뿐이고,
 * **발송 자체와 발송 이력은 API가 없다**(API_GAPS 15부). 나머지 두 탭은 목업이다.
 *
 * ★ 템플릿은 **이벤트당 하나**다. 이벤트가 사실상 기본키라 같은 이벤트로 또 만들면 409 다.
 *   그래서 수동 발송 전용 템플릿이라는 것이 서버에는 없다 — 전부 이벤트 트리거다.
 *
 * ★ **발송 여부는 세 축이 모두 통과해야 한다**(활성·문구확정·심사). 서버가 `sendable`
 *   하나로 합쳐 주므로 화면은 그걸 쓴다. 심사 배지만 보면 "승인인데 왜 안 나가지"가 된다.
 *
 * ★ **승인된 알림톡 문구를 고치면 심사가 미제출로 되돌아간다**(실측 확인). 카카오가
 *   승인받은 문안 그대로만 허용해서다. 저장 전에 사용자에게 알린다. */

type Channel = 'ALIMTALK' | 'FCM'

const CHANNEL_META: Record<Channel, { label: string; desc: string; cls: string; icon: string }> = {
  ALIMTALK: {
    label: '카카오 알림톡',
    desc: '학부모 대상 · 사전 승인된 템플릿 문안만 발송 가능',
    cls: 'verified',
    icon: 'message-circle',
  },
  FCM: { label: 'FCM 푸시', desc: '학생 앱 설치자 대상 · 자유 문안 가능', cls: 'supplement', icon: 'smartphone' },
}

/* ── 템플릿 마스터 ── */

type ReviewStatus = '승인' | '심사대기' | '반려' | '해당없음'

interface Template {
  id: string
  /** 발송 API가 참조하는 코드 — 운영 중 이름이 바뀌어도 이 값은 고정 */
  code: string
  name: string
  channel: Channel
  /** 자동발송 트리거. 없으면 수동 발송 전용 */
  trigger?: string
  status: ReviewStatus
  body: string
  vars: string[]
  updatedAt: string
  updatedBy: string
}

const TEMPLATES: Template[] = [
  {
    id: 't1',
    code: 'ALT_ARRIVE',
    name: '등원 확인',
    channel: 'ALIMTALK',
    trigger: 'ATTENDANCE_ON_TIME',
    status: '승인',
    body: '[D.Lab] {학생명} 학생이 {시각}에 등원했습니다.',
    vars: ['학생명', '시각'],
    updatedAt: '2026-04-18',
    updatedBy: '본사',
  },
  {
    id: 't2',
    code: 'ALT_LATE',
    name: '지각 안내',
    channel: 'ALIMTALK',
    trigger: 'ATTENDANCE_LATE',
    status: '승인',
    body: '[D.Lab] {학생명} 학생이 {시각}에 지각 등원했습니다. 사유가 있으시면 회신 부탁드립니다.',
    vars: ['학생명', '시각'],
    updatedAt: '2026-04-18',
    updatedBy: '본사',
  },
  {
    id: 't3',
    code: 'ALT_ABSENT',
    name: '결석 안내',
    channel: 'ALIMTALK',
    trigger: 'ATTENDANCE_ABSENT',
    status: '심사대기',
    body: '[D.Lab] {학생명} 학생이 금일 미등원 상태입니다. 확인 부탁드립니다.',
    vars: ['학생명'],
    updatedAt: '2026-05-20',
    updatedBy: '본사',
  },
  {
    id: 't4',
    code: 'ALT_WAITLIST',
    name: '대기자 순번 안내',
    channel: 'ALIMTALK',
    trigger: 'WAITLIST_TURN',
    status: '심사대기',
    body: '[D.Lab] {학생명} 학생 등록이 가능합니다. {일자} {시각}까지 방문해 주세요.',
    vars: ['학생명', '일자', '시각'],
    updatedAt: '2026-05-22',
    updatedBy: '최지원',
  },
  {
    id: 't5',
    code: 'ALT_MEAL_DEADLINE',
    name: '급식 신청 마감 안내',
    channel: 'ALIMTALK',
    trigger: 'MEAL_DEADLINE',
    status: '반려',
    body: '[D.Lab] {일자} 급식 신청이 마감됩니다. 앱에서 신청해 주세요.',
    vars: ['일자'],
    updatedAt: '2026-05-24',
    updatedBy: '행정팀',
  },
  {
    id: 't6',
    code: 'PUSH_SCORE',
    name: '성적 리포트 등록',
    channel: 'FCM',
    trigger: 'SCORE_PUBLISHED',
    status: '해당없음',
    body: '{회차} 성적 리포트가 등록되었습니다. 앱에서 확인하세요.',
    vars: ['회차'],
    updatedAt: '2026-05-11',
    updatedBy: '이장원',
  },
  {
    id: 't7',
    code: 'PUSH_PLAN',
    name: '학습계획 미작성 알림',
    channel: 'FCM',
    trigger: 'PLAN_MISSING',
    status: '해당없음',
    body: '{반} 주간 학습계획이 아직 작성되지 않았습니다.',
    vars: ['반'],
    updatedAt: '2026-05-11',
    updatedBy: '이장원',
  },
  {
    id: 't8',
    code: 'PUSH_FREE',
    name: '직접 입력 (자유 문안)',
    channel: 'FCM',
    status: '해당없음',
    body: '',
    vars: ['학생명', '반', '일자', '시각'],
    updatedAt: '2026-05-02',
    updatedBy: '본사',
  },
]

const SAMPLE: Record<string, string> = {
  학생명: '이승민',
  시각: '08:12',
  일자: '2026-05-29',
  반: '3반',
  회차: '5월 학력평가',
  학번: '2026-0001',
}

/** 변수 자리를 예시값으로 치환한 미리보기 */
function preview(body: string): string {
  return body.replace(/\{([^}]+)\}/g, (m, k: string) => SAMPLE[k] ?? m)
}

/* ── 실연동 템플릿 컬럼. 목업 컬럼 구성을 그대로 따르고 서버에 없는 둘만 <Unfilled/> 다 ── */

const API_TEMPLATE_COLUMNS: Column<NotificationTemplate>[] = [
  {
    key: 'event',
    header: '코드',
    width: '190px',
    sortable: true,
    value: (r) => r.event,
    render: (_r, v) => <code style={{ fontSize: 10.5 }}>{v}</code>,
  },
  { key: 'name', header: '템플릿명', width: '140px', sortable: true, value: (r) => EVENT_LABEL[r.event] ?? r.event },
  {
    key: 'channel',
    header: '채널',
    width: '110px',
    align: 'center',
    sortable: true,
    value: (r) => CHANNEL_LABEL[r.channel] ?? r.channel,
    render: (r) => (
      <span className={`mk ${r.channel === 'KAKAO_ALIMTALK' ? 'verified' : 'supplement'}`}>
        {CHANNEL_LABEL[r.channel] ?? r.channel}
      </span>
    ),
  },
  {
    key: 'trigger',
    header: '자동발송 트리거',
    width: '150px',
    // 서버 템플릿은 전부 이벤트에 묶여 있다 — 수동 발송 전용이라는 것이 없다
    value: (r) => RECIPIENT_LABEL[r.recipientType] ?? r.recipientType,
    render: (r) => (
      <span style={{ fontSize: 11.5 }}>
        수신 {RECIPIENT_LABEL[r.recipientType] ?? r.recipientType}
      </span>
    ),
  },
  {
    key: 'status',
    header: '알림톡 심사',
    width: '104px',
    align: 'center',
    sortable: true,
    value: (r) => REVIEW_STATUS_LABEL[r.reviewStatus] ?? r.reviewStatus,
    render: (r) =>
      r.reviewStatus === 'NOT_REQUIRED' ? (
        <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>-</span>
      ) : (
        <span className={`mk ${REVIEW_TONE_BY_STATUS[r.reviewStatus] ?? 'supplement'}`}>
          {REVIEW_STATUS_LABEL[r.reviewStatus] ?? r.reviewStatus}
        </span>
      ),
  },
  {
    key: 'sendable',
    header: '발송',
    width: '92px',
    align: 'center',
    sortable: true,
    // 심사만 보면 "승인인데 왜 안 나가지"가 된다 — 활성·문구확정까지 합친 값이다
    value: (r) => (r.sendable ? '나감' : '안 나감'),
    render: (r) =>
      r.sendable ? (
        <span className="mk verified">나감</span>
      ) : (
        <span className="mk brandnew" title={blockedReason(r)}>
          안 나감
        </span>
      ),
  },
  {
    key: 'updatedAt',
    header: '최종 수정',
    width: '100px',
    align: 'center',
    value: () => '',
    render: () => <Unfilled reason="템플릿 수정 시각이 응답에 없다" />,
  },
  {
    key: 'updatedBy',
    header: '수정자',
    width: '80px',
    value: () => '',
    render: () => <Unfilled reason="템플릿 수정자가 응답에 없다" />,
  },
]

const REVIEW_TONE_BY_STATUS: Record<string, string> = {
  APPROVED: 'verified',
  SUBMITTED: 'supplement',
  REJECTED: 'brandnew',
  DRAFT: 'supplement',
  NOT_REQUIRED: 'supplement',
}

/** 왜 안 나가는지 — 세 축 중 막힌 것을 그대로 알려준다 */
function blockedReason(t: NotificationTemplate): string {
  const why: string[] = []
  if (!t.active) why.push('사용 안 함')
  if (!t.contentConfirmed) why.push('문구 미확정')
  if (t.reviewStatus === 'DRAFT') why.push('심사 미제출')
  if (t.reviewStatus === 'SUBMITTED') why.push('심사 대기')
  if (t.reviewStatus === 'REJECTED') why.push('심사 반려')
  return why.length > 0 ? why.join(' · ') : '발송 조건 미충족'
}

/* ── 발송 이력 ── */

interface SendLog {
  id: string
  sentAt: string
  template: string
  channel: Channel
  scope: string
  targets: number
  success: number
  by: string
}

const LOGS: SendLog[] = [
  { id: 'l1', sentAt: '2026-05-28 08:12', template: '등원 확인', channel: 'ALIMTALK', scope: '출결 자동', targets: 271, success: 269, by: '시스템' },
  { id: 'l2', sentAt: '2026-05-28 09:34', template: '지각 안내', channel: 'ALIMTALK', scope: '출결 자동', targets: 14, success: 14, by: '시스템' },
  { id: 'l3', sentAt: '2026-05-27 18:00', template: '성적 리포트 등록', channel: 'FCM', scope: '전체', targets: 296, success: 288, by: '이장원' },
  { id: 'l4', sentAt: '2026-05-27 11:20', template: '직접 입력 (자유 문안)', channel: 'FCM', scope: '3반', targets: 42, success: 39, by: '김유진' },
  { id: 'l5', sentAt: '2026-05-26 16:45', template: '대기자 순번 안내', channel: 'ALIMTALK', scope: '개별', targets: 7, success: 6, by: '최지원' },
  { id: 'l6', sentAt: '2026-05-26 08:11', template: '등원 확인', channel: 'ALIMTALK', scope: '출결 자동', targets: 268, success: 268, by: '시스템' },
]

const LOG_COLUMNS: Column<SendLog>[] = [
  { key: 'sentAt', header: '발송일시', width: '140px', sortable: true, value: (r) => r.sentAt },
  { key: 'template', header: '템플릿', width: '176px', value: (r) => r.template },
  {
    key: 'channel',
    header: '채널',
    width: '120px',
    align: 'center',
    value: (r) => CHANNEL_META[r.channel].label,
    render: (r) => <span className={`mk ${CHANNEL_META[r.channel].cls}`}>{CHANNEL_META[r.channel].label}</span>,
  },
  { key: 'scope', header: '범위', width: '90px', align: 'center', value: (r) => r.scope },
  { key: 'targets', header: '대상', width: '72px', align: 'right', sortable: true, value: (r) => r.targets },
  {
    key: 'success',
    header: '성공',
    width: '110px',
    align: 'right',
    value: (r) => r.success,
    render: (r) => (
      <span style={{ color: r.success === r.targets ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
        {r.success}
        {r.success !== r.targets && ` (-${r.targets - r.success})`}
      </span>
    ),
  },
  { key: 'by', header: '발송자', width: '84px', value: (r) => r.by },
]

const SCOPES = [
  { key: 'ALL', label: '전체', desc: '본사 관리자만', count: MOCK_STUDENTS.length },
  { key: 'BRANCH', label: '지점', desc: '지점 관리자', count: 17 },
  { key: 'CLASS', label: '반', desc: '담임', count: 12 },
  { key: 'INDIVIDUAL', label: '개별', desc: '전체 권한', count: 1 },
]

function Content() {
  const [tab, setTab] = useState('send')

  /* 발송 탭 */
  const [scope, setScope] = useState('CLASS')
  const [template, setTemplate] = useState<Template>(TEMPLATES[1])
  const [reserve, setReserve] = useState(false)

  /* 템플릿 관리 탭 — 여기만 실연동이다 */
  const [rows, setRows] = useState<NotificationTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  /** 승인된 문안을 고칠 때 한 번 더 묻는다 — 심사가 미제출로 되돌아간다 */
  const [reconfirm, setReconfirm] = useState<number | null>(null)
  /** 카카오 템플릿 코드 입력 */
  const [codeInput, setCodeInput] = useState<{ id: number; code: string } | null>(null)
  /** 심사 반려 사유 기록 */
  const [rejectNote, setRejectNote] = useState<{ id: number; note: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listNotificationTemplates()
      setRows(list)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '템플릿을 불러오지 못했습니다.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const picked = rows.find((r) => r.id === pickedId) ?? null

  /* 목록을 다시 불러오면 편집 중이던 문구가 서버 값으로 덮이면 안 되므로,
     행을 고를 때만 초안을 채운다 */
  function pickApiTemplate(t: NotificationTemplate) {
    setPickedId(t.id)
    setTitle(t.titleTemplate ?? '')
    setBody(t.bodyTemplate ?? '')
    setNotice(null)
  }

  /** 저장·심사 조작을 한 곳에서 감싼다 — 결과 메시지를 빠뜨리지 않기 위해 */
  async function run(what: string, fn: () => Promise<NotificationTemplate>) {
    setBusy(true)
    try {
      const next = await fn()
      setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))
      setTitle(next.titleTemplate ?? '')
      setBody(next.bodyTemplate ?? '')
      setNotice(
        next.sendable
          ? `${what} 완료 — 지금 발송됩니다.`
          : `${what} 완료 — 아직 발송되지 않습니다 (${blockedReason(next)}).`,
      )
    } catch (err) {
      setNotice(err instanceof ApiError ? `${what} 실패 — ${err.message}` : `${what}에 실패했습니다.`)
    } finally {
      setBusy(false)
    }
  }

  const target = SCOPES.find((s) => s.key === scope)!
  const channel = template.channel

  /* 알림톡은 승인된 템플릿만 나간다 — 심사가 안 끝났으면 발송 버튼을 막는다 */
  const blocked = channel === 'ALIMTALK' && template.status !== '승인'

  // 통계는 실제 템플릿 기준이다. 발송 탭이 목업이어도 이 숫자는 서버 값이어야 한다
  const counts = useMemo(
    () => ({
      alimtalk: rows.filter((t) => t.channel === 'KAKAO_ALIMTALK').length,
      approved: rows.filter((t) => t.reviewStatus === 'APPROVED').length,
      waiting: rows.filter((t) => t.reviewStatus === 'SUBMITTED').length,
      rejected: rows.filter((t) => t.reviewStatus === 'REJECTED').length,
      sendable: rows.filter((t) => t.sendable).length,
    }),
    [rows],
  )


  return (
    <>
      {reconfirm !== null && (
        <Modal
          title="승인받은 문안입니다"
          sub="고치면 심사를 다시 받아야 하고, 그때까지 이 알림은 나가지 않습니다."
          confirmLabel="저장하고 재심사"
          danger
          busy={busy}
          onConfirm={() => {
            const id = reconfirm
            setReconfirm(null)
            void run('문안 확정', () =>
              updateTemplateContent(id, { titleTemplate: title, bodyTemplate: body, contentConfirmed: true }),
            )
          }}
          onClose={() => setReconfirm(null)}
        />
      )}

      {codeInput && (
        <Modal
          title="카카오 템플릿 코드"
          sub="카카오에 등록할 때 받은 코드를 그대로 넣으세요."
          confirmLabel="심사 제출"
          busy={busy}
          confirmDisabled={codeInput.code.trim() === ''}
          onConfirm={() => {
            const c = codeInput
            setCodeInput(null)
            void run('심사 제출', () => submitTemplateReview(c.id, c.code.trim()))
          }}
          onClose={() => setCodeInput(null)}
        >
          <div className="frow">
            <label className="req">코드</label>
            <input
              className="inp"
              value={codeInput.code}
              maxLength={40}
              onChange={(e) => setCodeInput({ ...codeInput, code: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {rejectNote && (
        <Modal
          title="심사 반려 기록"
          sub="카카오가 알려준 반려 사유를 적어 두면 다음에 고칠 때 참고할 수 있습니다."
          confirmLabel="기록"
          busy={busy}
          onConfirm={() => {
            const r = rejectNote
            setRejectNote(null)
            void run('심사 반려 기록', () =>
              recordTemplateReviewResult(r.id, false, r.note.trim() || undefined),
            )
          }}
          onClose={() => setRejectNote(null)}
        >
          <div className="frow">
            <label>사유</label>
            <textarea
              className="ta"
              value={rejectNote.note}
              maxLength={200}
              onChange={(e) => setRejectNote({ ...rejectNote, note: e.target.value })}
            />
          </div>
        </Modal>
      )}

      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="file-text" size={13} /> 등록 템플릿
          </div>
          <div className="v">{rows.length}</div>
          <div className="d">알림톡 {counts.alimtalk} · 푸시 {rows.length - counts.alimtalk}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="check-check" size={13} /> 심사 승인
          </div>
          <div className="v" style={{ color: 'var(--green)' }}>
            {counts.approved}
          </div>
          <div className="d up">즉시 발송 가능</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="clock" size={13} /> 심사 대기
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {counts.waiting}
          </div>
          <div className="d warn">승인 전 발송 불가</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 반려
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {counts.rejected}
          </div>
          <div className="d down">문안 수정 후 재제출</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="zap" size={13} /> 발송 중
          </div>
          {/* 심사만 보면 "승인인데 왜 안 나가지"가 된다 — 세 축을 합친 값이다 */}
          <div className="v" style={{ color: counts.sendable > 0 ? 'var(--green)' : 'var(--red)' }}>
            {counts.sendable}
          </div>
          <div className="d">활성 · 문구확정 · 심사 통과</div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'send', label: '메시지 발송' },
          { key: 'tpl', label: '템플릿 관리', count: rows.length },
          { key: 'log', label: '발송 이력', count: LOGS.length },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {/* ═══ 메시지 발송 ═══ */}
      {/* 발송·이력은 서버에 대응 API가 없다. 화면은 그대로 두되 예시임을 밝힌다 */}
      {(tab === 'send' || tab === 'log') && (
        <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
          <div className="ic">
            <Icon name="triangle-alert" size={17} />
          </div>
          <div>
            <div className="tt">아래 내용은 예시입니다 — 실제로 발송되거나 기록되지 않습니다</div>
            <div className="tx">
              지금 연결된 것은 <b>템플릿 관리</b>뿐입니다. 알림은 등원·승인·상담 같은 사건이 일어날 때
              <b> 자동으로</b> 나가고, 사람이 직접 골라 보내는 기능과 발송 기록은 아직 준비되지 않았습니다.
            </div>
          </div>
        </div>
      )}

      {tab === 'send' && (
        <div className="split-3-2">
          <div className="card-sec">
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="send" size={15} />
                </span>
                메시지 발송
              </div>
              <div className="r">
                <span className="mk supplement">대상 {target.count.toLocaleString()}명</span>
              </div>
            </div>
            <div className="card-sec-b">
              <div className="frow">
                <label className="req">발송 범위</label>
                <div className="type-picks">
                  {SCOPES.map((s) => (
                    <button
                      type="button"
                      key={s.key}
                      className={`type-pick${scope === s.key ? ' on' : ''}`}
                      onClick={() => setScope(s.key)}
                      title={`발송 권한: ${s.desc}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="frow">
                <label>권한</label>
                <div style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 9 }}>
                  <code style={{ fontSize: 11 }}>scope: {scope}</code> — 발송 권한 <b>{target.desc}</b>
                  {' · '}전체=본사 / 지점=지점관리자 / 반=담임
                </div>
              </div>

              <div className="frow">
                <label className="req">템플릿</label>
                <select
                  className="sel"
                  value={template.id}
                  onChange={(e) => setTemplate(TEMPLATES.find((t) => t.id === e.target.value)!)}
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {CHANNEL_META[t.channel].label}
                      {t.trigger ? ' (자동발송)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="frow">
                <label>채널</label>
                <div style={{ paddingTop: 8 }}>
                  <span className={`mk ${CHANNEL_META[channel].cls}`}>
                    <Icon name={CHANNEL_META[channel].icon} size={11} /> {CHANNEL_META[channel].label}
                  </span>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                    채널은 템플릿에 고정돼 있습니다. {CHANNEL_META[channel].desc}
                  </div>
                </div>
              </div>

              {template.trigger && (
                <div className="frow">
                  <label>자동발송</label>
                  <div className="link-box">
                    <div className="chk">
                      <Icon name="zap" size={12} />
                    </div>
                    <div>
                      <code style={{ fontSize: 11 }}>{template.trigger}</code> 이벤트에 연동된{' '}
                      <b>자동발송 템플릿</b>입니다. 수동 발송 시에도 같은 문안이 나가며, 문구 수정은{' '}
                      <b>템플릿 관리</b> 탭에서 합니다.
                    </div>
                  </div>
                </div>
              )}

              <div className="frow">
                <label className="req">내용</label>
                <div>
                  <textarea
                    className="ta"
                    value={template.body}
                    readOnly={channel === 'ALIMTALK'}
                    placeholder="발송할 내용을 입력하세요."
                    onChange={(e) => setTemplate({ ...template, body: e.target.value })}
                  />
                  {channel === 'ALIMTALK' && (
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                      알림톡은 <b>승인된 문안만</b> 발송됩니다. 여기서는 수정할 수 없고 템플릿 관리에서 고친 뒤 재심사를
                      받아야 합니다.
                    </div>
                  )}
                </div>
              </div>

              <div className="frow">
                <label>예약 발송</label>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, paddingTop: 9 }}>
                    <input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} />
                    지정한 시각에 발송
                  </label>
                  {reserve && (
                    <div className="two" style={{ marginTop: 8 }}>
                      <input className="inp" type="date" defaultValue="2026-05-29" />
                      <input className="inp" type="time" defaultValue="08:00" />
                    </div>
                  )}
                </div>
              </div>

              <div className="frow">
                <label>&nbsp;</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn pri" disabled={blocked}>
                    <Icon name="send" size={14} /> {target.count.toLocaleString()}명에게 발송
                  </button>
                  <button className="btn" disabled title="준비 중입니다">테스트 발송</button>
                  {blocked && (
                    <span style={{ fontSize: 11.5, color: 'var(--red)', fontWeight: 700 }}>
                      심사 {template.status} 상태라 실발송할 수 없습니다
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card-sec">
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="monitor" size={15} />
                </span>
                발송 미리보기
              </div>
            </div>
            <div className="card-sec-b">
              <div
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                  padding: 14,
                  background: channel === 'ALIMTALK' ? '#fef7d4' : 'var(--bg)',
                  minHeight: 120,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                  <Icon name={CHANNEL_META[channel].icon} size={14} />
                  <b style={{ fontSize: 12 }}>{CHANNEL_META[channel].label}</b>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>
                    {channel === 'ALIMTALK' ? '학부모 수신' : '학생 앱 수신'}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
                  {preview(template.body) || <span style={{ color: 'var(--muted)' }}>내용을 입력하세요.</span>}
                </div>
              </div>

              <div className="note-box warn" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="ic">
                  <Icon name="info" size={17} />
                </div>
                <div>
                  <div className="tt">SMS 발송은 제공하지 않습니다</div>
                  <div className="tx">
                    발송 채널은 <b>알림톡 · 푸시 2종</b>입니다. 알림톡은 승인 문안만 나가므로 <b>자유 문안은 푸시로만</b>{' '}
                    발송됩니다. 즉 <b>앱 미설치 학생에게 템플릿에 없는 내용</b>을 보낼 수단은 없으므로, 공지성 문안은
                    템플릿으로 미리 등록해 두는 운영이 필요합니다.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 템플릿 관리 — 이 탭만 실연동이다 ═══ */}
      {tab === 'tpl' && (
        <div className="split-3-2">
          <div>
            {loadError && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {loadError}
              </div>
            )}
            <DataTable
              columns={API_TEMPLATE_COLUMNS}
              rows={rows}
              rowKey={(r) => String(r.id)}
              masked={false}
              loading={loading}
              pageSize={10}
              onRowClick={pickApiTemplate}
              countLabel={
                <>
                  템플릿 <b>{rows.length}</b>건 · 발송 중 <b>{counts.sendable}</b>건 · 행을 누르면 편집합니다
                </>
              }
              toolbar={
                <>
                  {/* 서버는 템플릿을 이벤트당 하나만 둔다. 11개 이벤트가 이미 다 차 있어
                      새로 만들 자리가 없다 — 목업 버튼은 두되 이유를 붙여 막는다 */}
                  <button className="btn" disabled title="심사는 템플릿마다 카카오 템플릿 코드가 필요해 일괄로 낼 수 없습니다">
                    <Icon name="upload" size={14} /> 심사 일괄 제출
                  </button>
                  <button className="btn pri" disabled title="이벤트마다 템플릿이 하나씩 이미 있습니다">
                    <Icon name="plus" size={14} /> 템플릿 등록
                  </button>
                </>
              }
            />
          </div>

          <div className="card-sec">
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="pencil" size={15} />
                </span>
                {picked ? (EVENT_LABEL[picked.event] ?? picked.event) : '템플릿을 고르세요'}
              </div>
              <div className="r">
                {picked && picked.reviewStatus !== 'NOT_REQUIRED' && (
                  <span className={`mk ${REVIEW_TONE_BY_STATUS[picked.reviewStatus] ?? 'supplement'}`}>
                    {REVIEW_STATUS_LABEL[picked.reviewStatus] ?? picked.reviewStatus}
                  </span>
                )}
              </div>
            </div>

            {!picked && (
              <div className="card-sec-b">
                <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: '18px 2px' }}>
                  왼쪽 목록에서 템플릿을 고르면 문안을 편집할 수 있습니다.
                </div>
              </div>
            )}

            {picked && (
              <div className="card-sec-b">
                {/* 왜 안 나가는지를 맨 위에 둔다. 심사 배지만 보면 원인을 못 짚는다 */}
                <div
                  className="note-box"
                  style={{ borderColor: picked.sendable ? 'var(--green)' : 'var(--amber)', marginTop: 0 }}
                >
                  <div className="ic">
                    <Icon name={picked.sendable ? 'check-check' : 'triangle-alert'} size={17} />
                  </div>
                  <div>
                    <div className="tt">
                      {picked.sendable ? '지금 발송되는 템플릿입니다' : '지금은 발송되지 않습니다'}
                    </div>
                    <div className="tx">
                      {picked.sendable
                        ? '사용 중이고 문안이 확정됐으며 심사도 통과했습니다.'
                        : `${blockedReason(picked)} — 세 가지(사용 여부 · 문안 확정 · 심사)가 모두 갖춰져야 발송됩니다.`}
                    </div>
                  </div>
                </div>

                {notice && (
                  <div className="note-box" role="status" style={{ borderColor: 'var(--violet)' }}>
                    {notice}
                  </div>
                )}

                <div className="frow">
                  <label>코드</label>
                  <div style={{ paddingTop: 9 }}>
                    <code style={{ fontSize: 11 }}>{picked.event}</code>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      이 사건이 일어나면 자동으로 나갑니다. 코드는 바뀌지 않습니다.
                    </div>
                  </div>
                </div>

                <div className="frow">
                  <label>채널</label>
                  <div style={{ paddingTop: 9, fontSize: 12.5 }}>
                    {CHANNEL_LABEL[picked.channel] ?? picked.channel}
                    <span style={{ color: 'var(--muted)' }}>
                      {' · '}
                      {RECIPIENT_LABEL[picked.recipientType] ?? picked.recipientType} 수신
                    </span>
                  </div>
                </div>

                <div className="frow">
                  <label>치환 변수</label>
                  <div className="sf-chips" style={{ paddingTop: 5 }}>
                    {templateVars(picked).length === 0 && (
                      <span style={{ color: 'var(--muted)', fontSize: 11.5, paddingTop: 4 }}>지정된 변수가 없습니다</span>
                    )}
                    {templateVars(picked).map((v) => (
                      <button type="button" key={v} className="chip" onClick={() => setBody((d) => `${d}{${v}}`)}>
                        {'{'}
                        {v}
                        {'}'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="frow">
                  <label>제목</label>
                  <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div className="frow">
                  <label className="req">문안</label>
                  <textarea className="ta" value={body} onChange={(e) => setBody(e.target.value)} />
                </div>

                <div className="frow">
                  <label>미리보기</label>
                  <div
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 11,
                      padding: '11px 13px',
                      background: picked.channel === 'KAKAO_ALIMTALK' ? '#fef7d4' : 'var(--bg)',
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {preview(body) || <span style={{ color: 'var(--muted)' }}>문안을 입력하세요.</span>}
                  </div>
                </div>

                <div className="frow">
                  <label>&nbsp;</label>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        void run('임시 저장', () =>
                          updateTemplateContent(picked.id, {
                            titleTemplate: title,
                            bodyTemplate: body,
                            contentConfirmed: false,
                          }),
                        )
                      }
                    >
                      임시 저장
                    </button>
                    <button
                      className="btn pri"
                      disabled={busy || body.trim() === ''}
                      // 승인된 알림톡 문안을 고치면 심사가 미제출로 되돌아간다 — 먼저 알린다
                      onClick={() => {
                        if (picked.channel === 'KAKAO_ALIMTALK' && picked.reviewStatus === 'APPROVED') {
                          setReconfirm(picked.id)
                          return
                        }
                        void run('문안 확정', () =>
                          updateTemplateContent(picked.id, {
                            titleTemplate: title,
                            bodyTemplate: body,
                            contentConfirmed: true,
                          }),
                        )
                      }}
                    >
                      <Icon name="save" size={14} /> 문안 확정
                    </button>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => void run(picked.active ? '사용 중지' : '사용 시작', () => setTemplateActive(picked.id, !picked.active))}
                    >
                      {picked.active ? '사용 중지' : '사용 시작'}
                    </button>
                  </div>
                </div>

                {/* 알림톡만 카카오 심사를 탄다. 자동 연동 창구가 없어 결과를 사람이 넣는다 */}
                {picked.channel === 'KAKAO_ALIMTALK' && (
                  <div className="frow">
                    <label>카카오 심사</label>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', paddingTop: 4 }}>
                      <button
                        className="btn"
                        disabled={busy || !picked.contentConfirmed}
                        title={picked.contentConfirmed ? undefined : '문안을 확정한 뒤 제출할 수 있습니다'}
                        onClick={() => {
                          setCodeInput({ id: picked.id, code: picked.kakaoTemplateCode ?? '' })
                        }}
                      >
                        <Icon name="upload" size={14} /> 심사 제출
                      </button>
                      <button
                        className="btn"
                        disabled={busy || picked.reviewStatus !== 'SUBMITTED'}
                        title={picked.reviewStatus === 'SUBMITTED' ? undefined : '제출한 템플릿에만 결과를 넣을 수 있습니다'}
                        onClick={() => void run('심사 승인 기록', () => recordTemplateReviewResult(picked.id, true))}
                      >
                        승인됨
                      </button>
                      <button
                        className="btn"
                        style={{ color: 'var(--red)' }}
                        disabled={busy || picked.reviewStatus !== 'SUBMITTED'}
                        onClick={() => {
                          setRejectNote({ id: picked.id, note: '' })
                        }}
                      >
                        반려됨
                      </button>
                    </div>
                  </div>
                )}

                {picked.reviewNote && (
                  <div className="frow">
                    <label>심사 메모</label>
                    <div style={{ paddingTop: 9, fontSize: 12.5 }}>{picked.reviewNote}</div>
                  </div>
                )}

                {picked.channel === 'KAKAO_ALIMTALK' && (
                  <div className="blocked-note" style={{ marginTop: 4, marginBottom: 0 }}>
                    <div className="ic">
                      <Icon name="triangle-alert" size={16} />
                    </div>
                    <div>
                      <div className="tt">문안을 고치면 심사를 다시 받아야 합니다</div>
                      <div className="tx">
                        카카오는 <b>승인받은 문안 그대로만</b> 발송을 허용합니다. 오타 하나를 고쳐도 심사가
                        미제출로 돌아가고, 다시 승인될 때까지 이 템플릿은 나가지 않습니다.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ 발송 이력 ═══ */}
      {tab === 'log' && (
        <DataTable
          columns={LOG_COLUMNS}
          rows={LOGS}
          rowKey={(r) => r.id}
          masked={false}
          pageSize={12}
          countLabel={
            <>
              발송 이력 <b>{LOGS.length}</b>건
            </>
          }
        />
      )}
    </>
  )
}

export const messageMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled title="준비 중입니다">
        <Icon name="history" size={14} /> 발송 이력
      </button>
      <button className="btn pri" disabled title="준비 중입니다">
        <Icon name="send" size={14} /> 새 발송
      </button>
    </>
  ),
}
