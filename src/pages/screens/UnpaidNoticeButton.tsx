import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import {
  isTemporaryBlock,
  listManualTemplates,
  previewManualSend,
  sendManual,
  type ManualPreview,
  type NotificationTemplate,
} from '../../api/notifications'
import { searchStudents, type Student } from '../../api/students'

/* 미납 안내 알림톡 (F-4.8 수납현황 · 미납자 관리)
 *
 * ★ **직원 발송(F-4.4)과 같은 경로를 쓴다**(`/notifications/manual/*`). 발송 규약을
 *   두 번 만들지 않는다 — 미리보기 게이트·previewId 1회 사용이 거기 이미 들어 있다.
 *
 * ★★ **미납은 「건」이고 알림톡은 「사람」에게 간다.** 한 학생이 세 달 밀리면 표에서는
 *   세 줄이다. 그대로 보내면 **같은 학부모에게 세 통**이 간다 — 학번으로 묶는다.
 *   화면이 「3건 선택 → 2명에게 발송」을 먼저 보여줘야 담당자가 놀라지 않는다.
 *
 * ★★ **문구에 금액이 없다.** 승인된 문안이 「{studentName} 학생의 {월} 등록비가 미납
 *   상태입니다」뿐이라 **학생마다 다른 미납액을 담을 자리가 없다.** 금액을 넣으려면
 *   템플릿 재심사가 필요하다 — 화면이 그 말을 해야 담당자가 「금액이 왜 안 나가지」를
 *   찾지 않는다.
 *
 * ★ **`{월}` 은 한 번만 보낸다.** 템플릿 변수가 전원 공통이라, 고른 줄의 대상월이
 *   섞여 있으면 **한 달을 골라야 한다.** 섞인 채로 보내면 10월 미납자에게 9월이라고 간다.
 *
 * ⚠️ **테스트 모드가 꺼져 있어 실제로 나가고 과금된다**(2026-10-26). 그래서 보내기 전에
 *   한 번 더 묻고, 미리보기를 거치지 않으면 버튼이 열리지 않는다.
 *
 * ★★ **「연락처를 등록하면 나간다」고 쓰지 않는다.** 학부모 대상 발송은 번호가 아니라
 *   **보호자 연락처**로 수신자를 찾는다 — 앱 계정이 없어도 번호가 있으면 발송된다
 *   (dlab-api #290 · 2026-10-26 배포). 그래서 **연락처가 없는 학생만** 제외된다.
 *   ⚠️ 앱 출시 전까지는 **수신 허용목록**이 걸릴 수 있다. ★ **목록이 비면 전원 통과**다
 *   (서버 코드로 확인 2026-10-29). 지금은 운영에 1개가 들어 있어 **적용 중**이지만,
 *   **비우는 순간 전원 발송으로 바뀐다** — 그래서 화면은 **「목록에 있는 번호로만 나간다」고
 *   단정하지 않는다.** ★ 대신 **미리보기 인원수**를 보게 한다. 미리보기와 발송이 같은
 *   기준이라 **그 수가 서버 판정 그 자체**이고, 목록을 비우면 **그 수가 커진다.**
 */

/** 서버가 쓰는 미납 안내 이벤트 */
const UNPAID_EVENT = 'TUITION_UNPAID_NOTICE'

/**
 * 「발송 대상이 없습니다」를 **왜 없는지**로 바꾼다.
 *
 * ★ 서버가 `error.data.summary` 로 사유별 인원을 준다(dlab-api #297).
 *   그대로 「대상이 없습니다」만 띄우면 담당자는 **화면 고장으로 읽거나, 고칠 것을 못 찾는다.**
 * ★ **사유를 우리 말로 바꾸지 않는다** — 서버가 종류를 늘리면 화면만 낡는다. 아는 것만
 *   풀어 쓰고 모르는 코드는 **건수만** 보여준다.
 * ⚠️ **후보 자체가 0명인 경우는 다른 문장이다** — 같은 문장을 주면 담당자가 수신 설정을
 *   뒤진다. 그쪽은 화면이 먼저 걸러 여기까지 오지 않는다.
 */
