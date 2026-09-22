import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Modal, ExcelButton, type Column, toDateStr } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  HOLIDAY_TYPE_LABEL,
  createHoliday,
  deleteHoliday,
  listHolidays,
  updateHoliday,
  type Holiday,
  type HolidayType,
} from '../../api/holidays'
import {
  ANNUAL_EVENT_TYPE_LABEL,
  copyAnnualEventsYear,
  createAnnualEvent,
  deleteAnnualEvent,
  listAnnualEvents,
  updateAnnualEvent,
  type AnnualEvent,
  type AnnualEventType,
} from '../../api/annualEvents'
import type { Mockup } from './types'
import { createScreenSignal } from './screenSignal'
import '../../styles/forms.css'

/* F-4.11-10 연간 행사 마스터 → 학습계획 반영 — /api/v1/admin/holidays + /annual-events
 *
 * 두 도메인을 **한 목록**으로 보여준다(2026-09-21 — 행사 도메인이 생겼다, API_GAPS 16-1·16-2).
 *   · 쉬는 날(휴일) — 공휴일·대체·임시·학원 휴원. 교습일수·급식·**학습계획 차단**(`planExcluded`)에 쓰인다
 *   · 행사 — 학원 행사·시험·휴일 행사·기타. 달력에 **보여주기만** 한다(`showInPlan`). 계산에는 안 쓴다
 * 등록 폼은 유형을 고르면 알맞은 쪽으로 보낸다.
 *
 * ⚠ **휴일은 하루짜리다.** 연휴는 날짜 수만큼 행이 생긴다 — N번 호출이라 중간에 실패하면 일부만
 *   등록된다. 건별 결과를 알린다. 행사는 기간을 한 줄로 받는다.
 *
 * ⚠ **본사가 지점 휴일을 못 본다**(실측). 본사 계정으로는 전 지점 공통만 보이고
 *   `academyId` 파라미터도 무시된다 — 본사는 "분당이 7/15 쉰다"를 모른다(API_GAPS 16-3). */

const TYPE_TONE: Record<HolidayType, string> = {
  PUBLIC: 'brandnew',
  SUBSTITUTE: 'brandnew',
  TEMPORARY: 'supplement',
  ACADEMY: 'brandnew',
}

const TYPE_COLOR: Record<HolidayType, string> = {
  PUBLIC: 'var(--red)',
  SUBSTITUTE: 'var(--red)',
  TEMPORARY: 'var(--amber)',
  ACADEMY: 'var(--violet)',
}

/* 행사 쪽 색 — 휴일 색과 겹치지 않게 */
const EVENT_TONE: Record<AnnualEventType, string> = {
  ACADEMY: 'supplement',
  EXAM: 'verified',
  HOLIDAY_EVENT: 'brandnew',
  ETC: '',
}
const EVENT_COLOR: Record<AnnualEventType, string> = {
  ACADEMY: 'var(--blue)',
  EXAM: 'var(--green)',
  HOLIDAY_EVENT: 'var(--amber)',
  ETC: 'var(--muted)',
}

/** 휴일과 행사를 한 표에 놓기 위한 공통 줄 */
type Row =
  | { kind: 'holiday'; key: string; from: string; to: string; name: string; nationwide: boolean; h: Holiday }
  | { kind: 'event'; key: string; from: string; to: string; name: string; nationwide: boolean; e: AnnualEvent }

/** 등록 폼의 유형 — 앞 넷은 휴일, 뒤 넷은 행사 */
type FormType = `H:${HolidayType}` | `E:${AnnualEventType}`

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

const TODAY_YEAR = new Date().getFullYear()

