import { useCallback, useEffect, useMemo, useState } from 'react'
import { StudentList, type StudentRow } from '../../components/StudentList'
import { StudentHeader } from '../../components/StudentHeader'
import { Icon } from '../../components/Icon'
import { Modal, Unfilled } from '../../components/common'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  EXAM_CODE_LABEL,
  getStudentGrades,
  listExamForms,
  updateExamScores,
  updateSchoolRecord,
  type ExamForm,
  type ExamSubject,
  type GradeSubmission,
  type ScoreInput,
} from '../../api/grades'
import { GRADE_LABEL, TRACK_LABEL, searchStudents, type Student } from '../../api/students'
import type { Mockup } from './types'
import './score.css'

/* F-4.6 성적 관리 — /api/v1/admin/exam-forms · /students/{id}/grades
 *
 * 좌: 재원생 목록 · 우: 그 학생의 회차별 성적
 *
 * ★ 입력 주체는 **0826 회신으로 확정됐다** — "처음 입력시 학생, 이후 수정시에는 직원을 통해서".
 *   직원 수정 경로가 열렸다(PUT school-record · exam-scores). 장학 취소 판정이 이 등급을
 *   근거로 돌기 때문에 **학생이 낸 값인지 직원이 고친 값인지 화면에 드러내야 한다** —
 *   `modifiedBy` 가 그 표시다.
 *
 * ★ 표 자체는 읽기 전용으로 두고 **수정은 모달로 뺐다.** 표에 입력칸을 박으면 조회하러 온
 *   사람이 실수로 값을 건드리는데, 이 값은 장학 판정 근거다. 고치려면 한 번 더 눌러야 한다.
 *
 * ★ 표의 **열은 시험 양식이 정한다.** 과목 구성이 학년·연도마다 달라서
 *   화면이 국·수·영·탐구를 하드코딩하면 안 된다.
 *   절대평가 과목(한국사·영어)은 `hasStandardScore=false` 라 표준점수 칸을 비운다.
 *
 * ★ **열을 `examSubjectId` 로 맞추면 안 된다.** 회차마다 id 가 새로 매겨져 있다 —
 *   HIGH2 는 6월이 1~5, 9월이 6~10, 10월이 11~15 다. 예전에는 양식 **하나**를 골라
 *   그 id 로 모든 회차를 찾았는데, 그러면 **고른 회차 말고는 전 칸이 '-'** 로 나왔다.
 *   성적이 실제로 들어 있어도 빈 표로 보인다. 축은 `subjectCode` 가 갖는다.
 *
 * ★ `examSkipped=true` 는 **"모른다고 체크한 것"** 이지 미입력이 아니다.
 *   둘을 같이 보여주면 담임이 "안 낸 학생"과 "모르는 학생"을 구분하지 못한다.
 *
 * ★ 더프리미엄 자동 조회·엑셀 일괄 업로드는 **요청하지 않는다.** 전자는 더프가 평가원 성적을
 *   주지 않아 불가능하고, 후자는 우리가 제안했다가 채택되지 않은 안이다(0826 회신). */

/**
 * 백분위 합(국수탐) — 상담에서 쓰는 지표라 화면이 계산한다.
 *
 * ★ 코드는 **서버가 주는 그대로** 써야 한다. 예전에는 `KOR`·`INQ1`·`INQ2` 로 찾았는데
 *   서버는 `KOREAN`·`INQUIRY1`·`INQUIRY2` 다. `MATH` 하나만 겹쳐서 **수학 백분위가
 *   곧 합계로 나왔다** — 72×4과목인 학생의 합이 72 였다. 틀린 줄 모르고 상담에 쓰인다.
 *   실제 코드: KOREAN MATH ENGLISH INQUIRY1 INQUIRY2 HISTORY SOCIAL SCIENCE (2026-09-11)
 */
const SUM_CODES = ['KOREAN', 'MATH', 'INQUIRY1', 'INQUIRY2']

