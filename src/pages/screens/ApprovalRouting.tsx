import { useState } from 'react'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import './matrix.css'
import '../../styles/forms.css'

/* F-4.11-5 승인 라우팅 관리 — 신규개발-요구사항신규
 *
 * Phase 1 사유 신청 관리(F-4.1-5)에서 임시로 쓰던 모델을 정식화한다.
 * 두 화면은 approval_items / approval_requests 스키마를 공유한다.
 *
 * ⚠ #32 / I-12 (높음) — 항목별 승인 주체 매트릭스 미확정. 방화벽 해제는 특히 미결.
 * ⚠ #40 / I-20 (중)  — 에스컬레이션 응답시간·입학 시 승인자 사전지정, 클라이언트 미확약. */

type ApproverType = 'PARENT' | 'TEACHER' | 'AUTO'

const APPROVERS: { key: ApproverType; label: string; cls: string; icon: string }[] = [
  { key: 'PARENT', label: '학부모', cls: 'p-read', icon: 'users' },
  { key: 'TEACHER', label: '담임', cls: 'p-own', icon: 'user-check' },
  { key: 'AUTO', label: '자동', cls: 'p-full', icon: 'zap' },
]

interface ApprovalItem {
  code: string
  name: string
  category: '출결' | '생활' | '학습' | '기타'
  approver: ApproverType | null
  /** 에스컬레이션 대상 */
  escalateTo?: ApproverType
  timeoutMin?: number
  note?: string
}

/** approval_items 마스터 — 승인 주체가 null인 항목이 I-12 미결 대상 */
const ITEMS: ApprovalItem[] = [
  { code: 'ABS_FULL', name: '결석', category: '출결', approver: 'PARENT', escalateTo: 'TEACHER', timeoutMin: 120 },
  { code: 'ABS_LATE', name: '지각', category: '출결', approver: 'TEACHER', timeoutMin: 60 },
  { code: 'ABS_EARLY', name: '조퇴', category: '출결', approver: 'PARENT', escalateTo: 'TEACHER', timeoutMin: 60 },
  { code: 'ABS_OUT', name: '외출', category: '출결', approver: 'TEACHER', timeoutMin: 30 },
  { code: 'SCHED_REG', name: '정기일정 (병원·학원 등)', category: '출결', approver: 'PARENT', escalateTo: 'TEACHER', timeoutMin: 240 },
  { code: 'SEAT_MOVE', name: '좌석 이탈/복귀', category: '생활', approver: 'AUTO', note: '즉시 승인 · 기록만' },
  { code: 'MEAL_CANCEL', name: '급식 취소 (3일 전)', category: '생활', approver: 'AUTO', note: 'PG 자동환불' },
  { code: 'QNA_BOOK', name: '대면 질의응답 예약', category: '학습', approver: 'AUTO', note: '슬롯 잔여 시 자동' },
  {
    code: 'FIREWALL',
    name: '와이파이 방화벽 해제 (인강)',
    category: '학습',
    approver: null,
    note: '승인 주체 미지정',
  },
  { code: 'DEVICE', name: '전자기기 반입', category: '생활', approver: null, note: '항목 존재 여부부터 확인 필요' },
]

const CAT_TONE: Record<ApprovalItem['category'], string> = {
  출결: 'verified',
  생활: 'supplement',
  학습: 'brandnew',
  기타: 'verified',
}

