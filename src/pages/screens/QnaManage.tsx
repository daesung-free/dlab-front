import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { maskName } from '../../lib/mask'
import { MOCK_STUDENTS } from './mockStudents'
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

const TEACHERS = ['이장원', '김유진', '최지원', '박서영']
const ROOMS = ['상담실 1', '상담실 2']

const SLOT_DAYS = [
  { d: '06/01', dow: '월' },
  { d: '06/02', dow: '화' },
  { d: '06/03', dow: '수' },
  { d: '06/05', dow: '금' },
]

/** 운영 시간 — 시작·종료도 설정값이다 */
const OPEN_MIN = 13 * 60
const CLOSE_MIN = 16 * 60 + 30

const INTERVAL_CHOICES = [10, 15, 20, 30]

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** 간격 설정에 따라 슬롯 시각을 만든다 — 15분은 현재값일 뿐 고정이 아니다 */
function buildTimes(interval: number): string[] {
  const out: string[] = []
  for (let m = OPEN_MIN; m + interval <= CLOSE_MIN; m += interval) out.push(fmt(m))
  return out
}

interface Slot {
  key: string
  open: boolean
  student?: string
  /** 신청 시 입력한 질문 내용 */
  question?: string
  /** 사진 첨부 개수 */
  photos?: number
  teacher: string
  room: string
}

const QUESTIONS = [
  '미적분 극한 단원에서 치환 기준이 헷갈립니다',
  '문학 서술상 특징 문제 접근법을 모르겠어요',
  '빈칸추론에서 선지 소거가 잘 안 됩니다',
  '역학적 에너지 보존 문제 풀이 확인 부탁드립니다',
  '수1 삼각함수 그래프 개형을 못 그리겠습니다',
  '화작 문법 문제 오답 정리 봐주세요',
]

function buildSlots(times: string[]): Record<string, Slot> {
  const map: Record<string, Slot> = {}
  SLOT_DAYS.forEach((day, di) => {
    times.forEach((t, ti) => {
      const n = di * times.length + ti
      const open = n % 7 !== 6
      const booked = open && n % 3 === 0
      map[`${day.d}-${t}`] = {
        key: `${day.d}-${t}`,
        open,
        student: booked ? MOCK_STUDENTS[n % MOCK_STUDENTS.length].name : undefined,
        question: booked ? QUESTIONS[n % QUESTIONS.length] : undefined,
        photos: booked ? n % 3 : undefined,
        teacher: TEACHERS[di % TEACHERS.length],
        room: ROOMS[di % ROOMS.length],
      }
    })
  })
  return map
}

/* ── 신청 내역 ── */

type ReqStatus = '예약' | '완료' | '취소'

interface QnaRequest {
  id: string
  at: string
  type: QnaType
  studentNo: string
  name: string
  classNo: string
  subject: string
  question: string
  photos: number
  teacher: string
  slot: string
  status: ReqStatus
}

const SUBJECTS = ['국어', '수학', '영어', '탐구1', '탐구2']

const REQUESTS: QnaRequest[] = MOCK_STUDENTS.filter((s) => s.status === '재원')
  .slice(0, 24)
  .map((s, i) => {
    const day = SLOT_DAYS[i % SLOT_DAYS.length]
    return {
      id: `q-${i + 1}`,
      at: `2026-06-0${(i % 3) + 1} ${String(9 + (i % 8)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}`,
      // 온라인은 현재 미노출이라 신청이 들어오지 않는다 — 전부 대면
      type: 'OFFLINE',
      studentNo: s.studentNo,
      name: s.name,
      classNo: s.classNo,
      subject: SUBJECTS[i % SUBJECTS.length],
      question: QUESTIONS[i % QUESTIONS.length],
      photos: i % 3,
      teacher: TEACHERS[i % TEACHERS.length],
      slot: `${day.d} ${fmt(OPEN_MIN + (i % 12) * 15)}`,
      status: i % 11 === 10 ? '취소' : i % 4 === 3 ? '완료' : '예약',
    }
  })

