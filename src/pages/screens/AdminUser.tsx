import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { DataTable, ExcelButton, MaskToggle, useServerData, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import {
  ACCOUNT_STATUS_LABEL,
  ROLES as ROLE_KEYS,
  ROLE_LABEL,
  approveAccount,
  checkLoginId,
  createStaff,
  listGrantableRoles,
  issueTemporaryPassword,
  listAccountHistory,
  listAccounts,
  replaceRoles,
  unlockAccount,
  withdrawAccount,
  type AccountRow,
  type AccountStatus,
  type Role,
  type RoleOption,
  type StaffCreated,
  type StaffKind,
} from '../../api/accounts'
import type { Mockup } from './types'
import './matrix.css'

/* F-4.10-2 사용자 관리 — GET /api/v1/admin/staff/accounts
 *
 * 실행가이드 Phase 0 주의사항:
 *   "RBAC는 이 Phase에서 완성 필수 — Phase 1부터 개인정보 노출 메뉴가 개발되므로
 *    권한골격 없이 진입하면 보안구멍이 열린 채 진행됨(리스크#5)"
 *
 * ★ 계정 목록은 직원 목록(/staff/employees)이 아니라 /staff/accounts 다. 직원은 인적사항이고
 *   이쪽이 계정(로그인 ID·상태·역할·잠금·최근 로그인)이다. 화면이 그리는 것은 계정 쪽이다.
 *
 * ★ 지점을 안 고르면 **전 지점**이 온다. 다른 목록과 달리 400이 아니다 — 계정 관리는
 *   본사가 전 지점을 한 화면에서 보는 것이 정상이라 목업의 '전체 지점' 옵션을 그대로 쓴다.
 *
 * ★ 아래 권한 매트릭스는 **초안이고 서버에 대응 API가 없다.** 지금 서버가 아는 것은
 *   계정에 붙은 역할 이름뿐이고, "역할 × 기능영역 → 권한"은 아직 어디에도 없다.
 *   그래서 이 탭은 목업 그대로 정적이다. 실제 화면 제한이 이 표대로 도는 것이 아니다.
 */

const ROLES: { key: Role; label: string; desc: string; color: string }[] = [
  { key: 'SUPER_ADMIN', label: ROLE_LABEL.SUPER_ADMIN, desc: '전 지점·전 기능', color: 'var(--red)' },
  { key: 'BRANCH_ADMIN', label: ROLE_LABEL.BRANCH_ADMIN, desc: '소속 지점 전 기능', color: 'var(--violet)' },
  { key: 'TEACHER', label: ROLE_LABEL.TEACHER, desc: '담당 반 중심', color: 'var(--mint)' },
  { key: 'STAFF', label: ROLE_LABEL.STAFF, desc: '조회 + 제한적 등록', color: 'var(--blue)' },
  { key: 'READONLY', label: ROLE_LABEL.READONLY, desc: '읽기만', color: 'var(--muted)' },
]

const ROLE_MAP = Object.fromEntries(ROLES.map((r) => [r.key, r])) as Record<Role, (typeof ROLES)[number]>

/** 권한 레벨 — 매트릭스 셀 */
type Perm = 'full' | 'own' | 'read' | 'none'

const PERM_META: Record<Perm, { label: string; cls: string }> = {
  full: { label: '전체', cls: 'p-full' },
  own: { label: '담당', cls: 'p-own' },
  read: { label: '조회', cls: 'p-read' },
  none: { label: '없음', cls: 'p-none' },
}

interface Area {
  name: string
  note?: string
  perms: Record<Role, Perm>
}

/** 기능 영역 × Role 매트릭스 — 초안이며 확정본이 아니다 */
const AREAS: Area[] = [
  { name: '학생 관리', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'read', READONLY: 'read' } },
  {
    name: '개인정보 필드',
    note: '전화·주소·생년월일',
    perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'none', READONLY: 'none' },
  },
  { name: '상벌점 부여', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'none', READONLY: 'none' } },
  { name: '출결 관리', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'read', READONLY: 'read' } },
  {
    name: '공지 발송',
    note: 'scope별 분기',
    perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'own', TEACHER: 'own', STAFF: 'none', READONLY: 'none' },
  },
  { name: '수납 현황', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'none', STAFF: 'read', READONLY: 'read' } },
  {
    name: '할인 정책 설정',
    note: '결제 청구액을 바꾼다',
    perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'read', TEACHER: 'none', STAFF: 'none', READONLY: 'none' },
  },
  { name: '급식 결제·취소', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'none', STAFF: 'full', READONLY: 'none' } },
  {
    name: '배식 수기 확인',
    note: 'QR 실패 시 통과 처리',
    perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'full', READONLY: 'none' },
  },
  {
    name: '학습계획 조회',
    note: '조회 전용 · 대리 입력 없음',
    perms: { SUPER_ADMIN: 'read', BRANCH_ADMIN: 'read', TEACHER: 'own', STAFF: 'none', READONLY: 'read' },
  },
  {
    name: '학원 일정 등록',
    note: '학습계획 차단 권한',
    perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'own', TEACHER: 'none', STAFF: 'none', READONLY: 'none' },
  },
  { name: '교무 명단 출력', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'read', READONLY: 'read' } },
  { name: '상담 일지·리포트', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'none', READONLY: 'none' } },
  {
    name: '질의응답 타임 관리',
    note: '노출 설정 · 간격',
    perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'read', READONLY: 'none' },
  },
  {
    name: '키오스크 단말 관리',
    note: '등록 · 재시작 · 펌웨어',
    perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'own', TEACHER: 'none', STAFF: 'read', READONLY: 'none' },
  },
  { name: '기초 설정', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'read', TEACHER: 'none', STAFF: 'none', READONLY: 'none' } },
  { name: '사용자·권한 관리', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'own', TEACHER: 'none', STAFF: 'none', READONLY: 'none' } },
  { name: '엑셀 마스킹 해제', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'none', STAFF: 'none', READONLY: 'none' } },
]