function Content() {
  const [items, setItems] = useState(ITEMS)
  const [escalation, setEscalation] = useState(true)

  const undecided = items.filter((i) => !i.approver).length

  function setApprover(code: string, a: ApproverType) {
    setItems((prev) => prev.map((it) => (it.code === code ? { ...it, approver: a } : it)))
  }

  return (
    <div className="p-matrix">
      <div className="stat-strip">
        {APPROVERS.map((a) => (
          <div className="stat" key={a.key}>
            <div className="l">
              <Icon name={a.icon} size={13} /> {a.label} 승인
            </div>
            <div className="v">{items.filter((i) => i.approver === a.key).length}</div>
            <div className="d" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
              {a.key}
            </div>
          </div>
        ))}
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 미결
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {undecided}
          </div>
          <div className="d down">주체 미지정</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="arrow-right" size={13} /> 에스컬레이션
          </div>
          <div className="v">{items.filter((i) => i.escalateTo).length}</div>
          <div className="d warn">응답시간 미확약</div>
        </div>
      </div>

      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="route" size={15} />
            </span>
            승인 항목별 주체 설정
          </div>
          <div className="r">
            <button className={`chip${escalation ? ' on' : ''}`} onClick={() => setEscalation(!escalation)}>
              에스컬레이션 열 보기
            </button>
            <button className="btn pri" style={{ padding: '6px 12px', fontSize: 12 }}>
              <Icon name="save" size={13} /> 저장
            </button>
          </div>
        </div>
        <div className="card-sec-b">
          <div className="mx-scroll">
            <table className="mx">
              <thead>
                <tr>
                  <th className="area">신청 항목</th>
                  <th style={{ width: 90 }}>분류</th>
                  {APPROVERS.map((a) => (
                    <th key={a.key} style={{ width: 100 }}>
                      {a.label}
                      <span className="rk">{a.key}</span>
                    </th>
                  ))}
                  {escalation && (
                    <>
                      <th style={{ width: 118 }}>
                        에스컬레이션
                        <span className="rk">escalate_to</span>
                      </th>
                      <th style={{ width: 110 }}>
                        응답 제한
                        <span className="rk">timeout_min</span>
                      </th>
                    </>
                  )}
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.code}>
                    <th className="area">
                      {it.name}
                      <span className="an">
                        <code style={{ fontSize: 10 }}>{it.code}</code>
                      </span>
                    </th>
                    <td>
                      <span className={`mk ${CAT_TONE[it.category]}`}>{it.category}</span>
                    </td>
                    {APPROVERS.map((a) => (
                      <td key={a.key}>
                        <button
                          type="button"
                          onClick={() => setApprover(it.code, a.key)}
                          className={`pm ${it.approver === a.key ? a.cls : 'p-none'}`}
                          style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                          title={`${it.name} → ${a.label} 승인`}
                        >
                          {it.approver === a.key ? '지정' : '—'}
                        </button>
                      </td>
                    ))}
                    {escalation && (
                      <>
                        <td>
                          {it.escalateTo ? (
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--violet)' }}>
                              → {APPROVERS.find((a) => a.key === it.escalateTo)?.label}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>-</span>
                          )}
                        </td>
                        <td>
                          {it.timeoutMin ? (
                            <span
                              style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 700 }}
                              title="클라이언트 미확약 — 임시값"
                            >
                              {it.timeoutMin}분 *
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>-</span>
                          )}
                        </td>
                      </>
                    )}
                    <td style={{ textAlign: 'left', fontSize: 11.5, color: it.approver ? 'var(--muted)' : 'var(--red)' }}>
                      {it.note ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mx-legend">
            <span>
              <span className="pm p-full">자동</span> 조건 충족 시 즉시 승인
            </span>
            <span>
              <span className="pm p-own">담임</span> 담당 반 교사
            </span>
            <span>
              <span className="pm p-read">학부모</span> 앱 푸시 → 승인
            </span>
            <span style={{ color: 'var(--amber)', fontWeight: 700 }}>* 응답 제한시간 경과 시 자동 에스컬레이션</span>
          </div>
        </div>
      </div>

      <div className="split">
        <div className="card-sec" style={{ marginBottom: 0 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="arrow-right" size={15} />
              </span>
              에스컬레이션 흐름 (0723 반영)
            </div>
          </div>
          <div className="card-sec-b">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { n: 1, t: '학생이 앱에서 신청', d: 'approval_requests 생성 · 상태 대기', c: 'var(--mint)' },
                { n: 2, t: '학부모에게 푸시', d: 'approver_type = PARENT 인 항목', c: 'var(--blue)' },
                { n: 3, t: '응답 제한시간 경과', d: '미응답 시 자동 전환 (시간 미확약)', c: 'var(--amber)' },
                { n: 4, t: '담임에게 재라우팅', d: 'escalate_to = TEACHER', c: 'var(--violet)' },
                { n: 5, t: '승인 / 반려 확정', d: '출결·벌점에 반영', c: 'var(--green)' },
              ].map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: s.c,
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {s.n}
                  </span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.t}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-sec" style={{ marginBottom: 0 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="settings" size={15} />
              </span>
              기본 정책
            </div>
          </div>
          <div className="card-sec-b">
            <div className="frow">
              <label>승인 대기 UI</label>
              <select className="sel" defaultValue="시안 1">
                <option>시안 1</option>
                <option>시안 2</option>
              </select>
            </div>
            <div className="frow">
              <label>기본 응답 제한</label>
              <div className="two">
                <input className="inp" type="number" defaultValue={120} />
                <select className="sel">
                  <option>분</option>
                  <option>시간</option>
                </select>
              </div>
            </div>
            <div className="frow">
              <label>승인자 사전지정</label>
              <div style={{ paddingTop: 9 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <input type="checkbox" />
                  입학 시 학부모 승인자를 미리 지정
                </label>
              </div>
            </div>
            <div className="frow">
              <label>벌점 연계</label>
              <div style={{ paddingTop: 9 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <input type="checkbox" defaultChecked />
                  벌점 확정 후에는 사유 승인 불가
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const approvalMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="history" size={14} /> 승인 이력
      </button>
    </>
  ),
}
