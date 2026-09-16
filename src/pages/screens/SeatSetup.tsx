import { useCallback, useEffect, useState } from 'react'
import { DataTable, Modal, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  createBuilding,
  createSeatArea,
  createSeatGrid,
  createSeatMaster,
  deleteBuilding,
  deleteSeatArea,
  deleteSeatMaster,
  listBuildings,
  listSeatAreas,
  listSeatMasters,
  updateBuilding,
  updateSeatArea,
  type Building,
  type SeatArea,
  type SeatMaster,
} from '../../api/facility'
import './seat-setup.css'

/* 독서실 관·구역·좌석 등록 — /api/v1/admin/seats
 *
 * ★ **이 화면이 없어서 좌석 화면 셋이 막혀 있었다.** 배정 관리·좌석배치표·좌석 이탈이
 *   전부 구역과 좌석이 이미 있다고 전제하는데, 만드는 경로가 어디에도 없었다.
 *   시드로 넣어 두고 버티던 자리다.
 *
 * ── 왜 「관」이 구역 위에 있나 ──────────────────────────────
 * 동탄2관은 동탄 본관의 별관인데 **A·B·C 구역도 좌석번호도 본관과 똑같다.**
 * DSA 는 seat_cd 하나로만 좌석을 찾아서 구분이 불가능했고, 그래서 별관을
 * 1000번대로 돌려 운영해 왔다(1번 → 1001번). 클라이언트 요구는
 * **같은 번호를 쓰되 본관/별관이 구분되고, 별관이 더 생겨도 되는 것**이다.
 *
 * 그래서 축이 둘이다.
 *   · 화면·DB      : (관, 구역, 좌석번호) — 본래 번호가 그대로 보인다
 *   · 키오스크     : kioskAreaCd / kioskSeatCd — 서버가 변환해 저장해 둔 값
 * 단말 계약은 안 바뀌고 데스크는 1000번대를 외울 필요가 없다.
 *
 * ★ **코드는 등록 후 못 고친다** — 관 코드·구역 코드·좌석번호·오프셋 넷 다.
 *   키오스크가 그 값으로 좌석을 찾기 때문에 바꾸면 단말에서 그 자리가 사라진다.
 *   화면에서도 수정 입력을 아예 안 띄운다. "고칠 수 있는데 서버가 막는" 것보다
 *   "고칠 수 없다"가 화면에 보이는 쪽이 낫다.
 *
 * ★ **좌석은 격자로 만든다.** 한 구역이 수십 석이라 한 칸씩 등록하게 하면 실무에서
 *   안 쓴다. 행·열만 받고 좌표·번호는 서버가 만든다. 통로는 행·열을 찍어 빼고
 *   번호는 그 칸을 건너뛰고 이어진다(실제 좌석표가 그렇게 붙어 있다).
 */

/** 표 안 버튼 축소 — BasicSettings 와 같은 치수를 쓴다 */
const SMALL_BTN = { padding: '4px 9px', fontSize: 11.5 } as const

interface Props {
  /** 등록이 끝나면 배치도를 다시 불러야 한다 */
  onChanged?: () => void
}

