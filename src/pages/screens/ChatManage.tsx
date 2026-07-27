import { useState } from 'react'
import { DataTable, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.11-3 메시지 관리(공지·행정요청·1:1채팅·가족채팅방) — 신규개발-요구사항신규
 *
 * ⚠ #20 / E-6 (높음) — 1:1 채팅용 외부 유료 메신저 선정(1만명 규모).
 *   React 연동 담당: 서지원. 개인정보/보안 검토 필요. 선정 전까지 착수 불가.
 *   실행가이드: "공지·행정요청 선행 가능, 1:1채팅은 ★메신저선정 선결"
 * ⚠ #23 / I-3 (중) — 앱 행정 요청 클릭 항목 리스트 미확정.
 *
 * 본문은 외부 벤더가 저장하고 자체 DB에는 메타·참조ID만 남긴다. */

type Scope = 'ALL' | 'BRANCH' | 'CLASS' | 'INDIVIDUAL'

const SCOPE_META: Record<Scope, { label: string; auth: string; cls: string }> = {
  ALL: { label: '전체', auth: '본사 관리자', cls: 'brandnew' },
  BRANCH: { label: '지점', auth: '지점 관리자', cls: 'supplement' },
  CLASS: { label: '반', auth: '담임', cls: 'verified' },
  INDIVIDUAL: { label: '개별', auth: '전체 권한', cls: 'verified' },
}

interface Notice {
  id: string
  postedAt: string
  title: string
  scope: Scope
  target: string
  readCount: number
  total: number
  by: string
}

const NOTICES: Notice[] = [
  { id: 'n1', postedAt: '2026-05-28 09:00', title: '6월 평가원 모의고사 응시 안내', scope: 'ALL', target: '전체', readCount: 281, total: 296, by: '본사' },
  { id: 'n2', postedAt: '2026-05-27 17:30', title: '분당지점 6월 급식 신청 마감 안내', scope: 'BRANCH', target: '분당', readCount: 96, total: 104, by: '최지원' },
  { id: 'n3', postedAt: '2026-05-27 08:15', title: '3반 주간 학습계획 제출 요청', scope: 'CLASS', target: '3반', readCount: 13, total: 14, by: '이장원' },
  { id: 'n4', postedAt: '2026-05-26 14:20', title: '특강 신청 잔여석 안내', scope: 'ALL', target: '전체', readCount: 267, total: 296, by: '본사' },
  { id: 'n5', postedAt: '2026-05-26 11:05', title: '개별 상담 일정 조정 안내', scope: 'INDIVIDUAL', target: '이승민', readCount: 1, total: 1, by: '이장원' },
]

const NOTICE_COLUMNS: Column<Notice>[] = [
  { key: 'postedAt', header: '발송일시', width: '140px', sortable: true, value: (r) => r.postedAt },
  { key: 'title', header: '제목', sortable: true, value: (r) => r.title },
  {
    key: 'scope',
    header: '범위',
    width: '86px',
    align: 'center',
    sortable: true,
    value: (r) => r.scope,
    render: (r) => (
      <span className={`mk ${SCOPE_META[r.scope].cls}`} title={`${r.scope} — 발송 권한: ${SCOPE_META[r.scope].auth}`}>
        {SCOPE_META[r.scope].label}
      </span>
    ),
  },
  { key: 'target', header: '대상', width: '86px', align: 'center', value: (r) => r.target },
  {
    key: 'read',
    header: '열람',
    width: '128px',
    align: 'right',
    value: (r) => r.readCount / r.total,
    render: (r) => {
      const pct = Math.round((r.readCount / r.total) * 100)
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
          <div style={{ width: 46, height: 6, background: 'var(--line-2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--mint)' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {r.readCount}/{r.total}
          </span>
        </div>
      )
    },
  },
  { key: 'by', header: '작성자', width: '80px', value: (r) => r.by },
]

/* ── 행정 요청 수신함 ── */
interface AdminRequest {
  id: string
  at: string
  studentNo: string
  name: string
  item: string
  assignee: string
  status: '접수' | '처리중' | '완료'
}

/** ⚠ I-3 미확정 — 아래 항목은 제안이며 확정 목록이 아니다 */
const REQUEST_ITEMS = ['재학증명서 발급', '출결확인서 발급', '사물함 변경', '좌석 변경 요청', '교재 재구매', '기숙사 외박 신청']

const REQUESTS: AdminRequest[] = MOCK_STUDENTS.slice(0, 22).map((s, i) => ({
  id: `ar-${i + 1}`,
  at: `2026-05-${String(20 + (i % 8)).padStart(2, '0')} ${String(9 + (i % 10)).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}`,
  studentNo: s.studentNo,
  name: s.name,
  item: REQUEST_ITEMS[i % REQUEST_ITEMS.length],
  assignee: i % 3 === 0 ? '교무팀' : i % 3 === 1 ? '행정팀' : s.teacher,
  status: i % 5 === 4 ? '접수' : i % 3 === 2 ? '처리중' : '완료',
}))

const REQUEST_COLUMNS: Column<AdminRequest>[] = [
  { key: 'at', header: '요청일시', width: '140px', sortable: true, value: (r) => r.at },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'item', header: '요청 항목', sortable: true, value: (r) => r.item },
  { key: 'assignee', header: '담당', width: '86px', align: 'center', value: (r) => r.assignee },
  {
    key: 'status',
    header: '상태',
    width: '86px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => (
      <span className={`mk ${r.status === '완료' ? 'verified' : r.status === '처리중' ? 'supplement' : 'brandnew'}`}>
        {r.status}
      </span>
    ),
  },
  {
    key: 'act',
    header: '',
    width: '80px',
    align: 'center',
    value: () => '',
    render: (r) => (
      <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled={r.status === '완료'}>
        처리
      </button>
    ),
  },
]

