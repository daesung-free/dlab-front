import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, PrintButton, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { MOCK_STUDENTS, type MockStudent } from './mockStudents'
import type { Mockup } from './types'
import './matrix.css'

/* 학원생 관리 > 교무업무 > 학원생 현황 — 클라이언트 메뉴표 기준 추가 화면
 *
 * 명단 조회·출력(F-4.9)과 목적이 다르다.
 *   · 명단 조회·출력 = 개별 학생 행을 뽑아 엑셀로 내리는 화면
 *   · 학원생 현황   = 반·계열·재수구분별로 "몇 명인가"를 집계해서 보는 화면
 * 둘을 한 화면에 합치면 필터 조건이 서로 간섭하므로 분리한다.
 *
 * ⚠ BE 전제 — 집계는 화면에서 돌리지 않는다.
 *   전 원생을 내려받아 프론트에서 세면 원생 수가 늘수록 그대로 느려진다.
 *   GET /api/v1/students/stats?groupBy=class|track|month 형태로 서버 집계를 받는다.
 *   현재는 목데이터라 화면에서 계산하고 있고, 연동 시 이 useMemo 들이 통째로 교체된다. */

const CLASS_META: Record<string, { teacher: string; capacity: number; track: string }> = {
  '1반': { teacher: '최지원', capacity: 14, track: '인문' },
  '2반': { teacher: '김유진', capacity: 14, track: '자연' },
  '3반': { teacher: '이장원', capacity: 14, track: '자연' },
  '4반': { teacher: '박서영', capacity: 14, track: '자연' },
}

const TABS = [
  { key: 'class', label: '반별 현황' },
  { key: 'cross', label: '계열 · 재수 구분' },
  { key: 'month', label: '월별 증감' },
]

interface ClassRow {
  classNo: string
  teacher: string
  capacity: number
  enrolled: number
  onLeave: number
  withdrawn: number
  nature: number
  humanity: number
}

/** 채움 막대 — 정원 대비 재원 비율을 한눈에 */
function FillBar({ ratio }: { ratio: number }) {
  const pct = Math.min(100, Math.round(ratio * 100))
  const tone = pct >= 100 ? 'var(--red)' : pct >= 85 ? 'var(--mint)' : 'var(--amber)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <span
        style={{
          flex: 1,
          height: 6,
          borderRadius: 4,
          background: 'var(--line-2)',
          overflow: 'hidden',
          minWidth: 54,
        }}
      >
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: tone }} />
      </span>
      <b style={{ fontSize: 11.5, color: tone, minWidth: 34, textAlign: 'right' }}>{pct}%</b>
    </span>
  )
}

const CLASS_COLUMNS: Column<ClassRow>[] = [
  { key: 'classNo', header: '반', width: '72px', align: 'center', sortable: true, value: (r) => r.classNo },
  { key: 'teacher', header: '담임', width: '86px', value: (r) => r.teacher },
  { key: 'capacity', header: '정원', width: '68px', align: 'right', sortable: true, value: (r) => r.capacity },
  {
    key: 'enrolled',
    header: '재원',
    width: '68px',
    align: 'right',
    sortable: true,
    value: (r) => r.enrolled,
    render: (r) => <b>{r.enrolled}</b>,
  },
  {
    key: 'onLeave',
    header: '휴원',
    width: '68px',
    align: 'right',
    sortable: true,
    value: (r) => r.onLeave,
    render: (r) => (r.onLeave ? <span style={{ color: 'var(--amber)' }}>{r.onLeave}</span> : '-'),
  },
  {
    key: 'withdrawn',
    header: '퇴원',
    width: '68px',
    align: 'right',
    sortable: true,
    value: (r) => r.withdrawn,
    render: (r) => (r.withdrawn ? <span style={{ color: 'var(--red)' }}>{r.withdrawn}</span> : '-'),
  },
  { key: 'nature', header: '자연', width: '68px', align: 'right', value: (r) => r.nature },
  { key: 'humanity', header: '인문', width: '68px', align: 'right', value: (r) => r.humanity },
  {
    key: 'fill',
    header: '충원율',
    width: '150px',
    value: (r) => Math.round((r.enrolled / r.capacity) * 100),
    render: (r) => <FillBar ratio={r.enrolled / r.capacity} />,
  },
]

