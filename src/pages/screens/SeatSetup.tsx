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
  updateSeatStyles,
  createSeatMaster,
  deleteBuilding,
  deleteSeatArea,
  deleteSeatMaster,
  deleteSeatMasters,
  listBuildings,
  listSeatAreas,
  listSeatMasters,
  updateBuilding,
  updateSeatArea,
  type Building,
  type SeatArea,
  type SeatMaster,
  SEAT_STYLE_LABEL,
  type SeatStyle,
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
  const [modal, setModal] = useState<null | 'building' | 'area' | 'grid' | 'seat' | 'styles'>(null)
  /** 단건 등록이 채울 빈칸. 배치도에서 그 자리를 눌러서 정한다 */
  const [spot, setSpot] = useState<{ xPos: number; yPos: number } | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  /* 삭제는 한 번 묻는다 — 누르자마자 지워졌고, 좌석을 지우면 배치도에 구멍이 남는다 */
  const [delAsk, setDelAsk] = useState<{ title: string; sub: string; run: () => Promise<unknown> } | null>(null)


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
          onDelete={(b) =>
            setDelAsk({ title: `${b.name}을 삭제할까요?`, sub: '삭제 후에는 되돌릴 수 없습니다. 하위 구역이 남아 있으면 삭제가 진행되지 않습니다.', run: () => deleteBuilding(b.id) })
          }
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
          onDelete={(a) =>
            setDelAsk({ title: `${a.buildingName} ${a.areaCd} 구역을 삭제할까요?`, sub: '삭제 후에는 되돌릴 수 없습니다. 좌석이 남아 있으면 삭제가 진행되지 않습니다.', run: () => deleteSeatArea(a.id) })
          }
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
          onEditStyles={() => {
            setModalError(null)
            setModal('styles')
          }}
          onPickSpot={(xPos, yPos) => {
            setModalError(null)
            setSpot({ xPos, yPos })
            setModal('seat')
          }}
          onDelete={(s) =>
            setDelAsk({
              title: `${s.seatCd} 좌석을 삭제할까요?`,
              sub: '삭제 후에는 되돌릴 수 없습니다. 배치도에서 해당 자리는 빈칸으로 표시됩니다.',
              run: () => deleteSeatMaster(s.id),
            })
          }
          /* ★ 확인 모달은 **단건과 같은 것을 쓴다.** 일괄만 다른 길로 지우면
             「되돌릴 수 없습니다」를 한쪽에서만 보게 된다 */
          onBulkDelete={(title, sub, seatIds) =>
            setDelAsk({ title, sub, run: () => deleteSeatMasters(areaId!, seatIds) })
          }
        />
      )}

      {delAsk && (
        <Modal
          title={delAsk.title}
          sub={delAsk.sub}
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={() => void act(delAsk.run).then(() => setDelAsk(null))}
          onClose={() => setDelAsk(null)}
        />
      )}

      {modal === 'building' && (
        <BuildingModal
          buildings={buildings}
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

      {modal === 'styles' && areaId !== null && (
        <StyleModal
          area={area}
          busy={busy}
          error={modalError}
          onClose={() => setModal(null)}
          onSubmit={(body) => submit(() => updateSeatStyles({ studyAreaId: areaId, ...body }))}
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
      width: '152px',
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
        <div className="note-box">
          <div className="ic">
            <Icon name="info" size={17} />
          </div>
          <div>
            별관은 본관과 <b>같은 구역명·좌석번호</b>를 사용할 수 있습니다. 키오스크로 전송할 때만 번호대가
            더해지며, 데스크 화면에는 본래 번호로 표시됩니다.
          </div>
        </div>
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
  onSubmit: (body: { code: string; name: string; sortOrder?: number; seatCdOffset?: number }) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [annex, setAnnex] = useState(false)

  /* ★ 번호대는 **기존 별관을 보고** 정해야 한다. 늘 1000 으로 두면 별관을 두 개 만들었을 때
   *   둘 다 1000 이 되고, 두 번째 별관에는 좌석을 한 자리도 못 만든다 —
   *   키오스크 번호가 겹쳐 UNIQUE (academy_id, kiosk_seat_cd) 에 걸린다.
   *   등록 후에는 못 바꾸는 값이라(facility.ts 주석) 그때 가서 고칠 수도 없다. */
  const annexes = buildings.filter((b) => !b.main)
  const nextOffset = Math.max(0, ...annexes.map((b) => b.seatCdOffset)) + 1000
  const [offset, setOffset] = useState(nextOffset)

  /** 이미 쓰는 번호대인가 — 등록을 막고 어느 관이 쓰는지 알려준다 */
  const taken = annexes.find((b) => b.seatCdOffset === offset)

  return (
    <Modal
      title="관 등록"
      sub="본관과 별관을 구분합니다. 코드와 번호대는 등록 후 수정할 수 없습니다."
      confirmLabel="등록"
      busy={busy}
      error={error}
      confirmDisabled={!code.trim() || !name.trim() || (annex && (offset < 1000 || taken !== undefined))}
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
        <div>
          <select className="sel" value={annex ? 'annex' : 'main'} onChange={(e) => setAnnex(e.target.value === 'annex')}>
            <option value="main">본관</option>
            <option value="annex">별관</option>
          </select>
          <div className="hint">
            별관은 본관과 같은 좌석번호를 사용할 수 있습니다. 키오스크로 전송할 때만 번호대가 더해집니다.
          </div>
        </div>
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
              /* ⚠️ `step` 을 걸지 않는다. Modal 이 form 이라 배수가 아닌 값(1500)은
                 **브라우저가 제출을 막는다** — 요청도 오류도 안 뜨고 「저장이 안 된다」로 보인다 */
              onChange={(e) => setOffset(Number(e.target.value))}
            />
          </div>
          <div className="note-box">
            <div className="ic">
              <Icon name="info" size={17} />
            </div>
            <div>
              이 관의 <b>1번 좌석</b>이 키오스크에서 <b>{offset + 1}번</b>이 됩니다. 데스크 화면에는 계속 1번으로
              보입니다.
              <br />
              1000 미만은 입력할 수 없습니다 — 100이면 본관 101번과 번호가 겹칩니다.
              {taken && (
                <>
                  <br />
                  <b style={{ color: 'var(--red)' }}>
                    {taken.name}이(가) 사용 중인 번호대입니다. 다른 번호대를 입력하세요.
                  </b>
                </>
              )}
            </div>
          </div>
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
      width: '152px',
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
        <div className="note-box">
          <div className="ic">
            <Icon name="info" size={17} />
          </div>
          <div>
            <b>좌석이 남아 있는 구역은 지울 수 없습니다.</b> 좌석을 먼저 지우세요 — 구역만 지우면 화면에서는 사라지는데
            키오스크에는 계속 뜹니다.
          </div>
        </div>
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
        <div className="note-box">
          <div className="ic">
            <Icon name="info" size={17} />
          </div>
          <div>
            별관이라 키오스크에는 <b>{picked.code}-{areaCd || 'A'}</b> 로 내려갑니다. 화면에는 <b>{areaCd || 'A'}</b> 로
            보입니다.
          </div>
        </div>
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
  onEditStyles,
  onPickSpot,
  onDelete,
  onBulkDelete,
}: {
  areas: SeatArea[]
  areaId: number | null
  area: SeatArea | null
  seats: SeatMaster[]
  busy: boolean
  onPickArea: (id: number) => void
  onAdd: () => void
  onEditStyles: () => void
  onPickSpot: (xPos: number, yPos: number) => void
  onDelete: (s: SeatMaster) => void
  /** `seatIds` 가 비면 그 구역 전체(= 초기화) */
  onBulkDelete: (title: string, sub: string, seatIds: number[]) => void
}) {
  /* ★ 좌석 다중 선택(1016 피드백 B-4). `DataTable` 체크박스는 **제어 컴포넌트**라
     `selected` 와 `onSelectedChange` 를 같이 줘야 눌린다(CLAUDE.md 5-1) */
  const [picked, setPicked] = useState<string[]>([])

  /* 구역을 옮기면 비운다 — 안 비우면 **다른 구역에서 고른 좌석이 일괄 삭제에 섞인다** */
  useEffect(() => {
    setPicked([])
  }, [areaId])
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
    {
      key: 'style',
      header: '형태',
      width: '84px',
      align: 'center',
      value: (s) => (s.seatStyle ? SEAT_STYLE_LABEL[s.seatStyle] : ''),
      /* ★ 교실형은 배지를 안 붙인다 — 대부분이 교실형이라 다 붙이면 1인실이 안 보인다 */
      render: (s) =>
        s.seatStyle === undefined || s.seatStyle === null || s.seatStyle === 'CLASSROOM' ? (
          <span className="muted">{s.seatStyle ? SEAT_STYLE_LABEL[s.seatStyle] : '-'}</span>
        ) : (
          <span className={`mk ${s.seatStyle === 'SINGLE_ROOM' ? 'brandnew' : 'supplement'}`}>
            {SEAT_STYLE_LABEL[s.seatStyle]}
          </span>
        ),
    },
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
      width: '196px',
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
          {/* ★ **이미 만든 좌석**의 형태를 바꾼다. 지웠다 다시 만들면 배정 이력이 끊긴다 */}
          <button
            type="button"
            className="btn"
            style={SMALL_BTN}
            disabled={areaId === null || seats.length === 0}
            onClick={onEditStyles}
          >
            형태 바꾸기
          </button>
          {/* ★ 일괄 삭제·초기화(B-4). 단건을 N번 부르면 92석 구역에서 **중간에 실패했을 때
              절반만 지워진 배치도**가 남는다 — 무엇이 남았는지 사람이 찾을 수 없다 */}
          <button
            type="button"
            className="btn"
            style={{ ...SMALL_BTN, color: 'var(--red)' }}
            disabled={picked.length === 0 || busy}
            onClick={() => {
              onBulkDelete(
                `선택한 좌석 ${picked.length}개를 삭제할까요?`,
                '삭제 후에는 되돌릴 수 없습니다. 선택한 좌석 중 배정된 좌석이 하나라도 있으면 삭제가 진행되지 않습니다.',
                picked.map(Number),
              )
              setPicked([])
            }}
          >
            선택 삭제{picked.length > 0 ? ` ${picked.length}` : ''}
          </button>
          <button
            type="button"
            className="btn"
            style={{ ...SMALL_BTN, color: 'var(--red)' }}
            disabled={areaId === null || seats.length === 0 || busy}
            onClick={() => {
              onBulkDelete(
                `${area?.areaNm ?? '이 구역'}의 좌석 ${seats.length}개를 모두 삭제할까요?`,
                '삭제 후에는 되돌릴 수 없습니다. 배정된 좌석이 하나라도 있으면 삭제가 진행되지 않습니다.',
                [],
              )
              setPicked([])
            }}
          >
            구역 초기화
          </button>
        </div>
      </div>
      <div className="card-sec-b">
        {seats.length > 0 && (
          <>
            <div className="note-box">
              <div className="ic">
                <Icon name="info" size={17} />
              </div>
              <div>
                빈칸을 누르면 좌석이 생성되고, 좌석을 누르면 삭제됩니다. 삭제한 좌석과 동일한 번호로 다시
                생성하면 기존 배정 이력이 유지됩니다.
              </div>
            </div>
            <SeatSpotMap seats={seats} busy={busy} onPickSpot={onPickSpot} onRemoveSeat={onDelete} />
          </>
        )}
        <DataTable
          columns={columns}
          rows={seats}
          rowKey={(s) => String(s.id)}
          masked={false}
          selectable
          selected={picked}
          onSelectedChange={setPicked}
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
  onRemoveSeat,
}: {
  seats: SeatMaster[]
  busy: boolean
  onPickSpot: (xPos: number, yPos: number) => void
  /** ★ **토글이다**(1016 피드백 B-3) — 「만들어진 좌석을 눌러서 지우는 기능도 있었으면」 */
  onRemoveSeat: (seat: SeatMaster) => void
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
          /* ★ 좌석도 **누르면 지운다**(B-3). 전에는 표까지 내려가 그 줄을 찾아야 했다 —
             배치도에서 보고 있는데 지우는 자리가 다른 곳에 있으면 눈이 두 번 움직인다 */
          <button
            key={x}
            type="button"
            className="sgp-cell taken"
            disabled={busy}
            onClick={() => onRemoveSeat(seat)}
            title={`${seat.seatNm ?? seat.seatCd} — 누르면 지웁니다`}
          >
            {seat.seatCd}
          </button>
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
      <div className="note-box">
        <div className="ic">
          <Icon name="info" size={17} />
        </div>
        <div>
          <b>지웠던 번호를 그대로 넣으면 그 좌석이 되살아납니다.</b> 새로 만들지 않고 예전 행을 되살리기 때문에
          그 자리에 앉았던 배정 이력이 끊기지 않습니다.
        </div>
      </div>
    </Modal>
  )
}

/**
 * 이미 만든 좌석의 형태를 **범위로** 바꾼다.
 *
 * ⚠️⚠️ **좌석을 지웠다 다시 만들지 않는다.** 그러면 `seat_assignment` 가 참조하던 행이
 *   바뀌어 **배정 이력이 끊긴다.** 형태만 바꿀 때는 이 길이다.
 */
function StyleModal({
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
    ranges: { fromNumber: number; toNumber: number; seatStyle: SeatStyle }[]
    defaultStyle?: SeatStyle
  }) => void
}) {
  const [ranges, setRanges] = useState<{ from: string; to: string; style: SeatStyle }[]>([
    { from: '', to: '', style: 'SINGLE_ROOM' },
  ])
  const [defaultStyle, setDefaultStyle] = useState<SeatStyle | ''>('')

  const filled = ranges.filter((r) => r.from !== '' && r.to !== '')
  const badRange = filled.find((r) => Number(r.from) > Number(r.to))
  const overlap = filled.find((r, i) =>
    filled.some((o, j) => j !== i && Number(r.from) <= Number(o.to) && Number(o.from) <= Number(r.to)),
  )
  const rangeError =
    badRange !== undefined
      ? '시작 번호가 끝 번호보다 큽니다.'
      : overlap !== undefined
        ? '번호 범위가 서로 겹칩니다.'
        : null

  return (
    <Modal
      title="좌석 형태 바꾸기"
      sub={area ? `${area.buildingName} ${area.areaNm}` : undefined}
      confirmLabel="형태 적용"
      busy={busy}
      error={error}
      confirmDisabled={filled.length === 0 || rangeError !== null}
      onClose={onClose}
      onConfirm={() =>
        onSubmit({
          ranges: filled.map((r) => ({
            fromNumber: Number(r.from),
            toNumber: Number(r.to),
            seatStyle: r.style,
          })),
          defaultStyle: defaultStyle === '' ? undefined : defaultStyle,
        })
      }
    >
      <div className="frow">
        <label className="req">형태 범위</label>
        <div>
          {ranges.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input
                className="inp"
                type="number"
                min={1}
                style={{ width: 84, textAlign: 'center' }}
                value={r.from}
                onChange={(e) => setRanges((v) => v.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
              />
              <span>~</span>
              <input
                className="inp"
                type="number"
                min={1}
                style={{ width: 84, textAlign: 'center' }}
                value={r.to}
                onChange={(e) => setRanges((v) => v.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
              />
              <select
                className="sel"
                style={{ width: 110 }}
                value={r.style}
                onChange={(e) =>
                  setRanges((v) => v.map((x, j) => (j === i ? { ...x, style: e.target.value as SeatStyle } : x)))
                }
              >
                {(Object.keys(SEAT_STYLE_LABEL) as SeatStyle[]).map((k) => (
                  <option key={k} value={k}>
                    {SEAT_STYLE_LABEL[k]}
                  </option>
                ))}
              </select>
              <button type="button" className="lnk" onClick={() => setRanges((v) => v.filter((_, j) => j !== i))}>
                빼기
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => setRanges((v) => [...v, { from: '', to: '', style: 'SINGLE_ROOM' }])}
          >
            <Icon name="plus" size={13} /> 범위 추가
          </button>
          {rangeError !== null && (
            <div className="hint" style={{ color: 'var(--red)' }}>
              {rangeError}
            </div>
          )}
        </div>
      </div>
      <div className="frow">
        <label>나머지 좌석</label>
        <div>
          <select
            className="sel"
            value={defaultStyle}
            onChange={(e) => setDefaultStyle(e.target.value as SeatStyle | '')}
          >
            <option value="">그대로 둡니다</option>
            {(Object.keys(SEAT_STYLE_LABEL) as SeatStyle[]).map((k) => (
              <option key={k} value={k}>
                {SEAT_STYLE_LABEL[k]} 으로 바꿉니다
              </option>
            ))}
          </select>
          <div className="hint">범위에 없는 좌석을 어떻게 할지 고릅니다.</div>
        </div>
      </div>
      <div className="note-box">
        <div>
          좌석을 지우지 않고 <b>형태만</b> 바꿉니다. 배정과 이용 기록은 그대로 남습니다.
        </div>
      </div>
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
    reverseX?: boolean
    reverseY?: boolean
    seatStyle?: SeatStyle
    styleRanges?: { fromNumber: number; toNumber: number; seatStyle: SeatStyle }[]
    skips?: { row: number; column: number }[]
  }) => void
}) {
  const [rows, setRows] = useState(4)
  const [columns, setColumns] = useState(5)
  const [prefix, setPrefix] = useState('')
  const [startNumber, setStartNumber] = useState(1)
  const [padding, setPadding] = useState(2)
  const [columnMajor, setColumnMajor] = useState(false)
  /* ★ **번호 붙는 순서**를 뒤집는다 — 좌표가 아니다. 대구 A(가로 역방향)·동탄 별관 C
     (가로·세로 둘 다)가 이것으로만 나온다. 없으면 **지점이 그 모양을 못 만든다** */
  const [reverseX, setReverseX] = useState(false)
  const [reverseY, setReverseY] = useState(false)
  /** 범위 밖 좌석의 형태 */
  const [baseStyle, setBaseStyle] = useState<SeatStyle>('CLASSROOM')
  /** 「1~6 1인실」처럼 **범위로** 지정한다. 한 칸씩 찍으면 2,140석을 손으로 지정하게 된다 */
  const [ranges, setRanges] = useState<{ from: string; to: string; style: SeatStyle }[]>([])
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
    /* ★ 역방향은 **세는 순서만** 뒤집는다. 격자 모양은 그대로다 —
       `reverseX` 는 열(가로), `reverseY` 는 행(세로)이다 */
    for (let oi = 1; oi <= outer; oi++) {
      const o = columnMajor ? (reverseX ? columns - oi + 1 : oi) : reverseY ? rows - oi + 1 : oi
      for (let ii = 1; ii <= inner; ii++) {
        const i = columnMajor ? (reverseY ? rows - ii + 1 : ii) : reverseX ? columns - ii + 1 : ii
        const r = columnMajor ? i : o
        const c = columnMajor ? o : i
        if (skips.includes(`${r}:${c}`)) continue
        grid[r - 1][c - 1] = prefix + pad(n++)
      }
    }
    preview.push(...grid.map((row) => row.map((v) => v ?? '')))
  }

  /** 미리보기 칸의 형태. 번호(접두어를 뗀 끝 숫자)로 범위를 판정한다 — 서버와 같은 규칙이다 */
  function styleOf(label: string): SeatStyle {
    const num = Number((label.match(/(\d+)$/) ?? [])[1])
    if (Number.isNaN(num)) return baseStyle
    const hit = ranges.find(
      (r) => r.from !== '' && r.to !== '' && num >= Number(r.from) && num <= Number(r.to),
    )
    return hit?.style ?? baseStyle
  }

  /* ⚠️ **겹치거나 뒤집힌 범위는 서버가 거부한다.** 보내고 나서 알면 다시 입력하게 되므로
     여기서 먼저 센다 — 겹침을 허용하면 「먼저 쓴 쪽이 이기는」 숨은 규칙이 생긴다 */
  const filled = ranges.filter((r) => r.from !== '' && r.to !== '')
  const badRange = filled.find((r) => Number(r.from) > Number(r.to))
  const overlap = filled.find((r, i) =>
    filled.some(
      (o, j) => j !== i && Number(r.from) <= Number(o.to) && Number(o.from) <= Number(r.to),
    ),
  )
  const rangeError =
    badRange !== undefined
      ? '시작 번호가 끝 번호보다 큽니다.'
      : overlap !== undefined
        ? '번호 범위가 서로 겹칩니다.'
        : null

  return (
    <Modal
      title="좌석 격자로 만들기"
      sub={area ? `${area.buildingName} ${area.areaNm}` : undefined}
      confirmLabel={`${total}석 등록`}
      busy={busy}
      error={error}
      confirmDisabled={total < 1 || rangeError !== null}
      onClose={onClose}
      onConfirm={() =>
        onSubmit({
          rows,
          columns,
          seatCdPrefix: prefix || undefined,
          startNumber,
          numberPadding: padding,
          columnMajor,
          reverseX,
          reverseY,
          seatStyle: baseStyle,
          styleRanges: filled.map((r) => ({
            fromNumber: Number(r.from),
            toNumber: Number(r.to),
            seatStyle: r.style,
          })),
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
      {/* ★ 좌표가 아니라 **번호 붙는 순서**를 뒤집는다. 미리보기에서 바로 보인다 —
             번호가 거꾸로 붙는 것을 눈으로 봐야 실수를 알아챈다 */}
      <div className="frow">
        <label>번호 역방향</label>
        <div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 14 }}>
            <input type="checkbox" checked={reverseX} onChange={(e) => setReverseX(e.target.checked)} />
            가로 — 오른쪽에서 왼쪽으로
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={reverseY} onChange={(e) => setReverseY(e.target.checked)} />
            세로 — 아래에서 위로
          </label>
          <div className="hint">자리 위치는 그대로이고 번호 붙는 순서만 바뀝니다.</div>
        </div>
      </div>
      <div className="frow">
        <label className="req">좌석 형태</label>
        <div>
          <select className="sel" value={baseStyle} onChange={(e) => setBaseStyle(e.target.value as SeatStyle)}>
            {(Object.keys(SEAT_STYLE_LABEL) as SeatStyle[]).map((k) => (
              <option key={k} value={k}>
                {SEAT_STYLE_LABEL[k]}
              </option>
            ))}
          </select>
          <div className="hint">아래에서 범위를 지정하지 않은 자리에 적용됩니다.</div>
        </div>
      </div>
      {/* ★ 디랩이 준 자료가 「1~6 1인실 · 7~57 교실형」 **범위 형태**다. 한 칸씩 찍게 하면
             2,140석을 손으로 지정하게 된다 */}
      <div className="frow">
        <label>형태 범위</label>
        <div>
          {ranges.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input
                className="inp"
                type="number"
                min={1}
                style={{ width: 84, textAlign: 'center' }}
                value={r.from}
                onChange={(e) =>
                  setRanges((v) => v.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))
                }
              />
              <span>~</span>
              <input
                className="inp"
                type="number"
                min={1}
                style={{ width: 84, textAlign: 'center' }}
                value={r.to}
                onChange={(e) => setRanges((v) => v.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
              />
              <select
                className="sel"
                style={{ width: 110 }}
                value={r.style}
                onChange={(e) =>
                  setRanges((v) =>
                    v.map((x, j) => (j === i ? { ...x, style: e.target.value as SeatStyle } : x)),
                  )
                }
              >
                {(Object.keys(SEAT_STYLE_LABEL) as SeatStyle[]).map((k) => (
                  <option key={k} value={k}>
                    {SEAT_STYLE_LABEL[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="lnk"
                onClick={() => setRanges((v) => v.filter((_, j) => j !== i))}
              >
                빼기
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => setRanges((v) => [...v, { from: '', to: '', style: 'SINGLE_ROOM' }])}
          >
            <Icon name="plus" size={13} /> 범위 추가
          </button>
          {rangeError !== null && (
            <div className="hint" style={{ color: 'var(--red)' }}>
              {rangeError}
            </div>
          )}
          <div className="hint">번호로 지정합니다. 접두어가 있어도 숫자만 보면 됩니다.</div>
        </div>
      </div>

      <div className="note-box">
        <div className="ic">
          <Icon name="info" size={17} />
        </div>
        <div>
          <b>통로는 눌러서 빼세요.</b> 뺀 칸은 좌석을 만들지 않고 번호는 그 칸을 건너뛰고 이어집니다.
        </div>
      </div>
      <div className="sgp">
        {preview.map((row, ri) => (
          <div className="sgp-row" key={ri}>
            {row.map((label, ci) => {
              const skipped = skips.includes(`${ri + 1}:${ci + 1}`)
              return (
                <button
                  key={ci}
                  type="button"
                  className={`sgp-cell${skipped ? ' off' : ` st-${styleOf(label).toLowerCase()}`}`}
                  onClick={() => toggleSkip(ri + 1, ci + 1)}
                  title={
                    skipped
                      ? '통로 — 눌러서 좌석으로'
                      : `${SEAT_STYLE_LABEL[styleOf(label)]} — 눌러서 통로로`
                  }
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
