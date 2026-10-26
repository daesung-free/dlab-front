import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import {
  addGuardian,
  listGuardians,
  looksMasked,
  removeGuardian,
  type Guardian,
} from '../../api/guardians'

/* 보호자 연락처 — 학생 정보 모달 안에서 바로 더하고 끊는다 (F-4.1-1 부속)
 *
 * ★★ **「등록하면 알림톡이 간다」가 아니다.** 학부모 대상 발송은 **학부모 앱 계정**을
 *   통해 수신자를 찾는다 — 번호만 있는 보호자는 발송 대상에서 빠진다. 지금은 앱이
 *   출시 전이라 **등록해도 한 통도 나가지 않는다.** 화면이 이 말을 하지 않으면
 *   담당자가 번호를 넣어 두고 「왜 안 오지」를 찾는다.
 *
 * ★ **저장은 따로 나간다.** 모달 아래 「저장」(학생 정보)과 별개로 즉시 반영된다 —
 *   한 번에 묶으면 보호자만 들어가고 학생 정보가 실패했을 때 무엇이 됐는지 알 수 없다.
 *
 * ★ **형제는 보호자를 공유한다.** 같은 번호면 기존 보호자에 연결만 더해진다. 해제는
 *   **이 학생과의 연결만** 끊어 다른 자녀는 그대로다 — 그래서 겁주는 경고를 넣지 않는다.
 *
 * ★ **이름이 「학부모」로 오는 경우가 있다**(2026-10-26 추가). 학생 앱 가입에
 *   `guardianPhone` 이 생겼는데 **학생은 번호만 적지 이름은 모른다.** 그래서 서버가
 *   `"학부모"` 로 넣는다 — 잘못 들어간 값이 아니다. 그 말을 안 하면 담당자가 고치려 드는데
 *   **이름 수정 경로가 없다.** 학부모가 나중에 앱에 가입하면 본인 이름으로 채워진다.
 */

/** 숫자만 받아 하이픈을 붙인다. ★ 서버가 형식 검증을 안 해 **섞이면 중복 판정이 어긋난다** */
function withHyphen(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length < 4) return d
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

