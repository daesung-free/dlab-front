import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, PrintButton, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import './timetable.css'

/* 학원생 관리 > 교무업무 > 시간표 · 이동수업 — 클라이언트 메뉴표 기준 추가 화면
 *
 * 고정반 관리(F-4.1-4)가 "학생이 어느 반 소속인가"를 정한다면,
 * 이 화면은 "그 반이 언제 어디서 무슨 수업을 하는가"와
 * "수준별 과목에서 누가 어느 반으로 이동하는가"를 정한다.
 *
 * ⚠ 이동수업이 이 화면의 본질이다.
 *   학생은 고정반에 소속되지만 수학·탐구는 수준별로 다른 반에 가서 듣는다.
 *   따라서 출결·좌석·급식 인원이 교시별로 달라지므로,
 *   class_assignments(고정) 와 별개로 이동수업 배정 테이블이 필요하다.
 *
 * ⚠ BE 전제 — 강의실 중복 배정은 서버에서 막아야 한다.
 *   (교시, 요일, 강의실) UNIQUE 제약이 없으면 편성 화면에서 아무리 막아도 뚫린다. */

const DAYS = ['월', '화', '수', '목', '금', '토'] as const
type Day = (typeof DAYS)[number]

interface Period {
  no: number
  label: string
  time: string
}

const PERIODS: Period[] = [
  { no: 1, label: '1교시', time: '08:00-09:20' },
  { no: 2, label: '2교시', time: '09:30-10:50' },
  { no: 3, label: '3교시', time: '11:00-12:20' },
  { no: 0, label: '점심', time: '12:20-13:20' },
  { no: 4, label: '4교시', time: '13:20-14:40' },
  { no: 5, label: '5교시', time: '14:50-16:10' },
  { no: 6, label: '6교시', time: '16:20-17:40' },
  { no: 7, label: '저녁', time: '17:40-18:40' },
  { no: 8, label: '7교시', time: '18:40-20:00' },
  { no: 9, label: '8교시', time: '20:10-22:00' },
]

type CellKind = 'fix' | 'move' | 'self' | 'none'

interface Cell {
  kind: CellKind
  subject: string
  room: string
  teacher: string
  /** 이동수업일 때 학생이 실제로 가는 수준별 반 */
  moveTo?: string
}

/** 반 기본 정보 — 기초관리(F-4.10-1) class_groups 마스터에서 내려온다 */
interface ClassInfo {
  no: string
  /** 담임 — 반의 책임자. 상담·학습계획 승인·학부모 소통의 1차 창구 */
  homeroom: string
  track: string
  capacity: number
  enrolled: number
  room: string
}

const CLASS_INFO: ClassInfo[] = [
  { no: '1반', homeroom: '최지원', track: '인문', capacity: 14, enrolled: 13, room: '201호' },
  { no: '2반', homeroom: '김유진', track: '자연', capacity: 14, enrolled: 14, room: '202호' },
  { no: '3반', homeroom: '이장원', track: '자연', capacity: 14, enrolled: 12, room: '301호' },
  { no: '4반', homeroom: '박서영', track: '자연', capacity: 14, enrolled: 14, room: '302호' },
]

const CLASSES = CLASS_INFO.map((c) => c.no)

/** 수준별로 쪼개지는 과목 — 이동수업 대상 */
const MOVE_SUBJECTS = ['수학', '탐구1', '탐구2']

const SUBJECTS = ['국어', '수학', '영어', '탐구1', '탐구2']
const ROOMS = ['201호', '202호', '301호', '302호', '401호']
const TEACHERS = ['이장원', '김유진', '최지원', '박서영', '정하람']

