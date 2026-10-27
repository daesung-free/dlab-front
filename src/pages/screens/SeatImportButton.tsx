import { useMemo, useState } from 'react'
import { Modal } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { assignSeatsBulk, listSeatAreas, listSeatMasters, type SeatArea } from '../../api/facility'
import { searchStudents } from '../../api/students'

/* 좌석 일괄 배정 — 엑셀에서 긁어 붙여넣는다 (F-C-4 독서실 좌석배치표)
 *
 * ★★ **왜 파일이 아니라 붙여넣기인가.** 서버에 좌석용 업로드 경로가 없어 파싱이 화면 몫이다.
 *   .xlsx 를 읽으려면 라이브러리를 들여야 하는데, 담당자는 **엑셀에서 두 칸을 긁어 붙이는 것**이
 *   더 빠르다. 엑셀 복사는 탭으로 구분된 글자라 그대로 읽힌다. CSV 붙여넣기도 받는다.
 *
 * ★★ **좌석번호만으로는 자리를 못 찾는 지점이 있다**(2026-10-26 실측).
 *   본관·별관이 **같은 구역명·같은 좌석번호**를 쓴다 — 목동은 그렇게 100개가 겹친다.
 *   그래서 겹칠 때는 추측하지 않고 **그 행을 오류로 돌린다.** 「본관 A구역 1번」인지
 *   「별관 A구역 1번」인지는 사람만 안다. 잘못 고르면 **남의 자리에 앉힌다.**
 *
 * ★ **전부-아니면-전무다**(`assignSeatsBulk`). 절반만 들어가면 배치가 뒤죽박죽 되는데
 *   되돌릴 기준이 화면에 없다. 그래서 **오류가 한 줄이라도 있으면 아예 보내지 않는다** —
 *   「정상 행만 넣기」를 허용하면 담당자는 전부 들어간 줄 알고 넘어간다.
 *
 * ★ 자리를 옮기는 것도 이걸로 된다. 이미 앉은 학생을 다른 자리에 넣으면 서버가 원래
 *   자리를 비운다(먼저 해제할 필요가 없다).
 */

/** 붙여넣은 한 줄을 읽은 결과 */
interface ParsedRow {
  line: number
  studentNo: string
  seatCd: string
  /** 「본관」처럼 적었으면 들어온다. 겹치는 좌석번호를 가를 때만 쓴다 */
  building: string | null
  /** 「A구역」처럼 적었으면 들어온다 */
  areaNm: string | null
}

interface ResolvedRow extends ParsedRow {
  studentName: string | null
  enrollmentId: number | null
  seatId: number | null
  /** 어느 자리로 가는지 사람이 읽는 말 — 「본관 A구역 1」 */
  seatLabel: string | null
  error: string | null
}

/** 엑셀 복사는 탭, 손으로 적으면 쉼표를 쓴다. 둘 다 받는다 */
function splitCells(line: string): string[] {
  return (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim())
}

/** 첫 줄이 「학번  좌석번호」 같은 머리글이면 건너뛴다 — 안 하면 1행이 늘 오류로 나온다 */
function isHeader(cells: string[]): boolean {
  return cells.some((c) => /학번|좌석|구역|관$|이름/.test(c)) && !cells.some((c) => /^\d{4}-\d+$/.test(c))
}

function parse(text: string): ParsedRow[] {
  const out: ParsedRow[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (line === '') return
    const cells = splitCells(line)
    if (i === 0 && isHeader(cells)) return
    /* 칸 순서를 고정하지 않는다. 담당자가 만든 엑셀이라 열 순서가 제각각이다 —
       학번은 생김새로(2026-0002), 구역·관은 글자로 알아보고, 남는 숫자가 좌석번호다 */
    let studentNo = ''
    let building: string | null = null
    let areaNm: string | null = null
    const rest: string[] = []
    for (const c of cells) {
      if (c === '') continue
      if (studentNo === '' && /^\d{4}-\d+$/.test(c)) studentNo = c
      else if (/구역$/.test(c)) areaNm = c
      else if (/관$/.test(c)) building = c
      else rest.push(c)
    }
    /* 학번이 「2026-0002」 꼴이 아닐 수도 있다. 그러면 첫 칸을 학번으로 본다 */
    if (studentNo === '' && rest.length > 0) studentNo = rest.shift() ?? ''
    out.push({ line: i + 1, studentNo, seatCd: rest[0] ?? '', building, areaNm })
  })
  return out
}

