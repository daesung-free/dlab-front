import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, MaskToggle, Modal, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { searchStudents, type Student } from '../../api/students'
import {
  DAY_LABEL,
  DAY_ORDER,
  deleteSchedule,
  listSchedules,
  replaceScheduleItems,
  runCompliance,
  submitSchedule,
  type DayOfWeek,
  type ScheduleItem,
  type ScheduleItemInput,
  type ScheduleMonth,
} from '../../api/schedules'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.11-8 정기일정 · 인정 판정 — /api/v1/admin/schedules
 *
 * ★ 학생이 앱에서 내는 **그 달의 반복 일정**이다(학원 밖 수업·병원 등). 그 시간에 자리를
 *   비워도 무단이 아니게 하는 근거가 된다. 담임이 대신 낼 수도 있고 그건 자동 승인이다.
 *
 * ★ **사유 신청과 다르다.** 사유 신청은 하루짜리 사후 신고, 이쪽은 미리 내는 요일 단위
 *   반복이다. 그래서 **지난 달은 등록이 거절된다**(실측 400 "지난 달 일정은 등록할 수
 *   없습니다") — 사후 인정 통로가 되면 사유 신청이 무의미해진다.
 *
 * ⚠️ **`approvalStatus` 로 승인 여부를 판단하지 않는다.** 관리자 등록분은 그 값이 `null`
 *   인데 `approved` 는 true 다(실측). `approvalStatus` 를 보면 담임이 낸 일정이 전부
 *   미승인으로 보인다. **`approved` 를 본다.**
 *
 * ★ 항목 수정은 **통째로 갈아끼운다.** 한 줄만 고치려고 그 줄만 보내면 나머지가 사라진다
 *   (실측: 2개짜리에 1개를 보냈더니 1개만 남았다). 화면은 늘 전량을 보낸다.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `yyyy-MM`. 지난 달은 서버가 막으므로 이번 달부터만 고르게 한다 */
function monthStr(offset = 0): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `HH:mm:ss` 로 오기도 한다. 초는 일정에 뜻이 없다 */
function hhmm(t: string): string {
  return t.slice(0, 5)
}

function itemText(it: ScheduleItem): string {
  return `${DAY_LABEL[it.dayOfWeek] ?? it.dayOfWeek} ${hhmm(it.startTime)}~${hhmm(it.endTime)} ${it.title}${
    it.place ? ` (${it.place})` : ''
  }`
}

/** 편집 중인 항목. 시각을 문자열로 들고 있어야 지우는 중간 상태가 표현된다 */
interface ItemDraft {
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  title: string
  place: string
}

const EMPTY_ITEM: ItemDraft = {
  dayOfWeek: 'MONDAY',
  startTime: '18:00',
  endTime: '20:00',
  title: '',
  place: '',
}

function Content() {
  const { academyId, ready: academyReady } = useAcademy()
  const [month, setMonth] = useState(() => monthStr(0))
  const [rows, setRows] = useState<ScheduleMonth[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [masked, setMasked] = useState(true)

  /** 등록·수정 공용. `scheduleId` 가 있으면 항목 교체, 없으면 새로 등록 */
  const [edit, setEdit] = useState<{
    scheduleId: number | null
    enrollmentId: string
    items: ItemDraft[]
  } | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ScheduleMonth | null>(null)
  const [judging, setJudging] = useState<{ row: ScheduleMonth; date: string } | null>(null)

  const load = useCallback(async () => {
    if (academyId === null) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const [r, s] = await Promise.allSettled([
      listSchedules({ academyId, month }),
      searchStudents({ status: 'ENROLLED', size: 2000, academyId }),
    ])
    setRows(r.status === 'fulfilled' ? r.value : [])
    setStudents(s.status === 'fulfilled' ? s.value.rows : [])
    const failed = [r, s].find((x) => x.status === 'rejected')
    if (failed && failed.status === 'rejected') {
      const e = failed.reason
      setError(e instanceof ApiError ? e.message : '정기일정을 불러오지 못했습니다.')
    }
    setLoading(false)
  }, [academyId, month])

  useEffect(() => {
    void load()
  }, [load])

  async function submitEdit() {
    if (!edit) return
    setBusy(true)
    setEditErr(null)
    try {
      const items: ScheduleItemInput[] = edit.items
        .filter((i) => i.title.trim() !== '')
        .map((i) => ({
          dayOfWeek: i.dayOfWeek,
          startTime: i.startTime,
          endTime: i.endTime,
          title: i.title.trim(),
          place: i.place.trim() || undefined,
        }))
      if (items.length === 0) throw new Error('일정을 한 줄 이상 적어 주세요.')
      if (edit.scheduleId === null) {
        if (edit.enrollmentId === '') throw new Error('학생을 고르세요.')
        await submitSchedule(Number(edit.enrollmentId), { month, items })
        setDone('정기일정을 등록했습니다. 담임이 대신 낸 일정은 바로 인정됩니다.')
      } else {
        /* ★ 전량을 보낸다. 통째로 갈아끼우는 API 라 일부만 보내면 나머지가 사라진다 */
        await replaceScheduleItems(edit.scheduleId, items)
        setDone('일정을 고쳤습니다.')
      }
      setEdit(null)
      await load()
    } catch (err) {
      setEditErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function runRemove() {
    if (!removing) return
    setBusy(true)
    setError(null)
    try {
      await deleteSchedule(removing.scheduleId)
      setRemoving(null)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '지우지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function submitJudge() {
    if (!judging) return
    setBusy(true)
    setError(null)
    try {
      await runCompliance(judging.row.enrollmentId, judging.date)
      setDone(
        `${judging.row.studentName} · ${judging.date} 판정을 돌렸습니다. ` +
          '상벌점에 「정기 일정」 규칙이 꺼져 있으면 점수는 붙지 않습니다.',
      )
      setJudging(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '판정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<ScheduleMonth>[] = useMemo(
    () => [
      { key: 'studentNo', header: '학번', width: '104px', value: (r) => r.studentNo ?? '-' },
      { key: 'studentName', header: '이름', width: '90px', mask: 'name', value: (r) => r.studentName },
      {
        key: 'source',
        header: '낸 사람',
        width: '84px',
        align: 'center',
        value: (r) => (r.source === 'ADMIN' ? '담임' : '학생'),
        render: (r, shown) => <span className={`mk ${r.source === 'ADMIN' ? 'supplement' : ''}`}>{shown}</span>,
      },
      {
        key: 'approved',
        header: '인정',
        width: '80px',
        align: 'center',
        /* ★ approvalStatus 가 아니라 approved 다. 관리자 등록분은 앞엣것이 null 이다 */
        value: (r) => (r.approved ? '인정' : '대기'),
        render: (r, shown) => <span className={`mk ${r.approved ? 'verified' : 'brandnew'}`}>{shown}</span>,
      },
      {
        key: 'items',
        header: '일정',
        value: (r) => r.items.map(itemText).join(' / '),
        render: (r) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[...r.items]
              .sort(
                (a, b) =>
                  DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) ||
                  a.startTime.localeCompare(b.startTime),
              )
              .map((it) => (
                <span key={it.id} style={{ fontSize: 12.5 }}>
                  {itemText(it)}
                </span>
              ))}
          </div>
        ),
      },
      {
        key: 'act',
        header: '',
        width: '196px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy}
              onClick={() => setJudging({ row: r, date: todayStr() })}
            >
              판정
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy}
              onClick={() => {
                setEditErr(null)
                setEdit({
                  scheduleId: r.scheduleId,
                  enrollmentId: String(r.enrollmentId),
                  /* 통째 교체라 현재 항목을 전부 싣고 시작한다 */
                  items: r.items.map((i) => ({
                    dayOfWeek: i.dayOfWeek,
                    startTime: hhmm(i.startTime),
                    endTime: hhmm(i.endTime),
                    title: i.title,
                    place: i.place ?? '',
                  })),
                })
              }}
            >
              수정
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
              disabled={busy}
              onClick={() => setRemoving(r)}
            >
              삭제
            </button>
          </div>
        ),
      },
    ],
    [busy],
  )

  return (
    <>
      <div className="note-box">
        <div className="ic">
          <Icon name="calendar-clock" size={17} />
        </div>
        <div>
          <div className="tt">그 달에 되풀이되는 일정을 미리 받아 둡니다</div>
          <div className="tx">
            학원 밖 수업이나 병원처럼 <b>매주 같은 요일에 자리를 비우는 일정</b>입니다. 미리 내 두면
            그 시간에 없어도 무단이 아닙니다. 하루짜리 사후 신고는 <b>사유 신청</b>에서 합니다.
          </div>
        </div>
      </div>

      {academyId === null && academyReady && (
        <div className="note-box">지점을 먼저 선택하세요. 정기일정은 지점 단위로 조회합니다.</div>
      )}

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {done && (
        <div className="note-box" style={{ borderColor: 'var(--mint)' }}>
          <div className="ic">
            <Icon name="check" size={17} />
          </div>
          <div style={{ flex: 1 }}>{done}</div>
          <button className="btn" onClick={() => setDone(null)}>
            닫기
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.scheduleId)}
        masked={masked}
        loading={loading}
        pageSize={15}
        countLabel={
          <>
            {month} · <b>{rows.length}</b>명
          </>
        }
        toolbar={
          <>
            <input
              className="inp"
              type="month"
              style={{ width: 'auto' }}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <button
              className="btn pri"
              disabled={academyId === null}
              title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
              onClick={() => {
                setEditErr(null)
                setEdit({ scheduleId: null, enrollmentId: '', items: [{ ...EMPTY_ITEM }] })
              }}
            >
              <Icon name="plus" size={14} /> 담임 대신 등록
            </button>
            <MaskToggle masked={masked} onChange={setMasked} />
          </>
        }
        emptyText="이 달에 낸 정기일정이 없습니다."
      />

      {/* ── 등록 · 수정 ── */}
      {edit && (
        <Modal
          title={edit.scheduleId === null ? '담임 대신 등록' : '정기일정 수정'}
          sub={
            edit.scheduleId === null
              ? `${month} 일정으로 등록합니다. 담임이 낸 일정은 바로 인정됩니다.`
              : '적어 둔 줄 전체가 그대로 저장됩니다.'
          }
          wide
          busy={busy}
          error={editErr}
          onConfirm={() => void submitEdit()}
          onClose={() => setEdit(null)}
        >
          {edit.scheduleId === null && (
            <div className="frow">
              <label className="req">학생</label>
              <select
                className="sel"
                value={edit.enrollmentId}
                onChange={(e) => setEdit({ ...edit, enrollmentId: e.target.value })}
              >
                <option value="">선택하세요</option>
                {students.map((s) => (
                  <option key={s.enrollmentId} value={String(s.enrollmentId)}>
                    {s.studentNo ?? '-'} · {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ★ 통째 교체라 화면에 보이는 줄이 곧 저장될 전부다. 그 사실을 적어 둔다 —
                 한 줄만 고치는 줄 알고 나머지를 지우면 조용히 사라진다 */}
          {edit.scheduleId !== null && (
            <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
              <div className="ic">
                <Icon name="triangle-alert" size={17} />
              </div>
              <div>
                <div className="tt">여기 보이는 줄이 그대로 저장됩니다</div>
                <div className="tx">줄을 지우면 그 일정도 함께 없어집니다.</div>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead>
                <tr>
                  {/* ★ 칸을 좁게 주면 조용히 망가진다 — 52px 짜리 '빼기' 는 두 글자가 세로로
                         눌렸고, 70px 짜리 요일은 `.sel` 의 좌우 여백(우측 30px)에 먹혀
                         **글자가 아예 안 보였다.** 컨트롤이 들어갈 만큼 준다 */}
                  <th style={{ width: 96 }}>요일</th>
                  <th style={{ width: 118 }}>시작</th>
                  <th style={{ width: 118 }}>종료</th>
                  <th>내용</th>
                  <th style={{ width: 110 }}>장소</th>
                  <th style={{ width: 66 }} />
                </tr>
              </thead>
              <tbody>
                {edit.items.map((it, idx) => {
                  const set = (patch: Partial<ItemDraft>) =>
                    setEdit({
                      ...edit,
                      items: edit.items.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
                    })
                  return (
                    <tr key={idx}>
                      <td>
                        <select
                          className="sel"
                          value={it.dayOfWeek}
                          onChange={(e) => set({ dayOfWeek: e.target.value as DayOfWeek })}
                        >
                          {DAY_ORDER.map((d) => (
                            <option key={d} value={d}>
                              {DAY_LABEL[d]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="inp"
                          type="time"
                          value={it.startTime}
                          onChange={(e) => set({ startTime: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="inp"
                          type="time"
                          value={it.endTime}
                          onChange={(e) => set({ endTime: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="inp"
                          placeholder="예: 영어 학원"
                          value={it.title}
                          onChange={(e) => set({ title: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="inp"
                          placeholder="선택"
                          value={it.place}
                          onChange={(e) => set({ place: e.target.value })}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: 11.5, color: 'var(--red)', whiteSpace: 'nowrap' }}
                          onClick={() => setEdit({ ...edit, items: edit.items.filter((_, i) => i !== idx) })}
                        >
                          빼기
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              className="btn"
              onClick={() => setEdit({ ...edit, items: [...edit.items, { ...EMPTY_ITEM }] })}
            >
              <Icon name="plus" size={14} /> 줄 추가
            </button>
          </div>
        </Modal>
      )}

      {/* ── 삭제 ── */}
      {removing && (
        <Modal
          title="정기일정 삭제"
          sub={`${removing.studentName}(${removing.studentNo ?? '-'}) · ${removing.year}년 ${removing.month}월`}
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={() => void runRemove()}
          onClose={() => setRemoving(null)}
        >
          <div className="note-box risk">
            <div className="ic">
              <Icon name="alert-triangle" size={17} />
            </div>
            <div>
              <div className="tt">그 시간에 자리를 비우면 무단이 됩니다</div>
              <div className="tx">
                이 학생의 {removing.month}월 일정 <b>{removing.items.length}줄</b>이 사라집니다. 이미 내려진
                판정은 그대로 남습니다.
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 인정 판정 ── */}
      {judging && (
        <Modal
          title="인정 판정"
          sub={`${judging.row.studentName}(${judging.row.studentNo ?? '-'})`}
          confirmLabel="판정 실행"
          busy={busy}
          onConfirm={() => void submitJudge()}
          onClose={() => setJudging(null)}
        >
          <div className="frow">
            <label className="req">판정할 날짜</label>
            <div>
              <input
                className="inp"
                type="date"
                value={judging.date}
                onChange={(e) => setJudging({ ...judging, date: e.target.value })}
              />
              <div className="hint">그날 일정을 지켰는지 보고, 안 지켰으면 벌점을 줍니다.</div>
            </div>
          </div>
          {/* ★ 규칙이 꺼져 있으면 아무 일도 안 일어난다. 안 적으면 "눌러도 반응이 없다"가 된다 */}
          <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
            <div className="ic">
              <Icon name="triangle-alert" size={17} />
            </div>
            <div>
              <div className="tt">상벌점 규칙이 켜져 있어야 점수가 붙습니다</div>
              <div className="tx">
                상벌점 관리의 <b>자동 부여 규칙</b>에서 「정기 일정 · 미인정」이 꺼져 있으면 판정만 돌고
                점수는 붙지 않습니다. 여러 번 눌러도 중복으로 붙지는 않습니다.
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export const regularScheduleMockup: Mockup = { Content }