/** 하루씩 늘려 날짜 배열을 만든다. 서버가 하루짜리만 받아서 기간 입력을 쪼개야 한다 */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  const end = new Date(`${to}T00:00:00Z`)
  for (const d = new Date(`${from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(toDateStr(d))
  }
  return out
}

function Content() {
  const { academyId, academies } = useAcademy()
  const [tab, setTab] = useState('list')
  const [year, setYear] = useState(TODAY_YEAR)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [events, setEvents] = useState<AnnualEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** 삭제 확인 모달. null 이면 닫힌 상태 */
  const [removing, setRemoving] = useState<Row | null>(null)
  /*
   * 수정 — 이름·날짜·유형(·비고)을 고친다. 전에는 표시/차단 전환과 삭제만 있어서 설명회 날짜가
   * 밀리면 지우고 다시 넣어야 했다. 서버는 둘 다 고칠 수 있었다(PATCH).
   * ★ 쉬는 날은 하루 한 줄이라 날짜 하나, 행사는 기간.
   * ★ 해를 넘겨 옮기지 않는다 — 목록이 연도로 나뉘어 있어 옮긴 줄이 '사라진' 것처럼 보인다
   */
  const [editing, setEditing] = useState<{
    row: Row
    name: string
    from: string
    to: string
    type: string
    memo: string
    error: string | null
  } | null>(null)
  const [result, setResult] = useState<string | null>(null)
  /*
   * 전년도 복사 — 행사만 옮긴다(`/annual-events/copy-year`). 쉬는 날(휴일)은 옮기지 않는다.
   * ★ 같은 이름·시작일은 건너뛰어 두 번 눌러도 두 벌이 되지 않는다. 헤더 버튼은 신호로 이 창을 연다
   */
  const [copyAsk, setCopyAsk] = useState(false)
  const copyVer = copySignal.useVersion()
  useEffect(() => {
    if (copyVer > 0) setCopyAsk(true)
  }, [copyVer])

  async function copyYear() {
    // 헤더 버튼은 지점을 안 골라도 창을 연다 — 조용히 멈추면 '복사'가 안 먹는 것처럼 보인다
    if (academyId === null) {
      setResult('먼저 위에서 지점을 고르세요.')
      setCopyAsk(false)
      return
    }
    setBusy(true)
    try {
      const r = await copyAnnualEventsYear({ academyId, fromYear: year - 1, toYear: year })
      setResult(
        r.copied === 0
          ? `새로 옮길 행사가 없습니다${r.skipped ? ` — ${year - 1}년 행사 ${r.skipped}건은 이미 ${year}년에 있습니다` : ` — ${year - 1}년에 등록된 행사가 없습니다`}.`
          : `${year - 1}년 행사를 ${year}년으로 옮겼습니다 — ${r.copied}건 복사` +
              (r.skipped ? ` · ${r.skipped}건은 이미 있어 건너뜀` : '') +
              '. 날짜가 한 해 뒤로 밀렸으니 요일이 바뀐 행사는 확인하세요.',
      )
      setCopyAsk(false)
      await load()
    } catch (err) {
      setResult(err instanceof ApiError ? `복사하지 못했습니다 — ${err.message}` : '복사하지 못했습니다.')
      setCopyAsk(false)
    } finally {
      setBusy(false)
    }
  }

  /* 등록 폼 */
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState<FormType>('H:PUBLIC')
  const [blockPlan, setBlockPlan] = useState(true)
  const [showInPlan, setShowInPlan] = useState(true)
  const [memo, setMemo] = useState('')
  const isHoliday = type.startsWith('H:')
  const [nationwide, setNationwide] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 한쪽이 실패해도 다른 쪽은 보이게 따로 받는다
      const [h, e] = await Promise.allSettled([
        listHolidays(`${year}-01-01`, `${year}-12-31`),
        academyId === null ? Promise.resolve([] as AnnualEvent[]) : listAnnualEvents(academyId, year),
      ])
      setHolidays(h.status === 'fulfilled' ? h.value : [])
      setEvents(e.status === 'fulfilled' ? e.value : [])
      const failed = [h.status === 'rejected' && '쉬는 날', e.status === 'rejected' && '행사'].filter(Boolean)
      setLoadError(failed.length ? `${failed.join('·')} 목록을 불러오지 못했습니다.` : null)
    } finally {
      setLoading(false)
    }
  }, [year, academyId])

  const rows: Row[] = useMemo(
    () =>
      [
        ...holidays.map(
          (h): Row => ({ kind: 'holiday', key: `h${h.id}`, from: h.date, to: h.date, name: h.name, nationwide: h.nationwide, h }),
        ),
        ...events.map(
          (e): Row => ({ kind: 'event', key: `e${e.id}`, from: e.startDate, to: e.endDate, name: e.name, nationwide: e.shared, e }),
        ),
      ].sort((a, b) => a.from.localeCompare(b.from)),
    [holidays, events],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function remove(r: Row): Promise<boolean> {
    setBusy(true)
    try {
      if (r.kind === 'holiday') await deleteHoliday(r.h.id)
      else await deleteAnnualEvent(r.e.id)
      setResult(`${r.from}${r.to !== r.from ? ` ~ ${r.to}` : ''} ${r.name} 을 지웠습니다.`)
      await load()
      return true
    } catch (err) {
      setResult(err instanceof ApiError ? `지우지 못했습니다 — ${err.message}` : '지우지 못했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  /** 차단 여부만 뒤집는다. PATCH 가 date·type 을 필수로 받아 기존 값을 함께 보낸다 */
  async function toggleBlock(h: Holiday) {
    setBusy(true)
    try {
      await updateHoliday(h.id, {
        academyId: h.academyId ?? undefined,
        date: h.date,
        name: h.name,
        type: h.type,
        planExcluded: !h.planExcluded,
      })
      await load()
      setResult(null)
    } catch (err) {
      setResult(err instanceof ApiError ? `바꾸지 못했습니다 — ${err.message}` : '바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  function openEdit(r: Row) {
    setEditing(
      r.kind === 'holiday'
        ? { row: r, name: r.h.name, from: r.h.date, to: r.h.date, type: r.h.type, memo: '', error: null }
        : { row: r, name: r.e.name, from: r.e.startDate, to: r.e.endDate, type: r.e.eventType, memo: r.e.memo ?? '', error: null },
    )
  }

  async function saveEdit() {
    if (!editing) return
    const { row, name: nm, from: f, memo: mm } = editing
    const t = row.kind === 'holiday' ? f : editing.to || f
    if (t < f) return setEditing({ ...editing, error: '시작일이 종료일보다 뒤입니다.' })
    if (f.slice(0, 4) !== row.from.slice(0, 4) || t.slice(0, 4) !== row.from.slice(0, 4)) {
      return setEditing({ ...editing, error: `${row.from.slice(0, 4)}년 안에서만 고칠 수 있습니다. 다른 해로 옮기려면 지우고 새로 등록하세요.` })
    }
    setBusy(true)
    try {
      if (row.kind === 'holiday') {
        await updateHoliday(row.h.id, {
          academyId: row.h.academyId ?? undefined,
          date: f,
          name: nm.trim(),
          type: editing.type as HolidayType,
          planExcluded: row.h.planExcluded,
        })
      } else {
        // ★ memo 는 안 보내면 지워진다 — 늘 함께 보낸다
        await updateAnnualEvent(row.e.id, {
          name: nm.trim(),
          startDate: f,
          endDate: t,
          eventType: editing.type as AnnualEventType,
          memo: mm.trim(),
        })
      }
      const span = (a: string, b: string) => (b !== a ? `${a} ~ ${b}` : a)
      setResult(`수정했습니다 — ${row.name} (${span(row.from, row.to)}) → ${nm.trim()} (${span(f, t)})`)
      setEditing(null)
      await load()
    } catch (err) {
      setEditing({ ...editing, error: err instanceof ApiError ? err.message : '고치지 못했습니다.' })
    } finally {
      setBusy(false)
    }
  }

  /** 행사의 학습계획·달력 표시를 뒤집는다 */
  async function toggleShow(e: AnnualEvent) {
    setBusy(true)
    try {
      // ★ memo 는 안 보내면 지워진다 — 표시만 바꿀 때도 지금 비고를 함께 보낸다(안 그러면 숨기기 한 번에 비고가 사라졌다)
      await updateAnnualEvent(e.id, { showInPlan: !e.showInPlan, memo: e.memo ?? '' })
      await load()
      setResult(null)
    } catch (err) {
      setResult(err instanceof ApiError ? `바꾸지 못했습니다 — ${err.message}` : '바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 행사 — 기간을 한 줄로 보낸다 */
  async function submitEvent() {
    const end = to || from
    if (end < from) {
      setResult('시작일이 종료일보다 뒤입니다.')
      return
    }
    setBusy(true)
    try {
      await createAnnualEvent({
        academyId: nationwide ? undefined : (academyId ?? undefined),
        year: Number(from.slice(0, 4)),
        name: name.trim(),
        startDate: from,
        endDate: end,
        eventType: type.slice(2) as AnnualEventType,
        showInPlan,
        memo: memo.trim() || undefined,
      })
      setResult(`${name.trim()} (${from}${end !== from ? ` ~ ${end}` : ''}) 행사를 등록했습니다.`)
      setName('')
      setMemo('')
      await load()
    } catch (err) {
      setResult(err instanceof ApiError ? `등록하지 못했습니다 — ${err.message}` : '등록하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 기간을 하루씩 쪼개 N번 보낸다.
   * ★ 중간에 실패하면 앞쪽 날짜만 등록된 채로 남는다 — 그걸 안 알려주면
   *   사용자는 전부 된 줄 알고 같은 기간을 다시 넣어 409 를 만난다.
   */
  async function submit() {
    if (name.trim() === '' || from === '') return
    if (!isHoliday) return submitEvent()
    const dates = datesBetween(from, to || from)
    if (dates.length === 0) {
      setResult('시작일이 종료일보다 뒤입니다.')
      return
    }
    setBusy(true)
    const ok: string[] = []
    const fail: string[] = []
    for (const date of dates) {
      try {
        await createHoliday({
          academyId: nationwide ? undefined : (academyId ?? undefined),
          date,
          name: name.trim(),
          type: type.slice(2) as HolidayType,
          planExcluded: blockPlan,
        })
        ok.push(date)
      } catch (err) {
        fail.push(`${date} (${err instanceof ApiError ? err.message : '실패'})`)
      }
    }
    setBusy(false)
    setResult(
      fail.length === 0
        ? `${ok.length}일을 등록했습니다.`
        : `${ok.length}일 등록 · ${fail.length}일 실패 — ${fail.join(', ')}`,
    )
    if (ok.length > 0) {
      setName('')
      await load()
    }
  }

  const COLUMNS: Column<Row>[] = useMemo(
    () => [
      {
        key: 'date',
        header: '기간',
        width: '170px',
        sortable: true,
        value: (r) => (r.to !== r.from ? `${r.from} ~ ${r.to}` : r.from),
      },
      { key: 'name', header: '행사명', sortable: true, value: (r) => r.name },
      {
        key: 'type',
        header: '유형',
        width: '100px',
        align: 'center',
        sortable: true,
        value: (r) => (r.kind === 'holiday' ? HOLIDAY_TYPE_LABEL[r.h.type] ?? r.h.type : ANNUAL_EVENT_TYPE_LABEL[r.e.eventType]),
        render: (r, v) => (
          <span className={`mk ${r.kind === 'holiday' ? TYPE_TONE[r.h.type] ?? 'supplement' : EVENT_TONE[r.e.eventType]}`}>{v}</span>
        ),
      },
      {
        key: 'target',
        header: '대상',
        width: '90px',
        align: 'center',
        // 서버는 지점 단위까지만 안다. 목업의 '전체/신청자/외부' 축은 없다
        value: (r) => (r.nationwide ? '전 지점' : '지점'),
        render: (r) => (
          <span style={{ fontSize: 11.5, color: r.nationwide ? 'var(--ink)' : 'var(--muted)' }}>
            {r.nationwide ? '전 지점' : '지점'}
          </span>
        ),
      },
      {
        key: 'blockPlan',
        header: '학습계획',
        width: '110px',
        align: 'center',
        sortable: true,
        // 쉬는 날은 '차단', 행사는 '표시' 다 — 행사는 입력을 막지 않고 달력에 얹기만 한다
        value: (r) =>
          r.kind === 'holiday' ? (r.h.planExcluded ? '차단' : '영향 없음') : r.e.showInPlan ? '달력에 표시' : '숨김',
        render: (r) =>
          r.kind === 'holiday' ? (
            r.h.planExcluded ? (
              <span className="mk brandnew" title="해당일 학습계획 입력 차단">
                <Icon name="lock" size={10} /> 차단
              </span>
            ) : (
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>영향 없음</span>
            )
          ) : r.e.showInPlan ? (
            <span style={{ fontSize: 11.5 }}>달력에 표시</span>
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>숨김</span>
          ),
      },
      {
        key: 'note',
        header: '비고',
        value: (r) => (r.kind === 'event' ? (r.e.memo ?? '') : ''),
        render: (_r, v) => v || '-',
      },
      {
        key: 'act',
        header: '',
        width: '206px',
        align: 'center',
        value: () => '',
        /* 첫 버튼 글자 수가 줄마다 달라(차단 해제 · 숨기기 · 표시) 가운데 정렬이면 수정·삭제가
           줄마다 밀렸다 — 첫 버튼 폭을 '차단 해제' 에 맞춰 고정한다 */
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {r.kind === 'holiday' ? (
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5, whiteSpace: 'nowrap', minWidth: 70, justifyContent: 'center' }}
                disabled={busy}
                onClick={() => void toggleBlock(r.h)}
                title="학습계획 차단을 켜고 끕니다"
              >
                {r.h.planExcluded ? '차단 해제' : '차단'}
              </button>
            ) : (
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5, whiteSpace: 'nowrap', minWidth: 70, justifyContent: 'center' }}
                disabled={busy}
                onClick={() => void toggleShow(r.e)}
                title="학생 달력·학습계획에 보일지 정합니다"
              >
                {r.e.showInPlan ? '숨기기' : '표시'}
              </button>
            )}
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy}
              onClick={() => openEdit(r)}
              title="이름·날짜·유형을 고칩니다"
            >
              수정
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
              disabled={busy}
              onClick={() => setRemoving(r)}
            >
              삭제
            </button>
          </div>
        ),
      },
    ],
    // load 를 쓰는 함수들이 칸 안에 있다 — 빠뜨리면 처음 그린 load 를 붙잡는다(기초 관리에서 실제로 그랬다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, load],
  )

  const byMonth = useMemo(() => {
    const m = new Map<number, Row[]>()
    for (let i = 1; i <= 12; i++) m.set(i, [])
    for (const e of rows) m.get(Number(e.from.slice(5, 7)))?.push(e)
    return m
  }, [rows])

  const blocking = holidays.filter((e) => e.planExcluded).length

  return (
    <>
      {copyAsk && (
        <Modal
          title={`${year - 1}년 행사를 ${year}년으로 복사할까요?`}
          sub="날짜는 한 해 뒤로 밀립니다. 같은 이름·시작일의 행사가 이미 있으면 건너뜁니다."
          confirmLabel="복사"
          busy={busy}
          onConfirm={() => void copyYear()}
          onClose={() => setCopyAsk(false)}
        >
          <div className="note-box">
            <div>
              <b>행사</b>(시험·학원 행사 등)만 옮깁니다. 공휴일·학원 휴원 같은 <b>쉬는 날은 옮기지 않습니다</b> — 해마다 날짜가
              달라 새로 등록하세요. 위에서 고른 시즌({year})이 옮겨 갈 연도입니다.
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          title={`${editing.row.kind === 'holiday' ? '쉬는 날' : '행사'} 수정`}
          sub={`${editing.row.name} · ${editing.row.from}${editing.row.to !== editing.row.from ? ` ~ ${editing.row.to}` : ''}`}
          confirmLabel="저장"
          busy={busy}
          error={editing.error}
          confirmDisabled={editing.name.trim() === '' || editing.from === ''}
          onConfirm={() => void saveEdit()}
          onClose={() => setEditing(null)}
        >
          <div className="frow">
            <label className="req">이름</label>
            <input className="inp" value={editing.name} maxLength={50} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="frow">
            <label className="req">{editing.row.kind === 'holiday' ? '날짜' : '기간'}</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="inp" type="date" value={editing.from} onChange={(e) => setEditing({ ...editing, from: e.target.value })} />
              {editing.row.kind === 'event' && (
                <>
                  ~
                  <input className="inp" type="date" value={editing.to} min={editing.from} onChange={(e) => setEditing({ ...editing, to: e.target.value })} />
                </>
              )}
            </div>
          </div>
          <div className="frow">
            <label>유형</label>
            <select className="sel" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
              {Object.entries(editing.row.kind === 'holiday' ? HOLIDAY_TYPE_LABEL : ANNUAL_EVENT_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {editing.row.kind === 'event' && (
            <div className="frow">
              <label>비고</label>
              <input className="inp" value={editing.memo} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} />
            </div>
          )}
        </Modal>
      )}

      {removing && (
        <Modal
          title={`${removing.name} 을 삭제할까요?`}
          sub={
            removing.kind === 'holiday'
              ? `${removing.from} · 삭제하면 되돌릴 수 없습니다.`
              : `${removing.from}${removing.to !== removing.from ? ` ~ ${removing.to}` : ''} · 목록과 학생 달력에서 빠집니다.`
          }
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={() => void remove(removing).then((ok) => ok && setRemoving(null))}
          onClose={() => setRemoving(null)}
        />
      )}

      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="calendar-days" size={13} /> 등록 일정
          </div>
          <div className="v">{rows.length}</div>
          <div className="d">{year} 시즌</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="lock" size={13} /> 학습계획 차단
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {blocking}
          </div>
          <div className="d warn">해당일 학생 입력 불가</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="file-text" size={13} /> 모의고사
          </div>
          <div className="v">{events.filter((e) => e.eventType === 'EXAM').length}</div>
          <div className="d">시험 행사</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="utensils" size={13} /> 휴원
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {holidays.filter((e) => e.type === 'ACADEMY').length}
          </div>
          <div className="d">급식 가능일 제외</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="link" size={13} /> 참조 화면
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            3곳
          </div>
          <div className="d">학습계획·급식·성적</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '행사 목록', count: rows.length },
            { key: 'year', label: '연간 뷰' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {loadError && (
            <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              {loadError}
            </div>
          )}

          {tab === 'list' ? (
            <>
              <div className="note-box">
                <div className="ic">
                  <Icon name="lock" size={17} />
                </div>
                <div>
                  <div className="tt">여기에 등록한 날은 학생이 학습계획을 세울 수 없습니다</div>
                  <div className="tx">
                    <b>차단</b>으로 등록한 날은 학생 앱에서 계획을 세울 수 없고, 담임 화면(<b>주·일 학습계획</b>)에도
                    자물쇠로 표시되며 <b>미작성 집계에서 제외</b>됩니다. 차단하지 않으면 휴원일마다 전교생이
                    미작성자로 잡혀 경고가 무의미해집니다.
                    <br />
                    <b>차단은 입력 금지이지 삭제가 아닙니다.</b> 이미 계획을 쓴 날을 뒤늦게 차단으로 바꿨을 때 기존
                    계획을 어떻게 할지는 아직 정해지지 않았습니다.
                  </div>
                </div>
              </div>

              {/* 쉬는 날과 행사는 하는 일이 다르다 — 고를 때 헷갈리지 않게 미리 적는다 */}
              <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
                <div className="ic">
                  <Icon name="triangle-alert" size={17} />
                </div>
                <div>
                  <div className="tt">쉬는 날과 행사는 다르게 저장됩니다</div>
                  <div className="tx">
                    <b>쉬는 날</b>(공휴일·학원 휴원 등)은 교습일수·급식에서 빠지고 학습계획을 막을 수 있습니다. 하루씩
                    저장되어 연휴는 날짜 수만큼 나옵니다. <b>행사</b>(시험·학원 행사 등)는 학생 달력에 보이기만 하고
                    계산에는 들어가지 않습니다.
                    {academies.length > 1 && (
                      <>
                        <br />
                        <b>전 지점 권한 계정에서는 지점이 등록한 휴원이 보이지 않습니다.</b>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {result && (
                <div className="note-box" role="status" style={{ borderColor: 'var(--violet)' }}>
                  {result}
                </div>
              )}

              <DataTable
                columns={COLUMNS}
                rows={rows}
                rowKey={(r) => r.key}
                masked={false}
                loading={loading}
                pageSize={12}
                countLabel={
                  <>
                    {year} 등록 일정 <b>{rows.length}</b>건 · 차단 <b>{blocking}</b>건
                  </>
                }
                toolbar={
                  <>
                    <ExcelButton filename={`연간일정_${year}`} columns={COLUMNS} rows={rows} masked={false} />
                    <select className="sel" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }}>
                      {[TODAY_YEAR - 1, TODAY_YEAR, TODAY_YEAR + 1].map((y) => (
                        <option key={y} value={y}>
                          {y} 시즌
                        </option>
                      ))}
                    </select>
                    <button className="btn" disabled={busy || academyId === null} onClick={() => setCopyAsk(true)}>
                      <Icon name="history" size={14} /> 전년도 복사
                    </button>
                  </>
                }
              />

              <div className="card-sec" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="card-sec-h">
                  <div className="t">
                    <span className="ico">
                      <Icon name="plus" size={15} />
                    </span>
                    일정 등록
                  </div>
                </div>
                <div className="card-sec-b">
                  <div className="split">
                    <div>
                      <div className="frow">
                        <label className="req">행사명</label>
                        {/* ★ 50자를 넘기면 서버가 400 이 아니라 **500** 을 낸다(실호출로 51자부터 확인).
                               스펙에는 길이 제한이 없어 화면이 막지 않으면 붙여넣기로 그대로 들어간다.
                               서버 검증은 따로 요청해 뒀고, 그때까지 여기서 자른다. */}
                        <input
                          className="inp"
                          placeholder="어린이날"
                          value={name}
                          maxLength={50}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div className="frow">
                        <label className="req">기간</label>
                        <div className="two">
                          <input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                          <input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="frow">
                        <label className="req">유형 · 대상</label>
                        <div className="two">
                          <select className="sel" value={type} onChange={(e) => setType(e.target.value as FormType)}>
                            <optgroup label="쉬는 날">
                              {(Object.keys(HOLIDAY_TYPE_LABEL) as HolidayType[]).map((t) => (
                                <option key={t} value={`H:${t}`}>
                                  {HOLIDAY_TYPE_LABEL[t]}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="행사">
                              {(Object.keys(ANNUAL_EVENT_TYPE_LABEL) as AnnualEventType[]).map((t) => (
                                <option key={t} value={`E:${t}`}>
                                  {ANNUAL_EVENT_TYPE_LABEL[t]}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          {/* 전 지점 공통은 본사만 넣을 수 있다 — 지점 계정에는 선택지를 안 준다 */}
                          <select
                            className="sel"
                            value={nationwide ? 'all' : 'branch'}
                            disabled={academies.length <= 1}
                            onChange={(e) => setNationwide(e.target.value === 'all')}
                          >
                            <option value="branch">이 지점만</option>
                            <option value="all">전 지점 공통</option>
                          </select>
                        </div>
                      </div>
                      <div className="frow">
                        <label>학습계획</label>
                        <div style={{ paddingTop: 9 }}>
                          {isHoliday ? (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                              <input type="checkbox" checked={blockPlan} onChange={(e) => setBlockPlan(e.target.checked)} />
                              해당일 학습계획 입력 차단
                            </label>
                          ) : (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                              <input type="checkbox" checked={showInPlan} onChange={(e) => setShowInPlan(e.target.checked)} />
                              학생 달력·학습계획에 표시
                            </label>
                          )}
                        </div>
                      </div>
                      {!isHoliday && (
                        <div className="frow">
                          <label>비고</label>
                          <input className="inp" maxLength={200} value={memo} onChange={(e) => setMemo(e.target.value)} />
                        </div>
                      )}
                      <div className="frow">
                        <label>&nbsp;</label>
                        <button
                          className="btn pri"
                          disabled={busy || name.trim() === '' || from === ''}
                          onClick={() => void submit()}
                        >
                          <Icon name="save" size={14} /> 등록
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
              {MONTHS.map((mo, i) => {
                const list = byMonth.get(i + 1) ?? []
                return (
                  <div
                    key={mo}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      minHeight: 120,
                      background: list.length ? '#fff' : '#fafbfc',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        marginBottom: 9,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {mo}
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginLeft: 'auto' }}>
                        {list.length}건
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {list.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>등록된 일정 없음</span>}
                      {list.map((e) => (
                        <div key={e.key} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                          <span
                            style={{
                              width: 4,
                              alignSelf: 'stretch',
                              borderRadius: 2,
                              background:
                                (e.kind === 'holiday' ? TYPE_COLOR[e.h.type] : EVENT_COLOR[e.e.eventType]) ?? 'var(--line)',
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.35 }}>
                              {e.name}
                              {e.kind === 'holiday' && e.h.planExcluded && <Icon name="lock" size={10} />}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                              {e.from.slice(5)}
                              {e.to !== e.from && ` ~ ${e.to.slice(5)}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const copySignal = createScreenSignal()

export const annualEventsMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled data-soon title="준비 중입니다">기수 선택 ▾</button>
      <button className="btn" onClick={() => copySignal.bump()} title="작년 행사를 올해로 옮깁니다. 같은 행사는 건너뜁니다">
        <Icon name="history" size={14} /> 전년도 복사
      </button>
    </>
  ),
}
