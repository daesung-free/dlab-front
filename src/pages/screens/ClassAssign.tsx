import { useMemo, useState } from 'react'
import { DataTable, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS, type MockStudent } from './mockStudents'
import type { Mockup } from './types'

/* F-4.1-4 반 배정(고정반 관리) — 신규개발-요구사항검증됨
 * 전년도 복사는 단순 INSERT SELECT가 금지된다. 의존 순서를 지켜 순회해야 한다:
 *   department → course_type → class_group → curriculum → penalty_item → tuition */

const COPY_ORDER = ['department', 'course_type', 'class_group', 'curriculum', 'penalty_item', 'tuition']

interface ClassGroup {
  id: string
  name: string
  track: '자연' | '인문'
  teacher: string
  capacity: number
  room: string
}

const CLASSES: ClassGroup[] = [
  { id: 'c1', name: '1반', track: '인문', teacher: '최지원', capacity: 14, room: '201호' },
  { id: 'c2', name: '2반', track: '자연', teacher: '김유진', capacity: 14, room: '202호' },
  { id: 'c3', name: '3반', track: '자연', teacher: '이장원', capacity: 14, room: '301호' },
  { id: 'c4', name: '4반', track: '자연', teacher: '박서영', capacity: 14, room: '302호' },
]

const UNASSIGNED: MockStudent[] = MOCK_STUDENTS.filter((s) => s.status === '재원').slice(0, 9)

const COLUMNS: Column<MockStudent>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'track', header: '계열', width: '64px', align: 'center', value: (r) => r.track },
  { key: 'repeat', header: '재수', width: '64px', align: 'center', value: (r) => r.repeat },
  { key: 'school', header: '출신학교', width: '92px', value: (r) => r.school },
  { key: 'seat', header: '좌석', width: '68px', align: 'center', value: (r) => r.seat },
]

function Content() {
  const [selected, setSelected] = useState<string[]>([])
  const [target, setTarget] = useState('c3')

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of CLASSES) {
      map.set(c.name, MOCK_STUDENTS.filter((s) => s.status === '재원' && s.classNo === c.name).length)
    }
    return map
  }, [])

  return (
    <>
      <div className="note-box plain">
        <div className="ic">
          <Icon name="history" size={17} />
        </div>
        <div>
          <div className="tt">전년도 복사 — 단순 INSERT SELECT 금지</div>
          <div className="tx">
            <b>YearlySnapshotService</b>가 의존 순서를 지켜 순회합니다:{' '}
            {COPY_ORDER.map((k, i) => (
              <span key={k}>
                <code>{k}</code>
                {i < COPY_ORDER.length - 1 && ' → '}
              </span>
            ))}
            . 앞 단계가 만든 새 연도 ID를 뒤 단계가 참조하므로 순서를 건너뛰면 참조가 깨집니다.
          </div>
        </div>
      </div>

      <div className="stat-strip">
        {CLASSES.map((c) => {
          const cur = counts.get(c.name) ?? 0
          const full = cur >= c.capacity
          return (
            <div className="stat" key={c.id}>
              <div className="l">
                <Icon name="layout-grid" size={13} /> {c.name} · {c.track}
              </div>
              <div className="v" style={{ color: full ? 'var(--red)' : undefined }}>
                {cur}
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}> / {c.capacity}</span>
              </div>
              <div className={`d${full ? ' down' : ''}`}>
                담임 {c.teacher} · {c.room}
              </div>
            </div>
          )
        })}
        <div className="stat">
          <div className="l">
            <Icon name="user-plus" size={13} /> 미배정
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {UNASSIGNED.length}
          </div>
          <div className="d warn">배정 필요</div>
        </div>
      </div>

      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="arrow-right" size={15} />
            </span>
            일괄 배정
          </div>
          <div className="r">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>선택 {selected.length}명 →</span>
            <select className="sel" style={{ width: 200 }} value={target} onChange={(e) => setTarget(e.target.value)}>
              {CLASSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.track} · {counts.get(c.name)}/{c.capacity})
                </option>
              ))}
            </select>
            <button className="btn pri" disabled={selected.length === 0}>
              <Icon name="check" size={14} /> 배정
            </button>
            <button className="btn" disabled={selected.length === 0}>
              배정 해제
            </button>
          </div>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={UNASSIGNED}
        rowKey={(r) => r.id}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        pageSize={12}
        countLabel={
          <>
            미배정 학생 <b>{UNASSIGNED.length}</b>명
          </>
        }
        emptyText="미배정 학생이 없습니다."
      />

    </>
  )
}

export const classAssignMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="history" size={14} /> 전년도 반 구성 복사
      </button>
      <button className="btn pri">
        <Icon name="plus" size={14} /> 반 등록
      </button>
    </>
  ),
}
