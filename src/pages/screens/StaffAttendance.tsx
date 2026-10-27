import { useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  Modal,
  SearchForm,
  useServerData,
  addDaysStr,
  todayStr,
  type Column,
  type Field,
  type SearchValues,
} from '../../components/common'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  EVENT_LABEL,
  editAttendanceRecord,
  listRecordEdits,
  listStaffAttendance,
  type StaffAttendanceEdit,
  type StaffAttendanceRecord as Row,
} from '../../api/staffAttendance'
import type { Mockup } from './types'

/* 직원 출근 기록 · 수정 이력 (추가개발 12번)
 *
 * 연동(2026-10-12) — GET /api/v1/admin/staff-attendance/records. src/api/staffAttendance.ts 참고.
 *
 * ★ **고칠 수 있는지는 서버가 알려준다**(`canEdit`). 화면이 권한 코드를 들고 판단하지
 *   않는다 — 조건이 늘어도(권한 + 지점 범위 등) 화면이 안 깨진다.
 *   권한이 없으면 **목록은 보이고 수정만 막힌다** — 기록을 보는 것은 업무이고
 *   고치는 것은 승인받은 사람이 하는 일이다.
 *
 * ★ **이유를 반드시 받는다**(서버도 공백만 보내면 400). 요구사항 2-4 가 「누가·언제·무엇을·왜」인데,
 *   '왜' 가 빠지면 나머지 셋이 쓸모없어진다 — 고친 값은 원본보다 신뢰도가 낮은데
 *   그 사실이 안 남기 때문이다.
 *
 * ★ **날짜를 고정하고 시각만 받는다.** 서버도 근무일을 넘기는 수정은 400 인데, 그 이유가
 *   07:05 검사가 **근무일로 세기 때문**이다 — 시각만 다른 날로 옮기면 그 행이 어느 날에도
 *   안 잡힌다. 화면에서 날짜 입력을 주면 그걸 시도하게 된다.
 *
 * ★ 07:05 출근 확인이 이 기록을 본다. 태깅이 빠진 날을 못 고치면 다음 날 아침에도
 *   문자가 나간다 — 두 화면이 한 데이터를 본다는 것을 안내 문구로 밝힌다.
 */

/** 'yyyy-MM-ddTHH:mm:ss' — 서버가 지역 시각으로 읽는다. Z 를 붙이면 9시간 밀린다 */
function localStamp(workDate: string, hhmm: string): string {
  return `${workDate}T${hhmm}:00`
}