export function SeatSetup({ onChanged }: Props) {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('building')

  const [buildings, setBuildings] = useState<Building[]>([])
  const [areas, setAreas] = useState<SeatArea[]>([])
  const [areaId, setAreaId] = useState<number | null>(null)
  const [seats, setSeats] = useState<SeatMaster[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<null | 'building' | 'area' | 'grid' | 'seat'>(null)
  /** 단건 등록이 채울 빈칸. 배치도에서 그 자리를 눌러서 정한다 */
  const [spot, setSpot] = useState<{ xPos: number; yPos: number } | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [b, a] = await Promise.all([
        listBuildings(academyId),
        // 관리 화면이라 비활성도 받는다 — 안 그러면 한 번 끈 구역을 다시 켤 수 없다
        listSeatAreas(academyId, { includeInactive: true }),
      ])
      setBuildings(b)
      setAreas(a)
      setAreaId((prev) => (a.some((x) => x.id === prev) ? prev : (a[0]?.id ?? null)))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [academyId])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 좌석 목록.
   *
   * ★ **`load()` 안에 두지 않고 따로 뺐다가 사고가 났다.** 삭제 후 `load()` 만 부르면
   *   관·구역만 새로 읽고 좌석은 그대로 남아, **지운 좌석이 표에 계속 보였다.**
   *   지웠는데 안 없어지니 한 번 더 누르게 되고, 그때는 404 가 뜬다.
   *   그래서 쓰기 동작은 이 둘을 **항상 같이** 부른다({@link reload}).
   */
  const loadSeats = useCallback(async () => {
    if (areaId === null) {
      setSeats([])
      return
    }
    try {
      setSeats(await listSeatMasters(areaId))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '좌석을 불러오지 못했습니다.')
    }
  }, [areaId])

  useEffect(() => {
    void loadSeats()
  }, [loadSeats])

  /** 쓰기 뒤에는 이걸 부른다 — 한쪽만 부르면 화면이 서로 어긋난다 */
  const reload = useCallback(async () => {
    await Promise.all([load(), loadSeats()])
  }, [load, loadSeats])

  /** 모달 저장 공통 — 실패 메시지는 **모달 안에** 띄운다. 뒤 배너는 안 보인다 */
  const submit = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setModalError(null)
    try {
      await fn()
      setModal(null)
      await reload()
      onChanged?.()
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      setError(null)
      await reload()
      onChanged?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '처리하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const area = areas.find((a) => a.id === areaId) ?? null

  return (
    <div className="seat-setup">
      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <Tabs
        items={[
          { key: 'building', label: '관', count: buildings.length },
          { key: 'area', label: '구역', count: areas.length },
          { key: 'seat', label: '좌석', count: seats.length },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {tab === 'building' && (
        <BuildingTab
          buildings={buildings}
          loading={loading}
          busy={busy}
          onAdd={() => {
            setModalError(null)
            setModal('building')
          }}
          onToggle={(b) => act(() => updateBuilding(b.id, { active: !b.active }))}
          onDelete={(b) => act(() => deleteBuilding(b.id))}
        />
      )}

      {tab === 'area' && (
        <AreaTab
          areas={areas}
          loading={loading}
          busy={busy}
          canAdd={buildings.length > 0}
          onAdd={() => {
            setModalError(null)
            setModal('area')
          }}
          onToggle={(a) => act(() => updateSeatArea(a.id, { active: !a.active }))}
          onDelete={(a) => act(() => deleteSeatArea(a.id))}
        />
      )}

      {tab === 'seat' && (
        <SeatTab
          areas={areas}
          areaId={areaId}
          area={area}
          seats={seats}
          busy={busy}
          onPickArea={setAreaId}
          onAdd={() => {
            setModalError(null)
            setModal('grid')
          }}
          onPickSpot={(xPos, yPos) => {
            setModalError(null)
            setSpot({ xPos, yPos })
            setModal('seat')
          }}
          onDelete={(s) => act(() => deleteSeatMaster(s.id))}
        />
      )}

      {modal === 'building' && (
        <BuildingModal
          busy={busy}
          error={modalError}
          onClose={() => setModal(null)}
          onSubmit={(body) => submit(() => createBuilding({ academyId: academyId ?? undefined, ...body }))}
        />
      )}

      {modal === 'area' && (
        <AreaModal
          buildings={buildings}
          busy={busy}
          error={modalError}
          onClose={() => setModal(null)}
          onSubmit={(body) => submit(() => createSeatArea({ academyId: academyId ?? undefined, ...body }))}
        />
      )}

      {modal === 'seat' && areaId !== null && spot && (
        <SeatModal
          area={area}
          spot={spot}
          busy={busy}
          error={modalError}
          onClose={() => setModal(null)}
          onSubmit={(body) => submit(() => createSeatMaster({ studyAreaId: areaId, ...body }))}
        />
      )}

      {modal === 'grid' && areaId !== null && (
        <GridModal
          area={area}
          busy={busy}
          error={modalError}
          onClose={() => setModal(null)}
          onSubmit={(body) => submit(() => createSeatGrid({ studyAreaId: areaId, ...body }))}
        />
      )}
    </div>
  )
}

/* ── 관 ─────────────────────────────────────────────────── */

function BuildingTab({
  buildings,
  loading,
  busy,
  onAdd,
  onToggle,
  onDelete,
}: {
  buildings: Building[]
  loading: boolean
  busy: boolean
  onAdd: () => void
  onToggle: (b: Building) => void
  onDelete: (b: Building) => void
}) {
  const columns: Column<Building>[] = [
    { key: 'code', header: '코드', width: '90px', value: (b) => b.code },
    { key: 'name', header: '관 이름', value: (b) => b.name },
    {
      key: 'offset',
      header: '키오스크 번호대',
      exportHeader: '키오스크 번호대',
      width: '180px',
      value: (b) => (b.main ? '본래 번호 그대로' : `+${b.seatCdOffset}`),
      render: (b) =>
        b.main ? (
          <span className="muted">본래 번호 그대로</span>
        ) : (
          /* 데스크가 "1번인데 왜 1001번이지"를 묻지 않게 변환 예시를 같이 보여준다 */
          <span>
            1번 → <b>{b.seatCdOffset + 1}번</b>
          </span>
        ),
    },
    {
      key: 'active',
      header: '사용',
      width: '80px',
      align: 'center',
      value: (b) => (b.active ? '사용' : '중지'),
      render: (b) => <span className={`st-tag${b.active ? " on" : ""}`}>{b.active ? '사용' : '중지'}</span>,
    },
    {
      key: 'act',
      header: '',
      width: '150px',
      align: 'right',
      value: () => '',
      render: (b) => (
        <>
          <button type="button" className="btn" style={SMALL_BTN} disabled={busy} onClick={() => onToggle(b)}>
            {b.active ? '중지' : '사용'}
          </button>{' '}
          <button type="button" className="btn" style={SMALL_BTN} disabled={busy} onClick={() => onDelete(b)}>
            삭제
          </button>
        </>
      ),
    },
  ]

  return (
    <div className="card-sec">
      <div className="card-sec-h">
        <div className="t">
          <span className="ico">
            <Icon name="building-2" size={15} />
          </span>
          관
        </div>
        <div className="r">
          <button type="button" className="btn pri" style={SMALL_BTN} onClick={onAdd}>
            관 등록
          </button>
        </div>
      </div>
      <div className="card-sec-b">
        <p className="note-box">
          별관은 본관과 <b>같은 구역명·좌석번호</b>를 쓸 수 있습니다. 키오스크에 내려갈 때만 번호대가 밀립니다 —
          데스크는 본래 번호로 보고 말하면 됩니다.
        </p>
        <DataTable
          columns={columns}
          rows={buildings}
          rowKey={(b) => String(b.id)}
          loading={loading}
          masked={false}
          emptyText="관이 없습니다. 먼저 등록하세요."
        />
      </div>
    </div>
  )
}

function BuildingModal({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: { code: string; name: string; sortOrder?: number; seatCdOffset?: number }) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [annex, setAnnex] = useState(false)
  const [offset, setOffset] = useState(1000)

  return (
    <Modal
      title="관 등록"
      sub="본관/별관을 나눕니다. 코드와 번호대는 등록 후 바꿀 수 없습니다."
      confirmLabel="등록"
      busy={busy}
      error={error}
      confirmDisabled={!code.trim() || !name.trim() || (annex && offset < 1000)}
      onClose={onClose}
      onConfirm={() =>
        onSubmit({ code: code.trim(), name: name.trim(), seatCdOffset: annex ? offset : 0 })
      }
    >
      <div className="frow">
        <label className="req">코드</label>
        <input className="inp" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} placeholder="예: 2" />
      </div>
      <div className="frow">
        <label className="req">관 이름</label>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="예: 2관" />
      </div>
      <div className="frow">
        <label className="req">구분</label>
        <select className="sel" value={annex ? 'annex' : 'main'} onChange={(e) => setAnnex(e.target.value === 'annex')}>
          <option value="main">본관 — 좌석번호를 그대로 내린다</option>
          <option value="annex">별관 — 키오스크에는 번호대를 밀어 내린다</option>
        </select>
      </div>
      {annex && (
        <>
          <div className="frow">
            <label className="req">번호대</label>
            <input
              className="inp"
              type="number"
              value={offset}
              min={1000}
              step={1000}
              onChange={(e) => setOffset(Number(e.target.value))}
            />
          </div>
          <p className="note-box">
            이 관의 <b>1번 좌석</b>이 키오스크에서 <b>{offset + 1}번</b>이 됩니다. 데스크 화면에는 계속 1번으로
            보입니다.
            <br />
            1000 미만은 받지 않습니다 — 100이면 본관 101번과 곧바로 겹칩니다.
          </p>
        </>
      )}
    </Modal>
  )
}

/* ── 구역 ───────────────────────────────────────────────── */

function AreaTab({
  areas,
  loading,
  busy,
  canAdd,
  onAdd,
  onToggle,
  onDelete,
}: {
  areas: SeatArea[]
  loading: boolean
  busy: boolean
  canAdd: boolean
  onAdd: () => void
  onToggle: (a: SeatArea) => void
  onDelete: (a: SeatArea) => void
}) {
  const columns: Column<SeatArea>[] = [
    /* ★ 관을 안 띄우면 본관 A 와 별관 A 가 표에서 똑같이 보인다 */
    { key: 'building', header: '관', width: '110px', value: (a) => a.buildingName },
    { key: 'areaCd', header: '코드', width: '80px', value: (a) => a.areaCd },
    { key: 'areaNm', header: '구역 이름', value: (a) => a.areaNm },
    {
      key: 'kiosk',
      header: '키오스크 코드',
      width: '130px',
      value: (a) => a.kioskAreaCd,
      render: (a) =>
        a.kioskAreaCd === a.areaCd ? <span className="muted">{a.kioskAreaCd}</span> : <b>{a.kioskAreaCd}</b>,
    },
    { key: 'seatCount', header: '좌석', width: '70px', align: 'right', value: (a) => String(a.seatCount) },
    {
      key: 'active',
      header: '사용',
      width: '80px',
      align: 'center',
      value: (a) => (a.active ? '사용' : '중지'),
      render: (a) => <span className={`st-tag${a.active ? " on" : ""}`}>{a.active ? '사용' : '중지'}</span>,
    },
    {
      key: 'act',
      header: '',
      width: '150px',
      align: 'right',
      value: () => '',
      render: (a) => (
        <>
          <button type="button" className="btn" style={SMALL_BTN} disabled={busy} onClick={() => onToggle(a)}>
            {a.active ? '중지' : '사용'}
          </button>{' '}
          <button type="button" className="btn" style={SMALL_BTN} disabled={busy} onClick={() => onDelete(a)}>
            삭제
          </button>
        </>
      ),
    },
  ]

  return (
    <div className="card-sec">
      <div className="card-sec-h">
        <div className="t">
          <span className="ico">
            <Icon name="layout-grid" size={15} />
          </span>
          구역
        </div>
        <div className="r">
          <button type="button" className="btn pri" style={SMALL_BTN} disabled={!canAdd} onClick={onAdd}>
            구역 등록
          </button>
        </div>
      </div>
      <div className="card-sec-b">
        <p className="note-box">
          <b>좌석이 남아 있는 구역은 지울 수 없습니다.</b> 좌석을 먼저 지우세요 — 구역만 지우면 화면에서는 사라지는데
          키오스크에는 계속 뜹니다.
        </p>
        <DataTable
          columns={columns}
          rows={areas}
          rowKey={(a) => String(a.id)}
          loading={loading}
          masked={false}
          emptyText={canAdd ? '구역이 없습니다.' : '관을 먼저 등록하세요.'}
        />
      </div>
    </div>
  )
}

function AreaModal({
  buildings,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  buildings: Building[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: { buildingId: number; areaCd: string; areaNm: string }) => void
}) {
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? 0)
  const [areaCd, setAreaCd] = useState('')
  const [areaNm, setAreaNm] = useState('')

  const picked = buildings.find((b) => b.id === buildingId)

  return (
    <Modal
      title="구역 등록"
      sub="코드는 등록 후 바꿀 수 없습니다 — 키오스크가 이 코드로 좌석을 찾습니다."
      confirmLabel="등록"
      busy={busy}
      error={error}
      confirmDisabled={!buildingId || !areaCd.trim() || !areaNm.trim()}
      onClose={onClose}
      onConfirm={() => onSubmit({ buildingId, areaCd: areaCd.trim(), areaNm: areaNm.trim() })}
    >
      <div className="frow">
        <label className="req">관</label>
        <select className="sel" value={buildingId} onChange={(e) => setBuildingId(Number(e.target.value))}>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.main ? '' : ` (+${b.seatCdOffset})`}
            </option>
          ))}
        </select>
      </div>
      <div className="frow">
        <label className="req">코드</label>
        <input className="inp" value={areaCd} onChange={(e) => setAreaCd(e.target.value)} maxLength={50} placeholder="예: A" />
      </div>
      <div className="frow">
        <label className="req">구역 이름</label>
        <input className="inp" value={areaNm} onChange={(e) => setAreaNm(e.target.value)} maxLength={100} placeholder="예: A구역" />
      </div>
      {picked && !picked.main && (
        <p className="note-box">
          별관이라 키오스크에는 <b>{picked.code}-{areaCd || 'A'}</b> 로 내려갑니다. 화면에는 <b>{areaCd || 'A'}</b> 로
          보입니다.
        </p>
      )}
    </Modal>
  )
}

