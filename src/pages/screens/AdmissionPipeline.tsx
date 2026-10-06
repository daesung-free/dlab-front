import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal, Unfilled, useServerData } from '../../components/common'
import { useAcademy } from '../../auth/AcademyContext'
import {
  CONVERT_GRADE_LABEL,
  GENDER_LABEL,
  SCHOOL_TYPE_LABEL,
  STD_GRADE_LABEL,
  RESERVATION_FLOW,
  RESERVATION_STATUS_LABEL,
  addReservationMemo,
  changeReservationStatus,
  convertReservation,
  deleteReservationMemo,
  formatYmd,
  getReservation,
  listReservationMemos,
  listReservations,
  listStatusLogs,
} from '../../api/admissions'
import type { ConvertGrade, ReservationRow, ReservationStatus } from '../../api/admissions'
import { ApiError } from '../../api/client'
import type { Mockup } from './types'
import './admission.css'

/* 입학 상담 예약 (F-4.2 대기자 관리) — 시안 02_admin_ipsi.html 의 파이프라인 보드
 *
 * 연동(2026-10-06) — /api/v1/admin/admission-reservations. src/api/admissions.ts 참고.
 *   오래 「신청 유입 경로가 없어 문서만」으로 멈춰 있었다. 홈페이지 입학예약폼 수신
 *   (`POST /api/v1/homepage/admissions`)이 생겨 풀렸다.
 *
 * ⚠ 시안은 유입 경로를 '구글폼'으로 표기했으나, 요구사항정의서 F-4.2는
 *   D.Lab 사이트(디멤버) 입학예약폼 연동으로 정의한다. 명칭을 '입학예약폼'으로 통일했다.
 *
 * ★ **지점을 화면에서 거른다.** 목록 API 가 `academyId` 를 안 받아 전 지점이 섞여 온다.
 *   거르지 않으면 분당 담당자가 대구 지원자를 보고 전화한다(API_GAPS 40부).
 *
 * ★ 카드에 적을 값이 **접수 폼보다 적다.** 생년·출신학원·등원희망일·유입경로·입학기준은
 *   홈페이지가 받아 두지만 관리자 조회로 **안 온다** — 칸을 지우지 않고 <Unfilled/> 로 둔다.
 *   지우면 백엔드에 요청할 것이 조용히 사라진다.
 *
 * ★ 전환(`convert`)은 **되돌리는 API 가 없다.** 누르면 학생이 생기고 `converted` 가 굳는다 —
 *   그래서 모달로 한 번 더 받는다. 전환된 카드는 전환 버튼을 다시 주지 않는다.
 *
 * ★ 시안에 있던 「이 화면 하나가 대체하는 것 — 엑셀 14개 시트」 Before/After 비교는
 *   **화면에서 뺐다.** 제안용 설명이라 행정 선생님이 읽어도 할 일이 달라지지 않는다.
 *   내용은 아래에 남긴다 — 지운 것이 아니라 옮긴 것이다.
 *
 *   현재(엑셀 수기): 온라인 접수 → 예약현황 → 좌석/장학/대기 시트로 사람이 반복 복사 ·
 *   입학불가(성적미달·검고졸)를 연락처로 눈대조 · 방문·좌석·장학·대기가 서로 다른 시트에
 *   분리 · 방문/예약/등원 안내 문자를 양식에서 복붙 발송 · 상담 내용은 셀 한 칸에 텍스트
 *   한 덩어리(추적 불가)
 *
 *   To-Be: 온라인 입학예약 유입이 파이프라인 카드로 자동 생성 · 입학기준·검고졸 자동
 *   크로스체크 · 좌석배치도·장학·대기 실시간 연동 · 단계 전환 시 안내 문자 자동발송 ·
 *   입학상담이 그대로 재원생 상담일지의 첫 기록으로 연결
 */

/** 서버가 이유를 주면 그걸 쓴다 — "저장하지 못했습니다" 뒤에 왜가 없으면 담당자가 다시 누른다 */
function why(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback
}

/** 칸 색. 결론(확정·미등록)과 멈춤(보류·취소)이 한눈에 갈려야 한다 */
const COL_COLOR: Record<ReservationStatus, string> = {
  CALL_NEEDED: 'var(--mint)',
  CONSULTED: 'var(--amber)',
  CONFIRMED: 'var(--mint-d)',
  NOT_REGISTERED: 'var(--muted)',
  ON_HOLD: 'var(--amber)',
  CANCELED: 'var(--muted)',
}

