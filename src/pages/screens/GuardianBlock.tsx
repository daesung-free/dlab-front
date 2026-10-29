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
 * ★★ **번호만 등록돼도 발송된다**(dlab-api #290 · 2026-10-26 배포). 계정이 있는 보호자를
 *   먼저 찾고(수신거부 설정을 읽을 수 있어서), **계정 없이 번호만 있는 보호자도 수신자가
 *   된다.** 디랩 동의서가 보호자 전화번호를 필수로 수집하는 것이 근거다.
 *
 *   ⚠️ **이 사실이 며칠 사이 세 번 뒤집혔다.** 「번호만 있으면 간다」 → 「계정이 필요하다」
 *   → 「번호만 있어도 된다」(경로가 실제로 만들어졌다). 서버 동작을 **단정하기 전에 그 자리에서
 *   확인한다**(CLAUDE.md 4).
 *   ★ 2026-10-29 에 0명 사유가 `NO_ACCOUNT` 로 와서 또 뒤집힌 줄 알았는데 **라벨이 틀린
 *   것**이었다 — 동작은 그대로다(dlab-api #305 에서 `NO_GUARDIAN` 으로 갈랐다).
 *
 *   ⚠️ 운영 발송이 0건인 것은 **기능이 없어서가 아니다** — 시드 번호가 미배정 대역이고
 *   수신 허용목록에 담당자 번호 하나만 들어 있다. 둘 다 이관 전까지의 안전장치다.
 *
 * ★★ **「번호가 같으면 한 통으로 묶인다」고 적어 뒀었는데 틀렸다**(확인 2026-10-29).
 *   `parent_guardian.phone` 이 **NOT NULL UNIQUE** 라 **같은 번호를 가진 보호자 행이 둘
 *   존재할 수 없다** — 묶일 일이 애초에 없다.
 *
 *   ★ 실제로 묶는 것은 **보호자 id** 다. 한 보호자가 **계정으로도 번호로도 걸려 두 통**
 *   받는 것을 막는 것이지, 번호가 같은 **두 사람**을 합치는 것이 아니다.
 *
 *   ⚠️ 그래서 화면 안내도 고쳤다 — **발송 때 합쳐지는 것이 아니라 등록 때 막히는 것**이다.
 *   그렇게 안 쓰면 담당자가 부·모를 같은 번호로 넣어 보고 **왜 한 줄만 생기는지** 모른다.
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
      setErr('이름과 연락처를 모두 입력해 주세요.')
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
      setMsg('보호자 연결을 해제했습니다.')
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
            {/* ★ 학생이 가입하며 **번호만** 입력하면 이름이 「학부모」로 들어간다 — 학생은
                   보호자 이름을 적지 않기 때문이다. 이상한 값이 아니라는 것을 그 자리에서
                   말한다. 안 그러면 담당자가 잘못 들어간 값으로 보고 고치려 한다 */}
            {g.name === '학부모' && (
              <span
                className="mk supplement"
                style={{ fontSize: 10.5 }}
                title="학생이 가입하며 번호만 입력해 이름이 비어 있습니다. 보호자 앱 가입 시 본인 이름으로 대체됩니다"
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
              <b>{removing.name}</b> 님과 이 학생의 연결을 해제하시겠습니까? 다른 자녀와의 연결은
              유지됩니다.
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

        {/* ★★ **등록하면 번호만으로도 발송된다.** 한때 「앱 가입 뒤에야 간다」로 알고 있어
               이 주석도 그렇게 적혀 있었는데 **아래 안내문과 반대였다.**
             ★ 그래도 **수신 허용목록**이 걸려 있어 실제로 가는 번호는 제한된다 — 그 말을
               안 하면 번호를 넣어 두고 「왜 안 오지」를 찾는다 */}
        <div className="hint">
          알림톡은 <b>보호자 연락처로 발송</b>됩니다. 앱을 설치하지 않은 보호자도 번호가
          등록되어 있으면 받습니다.
          <br />
          부·모 <b>여러 명을 등록할 수 있고 각각 발송</b>됩니다. 다만 <b>번호는 보호자마다
          달라야 합니다</b> — 이미 등록된 번호를 다시 입력하면 새 보호자가 생기지 않고, 그
          보호자에게 이 학생이 연결됩니다.
          <br />
          ⚠️ 앱 출시 전까지는 <b>수신 허용목록</b>이 적용되어, 목록에 등록된 번호로만 실제
          발송됩니다. <b>미리보기와 실제 발송은 같은 기준</b>으로 판정하므로, 미리보기에 나온
          대상이 곧 발송 대상입니다.
          <br />
          이름이 <b>「학부모」</b>인 경우는 학생이 가입하며 번호만 입력한 것입니다. 보호자 앱
          가입 시 본인 이름으로 대체됩니다.
          <br />
          <b>형제는 보호자를 공유합니다.</b> 이미 등록된 번호를 그대로 입력하면 그 보호자에게
          연결됩니다. 이때 <b>이름은 먼저 등록된 값이 유지</b>되며 이 화면에서 수정할 수 없습니다.
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
