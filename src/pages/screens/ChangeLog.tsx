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

/* 학원생 관리 > 메모/기타 > 금일 수정 이력 — 클라이언트 메뉴표 기준 추가 화면
 *
 * "오늘 누가 무엇을 바꿨는가"를 되짚는 감사(audit) 화면이다.
 * 원본 화면이 왜 필요한지: 원생 정보·수납·출결은 여러 직원이 동시에 만지므로
 * 값이 틀어졌을 때 되돌릴 근거가 없으면 운영이 막힌다.
 *
 * ⚠ BE 전제 — 이 화면은 별도 테이블이 아니라 공통 변경이력 적재 규약이 있어야 성립한다.
 *   · 모든 도메인 UPDATE/DELETE 시 audit_logs 에 (before, after) JSON 스냅샷 적재
 *   · 적재 위치는 서비스 레이어가 아니라 JPA EntityListener / AOP 로 일괄 처리할 것
 *     (화면마다 수기로 넣으면 반드시 누락된다)
 *   · 조회 기본값 = 오늘. 보존기간은 개인정보 처리방침에 맞춰 확정 필요 */

type Action = 'CREATE' | 'UPDATE' | 'DELETE'

const ACTION_META: Record<Action, { label: string; cls: string; icon: string }> = {
  CREATE: { label: '등록', cls: 'verified', icon: 'plus' },
  UPDATE: { label: '수정', cls: 'supplement', icon: 'pencil' },
  DELETE: { label: '삭제', cls: 'brandnew', icon: 'trash-2' },
}

/** 변경이 발생한 업무 영역 — 화면이 아니라 도메인 기준으로 묶는다 */
const AREAS = ['학원생 정보', '수납', '출결', '반 배정', '상벌점', '급식', '특강'] as const
type Area = (typeof AREAS)[number]

const ACTORS = ['강민서(분당 지점관리자)', '이장원(담임)', '김유진(담임)', '정하람(행정)', '시스템(자동)']

interface LogRow {
  id: string
  at: string
  actor: string
  area: Area
  action: Action
  /** 변경 대상 — 학생이면 이름·학번, 아니면 마스터명 */
  target: string
  targetNo: string
  field: string
  before: string
  after: string
  ip: string
}

const FIELD_SAMPLES: Record<Area, [string, string, string][]> = {
  '학원생 정보': [
    ['연락처', '010-2231-8845', '010-2231-9012'],
    ['출신학교', '분당고', '보평고'],
    ['상태', '재원', '휴원'],
  ],
  수납: [
    ['수납금액', '1,320,000', '1,180,000'],
    ['수납상태', '미납', '완납'],
    ['청구기수', '2기', '3기'],
  ],
  출결: [
    ['출결상태', 'LATE', 'EXCUSED'],
    ['등원시각', '09:24', '08:51'],
    ['하원시각', '22:10', '21:40'],
  ],
  '반 배정': [
    ['고정반', '2반', '3반'],
    ['좌석', 'A-14', 'A-27'],
  ],
  상벌점: [
    ['부여점수', '-2', '-5'],
    ['항목', '지각', '무단결석'],
  ],
  급식: [
    ['신청일수', '18', '16'],
    ['취소사유', '-', '학생 앱 취소(3일 전)'],
  ],
  특강: [
    ['진행상태', '접수', '확정'],
    ['수강료', '340,000', '300,000'],
  ],
}

/** 결정적 생성 — 새로고침해도 같은 목록 */
const ROWS: LogRow[] = Array.from({ length: 63 }, (_, i) => {
  const area = AREAS[i % AREAS.length]
  const samples = FIELD_SAMPLES[area]
  const [field, before, after] = samples[i % samples.length]
  const action: Action = i % 17 === 16 ? 'DELETE' : i % 6 === 5 ? 'CREATE' : 'UPDATE'
  const st = MOCK_STUDENTS[i % MOCK_STUDENTS.length]
  const hour = 8 + Math.floor(i / 5)
  return {
    id: `log-${String(i + 1).padStart(3, '0')}`,
    at: `2026-05-28 ${String(Math.min(hour, 22)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}`,
    actor: ACTORS[i % ACTORS.length],
    area,
    action,
    target: st.name,
    targetNo: st.studentNo,
    field,
    before: action === 'CREATE' ? '-' : before,
    after: action === 'DELETE' ? '(삭제됨)' : after,
    ip: `10.20.${(i % 4) + 1}.${100 + (i % 50)}`,
  }
})

const FIELDS: Field[] = [
  { type: 'dateRange', name: 'date', label: '조회 기간', presets: true, span: 2 },
  { type: 'text', name: 'keyword', label: '대상 · 항목 · 값', placeholder: '예: 이승민 / 연락처', span: 2 },
  {
    type: 'select',
    name: 'actor',
    label: '수정한 사용자',
    options: ACTORS.map((v) => ({ value: v, label: v })),
  },
  {
    type: 'select',
    name: 'area',
    label: '업무 영역',
    options: AREAS.map((v) => ({ value: v, label: v })),
  },
  { type: 'chips', name: 'action', label: '변경 유형', options: ['CREATE', 'UPDATE', 'DELETE'], multiple: true },
]

