import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Modal, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { StudentList, type StudentRow } from '../../components/StudentList'
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
  listStudentResults,
  updateResult,
  type AdmissionResult,
  type AdmissionResultInput,
  type AdmissionResultRow,
  type AdmissionStatistics,
  type AdmissionType,
} from '../../api/admissionResults'
import type { Mockup } from './types'

/* F-4.10-6 실적 관리(실적 입력) — /api/v1/admin/admission-results (2026-09-21 연동)
 *
 * DSA '실적>실적 입력(부산기숙)'에서 연도/시험선택·실적목록·수정 확인.
 *
 * ★ **지원 목록이 곧 실적이다.** 학생이 수시·정시 지원 대학을 넣고, 발표 뒤 직원이 합불을
 *   채운다. 따로 두면 같은 대학을 두 번 입력하게 된다(성적 입력과 같은 방식).
 *
 * ★ **목업과 구성이 다르다 — 서버에 '그해 전체 실적 목록' 이 없다.** 조회가 학생 한 명
 *   단위뿐이라, 학생마다 부르면 인원수만큼 요청이 나간다(화면에서 모아 세지 않는다 — 원생이
 *   늘수록 그대로 느려진다). 그래서 실적 입력 탭을 **학생을 고르면 그 학생의 지원 목록이
 *   나오는** 좌우 분할로 바꿨다(ConsultLog 와 같은 모양). 목록 API 가 생기면 표로 되돌린다.
 *   API_GAPS 29-1.
 *
 * ★ **목표 계열 5단계(메디컬·서울 최상위·서울 지거국·수도권·지방 4년제)는 서버에 없다.**
 *   서버의 계열(trackName)은 자유 입력이다. 5단계는 명칭·순서부터 미확정이라(#42 / I-22)
 *   상단 카드를 서버가 주는 값(지원·수시·정시·합격·합격률)으로 바꿨다. API_GAPS 29-2.
 *
 * ★ 합격률의 분모는 **발표 난 건수**다. 전체로 나누면 발표 전 지원까지 실패로 잡힌다.
 */

type EditDraft = {
  resultId: number | null
  admissionType: AdmissionType
  universityName: string
  departmentName: string
  trackName: string
  result: AdmissionResult
  memo: string
}