function timeOf(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

/* 다른 목록 화면과 같은 검색 틀을 쓴다 — 날짜 입력을 맨몸으로 두면 그 화면만 떠 보인다 */
const FIELDS: Field[] = [{ type: 'dateRange', name: 'date', label: '조회 기간', presets: true, span: 2 }]

const DEFAULT_RANGE: SearchValues = { date: { from: addDaysStr(todayStr(), -7), to: todayStr() } }

function Content() {
  const { academyId } = useAcademy()
  const [query, setQuery] = useState<SearchValues>(DEFAULT_RANGE)

  /* ★ `to` 가 비면 400 이다 — 검색 틀이 한쪽만 채운 채로 넘겨줄 수 있어 양쪽에 기본값을 둔다 */
  const params = useMemo(() => {
    const d = query.date as { from?: string; to?: string } | undefined
    return { from: d?.from || addDaysStr(todayStr(), -7), to: d?.to || todayStr(), academyId }
  }, [query, academyId])
  const data = useServerData({
    fetcher: listStaffAttendance,
    params,
    /* ★ 지점을 안 보내면 400 「지점을 지정해야 합니다」다. 전 지점 권한 계정의 기본값이
          미선택이라, 막지 않으면 들어오자마자 빨간 오류가 뜬다 */
    enabled: academyId !== null,
    errorMessage: '출근 기록을 불러오지 못했습니다.',
  })

  const rows = data.data?.records ?? []
  const canEdit = data.data?.canEdit ?? false

  const [edit, setEdit] = useState<Row | null>(null)
  const [historyOf, setHistoryOf] = useState<Row | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const cols: Column<Row>[] = useMemo(
    () => [
      { key: 'workDate', header: '근무일', width: '120px', sortable: true, value: (r) => r.workDate ?? '-' },
      /* ★ 마스킹하지 않는다. DataTable 은 `masked` 가 **기본 true** 라 mask 를 달면 늘 가려지는데,
            직원 이름은 학생 개인정보가 아니고 이 화면은 누구 기록을 고치는지 알아야 한다 */
      { key: 'staffName', header: '직원', width: '120px', value: (r) => r.staffName ?? '-' },
      {
        key: 'eventType',
        header: '구분',
        width: '80px',
        align: 'center',
        value: (r) => EVENT_LABEL[r.eventType] ?? r.eventType,
      },
      { key: 'recordedAt', header: '기록 시각', width: '110px', value: (r) => timeOf(r.recordedAt) },
      {
        key: 'edited',
        header: '수정 이력',
        width: '150px',
        value: (r) => (r.edited ? '있음' : '-'),
        /* ★ 「고쳐졌다」만 알려주고 끝내지 않는다 — 무엇이 어떻게 바뀌었는지 못 보면
              그 기록을 믿을지 말지 판단할 수 없다 */
        render: (r) =>
          r.edited ? (
            <button className="btn" onClick={() => setHistoryOf(r)}>
              이력 보기
            </button>
          ) : (
            '-'
          ),
      },
      {
        key: 'act',
        header: '',
        width: '90px',
        align: 'center',
        value: () => '',
        /* ★ 권한이 없으면 아예 버튼을 주지 않는다. 눌러서 403 을 받는 칸을 두지 않는다 */
        render: (r) =>
          canEdit ? (
            <button className="btn" onClick={() => setEdit(r)}>
              수정
            </button>
          ) : (
            '-'
          ),
      },
    ],
    [canEdit],
  )

  return (
    <>
      <div className="note-box">
        <div>
          키오스크로 찍힌 직원 출근·퇴근 기록입니다. 태깅이 빠진 날을 고치면{' '}
          <b>아침 7시 5분 확인</b>에도 반영됩니다. 고친 기록은 누가 언제 고쳤는지 함께 남습니다.
        </div>
      </div>

      {done && (
        <div className="note-box" role="status">
          <div>{done}</div>
        </div>
      )}

      {!canEdit && (
        <div className="note-box">
          <div>이 계정은 기록을 볼 수만 있습니다. 고치려면 담당자에게 권한을 요청합니다.</div>
        </div>
      )}

      <SearchForm fields={FIELDS} initial={DEFAULT_RANGE} onSearch={setQuery} />

      {data.error && (
        <div className="note-box" style={{ borderColor: 'var(--rose)' }} role="status">
          <div>{data.error}</div>
        </div>
      )}

      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(r) => String(r.id)}
        loading={data.loading}
        pageSize={20}
        emptyText="그 기간에 기록이 없습니다."
      />

      {edit && (
        <EditModal
          row={edit}
          onClose={() => setEdit(null)}
          onSaved={(msg) => {
            setEdit(null)
            setDone(msg)
            data.reload()
          }}
        />
      )}

      {historyOf && <HistoryModal row={historyOf} onClose={() => setHistoryOf(null)} />}
    </>
  )
}

