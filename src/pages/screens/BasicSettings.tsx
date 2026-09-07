import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DataTable, ExcelButton, useServerData, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import { MASTERS, copyYear, type MasterDef, type MasterRow } from '../../api/masters'
import type { Mockup } from './types'

/* F-4.10-1 기초 관리 — 마스터 10종 + 전년도 복사
 *
 * 클라이언트 메뉴표는 '과정 관리 / 학과 관리 / 학과계열 관리'를 각각 별도 메뉴로 둔다.
 * 마스터마다 화면을 복제하면 전년도 복사 의존이 화면에 흩어지므로, 화면은 하나로 두고
 * `?tab=` 으로 진입 마스터만 달리한다.
 *
 * ★ 표는 하나인데 **마스터마다 있는 컬럼이 다르다.** 없는 컬럼은 `<Unfilled/>`가 아니라
 *   아예 숨긴다 — Unfilled 는 "서버가 아직 안 준다"는 뜻인데 여기는 대부분
 *   **의도적으로 없는 것**이다(강의실 코드는 roomNo 가 대신하고, 학과계열은 참조처가 없다).
 *   판단은 `src/api/masters.ts` 의 columns 플래그에 있다.
 *
 * ★ 전년도 복사 의존은 **두 갈래뿐이다**(과정→반→교육과정, 상벌점항목→상벌점규칙).
 *   목업은 7단계 일렬로 그렸는데 실제와 다르다 — 줄 세우면 실제보다 복잡해 보이고,
 *   무엇보다 틀린 순서를 안내하게 된다. 대상 목록과 의존 두 갈래만 보여준다.
 *
 * ★ 강의실·사물함은 복사 대상이 아니다. 물리 공간이라 기수가 바뀌어도 그대로고
 *   서버 테이블에 연도 컬럼이 아예 없다.
 */

const PAGE_SIZE = 10

/** 실제 의존은 이 두 갈래뿐이다. 나머지 마스터는 서로 독립이다 */
const DEPENDENCIES = [
  ['과정(전형)', '반', '교육과정'],
  ['상벌점 항목', '상벌점 규칙'],
]

function thisYear(): number {
  return new Date().getFullYear()
}

