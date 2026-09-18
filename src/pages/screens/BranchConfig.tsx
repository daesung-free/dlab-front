import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Modal, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import {
  getBranchConfig,
  listBranchConfigHistory,
  listBranchConfigs,
  reissueKioskCredential,
  setNebulaDeviceId,
  setPgMerchantCode,
  type BranchConfig as Row,
  type BranchConfigHistory,
} from '../../api/branchConfigs'
import type { Mockup } from './types'

/* 지점 설정 (계획서 2-6) — /api/v1/admin/branch-configs
 *
 * ★ **최고관리자 전용이다.** 지점 관리자는 자기 지점도 403 이라(2026-09-18 확인),
 *   메뉴만 보이고 조회가 통째로 막히는 것을 피하려고 화면에서 먼저 잘라 안내한다.
 *
 * ★ 이 화면의 값 셋은 **틀려도 여기서는 아무 일이 없고, 다른 데서 조용히 깨진다.**
 *   결제가 안 나가고, 남의 지점 와이파이가 열리고, 키오스크가 인증에 실패한다.
 *   그래서 저장 전에 "무엇이 깨지는지"를 모달이 먼저 말한다.
 *
 * ★ PG 코드·키오스크 비밀값은 **서버가 가려서 준다.** 화면에서 또 가리지 않는다
 *   (이중 마스킹 — CLAUDE.md 3-2). 원본을 받는 경로는 없고 재발급만 된다.
 */

/** 이력의 action 코드는 개발자 말이다 — 화면에는 detail(한글)을 쓰고 코드는 안 보여준다 */
function localDateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

type EditKind = 'pg' | 'nebula'

const EDIT_META: Record<EditKind, { title: string; label: string; hint: string; warn: string }> = {
  pg: {
    title: 'PG 가맹점 코드',
    label: '가맹점 코드',
    hint: '결제 대행사에서 지점마다 발급한 코드입니다.',
    warn: '결제가 이 값으로 나갑니다. 틀리면 그 지점 결제가 통째로 실패합니다.',
  },
  nebula: {
    title: '와이파이 장비 ID',
    label: '장비 ID',
    hint: '학생 인강 방화벽 해제가 이 장비로 갑니다.',
    warn: '틀리면 해제 요청이 다른 지점 와이파이를 엽니다.',
  },
}

