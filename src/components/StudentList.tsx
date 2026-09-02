import { useState } from 'react'
import './student-list.css'

export interface StudentRow {
  id: string
  name: string
  /** 자연 · 재수 · 3반 4019 */
  meta: string
  /** 이름 옆 태그 */
  tag?: { label: string; tone: 'na' | 'in' | 'risk' | 'up' }
  /** 우측 날짜 영역 */
  date?: string
  /** 우측 상단 강조 문구 (D-1 예정 / 지연 3일) */
  due?: string
  /** 붉은 아바타 강조 */
  warn?: boolean
}

interface Props {
  title: string
  count: string
  filters: string[]
  rows: StudentRow[]
  /** 최초 선택 학생 id */
  initialSelected?: string
  /**
   * 선택을 바깥에서 다스릴 때 준다(실연동 화면). 주면 내부 상태 대신 이 값을 쓴다 —
   * 학생을 고르면 상세를 서버에서 다시 읽어야 해서 화면이 선택을 알아야 한다.
   * 안 주면 기존처럼 스스로 관리한다(목업 화면이 그대로 동작한다).
   */
  selected?: string
  onSelect?: (id: string) => void
  /** 필터도 마찬가지. 서버 조건으로 넘기는 화면만 준다 */
  filter?: string
  onFilterChange?: (filter: string) => void
  loading?: boolean
  emptyText?: string
}

/** 상담·성적 시안이 공유하던 좌측 재원생 목록 패널 */
export function StudentList({
  title,
  count,
  filters,
  rows,
  initialSelected,
  selected: selectedProp,
  onSelect,
  filter: filterProp,
  onFilterChange,
  loading = false,
  emptyText = '학생이 없습니다.',
}: Props) {
  const [innerSelected, setInnerSelected] = useState(initialSelected ?? rows[0]?.id)
  const [innerFilter, setInnerFilter] = useState(filters[0])

  // 바깥에서 준 값이 있으면 그것을 따른다(제어 컴포넌트). 없으면 스스로 관리한다
  const selected = selectedProp ?? innerSelected
  const filter = filterProp ?? innerFilter

  function pick(id: string): void {
    if (onSelect) onSelect(id)
    else setInnerSelected(id)
  }

  function pickFilter(f: string): void {
    if (onFilterChange) onFilterChange(f)
    else setInnerFilter(f)
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <div className="t">{title}</div>
        <div className="c">{count}</div>
      </div>
      <div className="filter-row">
        {filters.map((f) => (
          <button type="button" key={f} className={`chip${filter === f ? ' on' : ''}`} onClick={() => pickFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="slist">
        {rows.length === 0 && (
          <div className="dt-empty">{loading ? '불러오는 중…' : emptyText}</div>
        )}
        {rows.map((r) => (
          <button
            type="button"
            key={r.id}
            className={`srow${selected === r.id ? ' on' : ''}${r.warn ? ' warn' : ''}`}
            onClick={() => pick(r.id)}
          >
            <div className="avatar">{r.name.slice(0, 1)}</div>
            <div className="sinfo">
              <div className="n">
                {r.name}
                {r.tag && <span className={`tag ${r.tag.tone}`}>{r.tag.label}</span>}
              </div>
              <div className="m">{r.meta}</div>
            </div>
            <div className="sdate">
              {r.due && (
                <>
                  <span className="due">{r.due}</span>
                  <br />
                </>
              )}
              {r.date}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
