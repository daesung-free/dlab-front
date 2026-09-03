import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  REQUEST_TYPE_CATEGORY,
  REQUEST_TYPE_LABEL,
  listApprovalItems,
  saveApprovalItem,
  type ApprovalItem,
  type ApproverType,
} from '../../api/approvals'
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

const APPROVERS: { key: ApproverType; label: string; cls: string; icon: string }[] = [
  { key: 'PARENT', label: '학부모', cls: 'p-read', icon: 'users' },
  { key: 'TEACHER', label: '담임', cls: 'p-own', icon: 'user-check' },
  { key: 'AUTO', label: '자동', cls: 'p-full', icon: 'zap' },
]

const CAT_TONE: Record<string, string> = {
  출결: 'verified',
  생활: 'supplement',
  학습: 'brandnew',
  기타: 'verified',
}

/** 응답 제한시간 후보 — I-20(응답시간) 미확약이라 화면에서 고르게 한다 */
const TIMEOUT_CHOICES = [30, 60, 120, 240]

interface ApprovalItemSaveInput {
  approverType: ApproverType | null
  timeoutMinutes: number | null
  escalationApproverType: ApproverType | null
}

function Content() {
  const { academyId } = useAcademy()
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [escalation, setEscalation] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const year = new Date().getFullYear()

  const load = useCallback(async () => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setItems(await listApprovalItems(academyId, year))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '승인 항목을 불러오지 못했습니다.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [academyId, year])

  useEffect(() => {
    void load()
  }, [load])

  // configured=false 는 "안 정했다"가 아니라 "그 신청이 거절된다"는 뜻이다
  const undecided = items.filter((i) => !i.configured).length

  /** 셀을 누르면 그 자리에서 저장한다. 매트릭스라 '저장' 버튼을 따로 누르게 하면
   *  무엇이 저장됐는지 알기 어렵다 */
  async function apply(item: ApprovalItem, patch: Partial<ApprovalItemSaveInput>) {
    if (academyId === null) return
    const approverType = patch.approverType ?? item.approverType
    if (!approverType) return // 승인 주체는 필수다

    setBusy(true)
    setNotice(null)
    try {
      await saveApprovalItem(item.requestType, {
        academyId,
        year,
        approverType,
        timeoutMinutes: patch.timeoutMinutes ?? item.timeoutMinutes ?? undefined,
        escalationApproverType:
          'escalationApproverType' in patch
            ? (patch.escalationApproverType ?? undefined)
            : (item.escalationApproverType ?? undefined),
      })
      await load()
      setNotice(`${REQUEST_TYPE_LABEL[item.requestType]} 설정을 저장했습니다.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-matrix">
      {/* 서버가 다루는 신청 유형이 3종뿐이다. 목업은 10종이었다 — docs/API_GAPS.md */}
      <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
        <div className="ic">
          <Icon name="triangle-alert" size={17} />
        </div>
        <div>
          <div className="tt">서버가 다루는 신청 유형은 3종입니다</div>
          <div className="tx">
            사유 신청 · 정기일정 · 방화벽 해제만 승인 대상입니다. 목업에 있던 좌석 이탈·급식 취소·
            질의응답 예약 등은 <b>승인 도메인에 들어와 있지 않습니다</b>(각자 다른 방식으로 처리).
            <b> 진행 중인 승인 요청 목록은 담임 전용 API</b>라 관리자 화면에서 볼 수 없습니다.
          </div>
        </div>
      </div>

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

      <div className="stat-strip">
        {APPROVERS.map((a) => (
          <div className="stat" key={a.key}>
            <div className="l">
              <Icon name={a.icon} size={13} /> {a.label} 승인
            </div>
            <div className="v">{items.filter((i) => i.approverType === a.key).length}</div>
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
          <div className="d down">신청이 거절됨</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="arrow-right" size={13} /> 에스컬레이션
          </div>
          <div className="v">{items.filter((i) => i.escalationApproverType).length}</div>
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
            {/* 셀을 누르면 그 자리에서 저장된다. 매트릭스에서 '저장' 버튼을 따로 두면
                무엇이 저장됐는지 알기 어렵다 */}
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {busy ? '저장 중…' : loading ? '불러오는 중…' : '선택하면 바로 저장됩니다'}
            </span>
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
                  <tr key={it.requestType}>
                    <th className="area">
                      {REQUEST_TYPE_LABEL[it.requestType]}
                      <span className="an">
                        <code style={{ fontSize: 10 }}>{it.requestType}</code>
                      </span>
                    </th>
                    <td>
                      <span className={`mk ${CAT_TONE[REQUEST_TYPE_CATEGORY[it.requestType]] ?? ''}`}>
                        {REQUEST_TYPE_CATEGORY[it.requestType]}
                      </span>
                    </td>
                    {APPROVERS.map((a) => (
                      <td key={a.key}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void apply(it, { approverType: a.key })}
                          className={`pm ${it.approverType === a.key ? a.cls : 'p-none'}`}
                          style={{ border: 'none', cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}
                          title={`${REQUEST_TYPE_LABEL[it.requestType]} → ${a.label} 승인`}
                        >
                          {it.approverType === a.key ? '지정' : '—'}
                        </button>
                      </td>
                    ))}
                    {escalation && (
                      <>
                        <td>
                          <select
                            className="sel"
                            style={{ width: 104, padding: '4px 8px', fontSize: 11.5 }}
                            disabled={busy || !it.approverType}
                            value={it.escalationApproverType ?? ''}
                            onChange={(e) =>
                              void apply(it, {
                                escalationApproverType: e.target.value === '' ? null : (e.target.value as ApproverType),
                              })
                            }
                          >
                            <option value="">없음</option>
                            {APPROVERS.map((a) => (
                              <option key={a.key} value={a.key}>
                                → {a.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="sel"
                            style={{ width: 96, padding: '4px 8px', fontSize: 11.5 }}
                            disabled={busy || !it.approverType}
                            value={it.timeoutMinutes ?? ''}
                            onChange={(e) =>
                              void apply(it, { timeoutMinutes: e.target.value === '' ? null : Number(e.target.value) })
                            }
                          >
                            <option value="">없음</option>
                            {TIMEOUT_CHOICES.map((m) => (
                              <option key={m} value={m}>
                                {m}분
                              </option>
                            ))}
                          </select>
                        </td>
                      </>
                    )}
                    <td style={{ textAlign: 'left', fontSize: 11.5, color: it.configured ? 'var(--muted)' : 'var(--red)' }}>
                      {it.configured
                        ? it.copiedFrom
                          ? '전년도에서 복사됨'
                          : '올해 설정'
                        : '미설정 — 이 신청은 거절됩니다'}
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
