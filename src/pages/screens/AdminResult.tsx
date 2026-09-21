import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Modal, PrintButton, useServerTable, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import { GRADE_LABEL, searchStudents, type Student } from '../../api/students'
import {
  ADMISSION_QUOTA,
  ADMISSION_RESULT_LABEL,
  ADMISSION_TYPE_LABEL,
  RESULT_SOURCE_LABEL,
  createResult,
  deleteResult,
  getAdmissionStatistics,
  getResultSuggestions,
  listResults,
  listStudentResults,
  applyResultImport,
  previewResultImport,
  type ResultImport,
  updateResult,
  type AdmissionResult,
  type AdmissionResultInput,
  type AdmissionResultRow,
  type AdmissionStatistics,
  type AdmissionType,
} from '../../api/admissionResults'
import type { Mockup } from './types'
import { importFieldLabel } from '../../lib/importFields'
import { createScreenSignal } from './screenSignal'

/* F-4.10-6 실적 관리(실적 입력) — /api/v1/admin/admission-results (2026-09-21 연동)
 *
 * DSA '실적>실적 입력(부산기숙)'에서 연도/시험선택·실적목록·수정 확인.
 *
 * ★ **지원 목록이 곧 실적이다.** 학생이 수시·정시 지원 대학을 넣고, 발표 뒤 직원이 합불을
 *   채운다. 따로 두면 같은 대학을 두 번 입력하게 된다(성적 입력과 같은 방식).
 *
 * ★ 실적 입력 탭은 **목업대로 지점 전체 표**다. 전체 목록 API 가 없던 동안(29-1)은 학생을 골라
 *   보는 좌우 분할로 바꿔 뒀었다 — 2026-09-21 `GET /admission-results` 가 생겨 되돌렸다.
 *   반·학년은 목록 응답에 없어 재원생 목록에서 채운다. 목업의 '등록 확정' 칸은 결과(합격/등록포기)가 맡는다.
 *
 * ★ **목표 계열 5단계(메디컬·서울 최상위·서울 지거국·수도권·지방 4년제)는 서버에 없다.**
 *   서버의 계열(trackName)은 자유 입력이다. 5단계는 명칭·순서부터 미확정이라(#42 / I-22)
 *   상단 카드를 서버가 주는 값(지원·수시·정시·합격·합격률)으로 바꿨다. API_GAPS 29-2.
 *
 * ★ 합격률의 분모는 **발표 난 건수**다. 전체로 나누면 발표 전 지원까지 실패로 잡힌다.
 */

type EditDraft = {
  resultId: number | null
  /** 누구의 지원인가. 추가할 때는 창에서 고른다 */
  enrollmentId: string
  admissionType: AdmissionType
  universityName: string
  departmentName: string
  trackName: string
  result: AdmissionResult
  memo: string
}

const EMPTY_DRAFT: EditDraft = {
  resultId: null,
  enrollmentId: '',
  admissionType: 'EARLY',
  universityName: '',
  departmentName: '',
  trackName: '',
  result: 'PENDING',
  memo: '',
}

const RESULT_TONE: Record<AdmissionResult, string> = {
  PENDING: '',
  PASSED: 'verified',
  FAILED: 'brandnew',
  GAVE_UP: 'supplement',
}


