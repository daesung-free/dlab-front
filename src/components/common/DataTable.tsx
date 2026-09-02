import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { maskValue, type MaskKind } from '../../lib/mask'
import { Icon } from '../Icon'
import './data-table.css'

export interface Column<T> {
  key: string
  header: ReactNode
  /** CSS width (예: '120px', '18%') */
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  /**
   * 개인정보 컬럼. 지정하면 masked 상태에서 자동으로 가려지고
   * 엑셀 Export에도 동일하게 반영된다.
   */
  mask?: MaskKind
  /** 정렬·엑셀에 쓰는 원시값. 대부분의 컬럼은 이것만 있으면 된다 */
  value: (row: T) => string | number
  /** 셀 커스텀 렌더 (배지 등). 없으면 value를 그대로 그린다 */
  render?: (row: T, displayValue: string) => ReactNode
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** 체크박스 일괄선택 — 상벌점 '선택 일괄 점수부여' 같은 화면용 */
  selectable?: boolean
  selected?: string[]
  onSelectedChange?: (ids: string[]) => void
  onRowClick?: (row: T) => void
  /** 개인정보 마스킹. 기본 ON (실행가이드 3.2) */
  masked?: boolean
  pageSize?: number
  /**
   * 서버 페이징. 주면 DataTable은 rows를 자르지 않고 "현재 페이지"로 그대로 그린다.
   * `useServerTable`이 만들어주는 값을 그대로 넘기면 된다.
   *
   * ★ 정렬은 `onSortChange`가 있을 때만 헤더에 뜬다. 서버 정렬 없이 헤더만 살려두면
   *   화면에 온 한 페이지만 정렬해놓고 전체가 정렬된 것처럼 보여서, 조용히 틀린 목록을 읽게 된다.
   */
  serverPaging?: ServerPaging
  /** 로딩 중 표시. 이전 결과는 지우지 않는다 — 페이지를 넘길 때마다 화면이 깜빡인다 */
  loading?: boolean
  emptyText?: string
  /** 툴바 우측 영역 — ExcelButton 등 */
  toolbar?: ReactNode
  /** 툴바 좌측 라벨. 기본 '전체 N건' */
  countLabel?: ReactNode
}

