import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, MaskToggle, Modal, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  createStaffCard,
  listStaffAttendances,
  listStaffCards,
  replaceStaffCard,
  retireStaffCard,
  type StaffAttendance,
  type StaffCard,
} from '../../api/staffCards'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.10-8 직원 카드 · 출퇴근 — /api/v1/admin/staff-cards
 *
 * ★ **직원 계정(사용자 관리)과 다른 것이다.** 저쪽은 "관리자 웹에 로그인하는 사람",
 *   이쪽은 "키오스크에 카드를 찍는 사람"이다. 계정 없이 카드만 있는 직원이 있다.
 *
 * ★ **근태를 판정하지 않는다.** 서버가 출근·퇴근 기록을 시각 순으로 그대로 줄 뿐
 *   근무시간·지각을 계산하지 않는다 — 근무시간 마스터가 없고 **근태 판정은 노동법 영역**이라
 *   임의로 넣으면 나중에 바꾸기 어렵다(서버 주석).
 *
 *   그래서 **화면도 계산하지 않는다.** 하루치를 묶어 출근·퇴근 시각을 나란히 보여줄 뿐,
 *   "몇 시간 일했다"·"지각" 은 쓰지 않는다. 그걸 쓰는 순간 화면이 노동법 판단을 하는 셈이다.
 *
 * ★ 학번은 **9000번대로 서버가 채번한다.** 4자리 키패드에서 학생과 구분하려는 것이다 —
 *   화면이 만들지 않는다.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** ISO instant → 로컬 `HH:mm`. UTC 그대로 찍으면 9시간 어긋난다 */
function localTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDate(d)
}

/** 하루 한 사람 한 줄. 서버는 찍은 기록을 낱개로 주므로 화면이 묶는다 */
interface DayRow {
  key: string
  workDate: string
  name: string
  studentNo: string | null
  /** 그날 처음 찍은 출근. 여러 번 찍었으면 첫 번째다 */
  firstIn: string | null
  /** 그날 마지막 퇴근 */
  lastOut: string | null
  /** 찍은 횟수. 2를 넘으면 들락날락한 것이라 원본을 봐야 한다 */
  count: number
}

