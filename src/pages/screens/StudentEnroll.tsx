import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { DataTable, MaskToggle, Unfilled, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  GRADE_LABEL,
  TRACK_LABEL,
  admitStudent,
  getNextStudentNo,
  type GradeType,
  type Student,
  type TrackType,
} from '../../api/students'
import {
  ONBOARDING_LABEL,
  approveSignup,
  completeOt,
  listPendingSignups,
  type PendingSignup,
} from '../../api/studentSignups'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.1-3 신규 접수 등록(합격생 등록) — POST /api/v1/admin/students
 *
 * ★ 학번은 서버가 채번한다. 저장할 때 확정되고, 미리보기는 next-student-no 로 받는다.
 *   **미리보기는 예약이 아니다** — 다른 사람이 먼저 저장하면 번호가 밀린다.
 *
 * ★ 유일성은 UNIQUE(academy_id, year, student_no) 다 — **지점 축이 있다**.
 *   같은 해에도 지점이 다르면 같은 학번이 존재하고(2026-0001 이 분당·이매·목동에 각각 있다),
 *   연도가 바뀌면 같은 지점에서도 번호가 재사용된다. 그래서 학번은 PK가 아니다.
 *   학생을 특정할 때는 enrollmentId(등록 건) 또는 studentId(사람)를 쓴다.
 *
 * ★ 저장이 **한 번에 끝난다.** 예전에는 Admit 이 얇아 POST 후 PATCH 로 두 번 나갔고,
 *   첫 단계만 성공하면 중복 등록을 유발했다 — 백엔드가 상세 필드를 등록에 넣어줘서(2026-09-03)
 *   부분 실패 처리 자체가 없어졌다.
 *
 * ★ **승인과 OT 가 한 목록에 못 있는다.** 서버의 승인 대기 목록은 *승인 전* 건만 준다 —
 *   승인하는 순간 그 행이 목록에서 빠진다. 그런데 `onboardingStatus` 는 그 응답에만 있어서
 *   승인된 학생이 OT 를 마쳤는지 볼 방법이 어디에도 없다(학생 상세에도 없다).
 *   게다가 승인 전에 OT 를 누르면 403 이다. 그래서 **한 줄에 [승인][OT] 두 버튼을 두면
 *   OT 는 영영 누를 수 없는 버튼이 된다** — 누르기 전엔 403, 누른 뒤엔 행이 사라진다.
 *
 *   그래서 승인한 건을 화면이 들고 있다가 아래쪽에 따로 보여준다. 서버가 안 주는 것을
 *   화면 기억으로 메우는 것이라 **화면을 벗어나면 없어진다** — 그 사실을 화면에 적어둔다.
 *   API_GAPS 24-8 에 승인분도 내려달라고 요청해 뒀다.
 *
 * ★ 탭이 둘이다(2026-09-14 추가).
 *   · 합격생 등록 — 직원이 학생을 직접 만든다
 *   · 가입 승인   — **학생이 앱에서 가입한 건을 승인한다**
 *
 *   두 번째가 여기 붙는 이유: 학생이 앱에서 가입하면 '승인 대기' 로 남고, 승인 전에는
 *   로그인이 아예 안 된다. 그런데 승인할 화면이 없어서 **가입한 학생이 영영 못 들어왔다.**
 *   신규 학생을 다루는 화면이 여기라 탭으로 붙였다 — 메뉴를 늘리지 않는다.
 *
 *   ★ 관리자가 계정을 직접 만들어주는 API 를 요청하지 않는다. 승인 절차를 우회하는
 *     두 번째 경로가 된다(api/studentSignups.ts 머리 주석).
 *
 * ★ 서버에 넣을 곳이 없는 폼 값 — docs/API_GAPS.md
 *   영문명 · 학부모 연락처 · 졸업연도 · 장학 · 좌석 · 사물함.
 *   반 배정·좌석·사물함·장학은 각자 전용 API가 있으므로 해당 화면에서 처리한다. */

const GRADES: GradeType[] = ['HIGH3', 'N_SU', 'HIGH2']
const TRACKS: TrackType[] = ['SCIENCE', 'HUMANITIES', 'ART', 'COMMON']

