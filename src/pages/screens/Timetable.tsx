import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, Modal, PrintButton, type Column, MockNotice } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { useAuth } from '../../auth/AuthContext'
import { listClasses, type ClassGroup } from '../../api/classes'
import { listPeriods, type Period as MasterPeriod } from '../../api/schoolMasters'
import { listRooms, type Room } from '../../api/masters'
import { listTeachers, type TeacherRow } from '../../api/accounts'
import {
  DAYS as SRV_DAYS,
  DAY_LABEL,
  copyTimetableYear,
  getClassTimetable,
  listTimetables,
  saveClassTimetable,
  type DayOfWeek,
  type TimetableCell as SrvCell,
  type TimetableCellSave,
} from '../../api/timetables'
import { createScreenSignal } from './screenSignal'
import type { Mockup } from './types'
import './timetable.css'

/* 학원생 관리 > 교무업무 > 시간표 · 이동수업 — /api/v1/admin/timetables
 *
 * 고정반 관리(F-4.1-4)가 「학생이 어느 반인가」를 정한다면, 이 화면은 **「그 반이 언제
 * 어디서 무슨 수업을 하는가」**다.
 *
 * ★ **강의실이 두 군데다.** 칸에 지정한 강의실이 비면 **반 홈룸**으로 떨어지는데, 그 판정을
 *   **서버가 `effectiveRoomNo` 로 내려준다.** 화면이 다시 계산하면 화면마다 다르게 떨어진다.
 *   그래서 격자에는 `effectiveRoomNo` 를 그리고, **이동수업 표시는 `roomNo` 가 있는 칸**이다.
 *
 * ★ **저장은 격자 전체를 보낸다.** 서버가 보낸 칸만 손대고 **내용이 빈 칸은 「지움」**으로
 *   읽는다 — 칸을 눌러 지우는 식으로 쓰므로 삭제를 따로 두면 저장 한 번이 하나의
 *   트랜잭션이 되지 못한다. **빈 목록은 서버가 거절**하므로 호출부가 먼저 막는다.
 *
 * ★ **같은 시간 같은 강의실은 서버가 거절한다.** 화면에서 먼저 보여주되(저장 전 경고),
 *   **막는 것은 서버다** — 두 사람이 동시에 저장하면 화면 검사는 뚫린다.
 *
 * ★ 헤더 버튼(저장·전년도 복사)은 **본문과 부모가 달라** props 로 상태를 못 내린다.
 *   화면당 하나씩 만든 신호로 잇는다.
 *
 * ⚠️ **이동수업 편성 탭은 아직 목업이다.** 서버에 칸별 강의실(`roomId`)은 있지만
 *   **학생이 어느 수준별 반으로 가는가**를 담을 곳이 없다. 격자와 섞지 않는다.
 */

/* ★ 신호는 **화면당 하나씩**이고 값을 못 싣는다(버전만 올린다) — 그래서 **동작마다 하나씩** 만든다 */
const saveSignal = createScreenSignal()
const copySignal = createScreenSignal()

/** 이동수업 과목 축. 화면의 과목 필터가 이것으로 돈다 */
const MOVE_SUBJECTS = ['수학', '영어', '탐구'] as const
/* ★ 예시 편성을 지우면서 `DAYS`·`ROOMS`·`TEACHERS`·`CLASS_INFO` 도 같이 지웠다 —
     **목업을 만들기 위한 값**이었고 서버 값으로 도는 「반 시간표」 탭은 쓰지 않는다 */

/* ── 이동수업 배정 명단 ── */

interface MoveRow {
  id: string
  studentNo: string
  name: string
  fixedClass: string
  /** 고정반 담임 — 이동수업 중 사고·결석 시 1차 연락 대상 */
  homeroom: string
  subject: string
  level: string
  moveClass: string
  room: string
  slot: string
  teacher: string
}

