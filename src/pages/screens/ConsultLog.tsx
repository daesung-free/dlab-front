import { useCallback, useEffect, useMemo, useState } from 'react'
import { StudentList, type StudentRow } from '../../components/StudentList'
import { StudentHeader } from '../../components/StudentHeader'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { addDaysStr, toDateStr, todayStr } from '../../components/common'
import { ApiError } from '../../api/client'
import { AcademyExams } from '../../components/AcademyExams'
import { getAcademyExam, listAcademyExams } from '../../api/grades'
import { fetchStudentPenalties, type StudentPenalties } from '../../api/penalties'
import {
  ATTENDANCE_STATUS_LABEL,
  fetchAttendanceBoard,
  type AttendanceRow,
  type AttendanceStatus,
} from '../../api/attendance'
import { clearDraft, loadDraft, saveDraft } from '../../lib/draft'
import { useAcademy } from '../../auth/AcademyContext'
import {
  CONSULT_METHOD_LABEL,
  PARENT_SHARE_LABEL,
  CONSULT_TYPE_CLASS,
  CONSULT_TYPE_LABEL,
  listConsultStatus,
  listStudentConsults,
  writeConsult,
  type ConsultLog as ConsultLogRow,
  type ConsultMethod,
  type ConsultStatusRow,
  type ConsultType,
  type ParentShare,
} from '../../api/consults'
import type { Mockup } from './types'
import '../../styles/forms.css'
import './consult.css'

/* F-4.11-4 상담(일지·리포트) — /api/v1/admin/consults
 *
 * 좌: 재원생 목록(누가 상담이 밀렸는가) · 우: 그 학생의 상담 이력 + 새 일지 작성
 *
 * ★ 좌측 목록은 /consults/status 다. 학생 검색이 아니라 **상담 관점의 목록**이라
 *   마지막 상담일·지연일수·미상담 여부가 같이 온다. 필터가 그 값으로 걸린다.
 *
 * ★ 서버에 없어서 못 붙인 것 — docs/API_GAPS.md 참고
 *   · 성적 스트립(국어/수학/영어/탐구 등급) — 성적 도메인이라 묶음 F에서 붙인다
 *   · 상세 탭 3개(성적 추이 · 출결·상벌점 · 학부모 공유내역) — 2026-09-21 붙임. 성적은 디랩 시험 조회,
 *     출결은 지점 출결을 기간·학번으로 좁혀 그 학생만, 상벌점은 학생별 조회, 공유내역은 받은 이력에서 거른다
 *
 * ★ 작성자는 **서버가 로그인 주체로 채운다**(2026-09-03). 클라이언트가 안 보낸다 —
 *   남의 id 를 보낼 수 없으니 이 편이 안전하다. */

const CONSULT_TYPES: ConsultType[] = ['REGULAR', 'SCORE', 'LIFE', 'ADMISSION', 'PARENT']
const METHODS: ConsultMethod[] = ['FACE', 'PHONE', 'ONLINE']

const FILTERS = ['전체', '상담 필요', '미상담'] as const
type Filter = (typeof FILTERS)[number]

const DETAIL_TABS = [
  { key: 'log', label: '상담 이력' },
  { key: 'score', label: '성적 추이' },
  { key: 'att', label: '출결 · 상벌점' },
  { key: 'share', label: '학부모 공유내역' },
]

function today(): string {
  return todayStr()
}