export interface ServerPaging {
  /** 0-based (Spring Data 규약 그대로 — 변환하면 오프바이원이 조용히 생긴다) */
  page: number
  totalPages: number
  totalElements: number
  onPageChange: (page: number) => void
  /** 서버 정렬을 지원하는 화면만 준다. 없으면 정렬 헤더가 아예 안 뜬다 */
  onSortChange?: (key: string, dir: 'asc' | 'desc') => void
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null

/** 셀에 실제로 표시될 문자열 (마스킹 적용 후) */
export function displayCell<T>(col: Column<T>, row: T, masked: boolean): string {
  const raw = String(col.value(row) ?? '')
  return masked ? maskValue(col.mask, raw) : raw
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectable = false,
  selected,
  onSelectedChange,
  onRowClick,
  masked = true,
  pageSize = 20,
  serverPaging,
  loading = false,
  emptyText = '조회 결과가 없습니다.',
  toolbar,
  countLabel,
}: Props<T>) {
  const [sort, setSort] = useState<SortState>(null)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    // 서버 정렬을 쓰는 화면은 서버가 준 순서를 그대로 유지한다
    if (!sort || serverPaging) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = col.value(a)
      const bv = col.value(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
      return String(av).localeCompare(String(bv), 'ko') * factor
    })
  }, [rows, sort, columns, serverPaging])

  // 서버 페이징이면 rows가 곧 현재 페이지다. 페이지 번호만 1-based로 맞춰 UI를 공유한다.
  const totalPages = serverPaging
    ? Math.max(1, serverPaging.totalPages)
    : Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = serverPaging ? serverPaging.page + 1 : Math.min(page, totalPages)
  const pageRows = serverPaging ? sorted : sorted.slice((current - 1) * pageSize, current * pageSize)

  function goToPage(n: number): void {
    if (serverPaging) serverPaging.onPageChange(n - 1)
    else setPage(n)
  }

  // 서버 페이징인데 서버 정렬을 안 받으면 정렬을 끈다(위 serverPaging 주석 참고)
  const sortEnabled = !serverPaging || serverPaging.onSortChange !== undefined

  const pageIds = pageRows.map(rowKey)
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected?.includes(id))

  function toggleSort(key: string) {
    const next: SortState =
      sort?.key !== key ? { key, dir: 'asc' } : sort.dir === 'asc' ? { key, dir: 'desc' } : null
    setSort(next)

    if (serverPaging?.onSortChange) {
      // 서버 정렬은 '해제'가 없다. 세 번째 클릭은 오름차순으로 되돌린다
      serverPaging.onSortChange(next?.key ?? key, next?.dir ?? 'asc')
      if (!next) setSort({ key, dir: 'asc' })
    } else {
      setPage(1)
    }
  }

  function toggleAll() {
    if (!onSelectedChange) return
    const rest = (selected ?? []).filter((id) => !pageIds.includes(id))
    onSelectedChange(allChecked ? rest : [...rest, ...pageIds])
  }

  function toggleOne(id: string) {
    if (!onSelectedChange) return
    const cur = selected ?? []
    onSelectedChange(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }

  // 페이지 번호 — 현재 페이지 주변 5개만
  const from = Math.max(1, Math.min(current - 2, totalPages - 4))
  const pageNums = Array.from({ length: Math.min(5, totalPages) }, (_, i) => from + i)

  return (
    <div className="dt-wrap">
      <div className="dt-toolbar">
        <span className="dt-count">
          {countLabel ?? <>전체 <b>{serverPaging ? serverPaging.totalElements : rows.length}</b>건</>}
        </span>
        {selectable && (selected?.length ?? 0) > 0 && <span className="dt-sel">{selected!.length}건 선택</span>}
        {masked && (
          <span className="dt-count" style={{ color: 'var(--muted)' }}>
            · 개인정보 마스킹 <b style={{ color: 'var(--mint-d)' }}>ON</b>
          </span>
        )}
        {toolbar && <div className="dt-right">{toolbar}</div>}
      </div>

      <div className="dt-scroll">
        <table className="dt">
          <thead>
            <tr>
              {selectable && (
                <th className="cb-col">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="전체 선택" />
                </th>
              )}
              {columns.map((c) => {
                const isSorted = sort?.key === c.key
                return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={[
                      c.align ? `al-${c.align}` : '',
                      c.sortable && sortEnabled ? 'sortable' : '',
                      isSorted ? 'sorted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={c.sortable && sortEnabled ? () => toggleSort(c.key) : undefined}
                  >
                    {c.header}
                    {c.sortable && sortEnabled && (
                      <span className="sort-ico">
                        <Icon name={isSorted && sort.dir === 'desc' ? 'chevron-down' : 'chevron-up'} size={12} />
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const id = rowKey(row)
              const checked = selected?.includes(id) ?? false
              return (
                <tr
                  key={id}
                  className={[checked ? 'on' : '', onRowClick ? 'clickable' : ''].filter(Boolean).join(' ')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <td className="cb-col" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked} onChange={() => toggleOne(id)} aria-label={`${id} 선택`} />
                    </td>
                  )}
                  {columns.map((c) => {
                    const shown = displayCell(c, row, masked)
                    return (
                      <td
                        key={c.key}
                        className={[c.align ? `al-${c.align}` : '', c.mask && masked ? 'masked' : '']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {c.render ? c.render(row, shown) : shown}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        {pageRows.length === 0 && <div className="dt-empty">{loading ? '불러오는 중…' : emptyText}</div>}
      </div>

      {totalPages > 1 && (
        <div className="dt-foot">
          <span className="dt-page-info">
            {current} / {totalPages} 페이지 · {serverPaging ? rows.length : pageSize}건씩
          </span>
          <div className="dt-pager">
            <button type="button" onClick={() => goToPage(current - 1)} disabled={current === 1}>
              이전
            </button>
            {pageNums.map((n) => (
              <button type="button" key={n} className={n === current ? 'on' : ''} onClick={() => goToPage(n)}>
                {n}
              </button>
            ))}
            <button type="button" onClick={() => goToPage(current + 1)} disabled={current === totalPages}>
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