interface MonthRow {
  month: string
  added: number
  cumulative: number
}

const MONTH_COLUMNS: Column<MonthRow>[] = [
  { key: 'month', header: '월', value: (r) => r.month },
  { key: 'added', header: '신규 등원', value: (r) => r.added },
  { key: 'cumulative', header: '누계', value: (r) => r.cumulative },
]

function countBy(list: MockStudent[], fn: (s: MockStudent) => boolean): number {
  return list.filter(fn).length
}

function Content() {
  const [tab, setTab] = useState('class')
  const [branch, setBranch] = useState<string>('전체')

  const pool = useMemo(
    () => (branch === '전체' ? MOCK_STUDENTS : MOCK_STUDENTS.filter((s) => s.branch === branch)),
    [branch],
  )

  const enrolled = countBy(pool, (s) => s.status === '재원')
  const onLeave = countBy(pool, (s) => s.status === '휴원')
  const withdrawn = countBy(pool, (s) => s.status === '퇴원')
  const totalCapacity = Object.values(CLASS_META).reduce((n, m) => n + m.capacity, 0)

  const classRows: ClassRow[] = useMemo(
    () =>
      Object.entries(CLASS_META).map(([classNo, meta]) => {
        const list = pool.filter((s) => s.classNo === classNo)
        const live = list.filter((s) => s.status === '재원')
        return {
          classNo,
          teacher: meta.teacher,
          capacity: meta.capacity,
          enrolled: live.length,
          onLeave: countBy(list, (s) => s.status === '휴원'),
          withdrawn: countBy(list, (s) => s.status === '퇴원'),
          nature: countBy(live, (s) => s.track === '자연'),
          humanity: countBy(live, (s) => s.track === '인문'),
        }
      }),
    [pool],
  )

  /** 계열 × 재수구분 크로스탭 — 재원생만 센다 */
  const cross = useMemo(() => {
    const live = pool.filter((s) => s.status === '재원')
    const tracks: MockStudent['track'][] = ['자연', '인문']
    const repeats: MockStudent['repeat'][] = ['재수', '삼수', 'N수']
    return {
      tracks,
      repeats,
      cell: (t: MockStudent['track'], r: MockStudent['repeat']) =>
        countBy(live, (s) => s.track === t && s.repeat === r),
      rowSum: (t: MockStudent['track']) => countBy(live, (s) => s.track === t),
      colSum: (r: MockStudent['repeat']) => countBy(live, (s) => s.repeat === r),
      total: live.length,
    }
  }, [pool])

  /** 월별 신규 등원 — 등원일 기준 */
  const months: MonthRow[] = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of pool) {
      const m = s.enrolledAt.slice(0, 7)
      map.set(m, (map.get(m) ?? 0) + 1)
    }
    const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    let acc = 0
    return sorted.map(([month, n]) => {
      acc += n
      return { month, added: n, cumulative: acc }
    })
  }, [pool])

  const maxAdded = Math.max(1, ...months.map((m) => m.added))

  return (
    <>
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 재원
          </div>
          <div className="v">{enrolled}</div>
          <div className="d">정원 {totalCapacity}명 대비</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 충원율
          </div>
          <div className="v">{Math.round((enrolled / totalCapacity) * 100)}%</div>
          <div className="d">{enrolled >= totalCapacity ? '정원 초과' : `여석 ${totalCapacity - enrolled}석`}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="door-open" size={13} /> 휴원
          </div>
          <div className="v">{onLeave}</div>
          <div className="d warn">복귀 상담 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-x" size={13} /> 퇴원
          </div>
          <div className="v">{withdrawn}</div>
          <div className="d down">누적 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="layout-grid" size={13} /> 운영 반
          </div>
          <div className="v">{classRows.length}</div>
          <div className="d">고정반 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-plus" size={13} /> 금월 신규
          </div>
          <div className="v">{months.at(-1)?.added ?? 0}</div>
          <div className="d up">{months.at(-1)?.month ?? '-'}</div>
        </div>
      </div>

      <div className="filter-row" style={{ background: '#fff', borderRadius: 12, marginBottom: 14, border: 'none' }}>
        {['전체', '분당', '대치', '평촌'].map((b) => (
          <button key={b} type="button" className={`chip${branch === b ? ' on' : ''}`} onClick={() => setBranch(b)}>
            {b}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)', alignSelf: 'center' }}>
          지점 접근 범위는 서버 RBAC이 최종 결정합니다
        </span>
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} standalone />

      {tab === 'class' && (
        <DataTable
          columns={CLASS_COLUMNS}
          rows={classRows}
          rowKey={(r) => r.classNo}
          masked={false}
          pageSize={10}
          countLabel={
            <>
              {branch} · 반 <b>{classRows.length}</b>개
            </>
          }
          toolbar={
            <>
              <PrintButton />
              <ExcelButton filename={`학원생현황_반별_${branch}`} columns={CLASS_COLUMNS} rows={classRows} masked={false} />
            </>
          }
        />
      )}

      {tab === 'cross' && (
        <div className="card-sec p-matrix">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="table-2" size={15} />
              </span>
              계열 × 재수 구분 — 재원생 {cross.total}명
            </div>
            <div className="r">
              <span className="mk supplement">휴원 · 퇴원 제외</span>
            </div>
          </div>
          <div className="card-sec-b">
            <div className="mx-scroll">
              <table className="mx">
                <thead>
                  <tr>
                    <th className="area">계열</th>
                    {cross.repeats.map((r) => (
                      <th key={r}>{r}</th>
                    ))}
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {cross.tracks.map((t) => (
                    <tr key={t}>
                      <th className="area">
                        {t}
                        <span className="an">{t === '자연' ? '수학 미적/기하 · 과탐' : '수학 확통 · 사탐'}</span>
                      </th>
                      {cross.repeats.map((r) => (
                        <td key={r}>
                          <span className={`pm ${cross.cell(t, r) === 0 ? 'p-none' : 'p-own'}`}>{cross.cell(t, r)}</span>
                        </td>
                      ))}
                      <td>
                        <span className="pm p-full">{cross.rowSum(t)}</span>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th className="area">합계</th>
                    {cross.repeats.map((r) => (
                      <td key={r}>
                        <span className="pm p-read">{cross.colSum(r)}</span>
                      </td>
                    ))}
                    <td>
                      <span className="pm p-full">{cross.total}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mx-legend">
              <span>
                <span className="pm p-own">n</span> 계열 × 구분 교차 인원
              </span>
              <span>
                <span className="pm p-read">n</span> 구분 소계
              </span>
              <span>
                <span className="pm p-full">n</span> 합계
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'month' && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="trending-up" size={15} />
              </span>
              월별 신규 등원 · 누계
            </div>
            <div className="r">
              <ExcelButton filename={`학원생현황_월별_${branch}`} columns={MONTH_COLUMNS} rows={months} masked={false} />
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {months.map((m) => (
              <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 68, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{m.month}</span>
                <span style={{ flex: 1, height: 22, borderRadius: 7, background: 'var(--line-2)', overflow: 'hidden' }}>
                  <span
                    style={{
                      display: 'block',
                      width: `${(m.added / maxAdded) * 100}%`,
                      height: '100%',
                      background: 'var(--mint)',
                    }}
                  />
                </span>
                <span style={{ width: 58, fontSize: 12.5, fontWeight: 800, textAlign: 'right' }}>{m.added}명</span>
                <span style={{ width: 92, fontSize: 11.5, color: 'var(--muted)', textAlign: 'right' }}>
                  누계 {m.cumulative}명
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export const studentStatusMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn">
        <Icon name="bar-chart-3" size={14} /> 전년 대비 비교
      </button>
    </>
  ),
}