/* ★★ **예시 이동수업 배정을 지웠다**(2026-10-26).
 *
 *   재원생 × 과목으로 **수백 행**을 만들어 학번·이름·담임·수준반·강의실·교시·담당 교사를
 *   전부 지어내고 있었다. 위에 「준비 중」 상자가 있어도 **그 아래가 수백 행이면 안내가
 *   묻힌다**(CLAUDE.md 5-1). 엑셀 버튼에도 그 행이 물려 있어서 **받으면 실제 편성표로
 *   읽힌다** — 결제 관리에서 똑같이 걷어냈다.
 *
 *   ⚠️ 학생이 어느 수준별 반으로 가는지를 담을 곳이 서버에 없다. 칸별 강의실은
 *     「반 시간표」 탭에서 실제로 저장된다 — 이 탭만 비어 있는 것이다.
 *     컬럼·과목 필터는 **지우지 않고 둔다**(CLAUDE.md 1).
 */
const MOVE_ROWS: MoveRow[] = []

const MOVE_COLUMNS: Column<MoveRow>[] = [
  { key: 'studentNo', header: '학번', width: '104px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '82px', mask: 'name', value: (r) => r.name },
  { key: 'fixedClass', header: '고정반', width: '76px', align: 'center', sortable: true, value: (r) => r.fixedClass },
  { key: 'homeroom', header: '담임', width: '76px', align: 'center', sortable: true, value: (r) => r.homeroom },
  { key: 'subject', header: '과목', width: '80px', align: 'center', sortable: true, value: (r) => r.subject },
  {
    key: 'level',
    header: '수준',
    width: '64px',
    align: 'center',
    sortable: true,
    value: (r) => r.level,
    render: (r) => (
      <span className={`mk ${r.level === '상' ? 'verified' : r.level === '중' ? 'supplement' : 'brandnew'}`}>
        {r.level}
      </span>
    ),
  },
  {
    key: 'moveClass',
    header: '이동반',
    width: '112px',
    sortable: true,
    value: (r) => r.moveClass,
    render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--violet)', fontWeight: 700 }}>
        <Icon name="arrow-right" size={12} />
        {r.moveClass}
      </span>
    ),
  },
  { key: 'room', header: '강의실', width: '86px', align: 'center', value: (r) => r.room },
  { key: 'slot', header: '시간', width: '104px', align: 'center', sortable: true, value: (r) => r.slot },
  { key: 'teacher', header: '담당', width: '82px', value: (r) => r.teacher },
]


/** 격자 한 칸의 편집 상태. 서버에 보낼 모양 그대로 들고 있는다 */
interface Draft {
  subject: string
  teacherId: string
  roomId: string
}

const EMPTY: Draft = { subject: '', teacherId: '', roomId: '' }

/* ★ **교시 마스터가 요일 종류별로 따로 있다**(평일 12 · 토 11 · 일 11). 한 격자에 섞어
   보내면 서버가 거절한다 — `TIMETABLE_PERIOD_DAY_MISMATCH`. 겉으로는 「저장이 안 된다」로만
   보여서, 요일마다 그 종류의 교시를 쓴다. */
const DAY_TYPE_OF: Record<DayOfWeek, 'WEEKDAY' | 'SATURDAY' | 'SUNDAY'> = {
  MONDAY: 'WEEKDAY',
  TUESDAY: 'WEEKDAY',
  WEDNESDAY: 'WEEKDAY',
  THURSDAY: 'WEEKDAY',
  FRIDAY: 'WEEKDAY',
  SATURDAY: 'SATURDAY',
}

const WEEKDAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

/** 칸 키 — 요일+교시로 잡는다. 교시는 **마스터 id** 다(번호가 아니다) */
const keyOf = (day: DayOfWeek, periodId: number) => `${day}:${periodId}`