const REASON_LABEL: Record<string, string> = {
  /* ★★ **`NO_GUARDIAN` 과 `NO_PHONE` 은 할 일이 다르다**(2026-10-29 서버 확인).
         보호자를 **등록**해야 하는 것과, 등록된 보호자에게 **번호를 채워야** 하는 것이다.
         한 말로 묶으면 담당자가 학생 화면을 열어 놓고 무엇을 고칠지 모른다. */
  NO_GUARDIAN: '보호자가 등록되지 않음',
  NO_PHONE: '보호자 연락처가 비어 있음',
  /* ★ 학생에게 보내는 알림에서만 나온다 — 학부모 알림에서는 이 사유가 나오지 않는다.
       ⚠️ 한때 보호자 알림에도 이 사유가 붙어 **「앱 가입이 필요합니다」로 안내**됐는데,
         실제로 해야 할 일은 **연락처 등록**이었다(서버가 고쳤다 · dlab-api #305). */
  NO_ACCOUNT: '앱 계정이 없음',
  NOT_IN_ALLOWLIST: '이관 기간 수신 허용목록 밖',
  OPTED_OUT: '수신 거부',
  NOT_ENROLLED: '재원 상태가 아님',
  OTHER_ACADEMY: '다른 지점 학생',
}

function noTargetReason(e: ApiError): string | null {
  if (!/대상이 없습니다|NO_TARGET/.test(e.message)) return null
  const summary = (e.data as { summary?: Record<string, number> } | undefined)?.summary
  const parts = Object.entries(summary ?? {})
    .filter(([, n]) => n > 0)
    .map(([code, n]) => `${REASON_LABEL[code] ?? code} ${n}명`)
  return parts.length > 0
    ? `보낼 수 있는 보호자가 없습니다 — ${parts.join(' · ')}.`
    : '보낼 수 있는 보호자가 없습니다. 보호자 연락처를 먼저 등록해 주세요.'
}

export interface UnpaidTarget {
  billingId: number
  studentNo: string | null
  studentName: string
  /** 'yyyy-MM'. 섞여 있으면 담당자가 하나를 고른다 */
  serviceMonth: string | null
  unpaid: number
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

/** 'yyyy-MM' → '10월'. 템플릿의 {월} 에 들어간다 */
function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7))
  return Number.isNaN(m) ? ym : `${m}월`
}