interface SeatRef {
  seatId: number
  seatCd: string
  areaNm: string
  buildingName: string
}

export function SeatImportButton({
  academyId,
  onDone,
}: {
  academyId: number | null
  /** 반영 뒤 배치도를 다시 읽게 한다 */
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ResolvedRow[] | null>(null)
  const [applied, setApplied] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const bad = useMemo(() => (rows ?? []).filter((r) => r.error !== null), [rows])
  const good = useMemo(() => (rows ?? []).filter((r) => r.error === null), [rows])
  const hasError = bad.length > 0

  function reset() {
    setText('')
    setRows(null)
    setApplied(null)
    setErr(null)
  }

  /** 미리보기 — 서버에 아무것도 보내지 않는다. 학생·좌석 목록만 읽어 맞춰 본다 */
  async function preview() {
    if (academyId === null) return
    const parsed = parse(text)
    if (parsed.length === 0) {
      setErr('읽을 내용이 없습니다. 엑셀에서 학번과 좌석번호 두 칸을 복사해 붙여넣습니다.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const areas: SeatArea[] = await listSeatAreas(academyId)
      /* 좌석은 구역마다 따로 받는다. 전 구역을 훑는 경로가 없다 */
      const seatLists = await Promise.all(
        areas.map(async (a) => {
          const masters = await listSeatMasters(a.id)
          return masters.map<SeatRef>((m) => ({
            seatId: m.id,
            seatCd: m.seatCd,
            areaNm: a.areaNm,
            buildingName: a.buildingName ?? '',
          }))
        }),
      )
      const seats = seatLists.flat()
      /* ★ 지점 전체를 받는다. 자리 없는 학생만 받으면 **옮기는 행이 전부 오류**가 된다 */
      const students = (await searchStudents({ academyId, size: 500 })).rows
      const byNo = new Map(students.filter((s) => s.studentNo !== null).map((s) => [s.studentNo as string, s]))

      const seen = new Map<string, number>()
      const resolved: ResolvedRow[] = parsed.map((r) => {
        const base: ResolvedRow = {
          ...r,
          studentName: null,
          enrollmentId: null,
          seatId: null,
          seatLabel: null,
          error: null,
        }
        if (r.studentNo === '' || r.seatCd === '') {
          return { ...base, error: '학번과 좌석번호가 모두 있어야 합니다.' }
        }
        const student = byNo.get(r.studentNo)
        if (student === undefined) {
          return { ...base, error: `이 지점에 학번 ${r.studentNo} 인 학생이 없습니다.` }
        }
        let cands = seats.filter((s) => s.seatCd === r.seatCd)
        if (r.areaNm !== null) cands = cands.filter((s) => s.areaNm === r.areaNm)
        if (r.building !== null) cands = cands.filter((s) => s.buildingName === r.building)
        if (cands.length === 0) {
          return {
            ...base,
            studentName: student.name,
            error: `${r.areaNm ?? ''} ${r.seatCd}번 좌석을 찾을 수 없습니다.`.trim(),
          }
        }
        if (cands.length > 1) {
          /* ★ 추측하지 않는다. 본관·별관이 같은 번호를 쓰는 지점이 있다 */
          const where = cands.map((c) => `${c.buildingName} ${c.areaNm}`).join(' · ')
          return {
            ...base,
            studentName: student.name,
            error: `${r.seatCd}번이 여러 곳에 있습니다(${where}). 관·구역을 함께 입력해 주세요.`,
          }
        }
        const seat = cands[0]
        /* 같은 자리를 두 번 적으면 서버가 전체를 되돌린다 — 보내기 전에 잡는다 */
        const dupLine = seen.get(String(seat.seatId))
        if (dupLine !== undefined) {
          return {
            ...base,
            studentName: student.name,
            error: `${seat.seatCd}번을 ${dupLine}줄에서도 지정했습니다.`,
          }
        }
        seen.set(String(seat.seatId), r.line)
        return {
          ...base,
          studentName: student.name,
          enrollmentId: student.enrollmentId,
          seatId: seat.seatId,
          seatLabel: `${seat.buildingName} ${seat.areaNm} ${seat.seatCd}`.trim(),
        }
      })
      setRows(resolved)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '학생·좌석 목록을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (rows === null || bad.length > 0 || good.length === 0) return
    setBusy(true)
    setErr(null)
    try {
      await assignSeatsBulk(
        good.map((r) => ({ seatId: r.seatId as number, enrollmentId: r.enrollmentId as number })),
      )
      setApplied(good.length)
      onDone()
    } catch (e) {
      /* 서버 문구에 자리 번호가 들어 있어 그대로 보여주면 된다 */
      setErr(e instanceof ApiError ? e.message : '배정하지 못했습니다. 아무것도 반영되지 않았습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="btn"
        disabled={academyId === null}
        title={academyId === null ? '지점을 먼저 선택해 주세요' : undefined}
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        <Icon name="upload" size={14} /> 엑셀로 일괄 배정
      </button>

      {open && (
        <Modal
          wide
          title="좌석 일괄 배정"
          sub={
            applied === null
              ? '엑셀에서 학번과 좌석번호를 복사해 붙여넣으면 먼저 맞춰 봅니다.'
              : '반영했습니다.'
          }
          confirmLabel={applied === null ? '배정' : '닫기'}
          busy={busy}
          error={err}
          confirmDisabled={applied === null && (rows === null || hasError || good.length === 0)}
          onConfirm={() => (applied === null ? void apply() : setOpen(false))}
          onClose={() => setOpen(false)}
        >
          {applied === null && (
            <>
              <div className="frow">
                <label className="req">명단</label>
                <div>
                  <textarea
                    className="inp"
                    rows={7}
                    style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                    placeholder={'2026-0002\t15\n2026-0003\t16\n2026-0004\t101'}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value)
                      setRows(null)
                    }}
                  />
                  <div className="hint">
                    한 줄에 한 명씩 <b>학번 · 좌석번호</b> 순서로 입력합니다. 엑셀에서 두 칸을 긁어
                    붙여넣으면 그대로 읽힙니다. 첫 줄 머리글은 제외됩니다.
                    <br />
                    같은 좌석번호가 <b>본관과 별관에 모두 있는 지점</b>이 있습니다 — 그때는{' '}
                    <b>관·구역을 같은 줄에 함께</b> 입력합니다(예: <code>2026-0002 본관 A구역 1</code>).
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn"
                disabled={text.trim() === '' || busy}
                onClick={() => void preview()}
                style={{ marginBottom: 10 }}
              >
                <Icon name="eye" size={14} /> {busy && rows === null ? '맞춰 보는 중…' : '맞춰 보기'}
              </button>

              {rows !== null && (
                <>
                  <div
                    className="note-box"
                    role="status"
                    style={hasError ? { borderColor: 'var(--red)' } : undefined}
                  >
                    <div>
                      <b>아직 배정하지 않았습니다. </b>
                      전체 {rows.length}줄 · 정상 <b>{good.length}</b>줄 · 오류{' '}
                      <b style={{ color: hasError ? 'var(--red)' : undefined }}>{bad.length}</b>줄
                      {hasError && (
                        <>
                          {' '}
                          — <b>오류를 수정해야 배정할 수 있습니다.</b> 좌석 배정은 중간에 끊기면
                          되돌릴 기준이 없어 <b>한 줄이라도 틀리면 전부 보내지 않습니다.</b>
                        </>
                      )}
                    </div>
                  </div>

                  {hasError && (
                    <div style={{ maxHeight: 180, overflow: 'auto', marginBottom: 10 }}>
                      <table className="dt" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ width: 54 }}>줄</th>
                            <th style={{ width: 110 }}>학번</th>
                            <th>무엇이 틀렸나</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bad.map((r) => (
                            <tr key={r.line}>
                              <td>{r.line}</td>
                              <td>{r.studentNo || '-'}</td>
                              <td style={{ color: 'var(--red)' }}>{r.error}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {good.length > 0 && (
                    <div style={{ maxHeight: 240, overflow: 'auto' }}>
                      <table className="dt nowrap" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ width: 54 }}>줄</th>
                            <th style={{ width: 110 }}>학번</th>
                            <th style={{ width: 90 }}>이름</th>
                            <th>앉을 자리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {good.map((r) => (
                            <tr key={r.line}>
                              <td>{r.line}</td>
                              <td>{r.studentNo}</td>
                              <td>{r.studentName}</td>
                              <td>
                                <b>{r.seatLabel}</b>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {applied !== null && (
            <div className="note-box" role="status" style={{ borderColor: 'var(--green)' }}>
              <div>
                <b>{applied}명</b>을 배정했습니다. 이미 다른 자리에 앉아 있던 학생은 원래 자리가
                비워졌습니다.
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