function Content() {
  const { principal, me } = useAuth()
  const isSuper = (me?.roles ?? principal?.roles ?? []).some((r) => r === 'SUPER_ADMIN')

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const [edit, setEdit] = useState<{ row: Row; kind: EditKind; value: string } | null>(null)
  const [modalErr, setModalErr] = useState<string | null>(null)
  const [reissue, setReissue] = useState<Row | null>(null)
  /** 재발급 결과. secret 은 여기서 놓치면 다시 못 본다 */
  const [issued, setIssued] = useState<{ name: string; clientId: string; secret: string } | null>(null)
  const [history, setHistory] = useState<{ row: Row; list: BranchConfigHistory[] } | null>(null)

  const load = useCallback(async () => {
    if (!isSuper) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setRows(await listBranchConfigs())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '지점 설정을 불러오지 못했습니다.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [isSuper])

  useEffect(() => {
    void load()
  }, [load])

  /** 한 줄만 다시 읽는다 — 전 지점을 다시 부를 이유가 없다 */
  async function refreshRow(academyId: number) {
    try {
      const next = await getBranchConfig(academyId)
      setRows((prev) => prev.map((r) => (r.academyId === academyId ? next : r)))
    } catch {
      await load()
    }
  }

  async function saveEdit(): Promise<boolean> {
    if (!edit) return false
    setBusy(edit.row.academyId)
    setModalErr(null)
    try {
      const v = edit.value.trim()
      if (edit.kind === 'pg') await setPgMerchantCode(edit.row.academyId, v)
      else await setNebulaDeviceId(edit.row.academyId, v)
      await refreshRow(edit.row.academyId)
      setNotice(`${edit.row.academyName} · ${EDIT_META[edit.kind].title}를 바꿨습니다.`)
      return true
    } catch (err) {
      setModalErr(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function doReissue(): Promise<boolean> {
    if (!reissue) return false
    setBusy(reissue.academyId)
    setModalErr(null)
    try {
      const cred = await reissueKioskCredential(reissue.academyId)
      setIssued({ name: reissue.academyName, clientId: cred.clientId, secret: cred.secret })
      await refreshRow(reissue.academyId)
      return true
    } catch (err) {
      setModalErr(err instanceof ApiError ? err.message : '재발급하지 못했습니다.')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function showHistory(row: Row) {
    setBusy(row.academyId)
    try {
      setHistory({ row, list: await listBranchConfigHistory(row.academyId) })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '변경 이력을 불러오지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  const unset = rows.filter(
    (r) => r.pgMerchantCodeMasked === null || r.nebulaDeviceId === null || r.kioskClientId === null,
  )

  const columns: Column<Row>[] = useMemo(
    () => [
      { key: 'academyName', header: '지점', width: '92px', sortable: true, value: (r) => r.academyName },
      {
        key: 'acadCd',
        header: '지점코드',
        width: '80px',
        align: 'center',
        value: (r) => r.acadCd ?? '-',
      },
      {
        key: 'pg',
        header: 'PG 가맹점 코드',
        width: '150px',
        value: (r) => r.pgMerchantCodeMasked ?? '',
        render: (r) =>
          r.pgMerchantCodeMasked === null ? (
            <span className="mk brandnew">미설정</span>
          ) : (
            <span className="mono">{r.pgMerchantCodeMasked}</span>
          ),
      },
      {
        key: 'nebula',
        header: '와이파이 장비 ID',
        width: '150px',
        value: (r) => r.nebulaDeviceId ?? '',
        render: (r) =>
          r.nebulaDeviceId === null ? (
            <span className="mk brandnew">미설정</span>
          ) : (
            <span className="mono">{r.nebulaDeviceId}</span>
          ),
      },
      {
        key: 'kiosk',
        header: '키오스크',
        width: '140px',
        value: (r) => r.kioskClientId ?? '',
        render: (r) =>
          r.kioskClientId === null ? (
            <span className="mk brandnew">미발급</span>
          ) : (
            <span style={{ fontSize: 12 }}>
              <span className="mono">{r.kioskClientId}</span>
            </span>
          ),
      },
      {
        key: 'act',
        header: '',
        width: '270px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              className="btn"
              style={{ padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap' }}
              disabled={busy !== null}
              onClick={() => {
                setModalErr(null)
                setEdit({ row: r, kind: 'pg', value: '' })
              }}
            >
              PG 코드
            </button>
            <button
              className="btn"
              style={{ padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap' }}
              disabled={busy !== null}
              onClick={() => {
                setModalErr(null)
                setEdit({ row: r, kind: 'nebula', value: r.nebulaDeviceId ?? '' })
              }}
            >
              장비 ID
            </button>
            <button
              className="btn"
              style={{ padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap', color: 'var(--red)' }}
              disabled={busy !== null}
              title="키오스크 자격증명을 새로 발급합니다"
              onClick={() => {
                setModalErr(null)
                setReissue(r)
              }}
            >
              키오스크
            </button>
            <button
              className="btn"
              style={{ padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap' }}
              disabled={busy !== null}
              onClick={() => void showHistory(r)}
            >
              이력
            </button>
          </div>
        ),
      },
    ],
    [busy],
  )

  if (!isSuper) {
    return (
      <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
        <div className="ic">
          <Icon name="triangle-alert" size={17} />
        </div>
        <div>
          <div className="tt">본사 관리자만 볼 수 있는 화면입니다</div>
          <div className="tx">
            결제·방화벽·키오스크 설정이라 지점 계정으로는 열리지 않습니다. 값을 바꿔야 하면 본사에
            요청하세요.
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}
      {notice && <div className="note-box">{notice}</div>}

      <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
        <div className="ic">
          <Icon name="triangle-alert" size={17} />
        </div>
        <div>
          <div className="tt">여기서 틀린 값은 이 화면에서 티가 나지 않습니다</div>
          <div className="tx">
            결제는 <b>PG 가맹점 코드</b>로 나가고, 인강 방화벽 해제는 <b>장비 ID</b>가 가리키는 기기로
            갑니다. 틀리면 그 지점 결제가 전부 실패하거나 <b>다른 지점 와이파이가 열립니다.</b>
            바꾸기 전에 지점을 한 번 더 확인하세요.
          </div>
        </div>
      </div>

      {!loading && unset.length > 0 && (
        <div className="note-box">
          {/* 전 지점이 비어 있으면 이름을 다 늘어놓는 것이 오히려 안 읽힌다 */}
          <div>
            아직 값이 없는 지점이 <b>{unset.length}곳</b> 있습니다
            {unset.length < rows.length && <> — {unset.map((u) => u.academyName).join(' · ')}</>}.
            비어 있어도 화면은 돌지만 그 지점의 결제·방화벽·키오스크는 동작하지 않습니다.
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.academyId)}
        masked={false}
        loading={loading}
        pageSize={12}
        countLabel={
          <>
            지점 <b>{rows.length}</b>곳
            {unset.length > 0 && (
              <span style={{ color: 'var(--amber)', fontWeight: 700 }}> · 미설정 {unset.length}</span>
            )}
          </>
        }
        emptyText="지점이 없습니다."
      />

      {/* ── PG 코드 · 장비 ID ── */}
      {edit && (
        <Modal
          title={`${edit.row.academyName} · ${EDIT_META[edit.kind].title}`}
          sub={EDIT_META[edit.kind].warn}
          confirmLabel="저장"
          danger
          busy={busy === edit.row.academyId}
          /* ★ 빈 값은 서버가 거부한다(스펙엔 minLength 0 인데 실제로는 400) */
          confirmDisabled={edit.value.trim() === ''}
          error={modalErr}
          onConfirm={() => void saveEdit().then((ok) => ok && setEdit(null))}
          onClose={() => setEdit(null)}
        >
          <div className="frow">
            <label>{EDIT_META[edit.kind].label}</label>
            <div>
              <input
                className="inp"
                maxLength={100}
                value={edit.value}
                onChange={(e) => setEdit({ ...edit, value: e.target.value })}
              />
              <div className="hint">
                {EDIT_META[edit.kind].hint} <b>한 번 넣으면 지울 수 없습니다</b> — 다른 값으로 바꾸는
                것만 됩니다.
              </div>
            </div>
          </div>

          {edit.kind === 'pg' && (
            <div className="note-box">
              {/* 저장된 값은 서버가 가려서 준다 — 지금 값을 채워 넣을 수가 없다 */}
              <div>
                지금 값은 <b>{edit.row.pgMerchantCodeMasked ?? '없음'}</b> 입니다. 보안상 일부만 보여서
                이어서 고칠 수 없고, <b>전체를 다시 입력</b>해야 합니다.
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── 키오스크 재발급 ── */}
      {reissue && (
        <Modal
          title={`${reissue.academyName} 키오스크 자격증명을 새로 발급할까요?`}
          sub="되돌릴 수 없습니다."
          confirmLabel="재발급"
          danger
          busy={busy === reissue.academyId}
          error={modalErr}
          onConfirm={() => void doReissue().then((ok) => ok && setReissue(null))}
          onClose={() => setReissue(null)}
        >
          <div className="note-box" style={{ borderColor: 'var(--red)' }}>
            <div>
              발급하는 <b>즉시 이 지점 키오스크가 인증에 실패합니다.</b> 키오스크 쪽 설정까지 새 값으로
              바꿔야 다시 동작합니다. 현장에 사람이 있는 시간에는 누르지 마세요.
              <br />
              새 비밀값은 <b>이 창에서 한 번만</b> 보여집니다.
            </div>
          </div>
        </Modal>
      )}

      {/* ── 발급 결과 (한 번만 보인다) ── */}
      {issued && (
        <Modal
          title={`${issued.name} 키오스크 자격증명`}
          sub="이 창을 닫으면 비밀값을 다시 볼 수 없습니다. 지금 옮겨 적으세요."
          hideCancel
          confirmLabel="옮겨 적었습니다"
          onConfirm={() => setIssued(null)}
          onClose={() => setIssued(null)}
        >
          <div className="frow">
            <label>Client ID</label>
            <div>
              <input className="inp mono" readOnly value={issued.clientId} onFocus={(e) => e.target.select()} />
            </div>
          </div>
          <div className="frow">
            <label>Secret</label>
            <div>
              <input className="inp mono" readOnly value={issued.secret} onFocus={(e) => e.target.select()} />
              <div className="hint">키오스크 쪽 설정에 이 값을 넣어야 다시 연결됩니다.</div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 변경 이력 ── */}
      {history && (
        <Modal
          wide
          title={`${history.row.academyName} 변경 이력`}
          sub="무엇을 언제 바꿨는지만 남습니다 — 값은 남기지 않습니다."
          hideCancel
          confirmLabel="닫기"
          onConfirm={() => setHistory(null)}
          onClose={() => setHistory(null)}
        >
          {history.list.length === 0 ? (
            <div style={{ padding: 14, color: 'var(--muted)', fontSize: 13 }}>아직 바꾼 기록이 없습니다.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {history.list.map((h) => (
                <div
                  key={h.id}
                  style={{ display: 'flex', gap: 12, fontSize: 13, borderBottom: '1px solid var(--line)', padding: '6px 0' }}
                >
                  <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{localDateTime(h.changedAt)}</span>
                  <span style={{ flex: 1 }}>{h.detail}</span>
                  {/* 서버가 계정 번호만 준다 — 이름은 안 온다 */}
                  <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {h.changedBy === null ? '-' : `계정 #${h.changedBy}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

export const branchConfigMockup: Mockup = { Content, allBranches: true }
