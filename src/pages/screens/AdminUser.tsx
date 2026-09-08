import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { DataTable, ExcelButton, MaskToggle, useServerData, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { useAuth } from '../../auth/AuthContext'
import { ApiError } from '../../api/client'
import {
  ACCOUNT_STATUS_LABEL,
  ROLES as ROLE_KEYS,
  ROLE_LABEL,
  approveAccount,
  createStaff,
  listAccountHistory,
  listAccounts,
  replaceRoles,
  unlockAccount,
  withdrawAccount,
  type AccountRow,
  type AccountStatus,
  type Role,
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
  password: '',
  role: 'STAFF' as Role,
  phone: '',
  email: '',
  deptName: '',
  positionName: '',
}

function Content() {
  const { academies } = useAcademy()
  const { principal } = useAuth()
  const [tab, setTab] = useState('users')
  const [masked, setMasked] = useState(true)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [openNew, setOpenNew] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  /** 본사 계정이 만들면 바로 쓸 수 있고, 지점 계정이 만들면 승인 대기로 걸린다 */
  const isHq = principal?.allAcademy === true
  /** 자기 권한 위를 만들지 못하게 막는다 — 서버는 이걸 안 막는다(200) */
  const assignableRoles = isHq ? ROLE_KEYS : ROLE_KEYS.filter((r) => r !== 'SUPER_ADMIN')

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
    if (form.password.length < 8) return setFormErr('비밀번호는 8자 이상으로 정하세요.')

    setSaving(true)
    try {
      await createStaff(form.kind, {
        academyId,
        loginId: form.loginId.trim(),
        name: form.name.trim(),
        password: form.password,
        roles: [form.role],
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        // 선생님 경로는 이 둘을 안 받는다 — 보내면 무시되지만 보내지 않는다
        deptName: form.kind === 'EMPLOYEE' ? form.deptName.trim() || undefined : undefined,
        positionName: form.kind === 'EMPLOYEE' ? form.positionName.trim() || undefined : undefined,
      })
      setActionMsg(
        isHq
          ? `${form.loginId} 계정을 만들었습니다. 바로 로그인할 수 있습니다.`
          : `${form.loginId} 계정을 만들었습니다. 본사 승인 후에 로그인할 수 있습니다.`,
      )
      setForm(EMPTY_FORM)
      setOpenNew(false)
      // 응답이 accountId·loginId 를 안 준다. 목록을 다시 불러야 새 계정이 보인다
      list.reload()
    } catch (err) {
      // 아이디 중복은 저장해 봐야 안다 — 서버 메시지를 그대로 보여준다
      setFormErr(err instanceof ApiError ? err.message : '계정을 만들지 못했습니다.')
    } finally {
      setSaving(false)
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
            {/* 저장 전에 반드시 읽어야 하는 것 두 가지 — 둘 다 되돌릴 수 없다 */}
            <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
              <b>저장하면 이름·부서·직급·연락처를 고칠 수 없습니다.</b> 고치는 경로가 없어,
              잘못 넣으면 탈퇴 처리하고 새로 만들어야 합니다. 나중에 바꿀 수 있는 것은 권한뿐입니다.
              {!isHq && (
                <>
                  <br />
                  만든 계정은 <b>본사 승인 뒤에 로그인</b>할 수 있습니다.
                </>
              )}
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
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="frow">
              <label className="req">로그인 아이디</label>
              <div className="two">
                <input
                  className="inp"
                  placeholder="영문·숫자"
                  value={form.loginId}
                  onChange={(e) => setF('loginId', e.target.value)}
                  maxLength={30}
                  autoComplete="off"
                />
                {/* 중복 확인 경로가 없다. 저장을 눌러야 알 수 있어 미리 알려둔다 */}
                <div className="link-box" style={{ alignItems: 'center' }}>
                  <div>이미 쓰는 아이디인지는 저장할 때 알려드립니다</div>
                </div>
              </div>
            </div>

            <div className="frow">
              <label className="req">비밀번호</label>
              <div className="two">
                <input
                  className="inp"
                  type="password"
                  placeholder="8자 이상"
                  value={form.password}
                  onChange={(e) => setF('password', e.target.value)}
                  maxLength={64}
                  autoComplete="new-password"
                />
                <div className="link-box" style={{ alignItems: 'center' }}>
                  <div>
                    첫 로그인 때 바꾸도록 강제하는 기능이 아직 없습니다.{' '}
                    <b>본인에게 직접 바꾸도록 안내해 주세요.</b>
                  </div>
                </div>
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
