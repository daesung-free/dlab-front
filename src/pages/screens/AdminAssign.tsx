import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, useServerTable, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  assignLocker,
  assignSeat,
  getSeatLayout,
  listLockers,
  listSeatAreas,
  releaseLocker,
  releaseSeatOfStudent,
  type SeatArea,
} from '../../api/facility'
import { SORTABLE, TRACK_LABEL, searchStudents, type Student } from '../../api/students'
import type { Mockup } from './types'
import './assign.css'

/* F-4.10-3 배정 관리(사물함·독서실)
 *
 * ⚠ 기숙사는 범위에서 제외(클라이언트 요청). 배정 대상은 사물함·독서실 2종이다.
 *
 * ⚠ 독서실은 이 화면과 좌석배치표(F-C-4)가 같은 좌석 마스터를 공유한다.
 *   · 여기(배정 관리)  = 명단 → 좌석. "누구에게 어느 자리를 줄 것인가"
 *   · 좌석배치표      = 도면 → 사람. "지금 이 실이 어떤 상태인가"
 *   배정 결과가 곧 좌석배치표의 배정 축이므로, 좌석 마스터를 두 벌 만들면 안 된다.
 *
 * ★ 두 도메인의 API가 다르다(src/api/facility.ts 주석 참고).
 *   · 사물함: 번호 목록뿐 — **블록·좌표가 없어** 화면이 lockerNo 접두어로 블록을 나눈다
 *   · 좌석  : 구역(area) → 좌표(xPos/yPos)를 서버가 준다
 *
 * ★ 독서실 좌석 마스터를 만들 관리자 API가 없다(`AreaRequest`는 키오스크용).
 *   시드도 없어서 구역이 0개면 배치도가 빈다 — docs/API_GAPS.md 에 요청해뒀다.
 *
 * ★ 미배정 학생은 서버 필터가 없어 **받아온 페이지 안에서만** 거른다(반 배정과 같은 제약). */

type Kind = 'locker' | 'reading'

const KINDS: { key: Kind; label: string; icon: string; unit: string }[] = [
  { key: 'locker', label: '사물함', icon: 'lock', unit: '칸' },
  { key: 'reading', label: '독서실', icon: 'armchair', unit: '좌석' },
]

const PAGE_SIZE = 20

const sortableKey = (key: string): boolean => (SORTABLE as readonly string[]).includes(key)

const COLUMNS: Column<Student>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: sortableKey('studentNo'), value: (r) => r.studentNo ?? '-' },
  { key: 'name', header: '이름', width: '84px', sortable: sortableKey('name'), mask: 'name', value: (r) => r.name },
  { key: 'track', header: '계열', width: '64px', align: 'center', sortable: sortableKey('track'), value: (r) => (r.track ? TRACK_LABEL[r.track] : '-') },
  { key: 'className', header: '반', width: '56px', align: 'center', value: (r) => r.className ?? '-' },
  { key: 'academyName', header: '지점', width: '64px', align: 'center', value: (r) => r.academyName ?? '-' },
]

/** 배치도 한 칸 — 사물함/좌석을 같은 모양으로 맞춘 것 */
interface Cell {
  id: number
  code: string
  occupantName: string | null
  occupantEnrollmentId: number | null
}

interface Block {
  name: string
  cells: Cell[]
}

/** 사물함 번호에서 블록을 뽑는다. "A-01" → "A". 구분자가 없으면 한 블록으로 본다 */
function lockerBlock(lockerNo: string): string {
  const i = lockerNo.indexOf('-')
  return i > 0 ? lockerNo.slice(0, i) : '전체'
}

function groupBlocks(cells: (Cell & { block: string })[]): Block[] {
  const map = new Map<string, Cell[]>()
  for (const c of cells) {
    const arr = map.get(c.block) ?? []
    arr.push(c)
    map.set(c.block, arr)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([name, list]) => ({ name, cells: list }))
}

