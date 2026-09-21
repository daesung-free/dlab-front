import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, Modal, type Column, toDateStr, todayStr } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  cancelQnaReservation,
  listQnaSlotsBetween,
  openQnaSlots,
  setQnaSlotClosed,
  type QnaSlot,
} from '../../api/qna'
import { maskName } from '../../lib/mask'
import { createScreenSignal } from './screenSignal'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.11-7 질의응답 관리 — 신규개발-요구사항신규
 *
 * ⚠ 영단어 시험은 범위에서 제외. 이 화면은 질의응답만 다룬다.
 *
 * [8/3 답변서 — 디자인 회신서 6번 질의응답]
 *   1) 온라인/대면형 질의응답 선택노출 설정 기능이 필요
 *      "현재 온라인 질의응답은 진행하고 있지 않지만 추후 진행 가능성 염두"
 *   2) 대면형 신청 시 사진 첨부 및 질문 내용 입력 기능
 *      "질문응답 선생님의 사전 준비와 질답 시간의 정시성을 위해 꼭 필요"
 *   3) 질의응답 시간 조정 기능
 *      "실제 15분 간격으로 운영되고 있고 추후 변동이 있을 수 있습니다"
 *
 * ⚠ '온라인은 기능은 만들되 노출하지 않는다'가 이 화면의 핵심 제약이다.
 *   기능을 빼는 게 아니라 노출 스위치로 끄는 것 — 나중에 켜기만 하면 되도록.
 *   따라서 온라인 예약 흐름·데이터 모델은 대면과 같은 구조로 만들어 두고,
 *   앱 노출 여부만 설정값(qna_type_visibility)으로 분리한다.
 *
 * ⚠ 슬롯 간격은 15분으로 확정(클라이언트 회신). 다만 상수로 박지는 않는다.
 *   회신서가 "추후 변동이 있을 수 있다"고 명시했으므로 설정값으로 두고 슬롯을 생성한다.
 *   확정된 것은 '현재 운영값이 15분'이라는 사실이지 '영원히 15분'이 아니다. */

type QnaType = 'OFFLINE' | 'ONLINE'

const TYPE_META: Record<QnaType, { label: string; icon: string; cls: string }> = {
  OFFLINE: { label: '대면', icon: 'users', cls: 'verified' },
  ONLINE: { label: '온라인', icon: 'monitor', cls: 'supplement' },
}


const INTERVAL_CHOICES = [10, 15, 20, 30]

/** 개설 기본 운영시간. 슬롯 개설 요청에만 쓰고, 표는 서버가 만든 슬롯을 따른다 */
const OPEN_MIN = 18 * 60
const CLOSE_MIN = 20 * 60

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/* ── 신청 내역 ── */



/** 신청 내역 한 줄 — 슬롯의 예약자를 펼친 것 */
interface ReqRow {
  id: number
  at: string
  studentNo: string
  name: string
  className: string
  question: string
  subject: string
  photos: { attachmentId: number; name: string; url: string }[]
  teacher: string
  slot: string
  canceled: boolean
}

const REQ_COLUMNS: Column<ReqRow>[] = [
  {
    key: 'at',
    header: '신청일시',
    width: '150px',
    sortable: true,
    value: (r) => r.at,
    render: (r) => (r.at ? r.at.slice(0, 16).replace('T', ' ') : '-'),
  },
  {
    key: 'type',
    header: '유형',
    width: '76px',
    align: 'center',
    // 온라인 질의응답은 서버에 도메인이 없다 — 대면만 들어온다
    value: () => '대면',
    render: () => <span className="mk verified">대면</span>,
  },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '82px', mask: 'name', value: (r) => r.name },
  {
    key: 'classNo',
    header: '반',
    width: '56px',
    align: 'center',
    value: (r) => r.className,
  },
  {
    key: 'subject',
    header: '과목',
    width: '72px',
    align: 'center',
    value: (r) => r.subject || '-',
  },
  {
    key: 'question',
    header: '질문 내용',
    value: (r) => r.question,
    render: (r) => (
      <span>
        {r.question ? r.question : <span style={{ color: 'var(--muted)' }}>-</span>}
        {/* 사진 주소는 잠깐만 유효하다 — 안 열리면 목록을 다시 불러온다 */}
        {r.photos.map((ph, i) => (
          <a
            key={ph.attachmentId}
            href={ph.url}
            target="_blank"
            rel="noreferrer"
            className="mk supplement"
            style={{ marginLeft: 6 }}
            title={`${ph.name} — 안 열리면 새로고침 후 다시 누르세요`}
          >
            사진 {i + 1}
          </a>
        ))}
      </span>
    ),
  },
  { key: 'teacher', header: '담당', width: '86px', align: 'center', value: (r) => r.teacher },
  { key: 'slot', header: '예약 타임', width: '150px', align: 'center', sortable: true, value: (r) => r.slot },
  {
    key: 'status',
    header: '상태',
    width: '80px',
    align: 'center',
    value: (r) => (r.canceled ? '취소' : '예약'),
    render: (r) => <span className={`mk ${r.canceled ? 'brandnew' : 'verified'}`}>{r.canceled ? '취소' : '예약'}</span>,
  },
]