function Content() {
  const { academyId, ready: academyReady } = useAcademy()
  const [tab, setTab] = useState('staff')

  const [staff, setStaff] = useState<StaffCard[]>([])
  const [atts, setAtts] = useState<StaffAttendance[]>([])
  const [from, setFrom] = useState(() => daysAgo(6))
  const [to, setTo] = useState(() => daysAgo(0))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [masked, setMasked] = useState(true)

  const [adding, setAdding] = useState<{ name: string; phone: string; rfidNo: string } | null>(null)
  const [carding, setCarding] = useState<{ row: StaffCard; rfidNo: string } | null>(null)
  const [retiring, setRetiring] = useState<StaffCard | null>(null)
  const [modalErr, setModalErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (academyId === null) {
      setStaff([])
      setAtts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    /* 둘을 묶지 않는다 — 근태가 안 와도 직원 목록은 보여줄 수 있어야 한다 */
    const [s, a] = await Promise.allSettled([
      listStaffCards(academyId),
      listStaffAttendances({ academyId, from, to }),
    ])
    setStaff(s.status === 'fulfilled' ? s.value : [])
    setAtts(a.status === 'fulfilled' ? a.value : [])
    const failed = [s, a].find((r) => r.status === 'rejected')
    if (failed && failed.status === 'rejected') {
      const e = failed.reason
      setError(e instanceof ApiError ? e.message : '직원 정보를 불러오지 못했습니다.')
    }
    setLoading(false)
  }, [academyId, from, to])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 낱개 기록을 **사람·날짜로 묶는다.**
   *
   * ★ 여기까지만 한다. 근무시간을 빼지 않는다 — 서버가 일부러 안 내는 값이다(머리 주석).
   */
  const dayRows: DayRow[] = useMemo(() => {
    const by = new Map<string, DayRow>()
    for (const a of atts) {
      const key = `${a.workDate}:${a.enrollmentId}`
      const cur =
        by.get(key) ??
        { key, workDate: a.workDate, name: a.name, studentNo: a.studentNo, firstIn: null, lastOut: null, count: 0 }
      cur.count += 1
      const t = localTime(a.recordedAt)
      if (a.eventType === 'IN') cur.firstIn = cur.firstIn === null ? t : cur.firstIn
      else cur.lastOut = t
      by.set(key, cur)
    }
    return [...by.values()].sort((x, y) => y.workDate.localeCompare(x.workDate) || x.name.localeCompare(y.name, 'ko'))
  }, [atts])

  async function submitAdd() {
    if (!adding || academyId === null) return
    setBusy(true)
    setModalErr(null)
    try {
      const r = await createStaffCard({
        academyId,
        name: adding.name.trim(),
        phone: adding.phone.trim() || undefined,
        rfidNo: adding.rfidNo.trim() || undefined,
      })
      setAdding(null)
      setDone(`${r.name} 등록했습니다. 키패드 번호는 ${r.studentNo ?? '(발급 중)'} 입니다.`)
      await load()
    } catch (err) {
      setModalErr(err instanceof ApiError ? err.message : '등록하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function submitCard() {
    if (!carding) return
    setBusy(true)
    setModalErr(null)
    try {
      await replaceStaffCard(carding.row.enrollmentId, carding.rfidNo.trim())
      setCarding(null)
      setDone(`${carding.row.name} 카드를 바꿨습니다. 이전 카드는 더 이상 쓸 수 없습니다.`)
      await load()
    } catch (err) {
      setModalErr(err instanceof ApiError ? err.message : '바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function submitRetire() {
    if (!retiring) return
    setBusy(true)
    setModalErr(null)
    try {
      await retireStaffCard(retiring.enrollmentId)
      setRetiring(null)
      setDone(`${retiring.name} 퇴사 처리했습니다. 지난 근태 기록은 그대로 남습니다.`)
      await load()
    } catch (err) {
      setModalErr(err instanceof ApiError ? err.message : '처리하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const staffColumns: Column<StaffCard>[] = useMemo(
    () => [
      {
        key: 'studentNo',
        header: '키패드 번호',
        width: '120px',
        /* 서버가 9000번대로 채번한다. 아직 안 나온 경우는 '-' 다 — 안 주는 게 아니라 없는 것 */
        value: (r) => r.studentNo ?? '-',
      },
      { key: 'name', header: '이름', width: '110px', mask: 'name', value: (r) => r.name },
      { key: 'phone', header: '연락처', width: '140px', mask: 'phone', value: (r) => r.phone ?? '-' },
      {
        key: 'rfidNo',
        header: '카드 번호',
        value: (r) => r.rfidNo ?? '',
        render: (r) =>
          r.rfidNo ? (
            <span>{r.rfidNo}</span>
          ) : (
            /* 카드를 아직 안 준 것이지 서버가 값을 안 주는 게 아니다 */
            <span style={{ color: 'var(--muted)' }}>아직 없음</span>
          ),
      },
      {
        key: 'act',
        header: '',
        width: '176px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy}
              onClick={() => {
                setModalErr(null)
                setCarding({ row: r, rfidNo: r.rfidNo ?? '' })
              }}
            >
              {r.rfidNo ? '카드 교체' : '카드 등록'}
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
              disabled={busy}
              onClick={() => {
                setModalErr(null)
                setRetiring(r)
              }}
            >
              퇴사
            </button>
          </div>
        ),
      },
    ],
    [busy],
  )

  const attColumns: Column<DayRow>[] = useMemo(
    () => [
      { key: 'workDate', header: '날짜', width: '112px', sortable: true, value: (r) => r.workDate },
      { key: 'studentNo', header: '키패드 번호', width: '116px', value: (r) => r.studentNo ?? '-' },
      { key: 'name', header: '이름', width: '110px', mask: 'name', value: (r) => r.name },
      {
        key: 'firstIn',
        header: '출근',
        width: '90px',
        align: 'center',
        value: (r) => r.firstIn ?? '-',
        render: (r) => (r.firstIn ? <b>{r.firstIn}</b> : <span style={{ color: 'var(--muted)' }}>기록 없음</span>),
      },
      {
        key: 'lastOut',
        header: '퇴근',
        width: '90px',
        align: 'center',
        value: (r) => r.lastOut ?? '-',
        /* ★ 출근만 있고 퇴근이 없는 날이 실제로 있다. '-' 로 두면 0시로 읽힌다 */
        render: (r) => (r.lastOut ? <b>{r.lastOut}</b> : <span style={{ color: 'var(--muted)' }}>기록 없음</span>),
      },
      {
        key: 'count',
        header: '찍은 횟수',
        width: '96px',
        align: 'center',
        value: (r) => r.count,
        render: (r) =>
          r.count > 2 ? (
            /* 2회를 넘으면 들락날락한 것이라 출근·퇴근 두 칸만으로는 다 못 보여준다 */
            <span className="mk supplement" title="이 날은 여러 번 찍었습니다">
              {r.count}회
            </span>
          ) : (
            <span>{r.count}회</span>
          ),
      },
    ],
    [],
  )

  return (
    <>
      <div className="note-box">
        <div className="ic">
          <Icon name="id-card" size={17} />
        </div>
        <div>
          <div className="tt">키오스크에 카드를 찍는 직원을 관리합니다</div>
          <div className="tx">
            관리자 웹 로그인 계정과는 별개입니다 — 계정 없이 카드만 쓰는 직원도 있습니다.
            키패드 번호는 <b>등록할 때 자동으로</b> 매겨집니다.
          </div>
        </div>
      </div>

      {academyId === null && academyReady && (
        <div className="note-box">지점을 먼저 선택하세요. 직원 카드는 지점 단위로 관리합니다.</div>
      )}

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {done && (
        <div className="note-box" style={{ borderColor: 'var(--mint)' }}>
          <div className="ic">
            <Icon name="check" size={17} />
          </div>
          <div style={{ flex: 1 }}>{done}</div>
          <button className="btn" onClick={() => setDone(null)}>
            닫기
          </button>
        </div>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'staff', label: '직원 · 카드', count: staff.length },
            { key: 'att', label: '출퇴근 기록', count: dayRows.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="card-sec-b">
          {tab === 'staff' ? (
            <DataTable
              columns={staffColumns}
              rows={staff}
              rowKey={(r) => String(r.enrollmentId)}
              masked={masked}
              loading={loading}
              pageSize={15}
              countLabel={
                <>
                  직원 <b>{staff.length}</b>명 · 카드 발급{' '}
                  <b>{staff.filter((s) => s.rfidNo).length}</b>명
                </>
              }
              toolbar={
                <>
                  <button
                    className="btn pri"
                    disabled={academyId === null}
                    title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
                    onClick={() => {
                      setModalErr(null)
                      setAdding({ name: '', phone: '', rfidNo: '' })
                    }}
                  >
                    <Icon name="plus" size={14} /> 직원 등록
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                </>
              }
              emptyText="등록된 직원이 없습니다. 「직원 등록」으로 추가하면 키패드 번호가 자동으로 매겨집니다."
            />
          ) : (
            <>
              <div className="dt-toolbar" style={{ padding: '0 0 12px', marginBottom: 14 }}>
                <span className="dt-count">조회 기간</span>
                <input className="inp" type="date" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="dt-count">~</span>
                <input className="inp" type="date" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <DataTable
                columns={attColumns}
                rows={dayRows}
                rowKey={(r) => r.key}
                masked={masked}
                loading={loading}
                pageSize={20}
                countLabel={
                  <>
                    {from} ~ {to} · <b>{dayRows.length}</b>일치
                  </>
                }
                toolbar={<MaskToggle masked={masked} onChange={setMasked} />}
                emptyText="이 기간에 찍힌 기록이 없습니다."
              />
              {/* ★ 근무시간·지각을 화면이 계산하지 않는 이유를 적어 둔다. 안 적으면
                     "왜 근무시간이 없냐"는 요청이 반복해서 들어온다 */}
              <div className="hint" style={{ marginTop: 10 }}>
                찍힌 시각을 그대로 보여줍니다. 근무시간과 지각 여부는 판정하지 않습니다.
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 직원 등록 ── */}
      {adding && (
        <Modal
          title="직원 등록"
          sub="키패드 번호는 저장할 때 자동으로 매겨집니다."
          confirmLabel="등록"
          busy={busy}
          error={modalErr}
          confirmDisabled={adding.name.trim() === ''}
          onConfirm={() => void submitAdd()}
          onClose={() => setAdding(null)}
        >
          <div className="frow">
            <label className="req">이름</label>
            <input
              className="inp"
              value={adding.name}
              maxLength={30}
              onChange={(e) => setAdding({ ...adding, name: e.target.value })}
            />
          </div>
          <div className="frow">
            <label>연락처</label>
            <input
              className="inp"
              placeholder="010-0000-0000"
              value={adding.phone}
              onChange={(e) => setAdding({ ...adding, phone: e.target.value })}
            />
          </div>
          <div className="frow">
            <label>카드 번호</label>
            <div>
              <input
                className="inp"
                placeholder="카드에 적힌 번호"
                value={adding.rfidNo}
                onChange={(e) => setAdding({ ...adding, rfidNo: e.target.value })}
              />
              <div className="hint">지금 없으면 비워 두고 나중에 등록해도 됩니다.</div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 카드 등록 · 교체 ── */}
      {carding && (
        <Modal
          title={carding.row.rfidNo ? '카드 교체' : '카드 등록'}
          sub={`${carding.row.name}(${carding.row.studentNo ?? '-'})`}
          confirmLabel={carding.row.rfidNo ? '교체' : '등록'}
          busy={busy}
          error={modalErr}
          confirmDisabled={carding.rfidNo.trim() === ''}
          onConfirm={() => void submitCard()}
          onClose={() => setCarding(null)}
        >
          {carding.row.rfidNo && (
            /* 분실 신고가 따로 없다. 새 번호를 달면 옛 카드가 무효가 되는 구조다 */
            <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
              <div className="ic">
                <Icon name="triangle-alert" size={17} />
              </div>
              <div>
                <div className="tt">이전 카드는 쓸 수 없게 됩니다</div>
                <div className="tx">
                  지금 카드 <b>{carding.row.rfidNo}</b> 대신 새 번호를 씁니다. 분실한 카드는 이렇게
                  무효로 만듭니다.
                </div>
              </div>
            </div>
          )}
          <div className="frow">
            <label className="req">새 카드 번호</label>
            <input
              className="inp"
              value={carding.rfidNo}
              onChange={(e) => setCarding({ ...carding, rfidNo: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {/* ── 퇴사 ── */}
      {retiring && (
        <Modal
          title="퇴사 처리"
          sub={`${retiring.name}(${retiring.studentNo ?? '-'})`}
          confirmLabel="퇴사 처리"
          danger
          busy={busy}
          error={modalErr}
          onConfirm={() => void submitRetire()}
          onClose={() => setRetiring(null)}
        >
          <div className="note-box risk">
            <div className="ic">
              <Icon name="alert-triangle" size={17} />
            </div>
            <div>
              <div className="tt">되돌릴 수 없습니다</div>
              <div className="tx">
                목록에서 빠지고 카드도 쓸 수 없게 됩니다. <b>지난 근태 기록은 그대로 남습니다</b> —
                기록의 주인을 알 수 있어야 하기 때문입니다.
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export const staffCardsMockup: Mockup = { Content }