/* ── 좌석 ───────────────────────────────────────────────── */

function SeatTab({
  areas,
  areaId,
  area,
  seats,
  busy,
  onPickArea,
  onAdd,
  onPickSpot,
  onDelete,
}: {
  areas: SeatArea[]
  areaId: number | null
  area: SeatArea | null
  seats: SeatMaster[]
  busy: boolean
  onPickArea: (id: number) => void
  onAdd: () => void
  onPickSpot: (xPos: number, yPos: number) => void
  onDelete: (s: SeatMaster) => void
}) {
  const columns: Column<SeatMaster>[] = [
    { key: 'seatCd', header: '좌석번호', width: '110px', value: (s) => s.seatCd },
    {
      key: 'kiosk',
      header: '키오스크 번호',
      width: '130px',
      value: (s) => s.kioskSeatCd,
      render: (s) =>
        s.kioskSeatCd === s.seatCd ? <span className="muted">{s.kioskSeatCd}</span> : <b>{s.kioskSeatCd}</b>,
    },
    { key: 'seatNm', header: '이름', value: (s) => s.seatNm ?? '' },
    { key: 'pos', header: '좌표', width: '100px', align: 'center', value: (s) => `${s.xPos}, ${s.yPos}` },
    {
      key: 'usable',
      header: '사용',
      width: '80px',
      align: 'center',
      value: (s) => (s.usable ? '사용' : '중지'),
      render: (s) => <span className={`st-tag${s.usable ? " on" : ""}`}>{s.usable ? '사용' : '중지'}</span>,
    },
    {
      key: 'act',
      header: '',
      width: '80px',
      align: 'right',
      value: () => '',
      render: (s) => (
        <button type="button" className="btn" style={SMALL_BTN} disabled={busy} onClick={() => onDelete(s)}>
          삭제
        </button>
      ),
    },
  ]

  return (
    <div className="card-sec">
      <div className="card-sec-h">
        <div className="t">
          <span className="ico">
            <Icon name="armchair" size={15} />
          </span>
          {area ? `${area.buildingName} ${area.areaNm}` : '좌석'}
        </div>
        <div className="r">
          {areas.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`chip${areaId === a.id ? ' on' : ''}`}
              onClick={() => onPickArea(a.id)}
            >
              {a.buildingName} {a.areaNm}
            </button>
          ))}
          <button type="button" className="btn pri" style={SMALL_BTN} disabled={areaId === null} onClick={onAdd}>
            격자로 만들기
          </button>
        </div>
      </div>
      <div className="card-sec-b">
        {seats.length > 0 && (
          <>
            <p className="note-box">
              <b>빈 칸을 누르면 그 자리에 좌석을 만듭니다.</b> 잘못 지운 자리를 되돌릴 때 쓰세요 — 지웠던 번호를
              그대로 넣으면 <b>그 좌석이 되살아나</b> 예전 배정 이력이 이어집니다.
            </p>
            <SeatSpotMap seats={seats} busy={busy} onPickSpot={onPickSpot} />
          </>
        )}
        <DataTable
          columns={columns}
          rows={seats}
          rowKey={(s) => String(s.id)}
          masked={false}
          emptyText={areaId === null ? '구역을 먼저 등록하세요.' : '좌석이 없습니다. 격자로 만드세요.'}
        />
      </div>
    </div>
  )
}

