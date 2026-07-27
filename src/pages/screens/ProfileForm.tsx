import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'

/* F-4.11-9 신상기록부 — 신규개발-요구사항신규
 *
 * ⚠ 양식 자체가 미확정이다(#37 / I-17, 최우선).
 *   "신상기록부 4종 양식·항목·학년별 폼 분기·PDF 양식 확정" 이 끝나야 폼을 확정할 수 있고,
 *   실행가이드 4시트도 "양식 확정 전 폼 확정 불가 — 회원가입 온보딩 착수 전 필수"로 못박았다.
 *
 *   그래서 이 화면은 폼을 임의로 지어내지 않는다. 양식과 무관하게 지금 확정 가능한
 *   '작성 현황 관리' 부분만 만들고, 폼 영역은 확정 대기 상태로 둔다. */

interface FormKind {
  key: string
  label: string
  grades: string
  forms: string[]
}

const FORM_KINDS: FormKind[] = [
  {
    key: 'simple',
    label: '고2 · 고3',
    grades: '재학생',
    forms: ['신상기록부 (단순형)'],
  },
  {
    key: 'full',
    label: '재수 · N수',
    grades: 'N수생',
    forms: ['신상기록부', '전년도 학습방법', '개별 학습방법', '1학기 학습계획표'],
  },
]

interface ProfileRow {
  id: string
  studentNo: string
  name: string
  classNo: string
  enrolledAt: string
  kind: string
  done: number
  total: number
  /** 초도상담 완료 여부 — 미완료 시 상담 화면에서 빨간 경고 */
  firstConsult: boolean
}

const ROWS: ProfileRow[] = MOCK_STUDENTS.filter((s) => s.status === '재원').map((s, i) => {
  const kind = i % 4 === 3 ? FORM_KINDS[0] : FORM_KINDS[1]
  const total = kind.forms.length
  const done = i % 6 === 5 ? 0 : i % 5 === 4 ? Math.max(1, total - 2) : total
  return {
    id: s.id,
    studentNo: s.studentNo,
    name: s.name,
    classNo: s.classNo,
    enrolledAt: s.enrolledAt,
    kind: kind.label,
    done,
    total,
    firstConsult: done === total && i % 7 !== 2,
  }
})

const COLUMNS: Column<ProfileRow>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  { key: 'kind', header: '폼 유형', width: '96px', align: 'center', sortable: true, value: (r) => r.kind },
  { key: 'enrolledAt', header: '입학일', width: '100px', sortable: true, value: (r) => r.enrolledAt },
  {
    key: 'done',
    header: '작성 현황',
    width: '150px',
    sortable: true,
    value: (r) => r.done / r.total,
    render: (r) => {
      const pct = Math.round((r.done / r.total) * 100)
      const tone = pct === 100 ? 'var(--green)' : pct === 0 ? 'var(--red)' : 'var(--amber)'
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 7, background: 'var(--line-2)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 5 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: tone, minWidth: 34, textAlign: 'right' }}>
            {r.done}/{r.total}
          </span>
        </div>
      )
    },
  },
  {
    key: 'status',
    header: '등록 상태',
    width: '96px',
    align: 'center',
    value: (r) => (r.done === r.total ? '완료' : '미완'),
    render: (r) =>
      r.done === r.total ? (
        <span className="mk verified">등록 완료</span>
      ) : (
        <span className="mk brandnew" title="신상기록부 미작성 — 등록 미완 상태">
          등록 미완
        </span>
      ),
  },
  {
    key: 'firstConsult',
    header: '초도상담',
    width: '90px',
    align: 'center',
    value: (r) => (r.firstConsult ? '완료' : '미상담'),
    render: (r) =>
      r.firstConsult ? (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>완료</span>
      ) : (
        <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--red)' }}>미상담</span>
      ),
  },
  {
    key: 'act',
    header: '',
    width: '104px',
    align: 'center',
    value: () => '',
    render: (r) => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled={r.done === 0}>
          열람
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled={r.done !== r.total}>
          PDF
        </button>
      </div>
    ),
  },
]

