import './date-range.css'

export interface DateRangeValue {
  from: string
  to: string
}

interface Props {
  value: DateRangeValue
  onChange: (v: DateRangeValue) => void
  /** 빠른 선택 칩 노출 (수납현황 기간검색 등) */
  presets?: boolean
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const PRESETS: { label: string; range: () => DateRangeValue }[] = [
  {
    label: '오늘',
    range: () => {
      const t = iso(new Date())
      return { from: t, to: t }
    },
  },
  {
    label: '최근 7일',
    range: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 6)
      return { from: iso(from), to: iso(to) }
    },
  },
  {
    label: '이번 달',
    range: () => {
      const now = new Date()
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }
    },
  },
  {
    label: '지난 달',
    range: () => {
      const now = new Date()
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    },
  },
]

export function DateRange({ value, onChange, presets = false }: Props) {
  return (
    <div className="dr">
      <div className="dr-inputs">
        <input
          type="date"
          className="inp"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
        <span className="dr-tilde">~</span>
        <input
          type="date"
          className="inp"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>
      {presets && (
        <div className="dr-presets">
          {PRESETS.map((p) => {
            const r = p.range()
            const on = value.from === r.from && value.to === r.to
            return (
              <button type="button" key={p.label} className={`chip${on ? ' on' : ''}`} onClick={() => onChange(r)}>
                {p.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
