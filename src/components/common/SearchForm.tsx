import { useEffect, useState } from 'react'
import { DateRange, type DateRangeValue } from './DateRange'
import { Icon } from '../Icon'
import './search-form.css'

export type SearchValue = string | string[] | DateRangeValue

export type SearchValues = Record<string, SearchValue>

interface FieldBase {
  name: string
  label: string
  /** 그리드 가로 폭 (4열 기준) */
  span?: 1 | 2 | 4
  /**
   * 서버가 아직 못 거르는 조건. 입력을 막고 이유를 붙인다.
   *
   * ★ 조건을 **지우지 않는다**(CLAUDE.md 4). 지우면 "원래 없던 검색조건"처럼 보여서
   *   백엔드에 요청해야 할 것이 조용히 사라진다.
   * ★ 그렇다고 살려두면 더 나쁘다 — 서버가 **400 이 아니라 조용히 무시**하는 파라미터가
   *   있어서(CLAUDE.md 3-3), 골라도 결과가 안 바뀌는 것을 사용자는 "필터가 고장났다"가
   *   아니라 "해당 데이터가 원래 그만큼"으로 읽는다.
   */
  disabled?: boolean
  /** 왜 못 쓰는지. 사용자 말로 쓴다 — 파라미터명·엔드포인트를 적지 않는다 */
  disabledReason?: string
}

export type Field =
  | (FieldBase & { type: 'text'; placeholder?: string })
  | (FieldBase & { type: 'select'; options: { value: string; label: string }[] })
  | (FieldBase & { type: 'dateRange'; presets?: boolean })
  | (FieldBase & { type: 'chips'; options: string[]; multiple?: boolean })

interface Props {
  fields: Field[]
  onSearch: (values: SearchValues) => void
  /**
   * 검색조건 저장 키. 지정하면 조건을 이름 붙여 저장/재사용할 수 있다.
   * F-4.1-1 '검색조건 저장' — DSA에 없던 신규 요구사항.
   * ⚠ 현재는 localStorage 임시 저장. BE에 사용자별 저장 API가 생기면 교체할 것.
   */
  presetKey?: string
  /** 헤더 우측 커스텀 영역 */
  headerRight?: React.ReactNode
}

function emptyValue(f: Field): SearchValue {
  if (f.type === 'dateRange') return { from: '', to: '' }
  if (f.type === 'chips') return f.multiple ? [] : ''
  return ''
}

function initialValues(fields: Field[]): SearchValues {
  return Object.fromEntries(fields.map((f) => [f.name, emptyValue(f)]))
}

interface Preset {
  name: string
  values: SearchValues
}

function loadPresets(key: string): Preset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(`dlab.search.${key}`)
    return raw ? (JSON.parse(raw) as Preset[]) : []
  } catch {
    return []
  }
}

function savePresets(key: string, presets: Preset[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`dlab.search.${key}`, JSON.stringify(presets))
  } catch {
    /* 저장 실패는 무시 — 검색 자체는 계속 동작해야 한다 */
  }
}

