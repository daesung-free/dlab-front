import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { DataTable, MaskToggle, Modal, Unfilled, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { ApiError } from '../../api/client'
import { clearDraft, loadDraft, saveDraft } from '../../lib/draft'
import { formatPhone } from '../../lib/mask'
import { useAcademy } from '../../auth/AcademyContext'
import {
  GRADE_LABEL,
  TRACK_LABEL,
  admitStudent,
  applyStudentImport,
  getNextStudentNo,
  previewStudentImport,
  type GradeType,
  type Student,
  type StudentImportResult,
  type TrackType,
} from '../../api/students'
import {
  ONBOARDING_LABEL,
  approveSignup,
  completeOt,
  listPendingSignups,
  type PendingSignup,
} from '../../api/studentSignups'
import { studentNoText } from '../../lib/studentNo'
import { listClasses, assignStudentToClass, type ClassGroup } from '../../api/classes'
import { getStudent } from '../../api/students'
import { listSeatAreas, getSeatLayout, assignSeat, type SeatArea, type SeatCell } from '../../api/facility'
import { listSelectableScholarships, grantScholarship, type ScholarshipMaster } from '../../api/masters'
import type { Mockup } from './types'
import { importFieldLabel } from '../../lib/importFields'
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
 * ★ **승인과 OT 는 다른 축이다.** 승인은 로그인을 열어주는 것(`accountStatus`),
 *   OT 는 대면 안내를 마쳤다는 표시(`onboardingStatus`)다. 승인 직후에도 온보딩은
 *   `REGISTERED`(OT 전)라 한 칸에 합치면 "승인했는데 왜 안 끝났냐"가 된다.
 *
 * ★ 목록을 **두 덩이로 나눠 그린다** — `accountStatus` 가 `PENDING` 이면 승인 대기,
 *   `ACTIVE` 면 OT 대기다. 그래서 `includeApproved` 를 켜고 한 번만 부른다.
 *   안 켜면 승인된 건이 안 와서 **OT 를 누를 자리가 없어진다**(승인하는 순간 빠진다).
 *   온보딩이 끝난 학생은 켜도 안 오므로 목록이 무한정 늘지 않는다.
 *
 *   한동안은 승인한 건을 화면이 기억해 뒀다가 보여줬다. 서버가 안 줘서 그랬던 것이고,
 *   화면을 벗어나면 사라지는 목록이었다(2026-09-16 해소).
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
 *   학부모 연락처 · 졸업연도 · 장학 · 좌석 · 사물함. (영문명은 2026-10-13 디랩 요청으로 뺐다)
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
  graduationYear: string
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
  graduationYear: '',
  admissionDate: '',
  year: String(new Date().getFullYear()),
  grade: 'N_SU',
  track: 'SCIENCE',
}

type Result = { kind: 'admitted'; student: Student } | { kind: 'failed'; message: string }