/** 결정적 편성 — 반·요일·교시 조합에서 항상 같은 결과가 나온다 */
function buildCell(classNo: string, day: Day, p: Period): Cell {
  if (p.no === 0) return { kind: 'none', subject: '점심', room: '식당', teacher: '' }
  if (p.no === 7) return { kind: 'none', subject: '저녁', room: '식당', teacher: '' }

  const ci = CLASSES.indexOf(classNo)
  const di = DAYS.indexOf(day)
  const seed = ci * 31 + di * 7 + p.no

  // 저녁 교시(7·8교시)와 토요일 오후는 자습
  if (p.no >= 8 || (day === '토' && p.no >= 5)) {
    return { kind: 'self', subject: '자습', room: `${classNo} 교실`, teacher: '감독 순환' }
  }

  const subject = SUBJECTS[seed % SUBJECTS.length]
  const isMove = MOVE_SUBJECTS.includes(subject)
  const level = ['상', '중', '하'][seed % 3]

  return {
    kind: isMove ? 'move' : 'fix',
    subject,
    room: isMove ? ROOMS[(seed + 2) % ROOMS.length] : `${classNo} 교실`,
    teacher: TEACHERS[seed % TEACHERS.length],
    moveTo: isMove ? `${subject} ${level}반` : undefined,
  }
}

/* ── 이동수업 배정 명단 ── */

interface MoveRow {
  id: string
  studentNo: string
  name: string
  fixedClass: string
  /** 고정반 담임 — 이동수업 중 사고·결석 시 1차 연락 대상 */
  homeroom: string
  subject: string
  level: string
  moveClass: string
  room: string
  slot: string
  teacher: string
}

const MOVE_ROWS: MoveRow[] = MOCK_STUDENTS.filter((s) => s.status === '재원').flatMap((s, i) =>
  MOVE_SUBJECTS.map((subject, j) => {
    const seed = i * 5 + j * 3
    const level = ['상', '중', '하'][seed % 3]
    return {
      id: `${s.id}-${subject}`,
      studentNo: s.studentNo,
      name: s.name,
      fixedClass: s.classNo,
      homeroom: CLASS_INFO.find((c) => c.no === s.classNo)?.homeroom ?? '-',
      subject,
      level,
      moveClass: `${subject} ${level}반`,
      room: ROOMS[seed % ROOMS.length],
      slot: `${DAYS[seed % 5]} ${(seed % 6) + 1}교시`,
      teacher: TEACHERS[seed % TEACHERS.length],
    }
  }),
)

const MOVE_COLUMNS: Column<MoveRow>[] = [
  { key: 'studentNo', header: '학번', width: '104px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '82px', mask: 'name', value: (r) => r.name },
  { key: 'fixedClass', header: '고정반', width: '76px', align: 'center', sortable: true, value: (r) => r.fixedClass },
  { key: 'homeroom', header: '담임', width: '76px', align: 'center', sortable: true, value: (r) => r.homeroom },
  { key: 'subject', header: '과목', width: '80px', align: 'center', sortable: true, value: (r) => r.subject },
  {
    key: 'level',
    header: '수준',
    width: '64px',
    align: 'center',
    sortable: true,
    value: (r) => r.level,
    render: (r) => (
      <span className={`mk ${r.level === '상' ? 'verified' : r.level === '중' ? 'supplement' : 'brandnew'}`}>
        {r.level}
      </span>
    ),
  },
  {
    key: 'moveClass',
    header: '이동반',
    width: '112px',
    sortable: true,
    value: (r) => r.moveClass,
    render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--violet)', fontWeight: 700 }}>
        <Icon name="arrow-right" size={12} />
        {r.moveClass}
      </span>
    ),
  },
  { key: 'room', header: '강의실', width: '86px', align: 'center', value: (r) => r.room },
  { key: 'slot', header: '시간', width: '104px', align: 'center', sortable: true, value: (r) => r.slot },
  { key: 'teacher', header: '담당', width: '82px', value: (r) => r.teacher },
]

/* ── 강의실 사용 현황 ── */

interface RoomRow {
  room: string
  used: number
  capacity: number
  conflict: number
}