export function SearchForm({ fields, onSearch, presetKey, headerRight }: Props) {
  const [values, setValues] = useState<SearchValues>(() => initialValues(fields))
  const [presets, setPresets] = useState<Preset[]>([])

  useEffect(() => {
    if (presetKey) setPresets(loadPresets(presetKey))
  }, [presetKey])

  function set(name: string, v: SearchValue) {
    setValues((prev) => ({ ...prev, [name]: v }))
  }

  function reset() {
    const init = initialValues(fields)
    setValues(init)
    onSearch(init)
  }

  function addPreset() {
    if (!presetKey) return
    const name = window.prompt('저장할 검색조건 이름을 입력하세요.')?.trim()
    if (!name) return
    const next = [...presets.filter((p) => p.name !== name), { name, values }]
    setPresets(next)
    savePresets(presetKey, next)
  }

  function removePreset(name: string) {
    if (!presetKey) return
    const next = presets.filter((p) => p.name !== name)
    setPresets(next)
    savePresets(presetKey, next)
  }

  function applyPreset(p: Preset) {
    setValues(p.values)
    onSearch(p.values)
  }

  const activeCount = fields.filter((f) => {
    const v = values[f.name]
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'object') return Boolean(v.from || v.to)
    return Boolean(v)
  }).length

  return (
    <form
      className="sf"
      onSubmit={(e) => {
        e.preventDefault()
        onSearch(values)
      }}
    >
      <div className="sf-h">
        <div className="t">
          <span className="ico">
            <Icon name="search" size={15} />
          </span>
          조건 검색
          {activeCount > 0 && (
            <span className="mk verified" style={{ marginLeft: 4 }}>
              {activeCount}개 적용
            </span>
          )}
        </div>
        <div className="sf-right">
          {presetKey && presets.length > 0 && (
            <div className="sf-presets">
              {presets.map((p) => (
                <span className="sf-preset" key={p.name} onClick={() => applyPreset(p)}>
                  {p.name}
                  <span
                    className="del"
                    role="button"
                    aria-label={`${p.name} 삭제`}
                    onClick={(e) => {
                      e.stopPropagation()
                      removePreset(p.name)
                    }}
                  >
                    ×
                  </span>
                </span>
              ))}
            </div>
          )}
          {headerRight}
        </div>
      </div>

      <div className="sf-body">
        {fields.map((f) => (
          <div
            className={`sf-field${f.span && f.span > 1 ? ` span${f.span}` : ''}${f.disabled ? ' off' : ''}`}
            key={f.name}
          >
            <label htmlFor={`sf-${f.name}`}>{f.label}</label>

            {f.type === 'text' && (
              <input
                id={`sf-${f.name}`}
                className="inp"
                placeholder={f.placeholder}
                value={values[f.name] as string}
                disabled={f.disabled}
                title={f.disabledReason}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}

            {f.type === 'select' && (
              <select
                id={`sf-${f.name}`}
                className="sel"
                value={values[f.name] as string}
                disabled={f.disabled}
                title={f.disabledReason}
                onChange={(e) => set(f.name, e.target.value)}
              >
                <option value="">전체</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}

            {f.type === 'dateRange' && (
              <DateRange
                value={values[f.name] as DateRangeValue}
                onChange={(v) => set(f.name, v)}
                presets={f.presets}
              />
            )}

            {f.type === 'chips' && (
              <div className="sf-chips">
                {f.options.map((o) => {
                  const cur = values[f.name]
                  const on = Array.isArray(cur) ? cur.includes(o) : cur === o
                  return (
                    <button
                      type="button"
                      key={o}
                      className={`chip${on ? ' on' : ''}`}
                      disabled={f.disabled}
                      title={f.disabledReason}
                      onClick={() => {
                        if (f.multiple) {
                          const arr = Array.isArray(cur) ? cur : []
                          set(f.name, on ? arr.filter((x) => x !== o) : [...arr, o])
                        } else {
                          set(f.name, on ? '' : o)
                        }
                      }}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
            )}

            {f.disabled && f.disabledReason && <div className="sf-off-why">{f.disabledReason}</div>}
          </div>
        ))}
      </div>

      <div className="sf-foot">
        <span className="sf-hint">
          {presetKey ? '자주 쓰는 조건은 저장해두고 재사용할 수 있습니다.' : `검색 조건 ${fields.length}개`}
        </span>
        <div className="sf-btns">
          {presetKey && (
            <button type="button" className="btn" onClick={addPreset}>
              조건 저장
            </button>
          )}
          <button type="button" className="btn" onClick={reset}>
            초기화
          </button>
          <button type="submit" className="btn pri">
            <Icon name="search" size={14} /> 검색
          </button>
        </div>
      </div>
    </form>
  )
}
