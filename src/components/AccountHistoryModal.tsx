import { useEffect, useState } from 'react'
import { Modal } from './common'
import { ApiError } from '../api/client'
import { listAccountHistory, parseAccountChanges, type AccountHistory } from '../api/accounts'

/*
 * 계정 변경 이력 창 — 사용자 관리의 줄 '이력 보기' 와 헤더 '권한 변경 이력' 이 같이 쓴다.
 *
 * ★ 서버는 칸 이름·값을 코드로 준다(status · locked · ACTIVE …). 행정 선생님이 읽을 말로 바꾼다.
 *   모르는 코드는 그대로 보인다 — 숨기면 무슨 일이 있었는지 아예 사라진다.
 */

const FIELD: Record<string, string> = {
  status: '계정 상태',
  locked: '로그인 잠금',
  roles: '역할',
  menus: '메뉴 권한',
  temporaryPassword: '임시 비밀번호',
  academyId: '지점',
  mustChangePassword: '비밀번호 변경 요구',
}

const VALUE: Record<string, string> = {
  ACTIVE: '사용',
  PENDING: '승인 대기',
  WITHDRAWN: '탈퇴',
  LOCKED: '잠김',
  true: '예',
  false: '아니요',
  reissued: '재발급',
  SUPER_ADMIN: '최고관리자',
  BRANCH_ADMIN: '지점관리자',
  TEACHER: '담임',
  STAFF: '행정',
  READONLY: '조회 전용',
}

function word(v: string | null): string {
  if (v === null || v === '') return '-'
  return v
    .split(',')
    .map((x) => VALUE[x.trim()] ?? x.trim())
    .join(', ')
}

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function AccountHistoryModal({
  accountId,
  title,
  onClose,
  children,
}: {
  /** null 이면 아직 계정을 안 고른 상태 */
  accountId: number | null
  title: string
  onClose: () => void
  /** 창 위쪽에 둘 것(헤더 버튼은 계정 고르는 칸을 넣는다) */
  children?: React.ReactNode
}) {
  const [rows, setRows] = useState<AccountHistory[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setRows(null)
    setErr(null)
    if (accountId === null) return
    let alive = true
    listAccountHistory(accountId)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setErr(e instanceof ApiError ? e.message : '이력을 불러오지 못했습니다.'))
    return () => {
      alive = false
    }
  }, [accountId])

  return (
    <Modal wide title={title} hideCancel confirmLabel="닫기" onConfirm={onClose} onClose={onClose} error={err}>
      {children}
      {accountId === null ? null : rows === null ? (
        <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13 }}>바뀐 기록이 없습니다.</div>
      ) : (
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          <table className="dt" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>일시</th>
                <th style={{ width: 110 }}>항목</th>
                <th>바뀐 내용</th>
                <th style={{ width: 100 }}>바꾼 사람</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((h) => {
                const cs = parseAccountChanges(h.changes)
                const list = cs.length > 0 ? cs : [{ field: h.action, before: null, after: null }]
                return list.map((c, i) => (
                  <tr key={`${h.id}-${i}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{i === 0 ? when(h.occurredAt) : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{FIELD[c.field] ?? c.field}</td>
                    <td>
                      {word(c.before)} → <b>{word(c.after)}</b>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{i === 0 ? (h.actorName ?? '-') : ''}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
