import { useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  SearchForm,
  type Column,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'

/* F-4.3 출결 관리 — 신규개발-요구사항보완
 * 키오스크를 대성전산 API 경유 없이 직접 Webhook 수신하는 구조로 바뀐다.
 * D-2(키오스크 스펙)가 최우선 미해결이라 목업 payload 기준으로 만든다. */

/** 기술문서 8.3 상태값 5종 */
type AttStatus = 'ON_TIME' | 'LATE' | 'ABSENT' | 'OUT' | 'EXCUSED'

const STATUS_META: Record<AttStatus, { label: string; cls: string; icon: string }> = {
  ON_TIME: { label: '정상 등원', cls: 'verified', icon: 'log-in' },
  LATE: { label: '지각', cls: 'brandnew', icon: 'clock' },
  ABSENT: { label: '결석', cls: 'brandnew', icon: 'x' },
  OUT: { label: '외출', cls: 'supplement', icon: 'door-open' },
  EXCUSED: { label: '사유 승인', cls: 'supplement', icon: 'check-check' },
}

interface AttRow {
  id: string
  studentNo: string
  name: string
  classNo: string
  seat: string
  phone: string
  inAt: string
  outAt: string
  status: AttStatus
  /** 순공시간(분) — 산출 정의는 I-6 미확정 */
  studyMin: number
  notified: boolean
  /** 사유 없이 미등원 → 무단지각 자동 감지 (0723) */
  unexcusedLate?: boolean
}

const ROWS: AttRow[] = MOCK_STUDENTS.filter((s) => s.status === '재원').map((s, i) => {
  const status: AttStatus =
    i % 13 === 12 ? 'ABSENT' : i % 9 === 8 ? 'EXCUSED' : i % 7 === 6 ? 'OUT' : i % 5 === 4 ? 'LATE' : 'ON_TIME'
  const late = status === 'LATE'
  return {
    id: s.id,
    studentNo: s.studentNo,
    name: s.name,
    classNo: s.classNo,
    seat: s.seat,
    phone: s.phone,
    inAt: status === 'ABSENT' ? '-' : late ? `09:${String(12 + (i % 40)).padStart(2, '0')}` : `07:${String(40 + (i % 19)).padStart(2, '0')}`,
    outAt: status === 'ABSENT' ? '-' : `22:${String(10 + (i % 45)).padStart(2, '0')}`,
    status,
    studyMin: status === 'ABSENT' ? 0 : 480 + ((i * 37) % 240),
    notified: status !== 'ON_TIME',
    unexcusedLate: late && i % 2 === 0,
  }
})

const FIELDS: Field[] = [
  { type: 'dateRange', name: 'date', label: '조회 기간', presets: true, span: 2 },
  { type: 'text', name: 'keyword', label: '이름 · 학번 · 좌석', placeholder: '예: 이승민 / A-24', span: 2 },
  { type: 'select', name: 'classNo', label: '담당 반', options: ['1반', '2반', '3반', '4반'].map((v) => ({ value: v, label: v })) },
  {
    type: 'chips',
    name: 'status',
    label: '출결 상태',
    options: ['ON_TIME', 'LATE', 'ABSENT', 'OUT', 'EXCUSED'],
    multiple: true,
  },
]

function hhmm(min: number): string {
  return `${Math.floor(min / 60)}시간 ${String(min % 60).padStart(2, '0')}분`
}

const COLUMNS: Column<AttRow>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  { key: 'seat', header: '좌석', width: '68px', align: 'center', value: (r) => r.seat },
  { key: 'inAt', header: '등원', width: '76px', align: 'center', sortable: true, value: (r) => r.inAt },
  { key: 'outAt', header: '하원', width: '76px', align: 'center', value: (r) => r.outAt },
  {
    key: 'status',
    header: '상태',
    width: '112px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => (
      <span className={`mk ${STATUS_META[r.status].cls}`} title={r.status}>
        {STATUS_META[r.status].label}
      </span>
    ),
  },
  {
    key: 'studyMin',
    header: '순공시간',
    width: '104px',
    align: 'right',
    sortable: true,
    value: (r) => r.studyMin,
    render: (r) => (r.studyMin ? hhmm(r.studyMin) : <span style={{ color: 'var(--muted)' }}>-</span>),
  },
  { key: 'phone', header: '학부모 연락처', width: '128px', mask: 'phone', value: (r) => r.phone },
  {
    key: 'notified',
    header: '알림',
    width: '96px',
    align: 'center',
    value: (r) => (r.notified ? '발송' : '-'),
    render: (r) =>
      r.unexcusedLate ? (
        <span className="mk brandnew" title="사유 없이 미등원 → 지각알림 + 사유 회신 요청 자동 발송">
          무단지각
        </span>
      ) : r.notified ? (
        <span style={{ color: 'var(--mint-d)', fontSize: 11.5, fontWeight: 700 }}>발송됨</span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
]

function matches(r: AttRow, q: SearchValues): boolean {
  const kw = String(q.keyword ?? '').trim()
  if (kw && !`${r.name}${r.studentNo}${r.seat}`.includes(kw)) return false
  if (typeof q.classNo === 'string' && q.classNo && r.classNo !== q.classNo) return false
  if (Array.isArray(q.status) && q.status.length > 0 && !q.status.includes(r.status)) return false
  return true
}

function Content() {
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)

  const rows = useMemo(() => ROWS.filter((r) => matches(r, query)), [query])
  const count = (s: AttStatus) => rows.filter((r) => r.status === s).length

  return (
    <>
      <div className="blocked-note">
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <div>
          <div className="tt">키오스크 직접 연동 — 스펙 미확정 (오픈이슈 #2 / D-2, 최우선)</div>
          <div className="tx">
            키오스크 소유·펌웨어 제어 주체, <code>Webhook</code> 엔드포인트 변경 가능 여부, payload 포맷,
            NFC/RFID 카드-학번 매핑이 모두 대성전산 협의 대기입니다. <b>이 화면은 목업 payload 기준</b>이며, 실제
            스펙 수령 시 수신부만 교체되도록 인터페이스를 분리해 구현합니다.
          </div>
        </div>
      </div>

      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 조회 대상
          </div>
          <div className="v">{rows.length}</div>
          <div className="d">재원생 기준</div>
        </div>
        {(['ON_TIME', 'LATE', 'ABSENT', 'OUT', 'EXCUSED'] as AttStatus[]).map((s) => (
          <div className="stat" key={s}>
            <div className="l">
              <Icon name={STATUS_META[s].icon} size={13} /> {STATUS_META[s].label}
            </div>
            <div className="v">{count(s)}</div>
            <div className="d" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
              {s}
            </div>
          </div>
        ))}
      </div>

      <SearchForm
        fields={FIELDS}
        onSearch={setQuery}
        presetKey="attendance"
        headerRight={
          <span className="mk verified" title="키오스크 Webhook 직접 수신 (HMAC 서명검증)">
            <Icon name="zap" size={11} /> 실시간 수신 중
          </span>
        }
      />

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        masked={masked}
        pageSize={15}
        countLabel={
          <>
            2026-05-28 출결 <b>{rows.length}</b>건
          </>
        }
        toolbar={
          <>
            <button className="btn">
              <Icon name="refresh-cw" size={14} /> 학습시간 일괄계산
            </button>
            <MaskToggle masked={masked} onChange={setMasked} />
            <ExcelButton filename="출결_현황" columns={COLUMNS} rows={rows} masked={masked} />
          </>
        }
      />

      <div className="note-box plain" style={{ marginTop: 14 }}>
        <div className="ic">
          <Icon name="info" size={17} />
        </div>
        <div>
          <div className="tt">순공시간 산출 정의 미확정 (오픈이슈 #26 / I-6, 중)</div>
          <div className="tx">
            입퇴실·좌석없음을 순공시간에 어떻게 반영할지 운영팀 확정이 필요합니다. 지금 표의 순공시간은
            <b> 단순 재실시간</b>이며, Daily Report 집계(F-4.11-6) 설계 전까지 확정되어야 합니다. 결석은 배치
            스케줄러가 최종 확정하고, 상태 전이 후 알림톡 + 상벌점이 자동 트리거됩니다.
          </div>
        </div>
      </div>
    </>
  )
}

export const attendanceMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-05-28 ▾</button>
      <button className="btn">
        <Icon name="bell" size={14} /> 출결 알림 템플릿
      </button>
    </>
  ),
}