function Content() {
  const { academyId, ready: academyReady } = useAcademy()
  const thisYear = new Date().getFullYear()
  const [tab, setTab] = useState('list')
  const [year, setYear] = useState(thisYear)

  /* ── 재원생 — 표의 반·학년을 채우고, 지원 추가 때 학생을 고르는 데 쓴다 ── */
  const [students, setStudents] = useState<Student[]>([])

  /* ── 전체 실적 표 ── */
  const [resultFilter, setResultFilter] = useState<AdmissionResult | ''>('')
  const [typeFilter, setTypeFilter] = useState<AdmissionType | ''>('')
  const [keyword, setKeyword] = useState('')
  const [keywordApplied, setKeywordApplied] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /* ── 집계 ── */
  const [stats, setStats] = useState<AdmissionStatistics | null>(null)

  /* ── 모달 ── */
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [dropping, setDropping] = useState<AdmissionResultRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [modalErr, setModalErr] = useState<string | null>(null)
  const [suggest, setSuggest] = useState<{ universities: string[]; departments: string[] }>({
    universities: [],
    departments: [],
  })

  /* 학생 목록 — 서버 페이징이지만 한 지점 재원생은 수백 명 안이라 한 번에 받는다 */
  useEffect(() => {
    // 지점 목록 전엔 전 지점 학생이 한 번 섞여 온다
    if (!academyReady) return
    let alive = true
    searchStudents({
      academyId: academyId ?? undefined,
      year,
      status: 'ENROLLED',
      size: 500,
      sort: 'studentNo,asc',
    })
      .then((page) => alive && setStudents(page.rows))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : '학생 목록을 불러오지 못했습니다.'))
    return () => {
      alive = false
    }
  }, [academyId, academyReady, year])

  const studentById = useMemo(() => new Map(students.map((s) => [s.enrollmentId, s])), [students])

  // ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다
  const params = useMemo(
    () => ({
      academyId: academyId ?? undefined,
      year,
      result: resultFilter || undefined,
      admissionType: typeFilter || undefined,
      keyword: keywordApplied.trim() || undefined,
    }),
    [academyId, year, resultFilter, typeFilter, keywordApplied],
  )
  /* 본사 계정은 지점 없이 부르면 400 이다(집계와 같다) — 지점을 고르기 전에는 안 부른다 */
  const table = useServerTable({ fetcher: listResults, params, pageSize: 20, enabled: academyReady && academyId !== null })
  const importVer = imported.useVersion()

  /* 추가·수정 창의 전형별 개수 — 그 학생의 지원을 따로 읽어 센다(표는 페이지 단위라 못 센다) */
  const [studentRows, setStudentRows] = useState<AdmissionResultRow[]>([])
  const draftStudent = draft?.enrollmentId ?? ''
  useEffect(() => {
    if (draftStudent === '') {
      setStudentRows([])
      return
    }
    let alive = true
    listStudentResults(Number(draftStudent))
      .then((r) => alive && setStudentRows(r))
      .catch(() => alive && setStudentRows([]))
    return () => {
      alive = false
    }
  }, [draftStudent])

  const loadStats = useCallback(async () => {
    /* ★ 지점을 정하기 전에는 부르지 않는다. 학원생 현황 집계와 달리 이쪽은 본사 계정이
         academyId 를 안 보내면 400 이다(CLAUDE.md 3-1) — 확인함(2026-09-21) */
    if (academyId === null) {
      setStats(null)
      return
    }
    try {
      setStats(
        await getAdmissionStatistics({
          academyId,
          year,
          from: `${year}-01-01`,
          to: `${year}-12-31`,
        }),
      )
    } catch {
      setStats(null)
    }
  }, [academyId, year])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  // 헤더 엑셀 등록이 반영하면 표와 집계를 다시 읽는다
  useEffect(() => {
    if (importVer === 0) return
    table.reload()
    void loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importVer])

  /* 대학을 고르면 그 대학 학과로 좁힌다. 비어 있어도 정상 — 첫 해에는 쌓인 값이 없다 */
  useEffect(() => {
    if (!draft) return
    let alive = true
    getResultSuggestions({ university: draft.universityName.trim() || undefined })
      .then((s) => alive && setSuggest(s))
      .catch(() => alive && setSuggest({ universities: [], departments: [] }))
    return () => {
      alive = false
    }
  }, [draft?.universityName, draft])

  const used = (t: AdmissionType) => studentRows.filter((r) => r.admissionType === t).length

  async function save(): Promise<boolean> {
    if (!draft || draft.enrollmentId === '') return false
    setBusy(true)
    setModalErr(null)
    const body: AdmissionResultInput = {
      admissionType: draft.admissionType,
      universityName: draft.universityName.trim(),
      departmentName: draft.departmentName.trim(),
      trackName: draft.trackName.trim() || undefined,
      result: draft.result,
      memo: draft.memo.trim() || undefined,
    }
    try {
      if (draft.resultId === null) await createResult(Number(draft.enrollmentId), body)
      else await updateResult(draft.resultId, body)
      setNotice(draft.resultId === null ? '지원을 추가했습니다.' : '고쳤습니다. 이 줄은 이제 직원 확인 값입니다.')
      table.reload()
      await loadStats()
      return true
    } catch (e) {
      /* "정시는 3개까지 등록합니다. 지우고 다시 넣어 주세요." — 서버 문구가 그대로 쓸 만하다 */
      setModalErr(e instanceof ApiError ? e.message : '저장하지 못했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function drop(): Promise<boolean> {
    if (!dropping) return false
    setBusy(true)
    setModalErr(null)
    try {
      await deleteResult(dropping.id)
      setNotice(`${dropping.universityName} ${dropping.departmentName} 지원을 내렸습니다.`)
      table.reload()
      await loadStats()
      return true
    } catch (e) {
      setModalErr(e instanceof ApiError ? e.message : '내리지 못했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<AdmissionResultRow>[] = [
    { key: 'studentNo', header: '학번', width: '96px', value: (r) => r.studentNo ?? '-', sticky: true },
    { key: 'studentName', header: '이름', width: '80px', value: (r) => r.studentName, sticky: true },
    {
      key: 'grade',
      header: '학년',
      width: '56px',
      align: 'center',
      value: (r) => {
        const st = studentById.get(r.enrollmentId)
        return st ? (GRADE_LABEL[st.grade] ?? st.grade) : '-'
      },
    },
    { key: 'className', header: '반', width: '80px', value: (r) => studentById.get(r.enrollmentId)?.className ?? '-' },
    {
      key: 'admissionType',
      header: '전형',
      width: '64px',
      align: 'center',
      value: (r) => ADMISSION_TYPE_LABEL[r.admissionType],
      render: (r) => <span className="mk supplement">{ADMISSION_TYPE_LABEL[r.admissionType]}</span>,
    },
    { key: 'universityName', header: '대학', value: (r) => r.universityName },
    { key: 'departmentName', header: '학과', value: (r) => r.departmentName },
    { key: 'trackName', header: '계열', width: '90px', value: (r) => r.trackName ?? '-' },
    {
      key: 'result',
      header: '결과',
      width: '84px',
      align: 'center',
      value: (r) => ADMISSION_RESULT_LABEL[r.result],
      render: (r) => <span className={`mk ${RESULT_TONE[r.result]}`}>{ADMISSION_RESULT_LABEL[r.result]}</span>,
    },
    {
      key: 'source',
      header: '입력',
      width: '80px',
      align: 'center',
      value: (r) => RESULT_SOURCE_LABEL[r.source],
      /* 학생이 적은 값인지 직원이 확인한 값인지 — 직원이 고치면 서버가 '직원 확인' 으로 바꾼다 */
      render: (r) => (
        <span style={{ fontSize: 11.5, color: r.source === 'STAFF' ? 'var(--mint-d)' : 'var(--muted)' }}>
          {RESULT_SOURCE_LABEL[r.source]}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      width: '120px',
      align: 'center',
      value: () => '',
      render: (r) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <button
            className="btn"
            style={{ padding: '4px 9px', fontSize: 11.5, whiteSpace: 'nowrap' }}
            disabled={busy}
            onClick={() => {
              setModalErr(null)
              setDraft({
                resultId: r.id,
                enrollmentId: String(r.enrollmentId),
                admissionType: r.admissionType,
                universityName: r.universityName,
                departmentName: r.departmentName,
                trackName: r.trackName ?? '',
                result: r.result,
                memo: r.memo ?? '',
              })
            }}
          >
            수정
          </button>
          <button
            className="btn"
            style={{ padding: '4px 9px', fontSize: 11.5, whiteSpace: 'nowrap', color: 'var(--red)' }}
            disabled={busy}
            onClick={() => {
              setModalErr(null)
              setDropping(r)
            }}
          >
            내리기
          </button>
        </div>
      ),
    },
  ]

  /* 합격률 — 분모는 발표 난 건수. 발표 전을 넣으면 실제보다 낮게 나온다 */
  const passRate = stats && stats.decided > 0 ? Math.round((stats.passed / stats.decided) * 100) : null
  const byUniversity = stats
    ? Object.entries(stats.passedByUniversity).sort((a, b) => b[1] - a[1])
    : []
  const maxUni = Math.max(1, ...byUniversity.map(([, n]) => n))

  return (
    <>
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="file-text" size={13} /> 지원
          </div>
          <div className="v">{stats?.total ?? '-'}</div>
          <div className="d">{year}년 전체</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="calendar" size={13} /> 수시
          </div>
          <div className="v">{stats?.early ?? '-'}</div>
          <div className="d">한 명당 {ADMISSION_QUOTA.EARLY}개까지</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="calendar-check" size={13} /> 정시
          </div>
          <div className="v">{stats?.regular ?? '-'}</div>
          <div className="d">한 명당 {ADMISSION_QUOTA.REGULAR}개까지</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="megaphone" size={13} /> 발표
          </div>
          <div className="v">{stats?.decided ?? '-'}</div>
          <div className="d">발표 전 {stats ? stats.total - stats.decided : '-'}건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="award" size={13} /> 합격
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {stats?.passed ?? '-'}
          </div>
          <div className="d">등록포기 포함</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 합격률
          </div>
          <div className="v">{passRate === null ? '-' : `${passRate}%`}</div>
          <div className="d">발표 난 것 기준</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '실적 입력' },
            { key: 'stat', label: '현황 · 통계' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="sel" style={{ width: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear, thisYear - 1].map((y) => (
              <option key={y} value={y}>
                {y}학년도
              </option>
            ))}
          </select>
          {tab === 'list' && (
            <>
              <select
                className="sel"
                style={{ width: 110 }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as AdmissionType | '')}
              >
                <option value="">전형 전체</option>
                {(Object.keys(ADMISSION_TYPE_LABEL) as AdmissionType[]).map((t) => (
                  <option key={t} value={t}>
                    {ADMISSION_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <select
                className="sel"
                style={{ width: 110 }}
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value as AdmissionResult | '')}
              >
                <option value="">결과 전체</option>
                {(Object.keys(ADMISSION_RESULT_LABEL) as AdmissionResult[]).map((r) => (
                  <option key={r} value={r}>
                    {ADMISSION_RESULT_LABEL[r]}
                  </option>
                ))}
              </select>
              <input
                className="inp"
                style={{ width: 200 }}
                placeholder="이름 · 학번 · 대학"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setKeywordApplied(keyword)}
              />
              <button type="button" className="btn" onClick={() => setKeywordApplied(keyword)}>
                <Icon name="search" size={14} /> 검색
              </button>
              <button
                type="button"
                className="btn pri"
                style={{ marginLeft: 'auto' }}
                disabled={busy || academyId === null}
                onClick={() => {
                  setModalErr(null)
                  setDraft({ ...EMPTY_DRAFT })
                }}
              >
                <Icon name="plus" size={14} /> 지원 추가
              </button>
            </>
          )}
        </div>

        {tab === 'list' ? (
          <div style={{ padding: '0 14px 14px' }}>
            {error && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {error}
              </div>
            )}
            {table.error && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {table.error}
              </div>
            )}
            {notice && <div className="note-box">{notice}</div>}
            <DataTable
              nowrap
              columns={columns}
              rows={table.rows}
              rowKey={(r) => String(r.id)}
              masked={false}
              loading={table.loading}
              serverPaging={table.serverPaging}
              countLabel={
                <>
                  {year}학년도 지원 <b>{table.serverPaging.totalElements}</b>건
                </>
              }
              emptyText={academyId === null ? '위에서 지점을 먼저 고르세요.' : '조건에 맞는 지원이 없습니다.'}
            />
          </div>
        ) : (
          <div className="card-sec-b">
            <div className="note-box">
              <div>
                합격률은 <b>발표가 난 건만</b> 나눕니다. 발표 전 지원까지 넣으면 실제보다 낮게 나옵니다. 합격에는{' '}
                <b>등록포기도 들어갑니다</b> — 붙은 것은 사실이고, 등록 여부는 아래 결과별 집계로 봅니다.
              </div>
            </div>

            <div className="split" style={{ marginTop: 12 }}>
              <div>
                <div className="lt" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                  결과별
                </div>
                {(['PASSED', 'GAVE_UP', 'FAILED', 'PENDING'] as AdmissionResult[]).map((k) => {
                  const n = stats?.byResult[k] ?? 0
                  const total = Math.max(1, stats?.total ?? 0)
                  return (
                    <div
                      key={k}
                      style={{ display: 'grid', gridTemplateColumns: '72px 1fr 48px', gap: 10, alignItems: 'center', marginBottom: 8 }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{ADMISSION_RESULT_LABEL[k]}</span>
                      <div style={{ height: 18, background: 'var(--line-2)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${(n / total) * 100}%`, height: '100%', background: 'var(--mint)' }} />
                      </div>
                      <span style={{ fontSize: 12.5, textAlign: 'right' }}>
                        <b>{n}</b>건
                      </span>
                    </div>
                  )
                })}
              </div>

              <div>
                <div className="lt" style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                  대학별 합격
                </div>
                {byUniversity.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{year}학년도 합격 기록이 아직 없습니다.</div>
                ) : (
                  byUniversity.map(([uni, n]) => (
                    <div
                      key={uni}
                      style={{ display: 'grid', gridTemplateColumns: '120px 1fr 48px', gap: 10, alignItems: 'center', marginBottom: 8 }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{uni}</span>
                      <div style={{ height: 18, background: 'var(--line-2)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${(n / maxUni) * 100}%`, height: '100%', background: 'var(--violet)' }} />
                      </div>
                      <span style={{ fontSize: 12.5, textAlign: 'right' }}>
                        <b>{n}</b>명
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {draft && (
        <Modal
          title={`${
            studentById.get(Number(draft.enrollmentId))?.name ??
            table.rows.find((r) => r.id === draft.resultId)?.studentName ??
            '학생'
          } · ${draft.resultId === null ? '지원 추가' : '지원 수정'}`}
          sub={
            draft.resultId === null
              ? `수시 ${ADMISSION_QUOTA.EARLY}개 · 정시 ${ADMISSION_QUOTA.REGULAR}개까지 넣을 수 있습니다.`
              : '고치면 이 줄은 학생 입력이 아니라 직원 확인 값이 됩니다.'
          }
          confirmLabel="저장"
          busy={busy}
          error={modalErr}
          confirmDisabled={
            draft.enrollmentId === '' || draft.universityName.trim() === '' || draft.departmentName.trim() === ''
          }
          onConfirm={() => void save().then((ok) => ok && setDraft(null))}
          onClose={() => setDraft(null)}
        >
          {draft.resultId === null && (
            <div className="frow">
              <label className="req">학생</label>
              <select
                className="sel"
                value={draft.enrollmentId}
                onChange={(e) => {
                  const id = e.target.value
                  setDraft({ ...draft, enrollmentId: id })
                }}
              >
                <option value="">학생 선택</option>
                {/* 실적은 수험생 몫이라 고3·N수를 먼저 둔다 */}
                {[...students]
                  .sort((a, b) => Number(a.grade === 'HIGH2') - Number(b.grade === 'HIGH2'))
                  .map((st) => (
                    <option key={st.enrollmentId} value={st.enrollmentId}>
                      {st.name} · {st.studentNo ?? '학번 없음'} · {GRADE_LABEL[st.grade] ?? st.grade}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="frow">
            <label className="req">전형</label>
            <div>
              <select
                className="sel"
                value={draft.admissionType}
                onChange={(e) => setDraft({ ...draft, admissionType: e.target.value as AdmissionType })}
              >
                {(Object.keys(ADMISSION_TYPE_LABEL) as AdmissionType[]).map((t) => (
                  <option key={t} value={t}>
                    {ADMISSION_TYPE_LABEL[t]} ({used(t)}/{ADMISSION_QUOTA[t]})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="frow">
            <label className="req">대학</label>
            <div>
              {/* 자동완성은 이미 넣은 값에서 만든다 — 비어 있어도 직접 쓰면 된다 */}
              <input
                className="inp"
                list="ar-uni"
                maxLength={60}
                value={draft.universityName}
                onChange={(e) => setDraft({ ...draft, universityName: e.target.value })}
              />
              <datalist id="ar-uni">
                {suggest.universities.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="frow">
            <label className="req">학과</label>
            <div>
              <input
                className="inp"
                list="ar-dept"
                maxLength={60}
                value={draft.departmentName}
                onChange={(e) => setDraft({ ...draft, departmentName: e.target.value })}
              />
              <datalist id="ar-dept">
                {suggest.departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="frow">
            <label>계열</label>
            <div>
              <input
                className="inp"
                maxLength={30}
                placeholder="예: 메디컬"
                value={draft.trackName}
                onChange={(e) => setDraft({ ...draft, trackName: e.target.value })}
              />
            </div>
          </div>
          <div className="frow">
            <label>결과</label>
            <div>
              <select
                className="sel"
                value={draft.result}
                onChange={(e) => setDraft({ ...draft, result: e.target.value as AdmissionResult })}
              >
                {(Object.keys(ADMISSION_RESULT_LABEL) as AdmissionResult[]).map((r) => (
                  <option key={r} value={r}>
                    {ADMISSION_RESULT_LABEL[r]}
                  </option>
                ))}
              </select>
              <div className="hint">발표 전이면 그대로 두세요. 불합격과 다르게 셉니다.</div>
            </div>
          </div>
          <div className="frow">
            <label>메모</label>
            <div>
              <input
                className="inp"
                maxLength={200}
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
              />
            </div>
          </div>
        </Modal>
      )}

      {dropping && (
        <Modal
          title={`${dropping.universityName} ${dropping.departmentName} 지원을 내릴까요?`}
          sub="목록과 집계에서 빠집니다. 기록 자체는 지워지지 않고 남습니다."
          confirmLabel="내리기"
          danger
          busy={busy}
          error={modalErr}
          onConfirm={() => void drop().then((ok) => ok && setDropping(null))}
          onClose={() => setDropping(null)}
        />
      )}
    </>
  )
}

/* 헤더 '엑셀 일괄 등록' 이 반영한 뒤 본문 표·집계를 다시 읽게 잇는다(CLAUDE.md 5-1) */
const imported = createScreenSignal()

/**
 * 실적 엑셀 일괄 등록 — 미리보기로 몇 건이 들어가고 어느 행이 틀렸는지 먼저 보고 반영한다.
 * ★ 반영 때 같은 파일을 다시 보낸다(서버가 미리보기를 들고 있지 않다). 파일을 바꾸면 미리보기를 지운다.
 */
function ImportButton() {
  const { academyId } = useAcademy()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ResultImport | null>(null)
  const [applied, setApplied] = useState<ResultImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run(apply: boolean) {
    if (!file || academyId === null) return
    setBusy(true)
    setErr(null)
    try {
      const r = apply ? await applyResultImport(academyId, file) : await previewResultImport(academyId, file)
      if (apply) {
        setApplied(r)
        imported.bump()
      }
      setPreview(r)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : apply ? '반영하지 못했습니다.' : '파일을 읽지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const r = applied ?? preview
  return (
    <>
      <button
        className="btn"
        disabled={academyId === null}
        title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
        onClick={() => {
          setOpen(true)
          setFile(null)
          setPreview(null)
          setApplied(null)
          setErr(null)
        }}
      >
        <Icon name="upload" size={14} /> 엑셀 일괄 등록
      </button>
      {open && (
        <Modal
          wide
          title="실적 엑셀 일괄 등록"
          sub="미리보기로 확인한 뒤 반영합니다. 틀린 행은 빼고 나머지만 등록됩니다."
          confirmLabel={applied ? '닫기' : '반영'}
          busy={busy}
          error={err}
          confirmDisabled={!applied && (!preview || !preview.applicable)}
          onConfirm={() => (applied ? setOpen(false) : void run(true))}
          onClose={() => setOpen(false)}
        >
          <div className="frow">
            <label className="req">파일</label>
            <div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setPreview(null)
                  setApplied(null)
                }}
              />
              <div className="hint">
                첫 줄에 칸 이름을 적습니다. <b>학번 · 구분(수시/정시) · 대학명 · 학과명</b>은 꼭 있어야 하고, 이름 · 전형명 ·
                결과(합격/불합격/발표전/등록포기) · 메모는 있으면 함께 들어갑니다. 이름을 적으면 학번과 맞는지 확인합니다.
              </div>
            </div>
          </div>
          <button type="button" className="btn" disabled={!file || busy || applied !== null} onClick={() => void run(false)} style={{ marginBottom: 10 }}>
            <Icon name="eye" size={14} /> {busy && !preview ? '읽는 중…' : '미리보기'}
          </button>
          {r && (
            <>
              <div className="note-box" role="status" style={applied ? { borderColor: 'var(--green)' } : undefined}>
                <div>
                  {applied ? <b>반영했습니다. </b> : <b>미리보기 — 아직 등록하지 않았습니다. </b>}
                  전체 {r.totalRows}행 · 정상 <b>{r.validRows}</b>행 · 오류{' '}
                  <b style={{ color: r.errorRows ? 'var(--red)' : undefined }}>{r.errorRows}</b>행
                  {applied && r.errorRows > 0 && ' — 오류 행은 등록하지 않았습니다.'}
                </div>
              </div>
              {r.errors.length > 0 && (
                <div style={{ maxHeight: 180, overflow: 'auto', marginBottom: 10 }}>
                  <table className="dt" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>행</th>
                        <th style={{ width: 100 }}>칸</th>
                        <th>무엇이 틀렸나</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.errors.map((x, i) => (
                        <tr key={i}>
                          <td>{x.rowNumber}</td>
                          <td>{importFieldLabel(x.field)}</td>
                          <td style={{ color: 'var(--red)' }}>{x.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {r.valid.length > 0 && (
                <div style={{ maxHeight: 220, overflow: 'auto' }}>
                  <table className="dt nowrap" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 50 }}>행</th>
                        <th>학번</th>
                        <th>이름</th>
                        <th>구분</th>
                        <th>대학 · 학과</th>
                        <th>결과</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.valid.map((x) => (
                        <tr key={x.rowNumber}>
                          <td>{x.rowNumber}</td>
                          <td>{x.studentNo}</td>
                          <td>{x.studentName}</td>
                          <td>{ADMISSION_TYPE_LABEL[x.admissionType] ?? x.admissionType}</td>
                          <td>
                            {x.universityName} {x.departmentName}
                          </td>
                          <td>{ADMISSION_RESULT_LABEL[x.result] ?? x.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  )
}

export const adminResultMockup: Mockup = {
  Content,
  actions: (
    <>
      <ImportButton />
      {/* 지금 화면(탭·필터 그대로)을 인쇄한다 — 서버 출력물이 따로 없다 */}
      <PrintButton label="실적 현황 출력" />
    </>
  ),
}