/** 합격생 등록 폼 — 원래 이 화면 전체였다. 탭이 생기면서 이름만 갈랐고 내용은 그대로다 */
function EnrollForm() {
  const { academyId, academies } = useAcademy()
  /* 임시저장한 게 있으면 그걸로 시작한다 — 이 브라우저에만 남는다(lib/draft) */
  const [form, setForm] = useState<FormState>(() => {
    const d = loadDraft<FormState>('enroll')
    if (!d) return EMPTY
    const { savedAt: _at, ...rest } = d
    return { ...EMPTY, ...rest }
  })
  const [tempMsg, setTempMsg] = useState<string | null>(() => {
    const d = loadDraft<FormState>('enroll')
    return d ? `${d.savedAt}에 임시저장한 내용을 불러왔습니다.` : null
  })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [nextNo, setNextNo] = useState<string | null>(null)


  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const academyName = academies.find((a) => a.id === academyId)?.acadNm ?? null
  const canSave = academyId !== null && form.name.trim().length > 0 && !saving

  /* ── 등록 다음 단계 (피드백 1-2) ──
   *
   * > 「입학확정(등록) → 반 배정 시 번호 자동배정 → 좌석 선택(배정) → 장학여부 체크 위
   *    프로세스가 **한 화면에서 한번에** 이뤄질 수 있도록」(4쪽)
   *
   * ★ **등록과 한 번에 보내지 않는다.** 반·좌석·장학은 **각각 다른 서버 호출**이고, 묶어서
   *   보낼 경로가 없다. 그래서 등록을 먼저 끝내고 **이어서 하도록** 둔다 — 한 번에 되는 척하면
   *   중간에 실패했을 때 **무엇이 됐는지 모른 채** 담당자가 다시 등록해 중복이 생긴다.
   *
   * ★ **단계마다 성공·실패를 따로 적는다.** 「저장 실패」로 뭉뚱그리면 안 된다.
   *
   * ★ **학번은 반 배정 때 매겨진다**(2026-10-13 채번 변경). 그래서 반 배정이 단순한
   *   분류가 아니라 **학번을 받는 단계**다 — 화면도 그렇게 말한다.
   */
  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [areas, setAreas] = useState<SeatArea[]>([])
  const [scholarMasters, setScholarMasters] = useState<ScholarshipMaster[]>([])
  const [seats, setSeats] = useState<SeatCell[]>([])
  const [next, setNext] = useState<{
    classId: string
    areaId: string
    seatId: string
    scholarship: string
    busy: null | 'class' | 'seat' | 'scholar'
    done: string[]
    err: string | null
  }>({ classId: '', areaId: '', seatId: '', scholarship: '', busy: null, done: [], err: null })

  /* ★ **반을 골라야 다음 학번을 알 수 있다**(2026-10-13 채번 변경 — 반별 4자리).
     「지점·연도의 다음 번호」라는 것이 없어졌다 */
  const refreshNextNo = useCallback(async () => {
    if (academyId === null || next.classId === '') {
      setNextNo(null)
      return
    }
    try {
      setNextNo(await getNextStudentNo(academyId, Number(form.year), Number(next.classId)))
    } catch {
      setNextNo(null)
    }
  }, [academyId, form.year, next.classId])

  useEffect(() => {
    void refreshNextNo()
  }, [refreshNextNo])

  useEffect(() => {
    if (academyId === null) return
    let alive = true
    void Promise.all([
      listClasses(new Date().getFullYear(), academyId).catch(() => [] as ClassGroup[]),
      listSeatAreas(academyId).catch(() => [] as SeatArea[]),
      listSelectableScholarships(new Date().getFullYear(), academyId).catch(() => [] as ScholarshipMaster[]),
    ]).then(([cs, as_, sc]) => {
      if (!alive) return
      setClasses(cs.filter((c) => c.academyId === academyId))
      setAreas(as_)
      setScholarMasters(sc)
    })
    return () => {
      alive = false
    }
  }, [academyId])

  /* 좌석은 구역을 골라야 보인다 — 한 지점에 수백 칸이라 전부 띄우면 고를 수가 없다 */
  useEffect(() => {
    if (next.areaId === '') {
      setSeats([])
      return
    }
    let alive = true
    getSeatLayout(Number(next.areaId), true)
      .then((v) => alive && setSeats(v))
      .catch(() => alive && setSeats([]))
    return () => {
      alive = false
    }
  }, [next.areaId])

  /** 등록된 학생을 다시 읽어 **반 배정으로 받은 학번**을 화면에 올린다 */
  const reloadStudent = useCallback(async (enrollmentId: number): Promise<Student | null> => {
    try {
      const fresh = await getStudent(enrollmentId)
      setResult((r) => (r?.kind === 'admitted' ? { kind: 'admitted', student: fresh } : r))
      return fresh
    } catch {
      /* 다시 읽기에 실패해도 배정 자체는 됐다 — 조용히 넘긴다 */
      return null
    }
  }, [])

  async function runAssignClass(student: Student) {
    if (next.classId === '') return
    setNext((n) => ({ ...n, busy: 'class', err: null }))
    try {
      await assignStudentToClass(Number(next.classId), student.enrollmentId)
      const fresh = await reloadStudent(student.enrollmentId)
      const name = classes.find((c) => String(c.id) === next.classId)?.name ?? '반'
      /* ★ **된 일만 적는다.** 「학번이 매겨졌습니다」로 단정하면, 서버가 아직 안 매기는
         동안 화면이 **없는 번호를 있다고 말하는** 셈이다 — 담당자는 학번이 생긴 줄 알고
         넘어가고, 나중에 빈 칸을 보고 「등록이 잘못됐나」로 되돌아온다 */
      setNext((n) => ({
        ...n,
        busy: null,
        done: [
          ...n.done,
          fresh?.studentNo
            ? `${name} 배정 — 학번 ${fresh.studentNo}`
            : `${name} 배정 — 학번은 아직 매겨지지 않았습니다`,
        ],
      }))
    } catch (e) {
      setNext((n) => ({ ...n, busy: null, err: e instanceof ApiError ? e.message : '반 배정에 실패했습니다.' }))
    }
  }

  async function runAssignSeat(student: Student) {
    if (next.seatId === '') return
    setNext((n) => ({ ...n, busy: 'seat', err: null }))
    try {
      await assignSeat(Number(next.seatId), student.enrollmentId)
      const cd = seats.find((x) => String(x.seatId) === next.seatId)?.seatCd ?? '좌석'
      setNext((n) => ({ ...n, busy: null, done: [...n.done, `좌석 ${cd} 배정`] }))
    } catch (e) {
      setNext((n) => ({ ...n, busy: null, err: e instanceof ApiError ? e.message : '좌석 배정에 실패했습니다.' }))
    }
  }

  async function runGrant(student: Student) {
    if (next.scholarship === '') return
    setNext((n) => ({ ...n, busy: 'scholar', err: null }))
    try {
      await grantScholarship(student.enrollmentId, next.scholarship)
      const nm = scholarMasters.find((m) => m.code === next.scholarship)?.name ?? '장학'
      setNext((n) => ({ ...n, busy: null, done: [...n.done, `${nm} 부여`] }))
    } catch (e) {
      setNext((n) => ({ ...n, busy: null, err: e instanceof ApiError ? e.message : '장학을 주지 못했습니다.' }))
    }
  }

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
        graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
        admissionDate: form.admissionDate || undefined,
      })
      setResult({ kind: 'admitted', student })
      /* 다음 학생을 등록하기 전까지 이어서 할 일을 연다 */
      setNext({ classId: '', areaId: '', seatId: '', scholarship: '', busy: null, done: [], err: null })
      setForm(EMPTY)
      clearDraft('enroll')
      setTempMsg(null)
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
          {/* ★ 2026-10-13 채번이 바뀌었다 — **접수만으로는 학번이 안 나온다.** 전 문구는
                 「저장할 때 확정」이라고 적고 있어, 그대로 두면 등록 직후 「학번이 왜 없냐」가 된다 */}
          <div className="tt">학번은 반을 배정할 때 매겨집니다</div>
          <div className="tx">
            접수만으로는 학번이 나오지 않습니다. 아래에서 등록을 끝낸 뒤 <b>반을 배정하면</b> 그때
            번호를 받습니다 — <b>반이 바뀌면 학번도 바뀝니다.</b>
            번호는 <b>지점 안에서만 유일</b>하므로 다른 지점에 같은 학번이 있을 수 있습니다 —
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

      {/* ★ 등록 다음 단계 — 반 배정 · 좌석 · 장학을 **여기서 이어서** 한다(피드백 1-2).
             각각 다른 서버 호출이라 한 번에 보낼 수 없다. 그래서 **단계마다 결과를 따로** 적는다 —
             「저장 실패」로 뭉뚱그리면 담당자가 다시 등록해 중복 데이터가 생긴다 */}
      {result?.kind === 'admitted' && (
        <div className="card-sec" style={{ marginBottom: 14 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="list-checks" size={15} />
              </span>
              이어서 할 일 — {result.student.name}
            </div>
            <div className="r">
              <button className="btn" onClick={() => setResult(null)}>
                다음 학생 등록
              </button>
            </div>
          </div>
          <div className="card-sec-b">
            {next.done.length > 0 && (
              <div className="note-box" role="status">
                <div>
                  {next.done.map((d, i) => (
                    <div key={i}>✓ {d}</div>
                  ))}
                </div>
              </div>
            )}
            {next.err && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {next.err}
              </div>
            )}

            {/* ★ 반 배정이 **학번을 받는 단계**다 — 단순한 분류가 아니라고 화면이 말해야 한다 */}
            <div className="frow">
              <label>반 배정</label>
              <div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    className="sel"
                    style={{ flex: 1 }}
                    value={next.classId}
                    onChange={(e) => setNext((n) => ({ ...n, classId: e.target.value }))}
                  >
                    <option value="">반을 고르세요</option>
                    {classes.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.capacity != null ? ` (${c.memberCount ?? 0}/${c.capacity})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn pri"
                    disabled={next.busy !== null || next.classId === ''}
                    onClick={() => void runAssignClass(result.student)}
                  >
                    {next.busy === 'class' ? '배정 중…' : '배정'}
                  </button>
                </div>
                <div className="hint">
                  <b>학번은 반을 배정할 때 매겨집니다.</b> 지금 학번:{' '}
                  <b>{studentNoText(result.student.studentNo)}</b>
                  {/* ★ 반을 골라야 번호를 알 수 있다. **미리 잡아두는 번호가 아니라서** 다른
                         사람이 먼저 배정하면 밀린다 */}
                  {nextNo && next.classId !== '' && (
                    <>
                      {' '}
                      · 이 반에서 받을 번호: <b>{nextNo}</b>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="frow">
              <label>좌석 배정</label>
              <div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    className="sel"
                    style={{ width: 150 }}
                    value={next.areaId}
                    onChange={(e) => setNext((n) => ({ ...n, areaId: e.target.value, seatId: '' }))}
                  >
                    <option value="">구역</option>
                    {areas.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.buildingName} {a.areaNm}
                      </option>
                    ))}
                  </select>
                  <select
                    className="sel"
                    style={{ flex: 1 }}
                    value={next.seatId}
                    onChange={(e) => setNext((n) => ({ ...n, seatId: e.target.value }))}
                  >
                    <option value="">{next.areaId === '' ? '구역을 먼저 고르세요' : '빈 좌석을 고르세요'}</option>
                    {/* ★ **빈 좌석만** 낸다 — 찬 자리를 고르면 서버가 거절한다 */}
                    {seats
                      .filter((x) => x.enrollmentId === null)
                      .map((x) => (
                        <option key={x.seatId} value={String(x.seatId)}>
                          {x.seatCd}
                        </option>
                      ))}
                  </select>
                  <button
                    className="btn"
                    disabled={next.busy !== null || next.seatId === ''}
                    onClick={() => void runAssignSeat(result.student)}
                  >
                    {next.busy === 'seat' ? '배정 중…' : '배정'}
                  </button>
                </div>
                <div className="hint">나중에 독서실 좌석배치표에서도 바꿀 수 있습니다.</div>
              </div>
            </div>

            <div className="frow">
              <label>장학</label>
              <div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    className="sel"
                    style={{ flex: 1 }}
                    value={next.scholarship}
                    onChange={(e) => setNext((n) => ({ ...n, scholarship: e.target.value }))}
                  >
                    <option value="">해당 없음</option>
                    {scholarMasters.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    disabled={next.busy !== null || next.scholarship === ''}
                    onClick={() => void runGrant(result.student)}
                  >
                    {next.busy === 'scholar' ? '부여 중…' : '부여'}
                  </button>
                </div>
                {scholarMasters.length === 0 && (
                  <div className="hint">등록된 장학 종류가 없습니다. 기초 관리 → 장학 종류에서 먼저 만드세요.</div>
                )}
              </div>
            </div>
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
                  onChange={(e) => set('phone', formatPhone(e.target.value))}
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
              {/* ★ 등록 시점에는 반을 모르니 **번호를 말하지 않는다.** 전에는 「다음 학번 2026-0015」를
                     띄웠는데, 이제 그 번호가 나오지 않아 **틀린 약속**이 된다 */}
              <span className="mk supplement">학번은 반 배정 때</span>
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
                <input
                  className="inp"
                  type="number"
                  placeholder="졸업(예정) 연도 (예: 2026)"
                  min={1990}
                  max={2100}
                  value={form.graduationYear}
                  onChange={(e) => set('graduationYear', e.target.value)}
                />
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
            {tempMsg && <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>{tempMsg}</span>}
            <button
              className="btn"
              disabled={saving}
              title="이 컴퓨터에 잠시 저장합니다. 학번은 매겨지지 않습니다"
              onClick={() => {
                const at = saveDraft('enroll', form)
                setTempMsg(at ? `${at} 임시저장했습니다 (이 컴퓨터에서만 불러옵니다).` : '임시저장하지 못했습니다.')
              }}
            >
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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      /* 승인분까지 받아 한 번에 그린다 — 안 켜면 OT 대기자가 통째로 빠진다 */
      setRows(await listPendingSignups({ academyId: academyId ?? undefined, includeApproved: true }))
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
      setDone(`${row.name} OT 완료로 표시했습니다.`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '처리하지 못했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  /* 승인 여부로 가른다. 한 표에 섞으면 무엇을 눌러야 하는지가 안 보인다 */
  const waitingApproval = useMemo(() => rows.filter((r) => r.accountStatus === 'PENDING'), [rows])
  const waitingOt = useMemo(() => rows.filter((r) => r.accountStatus !== 'PENDING'), [rows])

  const columns: Column<PendingSignup>[] = useMemo(
    () => [
      {
        key: 'studentNo',
        header: '학번',
        width: '110px',
        /* 승인 전에는 학번이 없을 수 있다. 서버가 안 주는 게 아니라 아직 안 매겨진 것이라
           Unfilled 가 아니라 '-' 다(CLAUDE.md 4) */
        value: (r) => studentNoText(r.studentNo),
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
        rows={waitingApproval}
        rowKey={(r) => String(r.enrollmentId)}
        masked={masked}
        loading={loading}
        pageSize={12}
        toolbar={<MaskToggle masked={masked} onChange={setMasked} />}
        countLabel={
          <>
            승인 대기 <b>{waitingApproval.length}</b>명
          </>
        }
        emptyText="승인을 기다리는 가입 건이 없습니다."
      />

      {/* ── 방금 승인한 건 — OT 를 여기서 처리한다 ── */}
      {/* ── OT 대기 ── */}
      {/* 승인은 끝났고 대면 OT 만 남은 사람들. 서버가 승인분을 함께 주므로
          화면을 벗어나도 남는다 — 예전에는 화면 기억이라 사라졌다 */}
      {waitingOt.length > 0 && (
        <div className="card-sec" style={{ marginTop: 16 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="clipboard-check" size={15} />
              </span>
              OT 대기 <span className="mk supplement">{waitingOt.length}명</span>
            </div>
          </div>
          <div className="card-sec-b">
            <div className="hint" style={{ marginBottom: 10 }}>
              가입 승인은 끝났습니다. 대면 OT를 마쳤으면 눌러 주세요.
            </div>
            {waitingOt.map((r) => (
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
                <b style={{ fontSize: 13 }}>{masked ? `${r.name[0]}*${r.name.slice(2)}` : r.name}</b>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{studentNoText(r.studentNo)}</span>
                <span className="mk supplement" style={{ marginLeft: 4 }}>
                  {ONBOARDING_LABEL[r.onboardingStatus] ?? r.onboardingStatus}
                </span>
                <button
                  className="btn"
                  style={{ marginLeft: 'auto' }}
                  disabled={busyId !== null || r.onboardingStatus !== 'REGISTERED'}
                  title={r.onboardingStatus !== 'REGISTERED' ? '이미 OT를 마친 학생입니다' : undefined}
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

/**
 * 엑셀 일괄 등록 — 미리보기로 몇 명이 들어가고 어느 행이 틀렸는지 먼저 보고 반영한다.
 * ★ 반영 때 같은 파일을 다시 보낸다(서버가 미리보기 결과를 들고 있지 않다). 그래서 파일을 바꾸면
 *   미리보기를 지운다 — 남기면 다른 파일의 결과를 보고 반영하게 된다.
 * ★ 이미 있는 학생(고유ID·이름 일치)은 새로 만들지 않고 갱신된다 — 미리보기에 '기존' 으로 보인다.
 */
function ImportButton() {
  const { academyId } = useAcademy()
  const thisYear = new Date().getFullYear()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(thisYear)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<StudentImportResult | null>(null)
  const [applied, setApplied] = useState<StudentImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function reset() {
    setPreview(null)
    setApplied(null)
    setErr(null)
  }

  async function run(apply: boolean) {
    if (!file || academyId === null) return
    setBusy(true)
    setErr(null)
    try {
      const r = apply ? await applyStudentImport(academyId, year, file) : await previewStudentImport(academyId, year, file)
      if (apply) setApplied(r)
      setPreview(r)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : apply ? '반영하지 못했습니다.' : '파일을 읽지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const r = applied ?? preview
  const newCount = r ? r.rows.filter((x) => !x.existing).length : 0

  return (
    <>
      <button
        className="btn"
        disabled={academyId === null}
        title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
        onClick={() => {
          setOpen(true)
          setFile(null)
          reset()
        }}
      >
        <Icon name="upload" size={14} /> 엑셀 일괄 등록
      </button>
      {open && (
        <Modal
          wide
          title="엑셀 일괄 등록"
          sub="미리보기로 확인한 뒤 반영합니다. 틀린 행은 빼고 나머지만 등록됩니다."
          confirmLabel={applied ? '닫기' : '반영'}
          busy={busy}
          error={err}
          confirmDisabled={!applied && (!preview || preview.validRows === 0)}
          onConfirm={() => (applied ? setOpen(false) : void run(true))}
          onClose={() => setOpen(false)}
        >
          <div className="frow">
            <label className="req">학년도</label>
            <select
              className="sel"
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value))
                reset()
              }}
            >
              {[thisYear, thisYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="frow">
            <label className="req">파일</label>
            <div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  reset()
                }}
              />
              <div className="hint">
                첫 줄에 칸 이름을 적습니다. <b>이름 · 학년</b>은 꼭 있어야 하고, 연락처 · 계열 · 생년월일 · 성별 ·
                출신학교는 있으면 함께 들어갑니다. 칸 순서는 상관없습니다.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" className="btn" disabled={!file || busy || applied !== null} onClick={() => void run(false)}>
              <Icon name="eye" size={14} /> {busy && !preview ? '읽는 중…' : '미리보기'}
            </button>
          </div>
          {r && (
            <>
              <div className="note-box" role="status" style={applied ? { borderColor: 'var(--green)' } : undefined}>
                <div>
                  {applied ? <b>반영했습니다. </b> : <b>미리보기 — 아직 등록하지 않았습니다. </b>}
                  전체 {r.totalRows}행 · 정상 <b>{r.validRows}</b>행(새 학생 {newCount} · 기존 학생 갱신{' '}
                  {r.validRows - newCount}) · 오류{' '}
                  <b style={{ color: r.errorRows ? 'var(--red)' : undefined }}>{r.errorRows}</b>행
                  {applied && r.errorRows > 0 && ' — 오류 행은 등록하지 않았습니다. 고쳐서 그 행만 다시 올리세요.'}
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
              {r.rows.length > 0 && (
                <div style={{ maxHeight: 220, overflow: 'auto' }}>
                  <table className="dt" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>행</th>
                        <th>이름</th>
                        <th style={{ width: 70 }}>학년</th>
                        <th style={{ width: 70 }}>계열</th>
                        <th style={{ width: 80 }}>구분</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.rows.map((x) => (
                        <tr key={x.rowNumber}>
                          <td>{x.rowNumber}</td>
                          <td>{x.name}</td>
                          <td>{GRADE_LABEL[x.grade as GradeType] ?? x.grade}</td>
                          <td>{x.track ? (TRACK_LABEL[x.track as TrackType] ?? x.track) : '-'}</td>
                          <td>{x.existing ? '기존 갱신' : '새 학생'}</td>
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

export const enrollMockup: Mockup = {
  Content,
  actions: (
    <>
      <ImportButton />
    </>
  ),
}