/** 입력 중인 한 과목 칸. 숫자가 아니라 문자열로 들고 있어야 지우는 중간 상태가 표현된다 */
interface ScoreCell {
  standardScore: string
  percentile: string
  gradeLevel: string
}

/**
 * 빈 칸은 `null` 로 보낸다.
 *
 * ★ `0` 과 빈 칸을 섞으면 안 된다. `Number('')` 는 0 이라 그냥 넘기면 **안 낸 과목이
 *   백분위 0 으로 저장된다** — 국수탐 합계가 그만큼 낮게 나오고 장학 판정이 틀어진다.
 */
function numOrNull(v: string): number | null {
  const t = v.trim()
  return t === '' ? null : Number(t)
}

function toRow(s: Student): StudentRow {
  return {
    id: String(s.enrollmentId),
    name: s.name,
    meta: [s.track ? TRACK_LABEL[s.track] : '', GRADE_LABEL[s.grade] ?? s.grade, s.className ?? '반 미배정']
      .filter(Boolean)
      .join(' · '),
    date: s.studentNo ?? '',
  }
}

function Content() {
  const { academyId } = useAcademy()
  const [students, setStudents] = useState<Student[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [forms, setForms] = useState<ExamForm[]>([])
  const [submission, setSubmission] = useState<GradeSubmission | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [subjectCode, setSubjectCode] = useState<string | null>(null)

  /* 수정 모달. 표는 읽기 전용으로 두고 여기서만 값을 바꾼다 */
  const [recordEdit, setRecordEdit] = useState<string | null>(null)
  const [scoreEdit, setScoreEdit] = useState<{ examMasterId: number; cells: Record<number, ScoreCell> } | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const year = new Date().getFullYear()

  /* 좌측 목록 */
  /* ★ 지점을 넘겨야 한다. `/students` 는 안 보내면 **계정 스코프 그대로** 오므로
       본사 계정에서는 전 지점 학생이 섞여 나온다 — 분당을 골라도 65명이 다 보였다.
       (400 이 아니라 조용히 섞여서 들어오는 것이라 더 늦게 드러났다. CLAUDE.md 3-1) */
  const loadStudents = useCallback(async () => {
    setListLoading(true)
    try {
      const page = await searchStudents({ status: 'ENROLLED', size: 100, academyId: academyId ?? undefined })
      setStudents(page.rows)
      setSelectedId((prev) => prev ?? (page.rows[0] ? String(page.rows[0].enrollmentId) : null))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '학생 목록을 불러오지 못했습니다.')
    } finally {
      setListLoading(false)
    }
  }, [academyId])

  useEffect(() => {
    void loadStudents()
  }, [loadStudents])

  /* 시험 양식 — 표의 열을 정한다 */
  useEffect(() => {
    let cancelled = false
    listExamForms(year)
      .then((f) => !cancelled && setForms(f))
      .catch(() => !cancelled && setForms([]))
    return () => {
      cancelled = true
    }
  }, [year])

  const selected = students.find((s) => String(s.enrollmentId) === selectedId) ?? null

  /* 선택 학생의 성적 */
  const loadGrades = useCallback(async (enrollmentId: number) => {
    setGradeError(null)
    try {
      setSubmission(await getStudentGrades(enrollmentId))
    } catch (err) {
      setSubmission(null)
      // "제출된 성적이 없습니다"는 오류가 아니라 정상 상태다
      setGradeError(
        err instanceof ApiError && err.code === 'GRADE_SUBMISSION_NOT_FOUND' ? null : '성적을 불러오지 못했습니다.',
      )
    }
  }, [])

  useEffect(() => {
    if (selectedId === null) {
      setSubmission(null)
      return
    }
    void loadGrades(Number(selectedId))
  }, [selectedId, loadGrades])

  /** 선택 학생의 학년에 해당하는 양식들. 회차(6월·9월·수능)마다 한 건이다 */
  const gradeForms: ExamForm[] = useMemo(() => {
    const mine = forms.filter((f) => f.gradeType === selected?.grade)
    return [...(mine.length > 0 ? mine : forms)].sort((a, b) => a.sortOrder - b.sortOrder)
  }, [forms, selected])

  /**
   * 표의 열 — 그 학년 **전 회차의 과목을 합집합**으로 모은다.
   *
   * ★ 회차마다 과목이 다르다. HIGH2 는 10월에만 한국사가 붙는다. 한 회차만 보고 열을
   *   만들면 다른 회차의 과목이 표에서 통째로 빠진다.
   */
  const subjects: ExamSubject[] = useMemo(() => {
    const byCode = new Map<string, ExamSubject>()
    for (const f of gradeForms) {
      for (const s2 of f.subjects) if (!byCode.has(s2.subjectCode)) byCode.set(s2.subjectCode, s2)
    }
    return [...byCode.values()].sort((a, b) => a.sortOrder - b.sortOrder)
  }, [gradeForms])

  /** `examSubjectId` → 과목 코드. 회차마다 id 가 달라 점수를 코드로 되돌려야 한다 */
  const codeById: Map<number, string> = useMemo(() => {
    const m = new Map<number, string>()
    for (const f of forms) for (const s2 of f.subjects) m.set(s2.examSubjectId, s2.subjectCode)
    return m
  }, [forms])

  useEffect(() => {
    if (subjectCode === null && subjects.length > 0) setSubjectCode(subjects[0].subjectCode)
  }, [subjects, subjectCode])

  /** 과목별 백분위 추이 — 회차를 가로축으로. 여기도 코드로 맞춘다(위 ★ 참고) */
  const trend = useMemo(() => {
    if (!submission || subjectCode === null) return []
    return submission.exams
      .map((e) => ({
        label: EXAM_CODE_LABEL[e.examCode] ?? e.examCode,
        value: e.scores.find((sc) => codeById.get(sc.examSubjectId) === subjectCode)?.percentile ?? null,
      }))
      .filter((x) => x.value !== null) as { label: string; value: number }[]
  }, [submission, subjectCode, codeById])

  /* ── 저장 ── */

  async function submitRecord() {
    if (selectedId === null || recordEdit === null) return
    setSaveBusy(true)
    setSaveErr(null)
    try {
      // 빈 칸은 "아직 모른다"로 보낸다 — 서버가 null 을 받아 실제로 지운다
      const v = recordEdit.trim()
      await updateSchoolRecord(Number(selectedId), v === '' ? null : Number(v))
      setRecordEdit(null)
      await loadGrades(Number(selectedId))
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
    } finally {
      setSaveBusy(false)
    }
  }

  async function submitScores() {
    if (selectedId === null || scoreEdit === null) return
    setSaveBusy(true)
    setSaveErr(null)
    try {
      const scores: ScoreInput[] = Object.entries(scoreEdit.cells).map(([id, c]) => ({
        examSubjectId: Number(id),
        standardScore: numOrNull(c.standardScore),
        percentile: numOrNull(c.percentile),
        gradeLevel: numOrNull(c.gradeLevel),
      }))
      await updateExamScores(Number(selectedId), scores)
      setScoreEdit(null)
      await loadGrades(Number(selectedId))
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
    } finally {
      setSaveBusy(false)
    }
  }

  /** 회차 하나를 편집 상태로 연다. 이미 낸 값이 있으면 채워 넣는다 */
  function openScoreEdit(form: ExamForm) {
    const exam = submission?.exams.find((e) => e.examMasterId === form.examMasterId)
    const cells: Record<number, ScoreCell> = {}
    for (const sub of form.subjects) {
      const sc = exam?.scores.find((x) => x.examSubjectId === sub.examSubjectId)
      cells[sub.examSubjectId] = {
        standardScore: sc?.standardScore != null ? String(sc.standardScore) : '',
        percentile: sc?.percentile != null ? String(sc.percentile) : '',
        gradeLevel: sc?.gradeLevel != null ? String(sc.gradeLevel) : '',
      }
    }
    setSaveErr(null)
    setScoreEdit({ examMasterId: form.examMasterId, cells })
  }

  const editForm = gradeForms.find((f) => f.examMasterId === scoreEdit?.examMasterId) ?? null

  return (
    <div className="p-score">
      <div className="layout">
        <StudentList
          title="재원생"
          count={`${students.length}명`}
          filters={['전체']}
          rows={students.map(toRow)}
          selected={selectedId ?? undefined}
          onSelect={setSelectedId}
          loading={listLoading}
          emptyText="재원생이 없습니다."
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
                  <b>
                    {selected.track ? TRACK_LABEL[selected.track] : '계열 미지정'} ·{' '}
                    {GRADE_LABEL[selected.grade] ?? selected.grade}
                  </b>{' '}
                  · {selected.className ?? '반 미배정'} · <b>담임</b> {selected.homeroomTeacher ?? '미지정'}
                </>
              ) : (
                '학생을 선택하세요'
              )
            }
            right={
              submission?.submittedAt ? (
                <span className="src-badge">
                  <Icon name="check" size={12} /> {submission.submittedAt.slice(0, 10)} 제출
                  {/* 학생이 낸 값인지 직원이 고친 값인지 — 장학 판정 근거라 구분해서 보여준다 */}
                  {submission.modifiedBy !== null && (
                    <> · 직원 수정{submission.modifiedAt ? ` ${submission.modifiedAt.slice(0, 10)}` : ''}</>
                  )}
                </span>
              ) : undefined
            }
          />

          <div className="panel-body">
            <div className="upload-note">
              <div className="ic">
                <Icon name="info" size={15} />
              </div>
              <div>
                성적은 <b>학생이 앱에서 직접 입력</b>하고, <b>수정은 직원이</b> 합니다.
                장학 판정이 이 등급을 근거로 하므로, 직원이 고친 값에는 아래에 수정 표시가 붙습니다.
              </div>
            </div>

            {gradeError && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {gradeError}
              </div>
            )}

            {/* ── 내신 ── */}
            <div className="sec-h">
              <div className="t">
                <span className="ic">
                  <Icon name="book-open" size={17} />
                </span>{' '}
                내신 · 주요 과목 평균 등급
              </div>
              <div className="note" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <b style={{ fontSize: 14, color: 'var(--ink)' }}>
                  {submission?.mainSubjectAverage != null ? submission.mainSubjectAverage.toFixed(2) : '미입력'}
                </b>
                <button
                  type="button"
                  className="btn"
                  disabled={selected === null}
                  onClick={() => {
                    setSaveErr(null)
                    setRecordEdit(
                      submission?.mainSubjectAverage != null ? String(submission.mainSubjectAverage) : '',
                    )
                  }}
                >
                  수정
                </button>
              </div>
            </div>

            {/* ── 회차별 성적 표 ── */}
            <div className="sec-h">
              <div className="t">
                <span className="ic">
                  <Icon name="table-2" size={17} />
                </span>{' '}
                회차별 성적 (표준 / 백분위 · 등급)
              </div>
              {/* 회차마다 양식이 달라 입력 버튼도 회차별로 둔다 — 한 번에 한 회차만 교체된다 */}
              <div className="note" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {gradeForms.length === 0 ? (
                  `${year}년 시험 양식이 없습니다`
                ) : (
                  <>
                    <span style={{ marginRight: 4 }}>성적 입력</span>
                    {gradeForms.map((f) => (
                      <button
                        key={f.examMasterId}
                        type="button"
                        className="btn"
                        disabled={selected === null}
                        onClick={() => openScoreEdit(f)}
                      >
                        {EXAM_CODE_LABEL[f.examCode] ?? f.examCode}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* examSkipped 는 미입력이 아니라 "모른다고 체크한 것"이다 */}
            {submission?.examSkipped && (
              <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
                <div className="ic">
                  <Icon name="triangle-alert" size={17} />
                </div>
                <div>
                  <div className="tt">학생이 &lsquo;성적을 모른다&rsquo;고 체크했습니다</div>
                  <div className="tx">
                    미입력과 다릅니다 — 점수를 안 낸 것이 아니라 모른다고 답한 상태입니다.
                    {submission.skipReason && <> 사유: {submission.skipReason}</>}
                  </div>
                </div>
              </div>
            )}

            <div className="table-scroll">
              <table className="rtable">
                <thead>
                  <tr>
                    <th className="rd">회차</th>
                    {subjects.map((s) => (
                      <th key={s.subjectCode}>
                        {s.subjectName}
                        {!s.hasStandardScore && (
                          <>
                            <br />
                            <small style={{ fontWeight: 500, color: 'var(--muted)' }}>절대평가</small>
                          </>
                        )}
                      </th>
                    ))}
                    <th>
                      국수탐
                      <br />
                      <small style={{ fontWeight: 500, color: 'var(--muted)' }}>백분위합</small>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(!submission || submission.exams.length === 0) && (
                    <tr>
                      <td colSpan={subjects.length + 2} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                        {submission?.examSkipped ? '모른다고 체크한 상태입니다.' : '제출된 성적이 없습니다.'}
                      </td>
                    </tr>
                  )}
                  {submission?.exams.map((e) => {
                    /* 회차 안의 점수를 과목 코드로 색인한다 — id 는 회차마다 다르다 */
                    const byCode = new Map(e.scores.map((sc) => [codeById.get(sc.examSubjectId), sc]))
                    const sum = e.scores
                      .filter((sc) => SUM_CODES.includes(codeById.get(sc.examSubjectId) ?? ''))
                      .reduce((a, sc) => a + (sc.percentile ?? 0), 0)
                    return (
                      <tr key={e.examMasterId}>
                        <td className="rd">
                          {e.examName}
                          <small>{EXAM_CODE_LABEL[e.examCode] ?? e.examCode}</small>
                        </td>
                        {subjects.map((s) => {
                          const sc = byCode.get(s.subjectCode)
                          if (!sc) return <td key={s.subjectCode} style={{ color: 'var(--muted)' }}>-</td>
                          return (
                            <td key={s.subjectCode}>
                              <span className={`gr${sc.gradeLevel === 1 ? ' g1' : (sc.gradeLevel ?? 0) >= 4 ? ' g4' : ''}`}>
                                {sc.gradeLevel ?? '-'}
                              </span>
                              <span className="pn">
                                {s.hasStandardScore && sc.standardScore !== null ? `${sc.standardScore} · ` : ''}
                                {sc.percentile !== null ? sc.percentile : '-'}
                              </span>
                            </td>
                          )
                        })}
                        <td>
                          <span className="sum">{sum > 0 ? sum : '-'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── 과목별 백분위 추이 ── */}
            <div className="subj-grid">
              <div className="box">
                <div className="box-h">
                  <div className="bt">
                    <span style={{ display: 'flex' }}>
                      <Icon name="line-chart" size={15} />
                    </span>
                    백분위 추이
                  </div>
                  <div className="subj-pick">
                    {subjects.map((s) => (
                      <button
                        type="button"
                        key={s.subjectCode}
                        className={`subj-opt${subjectCode === s.subjectCode ? ' on' : ''}`}
                        onClick={() => setSubjectCode(s.subjectCode)}
                      >
                        {s.subjectName}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="box-b">
                  {trend.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', padding: '18px 0', textAlign: 'center' }}>
                      회차가 2개 이상 쌓이면 추이를 볼 수 있습니다.
                    </div>
                  ) : (
                    <div className="bars">
                      {trend.map((t) => (
                        <div className="bar-row" key={t.label}>
                          <span className="bl">{t.label}</span>
                          <div className="bar-track">
                            {/* 백분위가 낮으면 붉게 — 상담에서 눈에 먼저 들어와야 한다 */}
                            <span className={`me${t.value < 60 ? ' low' : ''}`} style={{ width: `${t.value}%` }} />
                          </div>
                          <span className="bar-val">
                            백분위 <b>{t.value}</b>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="box">
                <div className="box-h">
                  <div className="bt">
                    <span style={{ display: 'flex' }}>
                      <Icon name="list-checks" size={15} />
                    </span>
                    단원별 정답률
                  </div>
                </div>
                <div className="box-b">
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: '18px 0', textAlign: 'center' }}>
                    {/* 엑셀 업로드 안이 채택되지 않아 이 값의 출처 자체가 없다 — 박스 유지 여부 확인 필요 */}
                    <Unfilled reason="엑셀 상세 업로드 안이 채택되지 않아 데이터 출처가 없다" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── 내신 수정 ── */}
      {recordEdit !== null && (
        <Modal
          title="내신 수정"
          sub={`${selected?.name ?? ''} 학생의 주요 과목 평균 등급입니다.`}
          busy={saveBusy}
          error={saveErr}
          onConfirm={() => void submitRecord()}
          onClose={() => setRecordEdit(null)}
        >
          <div className="frow">
            <label>평균 등급</label>
            <input
              className="inp"
              type="number"
              step="0.01"
              min={1}
              max={9}
              placeholder="예: 2.35"
              value={recordEdit}
              onChange={(e) => setRecordEdit(e.target.value)}
            />
            <div className="hint">비워 두면 &lsquo;아직 모름&rsquo; 으로 저장됩니다.</div>
          </div>
        </Modal>
      )}

      {/* ── 회차별 성적 수정 ── */}
      {scoreEdit !== null && editForm !== null && (
        <Modal
          title={`${editForm.examName} 성적 입력`}
          sub={`${selected?.name ?? ''} 학생 · 이 회차의 값만 바뀝니다.`}
          busy={saveBusy}
          error={saveErr}
          onConfirm={() => void submitScores()}
          onClose={() => setScoreEdit(null)}
        >
          <div className="table-scroll">
            <table className="rtable">
              <thead>
                <tr>
                  <th className="rd">과목</th>
                  <th>표준점수</th>
                  <th>백분위</th>
                  <th>등급</th>
                </tr>
              </thead>
              <tbody>
                {[...editForm.subjects]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((sub) => {
                    const cell = scoreEdit.cells[sub.examSubjectId]
                    const set = (k: keyof ScoreCell, v: string) =>
                      setScoreEdit({
                        ...scoreEdit,
                        cells: { ...scoreEdit.cells, [sub.examSubjectId]: { ...cell, [k]: v } },
                      })
                    return (
                      <tr key={sub.examSubjectId}>
                        <td className="rd">{sub.subjectName}</td>
                        <td>
                          {/* 절대평가 과목은 표준점수가 없다 — 칸을 열어 두면 없는 값을 적게 된다 */}
                          {sub.hasStandardScore ? (
                            <input
                              className="inp"
                              type="number"
                              min={0}
                              max={200}
                              value={cell.standardScore}
                              onChange={(e) => set('standardScore', e.target.value)}
                            />
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}>절대평가</span>
                          )}
                        </td>
                        <td>
                          {sub.hasPercentile ? (
                            <input
                              className="inp"
                              type="number"
                              min={0}
                              max={100}
                              value={cell.percentile}
                              onChange={(e) => set('percentile', e.target.value)}
                            />
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}>-</span>
                          )}
                        </td>
                        <td>
                          {sub.hasGradeLevel ? (
                            <input
                              className="inp"
                              type="number"
                              min={1}
                              max={9}
                              value={cell.gradeLevel}
                              onChange={(e) => set('gradeLevel', e.target.value)}
                            />
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}>-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <div className="frow">
            <div className="hint">빈 칸은 저장하지 않고 비워 둡니다. 다른 회차의 값은 그대로 남습니다.</div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export const scoreMockup: Mockup = {
  Content,
}