const STATUS_TONE: Record<AccountStatus, string> = {
  ACTIVE: 'verified',
  PENDING: 'supplement',
  SUSPENDED: 'supplement',
  WITHDRAWN: 'brandnew',
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 서버가 UTC instant 로 준다. 그대로 찍으면 9시간 어긋난다 */
function localDateTime(iso: string | null): string {
  if (iso === null) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 등록 폼 초기값. 저장 후 되돌릴 때도 쓴다 */
const EMPTY_FORM = {
  kind: 'EMPLOYEE' as StaffKind,
  academyId: '',
  loginId: '',
  name: '',
  role: 'STAFF' as Role,
  phone: '',
  email: '',
  deptName: '',
  positionName: '',
}

function Content() {
  const { academies } = useAcademy()
  const [tab, setTab] = useState('users')
  const [masked, setMasked] = useState(true)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [openNew, setOpenNew] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  /** 저장 직후 한 번만 보여주는 것. 임시 비밀번호는 여기서 놓치면 재발급해야 한다 */
  const [created, setCreated] = useState<StaffCreated | null>(null)
  /** 재발급한 임시 비밀번호. 한 번만 오는 값이라 사용자가 닫을 때까지 남긴다 */
  const [reissued, setReissued] = useState<{ loginId: string; temporaryPassword: string } | null>(null)
  const [idCheck, setIdCheck] = useState<{ loginId: string; available: boolean } | null>(null)
  /** 부여 가능한 역할은 **서버가 판정한다** — 화면이 "내가 본사인가"로 계산하지 않는다 */
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])

  useEffect(() => {
    // 폼을 열 때만 부른다. 목록만 보는 사람에게는 필요 없다
    if (!openNew || roleOptions.length > 0) return
    listGrantableRoles().then(setRoleOptions).catch(() => setRoleOptions([]))
  }, [openNew, roleOptions.length])

  const assignableRoles = roleOptions.filter((r) => r.grantable)

  // ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다.
  //   지점을 안 고르면 파라미터를 빼서 전 지점을 받는다(이 엔드포인트는 400이 아니다)
  const params = useMemo(() => ({ academyId: branch ? Number(branch) : undefined }), [branch])

  const list = useServerData({
    fetcher: listAccounts,
    params,
    errorMessage: '계정 목록을 불러오지 못했습니다.',
  })

  const rows = list.data ?? []
  const pending = rows.filter((u) => u.status === 'PENDING').length

  /** 역할은 계정마다 여러 개일 수 있어 계정 수가 아니라 부여 건수를 센다 */
  const roleCount = (role: Role) =>
    rows.filter((u) => u.status !== 'WITHDRAWN' && u.roles.includes(role)).length

  async function changeRole(row: AccountRow) {
    const current = row.roles.join(', ')
    const input = window
      .prompt(
        `${row.loginId} 의 역할을 입력하세요. 쉼표로 여러 개.\n` +
          `가능: ${ROLE_KEYS.join(', ')}\n` +
          `⚠️ 지금 역할을 통째로 교체합니다 (현재: ${current})`,
        current,
      )
      ?.trim()
    if (!input) return

    const next = input.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    const invalid = next.filter((r) => !(ROLE_KEYS as readonly string[]).includes(r))
    if (invalid.length > 0) {
      setActionMsg(`알 수 없는 역할입니다: ${invalid.join(', ')}`)
      return
    }

    setBusy(row.accountId)
    setActionMsg(null)
    try {
      await replaceRoles(row.accountId, next as Role[])
      setActionMsg(`${row.loginId} 의 역할을 ${next.join(', ')} 로 바꿨습니다.`)
      list.reload()
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.message : '역할 변경에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  function setF<K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submitNew(e: FormEvent) {
    e.preventDefault()
    setFormErr(null)

    const academyId = Number(form.academyId)
    if (!academyId) return setFormErr('지점을 고르세요.')
    if (!form.loginId.trim()) return setFormErr('로그인 아이디를 입력하세요.')
    if (!form.name.trim()) return setFormErr('이름을 입력하세요.')

    setSaving(true)
    try {
      const res = await createStaff(form.kind, {
        academyId,
        loginId: form.loginId.trim(),
        name: form.name.trim(),
        roles: [form.role],
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        // 선생님 경로는 이 둘을 안 받는다 — 보내지 않는다
        deptName: form.kind === 'EMPLOYEE' ? form.deptName.trim() || undefined : undefined,
        positionName: form.kind === 'EMPLOYEE' ? form.positionName.trim() || undefined : undefined,
      })
      // 임시 비밀번호는 이 응답에만 있다. 폼을 닫아도 안 사라지게 따로 들고 있는다
      setCreated(res)
      setForm(EMPTY_FORM)
      setIdCheck(null)
      setOpenNew(false)
      list.reload()
    } catch (err) {
      // 미리 확인했어도 저장 시점에 남이 먼저 가져갔을 수 있다 — 여기 처리를 없애면 안 된다
      setFormErr(err instanceof ApiError ? err.message : '계정을 만들지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function verifyLoginId() {
    const loginId = form.loginId.trim()
    if (!loginId) return
    setIdCheck(null)
    try {
      setIdCheck(await checkLoginId(loginId))
    } catch {
      // 확인이 안 되면 그냥 저장해 보면 된다 — 저장 쪽이 최종 판정이다
      setIdCheck(null)
    }
  }

  async function approve(row: AccountRow) {
    setBusy(row.accountId)
    setActionMsg(null)
    try {
      await approveAccount(row.accountId)
      setActionMsg(`${row.loginId} 의 가입을 승인했습니다. 이제 로그인할 수 있습니다.`)
      list.reload()
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.message : '승인에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function withdraw(row: AccountRow) {
    // 되돌리는 API 가 없다 — 한 번 더 묻는다
    if (!window.confirm(`${row.loginId}(${row.name ?? '-'}) 를 탈퇴 처리합니다. 되돌릴 수 없습니다.`)) return
    setBusy(row.accountId)
    setActionMsg(null)
    try {
      await withdrawAccount(row.accountId)
      setActionMsg(`${row.loginId} 를 탈퇴 처리했습니다.`)
      list.reload()
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.message : '탈퇴 처리에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function showHistory(row: AccountRow) {
    setBusy(row.accountId)
    setActionMsg(null)
    try {
      const rows = await listAccountHistory(row.accountId)
      setActionMsg(
        rows.length === 0
          ? `${row.loginId} 의 권한 변경 이력이 없습니다.`
          : `${row.loginId} 권한 변경 이력 — ` +
            rows
              .map((h) => `${localDateTime(h.changedAt)} ${h.action} ${h.beforeValue ?? '-'} → ${h.afterValue ?? '-'}`)
              .join(' / '),
      )
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.message : '이력을 불러오지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function reissuePassword(row: AccountRow) {
    /* ★ 평문이 응답에 **한 번만** 실리고 서버가 저장하지 않는다. 놓치면 또 발급해야 하므로
     *   등록 직후와 같은 방식으로 화면에 남기고 사용자가 직접 닫게 한다. */
    if (
      !window.confirm(
        `${row.loginId} 의 비밀번호를 새로 발급합니다.\n기존 비밀번호는 즉시 쓸 수 없게 됩니다.`,
      )
    )
      return
    setBusy(row.accountId)
    setActionMsg(null)
    try {
      const res = await issueTemporaryPassword(row.accountId)
      setReissued({ loginId: row.loginId, temporaryPassword: res.temporaryPassword })
      list.reload()
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.message : '임시 비밀번호를 발급하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function unlock(row: AccountRow) {
    setBusy(row.accountId)
    setActionMsg(null)
    try {
      await unlockAccount(row.accountId)
      setActionMsg(`${row.loginId} 의 잠금을 풀었습니다.`)
      list.reload()
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.message : '잠금 해제에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<AccountRow>[] = useMemo(
    () => [
      {
        key: 'loginId',
        header: '계정 ID',
        width: '104px',
        sortable: true,
        value: (r) => r.loginId,
        render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
      },
      { key: 'name', header: '이름', width: '90px', mask: 'name', value: (r) => r.name ?? '-' },
      {
        key: 'roles',
        header: '권한',
        width: '150px',
        align: 'center',
        sortable: true,
        // 정렬은 가장 높은 역할 기준. 배열을 그대로 문자열로 만들면 순서가 이름순이 된다
        value: (r) => Math.min(...r.roles.map((x) => ROLES.findIndex((y) => y.key === x)).filter((i) => i >= 0)),
        render: (r) => (
          <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
            {r.roles.map((role) => (
              <span
                key={role}
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 6,
                  color: '#fff',
                  background: ROLE_MAP[role]?.color ?? 'var(--muted)',
                  whiteSpace: 'nowrap',
                }}
                title={role}
              >
                {ROLE_MAP[role]?.label ?? role}
              </span>
            ))}
          </span>
        ),
      },
      { key: 'academyName', header: '지점', width: '68px', align: 'center', sortable: true, value: (r) => r.academyName ?? '-' },
      { key: 'phone', header: '연락처', width: '128px', mask: 'phone', value: (r) => r.phone ?? '-' },
      {
        key: 'status',
        header: '상태',
        width: '96px',
        align: 'center',
        sortable: true,
        value: (r) => ACCOUNT_STATUS_LABEL[r.status] ?? r.status,
        render: (r, shown) => (
          <span style={{ display: 'inline-flex', gap: 3, justifyContent: 'center' }}>
            <span className={`mk ${STATUS_TONE[r.status] ?? ''}`}>{shown}</span>
            {/* 잠김은 상태와 별개 축이다 — 승인 상태면서 잠겨 있을 수 있다 */}
            {r.locked && (
              <span className="mk brandnew" title="로그인 5회 실패로 잠김. 자동으로 안 풀린다">
                잠김
              </span>
            )}
          </span>
        ),
      },
      {
        key: 'lastRoleChange',
        header: '권한 수정시간',
        width: '146px',
        // 목록 응답에는 안 실려 온다 — 계정별 이력 조회를 눌러서 본다
        value: () => '',
        render: (r) => (
          <button
            className="btn"
            style={{ padding: '3px 8px', fontSize: 11 }}
            disabled={busy === r.accountId}
            onClick={() => void showHistory(r)}
          >
            이력 보기
          </button>
        ),
      },
      { key: 'lastLoginAt', header: '최근 로그인', width: '140px', sortable: true, value: (r) => localDateTime(r.lastLoginAt) },
      {
        key: 'act',
        header: '',
        width: '160px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy === r.accountId}
              onClick={() => void changeRole(r)}
            >
              권한
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy === r.accountId || r.status === 'WITHDRAWN'}
              title="새 임시 비밀번호를 발급합니다. 한 번만 보여집니다"
              onClick={() => void reissuePassword(r)}
            >
              비밀번호
            </button>
            {r.locked ? (
              <button
                className="btn pri"
                style={{ padding: '4px 9px', fontSize: 11.5 }}
                disabled={busy === r.accountId}
                onClick={() => void unlock(r)}
              >
                잠금해제
              </button>
            ) : (
              <button
                className="btn pri"
                style={{ padding: '4px 9px', fontSize: 11.5 }}
                disabled={busy === r.accountId || r.status !== 'PENDING'}
                title={r.status === 'PENDING' ? '가입을 승인해 로그인을 연다' : '승인 대기 상태에서만 누를 수 있습니다'}
                onClick={() => void approve(r)}
              >
                승인
              </button>
            )}
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
              disabled={busy === r.accountId || r.status === 'WITHDRAWN'}
              onClick={() => void withdraw(r)}
            >
              탈퇴
            </button>
          </div>
        ),
      },
    ],
    [busy],
  )

  return (
    <div className="p-matrix">
      <div className="stat-strip">
        {ROLES.map((r) => (
          <div className="stat" key={r.key}>
            <div className="l">
              <Icon name="shield-check" size={13} /> {r.label}
            </div>
            <div className="v" style={{ color: r.color }}>
              {roleCount(r.key)}
            </div>
            <div className="d" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9.5 }}>
              {r.key}
            </div>
          </div>
        ))}
      </div>

      {list.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {list.error}
        </div>
      )}

      {actionMsg && <div className="note-box">{actionMsg}</div>}

      {/* 재발급분. 등록 직후와 같은 이유로 사용자가 닫을 때까지 남긴다 */}
      {reissued && (
        <div className="card-sec" style={{ borderColor: 'var(--amber)' }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="lock" size={15} />
              </span>
              {reissued.loginId} 의 임시 비밀번호를 새로 발급했습니다
            </div>
          </div>
          <div className="card-sec-b">
            <div className="frow">
              <label>임시 비밀번호</label>
              <div className="two">
                <input
                  className="inp"
                  readOnly
                  value={reissued.temporaryPassword}
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontWeight: 800,
                    fontSize: 15,
                    letterSpacing: 0.5,
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="link-box" style={{ alignItems: 'center' }}>
                  <div>
                    <b>닫으면 다시 볼 수 없습니다.</b> 지금 본인에게 전달하세요.
                    <br />
                    기존 비밀번호는 더 이상 쓸 수 없습니다.
                  </div>
                </div>
              </div>
            </div>
            <div className="frow">
              <label />
              <button className="btn" type="button" onClick={() => setReissued(null)}>
                확인했습니다 (닫기)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ★ 임시 비밀번호는 이 응답에만 실린다. 서버가 저장하지 않아 닫으면 다시 못 본다 —
             그래서 목록 위에 크게 남겨두고, 닫는 것을 사용자가 직접 누르게 한다 */}
      {created && (
        <div className="card-sec" style={{ borderColor: 'var(--mint-d)' }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="shield-check" size={15} />
              </span>
              {created.loginId} 계정을 만들었습니다
            </div>
          </div>
          <div className="card-sec-b">
            <div className="frow">
              <label>임시 비밀번호</label>
              <div className="two">
                <input
                  className="inp"
                  readOnly
                  value={created.temporaryPassword}
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontWeight: 800,
                    fontSize: 15,
                    letterSpacing: 0.5,
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="link-box" style={{ alignItems: 'center' }}>
                  <div>
                    <b>닫으면 다시 볼 수 없습니다.</b> 지금 본인에게 전달하세요.
                    놓쳤다면 목록의 <b>비밀번호</b> 버튼으로 다시 발급하면 됩니다.
                  </div>
                </div>
              </div>
            </div>
            <div className="note-box" style={created.pendingApproval ? { borderColor: 'var(--amber)' } : undefined}>
              {created.pendingApproval ? (
                <>
                  아직 <b>로그인할 수 없습니다.</b> 본사에서 승인해야 열립니다 — 그때까지는
                  로그인하면 "가입 승인 대기 중입니다"가 뜹니다.
                </>
              ) : (
                <>
                  바로 로그인할 수 있습니다. <b>첫 로그인에서 비밀번호를 바꾸게 됩니다.</b>
                </>
              )}
            </div>
            <div className="frow">
              <label />
              <button className="btn" type="button" onClick={() => setCreated(null)}>
                확인했습니다 (닫기)
              </button>
            </div>
          </div>
        </div>
      )}

      {openNew && (
        <form className="card-sec" onSubmit={submitNew}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="user-plus" size={15} />
              </span>
              계정 등록
            </div>
          </div>
          <div className="card-sec-b">
            {/* 로그인 아이디만 못 고친다 — 계정 식별자라 바꾸면 감사 로그의 주체가 끊긴다 */}
            <div className="note-box">
              비밀번호는 <b>저장할 때 자동으로 만들어집니다.</b> 등록이 끝나면 화면에 한 번 보여드리니
              그때 본인에게 전달하세요. <b>로그인 아이디는 나중에 바꿀 수 없습니다.</b>
            </div>

            <div className="frow">
              <label className="req">구분</label>
              <select
                className="sel"
                value={form.kind}
                onChange={(e) => setF('kind', e.target.value as StaffKind)}
              >
                <option value="EMPLOYEE">직원 (부서·직급을 함께 넣습니다)</option>
                <option value="TEACHER">선생님</option>
              </select>
            </div>

            <div className="frow">
              <label className="req">지점</label>
              <select className="sel" value={form.academyId} onChange={(e) => setF('academyId', e.target.value)}>
                <option value="">지점 선택</option>
                {academies.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.acadNm}
                  </option>
                ))}
              </select>
            </div>

            <div className="frow">
              <label className="req">이름</label>
              <div className="two">
                <input
                  className="inp"
                  placeholder="홍길동"
                  value={form.name}
                  onChange={(e) => setF('name', e.target.value)}
                  maxLength={20}
                />
                <select className="sel" value={form.role} onChange={(e) => setF('role', e.target.value as Role)}>
                  {assignableRoles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="frow">
              <label className="req">로그인 아이디</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  className="inp"
                  style={{ maxWidth: 220 }}
                  placeholder="영문·숫자"
                  value={form.loginId}
                  onChange={(e) => {
                    setF('loginId', e.target.value)
                    setIdCheck(null) // 고치는 순간 이전 확인 결과는 무효다
                  }}
                  maxLength={30}
                  autoComplete="off"
                />
                <button
                  className="btn"
                  type="button"
                  style={{ flexShrink: 0 }}
                  onClick={verifyLoginId}
                  disabled={!form.loginId.trim()}
                >
                  중복 확인
                </button>
                {idCheck && idCheck.loginId === form.loginId.trim() && (
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: idCheck.available ? 'var(--mint-d)' : 'var(--red)',
                    }}
                  >
                    {idCheck.available ? '사용 가능한 아이디입니다' : '이미 사용 중인 아이디입니다'}
                  </span>
                )}
              </div>
            </div>

            <div className="frow">
              <label>연락처</label>
              <div className="two">
                <input
                  className="inp"
                  placeholder="010-0000-0000"
                  value={form.phone}
                  onChange={(e) => setF('phone', e.target.value)}
                  maxLength={20}
                />
                <input
                  className="inp"
                  placeholder="이메일"
                  value={form.email}
                  onChange={(e) => setF('email', e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>

            {form.kind === 'EMPLOYEE' && (
              <div className="frow">
                <label>부서 · 직급</label>
                <div className="two">
                  <input
                    className="inp"
                    placeholder="운영팀"
                    value={form.deptName}
                    onChange={(e) => setF('deptName', e.target.value)}
                    maxLength={30}
                  />
                  <input
                    className="inp"
                    placeholder="팀장"
                    value={form.positionName}
                    onChange={(e) => setF('positionName', e.target.value)}
                    maxLength={30}
                  />
                </div>
              </div>
            )}

            {formErr && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {formErr}
              </div>
            )}

            <div className="frow">
              <label />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn pri" type="submit" disabled={saving}>
                  {saving ? '저장 중…' : '등록'}
                </button>
                <button className="btn" type="button" onClick={() => setOpenNew(false)} disabled={saving}>
                  취소
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'users', label: '계정 목록', count: rows.length },
            { key: 'matrix', label: '권한 매트릭스 (초안)' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'users' ? (
          <div style={{ padding: 14 }}>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => String(r.accountId)}
              masked={masked}
              loading={list.loading}
              pageSize={12}
              countLabel={
                <>
                  계정 <b>{rows.length}</b>개
                  {pending > 0 && (
                    <span style={{ color: 'var(--amber)', fontWeight: 700 }}> · 승인대기 {pending}</span>
                  )}
                </>
              }
              toolbar={
                <>
                  {/* 지점을 안 고르면 전 지점이다 — 이 엔드포인트는 academyId 없이도 200이다 */}
                  <select className="sel" style={{ width: 110 }} value={branch} onChange={(e) => setBranch(e.target.value)}>
                    <option value="">전체 지점</option>
                    {academies.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.acadNm}
                      </option>
                    ))}
                  </select>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="사용자_목록" columns={columns} rows={rows} masked={masked} />
                  <button
                    className="btn pri"
                    onClick={() => {
                      setFormErr(null)
                      // 지점을 골라놓고 열었으면 그 지점을 기본값으로 둔다
                      setForm((f) => ({ ...f, academyId: branch || f.academyId }))
                      setOpenNew((v) => !v)
                    }}
                  >
                    <Icon name="user-plus" size={14} /> {openNew ? '등록 닫기' : '계정 등록'}
                  </button>
                </>
              }
            />
          </div>
        ) : (
          <div className="card-sec-b">
            <div className="mx-scroll">
              <table className="mx">
                <thead>
                  <tr>
                    <th className="area">기능 영역</th>
                    {ROLES.map((r) => (
                      <th key={r.key} style={{ color: r.color }}>
                        {r.label}
                        <span className="rk">{r.key}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AREAS.map((a) => (
                    <tr key={a.name}>
                      <th className="area">
                        {a.name}
                        {a.note && <span className="an">{a.note}</span>}
                      </th>
                      {ROLES.map((r) => {
                        const p = a.perms[r.key]
                        return (
                          <td key={r.key}>
                            <span className={`pm ${PERM_META[p].cls}`}>{PERM_META[p].label}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mx-legend">
              <span>
                <span className="pm p-full">전체</span> 전 지점·전 건
              </span>
              <span>
                <span className="pm p-own">담당</span> 소속 지점 / 담당 반만
              </span>
              <span>
                <span className="pm p-read">조회</span> 읽기만
              </span>
              <span>
                <span className="pm p-none">없음</span> 메뉴 미노출
              </span>
              {/* 서버에 역할 × 기능영역 권한이 아직 없다. "이 표대로 제한된다"고 쓰면
                  화면이 거짓말을 하게 된다 — 확정 전이라는 것을 그대로 적는다 */}
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                확정 전 초안입니다. 실제 메뉴 노출·기능 제한은 아직 이 표를 따르지 않습니다
              </span>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

export const adminUserMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="history" size={14} /> 권한 변경 이력
      </button>
    </>
  ),
}
