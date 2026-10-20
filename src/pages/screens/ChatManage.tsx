import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Modal, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { useAuth } from '../../auth/AuthContext'
import { studentNoText } from '../../lib/studentNo'
import { listClasses, type ClassGroup } from '../../api/classes'
import { searchStudents, type Student } from '../../api/students'
import {
  NOTICE_SCOPE_LABEL,
  deleteNotice,
  listNotices,
  postNoticeToAll,
  postNoticeToBranch,
  postNoticeToClass,
  postNoticeToStudents,
  patchNotice,
  attachFileToNotice,
  uploadNoticeFile,
  type Notice as ApiNotice,
} from '../../api/notices'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import { createScreenSignal } from './screenSignal'
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
    value: (r) => r.readCount ?? '',
    render: (r) => (r.readCount == null ? '-' : `${r.readCount}명`),
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
    render: () => (
      <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled data-soon title="준비 중입니다">
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
  /* ★ 담임은 공지가 매트릭스상 '없음' 인데 메뉴에 들어 있어 **삭제까지 눌렸다**
       (2026-09-28 테스트 회신). 서버가 조일 때까지 화면에서 먼저 막는다 */
  const { teacherOnly, principal } = useAuth()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // 전체 발송은 본사만 가능하다 — 서버가 경로 단위로 권한을 건다
  /* ★ 반·개인 공지는 **담임 업무의 기본**인데 화면이 지점·전체만 보내고 있었다.
       호출 함수는 있었는데 부르는 자리가 없었다(2026-09-27 실테스트 P2) */
  /* ★ 작성에서는 **`SELECTED`(여러 명)만** 쓴다. 옛 `INDIVIDUAL`(한 명)은 **이미 보낸 공지**가
     있어 목록 표시용으로만 남는다 — 새로 그 길로 보내면 **사람 수만큼 공지가 생긴다** */
  const [scope, setScope] = useState<'ALL' | 'BRANCH' | 'CLASS' | 'SELECTED'>('BRANCH')
  const [classId, setClassId] = useState('')
  /** 고른 학생들. **공지는 한 건**이고 대상자만 여럿이다 */
  const [picked, setPicked] = useState<string[]>([])
  const [pickClass, setPickClass] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [saving, setSaving] = useState(false)
  /* 삭제는 되돌릴 수 없고 학생 앱에서도 빠진다 — 한 번 묻는다 */
  const [removing, setRemoving] = useState<ApiNotice | null>(null)
  /* '이번 주 공지' — 올해 전체 건수를 이번 주라고 써 두었었다. 월요일부터 센다 */
  const weekCount = useMemo(() => {
    const now = new Date()
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
    return notices.filter((n) => {
      const at = n.publishedAt ?? n.createdAt
      return at !== null && new Date(at) >= monday
    }).length
  }, [notices])

  /* ★ **담임은 자기 반만** 고를 수 있다. 서버가 남의 반을 섞으면 **전체를 거절**하므로
     (하나만 자기 반이어도 안 된다) 애초에 안 보여준다 — 고르고 나서 거절당하면 왜인지 모른다.
     ⚠️ **지금은 닿지 않는 길이다** — 담임은 공지 작성 버튼 자체가 없다(0928 회신, 매트릭스상
     담임 공지 작성 '없음'). 그 결정이 바뀌면 이 필터가 바로 받는다. 지워 두면 그때
     **남의 반을 섞어 전체가 거절되는** 것부터 다시 겪는다 */
  const pickableClasses = useMemo(
    () =>
      teacherOnly
        ? classes.filter((c) => c.homeroomTeacherId != null && String(c.homeroomTeacherId) === principal?.accountId)
        : classes,
    [classes, teacherOnly, principal?.accountId],
  )

  const pickableStudents = useMemo(() => {
    const names = new Set(pickableClasses.map((c) => c.name))
    const q = studentQuery.trim()
    return students
      .filter((st) => !teacherOnly || (st.className != null && names.has(st.className)))
      .filter((st) => pickClass === '' || st.className === classes.find((c) => String(c.id) === pickClass)?.name)
      .filter((st) => q === '' || st.name.includes(q) || (st.studentNo ?? '').includes(q))
      .slice(0, 200)
  }, [students, pickableClasses, pickClass, studentQuery, teacherOnly, classes])

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

  /* 헤더 '공지 작성'·'수신함' — 본문의 같은 기능으로 보낸다(헤더는 본문 상태를 못 만진다, CLAUDE.md 5-1) */
  const composeVer = composeSignal.useVersion()
  const inboxVer = inboxSignal.useVersion()
  useEffect(() => {
    if (composeVer === 0) return
    setTab('notice')
    setComposing(true)
  }, [composeVer])
  useEffect(() => {
    if (inboxVer > 0) setTab('request')
  }, [inboxVer])

  /* 반·학생 선택지. 공지 작성 창을 열 때만 필요하지만 지점이 바뀌면 같이 바뀐다 */
  useEffect(() => {
    if (academyId === null) {
      setClasses([])
      setStudents([])
      return
    }
    let alive = true
    void listClasses(new Date().getFullYear(), academyId)
      .then((v) => alive && setClasses(v.filter((c) => c.academyId === academyId)))
      .catch(() => alive && setClasses([]))
    void searchStudents({ status: 'ENROLLED', size: 2000, academyId })
      .then((p) => alive && setStudents(p.rows))
      .catch(() => alive && setStudents([]))
    return () => {
      alive = false
    }
  }, [academyId])

  async function send() {
    if (title.trim() === '' || content.trim() === '') return
    setSaving(true)
    try {
      /* ★ **대상에 따라 경로가 넷이고 응답이 다르다.** 첨부를 붙이려면 만들어진
         공지 id 가 필요한데, 전체·지점·반은 한 건이고 개별은 여러 건이다 */
      let made: { id: number }[] = []
      if (scope === 'ALL') made = [await postNoticeToAll(title.trim(), content.trim())]
      else if (scope === 'CLASS') made = [await postNoticeToClass(Number(classId), title.trim(), content.trim())]
      else if (scope === 'SELECTED')
        made = [await postNoticeToStudents(picked.map(Number), title.trim(), content.trim())]
      else if (academyId !== null) made = [await postNoticeToBranch(academyId, title.trim(), content.trim())]

      /* ★ **저장 뒤에 붙인다.** 올리는 것과 붙이는 것이 따로라 `ownerId` 없이 먼저
         올려 두었다 — 저장부터 강제하면 **쓰다 만 공지가 쌓인다.**
         ★ 붙이기가 실패해도 **공지는 이미 나갔다.** 「발송 실패」로 뭉뚱그리지 않고
           무엇이 안 됐는지 그대로 쓴다(CLAUDE.md 4장) */
      let attachFailed = 0
      if (files.length > 0 && made.length > 0 && made[0]?.id) {
        for (const f of files) {
          try {
            await attachFileToNotice(f.id, made[0].id)
          } catch {
            attachFailed += 1
          }
        }
      }
      if (attachFailed > 0) {
        setError(`공지는 보냈지만 첨부 ${attachFailed}개가 붙지 않았습니다. 공지를 열어 다시 올려주세요.`)
      }
      setTitle('')
      setContent('')
      setClassId('')
      setPicked([])
      setPickClass('')
      setFiles([])
      setComposing(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '공지를 보내지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  /* ── 첨부 ─────────────────────────────────────────────────
   * ★ **저장 전에 올린다.** `ownerId` 없이 올려 id 를 받아 두고, 공지를 저장한 뒤 잇는다.
   *   저장부터 강제하면 **쓰다 만 공지가 쌓인다.** */
  const [files, setFiles] = useState<{ id: number; name: string }[]>([])
  const [upBusy, setUpBusy] = useState(false)

  async function onPickFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setUpBusy(true)
    setError(null)
    try {
      for (const f of Array.from(list)) {
        const r = await uploadNoticeFile(f)
        setFiles((v) => [...v, { id: r.id, name: r.fileName || f.name }])
      }
    } catch (e) {
      /* ★ 「파일 저장소가 설정되지 않았습니다」는 **우리 사정**이다 — 담당자가 할 수 있는
         일이 없는데 그대로 보여주면 무엇을 잘못했나 찾는다(CLAUDE.md 1-1).
         「이미지·PDF 만」처럼 **담당자가 고칠 수 있는** 문구는 그대로 쓴다 */
      setError(
        e instanceof ApiError
          ? e.code === 'FILE_STORAGE_NOT_CONFIGURED'
            ? '첨부는 아직 준비 중입니다.'
            : e.message
          : '첨부를 올리지 못했습니다.',
      )
    } finally {
      setUpBusy(false)
    }
  }

  /** 상단 고정·배너는 발송 후 수정으로 켠다. 바뀐 축 하나만 보낸다 */
  async function toggle(n: ApiNotice, field: 'pinned' | 'banner') {
    try {
      await patchNotice(n.id, { [field]: !n[field] })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '수정하지 못했습니다.')
    }
  }

  async function remove(id: number) {
    try {
      await deleteNotice(id)
      setRemoving(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '삭제하지 못했습니다.')
      setRemoving(null)
    }
  }

  return (
    <>
      {removing && (
        <Modal
          title={`'${removing.title}' 공지를 삭제할까요?`}
          sub="학생·학부모 앱에서도 빠집니다. 되돌릴 수 없습니다."
          confirmLabel="삭제"
          danger
          onConfirm={() => void remove(removing.id)}
          onClose={() => setRemoving(null)}
        />
      )}
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="bell" size={13} /> 이번 주 공지
          </div>
          <div className="v">{weekCount}</div>
          <div className="d">올해 {notices.length}건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="inbox" size={13} /> 행정 요청
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {REQUESTS.filter((r) => r.status !== '완료').length}
          </div>
          <div className="d warn">미처리 · <span className="mk supplement" title="준비 중입니다">표시용 예시</span></div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="message-square" size={13} /> 1:1 채팅
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            선정 대기
          </div>
          <div className="d down">메신저 선정 후 착수</div>
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
          <div className="d">대화 내용은 메신저 업체에 보관</div>
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
                      <select
                        className="sel"
                        value={scope}
                        onChange={(e) => setScope(e.target.value as 'ALL' | 'BRANCH' | 'CLASS' | 'SELECTED')}
                      >
                        {/* 전체 발송은 본사만 — 지점이 하나만 보이는 계정에는 뜨지 않는다 */}
                        {academies.length > 1 && <option value="ALL">전체 (본사)</option>}
                        <option value="BRANCH">지점</option>
                        <option value="CLASS">반</option>
                        <option value="SELECTED">학생 선택 (여러 명)</option>
                      </select>
                    </div>

                    {scope === 'CLASS' && (
                      <div className="frow">
                        <label className="req">반</label>
                        <div>
                          <select className="sel" value={classId} onChange={(e) => setClassId(e.target.value)}>
                            <option value="">선택하세요</option>
                            {classes.map((c) => (
                              <option key={c.id} value={String(c.id)}>
                                {c.name}
                                {c.homeroomTeacherName ? ` · ${c.homeroomTeacherName}` : ''}
                              </option>
                            ))}
                          </select>
                          {classes.length === 0 && <div className="hint">이 지점에 등록된 반이 없습니다.</div>}
                        </div>
                      </div>
                    )}

                    {/* ★ **공지는 한 건**이고 대상자만 여럿이다. 사람 수만큼 보내면 목록에 같은 글이
                           N개 뜨고, 오타 하나를 N번 고쳐야 하며, 「읽음 몇 명」이 N개로 쪼개진다 */}
                    {scope === 'SELECTED' && (
                      <div className="frow">
                        <label className="req">학생</label>
                        <div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <select
                              className="sel"
                              style={{ width: 150 }}
                              value={pickClass}
                              onChange={(e) => setPickClass(e.target.value)}
                            >
                              <option value="">반 전체</option>
                              {pickableClasses.map((c) => (
                                <option key={c.id} value={String(c.id)}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <input
                              className="inp"
                              style={{ flex: 1 }}
                              placeholder="이름 · 학번으로 찾기"
                              value={studentQuery}
                              onChange={(e) => setStudentQuery(e.target.value)}
                            />
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              maxHeight: 190,
                              overflow: 'auto',
                              border: '1px solid var(--line)',
                              borderRadius: 9,
                            }}
                          >
                            {pickableStudents.length === 0 && (
                              <div style={{ padding: 10, fontSize: 12.5, color: 'var(--muted)' }}>
                                {teacherOnly ? '맡은 반에 학생이 없습니다.' : '학생이 없습니다.'}
                              </div>
                            )}
                            {pickableStudents.map((st) => {
                              const id = String(st.enrollmentId)
                              const on = picked.includes(id)
                              return (
                                <label
                                  key={id}
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    padding: '5px 10px',
                                    fontSize: 12.5,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() =>
                                      setPicked((v) => (on ? v.filter((x) => x !== id) : [...v, id]))
                                    }
                                  />
                                  <span style={{ width: 92 }}>{studentNoText(st.studentNo)}</span>
                                  <span style={{ fontWeight: 600 }}>{st.name}</span>
                                  <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>
                                    {st.className ?? '미배정'}
                                  </span>
                                </label>
                              )
                            })}
                          </div>

                          <div className="hint">
                            <b>{picked.length}명 선택</b> · 고른 학생과 그 학부모에게만 갑니다.
                            {/* ★ 반을 바꿔도 고른 사람은 남는다 — 여러 반에서 골라 한 번에 보내야 한다 */}
                            {pickClass !== '' && ' 반을 바꿔도 고른 사람은 남습니다.'}
                          </div>
                          {/* ⚠️ 담임이 남의 반 학생을 **하나라도** 섞으면 서버가 **전체를 거절**한다.
                                 그래서 애초에 자기 반만 보여준다 — 고르고 나서 거절당하면 왜인지 모른다 */}
                          {teacherOnly && <div className="hint">맡은 반 학생만 고를 수 있습니다.</div>}
                        </div>
                      </div>
                    )}
                    <div className="frow">
                      <label className="req">제목</label>
                      <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div className="frow">
                      <label className="req">내용</label>
                      <textarea className="ta" value={content} onChange={(e) => setContent(e.target.value)} />
                    </div>
                    {/* ★ **저장 전에 올린다.** 저장부터 강제하면 쓰다 만 공지가 쌓인다 —
                        올린 파일은 공지를 보낼 때 붙는다 */}
                    <div className="frow">
                      <label>첨부</label>
                      <div>
                        {/* ★ 서버가 **이미지·PDF 만** 받는다. 안 적으면 고르고 나서야
                            거절당한다 — `accept` 로 **고르는 단계에서** 걸러낸다 */}
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/gif,application/pdf"
                          disabled={upBusy}
                          onChange={(e) => {
                            void onPickFiles(e.target.files)
                            e.target.value = ''
                          }}
                        />
                        {upBusy && <div className="hint">올리는 중…</div>}
                        {files.length > 0 && (
                          <div className="pick-list" style={{ maxHeight: 140, marginTop: 8 }}>
                            {files.map((f) => (
                              <label key={f.id} className="pick-row">
                                <span style={{ flex: 1 }}>{f.name}</span>
                                <button
                                  type="button"
                                  className="lnk"
                                  onClick={() => setFiles((v) => v.filter((x) => x.id !== f.id))}
                                >
                                  빼기
                                </button>
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="hint">
                          이미지(jpg·png·gif)와 PDF 만 올릴 수 있습니다. 보내기를 눌러야 공지에 붙습니다.
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button className="btn" onClick={() => setComposing(false)}>
                        취소
                      </button>
                      <button
                        className="btn pri"
                        disabled={
                          saving ||
                          !title.trim() ||
                          !content.trim() ||
                          (scope === 'BRANCH' && academyId === null) ||
                          (scope === 'CLASS' && classId === '') ||
                          /* ★ 대상이 비면 서버가 거절한다 — 먼저 막는다 */
                          (scope === 'SELECTED' && picked.length === 0)
                        }
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
                          disabled={teacherOnly}
                        >
                          {r.pinned ? '고정 해제' : '고정'}
                        </button>
                        {!teacherOnly && (
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                            onClick={() => void toggle(r, 'banner')}
                            title="배너 노출"
                          >
                            {r.banner ? '배너 끄기' : '배너'}
                          </button>
                        )}
                        {!teacherOnly && (
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: 11, color: 'var(--red)' }}
                            onClick={() => setRemoving(r)}
                          >
                            삭제
                          </button>
                        )}
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
                  !teacherOnly && (
                    <button className="btn pri" onClick={() => setComposing((v) => !v)}>
                      <Icon name="plus" size={14} /> {composing ? '작성 취소' : '공지 작성'}
                    </button>
                  )
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
                    <b> 가족 채팅방은 만들지 않아</b>, 학부모는 채팅 참여자가 아니라 알림톡
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
                    notes: ['메신저 업체 채팅 창을 이 화면에 붙입니다', '담임별 대화 목록', '읽음·미응답 알림'],
                  },
                  {
                    t: '학부모 소통',
                    code: '(채팅 아님)',
                    icon: 'message-circle',
                    members: '학부모 — 수신 전용',
                    notes: [
                      '가족 채팅방은 만들지 않습니다',
                      '출결·성적 알림은 알림톡으로 전달',
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

const composeSignal = createScreenSignal()
const inboxSignal = createScreenSignal()

/** 헤더 액션 — 담임에게는 '공지 작성' 을 내지 않는다(본문 버튼과 같은 판단) */
function HeaderActions() {
  const { teacherOnly } = useAuth()
  return (
    <>
      <button className="btn" onClick={() => inboxSignal.bump()}>
        <Icon name="inbox" size={14} /> 수신함
      </button>
      {!teacherOnly && (
        <button className="btn pri" onClick={() => composeSignal.bump()}>
          <Icon name="plus" size={14} /> 공지 작성
        </button>
      )}
    </>
  )
}

export const chatMockup: Mockup = {
  Content,
  actions: <HeaderActions />,
}
