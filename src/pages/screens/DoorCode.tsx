import { useEffect, useMemo, useState } from 'react'
import { DataTable, Modal, useServerData, type Column } from '../../components/common'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import {
  changedByLabel,
  listDoorCodeHistory,
  saveDoorCode,
  type DoorCode as DoorCodeRow,
} from '../../api/doorCodes'
import { createScreenSignal } from './screenSignal'
import type { Mockup } from './types'

/* 도어락 번호 (추가개발 8번) — /api/v1/admin/door-codes. src/api/doorCodes.ts 참고.
 *
 * 7시에 출입문이 안 열리면 학생이 출입문 QR 로 번호를 받아 간다. 그 번호를 지점 관리자가
 * 여기에 미리 넣어 두고, 08:00 이후 실물 도어락을 교체하면 새 번호를 넣는다.
 *
 * ★ **「현재 번호」 칸을 두지 않는다.** 서버도 번호를 내려주지 않는다 — 관리자는 실물
 *   도어락을 만지는 사람이라 지금 번호를 이미 알고, 화면에 띄우면 어깨 너머로 새는 경로가
 *   하나 늘어난다. 화면은 「마지막 교체 시각 · 교체한 사람」만 말한다.
 *
 * ★ **같은 값을 두 번 받는다.** 서버에 「이 번호가 맞나」를 확인하는 경로를 두면 그것이
 *   번호를 맞혀 보는 경로가 되어, 무인증 QR 쪽 대입 공격 면이 관리자 쪽에도 하나 더 생긴다.
 *   두 번 입력은 그 위험 없이 같은 목적을 달성한다.
 *
 * ★ **오타가 영구 손실이다.** 한 번 쓴 번호는 재사용이 막히므로 잘못 넣은 번호도 다시
 *   못 쓴다. 되돌리려면 올바른 번호로 한 번 더 등록하면 되지만, 잘못 넣은 번호는 영영
 *   빠진다 — 그래서 두 값이 다르면 저장을 막는다.
 */

/* 헤더 버튼 ↔ 본문. ScreenPage 가 둘을 따로 렌더해 props 로 내릴 자리가 없다 —
   다른 화면과 같은 자리(헤더 오른쪽)에 주요 버튼을 두려면 이 신호가 필요하다 */
const changeSignal = createScreenSignal()

/** ISO(UTC) → 'yyyy-MM-dd HH:mm' (로컬) */
function dateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 숫자만 4~12자리. 공백·하이픈은 서버가 흘려보내므로 비교할 때만 떼어낸다 */
const DIGITS = /^\d{4,12}$/

function digitsOf(v: string): string {
  return v.replace(/[\s-]/g, '')
}