const COLUMNS: Column<LogRow>[] = [
  { key: 'at', header: '변경 시각', width: '164px', sortable: true, value: (r) => r.at },
  { key: 'actor', header: '수정자', width: '176px', sortable: true, value: (r) => r.actor },
  { key: 'area', header: '업무 영역', width: '100px', align: 'center', sortable: true, value: (r) => r.area },
  {
    key: 'action',
    header: '유형',
    width: '72px',
    align: 'center',
    sortable: true,
    value: (r) => r.action,
    render: (r) => <span className={`mk ${ACTION_META[r.action].cls}`}>{ACTION_META[r.action].label}</span>,
  },
  { key: 'targetNo', header: '대상 학번', width: '100px', value: (r) => r.targetNo },
  { key: 'target', header: '대상', width: '80px', mask: 'name', value: (r) => r.target },
  { key: 'field', header: '변경 항목', width: '96px', value: (r) => r.field },
  {
    key: 'diff',
    header: '변경 전 → 변경 후',
    value: (r) => `${r.before} → ${r.after}`,
    render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
        <span style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>{r.before}</span>
        <Icon name="arrow-right" size={12} />
        <b style={{ color: r.action === 'DELETE' ? 'var(--red)' : 'var(--mint-d)' }}>{r.after}</b>
      </span>
    ),
  },
  {
    key: 'ip',
    header: '접속 IP',
    width: '108px',
    align: 'center',
    value: (r) => r.ip,
    render: (_r, v) => <code style={{ fontSize: 10.5, color: 'var(--muted)' }}>{v}</code>,
  },
]

function matches(r: LogRow, q: SearchValues): boolean {
  const kw = String(q.keyword ?? '').trim()
  if (kw && !`${r.target}${r.targetNo}${r.field}${r.before}${r.after}`.includes(kw)) return false
  if (typeof q.actor === 'string' && q.actor && r.actor !== q.actor) return false
  if (typeof q.area === 'string' && q.area && r.area !== q.area) return false
  if (Array.isArray(q.action) && q.action.length > 0 && !q.action.includes(r.action)) return false
  return true
}

function Content() {
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)

  const rows = useMemo(() => ROWS.filter((r) => matches(r, query)), [query])
  const countAct = (a: Action) => rows.filter((r) => r.action === a).length
  const actorCount = new Set(rows.map((r) => r.actor)).size

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="history" size={13} /> 금일 변경
          </div>
          <div className="v">{rows.length}</div>
          <div className="d">2026-05-28 기준</div>
        </div>
        {(['CREATE', 'UPDATE', 'DELETE'] as Action[]).map((a) => (
          <div className="stat" key={a}>
            <div className="l">
              <Icon name={ACTION_META[a].icon} size={13} /> {ACTION_META[a].label}
            </div>
            <div className="v">{countAct(a)}</div>
            <div className={`d${a === 'DELETE' && countAct(a) > 0 ? ' down' : ''}`}>
              {a === 'DELETE' ? '복구 근거 보존 대상' : ACTION_META[a].label + ' 건수'}
            </div>
          </div>
        ))}
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 수정한 사용자
          </div>
          <div className="v">{actorCount}</div>
          <div className="d">중복 제외</div>
        </div>
      </div>

      <div className="note-box plain">
        <div className="ic">
          <Icon name="shield" size={17} />
        </div>
        <div>
          <div className="tt">모든 화면의 수정이 자동으로 기록됩니다</div>
          <div className="tx">
            학생 정보·출결·수납 등 <b>어느 화면에서 무엇을 고쳤든</b> 변경 전후 값이 함께 남습니다.
            담당자가 따로 기록할 필요는 없습니다. 다만 <b>기록 방식이 확정된 뒤에 열리는 화면</b>이라
            지금은 표시만 준비돼 있습니다.
          </div>
        </div>
      </div>

      <SearchForm
        fields={FIELDS}
        onSearch={setQuery}
        presetKey="change-log"
        headerRight={
          <span className="mk supplement" title="조회 기본값은 오늘입니다">
            <Icon name="clock" size={11} /> 기본 조회 = 금일
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
            금일 수정 이력 <b>{rows.length}</b>건
          </>
        }
        toolbar={
          <>
            <button className="btn">
              <Icon name="refresh-cw" size={14} /> 되돌리기 요청
            </button>
            <MaskToggle masked={masked} onChange={setMasked} />
            <ExcelButton filename="금일_수정이력" columns={COLUMNS} rows={rows} masked={masked} />
          </>
        }
      />
    </>
  )
}

export const changeLogMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-05-28 ▾</button>
      <button className="btn">
        <Icon name="shield-check" size={14} /> 보존정책
      </button>
    </>
  ),
}
