import { useState } from 'react'
import { DataTable, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.4 문자 발송 → 카카오톡 발송(문자 병행) — 신규개발-요구사항보완
 * 알림 채널 이중화(카카오 알림톡 + FCM). E-5(알림톡 심사)가 최우선 블로커라
 * 실행가이드 지침대로 SMS 폴백을 전제로 만든다. */

type Channel = 'ALIMTALK' | 'FCM' | 'SMS'

const CHANNEL_META: Record<Channel, { label: string; desc: string; cls: string }> = {
  ALIMTALK: { label: '카카오 알림톡', desc: '트랜잭션 · 템플릿 사전승인 필요', cls: 'verified' },
  FCM: { label: 'FCM 푸시', desc: '앱 설치자 대상', cls: 'supplement' },
  SMS: { label: 'SMS 대체발송', desc: '알림톡 실패 시 폴백', cls: 'brandnew' },
}

const TEMPLATES = [
  { id: 't1', name: '등원 확인', auto: true, body: '[D.Lab] {학생명} 학생이 {시각}에 등원했습니다.' },
  { id: 't2', name: '지각 안내', auto: true, body: '[D.Lab] {학생명} 학생이 {시각}에 지각 등원했습니다. 사유가 있으시면 회신 부탁드립니다.' },
  { id: 't3', name: '결석 안내', auto: true, body: '[D.Lab] {학생명} 학생이 금일 미등원 상태입니다. 확인 부탁드립니다.' },
  { id: 't4', name: '대기자 순번 안내', auto: true, body: '[D.Lab] {학생명} 학생 등록이 가능합니다. {일자} {시각}까지 방문해 주세요.' },
  { id: 't5', name: '월간 성적 리포트', auto: false, body: '[D.Lab] {학생명} 학생의 {회차} 성적 리포트가 등록되었습니다.' },
  { id: 't6', name: '직접 입력', auto: false, body: '' },
]

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
  { id: 'l3', sentAt: '2026-05-27 18:00', template: '월간 성적 리포트', channel: 'FCM', scope: '전체', targets: 296, success: 288, by: '이장원' },
  { id: 'l4', sentAt: '2026-05-27 11:20', template: '직접 입력', channel: 'SMS', scope: '3반', targets: 42, success: 42, by: '김유진' },
  { id: 'l5', sentAt: '2026-05-26 16:45', template: '대기자 순번 안내', channel: 'ALIMTALK', scope: '개별', targets: 7, success: 6, by: '최지원' },
  { id: 'l6', sentAt: '2026-05-26 08:11', template: '등원 확인', channel: 'ALIMTALK', scope: '출결 자동', targets: 268, success: 268, by: '시스템' },
]

const LOG_COLUMNS: Column<SendLog>[] = [
  { key: 'sentAt', header: '발송일시', width: '140px', sortable: true, value: (r) => r.sentAt },
  { key: 'template', header: '템플릿', width: '150px', value: (r) => r.template },
  {
    key: 'channel',
    header: '채널',
    width: '120px',
    align: 'center',
    value: (r) => CHANNEL_META[r.channel].label,
    render: (r) => (
      <span className={`mk ${CHANNEL_META[r.channel].cls}`} title={r.channel}>
        {CHANNEL_META[r.channel].label}
      </span>
    ),
  },
  { key: 'scope', header: '범위', width: '90px', align: 'center', value: (r) => r.scope },
  { key: 'targets', header: '대상', width: '72px', align: 'right', sortable: true, value: (r) => r.targets },
  {
    key: 'success',
    header: '성공',
    width: '96px',
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
  const [scope, setScope] = useState('CLASS')
  const [channel, setChannel] = useState<Channel>('ALIMTALK')
  const [template, setTemplate] = useState(TEMPLATES[1])
  const [reserve, setReserve] = useState(false)

  const target = SCOPES.find((s) => s.key === scope)!

  return (
    <>
      <div className="blocked-note">
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <div>
          <div className="tt">카카오 알림톡 심사 — 미완료 (오픈이슈 #19 / E-5, 최우선)</div>
          <div className="tx">
            발신 프로필·템플릿 사전 승인이 나야 알림톡을 주 채널로 쓸 수 있습니다. 심사 결과에 따라
            <b> FCM 단독 vs 알림톡 병행</b>이 갈리며(#34 / I-14), 지연 시 <b>SMS 폴백</b>으로 착수합니다.
            알림톡·푸시 <b>전체 문구</b>도 운영팀 확정 대기입니다(#24 / I-4) — 아래 템플릿 본문은 임시안입니다.
          </div>
        </div>
      </div>

      <div className="split-3-2">
        {/* ── 발송 작성 ── */}
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="send" size={15} />
              </span>
              메시지 발송
            </div>
            <div className="r">
              <span className="mk supplement">
                대상 {target.count.toLocaleString()}명
              </span>
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
              <label className="req">채널</label>
              <div className="type-picks">
                {(Object.keys(CHANNEL_META) as Channel[]).map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`type-pick${channel === c ? ' on' : ''}`}
                    onClick={() => setChannel(c)}
                    title={`${c} — ${CHANNEL_META[c].desc}`}
                  >
                    {CHANNEL_META[c].label}
                  </button>
                ))}
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
                    {t.name}
                    {t.auto ? ' (자동발송)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {template.auto && (
              <div className="frow">
                <label>자동발송</label>
                <div className="link-box">
                  <div className="chk">
                    <Icon name="zap" size={12} />
                  </div>
                  <div>
                    이 템플릿은 <b>출결 이벤트에 연동된 자동발송</b>입니다. 개별 발송 시에도 동일 템플릿이 쓰이며,
                    문구 수정은 <b>설정 &gt; 알림 템플릿</b>에서 일괄 관리합니다.
                  </div>
                </div>
              </div>
            )}

            <div className="frow">
              <label className="req">내용</label>
              <textarea className="ta" defaultValue={template.body} placeholder="발송할 내용을 입력하세요." />
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
                <button className="btn pri">
                  <Icon name="send" size={14} /> {target.count.toLocaleString()}명에게 발송
                </button>
                <button className="btn">테스트 발송</button>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {channel === 'ALIMTALK' ? '실패 시 SMS로 자동 대체발송됩니다.' : CHANNEL_META[channel].desc}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 템플릿 목록 ── */}
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="file-text" size={15} />
              </span>
              알림 템플릿
            </div>
            <div className="r">
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Phase 0 · 설정</span>
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {TEMPLATES.filter((t) => t.body).map((t) => (
              <div
                key={t.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 11,
                  padding: '11px 13px',
                  background: t.id === template.id ? 'var(--mint-wash)' : '#fff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <b style={{ fontSize: 12.5 }}>{t.name}</b>
                  {t.auto && <span className="mk verified">자동</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>심사 대기</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DataTable
        columns={LOG_COLUMNS}
        rows={LOGS}
        rowKey={(r) => r.id}
        masked={false}
        pageSize={10}
        countLabel={
          <>
            발송 이력 <b>{LOGS.length}</b>건
          </>
        }
      />
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
      <button className="btn">
        <Icon name="file-text" size={14} /> 템플릿 관리
      </button>
    </>
  ),
}