/** 상담 현황 → 좌측 목록 행 */
function toRow(s: ConsultStatusRow): StudentRow {
  const meta = [s.className ?? '반 미배정', s.studentNo ?? ''].filter(Boolean).join(' · ')
  return {
    id: String(s.enrollmentId),
    name: s.name,
    meta,
    tag: s.neverConsulted
      ? { label: '미상담', tone: 'risk' }
      : s.lastConsultType
        ? { label: CONSULT_TYPE_LABEL[s.lastConsultType], tone: 'na' }
        : undefined,
    due: s.overdueDays > 0 ? `지연 ${s.overdueDays}일` : undefined,
    date: s.lastConsultedAt ?? '기록 없음',
    warn: s.overdueDays > 0,
  }
}

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('log')
  const [filter, setFilter] = useState<Filter>('전체')
  const [status, setStatus] = useState<ConsultStatusRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<ConsultLogRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* 작성 폼 */
  const [type, setType] = useState<ConsultType>('REGULAR')
  const [method, setMethod] = useState<ConsultMethod>('FACE')
  const [placeNote, setPlaceNote] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [parentShare, setParentShare] = useState<ParentShare>('NONE')
  const [content, setContent] = useState('')
  const [actionPlan, setActionPlan] = useState('')
  const [nextDueDate, setNextDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (academyId === null) {
      setListLoading(false)
      return
    }
    setListLoading(true)
    try {
      const rows = await listConsultStatus(academyId)
      setStatus(rows)
      // 지점을 바꾸면 이전 선택이 새 목록에 없다 — 그대로 두면 남의 지점 학생 상담일지가 오른쪽에 남는다
      setSelectedId((prev) =>
        prev !== null && rows.some((r) => String(r.enrollmentId) === prev)
          ? prev
          : rows[0]
            ? String(rows[0].enrollmentId)
            : null,
      )
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '상담 현황을 불러오지 못했습니다.')
    } finally {
      setListLoading(false)
    }
  }, [academyId])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  // 선택한 학생의 상담 이력
  useEffect(() => {
    if (selectedId === null) {
      setLogs([])
      return
    }
    let cancelled = false
    listStudentConsults(Number(selectedId))
      .then((list) => !cancelled && setLogs(list))
      .catch(() => !cancelled && setLogs([]))
    return () => {
      cancelled = true
    }
  }, [selectedId])

  /*
   * 임시저장 — 학생별. 학생을 바꾸면 그 학생 것을 불러오고 없으면 비운다.
   * ★ 예전엔 폼을 안 비워서 A 학생에게 쓰던 내용이 B 학생을 눌러도 그대로 남았다(그대로 저장하면
   *   남의 학생 일지가 된다).
   */
  type ConsultDraft = {
    type: ConsultType
    method: ConsultMethod
    placeNote: string
    durationMinutes: string
    parentShare: ParentShare
    content: string
    actionPlan: string
    nextDueDate: string
  }
  useEffect(() => {
    if (selectedId === null) return
    const d = loadDraft<ConsultDraft>(`consult.${selectedId}`)
    setType(d?.type ?? 'REGULAR')
    setMethod(d?.method ?? 'FACE')
    setPlaceNote(d?.placeNote ?? '')
    setDurationMinutes(d?.durationMinutes ?? '')
    setParentShare(d?.parentShare ?? 'NONE')
    setContent(d?.content ?? '')
    setActionPlan(d?.actionPlan ?? '')
    setNextDueDate(d?.nextDueDate ?? '')
    setSaveMsg(d ? `${d.savedAt}에 임시저장한 내용을 불러왔습니다.` : null)
  }, [selectedId])

  function saveTemp() {
    if (selectedId === null) return
    const at = saveDraft<ConsultDraft>(`consult.${selectedId}`, {
      type,
      method,
      placeNote,
      durationMinutes,
      parentShare,
      content,
      actionPlan,
      nextDueDate,
    })
    setSaveMsg(
      at
        ? `${at} 임시저장했습니다. 이 컴퓨터에서만 다시 불러올 수 있습니다.`
        : '임시저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.',
    )
  }

  const filtered = useMemo(() => {
    if (filter === '상담 필요') return status.filter((s) => s.overdueDays > 0)
    if (filter === '미상담') return status.filter((s) => s.neverConsulted)
    return status
  }, [status, filter])

  const selected = status.find((s) => String(s.enrollmentId) === selectedId) ?? null

  async function save() {
    if (selected === null || content.trim() === '') return
    setSaving(true)
    setSaveMsg(null)
    try {
      await writeConsult({
        enrollmentId: selected.enrollmentId,
        consultType: type,
        method,
        consultedAt: today(),
        placeNote: placeNote.trim() || undefined,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        parentShare,
        content: content.trim(),
        actionPlan: actionPlan.trim() || undefined,
        nextDueDate: nextDueDate.trim() || undefined,
      })
      setContent('')
      setActionPlan('')
      setPlaceNote('')
      setDurationMinutes('')
      setParentShare('NONE')
      setNextDueDate('')
      clearDraft(`consult.${selected.enrollmentId}`)
      setSaveMsg('상담일지를 저장했습니다.')
      setLogs(await listStudentConsults(selected.enrollmentId))
      await loadStatus()
    } catch (err) {
      setSaveMsg(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-consult">
      <div className="layout">
        <StudentList
          title="재원생"
          count={`전체 ${status.length}명`}
          filters={[...FILTERS]}
          filter={filter}
          onFilterChange={(f) => setFilter(f as Filter)}
          rows={filtered.map(toRow)}
          selected={selectedId ?? undefined}
          onSelect={setSelectedId}
          loading={listLoading}
          emptyText={academyId === null ? '지점을 먼저 선택하세요.' : '해당하는 학생이 없습니다.'}
        />

        <section className="panel">
          {error && (
            <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <StudentHeader
            name={selected?.name ?? '—'}
            code={selected?.studentNo ?? '—'}
            sub={
              selected ? (
                <>
                  {selected.className ?? '반 미배정'} · <b>담임</b> {selected.homeroomTeacherName ?? '미지정'} ·{' '}
                  마지막 상담 {selected.lastConsultedAt ?? '없음'}
                </>
              ) : (
                '학생을 선택하세요'
              )
            }
            right={
              selected && selected.overdueDays > 0 ? (
                <div className="risk-badge">
                  <Icon name="alert-circle" size={13} /> 상담 지연 {selected.overdueDays}일
                </div>
              ) : undefined
            }
          />

          {/* 성적 요약 — 가장 최근 디랩 시험의 과목 등급 */}
          <div className="score-strip">
            <div className="sc" style={{ gridColumn: '1 / -1' }}>
              <div className="l">성적 요약</div>
              <div className="v" style={{ fontSize: 13 }}>
                {selected ? <LatestExam key={selected.enrollmentId} enrollmentId={selected.enrollmentId} /> : '-'}
              </div>
            </div>
          </div>

          <Tabs items={DETAIL_TABS} active={tab} onChange={setTab} />

          <div className="panel-body">
            {tab === 'score' ? (
              selected ? (
                <AcademyExams key={selected.enrollmentId} enrollmentId={selected.enrollmentId} />
              ) : null
            ) : tab === 'att' ? (
              selected ? (
                <AttPenalty key={selected.enrollmentId} enrollmentId={selected.enrollmentId} studentNo={selected.studentNo} />
              ) : null
            ) : tab === 'share' ? (
              /* 학부모에게 공유한 상담만 — 이미 받은 이력에서 거른다(따로 부르지 않는다) */
              <div className="timeline">
                {logs.filter((e) => e.parentShare && e.parentShare !== 'NONE').length === 0 && (
                  <div className="dt-empty">학부모와 공유한 상담이 없습니다.</div>
                )}
                {logs
                  .filter((e) => e.parentShare && e.parentShare !== 'NONE')
                  .map((e) => (
                    <div className="entry" key={e.id}>
                      <div className="ecard">
                        <div className="ecard-h">
                          <span className={`ty ${CONSULT_TYPE_CLASS[e.consultType]}`}>{CONSULT_TYPE_LABEL[e.consultType]}</span>
                          <span className="dt">{e.consultedAt}</span>
                          <span className="who">
                            {e.teacherName ?? '작성자 미기록'} · 학부모 공유: {PARENT_SHARE_LABEL[e.parentShare as ParentShare]}
                          </span>
                        </div>
                        <div className="ecard-b">
                          <div className="esec">
                            <div className="sl">상담 내용</div>
                            <div className="sx">{e.content}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <>
                {/* ── 새 상담일지 작성 ── */}
                <div className="composer">
                  <div className="comp-h">
                    <div className="t">
                      <Icon name="pencil" size={15} /> 새 상담일지 작성
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--mint-d)' }}>{today()}</div>
                  </div>

                  <div className="comp-body">
                    <div className="frow">
                      <label className="req">상담 유형</label>
                      <div className="type-picks">
                        {CONSULT_TYPES.map((t) => (
                          <button
                            type="button"
                            key={t}
                            className={`type-pick${type === t ? ' on' : ''}`}
                            onClick={() => setType(t)}
                          >
                            {CONSULT_TYPE_LABEL[t]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="frow">
                      <label className="req">상담 방식</label>
                      <div className="two">
                        <select className="sel" value={method} onChange={(e) => setMethod(e.target.value as ConsultMethod)}>
                          {METHODS.map((m) => (
                            <option key={m} value={m}>
                              {CONSULT_METHOD_LABEL[m]}
                            </option>
                          ))}
                        </select>
                        <div className="two">
                          <input
                            className="inp"
                            type="number"
                            min={1}
                            value={durationMinutes}
                            onChange={(e) => setDurationMinutes(e.target.value)}
                            placeholder="소요시간(분)"
                          />
                          <input
                            className="inp"
                            value={placeNote}
                            onChange={(e) => setPlaceNote(e.target.value)}
                            placeholder="장소 (예: 상담실 2)"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="frow">
                      <label className="req">상담 내용</label>
                      <textarea
                        className="ta"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="상담에서 다룬 내용을 기록하세요. (학생 상태, 학습 현황, 논의사항)"
                      />
                    </div>

                    <div className="frow">
                      <label>합의 · 다음 행동</label>
                      <textarea
                        className="ta"
                        style={{ minHeight: 56 }}
                        value={actionPlan}
                        onChange={(e) => setActionPlan(e.target.value)}
                        placeholder="학생과 합의한 실행 계획 (Action)"
                      />
                    </div>

                    <div className="frow">
                      <label>후속 상담</label>
                      <div className="two">
                        <input
                          className="inp"
                          type="date"
                          value={nextDueDate}
                          onChange={(e) => setNextDueDate(e.target.value)}
                          placeholder="다음 상담 예정일"
                        />
                        <select
                          className="sel"
                          value={parentShare}
                          onChange={(e) => setParentShare(e.target.value as ParentShare)}
                        >
                          {(['NONE', 'SUMMARY', 'FULL'] as ParentShare[]).map((v) => (
                            <option key={v} value={v}>
                              학부모 공유: {PARENT_SHARE_LABEL[v]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="comp-foot">
                    <div className="hint">
                      {saveMsg ?? '저장 시 학생 앱 · 학부모 앱(공유 설정에 따라)에 즉시 반영됩니다.'}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={saving || selected === null}
                        onClick={saveTemp}
                        title="이 컴퓨터에 잠시 저장합니다. 학생 앱에는 나가지 않습니다"
                      >
                        임시저장
                      </button>
                      <button
                        className="btn pri"
                        disabled={selected === null || content.trim() === '' || saving}
                        onClick={() => void save()}
                      >
                        {saving ? '저장 중…' : '상담일지 저장'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── 상담 이력 타임라인 ── */}
                <div className="tl-head">
                  <div className="t">상담 이력 {logs.length > 0 && `(${logs.length})`}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>최신순</div>
                </div>

                <div className="timeline">
                  {logs.length === 0 && <div className="dt-empty">상담 기록이 없습니다.</div>}
                  {logs.map((e) => (
                    <div className={`entry ${CONSULT_TYPE_CLASS[e.consultType] === 'scr' ? 'sc' : ''}`} key={e.id}>
                      <div className="ecard">
                        <div className="ecard-h">
                          <span className={`ty ${CONSULT_TYPE_CLASS[e.consultType]}`}>
                            {CONSULT_TYPE_LABEL[e.consultType]}
                          </span>
                          <span className="dt">{e.consultedAt}</span>
                          <span className="who">
                            {e.teacherName ?? '작성자 미기록'}
                            {e.method && ` · ${CONSULT_METHOD_LABEL[e.method]}`}
                            {e.durationMinutes ? ` · ${e.durationMinutes}분` : ''}
                            {e.placeNote && ` · ${e.placeNote}`}
                          </span>
                        </div>
                        <div className="ecard-b">
                          <div className="esec">
                            <div className="sl">상담 내용</div>
                            <div className="sx">{e.content}</div>
                          </div>
                          {e.actionPlan && (
                            <div className="esec">
                              <div className="sl">합의 · 다음 행동</div>
                              <span className={`action-tag${e.actionDone ? ' done-tag' : ''}`}>
                                <Icon name="check" size={13} /> {e.actionDone ? '완료 — ' : ''}
                                {e.actionPlan}
                              </span>
                            </div>
                          )}
                          {e.nextDueDate && (
                            <div className="esec">
                              <div className="sl">다음 상담 예정</div>
                              <div className="sx">{e.nextDueDate}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

/** 성적 요약 한 줄 — 가장 최근 디랩 시험의 과목 등급. 없으면 없다고 적는다 */
function LatestExam({ enrollmentId }: { enrollmentId: number }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    listAcademyExams(enrollmentId)
      .then(async (ex) => {
        if (ex.length === 0) return alive && setText('반영된 디랩 시험이 없습니다')
        const d = await getAcademyExam(enrollmentId, ex[0].examMasterId)
        const grades = d.subjects
          .filter((x) => x.gradeLevel !== null)
          .map((x) => `${x.subjectName} ${x.gradeLevel}`)
          .join(' · ')
        if (alive) setText(`${d.exam.examName} — ${grades || '등급 없음'}`)
      })
      .catch(() => alive && setText('성적을 불러오지 못했습니다'))
    return () => {
      alive = false
    }
  }, [enrollmentId])
  return <>{text ?? '불러오는 중…'}</>
}

/**
 * 출결 · 상벌점 — 최근 30일 출결 요약과 상벌점 내역.
 * ★ 학생 한 명 출결 조회가 따로 없어 지점 출결을 기간·학번으로 좁혀 받고 그 학생 줄만 남긴다.
 */
function AttPenalty({ enrollmentId, studentNo }: { enrollmentId: number; studentNo: string | null }) {
  const { academyId } = useAcademy()
  const [att, setAtt] = useState<AttendanceRow[] | null>(null)
  const [pen, setPen] = useState<StudentPenalties | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const to = todayStr()
  const from = addDaysStr(new Date(), -29)

  useEffect(() => {
    let alive = true
    if (academyId !== null) {
      fetchAttendanceBoard({ academyId, from, to, keyword: studentNo ?? undefined })
        .then((b) => alive && setAtt(b.rows.filter((r) => r.enrollmentId === enrollmentId)))
        .catch(() => alive && setAtt([]))
    }
    fetchStudentPenalties(enrollmentId)
      .then((b) => alive && setPen(b))
      .catch((e) => alive && setErr(e instanceof ApiError ? e.message : '상벌점을 불러오지 못했습니다.'))
    return () => {
      alive = false
    }
  }, [academyId, enrollmentId, studentNo, from, to])

  const count = (st: AttendanceStatus) => (att ?? []).filter((r) => r.status === st).length

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>최근 30일 출결</div>
        {att === null ? (
          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>불러오는 중…</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['ON_TIME', 'LATE', 'EARLY_LEAVE', 'OUT', 'ABSENT'] as AttendanceStatus[]).map((st) => (
              <span key={st} className={`mk ${st === 'ON_TIME' ? 'verified' : st === 'ABSENT' ? 'brandnew' : 'supplement'}`}>
                {ATTENDANCE_STATUS_LABEL[st]} {count(st)}
              </span>
            ))}
            <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
              {from} ~ {to} · {att.length}일 기록
            </span>
          </div>
        )}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          상벌점
          {pen && (
            <span style={{ fontWeight: 500, fontSize: 12, marginLeft: 8 }}>
              상점 <b style={{ color: 'var(--mint-d)' }}>+{pen.rows.filter((r) => r.point > 0).reduce((n, r) => n + r.point, 0)}</b>{' '}
              · 벌점 <b style={{ color: 'var(--red)' }}>{pen.rows.filter((r) => r.point < 0).reduce((n, r) => n + r.point, 0)}</b> · 합계{' '}
              <b>{pen.totalPoints > 0 ? `+${pen.totalPoints}` : pen.totalPoints}</b>
            </span>
          )}
        </div>
        {err && <div style={{ color: 'var(--red)', fontSize: 12.5 }}>{err}</div>}
        {pen === null && !err ? (
          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>불러오는 중…</div>
        ) : pen && pen.rows.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>상벌점 기록이 없습니다.</div>
        ) : (
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            <table className="dt nowrap" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>일자</th>
                  <th>항목</th>
                  <th style={{ width: 70, textAlign: 'right' }}>점수</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {(pen?.rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{toDateStr(new Date(r.occurredAt))}</td>
                    <td>{r.itemName}</td>
                    <td style={{ textAlign: 'right', color: r.point < 0 ? 'var(--red)' : 'var(--mint-d)' }}>
                      {r.point > 0 ? `+${r.point}` : r.point}
                    </td>
                    <td>{r.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export const consultMockup: Mockup = {
  Content,
}