function Content() {
  const [tab, setTab] = useState('grid')
  const [classNo, setClassNo] = useState('1반')
  const [subject, setSubject] = useState('전체')

  const grid = useMemo(
    () => PERIODS.map((p) => ({ period: p, cells: DAYS.map((d) => buildCell(classNo, d, p)) })),
    [classNo],
  )

  const info = CLASS_INFO.find((c) => c.no === classNo)!

  const moveRows = useMemo(
    () => (subject === '전체' ? MOVE_ROWS : MOVE_ROWS.filter((r) => r.subject === subject)),
    [subject],
  )

  const roomRows: RoomRow[] = useMemo(() => {
    const totalSlots = DAYS.length * PERIODS.filter((p) => p.no > 0 && p.no !== 7).length
    return ROOMS.map((room, i) => {
      const used = grid.flatMap((r) => r.cells).filter((c) => c.room === room).length + 12 + i * 3
      return { room, used: Math.min(used, totalSlots), capacity: totalSlots, conflict: i === 2 ? 1 : 0 }
    })
  }, [grid])

  const moveCount = grid.flatMap((r) => r.cells).filter((c) => c.kind === 'move').length

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="user-check" size={13} /> {classNo} 담임
          </div>
          <div className="v" style={{ fontSize: 18, paddingTop: 3 }}>
            {info.homeroom}
          </div>
          <div className="d">
            {info.track} · 재원 {info.enrolled}/{info.capacity}
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="clock" size={13} /> 주당 교시
          </div>
          <div className="v">{DAYS.length * PERIODS.filter((p) => p.no > 0 && p.no !== 7).length}</div>
          <div className="d">월~토 · 식사시간 제외</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="route" size={13} /> 이동수업
          </div>
          <div className="v">{moveCount}</div>
          <div className="d">{classNo} 주간 이동 교시</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="building-2" size={13} /> 강의실
          </div>
          <div className="v">{ROOMS.length}</div>
          <div className="d">배정 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 중복 배정
          </div>
          <div className="v">{roomRows.reduce((n, r) => n + r.conflict, 0)}</div>
          <div className="d down">서버 UNIQUE 제약 필요</div>
        </div>
      </div>

      <div className="note-box plain">
        <div className="ic">
          <Icon name="git-compare" size={17} />
        </div>
        <div>
          <div className="tt">반 시간표와 이동수업은 이 화면에서만 편성합니다 — 학습계획과 연동하지 않습니다</div>
          <div className="tx">
            <b>반 시간표(여기)</b>는 교무팀이 반 단위로 짜는 <b>고정 편성</b>이고, <b>주·일 학습계획(F-4.11-2)</b>은
            학생이 본인 시간을 순번으로 채우는 <b>개인 계획</b>입니다. 주체도 단위도 다릅니다.
            <br />
            <b>두 화면을 데이터로 잇지 않는 것이 확정 사항</b>입니다. 8/3 회신서가 &ldquo;정해준 시간 틀에 학습계획을
            짜맞추는 것은 활용성이 떨어진다&rdquo;고 명시했기 때문에, 시간표를 학습계획에 자동 반영하지 않습니다.
          </div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'grid', label: '반 시간표' },
          { key: 'move', label: '이동수업 편성', count: moveRows.length },
          { key: 'room', label: '강의실 사용 현황' },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {tab === 'grid' && (
        <div className="card-sec p-tt">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="table-2" size={15} />
              </span>
              {classNo} 주간 시간표
              <span className="mk verified" style={{ marginLeft: 4 }}>
                담임 {info.homeroom}
              </span>
            </div>
            <div className="r">
              {CLASS_INFO.map((c) => (
                <button
                  key={c.no}
                  type="button"
                  className={`chip${classNo === c.no ? ' on' : ''}`}
                  onClick={() => setClassNo(c.no)}
                  title={`담임 ${c.homeroom} · ${c.track} · ${c.room}`}
                >
                  {c.no}
                  <span style={{ opacity: 0.7, marginLeft: 5, fontSize: 10.5 }}>{c.homeroom}</span>
                </button>
              ))}
              <PrintButton />
            </div>
          </div>
          <div className="card-sec-b">
            <div
              className="kv"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 0,
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '4px 14px',
                marginBottom: 14,
              }}
            >
              <div className="row" style={{ borderBottom: 'none' }}>
                <span className="k" style={{ width: 46 }}>
                  담임
                </span>
                <span className="v">
                  <b>{info.homeroom}</b>
                </span>
              </div>
              <div className="row" style={{ borderBottom: 'none' }}>
                <span className="k" style={{ width: 46 }}>
                  계열
                </span>
                <span className="v">{info.track}</span>
              </div>
              <div className="row" style={{ borderBottom: 'none' }}>
                <span className="k" style={{ width: 46 }}>
                  재원
                </span>
                <span className="v">
                  {info.enrolled} / {info.capacity}명
                </span>
              </div>
              <div className="row" style={{ borderBottom: 'none' }}>
                <span className="k" style={{ width: 46 }}>
                  교실
                </span>
                <span className="v">{info.room}</span>
              </div>
            </div>

            <div className="tt-scroll">
              <table className="tt">
                <thead>
                  <tr>
                    <th className="pr">교시</th>
                    {DAYS.map((d) => (
                      <th key={d} className={d === '토' ? 'sat' : undefined}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map(({ period, cells }) => (
                    <tr key={period.label}>
                      <th className="pr">
                        {period.label}
                        <span className="tm">{period.time}</span>
                      </th>
                      {cells.map((c, i) => (
                        <td key={DAYS[i]}>
                          <div className={`cell ${c.kind}`} title={`${c.subject} · ${c.room}${c.teacher ? ` · ${c.teacher}` : ''}`}>
                            <span className="sj">{c.subject}</span>
                            <span className="mt">
                              {c.room}
                              {c.teacher && ` · ${c.teacher}`}
                            </span>
                            {c.moveTo && (
                              <span className="mv">
                                <Icon name="arrow-right" size={9} /> {c.moveTo}
                              </span>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tt-legend">
              <span>
                <span className="sw" style={{ background: 'var(--mint-wash)' }} /> 고정반 수업
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--violet-wash)' }} /> 이동수업 — 수준별 반으로 이동
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--bg)' }} /> 자습
              </span>
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                이동수업 교시에는 고정반 출결·좌석 인원이 달라집니다
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'move' && (
        <>
          <div className="filter-row" style={{ background: '#fff', borderRadius: 12, marginBottom: 14, border: 'none' }}>
            {['전체', ...MOVE_SUBJECTS].map((s) => (
              <button key={s} type="button" className={`chip${subject === s ? ' on' : ''}`} onClick={() => setSubject(s)}>
                {s}
              </button>
            ))}
          </div>
          <DataTable
            columns={MOVE_COLUMNS}
            rows={moveRows}
            rowKey={(r) => r.id}
            selectable
            pageSize={15}
            countLabel={
              <>
                이동수업 배정 <b>{moveRows.length}</b>건
              </>
            }
            toolbar={
              <>
                <button className="btn">
                  <Icon name="upload" size={14} /> 엑셀 일괄 배정
                </button>
                <ExcelButton filename={`이동수업_${subject}`} columns={MOVE_COLUMNS} rows={moveRows} />
                <button className="btn pri">
                  <Icon name="route" size={14} /> 선택 이동반 변경
                </button>
              </>
            }
          />
        </>
      )}

      {tab === 'room' && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="building-2" size={15} />
              </span>
              강의실 주간 사용률
            </div>
            <div className="r">
              <span className="mk brandnew">중복 배정은 서버에서 차단</span>
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {roomRows.map((r) => {
              const pct = Math.round((r.used / r.capacity) * 100)
              return (
                <div key={r.room} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 70, fontSize: 12.5, fontWeight: 700 }}>{r.room}</span>
                  <span style={{ flex: 1, height: 20, borderRadius: 7, background: 'var(--line-2)', overflow: 'hidden' }}>
                    <span
                      style={{
                        display: 'block',
                        width: `${pct}%`,
                        height: '100%',
                        background: pct >= 90 ? 'var(--amber)' : 'var(--mint)',
                      }}
                    />
                  </span>
                  <span style={{ width: 96, fontSize: 12, textAlign: 'right', color: 'var(--ink-2)' }}>
                    {r.used} / {r.capacity}교시
                  </span>
                  <span style={{ width: 92, textAlign: 'right' }}>
                    {r.conflict > 0 ? (
                      <span className="mk brandnew" title="같은 교시에 두 반이 배정됨">
                        중복 {r.conflict}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>정상</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

export const timetableMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 · 2학기 ▾</button>
      <button className="btn">
        <Icon name="history" size={14} /> 전 학기 복사
      </button>
      <button className="btn pri">
        <Icon name="save" size={14} /> 편성 저장
      </button>
    </>
  ),
}