/** 시각만 고친다. 날짜·직원은 고정이고, 이유 없이는 저장되지 않는다 */
function EditModal({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: (msg: string) => void }) {
  const [time, setTime] = useState(() => timeOf(row.recordedAt))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setErr('시각을 다시 확인합니다.')
      return
    }
    if (!reason.trim()) {
      setErr('수정 이유를 입력해 주세요. 이유가 없으면 나중에 그 기록을 근거로 쓸 수 없습니다.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await editAttendanceRecord(row.id, {
        eventType: row.eventType,
        recordedAt: localStamp(row.workDate ?? '', time),
        reason: reason.trim(),
      })
      onSaved(`${row.staffName ?? '직원'} 님의 ${EVENT_LABEL[row.eventType] ?? row.eventType} 시각을 ${time} 으로 수정했습니다.`)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '수정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="출근 기록 수정"
      sub={`${row.workDate ?? ''} · ${row.staffName ?? ''} · ${EVENT_LABEL[row.eventType] ?? row.eventType}`}
      confirmLabel="저장"
      busy={busy}
      error={err}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <div className="note-box">
        <div>
          수정 내용은 <b>변경 전·후 값과 이유가 함께</b> 남습니다. 날짜는 바꿀 수 없습니다 — 다른 날로 옮기면
          그 기록이 <b>어느 날에도 잡히지 않습니다.</b>
        </div>
      </div>
      <div className="frow">
        <label>기록 시각</label>
        <div>
          <input className="inp" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <div className="hint">현재 {timeOf(row.recordedAt)} 입니다.</div>
        </div>
      </div>
      <div className="frow">
        <label>수정 이유</label>
        <div>
          <input
            className="inp"
            placeholder="예: 지문 인식이 늦어 실제보다 늦게 찍혔습니다. CCTV 확인 후 보정"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="hint">반드시 적어야 저장됩니다.</div>
        </div>
      </div>
    </Modal>
  )
}

/** 전후 값을 나란히 보여준다 — 뒤값만 남기면 무엇이 바뀌었는지 알 수 없다 */
function HistoryModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const [edits, setEdits] = useState<StaffAttendanceEdit[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listRecordEdits(row.id)
      .then((e) => alive && setEdits(e))
      .catch((e) => alive && setErr(e instanceof ApiError ? e.message : '이력을 불러오지 못했습니다.'))
    return () => {
      alive = false
    }
  }, [row.id])

  return (
    <Modal
      title="수정 이력"
      sub={`${row.workDate ?? ''} · ${row.staffName ?? ''}`}
      confirmLabel="닫기"
      /* ★ 읽기만 하는 모달이라 '취소'를 감춘다 — '취소'와 '닫기'가 나란히 있으면
            둘이 다른 일을 하는 것처럼 보인다 */
      hideCancel
      onConfirm={onClose}
      onClose={onClose}
    >
      {err && <div className="hint">{err}</div>}
      {edits === null && !err && <div className="hint">불러오는 중…</div>}
      {edits?.length === 0 && <div className="hint">수정된 적이 없습니다.</div>}
      {(edits ?? []).map((e) => (
        /* ★ 한 덩어리로 쏟지 않는다 — 무엇이·왜·언제가 라벨 없이 이어지면
              어디까지가 이유인지 읽히지 않는다. 다른 모달과 같은 .frow 2열로 둔다 */
        <div key={e.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
          <div className="frow ro">
            <label>수정 내용</label>
            <div>
              {timeOf(e.beforeRecordedAt)} <span style={{ color: 'var(--muted)' }}>→</span>{' '}
              <b>{timeOf(e.afterRecordedAt)}</b>
            </div>
          </div>
          {e.beforeEventType !== e.afterEventType && (
            <div className="frow">
              <label>구분</label>
              <div>
                {EVENT_LABEL[e.beforeEventType] ?? e.beforeEventType}{' '}
                <span style={{ color: 'var(--muted)' }}>→</span>{' '}
                <b>{EVENT_LABEL[e.afterEventType] ?? e.afterEventType}</b>
              </div>
            </div>
          )}
          <div className="frow ro">
            <label>수정 이유</label>
            <div>{e.reason ?? '-'}</div>
          </div>
          <div className="frow ro">
            <label>수정자</label>
            {/* ★ 비면 사람이 한 것이 아니다(배치는 계정 0) — 빈칸으로 두면 누락처럼 보인다 */}
            <div>{e.editedByName?.trim() || '시스템'}</div>
          </div>
          <div className="frow ro">
            <label>수정일</label>
            <div>{e.editedAt ? e.editedAt.slice(0, 16).replace('T', ' ') : '-'}</div>
          </div>
        </div>
      ))}
    </Modal>
  )
}

export const staffAttendanceMockup: Mockup = { Content }