function Content() {
  const { academyId } = useAcademy()
  /* ★ 담임은 **보기만** 한다 — 칸을 눌러도 편집 모달을 열지 않는다. 열어 두면
     수정해 놓고 저장이 안 되는(버튼이 없는) 막다른 길이 된다 */
  const { teacherOnly, readOnly } = useAuth()
  const canEdit = !teacherOnly && !readOnly
  const year = new Date().getFullYear()
  const [tab, setTab] = useState('grid')
  const [sel, setSel] = useState<string[]>([])
  const [subject, setSubject] = useState('전체')

  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [classId, setClassId] = useState<number | null>(null)
  const [periods, setPeriods] = useState<MasterPeriod[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [teachers, setTeachers] = useState<TeacherRow[]>([])

  const [cells, setCells] = useState<SrvCell[]>([])
  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  /** 칸 편집 모달 */
  const [editing, setEditing] = useState<{ day: DayOfWeek; period: MasterPeriod; form: Draft } | null>(null)
  /** 전년도 복사 */
  const [copying, setCopying] = useState<{ busy: boolean; err: string | null; result: string[] | null } | null>(null)

  /** 전 지점 조회 — 강의실 사용 현황 탭 */
  const [all, setAll] = useState<SrvCell[] | null>(null)

  useEffect(() => {
    if (academyId === null) {
      setClasses([])
      setClassId(null)
      return
    }
    let alive = true
    void Promise.all([
      listClasses(year, academyId).catch(() => [] as ClassGroup[]),
      listPeriods({ year, academyId }).catch(() => [] as MasterPeriod[]),
      listRooms(academyId, true).catch(() => [] as Room[]),
      listTeachers(academyId).catch(() => [] as TeacherRow[]),
    ]).then(([cs, ps, rs, ts]) => {
      if (!alive) return
      const mine = cs.filter((c) => c.academyId === academyId)
      setClasses(mine)
      setClassId((prev) => (prev !== null && mine.some((c) => c.id === prev) ? prev : (mine[0]?.id ?? null)))
      /* ★ 식사·자습 교시도 격자에 둔다 — 빼면 시간 축이 어긋나 「3교시 다음이 5교시」가 된다 */
      setPeriods([...ps].sort((a, b) => a.periodNo - b.periodNo))
      setRooms(rs)
      setTeachers(ts)
    })
    return () => {
      alive = false
    }
  }, [academyId, year])

  const load = useCallback(async () => {
    if (classId === null) {
      setCells([])
      setDraft({})
      return
    }
    setLoading(true)
    setError(null)
    try {
      const rows = await getClassTimetable(classId)
      setCells(rows)
      const d: Record<string, Draft> = {}
      for (const r of rows) {
        d[keyOf(r.dayOfWeek, r.periodId)] = {
          subject: r.subject ?? '',
          teacherId: r.teacherId == null ? '' : String(r.teacherId),
          roomId: r.roomId == null ? '' : String(r.roomId),
        }
      }
      setDraft(d)
      setDirty(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '시간표를 불러오지 못했습니다.')
      setCells([])
      setDraft({})
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void load()
  }, [load])

  /* 강의실 사용 현황 — 지점 전체를 한 번 읽는다 */
  useEffect(() => {
    if (tab !== 'room' || academyId === null) return
    let alive = true
    listTimetables({ academyId, year })
      .then((v) => alive && setAll(v))
      .catch(() => alive && setAll([]))
    return () => {
      alive = false
    }
  }, [tab, academyId, year])

  /** 평일 격자에 쓸 교시 · 토요일 격자에 쓸 교시 */
  const weekdayPeriods = useMemo(() => periods.filter((p) => p.dayType === 'WEEKDAY'), [periods])
  const saturdayPeriods = useMemo(() => periods.filter((p) => p.dayType === 'SATURDAY'), [periods])
  /** 요일에 맞는 교시를 고른다 — 섞으면 서버가 거절한다 */
  const periodsOf = useCallback(
    (day: DayOfWeek) => periods.filter((p) => p.dayType === DAY_TYPE_OF[day]),
    [periods],
  )

  const cls = classes.find((c) => c.id === classId) ?? null
  const srvOf = useMemo(() => {
    const m = new Map<string, SrvCell>()
    for (const c of cells) m.set(keyOf(c.dayOfWeek, c.periodId), c)
    return m
  }, [cells])

  const draftOf = (day: DayOfWeek, periodId: number) => draft[keyOf(day, periodId)] ?? EMPTY
  const filled = (d: Draft) => d.subject.trim() !== '' || d.teacherId !== '' || d.roomId !== ''

  const teacherName = (id: string) => teachers.find((t) => String(t.id) === id)?.name ?? ''
  const roomNo = (id: string) => rooms.find((r) => String(r.id) === id)?.roomNo ?? ''

  /**
   * ★ 같은 시간 같은 강의실을 **저장 전에 보여준다.** 막는 것은 서버다 — 두 사람이 동시에
   *   저장하면 화면 검사는 뚫린다. 여기서는 「눌러 보고 거절당하는 일」을 줄이는 몫만 한다.
   */
  const conflicts = useMemo(() => {
    if (all === null || classId === null) return []
    const out: string[] = []
    for (const [k, d] of Object.entries(draft)) {
      if (d.roomId === '') continue
      const [day, pid] = k.split(':')
      const clash = all.find(
        (c) =>
          c.classId !== classId &&
          c.dayOfWeek === day &&
          String(c.periodId) === pid &&
          String(c.effectiveRoomId ?? '') === d.roomId,
      )
      if (clash) out.push(`${DAY_LABEL[day as DayOfWeek]} · ${clash.periodName ?? clash.periodNo}교시 ${roomNo(d.roomId)} — ${clash.className ?? '다른 반'}`)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, all, classId, rooms])

  async function save() {
    if (classId === null) return
    const body: TimetableCellSave[] = []
    for (const day of SRV_DAYS) {
      /* ★ 그 요일 종류의 교시만 보낸다 — 평일 교시를 토요일 칸에 담으면 서버가 거절한다 */
      for (const p of periodsOf(day)) {
        const d = draftOf(day, p.id)
        const had = srvOf.has(keyOf(day, p.id))
        /* ★ 서버는 **내용이 빈 칸을 「지움」**으로 읽는다. 원래 없던 빈 칸까지 보내면
           쓸데없이 커지므로, **원래 있었거나 지금 채운 칸만** 보낸다 */
        if (!had && !filled(d)) continue
        body.push({
          dayOfWeek: day,
          periodId: p.id,
          subject: d.subject.trim() === '' ? null : d.subject.trim(),
          teacherId: d.teacherId === '' ? null : Number(d.teacherId),
          roomId: d.roomId === '' ? null : Number(d.roomId),
        })
      }
    }
    /* ★ 빈 목록은 서버가 거절한다 — 먼저 막아야 「저장이 안 된다」로 보이지 않는다 */
    if (body.length === 0) {
      setError('저장할 항목이 없습니다. 칸을 선택해 과목을 먼저 입력합니다.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveClassTimetable(classId, body)
      await load()
      setNotice(`${cls?.name ?? '반'} 시간표를 저장했습니다.`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function runCopy() {
    if (academyId === null) return
    setCopying({ busy: true, err: null, result: null })
    try {
      const r = await copyTimetableYear({ academyId, fromYear: year - 1, toYear: year })
      /* ★ 합계만 보여주면 「이 반은 작년에 같은 이름이 없어 비었습니다」를 말해 줄 수 없다 */
      const lines = (r.classes ?? []).map((c) =>
        c.noSource
          ? `${c.className ?? '이름 없음'} — 작년에 같은 이름의 반이 없어 비었습니다`
          : `${c.className ?? '이름 없음'} — ${c.copied}칸 복사${c.skipped > 0 ? ` · ${c.skipped}칸은 이미 있어 건너뜀` : ''}`,
      )
      setCopying({ busy: false, err: null, result: lines.length > 0 ? lines : ['옮길 편성이 없었습니다.'] })
      await load()
    } catch (e) {
      setCopying({ busy: false, err: e instanceof ApiError ? e.message : '복사하지 못했습니다.', result: null })
    }
  }

  /* 헤더 버튼 — 첫 렌더의 0 은 건너뛴다(방금 읽은 것을 또 저장할 이유가 없다) */
  const saveV = saveSignal.useVersion()
  const copyV = copySignal.useVersion()
  useEffect(() => {
    if (saveV > 0) void save()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveV])
  useEffect(() => {
    if (copyV > 0) setCopying({ busy: false, err: null, result: null })
  }, [copyV])

  const moveRows = useMemo(
    () => (subject === '전체' ? MOVE_ROWS : MOVE_ROWS.filter((r) => r.subject === subject)),
    [subject],
  )

  /** 강의실별 사용 교시 수 — 전 지점 편성에서 센다 */
  const roomRows = useMemo(() => {
    const rows = all ?? []
    const slots = periods.length * SRV_DAYS.length
    return rooms.map((r) => {
      const used = rows.filter((c) => c.effectiveRoomId === r.id).length
      /* 같은 (요일·교시·강의실)에 둘 이상이면 중복이다 — 서버가 막지만 **과거 데이터**가 있을 수 있다 */
      const seen = new Map<string, number>()
      for (const c of rows.filter((x) => x.effectiveRoomId === r.id)) {
        const k = `${c.dayOfWeek}:${c.periodId}`
        seen.set(k, (seen.get(k) ?? 0) + 1)
      }
      const conflict = [...seen.values()].filter((n) => n > 1).length
      return { room: r.roomNo, used, capacity: slots, conflict }
    })
  }, [all, rooms, periods])

  const movingCount = useMemo(() => Object.values(draft).filter((d) => d.roomId !== '').length, [draft])

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="user-check" size={13} /> {cls?.name ?? '반'} 담임
          </div>
          <div className="v" style={{ fontSize: 18, paddingTop: 3 }}>
            {cls?.homeroomTeacherName ?? '-'}
          </div>
          <div className="d">{cls?.roomName ? `홈룸 ${cls.roomName}` : '홈룸 미지정'}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="clock" size={13} /> 주당 칸
          </div>
          <div className="v">{weekdayPeriods.length * WEEKDAYS.length + saturdayPeriods.length}</div>
          <div className="d">
            평일 {weekdayPeriods.length}교시 · 토 {saturdayPeriods.length}교시
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="route" size={13} /> 이동수업
          </div>
          <div className="v">{movingCount}</div>
          <div className="d">강의실을 따로 지정한 칸</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="building-2" size={13} /> 강의실
          </div>
          <div className="v">{rooms.length}</div>
          <div className="d">배정 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 겹침
          </div>
          <div className="v">{conflicts.length}</div>
          <div className="d">{all === null ? '강의실 탭에서 확인' : '저장 전 확인'}</div>
        </div>
      </div>

      {notice && (
        <div className="note-box" role="status">
          <div>{notice}</div>
        </div>
      )}
      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <div className="note-box plain">
        <div className="ic">
          <Icon name="git-compare" size={17} />
        </div>
        <div>
          <div className="tt">반 시간표와 주·일 학습계획은 연동하지 않습니다</div>
          <div className="tx">
            <b>반 시간표(여기)</b>는 교무팀이 반 단위로 짜는 <b>고정 편성</b>이고, <b>주·일 학습계획</b>은
            학생이 본인 시간을 채우는 <b>개인 계획</b>입니다. 주체도 단위도 다릅니다.
            <br />
            시간표를 짜도 학생의 학습계획에 자동으로 들어가지 않습니다.
          </div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'grid', label: '반 시간표' },
          { key: 'move', label: '이동수업 편성' },
          { key: 'room', label: '강의실 사용 현황' },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {tab === 'grid' && (
        <div className="card-sec p-tt">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="table-2" size={15} />
              </span>
              {cls?.name ?? '반'} 주간 시간표
              {saving && (
                <span className="mk supplement" style={{ marginLeft: 6 }}>
                  저장 중…
                </span>
              )}
              {!saving && dirty && (
                <span className="mk brandnew" style={{ marginLeft: 6 }}>
                  저장하지 않은 편성이 있습니다 — 위 「편성 저장」을 누르세요
                </span>
              )}
            </div>
            <div className="r">
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip${classId === c.id ? ' on' : ''}`}
                  onClick={() => setClassId(c.id)}
                  title={c.homeroomTeacherName ? `담임 ${c.homeroomTeacherName}` : '담임 미지정'}
                >
                  {c.name}
                </button>
              ))}
              <PrintButton />
            </div>
          </div>
          <div className="card-sec-b">
            {classes.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                {academyId === null ? '지점을 먼저 선택해 주세요.' : '이 지점에 등록된 반이 없습니다.'}
              </div>
            )}
            {periods.length === 0 && classes.length > 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                교시가 등록되어 있지 않습니다. 기초 관리 → 교시에서 먼저 만드세요.
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
                <div>
                  같은 시간에 <b>같은 강의실을 쓰는 반</b>이 있습니다 — 저장하면 서버가 막습니다.
                  <br />
                  {conflicts.slice(0, 5).join(' · ')}
                  {conflicts.length > 5 && ` 외 ${conflicts.length - 5}건`}
                </div>
              </div>
            )}

            {/* ★ 평일과 토요일은 **교시 마스터가 다르다** — 한 표에 섞으면 시각이 어긋나고
                   저장도 거절된다. 표를 나누되 **토요일 교시가 없으면 그 표를 안 그린다** */}
            {classes.length > 0 &&
              ([
                { label: '평일', days: WEEKDAYS, ps: weekdayPeriods },
                { label: '토요일', days: ['SATURDAY'] as DayOfWeek[], ps: saturdayPeriods },
              ] as const).map(
                (g) =>
                  g.ps.length > 0 && (
                    <div key={g.label} style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>
                        {g.label} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· 교시 {g.ps.length}개</span>
                      </div>
                      <div className="tt-scroll">
                        <table className="tt">
                          <thead>
                            <tr>
                              <th className="pr">교시</th>
                              {g.days.map((d) => (
                                <th key={d} className={d === 'SATURDAY' ? 'sat' : undefined}>
                                  {DAY_LABEL[d]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {g.ps.map((p) => (
                              <tr key={p.id}>
                                <th className="pr">
                                  {p.name ?? `${p.periodNo}교시`}
                                  <span className="tm">
                                    {p.startTime}-{p.endTime}
                                  </span>
                                </th>
                                {g.days.map((d) => {
                                  const dr = draftOf(d, p.id)
                                  const srv = srvOf.get(keyOf(d, p.id))
                                  const has = filled(dr)
                                  /* ★ 강의실은 **서버가 정한 실제 적용 강의실**을 그린다. 새로 고른
                                     칸은 아직 서버를 안 거쳤으므로 선택한 값으로 보여준다 */
                                  const room =
                                    dr.roomId !== '' ? roomNo(dr.roomId) : (srv?.effectiveRoomNo ?? cls?.roomName ?? '')
                                  const tch = dr.teacherId !== '' ? teacherName(dr.teacherId) : ''
                                  return (
                                    <td key={d}>
                                      <button
                                        type="button"
                                        className={`cell ${has ? (dr.roomId !== '' ? 'move' : 'fix') : 'self'}`}
                                        onClick={() => canEdit && setEditing({ day: d, period: p, form: { ...dr } })}
                                        title={
                                          has
                                            ? `${dr.subject || '과목 없음'} · ${room}${tch ? ` · ${tch}` : ''}`
                                            : canEdit
                                              ? '눌러서 편성합니다'
                                              : '보기 전용입니다'
                                        }
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          cursor: canEdit ? 'pointer' : 'default',
                                        }}
                                      >
                                        <span className="sj">{has ? dr.subject || '(과목 없음)' : ''}</span>
                                        <span className="mt">
                                          {has ? room : ''}
                                          {has && tch ? ` · ${tch}` : ''}
                                        </span>
                                        {dr.roomId !== '' && (
                                          <span className="mv">
                                            <Icon name="arrow-right" size={9} /> 이동
                                          </span>
                                        )}
                                      </button>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ),
              )}

            <div className="tt-legend" style={{ marginTop: 12 }}>
              <span>
                <span className="sw" style={{ background: 'var(--mint-wash)' }} /> 반 교실 수업
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--violet-wash)' }} /> 이동수업 — 강의실을 따로 지정한 칸
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--bg)' }} /> 비어 있음
              </span>
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                강의실을 비우면 반 홈룸({cls?.roomName ?? '미지정'})에서 합니다
              </span>
            </div>
            {loading && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>불러오는 중…</div>}
          </div>
        </div>
      )}

      {tab === 'move' && (
        <>
          <MockNotice empty reason="학생이 어느 수준별 반으로 가는지를 담을 곳이 서버에 없습니다. 칸별 강의실은 반 시간표 탭에서 실제로 저장됩니다." />
          <div className="filter-row" style={{ background: '#fff', borderRadius: 12, marginBottom: 14, border: 'none' }}>
            {['전체', ...MOVE_SUBJECTS].map((s) => (
              <button key={s} type="button" className={`chip${subject === s ? ' on' : ''}`} onClick={() => setSubject(s)}>
                {s}
              </button>
            ))}
          </div>
          <DataTable
            columns={MOVE_COLUMNS}
            rows={moveRows}
            rowKey={(r) => r.id}
            selectable
            selected={sel}
            onSelectedChange={setSel}
            pageSize={15}
            emptyText="이동수업 편성은 아직 제공되지 않습니다. 칸별 강의실은 「반 시간표」 탭에서 저장됩니다."
            countLabel={
              <>
                이동수업 배정 <b>{moveRows.length}</b>건
              </>
            }
            toolbar={
              <>
                <button className="btn" disabled data-soon title="준비 중입니다">
                  <Icon name="upload" size={14} /> 엑셀 일괄 배정
                </button>
                <ExcelButton filename={`이동수업_${subject}`} columns={MOVE_COLUMNS} rows={moveRows} />
                <button className="btn pri" disabled data-soon title="준비 중입니다">
                  <Icon name="route" size={14} /> 선택 이동반 변경
                </button>
              </>
            }
          />
        </>
      )}

      {tab === 'room' && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="building-2" size={15} />
              </span>
              강의실 주간 사용률
            </div>
            <div className="r">
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{year}년 · 지점 전체 편성 기준</span>
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {all === null && <div style={{ color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</div>}
            {all !== null && roomRows.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>등록된 강의실이 없습니다.</div>
            )}
            {roomRows.map((r) => {
              const pct = r.capacity > 0 ? Math.round((r.used / r.capacity) * 100) : 0
              return (
                <div key={r.room} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 70, fontSize: 12.5, fontWeight: 700 }}>{r.room}</span>
                  <span style={{ flex: 1, height: 20, borderRadius: 7, background: 'var(--line-2)', overflow: 'hidden' }}>
                    <span
                      style={{
                        display: 'block',
                        width: `${Math.min(pct, 100)}%`,
                        height: '100%',
                        background: pct >= 90 ? 'var(--amber)' : 'var(--mint)',
                      }}
                    />
                  </span>
                  <span style={{ width: 96, fontSize: 12, textAlign: 'right', color: 'var(--ink-2)' }}>
                    {r.used} / {r.capacity}칸
                  </span>
                  <span style={{ width: 92, textAlign: 'right' }}>
                    {r.conflict > 0 ? (
                      <span className="mk brandnew" title="같은 교시에 두 반이 배정됨">
                        겹침 {r.conflict}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>정상</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 칸 편집 — 비우고 저장하면 그 칸은 지워진다(서버가 「내용이 빈 칸 = 지움」으로 읽는다) */}
      {editing && (
        <Modal
          title={`${DAY_LABEL[editing.day]} · ${editing.period.name ?? `${editing.period.periodNo}교시`}`}
          sub={`${editing.period.startTime}-${editing.period.endTime} · ${cls?.name ?? ''}`}
          confirmLabel="칸에 넣기"
          onConfirm={() => {
            setDraft((d) => ({ ...d, [keyOf(editing.day, editing.period.id)]: editing.form }))
            setDirty(true)
            setNotice(null)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        >
          <div className="frow">
            <label>과목</label>
            <input
              className="inp"
              value={editing.form.subject}
              maxLength={30}
              placeholder="예) 수학"
              onChange={(e) => setEditing({ ...editing, form: { ...editing.form, subject: e.target.value } })}
            />
          </div>
          <div className="frow">
            <label>담당</label>
            <select
              className="sel"
              value={editing.form.teacherId}
              onChange={(e) => setEditing({ ...editing, form: { ...editing.form, teacherId: e.target.value } })}
            >
              <option value="">지정 안 함</option>
              {teachers.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="frow">
            <label>강의실</label>
            <div>
              <select
                className="sel"
                value={editing.form.roomId}
                onChange={(e) => setEditing({ ...editing, form: { ...editing.form, roomId: e.target.value } })}
              >
                <option value="">반 홈룸에서 합니다{cls?.roomName ? ` (${cls.roomName})` : ''}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.roomNo}
                    {r.name ? ` · ${r.name}` : ''}
                  </option>
                ))}
              </select>
              <div className="hint">강의실을 고르면 그 칸만 이동수업이 됩니다. 비우면 반 홈룸에서 합니다.</div>
            </div>
          </div>
          <div className="note-box">
            <div>
              내용을 모두 비우고 저장하면 <b>이 칸은 지워집니다.</b>
            </div>
          </div>
        </Modal>
      )}

      {/* 전년도 복사 — 멱등이라 두 번 눌러도 같다 */}
      {copying && (
        <Modal
          title={`${year - 1}년 편성을 ${year}년으로 복사합니다`}
          sub="이미 있는 칸은 제외됩니다"
          confirmLabel="복사"
          busy={copying.busy}
          error={copying.err}
          hideCancel={copying.result !== null}
          onConfirm={() => (copying.result !== null ? setCopying(null) : void runCopy())}
          onClose={() => setCopying(null)}
        >
          {copying.result === null ? (
            <div className="note-box">
              <div>
                <b>올해에 이미 있는 칸은 유지됩니다</b> — 복사 뒤 손으로 고친 편성이 되돌려지지 않습니다. 두 번
                눌러도 결과는 같습니다.
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflow: 'auto' }}>
              {copying.result.map((l, i) => (
                <div key={i} className="frow ro">
                  <label>{i + 1}</label>
                  <div style={{ fontSize: 12.5 }}>{l}</div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

/**
 * 헤더 액션 — 본문과 부모가 달라 신호로 잇는다.
 *
 * ★ **담임에게는 안 낸다.** 서버가 편성 저장·전년도 복사를 막는다(2026-10-14) —
 *   **자기 반을 보는 것과 지점 시간표를 짜는 것은 다른 일**이라서다. 버튼을 두면
 *   눌러 보고 403 으로 알게 되고, 그건 고장으로 읽힌다.
 * ★ 조회 전용도 같다 — 쓰기가 전부 막힌 계정이다.
 */
function TimetableActions() {
  const { teacherOnly, readOnly } = useAuth()
  if (teacherOnly || readOnly) return null
  return (
    <>
      <button className="btn" onClick={() => copySignal.bump()}>
        <Icon name="history" size={14} /> 전년도 복사
      </button>
      <button className="btn pri" onClick={() => saveSignal.bump()}>
        <Icon name="save" size={14} /> 편성 저장
      </button>
    </>
  )
}

export const timetableMockup: Mockup = {
  Content,
  actions: <TimetableActions />,
}