/**
 * 좌석 자리표 — <b>빈 칸을 눌러 채운다.</b>
 *
 * ★ 이게 없으면 지운 좌석을 되돌릴 방법이 화면에 없었다. 격자는 전부-아니면-전무라
 *   20석 중 17번만 다시 만들려고 1~20 을 넣으면 나머지 19개가 겹쳐서 거부된다.
 *   "17번 하나를 원래 자리에" 가 실제로 자주 생기는 일이다.
 *
 * ★ 좌표 범위는 <b>있는 좌석에서 뽑는다.</b> 격자 크기를 따로 저장하지 않기 때문인데,
 *   그래서 <b>맨 끝 줄·열을 통째로 지우면 그 자리는 표에서 사라진다</b> — 그때는
 *   「격자로 만들기」로 이어붙이는 쪽이 맞다(시작 번호를 지정할 수 있다).
 */
function SeatSpotMap({
  seats,
  busy,
  onPickSpot,
}: {
  seats: SeatMaster[]
  busy: boolean
  onPickSpot: (xPos: number, yPos: number) => void
}) {
  const maxX = Math.max(...seats.map((s) => s.xPos))
  const maxY = Math.max(...seats.map((s) => s.yPos))
  const byPos = new Map(seats.map((s) => [`${s.xPos}:${s.yPos}`, s]))

  const rows = []
  for (let y = 1; y <= maxY; y++) {
    const cells = []
    for (let x = 1; x <= maxX; x++) {
      const seat = byPos.get(`${x}:${y}`)
      cells.push(
        seat ? (
          <div key={x} className="sgp-cell taken" title={seat.seatNm ?? seat.seatCd}>
            {seat.seatCd}
          </div>
        ) : (
          <button
            key={x}
            type="button"
            className="sgp-cell empty"
            disabled={busy}
            onClick={() => onPickSpot(x, y)}
            title={`${x}, ${y} 자리에 좌석 만들기`}
          >
            +
          </button>
        ),
      )
    }
    rows.push(
      <div className="sgp-row" key={y}>
        {cells}
      </div>,
    )
  }
  return <div className="sgp">{rows}</div>
}

