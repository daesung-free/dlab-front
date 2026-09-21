import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Modal, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { useAuth } from '../../auth/AuthContext'
import { ApiError } from '../../api/client'
import { GRADE_LABEL, searchStudents, type GradeType, type Student } from '../../api/students'
import {
  EXAM_CODE_LABEL,
  applyScoreUpload,
  createExamForm,
  linkUploadRow,
  listAllExamForms,
  listSubjectPresets,
  previewScoreUpload,
  uploadExamItems,
  uploadExamResponses,
  type ExamCode,
  type ExamForm,
  type ExamFormSubjectInput,
  type ExamItemResult,
  type ExamResponseResult,
  type ScoreUploadResult,
  type ScoreUploadUnmatched,
} from '../../api/grades'
import type { Mockup } from './types'

/* F-4.6 부속 성적 업로드 — /api/v1/admin/grades/exam-scores·exam-items·exam-responses (2026-09-21)
 *
 * 0921 성적 문서로 방향이 바뀌었다 — 디랩에서 본 시험(더프리미엄·평가원)의 결과를 **학원이 파일로
 * 올린다.** 입학 전 성적(학생이 가입 때 앱에 넣는 것)은 그대로 성적 관리 화면이 맡는다.
 * 예전 결론("엑셀 업로드는 채택 안 됨", API_GAPS 12-2)은 이 문서로 뒤집혔다.
 *
 * ★ **회차가 먼저다.** 업로드는 `purpose: ACADEMY` 회차에만 된다 — 입학 전 양식에 올리면
 *   학생이 가입 때 넣고 선생님이 대조한 입학 성적이 교체된다(서버가 막는다). 그런데 그 회차를
 *   만드는 화면이 없어서 여기 '회차 등록'을 둔다. 과목은 같은 학년의 입학 전 양식에서 가져온다 —
 *   과목 코드·절대평가 여부를 사람이 다시 치면 틀린다.
 *
 * ★ **③ 정오·답안은 ② 문항 정보가 있어야 한다.** 국어·수학의 공통/선택 경계(1~34 / 35~45번)를
 *   문항분석표에서 알아내기 때문이다. 문항 정보가 이미 올라가 있는지 물어볼 조회가 없어서
 *   ③을 잠그지 않고, 없으면 서버가 돌려주는 문구를 그대로 보인다.
 *
 * ★ ①은 **미리보기 → 반영** 두 단계다. 605명짜리 파일을 바로 저장하면 매칭이 어긋났을 때
 *   무엇이 잘못 들어갔는지 모른 채 전교생 성적이 바뀐다. 반영은 찾은 학생만 저장한다.
 *
 * ★ 동명이인·못 찾은 행은 '학생 연결'로 사람이 잇는다. 한 번 이으면 **그해 다음 회차부터 자동**이다.
 */

const GRADES: GradeType[] = ['HIGH2', 'HIGH3', 'N_SU']
const CODES: ExamCode[] = ['JUNE', 'SEPT', 'OCT', 'CSAT', 'MONTHLY']

function formLabel(f: ExamForm): string {
  return `${GRADE_LABEL[f.gradeType] ?? f.gradeType} · ${f.examName}${f.examDate ? ` (${f.examDate})` : ''}${
    f.academyId === null ? ' · 전 지점 공통' : ''
  }`
}

function msg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback
}

/** 파일 고르기 한 칸. 고른 파일 이름은 브라우저 기본 칸이 보여준다 */
function FilePick({
  label,
  required,
  onChange,
  disabled,
}: {
  label: string
  required?: boolean
  onChange: (f: File | null) => void
  disabled?: boolean
}) {
  return (
    <div className="frow">
      <label className={required ? 'req' : undefined}>{label}</label>
      <div>
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={disabled}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          style={{ fontSize: 12.5 }}
        />
        {!required && <div className="hint">없어도 됩니다.</div>}
      </div>
    </div>
  )
}

