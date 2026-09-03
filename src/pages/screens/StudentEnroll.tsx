import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Unfilled } from '../../components/common'
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

function Content() {
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
                  전화·주소·생년월일은 <b>BRANCH_ADMIN 이상만 조회</b> 가능한 민감 필드입니다. 목록·엑셀에서는 기본
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
                  배정하세요 — 각각 전용 API가 있습니다.
                </div>
              </div>
            </div>
            <div className="frow">
              <label>장학 · 등원일</label>
              <div className="two">
                <div className="link-box" style={{ alignItems: 'center' }}>
                  <div>
                    장학 <Unfilled reason="등록 요청에 없다 (장학은 별도 API)" />
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
            <b style={{ color: 'var(--ink)' }}>신상기록부(F-4.11-9) 작성이 필수 단계</b>로 강제되며, 미작성 시 등록
            미완 상태로 남습니다.
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn" disabled title="임시저장 API가 없습니다">
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

export const enrollMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled title="일괄 등록은 /students/import 연동 후 활성화합니다">
        <Icon name="upload" size={14} /> 엑셀 일괄 등록
      </button>
    </>
  ),
}