const EMPTY_DRAFT: EditDraft = {
  resultId: null,
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

/** 좌측 목록 필터. 실적은 수험생 몫이라 고2 는 따로 뺄 수 있게 둔다 */
const FILTERS = ['재원 전체', '고3', 'N수'] as const
type Filter = (typeof FILTERS)[number]

function toRow(s: Student): StudentRow {
  return {
    id: String(s.enrollmentId),
    name: s.name,
    meta: [GRADE_LABEL[s.grade] ?? s.grade, s.studentNo ?? ''].filter(Boolean).join(' · '),
  }
}

function Content() {
  const { academyId, ready: academyReady } = useAcademy()
  const thisYear = new Date().getFullYear()
  const [tab, setTab] = useState('list')
  const [year, setYear] = useState(thisYear)

  /* ── 좌측 학생 목록 ── */
  const [students, setStudents] = useState<Student[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('재원 전체')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /* ── 우측 지원 목록 ── */
  const [rows, setRows] = useState<AdmissionResultRow[]>([])
  const [rowsLoading, setRowsLoading] = useState(false)
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
    // 지점 목록 전엔 전 지점 학생이 한 번 섞여 온다. 지점을 바꾸면 이전 선택도 비운다 —
    // 남겨두면 목록에 없는 학생의 실적이 오른쪽에 그대로 보인다
    setSelectedId(null)
    if (!academyReady) return
    let alive = true
    setListLoading(true)
    searchStudents({
      academyId: academyId ?? undefined,
      year,
      status: 'ENROLLED',
      size: 500,
      sort: 'studentNo,asc',
    })
      .then((page) => alive && setStudents(page.rows))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : '학생 목록을 불러오지 못했습니다.'))
      .finally(() => alive && setListLoading(false))
    return () => {
      alive = false
    }
  }, [academyId, academyReady, year])

  const filtered = useMemo(() => {
    if (filter === '고3') return students.filter((s) => s.grade === 'HIGH3')
    if (filter === 'N수') return students.filter((s) => s.grade === 'N_SU')
    return students
  }, [students, filter])

  const selected = students.find((s) => String(s.enrollmentId) === selectedId) ?? null

  const loadRows = useCallback(async () => {
    if (selectedId === null) {
      setRows([])
      return
    }
    setRowsLoading(true)
    try {
      setRows(await listStudentResults(Number(selectedId)))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '지원 목록을 불러오지 못했습니다.')
      setRows([])
    } finally {
      setRowsLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    setNotice(null)
    void loadRows()
  }, [loadRows])

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

  const used = (t: AdmissionType) => rows.filter((r) => r.admissionType === t).length

  async function save(): Promise<boolean> {
    if (!draft || selectedId === null) return false
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
      if (draft.resultId === null) await createResult(Number(selectedId), body)
      else await updateResult(draft.resultId, body)
      setNotice(draft.resultId === null ? '지원을 추가했습니다.' : '고쳤습니다. 이 줄은 이제 직원 확인 값입니다.')
      await Promise.all([loadRows(), loadStats()])
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
      await Promise.all([loadRows(), loadStats()])
      return true
    } catch (e) {
      setModalErr(e instanceof ApiError ? e.message : '내리지 못했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<AdmissionResultRow>[] = [
    {
      key: 'admissionType',
      header: '전형',
      width: '64px',
      align: 'center',
      sortable: true,
      value: (r) => ADMISSION_TYPE_LABEL[r.admissionType],
      render: (r) => <span className="mk supplement">{ADMISSION_TYPE_LABEL[r.admissionType]}</span>,
    },
    { key: 'universityName', header: '대학', sortable: true, value: (r) => r.universityName },
    { key: 'departmentName', header: '학과', value: (r) => r.departmentName },
    { key: 'trackName', header: '계열', width: '90px', value: (r) => r.trackName ?? '-' },
    {
      key: 'result',
      header: '결과',
      width: '84px',
      align: 'center',
      sortable: true,
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
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              왼쪽에서 학생을 고르면 그 학생의 수시·정시 지원이 나옵니다
            </span>
          )}
        </div>

        {tab === 'list' ? (
          <div style={{ padding: '0 14px 14px' }}>
            <div className="layout">
              <StudentList
                title="재원생"
                count={`${filtered.length}명`}
                filters={[...FILTERS]}
                filter={filter}
                onFilterChange={(f) => setFilter(f as Filter)}
                rows={filtered.map(toRow)}
                selected={selectedId ?? undefined}
                onSelect={setSelectedId}
                loading={listLoading}
                emptyText={academyId === null ? '위에서 지점을 먼저 고르세요.' : '해당하는 학생이 없습니다.'}
              />

              <section className="panel" style={{ padding: 16 }}>
                {error && (
                  <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                    {error}
                  </div>
                )}
                {notice && <div className="note-box">{notice}</div>}

                {selected === null ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    학생을 고르세요.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <b style={{ fontSize: 15 }}>{selected.name}</b>
                      <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                        {GRADE_LABEL[selected.grade] ?? selected.grade} · {selected.studentNo ?? '학번 없음'}
                      </span>
                      <span className="mk supplement" style={{ marginLeft: 'auto' }}>
                        수시 {used('EARLY')}/{ADMISSION_QUOTA.EARLY}
                      </span>
                      <span className="mk supplement">
                        정시 {used('REGULAR')}/{ADMISSION_QUOTA.REGULAR}
                      </span>
                      <button
                        className="btn pri"
                        disabled={busy}
                        onClick={() => {
                          setModalErr(null)
                          /* 수시가 다 찼으면 정시로 시작한다 — 고르고 나서 거절당하지 않게 */
                          const start: AdmissionType =
                            used('EARLY') >= ADMISSION_QUOTA.EARLY ? 'REGULAR' : 'EARLY'
                          setDraft({ ...EMPTY_DRAFT, admissionType: start })
                        }}
                      >
                        <Icon name="plus" size={14} /> 지원 추가
                      </button>
                    </div>

                    <DataTable
                      columns={columns}
                      rows={rows}
                      rowKey={(r) => String(r.id)}
                      masked={false}
                      loading={rowsLoading}
                      pageSize={10}
                      countLabel={
                        <>
                          지원 <b>{rows.length}</b>건
                        </>
                      }
                      emptyText="아직 넣은 지원이 없습니다."
                    />
                  </>
                )}
              </section>
            </div>
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

      {draft && selected && (
        <Modal
          title={`${selected.name} · ${draft.resultId === null ? '지원 추가' : '지원 수정'}`}
          sub={
            draft.resultId === null
              ? `수시 ${ADMISSION_QUOTA.EARLY}개 · 정시 ${ADMISSION_QUOTA.REGULAR}개까지 넣을 수 있습니다.`
              : '고치면 이 줄은 학생 입력이 아니라 직원 확인 값이 됩니다.'
          }
          confirmLabel="저장"
          busy={busy}
          error={modalErr}
          confirmDisabled={draft.universityName.trim() === '' || draft.departmentName.trim() === ''}
          onConfirm={() => void save().then((ok) => ok && setDraft(null))}
          onClose={() => setDraft(null)}
        >
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
          sub="목록과 집계에서 빠집니다. 지난 지원 이력은 서버에 남습니다."
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

export const adminResultMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled data-soon title="준비 중입니다">
        <Icon name="upload" size={14} /> 엑셀 일괄 등록
      </button>
      <button className="btn" disabled data-soon title="준비 중입니다">
        <Icon name="printer" size={14} /> 실적 현황 출력
      </button>
    </>
  ),
}