const REQ_COLUMNS: Column<QnaRequest>[] = [
  { key: 'at', header: '신청일시', width: '136px', sortable: true, value: (r) => r.at },
  {
    key: 'type',
    header: '유형',
    width: '76px',
    align: 'center',
    sortable: true,
    value: (r) => TYPE_META[r.type].label,
    render: (r) => <span className={`mk ${TYPE_META[r.type].cls}`}>{TYPE_META[r.type].label}</span>,
  },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '82px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  { key: 'subject', header: '과목', width: '72px', align: 'center', sortable: true, value: (r) => r.subject },
  {
    key: 'question',
    header: '질문 내용',
    value: (r) => r.question,
    render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {r.photos > 0 && (
          <span className="mk supplement" title={`사진 ${r.photos}장 첨부`}>
            <Icon name="upload" size={10} /> {r.photos}
          </span>
        )}
        <span style={{ fontSize: 12 }}>{r.question}</span>
      </span>
    ),
  },
  { key: 'teacher', header: '담당', width: '76px', align: 'center', value: (r) => r.teacher },
  { key: 'slot', header: '예약 타임', width: '116px', align: 'center', sortable: true, value: (r) => r.slot },
  {
    key: 'status',
    header: '상태',
    width: '76px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => (
      <span className={`mk ${r.status === '완료' ? 'verified' : r.status === '예약' ? 'supplement' : 'brandnew'}`}>
        {r.status}
      </span>
    ),
  },
]

function Content() {
  const [tab, setTab] = useState('slot')
  const [masked, setMasked] = useState(true)

  /* 관리자 설정 — 노출 여부와 간격은 화면에서 바꾼다 */
  const [visible, setVisible] = useState<Record<QnaType, boolean>>({ OFFLINE: true, ONLINE: false })
  const [interval, setIntervalMin] = useState(15)

  const times = useMemo(() => buildTimes(interval), [interval])
  const slots = useMemo(() => buildSlots(times), [times])
  const slotList = Object.values(slots)
  const openCount = slotList.filter((s) => s.open).length
  const bookedCount = slotList.filter((s) => s.student).length

  const activeReq = REQUESTS.filter((r) => r.status === '예약')
  const withPhoto = REQUESTS.filter((r) => r.photos > 0).length

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
          <div className="v">{withPhoto}</div>
          <div className="d">건 · 문제 사진 포함</div>
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
            슬롯 간격은 <b>15분으로 확정</b>됐습니다. 다만 회신서에 &ldquo;추후 변동 가능&rdquo;이 명시돼 있어 상수로
            박지 않고 설정값으로 둡니다.
          </div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'slot', label: '예약 현황', count: bookedCount },
            { key: 'req', label: '신청 내역', count: REQUESTS.length },
            { key: 'setting', label: '노출 · 시간 설정' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {/* ═══ 예약 현황 ═══ */}
          {tab === 'slot' && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="dt" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 92 }}>시간</th>
                      {SLOT_DAYS.map((d, di) => (
                        <th key={d.d} className="al-center">
                          {d.d} ({d.dow})
                          <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--muted)' }}>
                            {TEACHERS[di % TEACHERS.length]} · {ROOMS[di % ROOMS.length]}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {times.map((t) => (
                      <tr key={t}>
                        <th style={{ textAlign: 'left', paddingLeft: 12, fontSize: 11.5, fontWeight: 700 }}>{t}</th>
                        {SLOT_DAYS.map((d) => {
                          const s = slots[`${d.d}-${t}`]
                          return (
                            <td key={d.d} className="al-center" style={{ padding: 5 }}>
                              {!s.open ? (
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>미개설</span>
                              ) : s.student ? (
                                <span
                                  className="mk verified"
                                  title={`${s.student} · ${s.teacher} · ${s.room}\n${s.question ?? ''}${s.photos ? `\n사진 ${s.photos}장` : ''}`}
                                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                  {masked ? maskName(s.student) : s.student}
                                  {(s.photos ?? 0) > 0 && <Icon name="upload" size={9} />}
                                </span>
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
                <button className="btn">
                  <Icon name="plus" size={14} /> 타임 일괄 개설
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 'auto' }}>
                  <code style={{ fontSize: 11 }}>qna_slots</code> · <code style={{ fontSize: 11 }}>qna_reservations</code> —
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
                rows={REQUESTS}
                rowKey={(r) => r.id}
                masked={masked}
                pageSize={12}
                countLabel={
                  <>
                    신청 <b>{REQUESTS.length}</b>건 · 대기 <b>{activeReq.length}</b>건
                  </>
                }
                toolbar={
                  <>
                    <button className="btn">
                      <Icon name="printer" size={14} /> 담당별 준비 목록
                    </button>
                    <MaskToggle masked={masked} onChange={setMasked} />
                    <ExcelButton filename="질의응답_신청내역" columns={REQ_COLUMNS} rows={REQUESTS} masked={masked} />
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
                    <button className="btn pri">
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
    </>
  )
}

export const qnaMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-06 1주 ▾</button>
      <button className="btn pri">
        <Icon name="plus" size={14} /> 타임 개설
      </button>
    </>
  ),
}