function Content() {
  const [masked, setMasked] = useState(true)
  const [filter, setFilter] = useState<'all' | 'incomplete'>('all')

  const rows = useMemo(() => (filter === 'all' ? ROWS : ROWS.filter((r) => r.done !== r.total)), [filter])

  const incomplete = ROWS.filter((r) => r.done !== r.total).length
  const notStarted = ROWS.filter((r) => r.done === 0).length
  const noConsult = ROWS.filter((r) => !r.firstConsult).length

  return (
    <>
      <div className="blocked-note">
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <div>
          <div className="tt">양식 미확정 — 입력 폼은 만들 수 없습니다 (오픈이슈 #37 / I-17, 최우선)</div>
          <div className="tx">
            <b>신상기록부 4종 양식·항목·학년별 폼 분기·PDF 양식</b>이 운영팀 확정 대기입니다. 실행가이드도
            <b> "양식 확정 전 폼 확정 불가 — 회원가입 온보딩 착수 전 필수"</b>로 못박고 있어, 항목을 임의로 지어내면
            재작업이 확정적입니다.
            <br />
            그래서 <b>입력 폼은 비워 두고</b>, 양식과 무관하게 지금 확정 가능한 <b>작성 현황 관리</b>만 먼저
            만들었습니다. 양식이 오면 폼 컴포넌트만 끼워 넣으면 됩니다.
            <br />
            <span style={{ color: 'var(--muted)' }}>
              ※ 원본은 구글시트로 운영 중인 초도상담 자료입니다 — 구조 실사·이관 계획은 #35 / I-15 (Phase 0)
            </span>
          </div>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 대상 학생
          </div>
          <div className="v">{ROWS.length}</div>
          <div className="d">재원생 전체</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="check-check" size={13} /> 작성 완료
          </div>
          <div className="v" style={{ color: 'var(--green)' }}>
            {ROWS.length - incomplete}
          </div>
          <div className="d up">등록 완료</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="clock" size={13} /> 작성 중
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {incomplete - notStarted}
          </div>
          <div className="d warn">일부 미작성</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="x" size={13} /> 미착수
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {notStarted}
          </div>
          <div className="d down">등록 미완</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="message-square" size={13} /> 초도상담 미실시
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {noConsult}
          </div>
          <div className="d down">상담 화면 경고</div>
        </div>
      </div>

      <div className="split">
        {FORM_KINDS.map((k) => (
          <div className="card-sec" key={k.key}>
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="file-text" size={15} />
                </span>
                {k.label} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {k.grades}</span>
              </div>
              <div className="r">
                <span className="mk supplement">{k.forms.length}종</span>
              </div>
            </div>
            <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {k.forms.map((f) => (
                <div
                  key={f}
                  style={{
                    border: '1.5px dashed #cdd4de',
                    borderRadius: 11,
                    padding: '13px 15px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    background: '#fafbfc',
                  }}
                >
                  <Icon name="lock" size={14} />
                  <b style={{ fontSize: 12.5 }}>{f}</b>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>양식 확정 대기</span>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6, marginTop: 2 }}>
                회원가입 후 앱에서 <b>학생 본인이 설문형으로 입력</b>하며 강제 진행됩니다. 가입 기본정보는 자동
                표시되어 설문 입력 대상에서 제외됩니다.
              </div>
            </div>
          </div>
        ))}
      </div>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        masked={masked}
        pageSize={12}
        countLabel={
          <>
            작성 현황 <b>{rows.length}</b>명
          </>
        }
        toolbar={
          <>
            <button
              className={`chip${filter === 'incomplete' ? ' on' : ''}`}
              onClick={() => setFilter(filter === 'incomplete' ? 'all' : 'incomplete')}
            >
              미완료만 보기
            </button>
            <button className="btn">
              <Icon name="bell" size={14} /> 미작성자 작성 독려 발송
            </button>
            <MaskToggle masked={masked} onChange={setMasked} />
            <ExcelButton filename="신상기록부_작성현황" columns={COLUMNS} rows={rows} masked={masked} />
          </>
        }
      />

      <div className="note-box" style={{ marginTop: 14 }}>
        <div className="ic">
          <Icon name="link" size={17} />
        </div>
        <div>
          <div className="tt">상담 화면 연계 (F-4.11-4)</div>
          <div className="tx">
            [0723] 담임별·반별 상담현황 조회에 <b>신상기록부 작성여부</b>와 <b>초도상담현황(미상담 시 빨간 경고)</b>이
            함께 노출됩니다. 선생님은 상담 탭에서 이 기록부를 <b>열람하고 PDF로 출력</b>합니다 — 그래서 PDF 양식도
            I-17 확정 범위에 포함됩니다.
          </div>
        </div>
      </div>
    </>
  )
}

export const profileFormMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="filter" size={14} /> 담임별 보기
      </button>
    </>
  ),
}
