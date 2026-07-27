import './tabs.css'

export interface TabItem {
  key: string
  label: string
  /** 라벨 뒤 카운트 배지 */
  count?: number
}

interface Props {
  items: TabItem[]
  active: string
  onChange: (key: string) => void
  /** 패널 내부가 아니라 단독으로 쓸 때 */
  standalone?: boolean
}

export function Tabs({ items, active, onChange, standalone }: Props) {
  return (
    <div className={`tabs${standalone ? ' standalone' : ''}`}>
      {items.map((t) => (
        <button
          type="button"
          key={t.key}
          className={`tab${active === t.key ? ' on' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && <span className="cnt">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
