import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, Unfilled, type Column, toDateStr } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  HOLIDAY_TYPE_LABEL,
  createHoliday,
  deleteHoliday,
  listHolidays,
  updateHoliday,
  type Holiday,
  type HolidayType,
} from '../../api/holidays'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.11-10 연간 행사 마스터 → 학습계획 반영 — /api/v1/admin/holidays
 *
 * 관리자가 여기 등록한 날은 학생이 학습계획(F-4.11-2)을 세울 수 없다.
 * 그 차단 스위치가 서버의 `planExcluded` 다.
 *
 * ⚠ **서버에 있는 것은 '휴일'뿐이다.** 목업이 다루는 다섯 유형(모의고사·휴원·특강·
 *   설명회·행사) 중 **휴원 계열만** 넣을 수 있다. 모의고사·특강·설명회는 둘 곳이 없어
 *   등록 폼에서 그 유형을 못 고른다 — 화면 구성은 그대로 두고 이유를 띄웠다(API_GAPS 16-1).
 *
 * ⚠ **하루짜리다.** 연휴는 날짜 수만큼 행이 생긴다. 목업의 기간 입력은 여러 건으로
 *   쪼개 보내는데, **N번 호출이라 중간에 실패하면 일부만 등록된다** — 건별 결과를 알린다.
 *
 * ⚠ **본사가 지점 휴일을 못 본다**(실측). 본사 계정으로는 전 지점 공통만 보이고
 *   `academyId` 파라미터도 무시된다 — 본사는 "분당이 7/15 쉰다"를 모른다(API_GAPS 16-3). */

const TYPE_TONE: Record<HolidayType, string> = {
  PUBLIC: 'brandnew',
  SUBSTITUTE: 'brandnew',
  TEMPORARY: 'supplement',
  ACADEMY: 'brandnew',
}

const TYPE_COLOR: Record<HolidayType, string> = {
  PUBLIC: 'var(--red)',
  SUBSTITUTE: 'var(--red)',
  TEMPORARY: 'var(--amber)',
  ACADEMY: 'var(--violet)',
}

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

const TODAY_YEAR = new Date().getFullYear()