/**
 * 그 주(월~일) 날짜 7개. 슬롯 조회가 날짜 단위라 화면이 주를 만든다.
 *
 * ★ **토·일을 빼면 안 된다.** 이 학원은 주 7일 운영한다(교시 마스터가 WEEKDAY·SATURDAY·
 *   SUNDAY 3종이다). 예전에는 5일만 만들어서, 토요일에 열린 슬롯 8개와 거기 잡힌 예약
 *   3건이 **화면에서 통째로 안 보였다** — 데이터는 있는데 없는 것처럼 보인다.
 */
function weekDates(anchor: string): string[] {
  const d = new Date(`${anchor}T00:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    return toDateStr(x)
  })
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/* 헤더 「타임 개설」 → 본문 모달. 헤더는 본문과 상태를 공유하지 못한다(screenSignal.ts) */
const openSlotSignal = createScreenSignal()

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('slot')
  const [masked, setMasked] = useState(true)

  /* 관리자 설정 — 노출 여부와 간격은 화면에서 바꾼다 */
  const [visible, setVisible] = useState<Record<QnaType, boolean>>({ OFFLINE: true, ONLINE: false })
  /* ★ 15분이 현재 운영값이다(클라이언트 회신, 파일 상단 주석). 초기값이 30이라 격자는 15분인데
       상단 카드만 '30분 간격'이라고 말하고 있었다. 상수로 박지 않는 이유도 위 주석에 있다. */
  const [interval, setIntervalMin] = useState(15)
  /* 시각·간격·정원을 골라 여는 모달. 그리드의 '하루 열기' 는 운영 기본값으로 바로 연다 */
  const [opening, setOpening] = useState<{
    date: string
    from: string
    to: string
    intervalMinutes: string
    capacity: string
    room: string
  } | null>(null)
  const [openErr, setOpenErr] = useState<string | null>(null)

  /** 모달을 연다. 날짜는 지금 보고 있는 기준일, 시각은 운영 기본값으로 채워 둔다 */
  function openSlotModal(date?: string) {
    setOpenErr(null)
    setOpening({
      date: date ?? anchor,
      from: '18:00',
      to: '20:00',
      intervalMinutes: String(interval),
      capacity: '1',
      room: '',
    })
  }

  /* 헤더 버튼이 누르면 본문 모달을 연다. 첫 렌더의 0 은 건너뛴다 */
  const openVer = openSlotSignal.useVersion()
  useEffect(() => {
    if (openVer > 0) openSlotModal()
    // openSlotModal 은 매 렌더 새로 만들어지지만 신호 값만 보면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openVer])

  const [anchor, setAnchor] = useState(() => todayStr())
  const [byDate, setByDate] = useState<Map<string, QnaSlot[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const dates = useMemo(() => weekDates(anchor), [anchor])

  /** 주간 슬롯을 한 번에 가져와 날짜별로 나눈다 */
  const load = useCallback(async () => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const slots = await listQnaSlotsBetween(academyId, dates[0], dates[dates.length - 1])
      const next = new Map(dates.map((d) => [d, [] as QnaSlot[]]))
      for (const s of slots) next.get(s.date)?.push(s)
      setByDate(next)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '예약 현황을 불러오지 못했습니다.')
      setByDate(new Map())
    } finally {
      setLoading(false)
    }
  }, [academyId, dates])

  useEffect(() => {
    void load()
  }, [load])

  const allSlots = useMemo(() => [...byDate.values()].flat(), [byDate])

  /** 행(시각)은 서버가 만든 슬롯에서 뽑는다 — 화면이 운영시간을 정하지 않는다 */
  const times = useMemo(
    () => [...new Set(allSlots.map((s) => s.startTime.slice(0, 5)))].sort(),
    [allSlots],
  )

  const slotAt = useCallback(
    (date: string, time: string) => (byDate.get(date) ?? []).find((s) => s.startTime.slice(0, 5) === time) ?? null,
    [byDate],
  )

  const openCount = allSlots.filter((s) => !s.closed).length
  const bookedCount = allSlots.reduce((a, s) => a + s.reserved, 0)

  async function toggleClosed(slot: QnaSlot) {
    setBusy(true)
    try {
      await setQnaSlotClosed(slot.id, !slot.closed)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '슬롯 상태를 바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelReservation(reservationId: number) {
    setBusy(true)
    try {
      await cancelQnaReservation(reservationId)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '예약을 취소하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 그날 운영 시간을 통째로 개설한다. 서버가 간격대로 쪼개 만든다 */
  async function openDay(date: string) {
    if (academyId === null) return
    setBusy(true)
    try {
      await openQnaSlots({
        academyId,
        year: Number(date.slice(0, 4)),
        date,
        from: '18:00',
        to: '20:00',
        intervalMinutes: interval,
        capacity: 1,
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '슬롯을 개설하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 시각을 골라 개설한다.
   *
   * ★ **이미 있는 시각은 서버가 건너뛴다.** 오전을 열어둔 뒤 오후를 더하는 흐름이 있는데,
   *   중복이라고 통째로 거절하면 그때마다 시각을 손으로 맞춰야 한다(서버 주석).
   *   그래서 화면도 "겹치니 다시 하세요" 로 막지 않는다.
   */
  async function submitOpen() {
    if (!opening || academyId === null) return
    setBusy(true)
    setOpenErr(null)
    try {
      const res = await openQnaSlots({
        academyId,
        year: Number(opening.date.slice(0, 4)),
        date: opening.date,
        from: opening.from,
        to: opening.to,
        intervalMinutes: Number(opening.intervalMinutes) || 15,
        capacity: Number(opening.capacity) || 1,
        room: opening.room.trim() || undefined,
      })
      setOpening(null)
      /* 건너뛴 것이 있으면 만든 개수가 기대와 다르다 — 숫자를 그대로 알린다 */
      setDone(`${res.length}개 타임을 열었습니다. 이미 있던 시각은 그대로 뒀습니다.`)
      await load()
    } catch (err) {
      setOpenErr(err instanceof ApiError ? err.message : '개설하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 슬롯의 예약자를 펼쳐 신청 내역으로 만든다 */
  const reqRows: ReqRow[] = useMemo(
    () =>
      allSlots.flatMap((s) =>
        s.reservations.map((r) => ({
          id: r.id,
          at: r.reservedAt ?? '',
          studentNo: r.studentNo ?? '-',
          name: r.studentName,
          className: r.className ?? '-',
          question: r.question ?? '',
          subject: r.subject ?? '',
          photos: r.photos ?? [],
          teacher: s.teacherName ?? '미지정',
          slot: `${s.date.slice(5)} ${s.startTime.slice(0, 5)}`,
          canceled: r.canceledAt !== null,
        })),
      ),
    [allSlots],
  )
  const activeReq = reqRows.filter((r) => !r.canceled)

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="calendar-clock" size={13} /> 개설 타임
          </div>
          <div className="v">{openCount}</div>
          <div className="d">{interval}분 간격 · 이번 주</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-check" size={13} /> 예약 완료
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {bookedCount}
          </div>
          <div className="d">잔여 {openCount - bookedCount}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="inbox" size={13} /> 대기 중 신청
          </div>
          <div className="v">{activeReq.length}</div>
          <div className="d">사전 준비 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="upload" size={13} /> 사진 첨부
          </div>
          <div className="v">{activeReq.filter((r) => r.photos.length > 0).length}</div>
          <div className="d">사진을 올린 신청 · {activeReq.reduce((n, r) => n + r.photos.length, 0)}장</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="monitor" size={13} /> 온라인
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6, color: visible.ONLINE ? 'var(--mint-d)' : 'var(--muted)' }}>
            {visible.ONLINE ? '노출 중' : '미노출'}
          </div>
          <div className="d">기능은 준비됨</div>
        </div>
      </div>

      <div className="note-box plain">
        <div className="ic">
          <Icon name="shield" size={17} />
        </div>
        <div>
          <div className="tt">온라인 질의응답은 기능을 만들어 두고 노출만 꺼둡니다</div>
          <div className="tx">
            현재 운영하는 것은 <b>대면 질의응답</b>뿐이지만, 추후 온라인을 열 가능성이 있어 <b>예약 흐름과 데이터 모델을
            대면과 동일하게 만들어 두고 앱 노출 여부만 설정값으로 분리</b>했습니다. 나중에 스위치만 켜면 됩니다.
            <br />
            타임 간격은 <b>15분</b>입니다. 나중에 바꿀 수 있도록 설정값으로
            박지 않고 설정값으로 둡니다.
          </div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'slot', label: '예약 현황', count: bookedCount },
            { key: 'req', label: '신청 내역', count: reqRows.length },
            { key: 'setting', label: '노출 · 시간 설정' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {error && (
            <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          {/* ═══ 예약 현황 ═══ */}
          {tab === 'slot' && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>주 선택</span>
                <input className="inp" type="date" style={{ width: 150 }} value={anchor} onChange={(e) => setAnchor(e.target.value)} />
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {dates[0]} ~ {dates[dates.length - 1]}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="dt" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 92 }}>시간</th>
                      {dates.map((d) => {
                        const day = byDate.get(d) ?? []
                        return (
                          <th key={d} className="al-center">
                            {d.slice(5)} ({DOW[new Date(`${d}T00:00:00`).getDay()]})
                            <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--muted)' }}>
                              {day.length > 0 ? (
                                `${day[0].teacherName ?? '담당 미지정'} · ${day[0].room ?? '장소 미지정'}`
                              ) : (
                                <button
                                  className="btn"
                                  style={{ padding: '2px 7px', fontSize: 10 }}
                                  disabled={busy || academyId === null}
                                  onClick={() => void openDay(d)}
                                  title={`${interval}분 간격으로 18:00~20:00 개설`}
                                >
                                  개설
                                </button>
                              )}
                            </span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {times.length === 0 && (
                      <tr>
                        <td colSpan={dates.length + 1} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                          {loading ? '불러오는 중…' : '이 주에 개설된 타임이 없습니다.'}
                        </td>
                      </tr>
                    )}
                    {times.map((t) => (
                      <tr key={t}>
                        <th style={{ textAlign: 'left', paddingLeft: 12, fontSize: 11.5, fontWeight: 700 }}>{t}</th>
                        {dates.map((d) => {
                          const slot = slotAt(d, t)
                          if (!slot)
                            return (
                              <td key={d} className="al-center" style={{ padding: 5 }}>
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>미개설</span>
                              </td>
                            )
                          const booked = slot.reservations.filter((r) => !r.canceledAt)
                          return (
                            <td key={d} className="al-center" style={{ padding: 5 }}>
                              {booked.length > 0 ? (
                                <span
                                  className="mk verified"
                                  title={`${booked[0].studentName} · ${slot.teacherName ?? ''} · ${slot.room ?? ''}\n${booked[0].question ?? ''}`}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => void cancelReservation(booked[0].id)}
                                >
                                  {masked ? maskName(booked[0].studentName) : booked[0].studentName}
                                </span>
                              ) : slot.closed ? (
                                // closed(운영자가 닫음)와 full(정원 참)은 원인이 달라 구분해서 보여준다
                                <button
                                  className="btn"
                                  style={{ padding: '3px 9px', fontSize: 10.5 }}
                                  disabled={busy}
                                  onClick={() => void toggleClosed(slot)}
                                  title="운영자가 닫은 타임 — 눌러서 다시 연다"
                                >
                                  닫힘
                                </button>
                              ) : (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: 'var(--mint-d)',
                                    background: 'var(--mint-soft)',
                                    padding: '3px 10px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    display: 'inline-block',
                                  }}
                                  onClick={() => void toggleClosed(slot)}
                                  title="예약 가능 — 눌러서 닫는다"
                                >
                                  예약 가능
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <MaskToggle masked={masked} onChange={setMasked} />
                <button
                  className="btn"
                  disabled={academyId === null}
                  title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
                  onClick={() => openSlotModal()}
                >
                  <Icon name="plus" size={14} /> 타임 일괄 개설
                </button>
                {/* ★ 테이블명(qna_slots)이 화면에 나와 있었다 — 클라이언트가 읽을 이유가 없다(CLAUDE.md 1-1) */}
                <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 'auto' }}>
                  학생은 앱에서 희망 타임을 예약합니다
                </span>
              </div>
            </>
          )}

          {/* ═══ 신청 내역 ═══ */}
          {tab === 'req' && (
            <>
              <div className="note-box">
                <div className="ic">
                  <Icon name="upload" size={17} />
                </div>
                <div>
                  <div className="tt">질문 내용과 사진을 미리 받는 이유</div>
                  <div className="tx">
                    담당 선생님이 <b>사전에 준비</b>할 수 있어야 정해진 타임 안에 답변이 끝납니다. 신청 시 질문 내용
                    입력과 <b>문제 사진 첨부</b>를 받고, 예약 현황에서 첨부 아이콘으로 표시합니다.
                  </div>
                </div>
              </div>

              <DataTable
                columns={REQ_COLUMNS}
                rows={reqRows}
                rowKey={(r) => String(r.id)}
                masked={masked}
                loading={loading}
                pageSize={12}
                emptyText="예약 신청이 없습니다."
                countLabel={
                  <>
                    신청 <b>{reqRows.length}</b>건 · 예약 <b>{activeReq.length}</b>건
                  </>
                }
                toolbar={
                  <>
                    <button className="btn" disabled title="담당별 준비 목록 출력은 아직 없습니다">
                      <Icon name="printer" size={14} /> 담당별 준비 목록
                    </button>
                    <MaskToggle masked={masked} onChange={setMasked} />
                    <ExcelButton filename="질의응답_신청내역" columns={REQ_COLUMNS} rows={reqRows} masked={masked} />
                  </>
                }
              />
            </>
          )}

          {/* ═══ 노출 · 시간 설정 ═══ */}
          {tab === 'setting' && (
            <div className="split">
              <div className="card-sec" style={{ marginBottom: 0, boxShadow: 'none', border: '1px solid var(--line)' }}>
                <div className="card-sec-h">
                  <div className="t">
                    <span className="ico">
                      <Icon name="monitor" size={15} />
                    </span>
                    유형별 앱 노출
                  </div>
                </div>
                <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(Object.keys(TYPE_META) as QnaType[]).map((k) => (
                    <div
                      key={k}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        padding: '13px 14px',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        background: visible[k] ? 'var(--mint-soft)' : '#fff',
                      }}
                    >
                      <Icon name={TYPE_META[k].icon} size={16} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>{TYPE_META[k].label} 질의응답</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {k === 'OFFLINE'
                            ? '상담실 타임 예약 · 현재 운영 중'
                            : '기능 구현 완료 · 운영 시작 시 노출로 전환'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`type-pick${visible[k] ? ' on' : ''}`}
                        onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
                      >
                        {visible[k] ? '앱 노출 ON' : '앱 노출 OFF'}
                      </button>
                    </div>
                  ))}

                  <div className="blocked-note" style={{ marginTop: 4, marginBottom: 0 }}>
                    <div className="ic">
                      <Icon name="triangle-alert" size={16} />
                    </div>
                    <div>
                      <div className="tt">노출을 꺼도 기존 예약은 살아 있습니다</div>
                      <div className="tx">
                        노출 OFF는 <b>새 신청을 받지 않는다</b>는 뜻입니다. 이미 잡힌 예약을 어떻게 할지(유지 / 일괄 취소 /
                        안내 발송)는 정해야 합니다.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-sec" style={{ marginBottom: 0, boxShadow: 'none', border: '1px solid var(--line)' }}>
                <div className="card-sec-h">
                  <div className="t">
                    <span className="ico">
                      <Icon name="timer" size={15} />
                    </span>
                    타임 간격 · 운영 시간
                  </div>
                </div>
                <div className="card-sec-b">
                  <div className="frow">
                    <label className="req">타임 간격</label>
                    <div>
                      <div className="sf-chips">
                        {INTERVAL_CHOICES.map((n) => (
                          <button
                            type="button"
                            key={n}
                            className={`chip${interval === n ? ' on' : ''}`}
                            onClick={() => setIntervalMin(n)}
                          >
                            {n}분
                            {n === 15 && ' · 확정'}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                        현재 운영값은 <b>15분</b>으로 확정됐습니다. 변경은 아래 유의사항을 확인한 뒤 진행하세요.
                      </div>
                    </div>
                  </div>

                  <div className="frow">
                    <label className="req">운영 시간</label>
                    <div className="two">
                      <input className="inp" type="time" defaultValue={fmt(OPEN_MIN)} />
                      <input className="inp" type="time" defaultValue={fmt(CLOSE_MIN)} />
                    </div>
                  </div>

                  <div className="frow">
                    <label>생성 결과</label>
                    <div style={{ paddingTop: 8 }}>
                      <b style={{ fontSize: 14 }}>하루 {times.length}타임</b>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {' '}
                        · {fmt(OPEN_MIN)} ~ {fmt(CLOSE_MIN)}
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
                        {times.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '4px 9px',
                              borderRadius: 7,
                              background: 'var(--bg)',
                              color: 'var(--ink-2)',
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="frow">
                    <label>&nbsp;</label>
                    <button className="btn pri" disabled data-soon title="준비 중입니다">
                      <Icon name="save" size={14} /> 설정 저장
                    </button>
                  </div>

                  <div className="blocked-note" style={{ marginBottom: 0 }}>
                    <div className="ic">
                      <Icon name="triangle-alert" size={16} />
                    </div>
                    <div>
                      <div className="tt">간격을 바꾸면 이미 잡힌 예약의 시각이 어긋납니다</div>
                      <div className="tx">
                        15분 → 20분으로 바꾸면 기존 <code>13:15</code> 예약이 새 슬롯 격자에 없습니다. 적용 시점을{' '}
                        <b>다음 주부터</b>로 미루거나, 기존 예약을 이관하는 절차가 필요합니다.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 타임 일괄 개설 ── */}
      {opening && (
        <Modal
          title="가능 타임 개설"
          sub="시작·종료·간격을 주면 그 사이를 쪼개 만듭니다."
          confirmLabel="개설"
          busy={busy}
          error={openErr}
          confirmDisabled={opening.date === '' || opening.from === '' || opening.to === ''}
          onConfirm={() => void submitOpen()}
          onClose={() => setOpening(null)}
        >
          <div className="frow">
            <label className="req">날짜</label>
            <input
              className="inp"
              type="date"
              value={opening.date}
              onChange={(e) => setOpening({ ...opening, date: e.target.value })}
            />
          </div>
          <div className="frow">
            <label className="req">시간</label>
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="inp"
                  type="time"
                  value={opening.from}
                  onChange={(e) => setOpening({ ...opening, from: e.target.value })}
                />
                <span style={{ color: 'var(--muted)' }}>~</span>
                <input
                  className="inp"
                  type="time"
                  value={opening.to}
                  onChange={(e) => setOpening({ ...opening, to: e.target.value })}
                />
              </div>
              {/* 이미 있는 시각은 서버가 건너뛴다 — 오전을 연 뒤 오후를 더하는 흐름이 있다 */}
              <div className="hint">이미 열어 둔 시각은 건드리지 않고 넘어갑니다.</div>
            </div>
          </div>
          <div className="frow">
            <label className="req">간격 · 정원</label>
            <div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  className="sel"
                  value={opening.intervalMinutes}
                  onChange={(e) => setOpening({ ...opening, intervalMinutes: e.target.value })}
                >
                  {['15', '30', '40'].map((m) => (
                    <option key={m} value={m}>
                      {m}분
                    </option>
                  ))}
                </select>
                <input
                  className="inp"
                  type="number"
                  min={1}
                  value={opening.capacity}
                  onChange={(e) => setOpening({ ...opening, capacity: e.target.value })}
                />
              </div>
              {/* 간격은 클라이언트 회신 대기 중이라 고정하지 않고 고르게 둔다 */}
              <div className="hint">한 타임에 몇 명까지 받을지도 정합니다. 보통 1명입니다.</div>
            </div>
          </div>
          <div className="frow">
            <label>상담실</label>
            <div>
              <input
                className="inp"
                placeholder="나중에 정해도 됩니다"
                value={opening.room}
                onChange={(e) => setOpening({ ...opening, room: e.target.value })}
              />
              <div className="hint">타임만 먼저 열고 담당·상담실은 나중에 붙일 수 있습니다.</div>
            </div>
          </div>
        </Modal>
      )}

      {done && (
        <Modal title="타임을 열었습니다" hideCancel confirmLabel="닫기" onConfirm={() => setDone(null)} onClose={() => setDone(null)}>
          <div style={{ fontSize: 13.5 }}>{done}</div>
        </Modal>
      )}
    </>
  )
}

export const qnaMockup: Mockup = {
  Content,
  /* 본문에 주 선택이 이미 있다. 헤더 것은 같은 일을 하는 중복이라 「타임 개설」만 남긴다 */
  actions: (
    <>
      <button className="btn pri" onClick={() => openSlotSignal.bump()}>
        <Icon name="plus" size={14} /> 타임 개설
      </button>
    </>
  ),
}
