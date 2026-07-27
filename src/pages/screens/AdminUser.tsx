import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import './matrix.css'

/* F-4.10-2 사용자 관리 — 신규개발-요구사항검증됨 · Phase 0
 *
 * 실행가이드 Phase 0 주의사항:
 *   "RBAC는 이 Phase에서 완성 필수 — Phase 1부터 개인정보 노출 메뉴가 개발되므로
 *    권한골격 없이 진입하면 보안구멍이 열린 채 진행됨(리스크#5)"
 *
 * DSA에서 지점별 접근제어가 운영 중인 것은 관찰됐으나,
 * RBAC 5단계 세부 권한모델은 코드가 없어 전량 신규 설계다. */

type Role = 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'TEACHER' | 'STAFF' | 'READONLY'

const ROLES: { key: Role; label: string; desc: string; color: string }[] = [
  { key: 'SUPER_ADMIN', label: '본사 관리자', desc: '전 지점·전 기능', color: 'var(--red)' },
  { key: 'BRANCH_ADMIN', label: '지점 관리자', desc: '소속 지점 전 기능', color: 'var(--violet)' },
  { key: 'TEACHER', label: '담임·강사', desc: '담당 반 중심', color: 'var(--mint)' },
  { key: 'STAFF', label: '행정 직원', desc: '조회 + 제한적 등록', color: 'var(--blue)' },
  { key: 'READONLY', label: '조회 전용', desc: '읽기만', color: 'var(--muted)' },
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
  { name: '급식 결제·취소', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'none', STAFF: 'full', READONLY: 'none' } },
  { name: '교무 명단 출력', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'read', READONLY: 'read' } },
  { name: '상담 일지·리포트', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'own', STAFF: 'none', READONLY: 'none' } },
  { name: '기초 설정', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'read', TEACHER: 'none', STAFF: 'none', READONLY: 'none' } },
  { name: '사용자·권한 관리', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'own', TEACHER: 'none', STAFF: 'none', READONLY: 'none' } },
  { name: '엑셀 마스킹 해제', perms: { SUPER_ADMIN: 'full', BRANCH_ADMIN: 'full', TEACHER: 'none', STAFF: 'none', READONLY: 'none' } },
]

/* ── 계정 목록 ── */
type UserStatus = '승인' | '승인대기' | '탈퇴'

interface AppUser {
  id: string
  loginId: string
  name: string
  role: Role
  branch: string
  phone: string
  status: UserStatus
  lastRoleChange: string
  lastLogin: string
}

const NAMES = ['이장원', '김유진', '최지원', '박서영', '정하람', '오세영', '한동욱', '윤채린', '서민호', '강예은', '조현우', '임다솜']
const BRANCHES = ['분당', '대치', '평촌']

const USERS: AppUser[] = NAMES.flatMap((name, i) =>
  Array.from({ length: 2 }, (_, j) => {
    const n = i * 2 + j
    const role = ROLES[n % ROLES.length].key
    const status: UserStatus = n % 11 === 10 ? '탈퇴' : n % 7 === 6 ? '승인대기' : '승인'
    return {
      id: `u-${n + 1}`,
      loginId: `dlab${String(n + 1).padStart(3, '0')}`,
      name: j === 0 ? name : `${name}${j}`,
      role,
      branch: BRANCHES[n % BRANCHES.length],
      phone: `010-${String(4000 + ((n * 173) % 6000)).padStart(4, '0')}-${String(1000 + ((n * 61) % 9000)).padStart(4, '0')}`,
      status,
      lastRoleChange: `2026-0${(n % 5) + 1}-${String((n % 28) + 1).padStart(2, '0')} 1${n % 10}:${String((n * 7) % 60).padStart(2, '0')}`,
      lastLogin: status === '탈퇴' ? '-' : `2026-05-2${n % 9} 0${(n % 9) + 1}:${String((n * 13) % 60).padStart(2, '0')}`,
    }
  }),
)

const STATUS_TONE: Record<UserStatus, string> = { 승인: 'verified', 승인대기: 'supplement', 탈퇴: 'brandnew' }

const COLUMNS: Column<AppUser>[] = [
  {
    key: 'loginId',
    header: '계정 ID',
    width: '104px',
    sortable: true,
    value: (r) => r.loginId,
    render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
  },
  { key: 'name', header: '이름', width: '90px', mask: 'name', value: (r) => r.name },
  {
    key: 'role',
    header: '권한',
    width: '116px',
    align: 'center',
    sortable: true,
    value: (r) => ROLES.findIndex((x) => x.key === r.role),
    render: (r) => (
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          padding: '2px 8px',
          borderRadius: 6,
          color: '#fff',
          background: ROLE_MAP[r.role].color,
          whiteSpace: 'nowrap',
        }}
        title={r.role}
      >
        {ROLE_MAP[r.role].label}
      </span>
    ),
  },
  { key: 'branch', header: '지점', width: '68px', align: 'center', sortable: true, value: (r) => r.branch },
  { key: 'phone', header: '연락처', width: '128px', mask: 'phone', value: (r) => r.phone },
  {
    key: 'status',
    header: '상태',
    width: '86px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => <span className={`mk ${STATUS_TONE[r.status]}`}>{r.status}</span>,
  },
  { key: 'lastRoleChange', header: '권한 수정시간', width: '146px', sortable: true, value: (r) => r.lastRoleChange },
  { key: 'lastLogin', header: '최근 로그인', width: '140px', value: (r) => r.lastLogin },
  {
    key: 'act',
    header: '',
    width: '160px',
    align: 'center',
    value: () => '',
    render: (r) => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          상세
        </button>
        {r.status === '승인대기' ? (
          <button className="btn pri" style={{ padding: '4px 9px', fontSize: 11.5 }}>
            승인
          </button>
        ) : (
          <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
            권한
          </button>
        )}
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}>
          탈퇴
        </button>
      </div>
    ),
  },
]

function Content() {
  const [tab, setTab] = useState('users')
  const [masked, setMasked] = useState(true)
  const [branch, setBranch] = useState('')

  const rows = useMemo(() => (branch ? USERS.filter((u) => u.branch === branch) : USERS), [branch])
  const pending = USERS.filter((u) => u.status === '승인대기').length

  return (
    <div className="p-matrix">
      <div className="stat-strip">
        {ROLES.map((r) => (
          <div className="stat" key={r.key}>
            <div className="l">
              <Icon name="shield-check" size={13} /> {r.label}
            </div>
            <div className="v" style={{ color: r.color }}>
              {USERS.filter((u) => u.role === r.key && u.status !== '탈퇴').length}
            </div>
            <div className="d" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9.5 }}>
              {r.key}
            </div>
          </div>
        ))}
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'users', label: '계정 목록', count: USERS.length },
            { key: 'matrix', label: '권한 매트릭스 (초안)' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'users' ? (
          <div style={{ padding: 14 }}>
            <DataTable
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => r.id}
              masked={masked}
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
                  <select className="sel" style={{ width: 110 }} value={branch} onChange={(e) => setBranch(e.target.value)}>
                    <option value="">전체 지점</option>
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="사용자_목록" columns={COLUMNS} rows={rows} masked={masked} />
                  <button className="btn pri">
                    <Icon name="user-plus" size={14} /> 계정 등록
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
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                메뉴 노출과 기능 접근이 이 표에 따라 자동으로 제한됩니다
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