/** 이유를 안 적으면 나중에 왜 떨어졌는지 셀 수 없는 상태들 */
const REASON_EXPECTED: readonly ReservationStatus[] = ['NOT_REGISTERED', 'CANCELED', 'ON_HOLD']

const CONVERT_GRADES: readonly ConvertGrade[] = ['HIGH2', 'HIGH3', 'N_SU', 'STAFF']

function dateOnly(s: string | null): string {
  return s ? s.slice(0, 10) : '-'
}

function Content() {
  const { academyId, selectable } = useAcademy()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const params = useMemo(() => ({ year, keyword: keyword || undefined }), [year, keyword])
  const list = useServerData({ fetcher: listReservations, params })

  /* 서버가 지점으로 못 걸러 주므로 여기서 거른다. 지점을 아직 못 고른 전 지점 권한
     계정에는 전부 보여준다 — 그 상태에서 숨기면 "조회가 안 된다"로 읽힌다 */
  const rows = useMemo(() => {
    const all = list.data ?? []
    if (academyId === null) return all
    return all.filter((r) => r.academyId === null || r.academyId === academyId)
  }, [list.data, academyId])

  const byStatus = useMemo(() => {
    const m = new Map<ReservationStatus, ReservationRow[]>()
    for (const s of RESERVATION_FLOW) m.set(s, [])
    for (const r of rows) m.get(r.status)?.push(r)
    return m
  }, [rows])

  const converted = useMemo(() => rows.filter((r) => r.converted).length, [rows])

  const [open, setOpen] = useState<ReservationRow | null>(null)

  const years = useMemo(() => {
    const now = new Date().getFullYear()
    return [now + 1, now, now - 1, now - 2]
  }, [])

  return (
    <div className="p-admission">
      <div className="kpis">
        {RESERVATION_FLOW.map((s) => (
          <div className="kpi" key={s}>
            <div className="l">{RESERVATION_STATUS_LABEL[s]}</div>
            <div className="v">{list.loading && list.data === null ? '…' : (byStatus.get(s)?.length ?? 0)}</div>
            <div className="d mut">{year}년 접수</div>
          </div>
        ))}
        <div className="kpi">
          <div className="l">원생 전환</div>
          <div className="v">{list.loading && list.data === null ? '…' : converted}</div>
          <div className="d mut">학번이 발급된 건</div>
        </div>
        <div className="kpi">
          <div className="l">좌석 대기 · 장학 신청</div>
          <div className="v">
            <Unfilled reason="예약 건의 좌석 대기·장학 신청 여부가 관리자 조회에 오지 않는다" />
          </div>
          <div className="d mut">접수 폼에는 있는 값</div>
        </div>
      </div>

      <div className="frow" style={{ margin: '0 0 10px' }}>
        <label>접수 연도</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="inp" style={{ width: 110 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <input
            className="inp"
            style={{ width: 200 }}
            placeholder="이름 · 연락처 · 접수번호"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setKeyword(keywordInput.trim())
            }}
          />
          <button className="btn" onClick={() => setKeyword(keywordInput.trim())}>
            검색
          </button>
          {keyword && (
            <button
              className="btn"
              onClick={() => {
                setKeywordInput('')
                setKeyword('')
              }}
            >
              검색 해제
            </button>
          )}
          <span className="mk" style={{ marginLeft: 2 }}>
            {rows.length}건
          </span>
        </div>
      </div>

      {selectable && academyId === null && (
        <div className="note-box">
          <div>
            지금은 <b>전 지점</b> 접수가 함께 보입니다. 위에서 지점을 고르면 그 지점 건만 남습니다.
          </div>
        </div>
      )}

      {list.error && (
        <div className="note-box" style={{ borderColor: 'var(--rose)' }} role="status">
          <div>{list.error}</div>
        </div>
      )}

      <div className="board">
        {RESERVATION_FLOW.map((s) => {
          const leads = byStatus.get(s) ?? []
          return (
            <div className="col" key={s}>
              <div className="col-h">
                <div className="t">
                  <span className="dot" style={{ background: COL_COLOR[s] }} />
                  {RESERVATION_STATUS_LABEL[s]}
                </div>
                <span className="n">{leads.length}</span>
              </div>
              <div className="col-b">
                {leads.length === 0 && !list.loading && (
                  <div className="lead-meta" style={{ padding: '10px 2px' }}>
                    해당 건이 없습니다.
                  </div>
                )}
                {leads.map((r) => (
                  <button
                    type="button"
                    className={`lead${r.status === 'NOT_REGISTERED' || r.status === 'CANCELED' ? ' block' : ''}`}
                    key={r.id}
                    onClick={() => setOpen(r)}
                    style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div className="lead-top">
                      <span className="nm">{r.studentName ?? '이름 없음'}</span>
                      {r.stdGrade && <span className="cat na">{STD_GRADE_LABEL[r.stdGrade] ?? r.stdGrade}</span>}
                    </div>
                    <div className="lead-meta">
                      {r.schoolName ?? '학교 미입력'}
                      <br />
                      {r.studentTel ?? r.parentTel ?? '연락처 미입력'} · 접수 {dateOnly(r.createdAt)}
                    </div>
                    {r.rsvCd && (
                      <div className="auto-note">
                        <Icon name="link" size={12} /> 접수번호 {r.rsvCd}
                      </div>
                    )}
                    {r.converted && (
                      <div className="lead-foot">
                        <span className="src">학번 {r.studentNo ?? '-'}</span>
                        <span className="mini done">원생 전환</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {open && <Detail row={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </div>
  )
}

/** 카드 하나. 상태·메모·이력·전환이 한 곳에 모여야 담당자가 전화를 걸면서 끝낼 수 있다 */
function Detail({
  row,
  onClose,
  onChanged,
}: {
  row: ReservationRow
  onClose: () => void
  onChanged: () => void
}) {
  /* 훅은 조건 객체를 받는다 — id 하나짜리도 객체로 감싸고 useMemo 를 건다.
     매 렌더 새 객체면 무한 요청이 된다 */
  const idParams = useMemo(() => ({ id: row.id }), [row.id])
  /* 접수 폼 값(생년·등원희망일·내신·주소)은 **상세에만** 온다. 목록 행에는 없어서
     카드를 열 때 한 번 더 읽는다 */
  const detail = useServerData({
    fetcher: ({ id }: { id: number }) => getReservation(id),
    params: idParams,
    errorMessage: '접수 내용을 불러오지 못했습니다.',
  })
  const memos = useServerData({
    fetcher: ({ id }: { id: number }) => listReservationMemos(id),
    params: idParams,
    errorMessage: '메모를 불러오지 못했습니다.',
  })
  const logs = useServerData({
    fetcher: ({ id }: { id: number }) => listStatusLogs(id),
    params: idParams,
    errorMessage: '상태 이력을 불러오지 못했습니다.',
  })

  const [status, setStatus] = useState<ReservationStatus>(row.status)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [memoText, setMemoText] = useState('')
  const [memoBusy, setMemoBusy] = useState(false)
  const [delMemo, setDelMemo] = useState<number | null>(null)

  const [convert, setConvert] = useState(false)

  const d = detail.data

  async function submitStatus() {
    if (status === row.status && !reason.trim()) {
      setErr('바꿀 상태를 고르거나 이유를 적어 주세요.')
      return
    }
    setBusy(true)
    setErr(null)
    setDone(null)
    try {
      await changeReservationStatus(row.id, { status, reason: reason.trim() || undefined })
      setDone(`${RESERVATION_STATUS_LABEL[status]} 로 옮겼습니다.`)
      setReason('')
      logs.reload()
      onChanged()
    } catch (e) {
      setErr(why(e, '상태를 바꾸지 못했습니다.'))
    } finally {
      setBusy(false)
    }
  }

  async function submitMemo() {
    const content = memoText.trim()
    if (!content) return
    setMemoBusy(true)
    setErr(null)
    try {
      await addReservationMemo(row.id, content)
      setMemoText('')
      memos.reload()
    } catch (e) {
      setErr(why(e, '메모를 저장하지 못했습니다.'))
    } finally {
      setMemoBusy(false)
    }
  }

  async function removeMemo(memoId: number) {
    setMemoBusy(true)
    setErr(null)
    try {
      await deleteReservationMemo(memoId)
      setDelMemo(null)
      memos.reload()
    } catch (e) {
      setErr(why(e, '메모를 지우지 못했습니다.'))
    } finally {
      setMemoBusy(false)
    }
  }

  return (
    <>
      <Modal
        title={`${row.studentName ?? '이름 없음'} 입학 상담`}
        sub={row.rsvCd ? `접수번호 ${row.rsvCd} · ${dateOnly(row.createdAt)} 접수` : `${dateOnly(row.createdAt)} 접수`}
        confirmLabel="상태 저장"
        busy={busy}
        error={err}
        onConfirm={() => void submitStatus()}
        onClose={onClose}
      >
        {done && (
          <div className="note-box" role="status">
            <div>{done}</div>
          </div>
        )}

        <div className="frow">
          <label>연락처</label>
          <div>
            학생 {row.studentTel ?? '-'} · 학부모 {row.parentTel ?? '-'}
          </div>
        </div>
        <div className="frow">
          <label>학교 · 학년</label>
          <div>
            {row.schoolName ?? '-'} ·{' '}
            {row.stdGrade ? (STD_GRADE_LABEL[row.stdGrade] ?? row.stdGrade) : '-'}
          </div>
        </div>
        <div className="frow">
          <label>생년 · 성별</label>
          <div>
            {detail.loading && detail.data === null ? (
              '불러오는 중…'
            ) : (
              <>
                {formatYmd(d?.birth ?? null) ?? '-'} ·{' '}
                {d?.gender ? (GENDER_LABEL[d.gender] ?? d.gender) : '-'}
              </>
            )}
          </div>
        </div>
        <div className="frow">
          <label>등원 희망일</label>
          <div>{formatYmd(d?.admissionDate ?? null) ?? '-'}</div>
        </div>
        <div className="frow">
          <label>내신</label>
          <div>
            {d?.schoolRecord != null ? `주요교과평균 ${d.schoolRecord}등급` : '-'}
            {d?.schoolType != null && (
              <div className="hint">{SCHOOL_TYPE_LABEL[d.schoolType] ?? '내신 종류 미확인'}</div>
            )}
            {d?.universityName && (
              <div className="hint">
                {d.universityName}
                {d.universityGrade != null ? ` · ${d.universityGrade}등급` : ''}
              </div>
            )}
          </div>
        </div>
        <div className="frow">
          <label>출신 학원 · 경로</label>
          <div>
            {/* ★ 코드 숫자를 그대로 쓰지 않는다. 이름 목록이 아직 비어 있어
                   「유입경로 3」이 되는데, 담당자가 읽어도 할 일이 달라지지 않는다 */}
            {d?.foundPathText ? (
              d.foundPathText
            ) : (
              <Unfilled reason="출신학원·유입경로·전형·입학기준이 코드 숫자로만 오고 이름 목록이 아직 비어 있다" />
            )}
          </div>
        </div>
        <div className="frow">
          <label>주소</label>
          <div>
            {d?.address ? (
              <>
                {d.address} {d.addressDetail ?? ''}
                {d.zipCode && <div className="hint">우편번호 {d.zipCode}</div>}
              </>
            ) : (
              '-'
            )}
          </div>
        </div>
        <div className="frow">
          <label>동의</label>
          <div>
            개인정보 {d?.agreePrivacy ? '동의' : '미동의'} · 마케팅 {d?.agreeMarketing ? '동의' : '미동의'}
          </div>
        </div>

        <div className="frow">
          <label>상태</label>
          <div>
            <select className="inp" value={status} onChange={(e) => setStatus(e.target.value as ReservationStatus)}>
              {RESERVATION_FLOW.map((s) => (
                <option key={s} value={s}>
                  {RESERVATION_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <div className="hint">
              지금은 <b>{row.statusName ?? RESERVATION_STATUS_LABEL[row.status]}</b> 입니다.
            </div>
          </div>
        </div>
        <div className="frow">
          <label>이유</label>
          <div>
            <input
              className="inp"
              placeholder={REASON_EXPECTED.includes(status) ? '왜 그렇게 됐는지 적어 주세요' : '선택'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="hint">
              {REASON_EXPECTED.includes(status)
                ? '적어 두면 나중에 떨어진 이유를 셀 수 있습니다.'
                : '적지 않아도 저장됩니다.'}
            </div>
          </div>
        </div>

        <div className="frow">
          <label>원생 전환</label>
          <div>
            {row.converted ? (
              <div>
                학번 <b>{row.studentNo ?? '-'}</b> 으로 전환이 끝났습니다.
              </div>
            ) : row.status === 'CONFIRMED' ? (
              <>
                <button className="btn" type="button" onClick={() => setConvert(true)}>
                  원생으로 전환
                </button>
                <div className="hint">전환하면 학생이 만들어지고 되돌릴 수 없습니다.</div>
              </>
            ) : (
              /* ★ 서버가 **입학 확정에서만** 전환을 받는다. 다른 상태에서 버튼을 주면
                    눌러도 400 이라 "저장이 안 된다"로 읽힌다(2026-10-06 로컬 확인) */
              <>
                <button className="btn" type="button" disabled data-soon title="입학 확정으로 옮긴 뒤 전환할 수 있습니다">
                  원생으로 전환
                </button>
                <div className="hint">먼저 상태를 「입학 확정」으로 옮겨 주세요.</div>
              </>
            )}
          </div>
        </div>

        <div className="frow">
          <label>메모</label>
          <div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="inp"
                placeholder="통화 내용 · 다음에 할 일"
                value={memoText}
                onChange={(e) => setMemoText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void submitMemo()
                  }
                }}
              />
              <button className="btn" type="button" disabled={memoBusy || !memoText.trim()} onClick={() => void submitMemo()}>
                추가
              </button>
            </div>
            {memos.error && <div className="hint">{memos.error}</div>}
            {(memos.data ?? []).length === 0 && !memos.loading && <div className="hint">아직 메모가 없습니다.</div>}
            {(memos.data ?? []).map((m) => (
              <div key={m.id} className="lead-foot" style={{ marginTop: 6 }}>
                <span className="src">
                  {m.content} <span className="mk">{dateOnly(m.createdAt)}</span>
                </span>
                <button className="btn" type="button" disabled={memoBusy} onClick={() => setDelMemo(m.id)}>
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="frow">
          <label>상태 이력</label>
          <div>
            {logs.error && <div className="hint">{logs.error}</div>}
            {(logs.data ?? []).length === 0 && !logs.loading && <div className="hint">바뀐 적이 없습니다.</div>}
            {(logs.data ?? []).map((l) => (
              <div key={l.id} className="lead-meta">
                {l.fromStatus ? RESERVATION_STATUS_LABEL[l.fromStatus] : '접수'} →{' '}
                <b>{RESERVATION_STATUS_LABEL[l.toStatus]}</b>
                {l.reason ? ` · ${l.reason}` : ''} <span className="mk">{dateOnly(l.changedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {delMemo !== null && (
        <Modal
          title="메모 삭제"
          sub="지우면 되돌릴 수 없습니다."
          confirmLabel="삭제"
          busy={memoBusy}
          onConfirm={() => void removeMemo(delMemo)}
          onClose={() => setDelMemo(null)}
        >
          <div>이 메모를 지웁니다.</div>
        </Modal>
      )}

      {convert && (
        <ConvertModal
          row={row}
          onClose={() => setConvert(false)}
          onDone={() => {
            setConvert(false)
            onChanged()
            onClose()
          }}
        />
      )}
    </>
  )
}

/** 전환은 학년과 등원일이 필요하다. 둘 다 서버가 추론하지 않는다 */
function ConvertModal({ row, onClose, onDone }: { row: ReservationRow; onClose: () => void; onDone: () => void }) {
  const [grade, setGrade] = useState<ConvertGrade>('N_SU')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!date) {
      setErr('등원일을 골라 주세요.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await convertReservation(row.id, { grade, admissionDate: date })
      onDone()
    } catch (e) {
      setErr(why(e, '전환하지 못했습니다.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="원생으로 전환"
      sub={`${row.studentName ?? '이름 없음'} 학생을 재원생으로 만듭니다.`}
      confirmLabel="전환"
      busy={busy}
      error={err}
      confirmDisabled={!date}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <div className="note-box">
        <div>
          전환하면 <b>학번이 발급되고 되돌릴 수 없습니다.</b> 학년과 등원일은 나중에 학생 정보에서 고칠 수 있습니다.
        </div>
      </div>
      <div className="frow">
        <label>학년</label>
        <div>
          <select className="inp" value={grade} onChange={(e) => setGrade(e.target.value as ConvertGrade)}>
            {CONVERT_GRADES.map((g) => (
              <option key={g} value={g}>
                {CONVERT_GRADE_LABEL[g]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="frow">
        <label>등원일</label>
        <div>
          <input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="hint">첫 등원 예정일입니다.</div>
        </div>
      </div>
    </Modal>
  )
}

export const admissionMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled data-soon title="준비 중입니다">
        기수 선택 ▾
      </button>
      <button className="btn" disabled data-soon title="준비 중입니다">
        문자 자동발송 설정
      </button>
      <button className="btn" disabled data-soon title="접수는 입학예약폼으로 들어옵니다">
        + 예약 수동등록
      </button>
    </>
  ),
}