export function GuardianBlock({ enrollmentId }: { enrollmentId: number }) {
  const [rows, setRows] = useState<Guardian[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  /** 해제는 되돌릴 수 없다 — 한 번 더 묻는다 */
  const [removing, setRemoving] = useState<Guardian | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await listGuardians(enrollmentId))
      setErr(null)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '보호자를 불러오지 못했습니다.')
    }
  }, [enrollmentId])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    const n = name.trim()
    const p = phone.trim()
    if (n === '' || p === '') {
      setErr('이름과 연락처를 모두 적어 주세요.')
      return
    }
    /* ★★ 가려진 값을 보내면 400 이다. 더 나쁜 것은 **저장돼 버린 경우** — 화면에는
         원래도 가려져 보여 **아무도 눈치채지 못한 채 알림이 영영 안 간다.** 먼저 막는다 */
    if (looksMasked(n) || looksMasked(p)) {
      setErr('가려진 값은 저장할 수 없습니다. 이름과 번호를 직접 입력해 주세요.')
      return
    }
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      await addGuardian(enrollmentId, { name: n, phone: p })
      setName('')
      setPhone('')
      setMsg('보호자를 등록했습니다.')
      await load()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '등록하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(g: Guardian) {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      await removeGuardian(enrollmentId, g.guardianId)
      setRemoving(null)
      setMsg('이 학생과의 연결을 끊었습니다.')
      await load()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '해제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const list = rows ?? []

  return (
    <div className="frow">
      <label>보호자 연락처</label>
      <div>
        {rows === null && err === null && <div style={{ color: 'var(--muted)' }}>불러오는 중…</div>}

        {list.map((g) => (
          <div
            key={g.guardianId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <Icon name="user" size={14} />
            <b style={{ fontSize: 12.5 }}>{g.name}</b>
            {/* ★ 학생이 가입하며 **번호만** 적으면 이름이 「학부모」로 들어간다 — 학생은
                   보호자 이름을 적지 않기 때문이다. 이상한 값이 아니라는 것을 그 자리에서
                   말한다. 안 그러면 담당자가 잘못 들어간 값으로 보고 고치려 한다 */}
            {g.name === '학부모' && (
              <span
                className="mk supplement"
                style={{ fontSize: 10.5 }}
                title="학생이 가입할 때 번호만 적어 이름이 비어 있습니다. 학부모가 앱에 가입하면 본인 이름으로 채워집니다"
              >
                이름 미입력
              </span>
            )}
            {/* ★ 서버가 이미 가렸으면 또 가리지 않는다(이중 마스킹) */}
            <span className="mono" style={{ fontSize: 12 }}>
              {g.phone}
            </span>
            {g.relationOrder > 1 && (
              <span className="mk supplement" style={{ fontSize: 10.5 }}>
                {g.relationOrder}순위
              </span>
            )}
            <button
              type="button"
              className="btn"
              style={{ marginLeft: 'auto', padding: '3px 9px', fontSize: 11.5, color: 'var(--red)' }}
              disabled={busy}
              onClick={() => setRemoving(g)}
            >
              연결 해제
            </button>
          </div>
        ))}

        {rows !== null && list.length === 0 && (
          <div style={{ color: 'var(--muted)' }}>등록된 보호자가 없습니다.</div>
        )}

        {removing !== null && (
          /* ★ 모달을 겹쳐 띄우지 않는다 — 학생 정보 모달 안이라 중첩되면 뒤가 안 닫힌다.
               대신 **그 자리에서** 한 번 더 묻는다 */
          <div className="note-box" style={{ borderColor: 'var(--red)', marginTop: 8 }}>
            <div>
              <b>{removing.name}</b> 을(를) 이 학생에서 뗄까요? 다른 자녀에게 연결돼 있으면
              그쪽은 그대로 남습니다.
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button type="button" className="btn" disabled={busy} onClick={() => setRemoving(null)}>
                  취소
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ color: 'var(--red)' }}
                  disabled={busy}
                  onClick={() => void remove(removing)}
                >
                  연결 해제
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <input
            className="inp"
            style={{ width: 110 }}
            placeholder="이름"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="inp"
            style={{ width: 150 }}
            placeholder="010-1234-5678"
            inputMode="numeric"
            maxLength={13}
            value={phone}
            onChange={(e) => setPhone(withHyphen(e.target.value))}
          />
          <button type="button" className="btn" disabled={busy} onClick={() => void add()}>
            <Icon name="plus" size={13} /> 추가
          </button>
        </div>

        {/* ★★ **지금은 등록해도 알림톡이 나가지 않는다.** 그 말을 안 하면 번호를 넣어 두고
               「왜 안 오지」를 찾는다 — 찾아도 원인이 화면에 없다 */}
        <div className="hint">
          번호를 등록해 두면 <b>학부모가 앱에 가입한 뒤부터</b> 알림톡이 나갑니다. 앱 출시
          전이라 <b>지금은 발송되지 않습니다</b> — 미리 채워 두셔도 됩니다.
          <br />
          이름이 <b>「학부모」</b>로 보이면 학생이 가입할 때 <b>번호만 적은 것</b>입니다.
          학부모가 앱에 가입하면 본인 이름으로 채워집니다.
          <br />
          형제가 같은 번호를 쓰면 <b>한 사람으로 묶입니다</b> — 이름은 먼저 등록된 쪽이 남고,
          여기서 고칠 수 없습니다.
        </div>

        {msg !== null && (
          <div className="hint" style={{ color: 'var(--mint-d)' }}>
            {msg}
          </div>
        )}
        {err !== null && (
          <div className="hint" style={{ color: 'var(--red)' }}>
            {err}
          </div>
        )}
      </div>
    </div>
  )
}