interface FormState {
  name: string
  phone: string
  birthDate: string
  gender: string
  address: string
  schoolName: string
  admissionDate: string
  year: string
  grade: GradeType
  track: TrackType
}

const EMPTY: FormState = {
  name: '',
  phone: '',
  birthDate: '',
  gender: '',
  address: '',
  schoolName: '',
  admissionDate: '',
  year: String(new Date().getFullYear()),
  grade: 'N_SU',
  track: 'SCIENCE',
}

type Result = { kind: 'admitted'; student: Student } | { kind: 'failed'; message: string }

/** 합격생 등록 폼 — 원래 이 화면 전체였다. 탭이 생기면서 이름만 갈랐고 내용은 그대로다 */
function EnrollForm() {
  const { academyId, academies } = useAcademy()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [nextNo, setNextNo] = useState<string | null>(null)

  const refreshNextNo = useCallback(async () => {
    if (academyId === null) {
      setNextNo(null)
      return
    }
    try {
      setNextNo(await getNextStudentNo(academyId, Number(form.year)))
    } catch {
      // 미리보기가 없어도 등록은 된다 — 실패는 조용히 넘긴다
      setNextNo(null)
    }
  }, [academyId, form.year])

  useEffect(() => {
    void refreshNextNo()
  }, [refreshNextNo])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const academyName = academies.find((a) => a.id === academyId)?.acadNm ?? null
  const canSave = academyId !== null && form.name.trim().length > 0 && !saving

  async function save() {
    if (academyId === null || form.name.trim() === '') return
    setSaving(true)
    setResult(null)
    try {
      const student = await admitStudent({
        academyId,
        year: Number(form.year),
        name: form.name.trim(),
        grade: form.grade,
        track: form.track,
        phone: form.phone.trim() || undefined,
        birthDate: form.birthDate || undefined,
        gender: form.gender || undefined,
        schoolName: form.schoolName.trim() || undefined,
        address: form.address.trim() || undefined,
        admissionDate: form.admissionDate || undefined,
      })
      setResult({ kind: 'admitted', student })
      setForm(EMPTY)
      void refreshNextNo()
    } catch (err) {
      setResult({ kind: 'failed', message: err instanceof ApiError ? err.message : '등록하지 못했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="note-box">
        <div className="ic">
          <Icon name="graduation-cap" size={17} />
        </div>
        <div>
          <div className="tt">학번 자동 채번 — 저장 시 확정</div>
          <div className="tx">
            학번은 <b>저장할 때 확정</b>됩니다. {nextNo ? <>다음 학번은 <b>{nextNo}</b>입니다 — </> : null}
            <b>미리 잡아두는 번호는 아니라서</b> 다른 사람이 먼저 저장하면 밀립니다.
            번호는 <b>지점별·연도별로 따로</b> 매겨지므로 다른 지점에 같은 학번이 있을 수 있습니다 —
            학생을 특정할 때는 학번만으로 판단하지 마세요.
          </div>
        </div>
      </div>

      {result && (
        <div
          className="note-box"
          role="status"
          style={{ borderColor: result.kind === 'admitted' ? 'var(--mint-b)' : 'var(--red)' }}
        >
          <div className="ic">
            <Icon name={result.kind === 'admitted' ? 'check' : 'triangle-alert'} size={17} />
          </div>
          <div>
            {result.kind === 'admitted' && (
              <>
                <div className="tt">
                  등록 완료 — 학번 <b>{result.student.studentNo ?? '(미부여)'}</b>
                </div>
                <div className="tx">
                  {result.student.name} · {GRADE_LABEL[result.student.grade]} ·{' '}
                  {result.student.track ? TRACK_LABEL[result.student.track] : '계열 미지정'} ·{' '}
                  {result.student.academyName ?? ''}
                </div>
              </>
            )}
            {result.kind === 'failed' && (
              <>
                <div className="tt">등록하지 못했습니다</div>
                <div className="tx">{result.message}</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="split">
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="user-plus" size={15} />
              </span>
              기본 정보
            </div>
          </div>
          <div className="card-sec-b">
            <div className="frow">
              <label className="req">이름</label>
              <div className="two">
                <input
                  className="inp"
                  placeholder="홍길동"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  maxLength={20}
                />
                <div className="link-box" style={{ alignItems: 'center' }}>
                  <div>
                    영문명 <Unfilled reason="등록 요청에 영문명 필드가 없다" />
                  </div>
                </div>
              </div>
            </div>
            <div className="frow">
              <label>생년월일</label>
              <div className="two">
                <input
                  className="inp"
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => set('birthDate', e.target.value)}
                />
                <select className="sel" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">성별 선택</option>
                  <option value="M">남</option>
                  <option value="F">여</option>
                </select>
              </div>
            </div>
            <div className="frow">
              <label>연락처</label>
              <div className="two">
                <input
                  className="inp"
                  placeholder="학생 010-0000-0000"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  maxLength={20}
                />
                <div className="link-box" style={{ alignItems: 'center' }}>
                  <div>
                    학부모 연락처 <Unfilled reason="보호자 연락처를 받는 필드가 없다" />
                  </div>
                </div>
              </div>
            </div>
            <div className="frow">
              <label>주소</label>
              <input
                className="inp"
                placeholder="도로명 주소"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="frow">
              <label>개인정보</label>
              <div className="link-box">
                <div className="chk">
                  <Icon name="lock" size={12} />
                </div>
                <div>
                  전화·주소·생년월일은 <b>지점 관리자 이상만</b> 볼 수 있습니다. 목록·엑셀에서는 기본
                  마스킹되며, 수집 항목은 최소화 원칙을 따릅니다.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="settings" size={15} />
              </span>
              학적 · 배정
            </div>
            <div className="r">
              <span className="mk supplement">{nextNo ? `다음 학번 ${nextNo}` : '학번은 저장 시 부여'}</span>
            </div>
          </div>
          <div className="card-sec-b">
            <div className="frow">
              <label className="req">지점 · 연도</label>
              <div className="two">
                {/* 지점은 상단 지점 선택을 따른다. 여기서 또 고르게 하면 두 값이 어긋난다 */}
                <input className="inp" value={academyName ?? '지점을 먼저 선택하세요'} readOnly />
                <select className="sel" value={form.year} onChange={(e) => set('year', e.target.value)}>
                  {[0, 1].map((d) => {
                    const y = new Date().getFullYear() - d
                    return (
                      <option key={y} value={y}>
                        {y} 시즌
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
            <div className="frow">
              <label className="req">계열 · 학년</label>
              <div className="two">
                <select className="sel" value={form.track} onChange={(e) => set('track', e.target.value as TrackType)}>
                  {TRACKS.map((t) => (
                    <option key={t} value={t}>
                      {TRACK_LABEL[t]}
                    </option>
                  ))}
                </select>
                <select className="sel" value={form.grade} onChange={(e) => set('grade', e.target.value as GradeType)}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {GRADE_LABEL[g]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="frow">
              <label>출신학교</label>
              <div className="two">
                <input
                  className="inp"
                  placeholder="태원고"
                  value={form.schoolName}
                  onChange={(e) => set('schoolName', e.target.value)}
                  maxLength={64}
                />
                <div className="link-box" style={{ alignItems: 'center' }}>
                  <div>
                    졸업연도 <Unfilled reason="졸업연도 필드가 없다" />
                  </div>
                </div>
              </div>
            </div>
            <div className="frow">
              <label>반 · 좌석 · 사물함</label>
              <div className="link-box">
                <div className="chk">
                  <Icon name="arrow-right" size={12} />
                </div>
                <div>
                  등록 요청에는 배정 값이 없습니다. 저장 후 <b>고정반 관리</b>·<b>배정 관리</b> 화면에서
                  배정하세요.
                </div>
              </div>
            </div>
            <div className="frow">
              <label>장학 · 등원일</label>
              <div className="two">
                <div className="link-box" style={{ alignItems: 'center' }}>
                  <div>
                    장학 <Unfilled reason="장학은 배정 관리 화면에서 정합니다" />
                  </div>
                </div>
                <input
                  className="inp"
                  type="date"
                  value={form.admissionDate}
                  onChange={(e) => set('admissionDate', e.target.value)}
                  title="비우면 등록일로 잡힙니다"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-sec">
        <div className="card-sec-b" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            저장하면 <b style={{ color: 'var(--ink)' }}>학번이 확정</b>됩니다. 회원가입 후{' '}
            <b style={{ color: 'var(--ink)' }}>신상기록부 작성이 필수 단계</b>로 강제되며, 미작성 시 등록
            미완 상태로 남습니다.
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn" disabled data-soon title="준비 중입니다">
              임시저장
            </button>
            <button className="btn pri" disabled={!canSave} onClick={() => void save()}>
              <Icon name="save" size={14} /> {saving ? '등록 중…' : '합격생 등록'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ══ 가입 승인 ══ */

/**
 * 승인 대기 목록.
 *
 * ★ **승인과 OT 는 다른 축이다.** 승인은 "로그인을 열어주는 것", OT 는 "대면 안내를
 *   끝냈다고 표시하는 것"이라 승인 직후에도 진행 단계는 `REGISTERED`(OT 전) 그대로다.
 *   한 컬럼으로 합치면 "승인했는데 왜 안 끝났냐"는 질문이 나온다 — 열을 갈라 둔다.
 */
function SignupApproval() {
  const { academyId } = useAcademy()
  const [rows, setRows] = useState<PendingSignup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 처리 중인 행. 멱등이라 두 번 눌려도 안 깨지지만, 눌린 줄 모르고 또 누르는 걸 막는다 */
  const [busyId, setBusyId] = useState<number | null>(null)
  const [done, setDone] = useState<string | null>(null)
  /* 연락처를 기본으로 가린다. 이 응답에는 서버 마스킹 표시가 없어 원문이 그대로 온다 —
     다른 명단 화면과 같은 기본값이어야 여기만 뚫려 있지 않다 */
  const [masked, setMasked] = useState(true)
  /* 방금 승인한 건. 서버 목록에서는 빠지지만 OT 를 눌러야 해서 화면이 들고 있는다
     (머리 주석 ★ 참고). 새로고침하면 없어진다 — 그래서 안내 문구를 함께 둔다 */
  const [approved, setApproved] = useState<PendingSignup[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listPendingSignups({ academyId: academyId ?? undefined }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '승인 대기 목록을 불러오지 못했습니다.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [academyId])

  useEffect(() => {
    void load()
  }, [load])

  async function doApprove(row: PendingSignup) {
    setBusyId(row.enrollmentId)
    setError(null)
    try {
      await approveSignup(row.enrollmentId)
      /* 서버 목록에서 빠지므로 여기서 받아 둔다. 안 그러면 OT 를 누를 자리가 없어진다 */
      setApproved((prev) => (prev.some((a) => a.enrollmentId === row.enrollmentId) ? prev : [...prev, row]))
      setDone(`${row.name} 가입을 승인했습니다. 이제 앱에 로그인할 수 있습니다.`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '승인하지 못했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  async function doOt(row: PendingSignup) {
    setBusyId(row.enrollmentId)
    setError(null)
    try {
      await completeOt(row.enrollmentId)
      setApproved((prev) => prev.filter((a) => a.enrollmentId !== row.enrollmentId))
      setDone(`${row.name} OT 완료로 표시했습니다.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '처리하지 못했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  const columns: Column<PendingSignup>[] = useMemo(
    () => [
      {
        key: 'studentNo',
        header: '학번',
        width: '110px',
        /* 승인 전에는 학번이 없을 수 있다. 서버가 안 주는 게 아니라 아직 안 매겨진 것이라
           Unfilled 가 아니라 '-' 다(CLAUDE.md 4) */
        value: (r) => r.studentNo ?? '-',
      },
      { key: 'name', header: '이름', width: '100px', mask: 'name', value: (r) => r.name },
      { key: 'phone', header: '연락처', width: '130px', mask: 'phone', value: (r) => r.phone ?? '-' },
      {
        key: 'onboardingStatus',
        header: '진행 단계',
        width: '110px',
        align: 'center',
        value: (r) => ONBOARDING_LABEL[r.onboardingStatus] ?? r.onboardingStatus,
        render: (r, shown) => (
          <span className={`mk ${r.onboardingStatus === 'ACTIVE' ? 'verified' : 'supplement'}`}>{shown}</span>
        ),
      },
      {
        key: 'act',
        header: '',
        width: '90px',
        align: 'center',
        value: () => '',
        /* ★ 여기에 OT 버튼을 같이 두지 않는다. 승인 전 OT 는 403 이고, 승인하면 이 행이
             목록에서 빠진다 — 어느 쪽으로도 누를 수 없는 버튼이 된다(머리 주석 ★) */
        render: (r) => (
          <button
            className="btn pri"
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            disabled={busyId !== null}
            onClick={() => void doApprove(r)}
          >
            승인
          </button>
        ),
      },
    ],
    // doApprove 는 매 렌더 새로 만들어지지만 rows 를 닫지 않으므로 busyId 만 보면 된다
    [busyId],
  )

  return (
    <>
      <div className="note-box">
        <div className="ic">
          <Icon name="user-check" size={17} />
        </div>
        <div>
          <div className="tt">앱에서 가입한 학생을 승인합니다</div>
          <div className="tx">
            승인하기 전에는 <b>학생이 앱에 로그인할 수 없습니다.</b> 승인과 OT는 별개라,
            승인해도 대면 안내를 마치기 전까지는 진행 단계가 <b>OT 전</b>으로 남습니다.
          </div>
        </div>
      </div>

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {done && (
        <div className="note-box" style={{ borderColor: 'var(--mint)' }}>
          <div className="ic">
            <Icon name="check" size={17} />
          </div>
          <div style={{ flex: 1 }}>{done}</div>
          <button className="btn" onClick={() => setDone(null)}>
            닫기
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.enrollmentId)}
        masked={masked}
        loading={loading}
        pageSize={12}
        toolbar={<MaskToggle masked={masked} onChange={setMasked} />}
        countLabel={
          <>
            승인 대기 <b>{rows.length}</b>명
          </>
        }
        emptyText="승인을 기다리는 가입 건이 없습니다."
      />

      {/* ── 방금 승인한 건 — OT 를 여기서 처리한다 ── */}
      {approved.length > 0 && (
        <div className="card-sec" style={{ marginTop: 16 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="clipboard-check" size={15} />
              </span>
              OT 대기 <span className="mk supplement">{approved.length}명</span>
            </div>
          </div>
          <div className="card-sec-b">
            {/* 서버가 승인된 건을 안 줘서 화면이 기억하는 목록이다. 그 사실을 숨기면
                "아까 승인한 학생이 왜 없어졌냐"가 된다 — 대신 할 일로 바꿔 적는다 */}
            <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
              <div className="ic">
                <Icon name="triangle-alert" size={17} />
              </div>
              <div>
                <div className="tt">대면 OT를 마쳤으면 지금 눌러 주세요</div>
                <div className="tx">
                  이 목록은 <b>다른 화면으로 옮기면 사라집니다.</b> 나중에 처리하시려면 학생 이름을
                  적어 두세요.
                </div>
              </div>
            </div>
            {approved.map((r) => (
              <div
                key={r.enrollmentId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 2px',
                  borderBottom: '1px solid var(--line-2)',
                }}
              >
                <b style={{ fontSize: 13 }}>{r.name}</b>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.studentNo ?? '-'}</span>
                <button
                  className="btn"
                  style={{ marginLeft: 'auto' }}
                  disabled={busyId !== null}
                  onClick={() => void doOt(r)}
                >
                  OT 완료
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function Content() {
  const [tab, setTab] = useState('enroll')

  return (
    <>
      <Tabs
        items={[
          { key: 'enroll', label: '합격생 등록' },
          { key: 'signup', label: '가입 승인' },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />
      {tab === 'signup' ? <SignupApproval /> : <EnrollForm />}
    </>
  )
}

export const enrollMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled data-soon title="엑셀 일괄 등록은 아직 준비 중입니다">
        <Icon name="upload" size={14} /> 엑셀 일괄 등록
      </button>
    </>
  ),
}