export function UnpaidNoticeButton({
  academyId,
  targets,
  onSent,
}: {
  academyId: number | null
  /** 표에서 고른 미납 건 */
  targets: UnpaidTarget[]
  onSent: () => void
}) {
  const [open, setOpen] = useState(false)
  const [template, setTemplate] = useState<NotificationTemplate | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [month, setMonth] = useState('')
  const [prev, setPrev] = useState<ManualPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  /** 학번 → 학생. 보호자 번호 확인과 enrollmentId 변환에 함께 쓴다 */
  const [byNo, setByNo] = useState<Map<string, Student> | null>(null)

  /** ★ 학번으로 묶는다 — 한 사람에게 여러 통이 가지 않게 */
  const people = useMemo(() => {
    const m = new Map<string, { studentNo: string; studentName: string; unpaid: number; count: number }>()
    for (const t of targets) {
      if (t.studentNo === null) continue
      const cur = m.get(t.studentNo)
      if (cur === undefined) {
        m.set(t.studentNo, { studentNo: t.studentNo, studentName: t.studentName, unpaid: t.unpaid, count: 1 })
      } else {
        cur.unpaid += t.unpaid
        cur.count += 1
      }
    }
    return [...m.values()]
  }, [targets])

  /** 고른 줄의 대상월 — 하나뿐이면 그대로 쓰고, 섞였으면 고르게 한다 */
  const months = useMemo(() => {
    const s = new Set(targets.map((t) => t.serviceMonth).filter((v): v is string => v !== null && v !== ''))
    return [...s].sort()
  }, [targets])

  /** 학번이 없는 건은 보낼 수 없다 — 누구인지 서버가 못 찾는다 */
  const noStudentNo = targets.filter((t) => t.studentNo === null).length

  useEffect(() => {
    if (!open) return
    setMonth(months.length === 1 ? months[0] : '')
    setPrev(null)
    setErr(null)
    setSent(null)
    setLoadErr(null)
    void (async () => {
      try {
        /* ★ 템플릿과 학생을 **같이** 읽는다. 보호자 번호가 없으면 한 통도 못 나가는데,
             그걸 미리보기를 눌러 본 뒤에 알면 늦다 */
        const [rows, students] = await Promise.all([
          listManualTemplates(),
          academyId === null ? Promise.resolve({ rows: [] as Student[] }) : searchStudents({ academyId, size: 500 }),
        ])
        const hit = rows.find((r) => r.event === UNPAID_EVENT) ?? null
        setTemplate(hit)
        setByNo(new Map(students.rows.filter((x) => x.studentNo !== null).map((x) => [x.studentNo as string, x])))
        if (hit === null) setLoadErr('미납 안내 문구가 아직 등록되지 않았습니다.')
      } catch (e) {
        setLoadErr(e instanceof ApiError ? e.message : '문구를 불러오지 못했습니다.')
      }
    })()
  }, [open, months, academyId])

  /* ★★ 조건이 바뀌면 미리보기를 버린다. 안 버리면 **본 것과 다른 사람에게 나간다** */
  useEffect(() => {
    setPrev(null)
    setSent(null)
  }, [month, targets])

  async function runPreview() {
    if (academyId === null || template === null || month === '') return
    setBusy(true)
    setErr(null)
    try {
      /* 알림톡은 등록 건(enrollmentId)으로 보낸다. 미납 표는 학번만 들고 있어 한 번 맞춘다 */
      const map = byNo ?? new Map<string, Student>()
      const ids = people.map((p) => map.get(p.studentNo)?.enrollmentId).filter((v): v is number => v !== undefined)
      if (ids.length === 0) {
        setErr('보낼 수 있는 학생이 없습니다. 선택한 건의 학번을 확인해 주세요.')
        return
      }
      setPrev(
        await previewManualSend({
          templateId: template.id,
          academyId,
          scope: 'SELECTED',
          enrollmentIds: ids,
          variables: { 월: monthLabel(month) },
        }),
      )
    } catch (e) {
      /* 404 는 우리 사정이다 — 「경로를 찾을 수 없습니다」를 담당자에게 띄우지 않는다 */
      /* ★★ **0명일 때 왜 0명인지를 보여준다**(dlab-api #297 · 2026-10-28 배포).
           전에는 「발송 대상이 없습니다」 한 줄뿐이라 **담당자가 무엇을 고쳐야 하는지
           알 방법이 없었다** — 연락처가 없어서인지, 허용목록 때문인지, 수신거부인지.
           이제 서버가 `error.data.summary` 로 사유별 인원을 준다. */
      setErr(
        e instanceof ApiError && e.status === 404
          ? '미납 안내 발송은 준비 중입니다.'
          : e instanceof ApiError
            ? (noTargetReason(e) ?? e.message)
            : '미리보기를 불러오지 못했습니다.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function runSend() {
    if (prev === null) return
    setBusy(true)
    setErr(null)
    try {
      const r = await sendManual(prev.previewId)
      setSent(
        r.skipped > 0
          ? `${r.requested}명에게 보냈습니다. ${r.skipped}명은 보내지 못했습니다 — 발송 이력에서 확인할 수 있습니다.`
          : `${r.requested}명에게 보냈습니다.`,
      )
      /* ★ 보낸 미리보기는 다시 못 쓴다(서버가 한 번만 받는다). 화면에서도 지워
           **두 번째 발송 버튼이 아예 안 보이게** 한다 */
      setPrev(null)
      onSent()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '보내지 못했습니다.')
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const blocked = template !== null && !template.sendable
  const totalUnpaid = people.reduce((a, p) => a + p.unpaid, 0)
  /* ★★ **이 안내는 보호자 번호로만 간다**(`recipientType: PARENT`). 학생 번호가 있어도
       소용없다 — 번호가 없으면 서버가 통째로 「발송 대상이 없습니다」로 돌려보낸다.
       미리보기를 누르기 **전에** 몇 명이 빠지는지 보여준다. */
  const noGuardian = byNo === null ? [] : people.filter((p) => {
    const st = byNo.get(p.studentNo)
    return st === undefined || st.guardianPhone === null || st.guardianPhone === undefined || st.guardianPhone === ''
  })
  const allMissing = byNo !== null && people.length > 0 && noGuardian.length === people.length
  const canPreview =
    academyId !== null && template !== null && !blocked && month !== '' && people.length > 0 && !allMissing

  return (
    <>
      <button
        className="btn"
        disabled={targets.length === 0}
        title={targets.length === 0 ? '보낼 미납 건을 먼저 선택해 주세요' : `${targets.length}건에 안내를 보냅니다`}
        onClick={() => setOpen(true)}
      >
        <Icon name="bell" size={14} /> 미납 안내 보내기
        {targets.length > 0 && ` ${targets.length}`}
      </button>

      {open && (
        <Modal
          wide
          title="미납 안내 알림톡"
          sub={sent === null ? '보내기 전에 받는 사람과 문구를 먼저 확인합니다.' : '발송했습니다.'}
          confirmLabel={sent !== null ? '닫기' : prev === null ? '보낼 내용 확인' : '보내기'}
          danger={prev !== null && sent === null}
          busy={busy}
          error={err ?? loadErr}
          confirmDisabled={sent === null && prev === null && !canPreview}
          onConfirm={() => {
            if (sent !== null) setOpen(false)
            else if (prev === null) void runPreview()
            else setConfirming(true)
          }}
          onClose={() => setOpen(false)}
        >
          {sent === null && (
            <>
              <div className="note-box">
                <div>
                  선택한 <b>{targets.length}건</b>을 학생으로 묶어 <b>{people.length}명</b>에게 보냅니다.
                  미납 합계 <b>{won(totalUnpaid)}</b>.
                  {targets.length !== people.length && (
                    <>
                      {' '}
                      같은 학생의 여러 달 미납은 <b>한 통으로 통합됩니다.</b>
                    </>
                  )}
                  {noStudentNo > 0 && (
                    <>
                      {' '}
                      <b style={{ color: 'var(--red)' }}>학번이 없는 {noStudentNo}건은 제외됩니다.</b>
                    </>
                  )}
                </div>
              </div>

              {noGuardian.length > 0 && (
                /* ★ 「없다」로 끝내지 않는다 — 어디서 채우는지까지 적어야 담당자가 움직인다 */
                <div className="note-box" style={{ borderColor: allMissing ? 'var(--red)' : 'var(--amber)' }}>
                  <div>
                    {allMissing ? (
                      <>
                        {/* ★★ **발송 조건을 화면이 단정하지 않는다.** 이 문장이 하루 사이에
                               두 번 틀렸다 — 「앱 가입 이후부터」(#290 으로 뒤집힘) →
                               「연락처만 등록하면」(수동 발송은 여전히 `NO_ACCOUNT` 를 준다).
                           ★ **연락처가 비어 있다는 것만** 말한다 — 그건 화면이 눈으로 아는
                             사실이다. **무엇을 채우면 가는지는 서버가 사유로 알려준다**
                             (0명일 때 `error.data.summary` · dlab-api #297). */}
                        선택한 <b>{people.length}명</b> 모두 <b>보호자 연락처가 없습니다.</b> 이
                        안내는 보호자에게 발송되므로 <b>현재 발송 대상이 없습니다.</b> 연락처는
                        학원생 화면에서 등록합니다.
                      </>
                    ) : (
                      <>
                        <b>{noGuardian.length}명</b>은 보호자 연락처가 없어 제외됩니다 (
                        {noGuardian.slice(0, 4).map((x) => x.studentName).join(' · ')}
                        {noGuardian.length > 4 && ` 외 ${noGuardian.length - 4}명`}). 나머지{' '}
                        <b>{people.length - noGuardian.length}명</b>에게만 발송됩니다.
                      </>
                    )}
                  </div>
                </div>
              )}

              {blocked && (
                <div className="note-box" style={{ borderColor: 'var(--red)' }}>
                  <div>
                    미납 안내 문구가 <b>아직 발송할 수 없는 상태</b>입니다. 문자 발송 화면의 「템플릿
                    관리」에서 상태를 확인합니다.
                  </div>
                </div>
              )}

              <div className="frow">
                <label className="req">대상월</label>
                <div>
                  {/* ★ 템플릿 변수가 전원 공통이라 한 달만 들어간다. 섞여 있으면 고르게 한다 */}
                  {months.length <= 1 ? (
                    <input className="inp" readOnly value={month === '' ? '-' : monthLabel(month)} />
                  ) : (
                    <select className="inp" value={month} onChange={(e) => setMonth(e.target.value)}>
                      <option value="">선택해 주세요</option>
                      {months.map((m) => (
                        <option key={m} value={m}>
                          {monthLabel(m)}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="hint">
                    {months.length > 1 ? (
                      <>
                        선택한 건의 대상월이 <b>{months.length}가지</b>라 한 달만 들어갑니다. 달마다
                        따로 보내야 합니다.
                      </>
                    ) : (
                      <>안내문에 들어갈 달입니다.</>
                    )}
                  </div>
                </div>
              </div>

              <div className="frow">
                <label>보낼 내용</label>
                <div>
                  <div className="note-box plain">
                    <div>
                      {template === null
                        ? '문구를 불러오는 중입니다.'
                        : (template.bodyTemplate ?? '').replace('{월}', month === '' ? '{월}' : monthLabel(month))}
                    </div>
                  </div>
                  {/* ★★ 금액이 안 들어간다는 말을 **보내기 전에** 해야 한다 */}
                  <div className="hint">
                    학생 이름은 받는 사람마다 자동 입력됩니다. <b>미납 금액은 안내문에 들어가지 않습니다</b> —
                    문구를 바꾸려면 재심사를 받아야 합니다.
                  </div>
                </div>
              </div>

              {prev !== null && (
                <div className="note-box" role="status" style={{ borderColor: 'var(--amber)' }}>
                  <div>
                    <b>{prev.targetCount}명</b>에게 발송됩니다. 아직 보내지 않았습니다 — 「보내기」를
                    누르면 <b>실제로 발송되고 비용이 발생합니다.</b>
                    {prev.blocked.length > 0 && (
                      <>
                        {' '}
                        <b style={{ color: 'var(--red)' }}>{prev.blocked.length}명은 제외됩니다.</b>
                      </>
                    )}
                  </div>
                </div>
              )}

              {prev !== null && prev.blocked.some((b) => isTemporaryBlock(b.reason)) && (
                /* ★ 설정 때문에 보류된 것은 **고칠 데이터가 없다.** 빨간 표에 섞으면
                     담당자가 번호가 없는 줄 알고 학생 정보를 뒤진다 */
                <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
                  <div>
                    이 가운데{' '}
                    <b>{prev.blocked.filter((b) => isTemporaryBlock(b.reason)).length}명</b>은 이관
                    기간이라 <b>허용한 번호로만 나가서 보류</b>됩니다. 학생 정보에는 문제가 없으니
                    고치실 것은 없습니다.
                  </div>
                </div>
              )}

              {prev !== null && prev.blocked.some((b) => !isTemporaryBlock(b.reason)) && (
                <div style={{ maxHeight: 150, overflow: 'auto', marginBottom: 10 }}>
                  <table className="dt" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>학생</th>
                        <th style={{ width: 100 }}>보호자</th>
                        <th>왜 빠지나</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prev.blocked
                        .filter((b) => !isTemporaryBlock(b.reason))
                        .map((b, i) => (
                          <tr key={i}>
                            <td>{b.studentName}</td>
                            {/* ★ 수신자가 **정해지기 전에** 걸린 사유는 빠진 사람이 특정되지
                                   않아 비어 온다. 「미지정」 같은 말을 넣지 않는다 —
                                   **그런 보호자가 있는 줄 안다.** '-' 로 둔다 */}
                            <td style={{ color: 'var(--muted)' }}>
                              {b.receiverName !== null && b.receiverName !== undefined && b.receiverName !== ''
                                ? b.receiverName
                                : '-'}
                            </td>
                            <td style={{ color: 'var(--red)' }}>{b.message}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ maxHeight: 220, overflow: 'auto' }}>
                <table className="dt nowrap" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>학번</th>
                      <th style={{ width: 90 }}>이름</th>
                      <th style={{ width: 70 }}>건수</th>
                      <th>미납액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.studentNo}>
                        <td>{p.studentNo}</td>
                        <td>{p.studentName}</td>
                        <td>{p.count}건</td>
                        <td>
                          <b>{won(p.unpaid)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {sent !== null && (
            <div className="note-box" role="status" style={{ borderColor: 'var(--green)' }}>
              <div>{sent}</div>
            </div>
          )}
        </Modal>
      )}

      {confirming && prev !== null && (
        <Modal
          title={`${prev.targetCount}명에게 미납 안내를 발송하시겠습니까?`}
          sub="되돌릴 수 없습니다."
          confirmLabel="보내기"
          danger
          busy={busy}
          onConfirm={() => void runSend()}
          onClose={() => setConfirming(false)}
        >
          <div className="note-box" style={{ borderColor: 'var(--red)' }}>
            <div>
              학부모에게 <b>실제로 알림톡이 나가고 비용이 발생합니다.</b> 보낸 뒤에는 취소할 수
              없습니다.
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
