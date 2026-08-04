import { useMemo, useState } from 'react'
import { DataTable, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
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
 * ⚠ #19 / E-5 (최우선) — 알림톡 발신프로필·템플릿 사전승인. 승인 전에는 실발송 불가. */

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

const REVIEW_TONE: Record<ReviewStatus, string> = {
  승인: 'verified',
  심사대기: 'supplement',
  반려: 'brandnew',
  해당없음: 'supplement',
}

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

const TEMPLATE_COLUMNS: Column<Template>[] = [
  {
    key: 'code',
    header: '코드',
    width: '160px',
    sortable: true,
    value: (r) => r.code,
    render: (_r, v) => <code style={{ fontSize: 10.5 }}>{v}</code>,
  },
  { key: 'name', header: '템플릿명', width: '160px', sortable: true, value: (r) => r.name },
  {
    key: 'channel',
    header: '채널',
    width: '120px',
    align: 'center',
    sortable: true,
    value: (r) => CHANNEL_META[r.channel].label,
    render: (r) => (
      <span className={`mk ${CHANNEL_META[r.channel].cls}`} title={CHANNEL_META[r.channel].desc}>
        {CHANNEL_META[r.channel].label}
      </span>
    ),
  },
  {
    key: 'trigger',
    header: '자동발송 트리거',
    width: '176px',
    value: (r) => r.trigger ?? '-',
    render: (r) =>
      r.trigger ? (
        <code style={{ fontSize: 10.5, color: 'var(--violet)' }}>{r.trigger}</code>
      ) : (
        <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>수동 발송</span>
      ),
  },
  {
    key: 'status',
    header: '알림톡 심사',
    width: '100px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) =>
      r.status === '해당없음' ? (
        <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>-</span>
      ) : (
        <span className={`mk ${REVIEW_TONE[r.status]}`}>{r.status}</span>
      ),
  },
  { key: 'updatedAt', header: '최종 수정', width: '100px', align: 'center', sortable: true, value: (r) => r.updatedAt },
  { key: 'updatedBy', header: '수정자', width: '80px', value: (r) => r.updatedBy },
]

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

  /* 템플릿 관리 탭 */
  const [editing, setEditing] = useState<Template>(TEMPLATES[0])
  const [draft, setDraft] = useState(TEMPLATES[0].body)

  const target = SCOPES.find((s) => s.key === scope)!
  const channel = template.channel

  /* 알림톡은 승인된 템플릿만 나간다 — 심사가 안 끝났으면 발송 버튼을 막는다 */
  const blocked = channel === 'ALIMTALK' && template.status !== '승인'

  const counts = useMemo(
    () => ({
      alimtalk: TEMPLATES.filter((t) => t.channel === 'ALIMTALK').length,
      approved: TEMPLATES.filter((t) => t.status === '승인').length,
      waiting: TEMPLATES.filter((t) => t.status === '심사대기').length,
      rejected: TEMPLATES.filter((t) => t.status === '반려').length,
      auto: TEMPLATES.filter((t) => t.trigger).length,
    }),
    [],
  )

  function pickTemplate(t: Template) {
    setEditing(t)
    setDraft(t.body)
  }

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="file-text" size={13} /> 등록 템플릿
          </div>
          <div className="v">{TEMPLATES.length}</div>
          <div className="d">알림톡 {counts.alimtalk} · 푸시 {TEMPLATES.length - counts.alimtalk}</div>
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
            <Icon name="zap" size={13} /> 자동발송
          </div>
          <div className="v">{counts.auto}</div>
          <div className="d">이벤트 트리거 연동</div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'send', label: '메시지 발송' },
          { key: 'tpl', label: '템플릿 관리', count: TEMPLATES.length },
          { key: 'log', label: '발송 이력', count: LOGS.length },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {/* ═══ 메시지 발송 ═══ */}
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
                  <button className="btn">테스트 발송</button>
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

      {/* ═══ 템플릿 관리 ═══ */}
      {tab === 'tpl' && (
        <div className="split-3-2">
          <div>
            <DataTable
              columns={TEMPLATE_COLUMNS}
              rows={TEMPLATES}
              rowKey={(r) => r.id}
              masked={false}
              pageSize={10}
              onRowClick={pickTemplate}
              countLabel={
                <>
                  템플릿 <b>{TEMPLATES.length}</b>건 · 행을 누르면 편집합니다
                </>
              }
              toolbar={
                <>
                  <button className="btn">
                    <Icon name="upload" size={14} /> 심사 일괄 제출
                  </button>
                  <button className="btn pri">
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
                {editing.name}
              </div>
              <div className="r">
                {editing.status !== '해당없음' && (
                  <span className={`mk ${REVIEW_TONE[editing.status]}`}>{editing.status}</span>
                )}
              </div>
            </div>
            <div className="card-sec-b">
              <div className="frow">
                <label>코드</label>
                <div style={{ paddingTop: 9 }}>
                  <code style={{ fontSize: 11 }}>{editing.code}</code>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    발송 API가 참조하는 값입니다. 이름이 바뀌어도 코드는 고정합니다.
                  </div>
                </div>
              </div>

              <div className="frow">
                <label className="req">템플릿명</label>
                <input className="inp" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>

              <div className="frow">
                <label className="req">채널</label>
                <div className="type-picks">
                  {(Object.keys(CHANNEL_META) as Channel[]).map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={`type-pick${editing.channel === c ? ' on' : ''}`}
                      onClick={() => setEditing({ ...editing, channel: c })}
                      title={CHANNEL_META[c].desc}
                    >
                      {CHANNEL_META[c].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="frow">
                <label>자동발송</label>
                <div style={{ paddingTop: 9, fontSize: 12 }}>
                  {editing.trigger ? (
                    <code style={{ fontSize: 11, color: 'var(--violet)' }}>{editing.trigger}</code>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>수동 발송 전용</span>
                  )}
                </div>
              </div>

              <div className="frow">
                <label>치환 변수</label>
                <div className="sf-chips" style={{ paddingTop: 5 }}>
                  {editing.vars.map((v) => (
                    <button
                      type="button"
                      key={v}
                      className="chip"
                      onClick={() => setDraft((d) => `${d}{${v}}`)}
                      title={`예시값: ${SAMPLE[v] ?? '-'}`}
                    >
                      {'{'}
                      {v}
                      {'}'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="frow">
                <label className="req">문안</label>
                <textarea className="ta" value={draft} onChange={(e) => setDraft(e.target.value)} />
              </div>

              <div className="frow">
                <label>미리보기</label>
                <div
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 11,
                    padding: '11px 13px',
                    background: editing.channel === 'ALIMTALK' ? '#fef7d4' : 'var(--bg)',
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {preview(draft) || <span style={{ color: 'var(--muted)' }}>문안을 입력하세요.</span>}
                </div>
              </div>

              <div className="frow">
                <label>&nbsp;</label>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <button className="btn pri">
                    <Icon name="save" size={14} /> 저장
                  </button>
                  {editing.channel === 'ALIMTALK' && (
                    <button className="btn">
                      <Icon name="upload" size={14} /> 심사 제출
                    </button>
                  )}
                  <button className="btn" style={{ color: 'var(--red)' }}>
                    삭제
                  </button>
                </div>
              </div>

              {editing.channel === 'ALIMTALK' && (
                <div className="blocked-note" style={{ marginTop: 4, marginBottom: 0 }}>
                  <div className="ic">
                    <Icon name="triangle-alert" size={16} />
                  </div>
                  <div>
                    <div className="tt">문안을 고치면 심사를 다시 받아야 합니다</div>
                    <div className="tx">
                      알림톡은 <code>E-5</code> 사전 승인 대상이라, 저장만으로는 발송에 반영되지 않습니다. 승인 완료 전까지
                      해당 템플릿의 자동발송은 <b>직전 승인 문안</b>으로 나갑니다.
                    </div>
                  </div>
                </div>
              )}
            </div>
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
      <button className="btn">
        <Icon name="history" size={14} /> 발송 이력
      </button>
      <button className="btn pri">
        <Icon name="send" size={14} /> 새 발송
      </button>
    </>
  ),
}