function Content() {
  const { academyId, selectable } = useAcademy()
  const params = useMemo(() => ({ academyId: academyId ?? 0 }), [academyId])
  const history = useServerData({
    fetcher: ({ academyId: id }: { academyId: number }) => listDoorCodeHistory(id),
    params,
    enabled: academyId !== null,
    errorMessage: '교체 이력을 불러오지 못했습니다.',
  })

  const [open, setOpen] = useState(false)
  const signal = changeSignal.useVersion()
  useEffect(() => {
    if (signal > 0) setOpen(true)
  }, [signal])
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const rows = history.data ?? []
  const latest = rows[0] ?? null

  const cols: Column<DoorCodeRow>[] = useMemo(
    () => [
      { key: 'appliedAt', header: '변경 시각', width: '180px', sortable: true, value: (r) => dateTime(r.appliedAt) },
      { key: 'changedByName', header: '수정자', width: '140px', value: (r) => changedByLabel(r) },
    ],
    [],
  )

  function close() {
    setOpen(false)
    setCode('')
    setAgain('')
    setErr(null)
  }

  async function submit() {
    const a = digitsOf(code)
    const b = digitsOf(again)
    if (!DIGITS.test(a)) {
      setErr('번호는 숫자 4~12자리입니다.')
      return
    }
    if (a !== b) {
      setErr('두 번 입력한 번호가 다릅니다. 다시 확인해 주세요.')
      return
    }
    if (academyId === null) return
    setBusy(true)
    setErr(null)
    try {
      await saveDoorCode(academyId, a)
      setDone('새 번호를 등록했습니다. 내일 아침 7시부터 이 번호가 안내됩니다.')
      close()
      history.reload()
    } catch (e) {
      /* 재사용 거절(「전에 쓴 번호입니다」)처럼 서버 문구가 이유를 그대로 말해준다 —
         "저장하지 못했습니다" 로 덮으면 담당자가 왜 막혔는지 모른다 */
      setErr(e instanceof ApiError ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  if (selectable && academyId === null) {
    return (
      <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
        <div>
          <b>위에서 지점을 먼저 고르세요.</b> 도어락 번호는 지점마다 따로 저장합니다.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="note-box">
        <div>
          학생이 아침 7시에 출입문 QR 로 받아 가는 번호입니다. <b>오전 8시 이후</b> 실제 도어락을
          교체하고 새 번호를 여기에 넣어 주세요. <b>한 번 쓴 번호는 다시 쓸 수 없습니다.</b>
        </div>
      </div>

      {done && (
        <div className="note-box" role="status">
          <div>{done}</div>
        </div>
      )}

      <div className="stat-strip c2" style={{ marginTop: 10 }}>
        <div className="stat">
          <div className="l">마지막 변경</div>
          <div className="v">{latest?.appliedAt ? dateTime(latest.appliedAt) : '아직 없음'}</div>
          <div className="d">{latest ? `수정자 ${changedByLabel(latest)}` : '등록된 번호가 없습니다'}</div>
        </div>
        <div className="stat">
          <div className="l">변경 횟수</div>
          <div className="v">{rows.length}</div>
          <div className="d">지금까지 등록한 번호</div>
        </div>
      </div>

      {/* ★ 번호를 보여주는 칸은 두지 않는다 — 서버도 주지 않는다(파일 상단 주석).
             교체 버튼은 다른 화면과 같이 **헤더 오른쪽**에 둔다 */}
      {history.error && (
        <div className="note-box" style={{ borderColor: 'var(--rose)' }} role="status">
          <div>{history.error}</div>
        </div>
      )}

      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(r) => String(r.id)}
        loading={history.loading}
        pageSize={15}
        emptyText="아직 등록된 번호가 없습니다."
      />

      {open && (
        <Modal
          title="도어락 번호 교체"
          sub="실제 도어락에 넣은 번호를 그대로 적어 주세요."
          confirmLabel="저장"
          busy={busy}
          error={err}
          onConfirm={() => void submit()}
          onClose={close}
        >
          <div className="note-box">
            <div>
              저장한 번호는 <b>다시 볼 수 없습니다.</b> 한 번 쓴 번호는 재사용할 수 없으니, 잘못
              적으면 그 번호를 영구히 쓸 수 없게 됩니다 — 그래서 두 번 받습니다.
            </div>
          </div>
          <div className="frow">
            <label>새 번호</label>
            <div>
              {/* ★ Modal 안 숫자 입력에 step 을 걸지 않는다 — 배수가 아니면 브라우저가
                     제출을 막아 "저장 버튼이 안 먹는다" 로 보인다. 자릿수는 우리가 검사한다 */}
              <input
                className="inp"
                type="password"
                autoComplete="new-password"
                inputMode="numeric"
                placeholder="숫자 4~12자리"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          </div>
          <div className="frow">
            <label>다시 입력</label>
            <div>
              <input
                className="inp"
                type="password"
                autoComplete="new-password"
                inputMode="numeric"
                placeholder="같은 번호를 한 번 더"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
              />
              <div className="hint">두 번 입력한 값이 같아야 저장됩니다.</div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export const doorCodeMockup: Mockup = {
  Content,
  actions: (
    <button className="btn pri" onClick={() => changeSignal.bump()}>
      번호 교체
    </button>
  ),
}
