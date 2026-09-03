import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, Unfilled, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  LECTURE_STATUS_LABEL,
  LECTURE_STATUS_TONE,
  LECTURE_TYPE_LABEL,
  listLectureApplicants,
  listLectureSessions,
  listLectures,
  promoteApplicant,
  type Lecture as ApiLecture,
  type LectureApplicant,
  type LectureSession,
} from '../../api/lectures'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.7 특강 관리 — 신규개발-요구사항보완
 * DSA '특강관리>접수>신청명단'에서 신청명단·출석부 요구사항은 검증됨.
 * '설명회 신청' 항목만 화면에 없어 보완 개발 대상.
 *
 * ⚠ 특강 개설이 만드는 것은 특강 1건이 아니다 — 3개가 동시에 생긴다.
 *   ① 특강 레코드      : 정원·기간·대상
 *   ② 회차(수업일) N건 : 출석부가 이걸 열로 쓴다. 회차 없이 개설하면 출석부를 못 만든다
 *   ③ 청구 항목        : 특강비는 수납(F-4.8)·청구기준(F-4.10-5)과 엮인다
 *   따라서 개설 폼에서 회차를 생성해두지 않으면 출석부 탭이 빈 채로 남는다.
 *
 * ⚠ 개설 후 정원을 줄이는 것은 막아야 한다.
 *   이미 신청한 인원보다 적게 줄이면 누구를 대기자로 밀어낼지 결정할 수 없다.
 *   서버에서 capacity >= applied 제약을 걸고, 줄이려면 개별 취소를 먼저 하게 한다. */

const won = (n: number) => `${n.toLocaleString()}원`