function Content() {
  const { academyId } = useAcademy()
  const [kind, setKind] = useState<Kind>('locker')
  const [selected, setSelected] = useState<string[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [areas, setAreas] = useState<SeatArea[]>([])
  const [areaId, setAreaId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /** 배치도를 다시 읽는다. 사물함/좌석 어느 쪽이든 같은 Block[] 으로 맞춘다 */
  const loadLayout = useCallback(async () => {
    if (academyId === null) return
    setError(null)
    try {
      if (kind === 'locker') {
        const lockers = await listLockers(academyId)
        setBlocks(
          groupBlocks(
            lockers.map((l) => ({
              block: lockerBlock(l.lockerNo),
              id: l.id,
              code: l.lockerNo,
              occupantName: l.studentName,
              occupantEnrollmentId: l.enrollmentId,
            })),
          ),
        )
        return
      }

      const list = await listSeatAreas(academyId)
      setAreas(list)
      const target = list.some((a) => a.id === areaId) ? areaId : (list[0]?.id ?? null)
      setAreaId(target)

      if (target === null) {
        setBlocks([])
        return
      }
      const layout = await getSeatLayout(target)
      const areaNm = list.find((a) => a.id === target)?.areaNm ?? '좌석'
      setBlocks([
        {
          name: areaNm,
          cells: layout.map((s) => ({
            id: s.seatId,
            code: s.seatCd,
            occupantName: s.studentName,
            occupantEnrollmentId: s.enrollmentId,
          })),
        },
      ])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '배치도를 불러오지 못했습니다.')
      setBlocks([])
    }
  }, [academyId, kind, areaId])

  // areaId 도 의존성에 넣는다. 첫 로드에서 loadLayout 이 areaId 를 정하면 한 번 더 도는데,
  // 빼두면 사용자가 구역을 바꿔도 배치도가 그대로여서 그게 더 나쁘다.
  useEffect(() => {
    void loadLayout()
  }, [loadLayout])

  const params = useMemo(() => ({ status: 'ENROLLED' as const }), [])
  const table = useServerTable({ fetcher: searchStudents, params, pageSize: PAGE_SIZE, sortable: SORTABLE })

  const total = blocks.reduce((a, b) => a + b.cells.length, 0)
  const used = blocks.reduce((a, b) => a + b.cells.filter((c) => c.occupantEnrollmentId !== null).length, 0)
  const unit = KINDS.find((k) => k.key === kind)!.unit
  const label = KINDS.find((k) => k.key === kind)!.label

  /** 선택한 학생을 빈 자리에 앞에서부터 채운다 */
  async function assignSelected() {
    const empty = blocks.flatMap((b) => b.cells).filter((c) => c.occupantEnrollmentId === null)
    const picked = table.rows.filter((r) => selected.includes(String(r.enrollmentId)))
    if (picked.length === 0) return

    if (empty.length < picked.length) {
      setNotice(`빈 ${unit}이 ${empty.length}개뿐입니다. 선택은 ${picked.length}명입니다.`)
      return
    }

    setBusy(true)
    setNotice(null)
    const failed: string[] = []

    // 일괄 배정 API가 없어 한 건씩 보낸다. 병렬로 던지면 실패 시 어디까지 반영됐는지 불분명해진다.
    for (let i = 0; i < picked.length; i += 1) {
      try {
        if (kind === 'locker') await assignLocker(empty[i].id, picked[i].enrollmentId)
        else await assignSeat(empty[i].id, picked[i].enrollmentId)
      } catch (err) {
        failed.push(`${picked[i].name}: ${err instanceof ApiError ? err.message : '실패'}`)
      }
    }

    setNotice(
      failed.length === 0
        ? `${picked.length}명 배정 완료`
        : `${picked.length - failed.length}명 완료 · ${failed.length}명 실패 — ${failed.join(' / ')}`,
    )
    setSelected([])
    setBusy(false)
    await loadLayout()
    table.reload()
  }

  /** 한 칸을 눌러 해제 */
  async function release(cell: Cell) {
    if (cell.occupantEnrollmentId === null) return
    setBusy(true)
    setNotice(null)
    try {
      if (kind === 'locker') await releaseLocker(cell.id)
      else await releaseSeatOfStudent(cell.occupantEnrollmentId)
      setNotice(`${cell.code} 배정을 해제했습니다.`)
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : '해제하지 못했습니다.')
    }
    setBusy(false)
    await loadLayout()
    table.reload()
  }

  return (
    <div className="p-assign">
      <div className="stat-strip">
        {KINDS.map((k) => (
          <button
            type="button"
            className="stat"
            key={k.key}
            onClick={() => setKind(k.key)}
            style={{
              textAlign: 'left',
              border: kind === k.key ? '1.5px solid var(--mint-b)' : '1.5px solid transparent',
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
            }}
          >
            <div className="l">
              <Icon name={k.icon} size={13} /> {k.label}
            </div>
            <div className="v">
              {kind === k.key ? used : '–'}
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>
                {' '}
                / {kind === k.key ? total : '–'}
              </span>
            </div>
            <div className="d">
              {kind === k.key ? `잔여 ${total - used}${k.unit}` : '탭하여 보기'}
            </div>
          </button>
        ))}
        <div className="stat">
          <div className="l">
            <Icon name="user-plus" size={13} /> 재원생
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {table.totalElements}
          </div>
          <div className="d warn">배정 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> {label} 사용률
          </div>
          <div className="v">{total > 0 ? `${Math.round((used / total) * 100)}%` : '–'}</div>
          <div className="d">
            {used} / {total}
          </div>
        </div>
      </div>

      {kind === 'reading' && (
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

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {notice && (
        <div className="note-box" role="status">
          <div className="ic">
            <Icon name="check" size={17} />
          </div>
          <div>
            <div className="tt">{notice}</div>
          </div>
        </div>
      )}

      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name={kind === 'locker' ? 'lock' : 'armchair'} size={15} />
            </span>
            {label} 배치도
          </div>
          <div className="r">
            {kind === 'reading' && areas.length > 1 && (
              <select className="sel" style={{ width: 160 }} value={areaId ?? ''} onChange={(e) => setAreaId(Number(e.target.value))}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.areaNm}
                  </option>
                ))}
              </select>
            )}
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>선택 {selected.length}명 →</span>
            <button className="btn pri" disabled={selected.length === 0 || busy} onClick={() => void assignSelected()}>
              <Icon name="check" size={14} /> {busy ? '처리 중…' : `빈 ${unit}에 배정`}
            </button>
          </div>
        </div>
        <div className="card-sec-b">
          {blocks.length === 0 ? (
            <div className="dt-empty">
              {kind === 'reading'
                ? '좌석 구역이 없습니다. 좌석 마스터를 만드는 관리자 API가 아직 없어 백엔드 시드가 필요합니다.'
                : '등록된 사물함이 없습니다.'}
            </div>
          ) : (
            blocks.map((b) => (
              <div className="blk" key={b.name}>
                <div className="blk-h">
                  <b>{b.name}</b>
                  <span>
                    {b.cells.filter((c) => c.occupantEnrollmentId !== null).length} / {b.cells.length}
                    {unit}
                  </span>
                </div>
                <div className="blk-grid">
                  {b.cells.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className={`cellbox${c.occupantEnrollmentId !== null ? ' used' : ''}`}
                      title={
                        c.occupantEnrollmentId !== null
                          ? `${c.code} · ${c.occupantName ?? '배정됨'} — 눌러서 해제`
                          : `${c.code} · 빈 ${unit}`
                      }
                      disabled={c.occupantEnrollmentId === null || busy}
                      onClick={() => void release(c)}
                    >
                      <span className="cc">{c.code}</span>
                      {c.occupantName && <span className="co">{c.occupantName}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          <div className="blk-legend">
            <span>
              <span className="sw used" /> 배정됨
            </span>
            <span>
              <span className="sw" /> 빈 {unit}
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              독서실 좌석은 <b>입학예약 좌석배정(F-4.2)</b> · <b>좌석 이탈/복귀(F-4.11-8)</b>와 같은 좌석표를 공유합니다.
            </span>
          </div>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={table.rows}
        rowKey={(r) => String(r.enrollmentId)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        loading={table.loading}
        serverPaging={table.serverPaging}
        countLabel={
          <>
            재원생 <b>{table.totalElements}</b>명{' '}
            <span style={{ color: 'var(--muted)' }} title="서버에 '사물함·좌석 미배정' 필터가 없어 전체 재원생을 보여준다">
              (미배정만 거르는 조건이 서버에 없음)
            </span>
          </>
        }
        emptyText="재원생이 없습니다."
      />
    </div>
  )
}

export const adminAssignMockup: Mockup = {
  Content,
}