function Content() {
  const [tab, setTab] = useState('notice')

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="bell" size={13} /> 이번 주 공지
          </div>
          <div className="v">{NOTICES.length}</div>
          <div className="d">scope별 발송</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="inbox" size={13} /> 행정 요청
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {REQUESTS.filter((r) => r.status !== '완료').length}
          </div>
          <div className="d warn">미처리</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="message-square" size={13} /> 1:1 채팅
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            선정 대기
          </div>
          <div className="d down" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9.5 }}>
            DIRECT_1TO1
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 가족 채팅방
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            선정 대기
          </div>
          <div className="d down" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9.5 }}>
            FAMILY
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="shield" size={13} /> 본문 저장
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            벤더
          </div>
          <div className="d">chat_threads — 메타만</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'notice', label: '공지 발송', count: NOTICES.length },
            { key: 'request', label: '행정 요청 수신함', count: REQUESTS.filter((r) => r.status !== '완료').length },
            { key: 'chat', label: '1:1 채팅 · 가족 채팅방' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {tab === 'notice' && (
            <>
              <div className="note-box plain" style={{ marginBottom: 14 }}>
                <div className="ic">
                  <Icon name="shield-check" size={17} />
                </div>
                <div>
                  <div className="tt">발송 범위별 권한</div>
                  <div className="tx">
                    <code>scope: ALL / BRANCH / CLASS / INDIVIDUAL</code> — 전체는 <b>본사</b>, 지점은{' '}
                    <b>지점관리자</b>, 반은 <b>담임</b>만 발송할 수 있습니다. 이 권한 분기는 사용자 관리(F-4.10-2)의
                    RBAC 매트릭스와 1:1로 대응합니다.
                  </div>
                </div>
              </div>
              <DataTable
                columns={NOTICE_COLUMNS}
                rows={NOTICES}
                rowKey={(r) => r.id}
                masked={false}
                pageSize={10}
                countLabel={
                  <>
                    공지 <b>{NOTICES.length}</b>건
                  </>
                }
                toolbar={
                  <button className="btn pri">
                    <Icon name="plus" size={14} /> 공지 작성
                  </button>
                }
              />
            </>
          )}

          {tab === 'request' && (
            <>
              <DataTable
                columns={REQUEST_COLUMNS}
                rows={REQUESTS}
                rowKey={(r) => r.id}
                pageSize={12}
                countLabel={
                  <>
                    행정 요청 <b>{REQUESTS.length}</b>건
                  </>
                }
              />
            </>
          )}

          {tab === 'chat' && (
            <>
              <div className="note-box plain" style={{ marginBottom: 14 }}>
                <div className="ic">
                  <Icon name="shield" size={17} />
                </div>
                <div>
                  <div className="tt">메신저 선정 전에도 확정된 것</div>
                  <div className="tx">
                    <b>본문은 벤더가 저장</b>하고 자체 DB에는 <code>chat_threads</code>의 메타·참조ID만 남깁니다.
                    스레드 유형은 <code>DIRECT_1TO1</code> / <code>FAMILY</code> 2종이며, 가족 채팅방은 학부모 +
                    학생 + 관리자가 참여합니다. 이 구조는 제품이 바뀌어도 유지됩니다.
                  </div>
                </div>
              </div>

              <div className="split">
                {[
                  {
                    t: '1:1 채팅',
                    code: 'DIRECT_1TO1',
                    icon: 'message-square',
                    members: '학생 ↔ 담임',
                    notes: ['외부 메신저 React 위젯 임베드', '담임별 스레드 목록', '읽음·미응답 알림'],
                  },
                  {
                    t: '가족 채팅방',
                    code: 'FAMILY',
                    icon: 'users',
                    members: '학부모 + 학생 + 관리자',
                    notes: ['그룹 스레드', '관리자 참여 여부 정책 필요', '학부모 앱 연동'],
                  },
                ].map((c) => (
                  <div
                    key={c.code}
                    style={{
                      border: '1.5px dashed #cdd4de',
                      borderRadius: 14,
                      padding: '20px 22px',
                      background: '#fafbfc',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                      <Icon name={c.icon} size={17} />
                      <b style={{ fontSize: 14 }}>{c.t}</b>
                      <code style={{ fontSize: 10.5, marginLeft: 'auto' }}>{c.code}</code>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>참여: {c.members}</div>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {c.notes.map((n) => (
                        <li key={n} style={{ fontSize: 11.5, color: 'var(--ink-2)', display: 'flex', gap: 7 }}>
                          <Icon name="lock" size={12} />
                          {n}
                        </li>
                      ))}
                    </ul>
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: '1px solid var(--line)',
                        fontSize: 11,
                        color: 'var(--amber)',
                        fontWeight: 700,
                      }}
                    >
                      메신저 선정 후 착수
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export const chatMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="inbox" size={14} /> 수신함
      </button>
      <button className="btn pri">
        <Icon name="plus" size={14} /> 공지 작성
      </button>
    </>
  ),
}
