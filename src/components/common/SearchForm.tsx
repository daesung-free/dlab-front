import { useEffect, useState } from 'react'
import {
  deleteSavedSearch,
  listSavedSearches,
  saveSearch,
  type SearchType,
} from '../../api/savedSearches'
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
   * 검색조건 저장을 켠다. 값은 **어느 화면의 조건인가**(서버 `searchType`)다.
   * F-4.1-1 '검색조건 저장' — DSA에 없던 신규 요구사항.
   *
   * ★ 2026-09-25 부터 **서버에 계정별로 저장한다.** 그전에는 브라우저에 저장해서
   *   PC 를 바꾸면 사라지고 계정 간 공유도 안 됐다.
   * ★ 값을 안 주면 저장 기능 자체가 꺼진다. 아무 화면에서나 켜면 남의 화면 조건과 섞인다.
   */
  presetKey?: SearchType
  /** 헤더 우측 커스텀 영역 */
  headerRight?: React.ReactNode
  /**
   * 처음 채워둘 값. 초기화를 눌러도 여기로 돌아온다.
   *
   * ★ 서버가 **조건을 비우면 기본값을 적용하는** 목록이 있다(감사 로그는 비우면 오늘분).
   *   그 경우 칸이 비어 있으면 지금 무엇을 보고 있는지가 화면에 안 드러나서, 사용자는
   *   전체를 보고 있다고 생각한다. 기본값을 화면에도 그대로 적어준다.
   */
  initial?: SearchValues
}

function emptyValue(f: Field): SearchValue {
  if (f.type === 'dateRange') return { from: '', to: '' }
  if (f.type === 'chips') return f.multiple ? [] : ''
  return ''
}

function initialValues(fields: Field[], initial?: SearchValues): SearchValues {
  return { ...Object.fromEntries(fields.map((f) => [f.name, emptyValue(f)])), ...initial }
}

interface Preset {
  id: number
  name: string
  values: SearchValues
}

/**
 * 저장된 조건 → 화면 값.
 *
 * ★ **화면이 칸을 바꾸면 옛 조건이 그대로 돌아온다.** 서버는 JSON 을 파싱하지 않고 보관만 한다.
 *   그래서 지금 칸에 있는 이름만 받아들이고 나머지는 버린다 — 없는 칸의 값을 그대로 넣으면
 *   그 조건이 조회에 조용히 섞인다.
 */
function parseConditions(raw: string, fields: Field[], initial?: SearchValues): SearchValues | null {
  try {
    const saved = JSON.parse(raw) as Record<string, unknown>
    const base = initialValues(fields, initial)
    for (const f of fields) {
      const v = saved[f.name]
      if (v !== undefined) base[f.name] = v as SearchValue
    }
    return base
  } catch {
    return null
  }
}

export function SearchForm({ fields, onSearch, presetKey, headerRight, initial }: Props) {
  const [values, setValues] = useState<SearchValues>(() => initialValues(fields, initial))
  const [presets, setPresets] = useState<Preset[]>([])
  /** 조건 저장 이름 입력. null 이면 닫힘 */
  const [naming, setNaming] = useState<string | null>(null)
  /* 저장·삭제가 실패해도 **검색은 계속돼야 한다.** 조건 저장은 곁가지 기능이다 */
  const [presetErr, setPresetErr] = useState<string | null>(null)

  useEffect(() => {
    if (!presetKey) return
    let cancelled = false
    listSavedSearches(presetKey)
      .then((list) => {
        if (cancelled) return
        setPresets(
          list.flatMap((sv) => {
            const values = parseConditions(sv.conditions, fields, initial)
            // 못 읽는 조건은 버린다 — 눌렀을 때 아무 일이 없는 것보다 안 보이는 편이 낫다
            return values ? [{ id: sv.id, name: sv.name, values }] : []
          }),
        )
      })
      .catch(() => !cancelled && setPresets([]))
    return () => {
      cancelled = true
    }
    // fields·initial 은 매 렌더 새 배열이라 의존성에 넣으면 요청이 끝없이 나간다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey])

  function set(name: string, v: SearchValue) {
    setValues((prev) => ({ ...prev, [name]: v }))
  }

  function reset() {
    const init = initialValues(fields, initial)
    setValues(init)
    onSearch(init)
  }

  /* ★ window.prompt 를 쓰지 않는다. 값을 못 받는 환경에서는 즉시 null 이라 **눌러도 아무 일이
       없고**, 대화상자가 떠 있는 동안 탭 전체가 멈춘다(Modal.tsx 주석). */
  async function addPreset(name: string) {
    if (!presetKey) return
    const trimmed = name.trim()
    if (!trimmed) return
    setPresetErr(null)
    try {
      // 서버도 같은 이름은 덮어쓴다. 화면 목록에서도 옛것을 빼고 새것을 넣는다
      const saved = await saveSearch(presetKey, trimmed, JSON.stringify(values))
      setPresets((prev) => [...prev.filter((p) => p.name !== trimmed), { id: saved.id, name: trimmed, values }])
      setNaming(null)
    } catch {
      setPresetErr('조건을 저장하지 못했습니다.')
    }
  }

  async function removePreset(p: Preset) {
    if (!presetKey) return
    setPresetErr(null)
    try {
      await deleteSavedSearch(p.id)
      setPresets((prev) => prev.filter((x) => x.id !== p.id))
    } catch {
      setPresetErr('조건을 지우지 못했습니다.')
    }
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
                <span className="sf-preset" key={p.id} onClick={() => applyPreset(p)}>
                  {p.name}
                  <span
                    className="del"
                    role="button"
                    aria-label={`${p.name} 삭제`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void removePreset(p)
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
          {/* 저장 실패를 조용히 넘기면 "저장을 눌렀는데 안 생긴다" 가 된다 */}
          {presetErr !== null ? (
            <span style={{ color: 'var(--red)' }}>{presetErr}</span>
          ) : presetKey ? (
            '자주 쓰는 조건은 저장해두고 재사용할 수 있습니다. 다른 PC 에서도 그대로 보입니다.'
          ) : (
            `검색 조건 ${fields.length}개`
          )}
        </span>
        <div className="sf-btns">
          {presetKey &&
            (naming === null ? (
              <button type="button" className="btn" onClick={() => setNaming('')}>
                조건 저장
              </button>
            ) : (
              /* 이름을 그 자리에서 받는다. 별도 모달을 띄울 만큼 큰 일이 아니다 */
              <>
                <input
                  className="inp"
                  style={{ width: 160 }}
                  autoFocus
                  value={naming}
                  placeholder="조건 이름"
                  onChange={(e) => setNaming(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void addPreset(naming)
                    }
                    if (e.key === 'Escape') setNaming(null)
                  }}
                />
                <button type="button" className="btn pri" disabled={naming.trim() === ''} onClick={() => void addPreset(naming)}>
                  저장
                </button>
                <button type="button" className="btn" onClick={() => setNaming(null)}>
                  취소
                </button>
              </>
            ))}
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
