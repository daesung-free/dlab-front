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
}

/** 상담·성적 시안이 공유하던 좌측 재원생 목록 패널 */
export function StudentList({ title, count, filters, rows, initialSelected }: Props) {
  const [selected, setSelected] = useState(initialSelected ?? rows[0]?.id)
  const [filter, setFilter] = useState(filters[0])

  return (
    <section className="panel">
      <div className="panel-h">
        <div className="t">{title}</div>
        <div className="c">{count}</div>
      </div>
      <div className="filter-row">
        {filters.map((f) => (
          <button type="button" key={f} className={`chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="slist">
        {rows.map((r) => (
          <button
            type="button"
            key={r.id}
            className={`srow${selected === r.id ? ' on' : ''}${r.warn ? ' warn' : ''}`}
            onClick={() => setSelected(r.id)}
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