function Content() {
  const { academyId } = useAcademy()
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const active: MasterDef = MASTERS.find((m) => m.key === params.get('tab')) ?? MASTERS[0]
  const year = thisYear()

  // ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다
  const ctx = useMemo(() => ({ academyId: academyId ?? 0, year }), [academyId, year])

  // 마스터를 바꾸면 fetcher 가 바뀐다. useServerData 는 fetcher 를 ref 로 들고 있어
  // 그것만으로는 다시 부르지 않으므로, 어느 마스터인지를 params 에 실어 재조회를 일으킨다
  const listParams = useMemo(() => ({ ...ctx, key: active.key }), [ctx, active.key])

  const list = useServerData({
    fetcher: (p: { academyId: number; year: number; key: string }) =>
      (MASTERS.find((m) => m.key === p.key) ?? MASTERS[0]).list({ academyId: p.academyId, year: p.year }),
    params: listParams,
    enabled: academyId !== null,
    errorMessage: '기초 데이터를 불러오지 못했습니다.',
  })

  const rows = list.data ?? []

  function setActive(m: MasterDef) {
    setParams({ tab: m.key }, { replace: true })
    setMsg(null)
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      setMsg(`${label} 완료`)
      list.reload()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : `${label} 실패`)
    } finally {
      setBusy(false)
    }
  }

  function add() {
    if (!active.create) return
    const name = window.prompt(`추가할 ${active.label} 이름을 입력하세요.`)?.trim()
    if (!name) return
    void run(`${active.label} '${name}' 등록`, () => active.create!(ctx, name))
  }

  function rename(row: MasterRow) {
    if (!active.rename) return
    const name = window.prompt(`${active.label} 이름을 수정합니다.`, row.name)?.trim()
    if (!name || name === row.name) return
    void run(`'${row.name}' → '${name}' 수정`, () => active.rename!(row, name))
  }

  function remove(row: MasterRow) {
    if (!active.remove) return
    if (!window.confirm(`'${row.name}' 을(를) 삭제합니다. 이 값을 쓰던 기록은 남습니다.`)) return
    void run(`'${row.name}' 삭제`, () => active.remove!(row.id))
  }

  function toggle(row: MasterRow) {
    if (!active.setActive || row.active === null) return
    const next = !row.active
    void run(`'${row.name}' ${next ? '사용' : '중지'}`, () => active.setActive!(row.id, next))
  }

  async function copyPrevious() {
    if (academyId === null) return
    const from = window.prompt('복사할 원본 연도를 입력하세요.', String(year - 1))?.trim()
    if (!from) return
    const to = window.prompt('붙여넣을 연도를 입력하세요.', String(year))?.trim()
    if (!to) return

    setBusy(true)
    setMsg(null)
    try {
      const res = await copyYear({ academyId, fromYear: Number(from), toYear: Number(to) })
      const detail = Object.entries(res.copied)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k} ${n}건`)
        .join(' · ')
      setMsg(`${res.fromYear} → ${res.toYear} 복사 완료. ${detail || '복사된 것이 없습니다.'}`)
      list.reload()
    } catch (err) {
      // 대상 연도에 데이터가 있으면 409다 — 덮어쓰지 않는 것이 서버 설계다
      setMsg(err instanceof ApiError ? err.message : '전년도 복사에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<MasterRow>[] = useMemo(() => {
    const cols: Column<MasterRow>[] = []

    if (active.columns.sortOrder) {
      cols.push({ key: 'order', header: '순서', width: '64px', align: 'center', sortable: true, value: (r) => r.sortOrder ?? 0 })
    }
    if (active.columns.code) {
      cols.push({
        key: 'code',
        // 강의실은 코드 자리를 방 번호가 대신한다 — 헤더도 그렇게 부른다
        header: active.key === 'room' ? '호실' : active.key === 'locker' ? '번호' : '코드',
        width: '110px',
        sortable: true,
        value: (r) => r.code ?? '-',
        render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
      })
    }

    cols.push({ key: 'name', header: '명칭', width: '180px', sortable: true, value: (r) => r.name })
    cols.push({ key: 'memo', header: active.memoLabel ?? '비고', value: (r) => r.memo ?? '-' })

    if (active.columns.active) {
      cols.push({
        key: 'active',
        header: '사용',
        width: '72px',
        align: 'center',
        sortable: true,
        value: (r) => (r.active ? '사용' : '중지'),
        render: (r, shown) =>
          active.setActive ? (
            <button
              className={`mk ${r.active ? 'verified' : 'brandnew'}`}
              style={{ border: 'none', cursor: 'pointer', font: 'inherit' }}
              disabled={busy}
              onClick={() => toggle(r)}
              title="눌러서 전환"
            >
              {shown}
            </button>
          ) : (
            <span className={`mk ${r.active ? 'verified' : 'brandnew'}`}>{shown}</span>
          ),
      })
    }

    if (active.rename || active.remove) {
      cols.push({
        key: 'act',
        header: '',
        width: '92px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {active.rename && (
              <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled={busy} onClick={() => rename(r)}>
                수정
              </button>
            )}
            {active.remove && (
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
                disabled={busy}
                onClick={() => remove(r)}
              >
                삭제
              </button>
            )}
          </div>
        ),
      })
    }

    return cols
  }, [active, busy])

  return (
    <>
      <div className="note-box plain">
        <div className="ic">
          <Icon name="history" size={17} />
        </div>
        <div>
          <div className="tt">전년도 복사 — 의존이 있는 것은 두 갈래입니다</div>
          <div className="tx">
            {/* 두 갈래를 한 줄에 이어 붙이면 하나의 긴 사슬로 읽힌다 — 줄을 나눈다 */}
            {DEPENDENCIES.map((chain, i) => (
              <div key={i} style={{ fontWeight: 700 }}>
                {chain.join(' → ')}
              </div>
            ))}
            나머지 마스터는 서로 독립이라 순서가 없습니다. <b>강의실·사물함은 복사되지 않습니다</b> —
            물리 공간이라 기수가 바뀌어도 그대로입니다.
            <br />
            교시·승인 항목·상벌점 규칙도 같이 복사되고, <b>직원은 마스터가 아니라 등록 건 이월</b>입니다
            (학번·카드를 그대로 들고 갑니다).
            <br />
            대상 연도에 이미 데이터가 있으면 <b>덮어쓰지 않고 거부</b>됩니다.
          </div>
        </div>
      </div>

      {academyId === null && <div className="note-box">지점을 먼저 선택하세요.</div>}

      {list.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {list.error}
        </div>
      )}

      {msg && <div className="note-box">{msg}</div>}

      <div className="split-3-2">
        <div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => `${active.key}:${r.id}`}
            masked={false}
            loading={list.loading}
            pageSize={PAGE_SIZE}
            countLabel={
              <>
                {active.label} <b>{rows.length}</b>건 · <code style={{ fontSize: 11 }}>{active.table}</code>
              </>
            }
            toolbar={
              <>
                <button className="btn" disabled={busy || academyId === null} onClick={() => void copyPrevious()}>
                  <Icon name="history" size={14} /> 전년도 복사
                </button>
                <ExcelButton filename={`기초_${active.label}`} columns={columns} rows={rows} masked={false} />
                {active.create ? (
                  <button className="btn pri" disabled={busy} onClick={add}>
                    <Icon name="plus" size={14} /> 등록
                  </button>
                ) : (
                  // 이름만으로는 못 만드는 마스터가 있다 — 상벌점(구분·점수), 강의실(호실),
                  // 장학 종류(코드·할인율), 사물함. 전용 폼이 필요하다
                  <button className="btn pri" disabled title={`${active.label}은(는) 이름 외에 필수값이 있어 전용 등록 폼이 필요합니다`}>
                    <Icon name="plus" size={14} /> 등록
                  </button>
                )}
              </>
            }
          />
        </div>

        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="sliders-horizontal" size={15} />
              </span>
              기초 데이터 종류
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 11 }}>
            {MASTERS.map((m) => (
              <button
                type="button"
                key={m.key}
                onClick={() => setActive(m)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: active.key === m.key ? 'var(--mint-wash)' : 'transparent',
                  color: active.key === m.key ? 'var(--mint-d)' : 'var(--ink-2)',
                  fontWeight: active.key === m.key ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <Icon name={m.icon} size={15} />
                <span style={{ flex: 1 }}>{m.label}</span>
                {m.copied && (
                  <span className="ph p1" title="전년도 복사 대상">
                    복사
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export const basicSettingsMockup: Mockup = {
  Content,
  // 조회 연도는 화면이 현재 연도로 고정한다. actions 는 상태를 못 가져 고를 수 없다
  actions: <button className="btn" disabled>{new Date().getFullYear()} 시즌</button>,
}
