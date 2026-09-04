import { useCallback, useEffect, useMemo, useState } from 'react'
import { StudentList, type StudentRow } from '../../components/StudentList'
import { StudentHeader } from '../../components/StudentHeader'
import { Icon } from '../../components/Icon'
import { Unfilled } from '../../components/common'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  EXAM_CODE_LABEL,
  getStudentGrades,
  listExamForms,
  type ExamForm,
  type ExamSubject,
  type GradeSubmission,
} from '../../api/grades'
import { GRADE_LABEL, TRACK_LABEL, searchStudents, type Student } from '../../api/students'
import type { Mockup } from './types'
import './score.css'

/* F-4.6 성적 관리 — /api/v1/admin/exam-forms · /students/{id}/grades
 *
 * 좌: 재원생 목록 · 우: 그 학생의 회차별 성적
 *
 * ★ **입력은 앱(학생) 전용이다.** 관리자는 시험 양식을 만들고 결과를 볼 뿐,
 *   점수를 대신 넣을 수 없다 — `/api/v1/app/grades/*` 가 학생 인증을 요구한다.
 *   설문과 같은 구조다(관리 = 양식·배포, 앱 = 응답).
 *
 * ★ 표의 **열은 시험 양식이 정한다.** 과목 구성이 학년·연도마다 달라서
 *   화면이 국·수·영·탐구를 하드코딩하면 안 된다.
 *   절대평가 과목(한국사·영어)은 `hasStandardScore=false` 라 표준점수 칸을 비운다.
 *
 * ★ `examSkipped=true` 는 **"모른다고 체크한 것"** 이지 미입력이 아니다.
 *   둘을 같이 보여주면 담임이 "안 낸 학생"과 "모르는 학생"을 구분하지 못한다.
 *
 * ★ 서버에 없는 것 — docs/API_GAPS.md
 *   더프리미엄 API 자동 조회 · 엑셀 상세 업로드 · 단원별 정답률 · 목표 대학. */

/** 백분위 합(국수탐) — 상담에서 쓰는 지표라 화면이 계산한다 */
const SUM_CODES = ['KOR', 'MATH', 'INQ1', 'INQ2']

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

  const year = new Date().getFullYear()

  /* 좌측 목록 */
  const loadStudents = useCallback(async () => {
    setListLoading(true)
    try {
      const page = await searchStudents({ status: 'ENROLLED', size: 100 })
      setStudents(page.rows)
      setSelectedId((prev) => prev ?? (page.rows[0] ? String(page.rows[0].enrollmentId) : null))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '학생 목록을 불러오지 못했습니다.')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStudents()
  }, [loadStudents])

  /* 시험 양식 — 표의 열을 정한다 */
  useEffect(() => {
    let cancelled = false
    listExamForms(year, academyId ?? undefined)
      .then((f) => !cancelled && setForms(f))
      .catch(() => !cancelled && setForms([]))
    return () => {
      cancelled = true
    }
  }, [year, academyId])

  const selected = students.find((s) => String(s.enrollmentId) === selectedId) ?? null

  /* 선택 학생의 성적 */
  useEffect(() => {
    if (selectedId === null) {
      setSubmission(null)
      return
    }
    let cancelled = false
    setGradeError(null)
    getStudentGrades(Number(selectedId))
      .then((g) => !cancelled && setSubmission(g))
      .catch((err) => {
        if (cancelled) return
        setSubmission(null)
        // "제출된 성적이 없습니다"는 오류가 아니라 정상 상태다
        setGradeError(err instanceof ApiError && err.code === 'GRADE_SUBMISSION_NOT_FOUND' ? null : '성적을 불러오지 못했습니다.')
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  /** 표의 열. 선택 학생의 학년에 맞는 양식에서 뽑는다 */
  const subjects: ExamSubject[] = useMemo(() => {
    const form = forms.find((f) => f.gradeType === selected?.grade) ?? forms[0]
    return form ? [...form.subjects].sort((a, b) => a.sortOrder - b.sortOrder) : []
  }, [forms, selected])

  useEffect(() => {
    if (subjectCode === null && subjects.length > 0) setSubjectCode(subjects[0].subjectCode)
  }, [subjects, subjectCode])

  /** 과목별 백분위 추이 — 회차를 가로축으로 */
  const trend = useMemo(() => {
    if (!submission || subjectCode === null) return []
    const subj = subjects.find((s) => s.subjectCode === subjectCode)
    if (!subj) return []
    return submission.exams
      .map((e) => ({
        label: EXAM_CODE_LABEL[e.examCode] ?? e.examCode,
        value: e.scores.find((sc) => sc.examSubjectId === subj.examSubjectId)?.percentile ?? null,
      }))
      .filter((x) => x.value !== null) as { label: string; value: number }[]
  }, [submission, subjectCode, subjects])

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
                성적은 <b>학생이 앱에서 직접 입력</b>합니다. 관리자는 시험 양식을 만들고 결과를 조회할 뿐,
                점수를 대신 넣을 수 없습니다. 더프리미엄 API 자동 조회·엑셀 상세 업로드는{' '}
                <Unfilled reason="외부 성적 연동·엑셀 업로드 API가 없다" />
              </div>
            </div>

            {gradeError && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {gradeError}
              </div>
            )}

            {/* ── 회차별 성적 표 ── */}
            <div className="sec-h">
              <div className="t">
                <span className="ic">
                  <Icon name="table-2" size={17} />
                </span>{' '}
                회차별 성적 (표준 / 백분위 · 등급)
              </div>
              <div className="note">
                {subjects.length > 0
                  ? `${subjects.map((s) => s.subjectName).join(' · ')} · 시험 양식 기준`
                  : `${year}년 시험 양식이 없습니다`}
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
                      <th key={s.examSubjectId}>
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
                    const sum = e.scores
                      .filter((sc) => {
                        const subj = subjects.find((s) => s.examSubjectId === sc.examSubjectId)
                        return subj && SUM_CODES.includes(subj.subjectCode)
                      })
                      .reduce((a, sc) => a + (sc.percentile ?? 0), 0)
                    return (
                      <tr key={e.examMasterId}>
                        <td className="rd">
                          {e.examName}
                          <small>{EXAM_CODE_LABEL[e.examCode] ?? e.examCode}</small>
                        </td>
                        {subjects.map((s) => {
                          const sc = e.scores.find((x) => x.examSubjectId === s.examSubjectId)
                          if (!sc) return <td key={s.examSubjectId} style={{ color: 'var(--muted)' }}>-</td>
                          return (
                            <td key={s.examSubjectId}>
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
                        key={s.examSubjectId}
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
                    <Unfilled reason="단원별 정답률은 엑셀 상세 업로드가 있어야 한다" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export const scoreMockup: Mockup = {
  Content,
}
