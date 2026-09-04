import { useCallback, useEffect, useState } from 'react'
import { DataTable, Unfilled, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  NOTICE_SCOPE_LABEL,
  deleteNotice,
  listNotices,
  postNoticeToAll,
  postNoticeToBranch,
  patchNotice,
  type Notice as ApiNotice,
} from '../../api/notices'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.11-3 메시지 관리(공지·행정요청·1:1채팅) — 신규개발-요구사항신규
 *
 * 가족 채팅방(FAMILY)은 범위에서 제외한다. 스레드 유형은 DIRECT_1TO1 하나뿐이다.
 *   → 학부모는 참여자가 아니라 알림톡 수신자로만 남는다(F-4.4).
 *   → chat_threads 에 type 컬럼을 두더라도 값은 DIRECT_1TO1 단일이므로,
 *     참여자 모델을 그룹 대응으로 미리 설계할 필요가 없다.
 *
 * ⚠ #20 / E-6 (높음) — 1:1 채팅용 외부 유료 메신저 선정(1만명 규모).
 *   React 연동 담당: 서지원. 개인정보/보안 검토 필요. 선정 전까지 착수 불가.
 * ⚠ #23 / I-3 (중) — 앱 행정 요청 클릭 항목 리스트 미확정.
 *
 * 본문은 외부 벤더가 저장하고 자체 DB에는 메타·참조ID만 남긴다.
 *
 * 발송 범위 scope = ALL / BRANCH / CLASS / INDIVIDUAL.
 * 각각 본사 / 지점관리자 / 담임 만 발송할 수 있고, 이 분기는 사용자 관리(F-4.10-2)의
 * RBAC 매트릭스와 1:1로 대응한다 — 여기서 따로 권한을 정의하지 않는다. */


const SCOPE_CLS: Record<string, string> = {
  ALL: 'verified',
  BRANCH: 'supplement',
  CLASS: 'brandnew',
  INDIVIDUAL: '',
}

/** 대상 표시 — scope 마다 의미 있는 값이 다르다 */
function targetOf(n: ApiNotice): string {
  if (n.scope === 'CLASS') return n.className ?? '반'
  if (n.scope === 'INDIVIDUAL') return '개별'
  if (n.scope === 'BRANCH') return '지점'
  return '전체'
}

