import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.1-3 신규 접수 등록(합격생 등록) — 신규개발-요구사항검증됨
 * 학번 채번 규칙: year + %04d(nextSeq), 매년 초기화.
 *
 * ★ 유일성은 UNIQUE(academy_id, year, student_no) 다 — **지점 축이 있다**.
 *   같은 해에도 지점이 다르면 같은 학번이 존재하고(2026-0001 이 분당·이매·목동에 각각 있다),
 *   연도가 바뀌면 같은 지점에서도 번호가 재사용된다. 그래서 학번은 PK가 아니다.
 *   학생을 특정할 때는 enrollmentId(등록 건) 또는 studentId(사람)를 쓴다. */

const nextSeq = MOCK_STUDENTS.length + 1
const nextStudentNo = `2026-${String(nextSeq).padStart(4, '0')}`

function Content() {
  return (
    <>
      <div className="note-box">
        <div className="ic">
          <Icon name="graduation-cap" size={17} />
        </div>
        <div>
          <div className="tt">학번 자동 채번 — 저장 시 확정</div>
          <div className="tx">
            학번은 <b>저장할 때 자동으로</b> 매겨집니다. 다음 학번은 <b>{nextStudentNo}</b>입니다.
            번호는 <b>지점별·연도별로 따로</b> 매겨지므로, 다른 지점에 같은 학번이 있을 수 있습니다.
            학생을 특정할 때는 학번만으로 판단하지 마세요.
          </div>
        </div>
      </div>

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
                <input className="inp" placeholder="홍길동" />
                <input className="inp" placeholder="영문명 (선택)" />
              </div>
            </div>
            <div className="frow">
              <label className="req">생년월일</label>
              <div className="two">
                <input className="inp" type="date" />
                <select className="sel">
                  <option>성별 선택</option>
                  <option>남</option>
                  <option>여</option>
                </select>
              </div>
            </div>
            <div className="frow">
              <label className="req">연락처</label>
              <div className="two">
                <input className="inp" placeholder="학생 010-0000-0000" />
                <input className="inp" placeholder="학부모 010-0000-0000" />
              </div>
            </div>
            <div className="frow">
              <label>주소</label>
              <input className="inp" placeholder="도로명 주소" />
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
              <span className="mk verified">학번 {nextStudentNo}</span>
            </div>
          </div>
          <div className="card-sec-b">
            <div className="frow">
              <label className="req">지점</label>
              <div className="two">
                <select className="sel">
                  <option>분당</option>
                  <option>대치</option>
                  <option>평촌</option>
                </select>
                <select className="sel">
                  <option>2026 시즌</option>
                  <option>2025 시즌</option>
                </select>
              </div>
            </div>
            <div className="frow">
              <label className="req">계열 · 구분</label>
              <div className="two">
                <select className="sel">
                  <option>자연</option>
                  <option>인문</option>
                </select>
                <select className="sel">
                  <option>재수</option>
                  <option>삼수</option>
                  <option>N수</option>
                </select>
              </div>
            </div>
            <div className="frow">
              <label>출신학교</label>
              <div className="two">
                <input className="inp" placeholder="태원고" />
                <input className="inp" placeholder="졸업연도" />
              </div>
            </div>
            <div className="frow">
              <label>반 · 담임</label>
              <div className="two">
                <select className="sel">
                  <option>미배정</option>
                  <option>1반</option>
                  <option>2반</option>
                  <option>3반</option>
                  <option>4반</option>
                </select>
                <select className="sel">
                  <option>미지정</option>
                  <option>이장원</option>
                  <option>김유진</option>
                </select>
              </div>
            </div>
            <div className="frow">
              <label>좌석 · 사물함</label>
              <div className="two">
                <input className="inp" placeholder="A-24" />
                <input className="inp" placeholder="L-108" />
              </div>
            </div>
            <div className="frow">
              <label>장학</label>
              <select className="sel">
                <option>해당 없음</option>
                <option>수능100</option>
                <option>평가원50</option>
              </select>
            </div>
            <div className="frow">
              <label className="req">등원일</label>
              <input className="inp" type="date" defaultValue="2026-06-02" />
            </div>
          </div>
        </div>
      </div>

      <div className="card-sec">
        <div className="card-sec-b" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            저장하면 학번 <b style={{ color: 'var(--ink)' }}>{nextStudentNo}</b>가 확정되고, 학생·학부모에게{' '}
            <b style={{ color: 'var(--ink)' }}>앱 초대 알림</b>이 발송됩니다. 회원가입 후{' '}
            <b style={{ color: 'var(--ink)' }}>신상기록부(F-4.11-9) 작성이 필수 단계</b>로 강제되며, 미작성 시 등록
            미완 상태로 남습니다.
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn">임시저장</button>
            <button className="btn pri">
              <Icon name="save" size={14} /> 합격생 등록
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
      <button className="btn">
        <Icon name="upload" size={14} /> 엑셀 일괄 등록
      </button>
    </>
  ),
}