/**
 * 좌석 단건 등록.
 *
 * <p>자리(좌표)는 이미 정해져 있고 <b>번호만 받는다</b> — 빈 칸을 눌러서 들어왔기 때문이다.
 * 좌표까지 입력하게 하면 배치도에서 고른 의미가 없어진다.
 */
function SeatModal({
  area,
  spot,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  area: SeatArea | null
  spot: { xPos: number; yPos: number }
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: { seatCd: string; seatNm?: string; xPos: number; yPos: number }) => void
}) {
  const [seatCd, setSeatCd] = useState('')

  return (
    <Modal
      title="좌석 만들기"
      sub={`${area ? `${area.buildingName} ${area.areaNm} · ` : ''}${spot.yPos}행 ${spot.xPos}열 자리`}
      confirmLabel="등록"
      busy={busy}
      error={error}
      confirmDisabled={!seatCd.trim()}
      onClose={onClose}
      onConfirm={() =>
        onSubmit({ seatCd: seatCd.trim(), xPos: spot.xPos, yPos: spot.yPos })
      }
    >
      <div className="frow">
        <label className="req">좌석번호</label>
        <input
          className="inp"
          value={seatCd}
          onChange={(e) => setSeatCd(e.target.value)}
          maxLength={50}
          placeholder="예: 17"
          autoFocus
        />
      </div>
      <p className="note-box">
        <b>지웠던 번호를 그대로 넣으면 그 좌석이 되살아납니다.</b> 새로 만들지 않고 예전 행을 되살리기 때문에
        그 자리에 앉았던 배정 이력이 끊기지 않습니다.
      </p>
    </Modal>
  )
}

