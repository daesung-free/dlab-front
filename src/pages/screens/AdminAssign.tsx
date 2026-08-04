import { useMemo, useState } from 'react'
import { DataTable, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS, type MockStudent } from './mockStudents'
import type { Mockup } from './types'
import './assign.css'

/* F-4.10-3 배정 관리(사물함·독서실) — 신규개발-요구사항검증됨
 *
 * ⚠ 기숙사는 범위에서 제외(클라이언트 요청). 배정 대상은 사물함·독서실 2종이다.
 *   DSA '관리자>배정관리'에서 확인한 학생목록·일괄배정/해제 구조는 그대로 유지한다.
 *
 * ⚠ 독서실은 이 화면과 좌석배치표(F-C-4)가 같은 좌석 마스터를 공유한다.
 *   · 여기(배정 관리)  = 명단 → 좌석. "누구에게 어느 자리를 줄 것인가"
 *   · 좌석배치표      = 도면 → 사람. "지금 이 실이 어떤 상태인가"
 *   배정 결과가 곧 좌석배치표의 배정 축이므로, 좌석 마스터를 두 벌 만들면 안 된다. */

type Kind = 'locker' | 'reading'

interface KindDef {
  key: Kind
  label: string
  icon: string
  unit: string
  /** 배치도 블록 정의 */
  blocks: { name: string; cols: number; rows: number; prefix: string }[]
}

const KINDS: KindDef[] = [
  {
    key: 'locker',
    label: '사물함',
    icon: 'lock',
    unit: '칸',
    blocks: [
      { name: 'A블록', cols: 12, rows: 3, prefix: 'A' },
      { name: 'B블록', cols: 12, rows: 3, prefix: 'B' },
    ],
  },
  {
    key: 'reading',
    label: '독서실',
    icon: 'armchair',
    unit: '좌석',
    blocks: [
      { name: 'A실 (자연)', cols: 10, rows: 3, prefix: 'A' },
      { name: 'B실 (인문)', cols: 10, rows: 3, prefix: 'B' },
    ],
  },
]

interface Cell {
  code: string
  occupant?: string
}

/** 결정적 배정 — 같은 화면을 다시 열어도 배치가 동일하다 */
function buildCells(def: KindDef): { block: string; cells: Cell[] }[] {
  let n = 0
  return def.blocks.map((b) => ({
    block: b.name,
    cells: Array.from({ length: b.cols * b.rows }, (_, i) => {
      const code = `${b.prefix}-${String(i + 1).padStart(2, '0')}`
      const occupied = (i * 7 + b.prefix.charCodeAt(0)) % 5 !== 0
      const s = occupied ? MOCK_STUDENTS[n++ % MOCK_STUDENTS.length] : undefined
      return { code, occupant: s?.name }
    }),
  }))
}

const COLUMNS: Column<MockStudent>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'track', header: '계열', width: '64px', align: 'center', value: (r) => r.track },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  { key: 'branch', header: '지점', width: '64px', align: 'center', value: (r) => r.branch },
]

function Content() {
  const [kind, setKind] = useState<KindDef>(KINDS[0])
  const [selected, setSelected] = useState<string[]>([])

  const blocks = useMemo(() => buildCells(kind), [kind])
  const total = blocks.reduce((a, b) => a + b.cells.length, 0)
  const used = blocks.reduce((a, b) => a + b.cells.filter((c) => c.occupant).length, 0)
  const unassigned = MOCK_STUDENTS.filter((s) => s.status === '재원').slice(0, 11)

  return (
    <div className="p-assign">
      <div className="stat-strip">
        {KINDS.map((k) => {
          const bs = buildCells(k)
          const t = bs.reduce((a, b) => a + b.cells.length, 0)
          const u = bs.reduce((a, b) => a + b.cells.filter((c) => c.occupant).length, 0)
          return (
            <button
              type="button"
              className="stat"
              key={k.key}
              onClick={() => setKind(k)}
              style={{
                textAlign: 'left',
                border: kind.key === k.key ? '1.5px solid var(--mint-b)' : '1.5px solid transparent',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
              }}
            >
              <div className="l">
                <Icon name={k.icon} size={13} /> {k.label}
              </div>
              <div className="v">
                {u}
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}> / {t}</span>
              </div>
              <div className="d">
                잔여 {t - u}
                {k.unit}
              </div>
            </button>
          )
        })}
        <div className="stat">
          <div className="l">
            <Icon name="user-plus" size={13} /> 미배정 학생
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {unassigned.length}
          </div>
          <div className="d warn">배정 필요</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> {kind.label} 사용률
          </div>
          <div className="v">{Math.round((used / total) * 100)}%</div>
          <div className="d">
            {used} / {total}
          </div>
        </div>
      </div>

      {kind.key === 'reading' && (
        <div className="note-box plain">
          <div className="ic">
            <Icon name="git-compare" size={17} />
          </div>
          <div>
            <div className="tt">독서실은 좌석배치표(출결/자습/독서실)와 같은 좌석 마스터를 씁니다</div>
            <div className="tx">
              <b>여기</b>는 <b>명단 → 좌석</b>(누구에게 어느 자리를 줄 것인가), <b>좌석배치표</b>는{' '}
              <b>도면 → 사람</b>(지금 이 실이 어떤 상태인가)입니다. 여기서 배정한 결과가 곧 좌석배치표의 배정 축이므로{' '}
              <b>좌석 마스터를 두 벌 만들면 안 됩니다.</b>
            </div>
          </div>
        </div>
      )}

      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name={kind.icon} size={15} />
            </span>
            {kind.label} 배치도
          </div>
          <div className="r">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>선택 {selected.length}명 →</span>
            <button className="btn pri" disabled={selected.length === 0}>
              <Icon name="check" size={14} /> 일괄 배정
            </button>
            <button className="btn">일괄 해제</button>
          </div>
        </div>
        <div className="card-sec-b">
          {blocks.map((b) => (
            <div className="blk" key={b.block}>
              <div className="blk-h">
                <b>{b.block}</b>
                <span>
                  {b.cells.filter((c) => c.occupant).length} / {b.cells.length}
                  {kind.unit}
                </span>
              </div>
              <div className="blk-grid">
                {b.cells.map((c) => (
                  <div
                    key={c.code}
                    className={`cellbox${c.occupant ? ' used' : ''}`}
                    title={c.occupant ? `${c.code} · ${c.occupant}` : `${c.code} · 빈 ${kind.unit}`}
                  >
                    <span className="cc">{c.code}</span>
                    {c.occupant && <span className="co">{c.occupant}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="blk-legend">
            <span>
              <span className="sw used" /> 배정됨
            </span>
            <span>
              <span className="sw" /> 빈 {kind.unit}
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              독서실 좌석은 <b>입학예약 좌석배정(F-4.2)</b> · <b>좌석 이탈/복귀(F-4.11-8)</b>와 같은 좌석표를 공유합니다.
            </span>
          </div>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={unassigned}
        rowKey={(r) => r.id}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        pageSize={12}
        countLabel={
          <>
            {kind.label} 미배정 <b>{unassigned.length}</b>명
          </>
        }
        emptyText="미배정 학생이 없습니다."
      />
    </div>
  )
}

export const adminAssignMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn">
        <Icon name="history" size={14} /> 전년도 배정 복사
      </button>
    </>
  ),
}