const LECTURE_COLUMNS: Column<ApiLecture>[] = [
  {
    key: 'period',
    header: '기간',
    width: '150px',
    align: 'center',
    value: (r) => r.startDate ?? '',
    render: (r) => (r.startDate ? `${r.startDate.slice(5)} ~ ${(r.endDate ?? '').slice(5)}` : '-'),
  },
  { key: 'name', header: '특강명', sortable: true, value: (r) => r.name },
  {
    key: 'lectureType',
    header: '유형',
    width: '76px',
    align: 'center',
    value: (r) => LECTURE_TYPE_LABEL[r.lectureType] ?? r.lectureType,
    render: (r) => <span className="mk supplement">{LECTURE_TYPE_LABEL[r.lectureType] ?? r.lectureType}</span>,
  },
  { key: 'teacherName', header: '담당', width: '86px', align: 'center', value: (r) => r.teacherName ?? '미지정' },
  {
    key: 'confirmedCount',
    header: '신청 / 정원',
    width: '110px',
    align: 'center',
    sortable: true,
    value: (r) => r.confirmedCount,
    render: (r) => (
      <span
        style={{
          fontWeight: 700,
          color: r.capacity !== null && r.confirmedCount >= r.capacity ? 'var(--red)' : 'var(--ink)',
        }}
      >
        {r.confirmedCount} / {r.capacity ?? '-'}
      </span>
    ),
  },
  {
    key: 'waitlistedCount',
    header: '대기',
    width: '68px',
    align: 'center',
    value: (r) => r.waitlistedCount,
    render: (r) =>
      r.waitlistedCount > 0 ? (
        <span className="mk brandnew">{r.waitlistedCount}</span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
  {
    key: 'fee',
    header: '특강비',
    width: '96px',
    align: 'right',
    value: (r) => r.fee ?? 0,
    render: (r) => (r.fee ? won(r.fee) : '무료'),
  },
  {
    key: 'status',
    header: '상태',
    width: '80px',
    align: 'center',
    sortable: true,
    value: (r) => LECTURE_STATUS_LABEL[r.status] ?? r.status,
    render: (r) => (
      <span className={`mk ${LECTURE_STATUS_TONE[r.status] ?? ''}`}>
        {LECTURE_STATUS_LABEL[r.status] ?? r.status}
      </span>
    ),
  },
  {
    key: 'visible',
    header: '앱 노출',
    width: '76px',
    align: 'center',
    // status 와 별개 축이다 — "마감됐지만 앱에는 보이는" 상태가 있다
    value: (r) => (r.visible ? '노출' : '숨김'),
    render: (r) => (
      <span style={{ color: r.visible ? 'var(--mint-d)' : 'var(--muted)', fontWeight: 700 }}>
        {r.visible ? '노출' : '숨김'}
      </span>
    ),
  },
]

/* ── 신청 명단 / 대기자 ── */

/** 순번은 응답에 없다. 화면에서 조회 순서대로 매긴다 */
interface ApplicantRow extends LectureApplicant {
  seq: number
}

const APPLICANT_COLUMNS: Column<ApplicantRow>[] = [
  { key: 'seq', header: '순번', width: '64px', align: 'center', sortable: true, value: (r) => r.seq },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo ?? '-' },
  { key: 'studentName', header: '이름', width: '84px', mask: 'name', value: (r) => r.studentName },
  { key: 'className', header: '반', width: '56px', align: 'center', value: (r) => r.className ?? '-' },
  { key: 'phone', header: '연락처', width: '128px', mask: 'phone', value: (r) => r.phone ?? '-' },
  {
    key: 'appliedAt',
    header: '신청일',
    width: '120px',
    sortable: true,
    value: (r) => r.appliedAt ?? '',
    render: (r) => (r.appliedAt ? r.appliedAt.slice(0, 10) : '-'),
  },
  {
    key: 'paid',
    header: '수납',
    width: '80px',
    align: 'center',
    // 특강비 수납 여부는 청구(F-4.8) 쪽 데이터다. 신청자 응답에는 없다
    value: () => '',
    render: () => <Unfilled reason="수납 여부는 청구 도메인이라 신청자 응답에 없다" />,
  },
]

/* ── 출석부 ── */

/* ══ 특강 개설 ══ */

const TEACHERS = ['김유진', '최지원', '이장원', '박서영', '정하람']
const ROOMS = ['201호', '202호', '301호', '302호', '401호']
const TRACK_TARGETS = ['전체', '자연계열', '인문계열']
const DOW_LABELS = ['월', '화', '수', '목', '금', '토']

interface LectureDraft {
  name: string
  month: string
  teacher: string
  room: string
  capacity: number
  fee: number
  target: string
  /** 수업 요일 — 회차 자동 생성에 쓴다 */
  dows: number[]
  startDate: string
  endDate: string
  applyFrom: string
  applyTo: string
  /** 정원 초과 시 대기자 접수 허용 */
  allowWaiting: boolean
  /** 설명회 신청도 함께 받을지 — 보완 개발 항목 */
  withBriefing: boolean
  memo: string
}

const EMPTY_DRAFT: LectureDraft = {
  name: '',
  month: '2026-07',
  teacher: TEACHERS[0],
  room: ROOMS[0],
  capacity: 25,
  fee: 280000,
  target: '전체',
  dows: [1, 3],
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  applyFrom: '2026-06-15',
  applyTo: '2026-06-28',
  allowWaiting: true,
  withBriefing: false,
  memo: '',
}

/** 기간 + 요일 → 회차(수업일) 목록. 출석부의 열이 된다 */
function buildSessions(d: LectureDraft): string[] {
  const start = new Date(`${d.startDate}T00:00:00`)
  const end = new Date(`${d.endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const out: string[] = []
  const cur = new Date(start)
  // 상한을 둬서 잘못된 기간 입력에도 루프가 폭주하지 않게 한다
  while (cur <= end && out.length < 60) {
    if (d.dows.includes(cur.getDay())) {
      out.push(`${String(cur.getMonth() + 1).padStart(2, '0')}/${String(cur.getDate()).padStart(2, '0')}`)
    }
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function Content() {
  const [tab, setTab] = useState('list')
  const [masked, setMasked] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [draft, setDraft] = useState<LectureDraft | null>(null)

  /* ── 실연동 ── */
  const { academyId } = useAcademy()
  const [lectures, setLectures] = useState<ApiLecture[]>([])
  const [lectureId, setLectureId] = useState<number | null>(null)
  const [applicants, setApplicants] = useState<LectureApplicant[]>([])
  const [sessionList, setSessionList] = useState<LectureSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadLectures = useCallback(async () => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const list = await listLectures(academyId, new Date().getFullYear())
      setLectures(list)
      setLectureId((prev) => (list.some((l) => l.id === prev) ? prev : (list[0]?.id ?? null)))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '특강 목록을 불러오지 못했습니다.')
      setLectures([])
    } finally {
      setLoading(false)
    }
  }, [academyId])

  useEffect(() => {
    void loadLectures()
  }, [loadLectures])

  // 선택한 특강의 신청자·회차. 목록에서 특강을 고르면 아래 탭이 그 특강 기준이 된다
  useEffect(() => {
    if (lectureId === null) {
      setApplicants([])
      setSessionList([])
      return
    }
    let cancelled = false
    void Promise.all([listLectureApplicants(lectureId), listLectureSessions(lectureId)])
      .then(([apps, sess]) => {
        if (cancelled) return
        setApplicants(apps)
        setSessionList(sess)
      })
      .catch(() => {
        if (cancelled) return
        setApplicants([])
        setSessionList([])
      })
    return () => {
      cancelled = true
    }
  }, [lectureId])

  const applied: ApplicantRow[] = useMemo(
    () => applicants.filter((a) => !a.waitlisted).map((a, i) => ({ ...a, seq: i + 1 })),
    [applicants],
  )
  const waiting: ApplicantRow[] = useMemo(
    () => applicants.filter((a) => a.waitlisted).map((a, i) => ({ ...a, seq: i + 1 })),
    [applicants],
  )

  const selectedLecture = lectures.find((l) => l.id === lectureId) ?? null

  async function promote(applicationId: number) {
    try {
      await promoteApplicant(applicationId)
      if (lectureId !== null) setApplicants(await listLectureApplicants(lectureId))
      await loadLectures()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '대기자를 확정하지 못했습니다.')
    }
  }

  const sessions = useMemo(() => (draft ? buildSessions(draft) : []), [draft])

  function patch(p: Partial<LectureDraft>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  function toggleDow(n: number) {
    setDraft((d) => (d ? { ...d, dows: d.dows.includes(n) ? d.dows.filter((x) => x !== n) : [...d.dows, n].sort() } : d))
  }

  /* ══ 특강 개설 폼 ══ */
  if (draft) {
    const valid = draft.name.trim().length > 0 && sessions.length > 0
    return (
      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="calendar-plus" size={15} />
            </span>
            특강 개설
          </div>
          <div className="r">
            <button className="btn" onClick={() => setDraft(null)}>
              취소
            </button>
            <button className="btn" disabled={!valid}>
              <Icon name="save" size={14} /> 임시 저장
            </button>
            <button className="btn pri" disabled={!valid}>
              <Icon name="send" size={14} /> 개설 · 접수 시작
            </button>
          </div>
        </div>

        <div className="card-sec-b">
          <div className="split-3-2">
            {/* ── 기본 정보 ── */}
            <div>
              <div className="frow">
                <label className="req">특강명</label>
                <input
                  className="inp"
                  value={draft.name}
                  placeholder="예: 수학 미적 킬러문항 특강"
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>

              <div className="frow">
                <label className="req">담당 강사</label>
                <select className="sel" value={draft.teacher} onChange={(e) => patch({ teacher: e.target.value })}>
                  {TEACHERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="frow">
                <label className="req">강의실</label>
                <select className="sel" value={draft.room} onChange={(e) => patch({ room: e.target.value })}>
                  {ROOMS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="frow">
                <label className="req">수강 대상</label>
                <div className="type-picks">
                  {TRACK_TARGETS.map((t) => (
                    <button
                      type="button"
                      key={t}
                      className={`type-pick${draft.target === t ? ' on' : ''}`}
                      onClick={() => patch({ target: t })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="frow">
                <label className="req">정원 · 특강비</label>
                <div className="two">
                  <input
                    className="inp"
                    type="number"
                    min={1}
                    value={draft.capacity}
                    onChange={(e) => patch({ capacity: Number(e.target.value) })}
                  />
                  <input
                    className="inp"
                    type="number"
                    step={10000}
                    value={draft.fee}
                    onChange={(e) => patch({ fee: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="frow">
                <label className="req">수업 기간</label>
                <div className="two">
                  <input className="inp" type="date" value={draft.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
                  <input className="inp" type="date" value={draft.endDate} onChange={(e) => patch({ endDate: e.target.value })} />
                </div>
              </div>

              <div className="frow">
                <label className="req">수업 요일</label>
                <div className="sf-chips">
                  {DOW_LABELS.map((d, i) => {
                    const n = i + 1
                    return (
                      <button
                        type="button"
                        key={d}
                        className={`chip${draft.dows.includes(n) ? ' on' : ''}`}
                        onClick={() => toggleDow(n)}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="frow">
                <label>접수 기간</label>
                <div className="two">
                  <input className="inp" type="date" value={draft.applyFrom} onChange={(e) => patch({ applyFrom: e.target.value })} />
                  <input className="inp" type="date" value={draft.applyTo} onChange={(e) => patch({ applyTo: e.target.value })} />
                </div>
              </div>

              <div className="frow">
                <label>옵션</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={draft.allowWaiting}
                      onChange={(e) => patch({ allowWaiting: e.target.checked })}
                    />
                    정원 초과 시 대기자 접수
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={draft.withBriefing}
                      onChange={(e) => patch({ withBriefing: e.target.checked })}
                    />
                    설명회 신청도 함께 받기
                    <span className="mk brandnew">보완 개발</span>
                  </label>
                </div>
              </div>

              <div className="frow">
                <label>비고</label>
                <textarea
                  className="ta"
                  value={draft.memo}
                  placeholder="교재·준비물·유의사항 등"
                  onChange={(e) => patch({ memo: e.target.value })}
                />
              </div>
            </div>

            {/* ── 회차 미리보기 ── */}
            <div className="card-sec" style={{ marginBottom: 0 }}>
              <div className="card-sec-h">
                <div className="t">
                  <span className="ico">
                    <Icon name="calendar-check" size={15} />
                  </span>
                  회차 미리보기
                </div>
                <div className="r">
                  <span className={`mk ${sessions.length ? 'verified' : 'brandnew'}`}>{sessions.length}회차</span>
                </div>
              </div>
              <div className="card-sec-b">
                {sessions.length === 0 ? (
                  <div className="mock-stub" style={{ padding: '28px 18px' }}>
                    <div className="t">회차가 생성되지 않았습니다</div>
                    <div className="x">수업 기간과 요일을 확인하세요. 회차가 없으면 출석부를 만들 수 없어 개설할 수 없습니다.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {sessions.map((s, i) => (
                      <span
                        key={s}
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: '5px 10px',
                          borderRadius: 8,
                          background: 'var(--mint-wash)',
                          color: 'var(--mint-d)',
                        }}
                      >
                        {i + 1}. {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className="kv" style={{ marginTop: 16 }}>
                  <div className="row">
                    <span className="k">총 수강료</span>
                    <span className="v">
                      <b>{draft.fee.toLocaleString()}원</b>
                      <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                        {' '}
                        · 회당 {sessions.length ? Math.round(draft.fee / sessions.length).toLocaleString() : 0}원
                      </span>
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">최대 매출</span>
                    <span className="v">{(draft.fee * draft.capacity).toLocaleString()}원</span>
                  </div>
                  <div className="row">
                    <span className="k">강의실</span>
                    <span className="v">
                      {draft.room} · {draft.target}
                    </span>
                  </div>
                </div>

                <div className="note-box plain" style={{ marginTop: 14, marginBottom: 0 }}>
                  <div className="ic">
                    <Icon name="info" size={17} />
                  </div>
                  <div>
                    <div className="tt">개설하면 3가지가 함께 생성됩니다</div>
                    <div className="tx">
                      <b>① 특강</b> · <b>② 회차 {sessions.length}건</b>(출석부의 열) · <b>③ 청구 항목</b>(수납 연동).
                      <br />
                      회차 없이는 출석부를 만들 수 없어 <b>개설 자체가 막힙니다.</b>
                      <br />
                      개설 후 <b>정원을 신청 인원보다 적게 줄일 수 없습니다</b> — 누구를 대기자로 밀어낼지 결정할 수 없기
                      때문이며, 서버에서 제약으로 막습니다.
                    </div>
                  </div>
                </div>

                <div className="blocked-note" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="ic">
                    <Icon name="triangle-alert" size={16} />
                  </div>
                  <div>
                    <div className="tt">강의실 중복 확인이 필요합니다</div>
                    <div className="tx">
                      같은 시간대에 <b>{draft.room}</b>이 반 시간표(고정수업·이동수업)에 이미 배정돼 있을 수 있습니다.
                      서버에서 <code>(요일, 교시, 강의실)</code> 충돌을 검사한 뒤 개설을 확정해야 합니다.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="presentation" size={13} /> 개설 특강
          </div>
          <div className="v">{lectures.length}</div>
          <div className="d">{new Date().getFullYear()}년</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 총 신청
          </div>
          <div className="v">{lectures.reduce((a, l) => a + l.confirmedCount, 0)}</div>
          <div className="d">건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="list-ordered" size={13} /> 대기자
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {lectures.reduce((a, l) => a + l.waitlistedCount, 0)}
          </div>
          <div className="d warn">정원 초과분</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="banknote" size={13} /> 특강비 수납
          </div>
          {/* 수납 여부는 청구 도메인이라 특강 응답에 없다 */}
          <div className="v" style={{ fontSize: 14, paddingTop: 8 }}>
            <Unfilled reason="특강비 수납 현황은 청구 도메인이다" />
          </div>
          <div className="d">수납현황(F-4.8) 참조</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="megaphone" size={13} /> 설명회 신청
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            보완 개발
          </div>
          <div className="d warn">DSA 대응 화면 없음</div>
        </div>
      </div>

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '특강 목록', count: lectures.length },
            { key: 'apply', label: '신청 명단', count: applied.length },
            { key: 'wait', label: '대기자', count: waiting.length },
            { key: 'att', label: '출석부' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {tab === 'list' && (
            <DataTable
              columns={LECTURE_COLUMNS}
              rows={lectures}
              rowKey={(r) => String(r.id)}
              masked={false}
              loading={loading}
              pageSize={10}
              onRowClick={(r) => setLectureId(r.id)}
              emptyText={academyId === null ? '지점을 먼저 선택하세요.' : '등록된 특강이 없습니다.'}
              countLabel={
                <>
                  특강 <b>{lectures.length}</b>건
                  {selectedLecture && (
                    <span style={{ color: 'var(--muted)' }}> · 선택: {selectedLecture.name}</span>
                  )}
                </>
              }
              toolbar={
                <>
                  <ExcelButton filename="특강_목록" columns={LECTURE_COLUMNS} rows={lectures} masked={false} />
                  <button className="btn pri" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                    <Icon name="plus" size={14} /> 특강 개설
                  </button>
                </>
              }
            />
          )}

          {(tab === 'apply' || tab === 'wait') && (
            <DataTable
              columns={APPLICANT_COLUMNS}
              rows={tab === 'apply' ? applied : waiting}
              rowKey={(r) => String(r.applicationId)}
              selectable
              selected={selected}
              onSelectedChange={setSelected}
              masked={masked}
              pageSize={12}
              emptyText={selectedLecture ? '해당하는 인원이 없습니다.' : '특강 목록에서 특강을 먼저 선택하세요.'}
              countLabel={
                <>
                  {selectedLecture?.name ?? '특강 미선택'} · {tab === 'apply' ? '신청자' : '대기자'}{' '}
                  <b>{(tab === 'apply' ? applied : waiting).length}</b>명
                </>
              }
              toolbar={
                <>
                  {/* 대기자 → 확정. 서버가 한 건씩 받으므로 순차로 보낸다 */}
                  <button
                    className="btn"
                    disabled={selected.length === 0 || tab !== 'wait'}
                    title={tab === 'wait' ? '선택한 대기자를 확정으로 올립니다' : '대기자 탭에서 사용합니다'}
                    onClick={() => {
                      void (async () => {
                        for (const id of selected) await promote(Number(id))
                        setSelected([])
                      })()
                    }}
                  >
                    <Icon name="arrow-right" size={14} /> 선택 확정
                  </button>
                  <button className="btn" disabled={selected.length === 0}>
                    수납청구
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton
                    filename={tab === 'apply' ? '특강_신청명단' : '특강_대기자'}
                    columns={APPLICANT_COLUMNS}
                    rows={tab === 'apply' ? applied : waiting}
                    masked={masked}
                  />
                </>
              }
            />
          )}

          {tab === 'att' && (
            <div className="dt-wrap">
              <div className="dt-toolbar">
                <span className="dt-count">
                  {selectedLecture?.name ?? '특강 미선택'} · <b>{sessionList.length}</b>회차
                </span>
                <div className="dt-right">
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <button className="btn">
                    <Icon name="printer" size={14} /> 출석부 인쇄
                  </button>
                </div>
              </div>
              <div className="dt-scroll">
                <table className="dt">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>학번</th>
                      <th style={{ width: 84 }}>이름</th>
                      <th style={{ width: 56 }} className="al-center">
                        반
                      </th>
                      {sessionList.map((se) => (
                        <th key={se.id} className="al-center" style={{ width: 68 }} title={se.room ?? ''}>
                          {se.sessionDate.slice(5)}
                        </th>
                      ))}
                      <th className="al-center" style={{ width: 80 }}>
                        출석률
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {applied.map((a) => (
                      <tr key={a.applicationId}>
                        <td>{a.studentNo ?? '-'}</td>
                        <td className="masked">
                          {masked ? `${a.studentName[0]}*${a.studentName.slice(2)}` : a.studentName}
                        </td>
                        <td className="al-center">{a.className ?? '-'}</td>
                        {/* 출결 표시는 회차별 조회(sessions/{id}/attendances)를 붙여야 한다 */}
                        {sessionList.map((se) => (
                          <td key={se.id} className="al-center">
                            <Unfilled reason="회차별 출결 조회 연동 전" />
                          </td>
                        ))}
                        <td className="al-center">
                          <Unfilled reason="출석률은 회차 출결이 있어야 계산된다" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export const lectureMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-06 ▾</button>
      <button className="btn">
        <Icon name="megaphone" size={14} /> 설명회 신청 관리
      </button>
    </>
  ),
}