function GridModal({
  area,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  area: SeatArea | null
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: {
    rows: number
    columns: number
    seatCdPrefix?: string
    startNumber?: number
    numberPadding?: number
    columnMajor?: boolean
    skips?: { row: number; column: number }[]
  }) => void
}) {
  const [rows, setRows] = useState(4)
  const [columns, setColumns] = useState(5)
  const [prefix, setPrefix] = useState('')
  const [startNumber, setStartNumber] = useState(1)
  const [padding, setPadding] = useState(2)
  const [columnMajor, setColumnMajor] = useState(false)
  /** 통로. 격자를 눌러 뺀다 — 행·열을 숫자로 적게 하면 어디를 뺐는지 안 보인다 */
  const [skips, setSkips] = useState<string[]>([])

  const toggleSkip = (r: number, c: number) => {
    const key = `${r}:${c}`
    setSkips((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const total = rows * columns - skips.length
  const pad = (n: number) => String(n).padStart(padding, '0')

  /** 번호가 실제로 어떻게 붙는지 미리 보여준다 — 만든 뒤에 알면 지우고 다시 만들어야 한다 */
  const preview: string[][] = []
  {
    let n = startNumber
    const grid: (string | null)[][] = Array.from({ length: rows }, () => Array(columns).fill(null))
    const outer = columnMajor ? columns : rows
    const inner = columnMajor ? rows : columns
    for (let o = 1; o <= outer; o++) {
      for (let i = 1; i <= inner; i++) {
        const r = columnMajor ? i : o
        const c = columnMajor ? o : i
        if (skips.includes(`${r}:${c}`)) continue
        grid[r - 1][c - 1] = prefix + pad(n++)
      }
    }
    preview.push(...grid.map((row) => row.map((v) => v ?? '')))
  }

  return (
    <Modal
      title="좌석 격자로 만들기"
      sub={area ? `${area.buildingName} ${area.areaNm}` : undefined}
      confirmLabel={`${total}석 등록`}
      busy={busy}
      error={error}
      confirmDisabled={total < 1}
      onClose={onClose}
      onConfirm={() =>
        onSubmit({
          rows,
          columns,
          seatCdPrefix: prefix || undefined,
          startNumber,
          numberPadding: padding,
          columnMajor,
          skips: skips.map((k) => {
            const [r, c] = k.split(':').map(Number)
            return { row: r, column: c }
          }),
        })
      }
    >
      <div className="frow">
        <label className="req">행 × 열</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="inp"
            type="number"
            min={1}
            max={50}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
          <span>×</span>
          <input
            className="inp"
            type="number"
            min={1}
            max={50}
            value={columns}
            onChange={(e) => setColumns(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="frow">
        <label>번호 접두어</label>
        <input
          className="inp"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          maxLength={20}
          placeholder="없으면 비움"
        />
      </div>
      <div className="frow">
        <label className="req">시작 번호 · 자릿수</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="inp"
            type="number"
            min={1}
            value={startNumber}
            onChange={(e) => setStartNumber(Number(e.target.value))}
          />
          <input
            className="inp"
            type="number"
            min={1}
            max={5}
            value={padding}
            onChange={(e) => setPadding(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="frow">
        <label className="req">번호 방향</label>
        <select
          className="sel"
          value={columnMajor ? 'col' : 'row'}
          onChange={(e) => setColumnMajor(e.target.value === 'col')}
        >
          <option value="row">가로 우선 — 1행을 다 채우고 2행으로</option>
          <option value="col">세로 우선 — 1열을 다 채우고 2열로</option>
        </select>
      </div>

      <p className="note-box">
        <b>통로는 눌러서 빼세요.</b> 뺀 칸은 좌석을 만들지 않고 번호는 그 칸을 건너뛰고 이어집니다.
      </p>
      <div className="sgp">
        {preview.map((row, ri) => (
          <div className="sgp-row" key={ri}>
            {row.map((label, ci) => {
              const skipped = skips.includes(`${ri + 1}:${ci + 1}`)
              return (
                <button
                  key={ci}
                  type="button"
                  className={`sgp-cell${skipped ? ' off' : ''}`}
                  onClick={() => toggleSkip(ri + 1, ci + 1)}
                  title={skipped ? '통로 — 눌러서 좌석으로' : '좌석 — 눌러서 통로로'}
                >
                  {skipped ? '통로' : label}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </Modal>
  )
}
