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
  emptyText?: string
  /** 툴바 우측 영역 — ExcelButton 등 */
  toolbar?: ReactNode
  /** 툴바 좌측 라벨. 기본 '전체 N건' */
  countLabel?: ReactNode
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
  emptyText = '조회 결과가 없습니다.',
  toolbar,
  countLabel,
}: Props<T>) {
  const [sort, setSort] = useState<SortState>(null)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = col.value(a)
      const bv = col.value(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
      return String(av).localeCompare(String(bv), 'ko') * factor
    })
  }, [rows, sort, columns])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, totalPages)
  const pageRows = sorted.slice((current - 1) * pageSize, current * pageSize)

  const pageIds = pageRows.map(rowKey)
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected?.includes(id))

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
    setPage(1)
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
        <span className="dt-count">{countLabel ?? <>전체 <b>{rows.length}</b>건</>}</span>
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
                      c.sortable ? 'sortable' : '',
                      isSorted ? 'sorted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                  >
                    {c.header}
                    {c.sortable && (
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
        {pageRows.length === 0 && <div className="dt-empty">{emptyText}</div>}
      </div>

      {totalPages > 1 && (
        <div className="dt-foot">
          <span className="dt-page-info">
            {current} / {totalPages} 페이지 · {pageSize}건씩
          </span>
          <div className="dt-pager">
            <button type="button" onClick={() => setPage(current - 1)} disabled={current === 1}>
              이전
            </button>
            {pageNums.map((n) => (
              <button type="button" key={n} className={n === current ? 'on' : ''} onClick={() => setPage(n)}>
                {n}
              </button>
            ))}
            <button type="button" onClick={() => setPage(current + 1)} disabled={current === totalPages}>
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