const NOTICE_COLUMNS: Column<ApiNotice>[] = [
  {
    key: 'publishedAt',
    header: '발송일시',
    width: '150px',
    sortable: true,
    value: (r) => r.publishedAt ?? r.createdAt ?? '',
    render: (r) => (r.publishedAt ?? r.createdAt ?? '-').slice(0, 16).replace('T', ' '),
  },
  {
    key: 'title',
    header: '제목',
    sortable: true,
    value: (r) => r.title,
    render: (r) => (
      <>
        {r.pinned && (
          <span className="mk supplement" style={{ marginRight: 6 }} title="상단 고정">
            고정
          </span>
        )}
        {r.banner && (
          <span className="mk brandnew" style={{ marginRight: 6 }} title="배너 노출">
            배너
          </span>
        )}
        {r.title}
      </>
    ),
  },
  {
    key: 'scope',
    header: '범위',
    width: '86px',
    align: 'center',
    sortable: true,
    value: (r) => NOTICE_SCOPE_LABEL[r.scope] ?? r.scope,
    render: (r) => (
      <span className={`mk ${SCOPE_CLS[r.scope] ?? ''}`}>{NOTICE_SCOPE_LABEL[r.scope] ?? r.scope}</span>
    ),
  },
  { key: 'target', header: '대상', width: '96px', align: 'center', value: (r) => targetOf(r) },
  {
    key: 'read',
    header: '열람',
    width: '110px',
    align: 'center',
    value: () => '',
    render: () => <Unfilled reason="공지 열람 수가 응답에 없다" />,
  },
  {
    key: 'expiresAt',
    header: '만료',
    width: '110px',
    align: 'center',
    value: (r) => r.expiresAt ?? '',
    render: (r) => (r.expiresAt ? r.expiresAt.slice(0, 10) : <span style={{ color: 'var(--muted)' }}>-</span>),
  },
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
const REQUEST_ITEMS = ['재학증명서 발급', '출결확인서 발급', '사물함 변경', '좌석 변경 요청', '교재 재구매', '자습실 연장 신청']

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

  /* ── 공지 실연동 ── */
  const { academyId, academies } = useAcademy()
  const [notices, setNotices] = useState<ApiNotice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // 전체 발송은 본사만 가능하다 — 서버가 경로 단위로 권한을 건다
  const [scope, setScope] = useState<'ALL' | 'BRANCH'>('BRANCH')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setNotices(await listNotices(new Date().getFullYear()))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '공지를 불러오지 못했습니다.')
      setNotices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function send() {
    if (title.trim() === '' || content.trim() === '') return
    setSaving(true)
    try {
      if (scope === 'ALL') await postNoticeToAll(title.trim(), content.trim())
      else if (academyId !== null) await postNoticeToBranch(academyId, title.trim(), content.trim())
      setTitle('')
      setContent('')
      setComposing(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '공지를 보내지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * 상단 고정·배너는 발송 후 수정으로 켠다.
   * 서버 PUT 이 부분 수정을 안 받아 기존 제목·내용을 함께 보낸다(patchNotice).
   */
  async function toggle(n: ApiNotice, field: 'pinned' | 'banner') {
    try {
      await patchNotice(n, { [field]: !n[field] })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '수정하지 못했습니다.')
    }
  }

  async function remove(id: number) {
    try {
      await deleteNotice(id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '삭제하지 못했습니다.')
    }
  }

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="bell" size={13} /> 이번 주 공지
          </div>
          <div className="v">{notices.length}</div>
          <div className="d">범위별 발송</div>
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
            <Icon name="users" size={13} /> 참여 대상
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            학생 ↔ 담임
          </div>
          <div className="d">학부모는 알림톡 수신만</div>
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
            { key: 'notice', label: '공지 발송', count: notices.length },
            { key: 'request', label: '행정 요청 수신함', count: REQUESTS.filter((r) => r.status !== '완료').length },
            { key: 'chat', label: '1:1 채팅' },
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
                    <b>전체</b>는 본사만, <b>지점</b>은 지점관리자, <b>반</b>은 담임이 발송할 수 있습니다.
                    개별 발송은 담당자가 맡은 학생에게만 가능합니다. 권한은 사용자 관리에서
                    설정한 값을 그대로 따릅니다.
                  </div>
                </div>
              </div>
              {error && (
                <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                  {error}
                </div>
              )}

              {composing && (
                <div className="card-sec" style={{ marginBottom: 14 }}>
                  <div className="card-sec-h">
                    <div className="t">
                      <span className="ico">
                        <Icon name="pencil" size={15} />
                      </span>
                      공지 작성
                    </div>
                  </div>
                  <div className="card-sec-b">
                    <div className="frow">
                      <label className="req">발송 범위</label>
                      <select className="sel" value={scope} onChange={(e) => setScope(e.target.value as 'ALL' | 'BRANCH')}>
                        {/* 전체 발송은 본사만 — 지점이 하나만 보이는 계정에는 뜨지 않는다 */}
                        {academies.length > 1 && <option value="ALL">전체 (본사)</option>}
                        <option value="BRANCH">지점</option>
                      </select>
                    </div>
                    <div className="frow">
                      <label className="req">제목</label>
                      <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div className="frow">
                      <label className="req">내용</label>
                      <textarea className="ta" value={content} onChange={(e) => setContent(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button className="btn" onClick={() => setComposing(false)}>
                        취소
                      </button>
                      <button
                        className="btn pri"
                        disabled={saving || !title.trim() || !content.trim() || (scope === 'BRANCH' && academyId === null)}
                        onClick={() => void send()}
                      >
                        <Icon name="send" size={14} /> {saving ? '발송 중…' : '발송'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <DataTable
                columns={[
                  ...NOTICE_COLUMNS,
                  {
                    key: 'act',
                    header: '',
                    width: '164px',
                    align: 'center',
                    value: () => '',
                    render: (r) => (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={() => void toggle(r, 'pinned')}
                          title="상단 고정"
                        >
                          {r.pinned ? '고정 해제' : '고정'}
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={() => void toggle(r, 'banner')}
                          title="배너 노출"
                        >
                          {r.banner ? '배너 끄기' : '배너'}
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: 11, color: 'var(--red)' }}
                          onClick={() => void remove(r.id)}
                        >
                          삭제
                        </button>
                      </div>
                    ),
                  },
                ]}
                rows={notices}
                rowKey={(r) => String(r.id)}
                masked={false}
                loading={loading}
                pageSize={10}
                emptyText="발송한 공지가 없습니다."
                countLabel={
                  <>
                    공지 <b>{notices.length}</b>건
                  </>
                }
                toolbar={
                  <button className="btn pri" onClick={() => setComposing((v) => !v)}>
                    <Icon name="plus" size={14} /> {composing ? '작성 취소' : '공지 작성'}
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
                    대화 내용은 <b>메신저 업체가 보관</b>하고, 이 시스템에는 언제 누구와 나눴는지만
                    남습니다. 대화는 <b>학생 ↔ 담임 1:1</b> 한 종류뿐입니다.
                    <b> 가족 채팅방(그룹 스레드)은 범위에서 제외</b>되어, 학부모는 채팅 참여자가 아니라 알림톡
                    수신자로만 남습니다. 이 구조는 제품이 바뀌어도 유지됩니다.
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
                    t: '학부모 소통',
                    code: '(채팅 아님)',
                    icon: 'message-circle',
                    members: '학부모 — 수신 전용',
                    notes: [
                      '가족 채팅방 제외 — 그룹 스레드 없음',
                      '출결·성적 알림은 알림톡(F-4.4)으로 전달',
                      '학부모 문의는 행정 요청 수신함으로 접수',
                    ],
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
                        color: c.code === 'DIRECT_1TO1' ? 'var(--amber)' : 'var(--muted)',
                        fontWeight: 700,
                      }}
                    >
                      {c.code === 'DIRECT_1TO1' ? '메신저 선정 후 착수' : '개발 대상 아님 — 기존 채널로 처리'}
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