/** 하루씩 늘려 날짜 배열을 만든다. 서버가 하루짜리만 받아서 기간 입력을 쪼개야 한다 */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  const end = new Date(`${to}T00:00:00Z`)
  for (const d = new Date(`${from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(toDateStr(d))
  }
  return out
}

function Content() {
  const { academyId, academies } = useAcademy()
  const [tab, setTab] = useState('list')
  const [year, setYear] = useState(TODAY_YEAR)
  const [rows, setRows] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  /* 등록 폼 */
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState<HolidayType>('PUBLIC')
  const [blockPlan, setBlockPlan] = useState(true)
  const [nationwide, setNationwide] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listHolidays(`${year}-01-01`, `${year}-12-31`))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '일정을 불러오지 못했습니다.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(h: Holiday) {
    if (!window.confirm(`${h.date} ${h.name} 을 지울까요?`)) return
    setBusy(true)
    try {
      await deleteHoliday(h.id)
      setResult(`${h.date} ${h.name} 을 지웠습니다.`)
      await load()
    } catch (err) {
      setResult(err instanceof ApiError ? `지우지 못했습니다 — ${err.message}` : '지우지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 차단 여부만 뒤집는다. PATCH 가 date·type 을 필수로 받아 기존 값을 함께 보낸다 */
  async function toggleBlock(h: Holiday) {
    setBusy(true)
    try {
      await updateHoliday(h.id, {
        academyId: h.academyId ?? undefined,
        date: h.date,
        name: h.name,
        type: h.type,
        planExcluded: !h.planExcluded,
      })
      await load()
      setResult(null)
    } catch (err) {
      setResult(err instanceof ApiError ? `바꾸지 못했습니다 — ${err.message}` : '바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 기간을 하루씩 쪼개 N번 보낸다.
   * ★ 중간에 실패하면 앞쪽 날짜만 등록된 채로 남는다 — 그걸 안 알려주면
   *   사용자는 전부 된 줄 알고 같은 기간을 다시 넣어 409 를 만난다.
   */
  async function submit() {
    if (name.trim() === '' || from === '') return
    const dates = datesBetween(from, to || from)
    if (dates.length === 0) {
      setResult('시작일이 종료일보다 뒤입니다.')
      return
    }
    setBusy(true)
    const ok: string[] = []
    const fail: string[] = []
    for (const date of dates) {
      try {
        await createHoliday({
          academyId: nationwide ? undefined : (academyId ?? undefined),
          date,
          name: name.trim(),
          type,
          planExcluded: blockPlan,
        })
        ok.push(date)
      } catch (err) {
        fail.push(`${date} (${err instanceof ApiError ? err.message : '실패'})`)
      }
    }
    setBusy(false)
    setResult(
      fail.length === 0
        ? `${ok.length}일을 등록했습니다.`
        : `${ok.length}일 등록 · ${fail.length}일 실패 — ${fail.join(', ')}`,
    )
    if (ok.length > 0) {
      setName('')
      await load()
    }
  }

  const COLUMNS: Column<Holiday>[] = useMemo(
    () => [
      { key: 'date', header: '기간', width: '120px', sortable: true, value: (r) => r.date },
      { key: 'name', header: '행사명', sortable: true, value: (r) => r.name },
      {
        key: 'type',
        header: '유형',
        width: '100px',
        align: 'center',
        sortable: true,
        value: (r) => HOLIDAY_TYPE_LABEL[r.type] ?? r.type,
        render: (r) => <span className={`mk ${TYPE_TONE[r.type] ?? 'supplement'}`}>{HOLIDAY_TYPE_LABEL[r.type] ?? r.type}</span>,
      },
      {
        key: 'target',
        header: '대상',
        width: '90px',
        align: 'center',
        // 서버는 지점 단위까지만 안다. 목업의 '전체/신청자/외부' 축은 없다
        value: (r) => (r.nationwide ? '전 지점' : '지점'),
        render: (r) => (
          <span style={{ fontSize: 11.5, color: r.nationwide ? 'var(--ink)' : 'var(--muted)' }}>
            {r.nationwide ? '전 지점' : '지점'}
          </span>
        ),
      },
      {
        key: 'blockPlan',
        header: '학습계획',
        width: '104px',
        align: 'center',
        sortable: true,
        value: (r) => (r.planExcluded ? '차단' : '영향 없음'),
        render: (r) =>
          r.planExcluded ? (
            <span className="mk brandnew" title="해당일 학습계획 입력 차단">
              <Icon name="lock" size={10} /> 차단
            </span>
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>영향 없음</span>
          ),
      },
      {
        key: 'note',
        header: '비고',
        value: () => '',
        render: () => <Unfilled reason="일정 비고가 응답에 없다" />,
      },
      {
        key: 'act',
        header: '',
        width: '150px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy}
              onClick={() => void toggleBlock(r)}
              title="학습계획 차단을 켜고 끕니다"
            >
              {r.planExcluded ? '차단 해제' : '차단'}
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
              disabled={busy}
              onClick={() => void remove(r)}
            >
              삭제
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy],
  )

  const byMonth = useMemo(() => {
    const m = new Map<number, Holiday[]>()
    for (let i = 1; i <= 12; i++) m.set(i, [])
    for (const e of rows) m.get(Number(e.date.slice(5, 7)))?.push(e)
    return m
  }, [rows])

  const blocking = rows.filter((e) => e.planExcluded).length

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="calendar-days" size={13} /> 등록 일정
          </div>
          <div className="v">{rows.length}</div>
          <div className="d">{year} 시즌</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="lock" size={13} /> 학습계획 차단
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {blocking}
          </div>
          <div className="d warn">해당일 학생 입력 불가</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="file-text" size={13} /> 모의고사
          </div>
          {/* 서버에 시험 일정 도메인이 없다 — 목업 칸은 두되 값은 비운다 */}
          <div className="v" style={{ fontSize: 14, paddingTop: 8 }}>
            <Unfilled reason="시험 일정이 서버에 없다" />
          </div>
          <div className="d">성적 리포트 연동</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="utensils" size={13} /> 휴원
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {rows.filter((e) => e.type === 'ACADEMY').length}
          </div>
          <div className="d">급식 가능일 제외</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="link" size={13} /> 참조 화면
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            3곳
          </div>
          <div className="d">학습계획·급식·성적</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '행사 목록', count: rows.length },
            { key: 'year', label: '연간 뷰' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {loadError && (
            <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              {loadError}
            </div>
          )}

          {tab === 'list' ? (
            <>
              <div className="note-box">
                <div className="ic">
                  <Icon name="lock" size={17} />
                </div>
                <div>
                  <div className="tt">여기에 등록한 날은 학생이 학습계획을 세울 수 없습니다</div>
                  <div className="tx">
                    <b>차단</b>으로 등록한 날은 학생 앱에서 계획을 세울 수 없고, 담임 화면(<b>주·일 학습계획</b>)에도
                    자물쇠로 표시되며 <b>미작성 집계에서 제외</b>됩니다. 차단하지 않으면 휴원일마다 전교생이
                    미작성자로 잡혀 경고가 무의미해집니다.
                    <br />
                    <b>차단은 입력 금지이지 삭제가 아닙니다.</b> 이미 계획을 쓴 날을 뒤늦게 차단으로 바꿨을 때 기존
                    계획을 어떻게 할지는 아직 정해지지 않았습니다.
                  </div>
                </div>
              </div>

              {/* 서버에는 휴일만 있다. 다른 유형을 등록하려다 안 되는 이유를 미리 알린다 */}
              <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
                <div className="ic">
                  <Icon name="triangle-alert" size={17} />
                </div>
                <div>
                  <div className="tt">지금 등록할 수 있는 것은 쉬는 날뿐입니다</div>
                  <div className="tx">
                    모의고사·특강·설명회 일정은 아직 저장할 곳이 없습니다. 공휴일·대체공휴일·임시휴일·학원 휴원만
                    등록됩니다. 연휴는 <b>하루씩 나눠 저장</b>되므로 목록에 날짜 수만큼 나옵니다.
                    {academies.length > 1 && (
                      <>
                        <br />
                        <b>전 지점 권한 계정에서는 지점이 등록한 휴원이 보이지 않습니다.</b>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {result && (
                <div className="note-box" role="status" style={{ borderColor: 'var(--violet)' }}>
                  {result}
                </div>
              )}

              <DataTable
                columns={COLUMNS}
                rows={rows}
                rowKey={(r) => String(r.id)}
                masked={false}
                loading={loading}
                pageSize={12}
                countLabel={
                  <>
                    {year} 등록 일정 <b>{rows.length}</b>건 · 차단 <b>{blocking}</b>건
                  </>
                }
                toolbar={
                  <>
                    <ExcelButton filename={`연간일정_${year}`} columns={COLUMNS} rows={rows} masked={false} />
                    <select className="sel" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }}>
                      {[TODAY_YEAR - 1, TODAY_YEAR, TODAY_YEAR + 1].map((y) => (
                        <option key={y} value={y}>
                          {y} 시즌
                        </option>
                      ))}
                    </select>
                    <button className="btn" disabled title="전년도 일정을 복사하는 경로가 서버에 없습니다">
                      <Icon name="history" size={14} /> 전년도 복사
                    </button>
                  </>
                }
              />

              <div className="card-sec" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="card-sec-h">
                  <div className="t">
                    <span className="ico">
                      <Icon name="plus" size={15} />
                    </span>
                    일정 등록
                  </div>
                </div>
                <div className="card-sec-b">
                  <div className="split">
                    <div>
                      <div className="frow">
                        <label className="req">행사명</label>
                        {/* ★ 50자를 넘기면 서버가 400 이 아니라 **500** 을 낸다(실호출로 51자부터 확인).
                               스펙에는 길이 제한이 없어 화면이 막지 않으면 붙여넣기로 그대로 들어간다.
                               서버 검증은 따로 요청해 뒀고, 그때까지 여기서 자른다. */}
                        <input
                          className="inp"
                          placeholder="어린이날"
                          value={name}
                          maxLength={50}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div className="frow">
                        <label className="req">기간</label>
                        <div className="two">
                          <input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                          <input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="frow">
                        <label className="req">유형 · 대상</label>
                        <div className="two">
                          <select className="sel" value={type} onChange={(e) => setType(e.target.value as HolidayType)}>
                            {(Object.keys(HOLIDAY_TYPE_LABEL) as HolidayType[]).map((t) => (
                              <option key={t} value={t}>
                                {HOLIDAY_TYPE_LABEL[t]}
                              </option>
                            ))}
                          </select>
                          {/* 전 지점 공통은 본사만 넣을 수 있다 — 지점 계정에는 선택지를 안 준다 */}
                          <select
                            className="sel"
                            value={nationwide ? 'all' : 'branch'}
                            disabled={academies.length <= 1}
                            onChange={(e) => setNationwide(e.target.value === 'all')}
                          >
                            <option value="branch">이 지점만</option>
                            <option value="all">전 지점 공통</option>
                          </select>
                        </div>
                      </div>
                      <div className="frow">
                        <label>학습계획</label>
                        <div style={{ paddingTop: 9 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                            <input type="checkbox" checked={blockPlan} onChange={(e) => setBlockPlan(e.target.checked)} />
                            해당일 학습계획 입력 차단
                          </label>
                        </div>
                      </div>
                      <div className="frow">
                        <label>&nbsp;</label>
                        <button
                          className="btn pri"
                          disabled={busy || name.trim() === '' || from === ''}
                          onClick={() => void submit()}
                        >
                          <Icon name="save" size={14} /> 등록
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
              {MONTHS.map((mo, i) => {
                const list = byMonth.get(i + 1) ?? []
                return (
                  <div
                    key={mo}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      minHeight: 120,
                      background: list.length ? '#fff' : '#fafbfc',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        marginBottom: 9,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {mo}
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginLeft: 'auto' }}>
                        {list.length}건
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {list.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>등록된 일정 없음</span>}
                      {list.map((e) => (
                        <div key={e.id} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                          <span
                            style={{
                              width: 4,
                              alignSelf: 'stretch',
                              borderRadius: 2,
                              background: TYPE_COLOR[e.type] ?? 'var(--line)',
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.35 }}>
                              {e.name}
                              {e.planExcluded && <Icon name="lock" size={10} />}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{e.date.slice(5)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export const annualEventsMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn" disabled title="준비 중입니다">
        <Icon name="history" size={14} /> 전년도 복사
      </button>
    </>
  ),
}
