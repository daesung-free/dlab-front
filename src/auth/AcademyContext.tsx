import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { listAcademies, type Academy } from '../api/academies'
import { useAuth } from './AuthContext'

/**
 * 지점 스코프.
 *
 * ★ 이게 전역인 이유: 대부분의 목록 API가 `academyId`를 받고, **전 지점 권한 계정은 안 보내면
 *   400**이다. 화면마다 지점 선택을 두면 화면을 옮길 때마다 다시 골라야 하고, 안 고른 화면은
 *   그냥 비어 보인다("데이터 없음"과 구분이 안 된다).
 *
 * ★ 역할로 분기하지 않는다. 서버가 권한에 맞는 목록만 주므로(전 지점이면 11개, 지점 관리자면 1개)
 *   "목록이 1개면 그것으로 고정"만 하면 양쪽이 같은 코드로 돌아간다.
 */
interface AcademyState {
  academies: Academy[]
  /** 선택된 지점. 아직 못 고른 상태면 null — 이때 목록 API를 부르면 안 된다 */
  academyId: number | null
  setAcademyId: (id: number) => void
  /** 사용자가 고를 수 있는가. false면 지점이 하나뿐이라 선택 UI를 감춘다 */
  selectable: boolean
  loading: boolean
  error: string | null
}

const Ctx = createContext<AcademyState | null>(null)

/** 마지막 선택을 기억한다 — 새로고침할 때마다 다시 고르게 하지 않는다 */
const STORAGE_KEY = 'dlab.academyId'

function readStored(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) ? n : null
}

export function AcademyProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth()
  const [academies, setAcademies] = useState<Academy[]>([])
  const [academyId, setId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!signedIn) {
      setAcademies([])
      setId(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    listAcademies()
      .then((list) => {
        if (cancelled) return
        setAcademies(list)

        // 저장된 선택이 아직 유효할 때만 복원한다. 권한이 바뀌어 접근 못 하는 지점이
        // 남아 있으면 그 지점으로 계속 403을 맞는다.
        const stored = readStored()
        const restored = list.find((a) => a.id === stored)
        setId(restored?.id ?? (list.length === 1 ? list[0].id : null))
      })
      .catch(() => {
        if (!cancelled) setError('지점 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [signedIn])

  const setAcademyId = useCallback((id: number) => {
    setId(id)
    localStorage.setItem(STORAGE_KEY, String(id))
  }, [])

  const value = useMemo<AcademyState>(
    () => ({ academies, academyId, setAcademyId, selectable: academies.length > 1, loading, error }),
    [academies, academyId, setAcademyId, loading, error],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAcademy(): AcademyState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAcademy는 AcademyProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
