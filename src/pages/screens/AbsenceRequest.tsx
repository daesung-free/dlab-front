import { useMemo, useState } from 'react'
import { DataTable, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'

/* F-4.1-5 사유 신청 관리 — 신규개발-요구사항보완
 * DSA는 관리자가 직접 등록/수정하는 단일 구조였다.
 * 앱 실시간 제출 → approver_type(PARENT/TEACHER/AUTO) 라우팅이 신규.
 * ⚠ Phase 3 승인 라우팅 관리(F-4.11-5)와 데이터모델을 공유하므로
 *   approval_items / approval_requests 스키마를 여기서 미리 반영한다. */

type ApproverType = 'PARENT' | 'TEACHER' | 'AUTO'
type ReqStatus = '대기' | '승인' | '반려'
type ReqType = '결석' | '지각' | '조퇴' | '외출'

const APPROVER_META: Record<ApproverType, { label: string; cls: string; icon: string }> = {
  PARENT: { label: '학부모 승인', cls: 'supplement', icon: 'users' },
  TEACHER: { label: '담임 승인', cls: 'verified', icon: 'user-check' },
  AUTO: { label: '자동 승인', cls: 'brandnew', icon: 'zap' },
}

interface AbsenceRow {
  id: string
  submittedAt: string
  studentNo: string
  name: string
  classNo: string
  type: ReqType
  period: string
  reason: string
  approverType: ApproverType
  assignee: string
  status: ReqStatus
  /** 벌점이 이미 확정된 건 — I-10 기준 미확정 */
  penaltyFixed?: boolean
  /** 학부모 미응답 경과시간(분) — 에스컬레이션 후보 */
  waitingMin?: number
}

const TYPES: { type: ReqType; approver: ApproverType }[] = [
  { type: '결석', approver: 'PARENT' },
  { type: '지각', approver: 'TEACHER' },
  { type: '조퇴', approver: 'PARENT' },
  { type: '외출', approver: 'TEACHER' },
]

const REASONS = ['병원 진료', '가족 행사', '몸살 기운', '대중교통 지연', '치과 정기검진', '집안 사정']

const ROWS: AbsenceRow[] = MOCK_STUDENTS.slice(0, 26).map((s, i) => {
  const def = TYPES[i % TYPES.length]
  const status: ReqStatus = i % 5 === 4 ? '반려' : i % 3 === 0 ? '대기' : '승인'
  const waiting = status === '대기' && def.approver === 'PARENT' ? 40 + ((i * 23) % 200) : undefined
  return {
    id: `ar-${i + 1}`,
    submittedAt: `2026-05-${String(20 + (i % 8)).padStart(2, '0')} ${String(7 + (i % 12)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
    studentNo: s.studentNo,
    name: s.name,
    classNo: s.classNo,
    type: def.type,
    period: def.type === '외출' ? '13:00 ~ 15:00' : def.type === '조퇴' ? '16:30 이후' : '종일',
    reason: REASONS[i % REASONS.length],
    approverType: def.approver,
    assignee: def.approver === 'PARENT' ? '학부모' : s.teacher,
    status,
    penaltyFixed: status === '대기' && i % 7 === 3,
    waitingMin: waiting,
  }
})

const COLUMNS: Column<AbsenceRow>[] = [
  { key: 'submittedAt', header: '신청일시', width: '140px', sortable: true, value: (r) => r.submittedAt },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  {
    key: 'type',
    header: '유형',
    width: '68px',
    align: 'center',
    value: (r) => r.type,
    render: (r) => <span className="mk supplement">{r.type}</span>,
  },
  { key: 'period', header: '기간', width: '110px', value: (r) => r.period },
  { key: 'reason', header: '사유', value: (r) => r.reason },
  {
    key: 'approverType',
    header: '승인 주체',
    width: '116px',
    align: 'center',
    sortable: true,
    value: (r) => r.approverType,
    render: (r) => (
      <span className={`mk ${APPROVER_META[r.approverType].cls}`} title={`approver_type: ${r.approverType}`}>
        {APPROVER_META[r.approverType].label}
      </span>
    ),
  },
  {
    key: 'status',
    header: '상태',
    width: '150px',
    align: 'center',
    value: (r) => r.status,
    render: (r) => {
      if (r.status !== '대기') {
        return (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: r.status === '승인' ? 'var(--green)' : 'var(--red)' }}>
            {r.status}
          </span>
        )
      }
      return (
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }}>
            승인
          </button>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5, color: 'var(--red)' }}>
            반려
          </button>
        </div>
      )
    },
  },
]

function Content() {
  const [tab, setTab] = useState<ReqStatus>('대기')
  const rows = useMemo(() => ROWS.filter((r) => r.status === tab), [tab])

  const waiting = ROWS.filter((r) => r.status === '대기')
  const escalation = waiting.filter((r) => (r.waitingMin ?? 0) > 120)
  const penaltyConflict = waiting.filter((r) => r.penaltyFixed)

  return (
    <>
      <div className="note-box">
        <div className="ic">
          <Icon name="route" size={17} />
        </div>
        <div>
          <div className="tt">승인 라우팅 — 이 화면이 Phase 3 승인 관리(F-4.11-5)의 선행 구현입니다</div>
          <div className="tx">
            학생이 앱에서 제출한 사유가 <code>approval_items.approver_type</code>에 따라 <b>학부모 / 담임 / 자동</b>으로
            자동 라우팅됩니다. 두 화면이 <b>approval_items · approval_requests 스키마를 공유</b>하므로, 여기서 임시
            모델로 만들었다가 Phase 3에서 다시 설계하는 이중작업이 없도록 처음부터 같은 구조로 갑니다.
          </div>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="clock" size={13} /> 승인 대기
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {waiting.length}
          </div>
          <div className="d">실시간 수신</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 학부모 대기
          </div>
          <div className="v">{waiting.filter((r) => r.approverType === 'PARENT').length}</div>
          <div className="d">PARENT</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-check" size={13} /> 담임 대기
          </div>
          <div className="v">{waiting.filter((r) => r.approverType === 'TEACHER').length}</div>
          <div className="d">TEACHER</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="arrow-right" size={13} /> 에스컬레이션 후보
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {escalation.length}
          </div>
          <div className="d warn">응답시간 미확정</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 벌점 확정 충돌
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {penaltyConflict.length}
          </div>
          <div className="d warn">기준 미확정</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: '대기', label: '승인 대기', count: ROWS.filter((r) => r.status === '대기').length },
            { key: '승인', label: '승인 완료', count: ROWS.filter((r) => r.status === '승인').length },
            { key: '반려', label: '반려', count: ROWS.filter((r) => r.status === '반려').length },
          ]}
          active={tab}
          onChange={(k) => setTab(k as ReqStatus)}
        />
        <div style={{ padding: 14 }}>
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.id}
            pageSize={12}
            countLabel={
              <>
                {tab} <b>{rows.length}</b>건
              </>
            }
          />
        </div>
      </div>

      <div className="blocked-note">
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <div>
          <div className="tt">이 화면을 막고 있는 미확정 3건</div>
          <div className="tx">
            <b>#32 / I-12 (높음)</b> — 신청 항목별 승인 주체(학부모·선생님·자동) 매트릭스 확정. 방화벽 해제 승인
            주체는 특히 미결.
            <br />
            <b>#30 / I-10 (중)</b> — <b>'벌점 확정 후 사유 승인 불가'</b>의 확정 기준. 위 목록의 '벌점 확정 충돌'
            {penaltyConflict.length}건이 여기 해당하며, 기준이 없으면 승인 버튼의 동작을 정의할 수 없습니다.
            <br />
            <b>#40 / I-20 (중)</b> — 학부모 미응답 시 담임으로 넘기는 <b>에스컬레이션 응답시간</b>, 입학 시 승인자
            사전지정 가능 여부. 클라이언트 미확약 상태라 <b>스키마에 필드만 미리 확보</b>해 둡니다(Phase 0).
          </div>
        </div>
      </div>
    </>
  )
}

export const absenceMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="settings" size={14} /> 승인 항목 설정
      </button>
      <button className="btn pri">
        <Icon name="plus" size={14} /> 관리자 직접 등록
      </button>
    </>
  ),
}