function Content() {
  const { academyId, academies, ready: academyReady } = useAcademy()
  const { canSeeAdmin } = useAuth()
  const academyName = academies.find((a) => a.id === academyId)?.acadNm ?? null

  const [year] = useState(new Date().getFullYear())
  const [forms, setForms] = useState<ExamForm[]>([])
  const [formsErr, setFormsErr] = useState<string | null>(null)
  const [examId, setExamId] = useState<number | null>(null)

  const loadForms = useCallback(async () => {
    if (!academyReady) return
    try {
      const all = await listAllExamForms(year, academyId)
      setForms(all)
      setFormsErr(null)
    } catch (e) {
      setFormsErr(msg(e, '시험 회차를 불러오지 못했습니다.'))
    }
  }, [year, academyId, academyReady])

  useEffect(() => {
    void loadForms()
  }, [loadForms])

  const academyForms = useMemo(
    () =>
      forms
        .filter((f) => f.purpose === 'ACADEMY')
        .sort((a, b) => (a.examDate ?? '').localeCompare(b.examDate ?? '') || a.gradeType.localeCompare(b.gradeType)),
    [forms],
  )
  // 지점을 바꾸면 남의 지점 회차가 선택된 채 남지 않게 목록에 없는 선택은 푼다
  useEffect(() => {
    setExamId((cur) => (cur !== null && academyForms.some((f) => f.examMasterId === cur) ? cur : null))
  }, [academyForms])
  const exam = academyForms.find((f) => f.examMasterId === examId) ?? null

  /* ── 회차 등록 ── */
  const [reg, setReg] = useState<{
    gradeType: GradeType
    examCode: ExamCode
    examName: string
    examDate: string
    common: boolean
  } | null>(null)
  const [regBusy, setRegBusy] = useState(false)
  const [regErr, setRegErr] = useState<string | null>(null)
  const isSuper = academies.length > 1

  /*
   * 과목 — 서버의 학년별 기본 구성(subject-presets)을 먼저 쓴다. 그 조회가 없거나 비었으면
   * 같은 학년의 입학 전 양식에서 가져온다(기본 구성이 생기기 전 서버와도 돌게).
   */
  const [presets, setPresets] = useState<{ key: string; rows: ExamFormSubjectInput[] } | null>(null)
  const regGrade = reg?.gradeType ?? null
  useEffect(() => {
    if (regGrade === null) return
    const key = `${year}:${regGrade}:${academyId}`
    let alive = true
    listSubjectPresets(year, regGrade, academyId)
      .then((rows) => alive && setPresets({ key, rows }))
      .catch(() => alive && setPresets({ key, rows: [] }))
    return () => {
      alive = false
    }
  }, [year, regGrade, academyId])

  const template = useMemo((): { from: string; subjects: ExamFormSubjectInput[] } | null => {
    if (!reg) return null
    const p = presets?.key === `${year}:${reg.gradeType}:${academyId}` ? presets.rows : []
    if (p.length > 0) return { from: '학년별 기본 과목', subjects: [...p].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) }
    const same = forms.filter((f) => f.purpose !== 'ACADEMY' && f.gradeType === reg.gradeType)
    const f = same.find((x) => x.examCode === reg.examCode) ?? same[0]
    return f ? { from: `같은 학년 입학 성적 양식(${f.examName})`, subjects: f.subjects } : null
  }, [forms, reg, presets, year, academyId])

  async function submitReg() {
    if (!reg || !template) return
    setRegBusy(true)
    setRegErr(null)
    try {
      const created = await createExamForm({
        academyId: reg.common ? undefined : (academyId ?? undefined),
        year,
        gradeType: reg.gradeType,
        examCode: reg.examCode,
        examName: reg.examName.trim(),
        examDate: reg.examDate,
        purpose: 'ACADEMY',
        sortOrder: 1,
        subjects: template.subjects.map((s) => ({
          subjectCode: s.subjectCode,
          subjectName: s.subjectName,
          sortOrder: s.sortOrder,
          hasStandardScore: s.hasStandardScore,
          hasPercentile: s.hasPercentile,
          hasGradeLevel: s.hasGradeLevel,
          hasRawScore: s.hasRawScore,
        })),
      })
      setReg(null)
      await loadForms()
      setExamId(created.examMasterId)
    } catch (e) {
      setRegErr(msg(e, '회차를 등록하지 못했습니다.'))
    } finally {
      setRegBusy(false)
    }
  }

  /* ── ① 성적 ── */
  const [scoreFile, setScoreFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ScoreUploadResult | null>(null)
  const [applied, setApplied] = useState<ScoreUploadResult | null>(null)
  const [scoreBusy, setScoreBusy] = useState(false)
  const [scoreErr, setScoreErr] = useState<string | null>(null)
  const [confirmApply, setConfirmApply] = useState(false)

  // 회차·파일·지점이 바뀌면 이전 미리보기는 그 조합의 결과가 아니다 — 남기면 엉뚱한 것을 반영하게 된다
  useEffect(() => {
    setPreview(null)
    setApplied(null)
    setScoreErr(null)
  }, [examId, scoreFile, academyId])

  async function runPreview() {
    if (!scoreFile || examId === null || academyId === null) return
    setScoreBusy(true)
    setScoreErr(null)
    try {
      setPreview(await previewScoreUpload(academyId, examId, scoreFile))
    } catch (e) {
      setScoreErr(msg(e, '파일을 읽지 못했습니다.'))
    } finally {
      setScoreBusy(false)
    }
  }

  async function runApply() {
    if (!scoreFile || examId === null || academyId === null) return
    setScoreBusy(true)
    setScoreErr(null)
    try {
      const res = await applyScoreUpload(academyId, examId, scoreFile)
      setApplied(res)
      setPreview(res)
      setConfirmApply(false)
    } catch (e) {
      setScoreErr(msg(e, '성적을 반영하지 못했습니다.'))
      setConfirmApply(false)
    } finally {
      setScoreBusy(false)
    }
  }

  /* 학생 연결 — 못 찾은 행을 우리 학생에 잇는다 */
  const [link, setLink] = useState<{ row: ScoreUploadUnmatched; enrollmentId: string } | null>(null)
  const [students, setStudents] = useState<Student[] | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkErr, setLinkErr] = useState<string | null>(null)

  function openLink(row: ScoreUploadUnmatched) {
    setLinkErr(null)
    setLink({ row, enrollmentId: '' })
    if (students === null && academyId !== null) {
      searchStudents({ academyId, status: 'ENROLLED', size: 500, sort: 'studentNo,asc' })
        .then((p) => setStudents(p.rows))
        .catch((e) => {
          setStudents([])
          setLinkErr(msg(e, '학생 목록을 불러오지 못했습니다.'))
        })
    }
  }
  useEffect(() => setStudents(null), [academyId])

  /** 같은 이름을 위로 — 동명이인이면 그 사람들 중에서 고르는 것이 대부분이다 */
  const linkOptions = useMemo(() => {
    if (!link || !students) return []
    const nm = link.row.name.replace(/\s+/g, '')
    return [...students].sort((a, b) => Number(b.name === nm) - Number(a.name === nm))
  }, [link, students])

  async function submitLink() {
    if (!link || academyId === null || !exam) return
    setLinkBusy(true)
    setLinkErr(null)
    try {
      await linkUploadRow({
        academyId,
        year: exam.year,
        schoolCode: link.row.schoolCode,
        classNo: link.row.classNo,
        studentNo: link.row.studentNo,
        enrollmentId: Number(link.enrollmentId),
      })
      setLink(null)
      // 이은 결과는 미리보기를 다시 돌려야 보인다
      await runPreview()
    } catch (e) {
      setLinkErr(msg(e, '연결하지 못했습니다.'))
    } finally {
      setLinkBusy(false)
    }
  }

  /* ── ② 문항 정보 ── */
  const [analysisFile, setAnalysisFile] = useState<File | null>(null)
  const [ratesFile, setRatesFile] = useState<File | null>(null)
  const [itemRes, setItemRes] = useState<ExamItemResult | null>(null)
  const [itemBusy, setItemBusy] = useState(false)
  const [itemErr, setItemErr] = useState<string | null>(null)
  const [confirmItems, setConfirmItems] = useState(false)
  useEffect(() => {
    setItemRes(null)
    setItemErr(null)
  }, [examId])

  async function runItems() {
    if (!analysisFile || examId === null) return
    setItemBusy(true)
    setItemErr(null)
    try {
      setItemRes(await uploadExamItems(examId, analysisFile, ratesFile))
    } catch (e) {
      setItemErr(msg(e, '문항 정보를 올리지 못했습니다.'))
    } finally {
      setItemBusy(false)
      setConfirmItems(false)
    }
  }

  /* ── ③ 정오·답안 ── */
  const [resultsFile, setResultsFile] = useState<File | null>(null)
  const [answersFile, setAnswersFile] = useState<File | null>(null)
  const [respRes, setRespRes] = useState<ExamResponseResult | null>(null)
  const [respBusy, setRespBusy] = useState(false)
  const [respErr, setRespErr] = useState<string | null>(null)
  useEffect(() => {
    setRespRes(null)
    setRespErr(null)
  }, [examId, academyId])

  async function runResponses() {
    if (!resultsFile || examId === null || academyId === null) return
    setRespBusy(true)
    setRespErr(null)
    try {
      setRespRes(await uploadExamResponses(academyId, examId, resultsFile, answersFile))
    } catch (e) {
      setRespErr(msg(e, '정오표를 올리지 못했습니다.'))
    } finally {
      setRespBusy(false)
    }
  }

  const noBranch = academyId === null
  const locked = exam === null

  const unmatchedCols: Column<ScoreUploadUnmatched>[] = [
    { key: 'rowNumber', header: '행', width: '56px', value: (r) => String(r.rowNumber) },
    { key: 'name', header: '이름', width: '90px', value: (r) => r.name },
    { key: 'classNo', header: '반', width: '60px', value: (r) => r.classNo },
    { key: 'studentNo', header: '파일 번호', width: '90px', value: (r) => r.studentNo },
    { key: 'reason', header: '사유', value: (r) => r.reason },
    {
      key: 'act',
      header: '',
      width: '96px',
      value: () => '',
      render: (r) => (
        <button type="button" className="btn" onClick={() => openLink(r)} disabled={scoreBusy}>
          학생 연결
        </button>
      ),
    },
  ]

  const respUnmatchedCols: Column<ExamResponseResult['unmatched'][number]>[] = [
    { key: 'rowNumber', header: '행', width: '56px', value: (r) => String(r.rowNumber) },
    { key: 'name', header: '이름', width: '90px', value: (r) => r.name },
    { key: 'reason', header: '사유', value: (r) => r.reason },
  ]

  return (
    <>
      {formsErr && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {formsErr}
        </div>
      )}

      {/* ── 회차 ── */}
      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="calendar" size={15} />
            </span>
            시험 회차
          </div>
          <div className="r">
            <button
              type="button"
              className="btn"
              disabled={noBranch}
              onClick={() => {
                setRegErr(null)
                setReg({ gradeType: 'HIGH3', examCode: 'JUNE', examName: '', examDate: '', common: false })
              }}
            >
              <Icon name="plus" size={14} /> 회차 등록
            </button>
          </div>
        </div>
        <div className="card-sec-b">
          <div className="frow">
            <label className="req">회차</label>
            <div>
              <select
                className="sel"
                value={examId ?? ''}
                onChange={(e) => setExamId(e.target.value === '' ? null : Number(e.target.value))}
                disabled={academyForms.length === 0}
              >
                <option value="">{academyForms.length === 0 ? '등록된 회차가 없습니다' : '회차 선택'}</option>
                {academyForms.map((f) => (
                  <option key={f.examMasterId} value={f.examMasterId}>
                    {formLabel(f)}
                  </option>
                ))}
              </select>
              <div className="hint">
                {academyForms.length === 0
                  ? `${year}년에 디랩에서 본 시험 회차가 없습니다. 먼저 '회차 등록'으로 만드세요.`
                  : '디랩에서 본 시험만 나옵니다. 입학 전 성적은 성적 관리 화면에서 봅니다.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ① 성적 ── */}
      <div className="card-sec" style={{ marginTop: 14 }}>
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="file-spreadsheet" size={15} />
            </span>
            ① 성적
          </div>
          <div className="r" style={{ fontSize: 12, color: 'var(--muted)' }}>
            담임용 통합 성적 파일을 받은 그대로 올립니다
          </div>
        </div>
        <div className="card-sec-b">
          <FilePick label="성적 파일" required onChange={setScoreFile} disabled={locked || noBranch} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              disabled={locked || noBranch || !scoreFile || scoreBusy}
              onClick={() => void runPreview()}
            >
              <Icon name="eye" size={14} /> {scoreBusy && !confirmApply ? '읽는 중…' : '미리보기'}
            </button>
            <button
              type="button"
              className="btn pri"
              disabled={!preview || applied !== null || scoreBusy || preview.matched.length === 0}
              onClick={() => setConfirmApply(true)}
            >
              <Icon name="upload" size={14} /> 반영
            </button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              미리보기에서 누가 들어가는지 확인한 뒤 반영합니다. 찾은 학생만 저장됩니다.
            </span>
          </div>
          {scoreErr && (
            <div className="note-box" role="alert" style={{ marginTop: 10, borderColor: 'var(--red)', color: 'var(--red)' }}>
              {scoreErr}
            </div>
          )}
          {preview && (
            <div style={{ marginTop: 12 }}>
              <div className="note-box" role="status" style={applied ? { borderColor: 'var(--green)' } : undefined}>
                <div>
                  {applied ? <b>반영했습니다. </b> : <b>미리보기 — 아직 저장하지 않았습니다. </b>}
                  {preview.examName && <>{preview.examName} · </>}파일 {preview.totalRows}행 · 외부생 제외{' '}
                  {preview.skippedExternal}명 · <b>찾음 {preview.matched.length}명</b> · 못 찾음{' '}
                  <b style={{ color: preview.unmatched.length ? 'var(--red)' : undefined }}>{preview.unmatched.length}명</b>
                  {applied && preview.unmatched.length > 0 && <> — 못 찾은 학생은 저장하지 않았습니다.</>}
                </div>
              </div>
              {preview.unmatched.length > 0 && (
                <DataTable
                  nowrap
                  columns={unmatchedCols}
                  rows={preview.unmatched}
                  rowKey={(r) => String(r.rowNumber)}
                  pageSize={10}
                  countLabel={
                    <>
                      못 찾은 행 <b>{preview.unmatched.length}</b>건 — 학생을 이어 주면 다음 회차부터 자동으로 찾습니다
                    </>
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── ② 문항 정보 ── */}
      <div className="card-sec" style={{ marginTop: 14 }}>
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="list-checks" size={15} />
            </span>
            ② 문항 정보
          </div>
          <div className="r" style={{ fontSize: 12, color: 'var(--muted)' }}>
            정오·답안보다 먼저 올립니다
          </div>
        </div>
        <div className="card-sec-b">
          <FilePick label="문항분석표" required onChange={setAnalysisFile} disabled={locked} />
          <FilePick label="정답률" onChange={setRatesFile} disabled={locked} />
          <button
            type="button"
            className="btn pri"
            disabled={locked || !analysisFile || itemBusy}
            onClick={() => setConfirmItems(true)}
          >
            <Icon name="upload" size={14} /> {itemBusy ? '올리는 중…' : '올리기'}
          </button>
          {itemErr && (
            <div className="note-box" role="alert" style={{ marginTop: 10, borderColor: 'var(--red)', color: 'var(--red)' }}>
              {itemErr}
            </div>
          )}
          {itemRes && (
            <div className="note-box" role="status" style={{ marginTop: 10, borderColor: 'var(--green)' }}>
              <div>
                <b>올렸습니다.</b> 문항 {itemRes.itemCount}개 · 전국 정답률이 붙은 문항 {itemRes.ratesApplied}개
                {itemRes.unmatchedRates.length > 0 && (
                  <div style={{ marginTop: 6, color: 'var(--amber)' }}>
                    정답률을 붙이지 못한 과목이 있습니다 — 과목 이름이 두 파일에서 다르게 적혀 있을 수 있습니다:{' '}
                    {itemRes.unmatchedRates.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ③ 정오·답안 ── */}
      <div className="card-sec" style={{ marginTop: 14 }}>
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="check-check" size={15} />
            </span>
            ③ 정오 · 답안
          </div>
          <div className="r" style={{ fontSize: 12, color: 'var(--muted)' }}>
            ② 문항 정보가 올라가 있어야 합니다
          </div>
        </div>
        <div className="card-sec-b">
          <FilePick label="정오표" required onChange={setResultsFile} disabled={locked || noBranch} />
          <FilePick label="답안표" onChange={setAnswersFile} disabled={locked || noBranch} />
          <button
            type="button"
            className="btn pri"
            disabled={locked || noBranch || !resultsFile || respBusy}
            onClick={() => void runResponses()}
          >
            <Icon name="upload" size={14} /> {respBusy ? '올리는 중…' : '올리기'}
          </button>
          {respErr && (
            <div className="note-box" role="alert" style={{ marginTop: 10, borderColor: 'var(--red)', color: 'var(--red)' }}>
              {respErr}
            </div>
          )}
          {respRes && (
            <div className="note-box" role="status" style={{ marginTop: 10, borderColor: 'var(--green)' }}>
              <div>
                <b>올렸습니다.</b> 저장 {respRes.savedStudents}명 · 외부생 제외 {respRes.skippedExternal}명 · 못 찾음{' '}
                {respRes.unmatched.length}명
                {respRes.unknownSubjects.length > 0 && (
                  <div style={{ marginTop: 6, color: 'var(--amber)' }}>
                    채점하지 못한 과목이 있습니다 — 파일의 과목 약어를 알아보지 못했습니다:{' '}
                    {respRes.unknownSubjects.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* 한 줄로 늘어놓으면 백 명이 넘을 때 읽을 수 없다 — ①과 같은 표로 */}
          {respRes && respRes.unmatched.length > 0 && (
            <DataTable
              nowrap
              columns={respUnmatchedCols}
              rows={respRes.unmatched}
              rowKey={(r) => String(r.rowNumber)}
              pageSize={10}
              countLabel={
                <>
                  못 찾은 행 <b>{respRes.unmatched.length}</b>건 — ① 성적에서 학생을 이어 두면 다음부터 함께 찾습니다
                </>
              }
            />
          )}
        </div>
      </div>

      {/* ── 모달들 ── */}
      {reg && (
        <Modal
          title="시험 회차 등록"
          sub={`${year}년 · 디랩에서 본 시험`}
          confirmLabel="등록"
          busy={regBusy}
          error={regErr}
          confirmDisabled={!template || reg.examName.trim() === '' || reg.examDate === ''}
          onConfirm={() => void submitReg()}
          onClose={() => setReg(null)}
        >
          <div className="frow">
            <label className="req">학년</label>
            <select className="sel" value={reg.gradeType} onChange={(e) => setReg({ ...reg, gradeType: e.target.value as GradeType })}>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {GRADE_LABEL[g]}
                </option>
              ))}
            </select>
          </div>
          <div className="frow">
            <label className="req">시험</label>
            <select className="sel" value={reg.examCode} onChange={(e) => setReg({ ...reg, examCode: e.target.value as ExamCode })}>
              {CODES.map((c) => (
                <option key={c} value={c}>
                  {c === 'MONTHLY' ? '월례고사' : c === 'CSAT' ? '수능' : `${EXAM_CODE_LABEL[c]} 모의고사`}
                </option>
              ))}
            </select>
          </div>
          <div className="frow">
            <label className="req">이름</label>
            <div>
              <input
                className="inp"
                maxLength={60}
                placeholder="예: 2026년 6월 더프리미엄 모의고사"
                value={reg.examName}
                onChange={(e) => setReg({ ...reg, examName: e.target.value })}
              />
              <div className="hint">학생 앱과 신상기록부에 이 이름 그대로 나갑니다.</div>
            </div>
          </div>
          <div className="frow">
            <label className="req">시행일</label>
            <input className="inp" type="date" value={reg.examDate} onChange={(e) => setReg({ ...reg, examDate: e.target.value })} />
          </div>
          {isSuper && canSeeAdmin && (
            <div className="frow">
              <label>적용 지점</label>
              <select
                className="sel"
                value={reg.common ? 'common' : 'mine'}
                onChange={(e) => setReg({ ...reg, common: e.target.value === 'common' })}
              >
                <option value="mine">{academyName ?? '선택한 지점'}만</option>
                <option value="common">전 지점 공통</option>
              </select>
            </div>
          )}
          <div className="frow">
            <label>과목</label>
            <div>
              {template ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {template.subjects.map((s) => (
                      <span key={s.subjectCode} className="mk supplement">
                        {s.subjectName}
                      </span>
                    ))}
                  </div>
                  <div className="hint">{template.from}을 그대로 씁니다.</div>
                </>
              ) : (
                <div className="hint" style={{ color: 'var(--red)' }}>
                  이 학년의 과목 양식이 없어 등록할 수 없습니다.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {confirmApply && preview && (
        <Modal
          title="성적 반영"
          sub={exam ? formLabel(exam) : undefined}
          confirmLabel="반영"
          busy={scoreBusy}
          error={scoreErr}
          onConfirm={() => void runApply()}
          onClose={() => setConfirmApply(false)}
        >
          <div className="note-box">
            <div>
              찾은 <b>{preview.matched.length}명</b>의 성적을 저장합니다. 이 회차에 이미 올린 성적이 있으면{' '}
              <b>새 파일 값으로 바뀝니다.</b>
              {preview.unmatched.length > 0 && <> 못 찾은 {preview.unmatched.length}명은 저장하지 않습니다.</>}
            </div>
          </div>
        </Modal>
      )}

      {confirmItems && (
        <Modal
          title="문항 정보 올리기"
          sub={exam ? formLabel(exam) : undefined}
          confirmLabel="올리기"
          busy={itemBusy}
          error={itemErr}
          onConfirm={() => void runItems()}
          onClose={() => setConfirmItems(false)}
        >
          <div className="note-box">
            <div>
              이 회차에 이미 올린 문항 정보가 있으면 <b>통째로 바뀝니다.</b> 정답률 파일 없이 올렸다면 나중에 둘을
              함께 다시 올리면 됩니다.
            </div>
          </div>
        </Modal>
      )}

      {link && (
        <Modal
          title="학생 연결"
          sub={`${link.row.rowNumber}행 · ${link.row.name} · ${link.row.classNo}반 ${link.row.studentNo}`}
          confirmLabel="연결"
          busy={linkBusy}
          error={linkErr}
          confirmDisabled={link.enrollmentId === ''}
          onConfirm={() => void submitLink()}
          onClose={() => setLink(null)}
        >
          <div className="frow">
            <label className="req">학생</label>
            <div>
              <select
                className="sel"
                value={link.enrollmentId}
                disabled={students === null}
                onChange={(e) => setLink({ ...link, enrollmentId: e.target.value })}
              >
                <option value="">{students === null ? '불러오는 중…' : '학생 선택'}</option>
                {linkOptions.map((s) => (
                  <option key={s.enrollmentId} value={s.enrollmentId}>
                    {s.name} · {s.studentNo ?? '학번 없음'} · {GRADE_LABEL[s.grade]}
                    {s.className ? ` · ${s.className}` : ''}
                  </option>
                ))}
              </select>
              <div className="hint">
                사유: {link.row.reason.replace(/\.$/, '')}. 한 번 이으면 {exam?.year ?? year}년 다음 회차부터 이 학생으로 자동으로 찾습니다.
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export const examUploadMockup: Mockup = { Content }
