import { useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  SearchForm,
  useServerData,
  type Column,
  type DateRangeValue,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import { listClasses } from '../../api/classes'
import {
  PENALTY_CATEGORY_LABEL,
  fetchPenaltyBoard,
  fetchPenaltyItems,
  grantPenalties,
  type PenaltyCategory,
  type PenaltyRow,
  type PenaltySource,
} from '../../api/penalties'
import type { EnrollmentStatus } from '../../api/students'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.1-2 상벌점 관리 — GET /api/v1/admin/penalties
 *
 * ★ 서버 페이징이 없어 useServerData 를 쓴다(Attendance.tsx 머리 주석과 같은 이유).
 *
 * ★ point 는 부호가 이미 들어 있다 — 벌점이 음수다. 화면이 category 를 보고 부호를
 *   다시 만들면 항목 점수를 음수로 등록한 지점에서 부호가 뒤집힌다.
 *
 * ★ '방식'은 화면과 서버의 축이 다르다. 서버 source 는 KIOSK·ROUTINE·MANUAL 이고
 *   화면은 수기(MANUAL) / 자동(KIOSK+ROUTINE) 둘로 묶는다. 반복 파라미터를 받아주므로
 *   '자동'은 ?source=KIOSK&source=ROUTINE 으로 나간다 — 화면에서 거르지 않는다.
 */

const PAGE_SIZE = 15

const KIND_CHIPS = ['상점', '벌점']
const KIND_TO_CATEGORY: Record<string, PenaltyCategory> = { 상점: 'MERIT', 벌점: 'DEMERIT' }

const SOURCE_CHIPS = ['수기', '자동']
/** 화면 칩 → 서버 source. '자동'은 두 값이라 배열이다 */
const CHIP_TO_SOURCES: Record<string, PenaltySource[]> = {
  수기: ['MANUAL'],
  자동: ['KIOSK', 'ROUTINE'],
}

const ENROLL_CHIPS = ['전체보기', '재원생', '퇴원생']
/** '전체보기'는 파라미터를 안 보낸다는 뜻이라 매핑에서 뺀다 */
const CHIP_TO_ENROLLMENT: Record<string, EnrollmentStatus> = {
  재원생: 'ENROLLED',
  퇴원생: 'WITHDRAWN',
}

/** 조건이 비었을 때 매번 새 배열을 만들면 params 의존성이 매 렌더 바뀌어 무한 요청이 된다 */
const NO_CHIPS: string[] = []

/** 모듈 최상위에 둔다 — 인라인으로 넘기면 매 렌더 새 참조가 된다(Attendance.tsx 주석 참고) */
const fetchClasses = ({ year }: { year: number }) => listClasses(year)

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** UTC 로 만들면 오전에 하루가 밀린다 — 부여 일자 기본값이라 로컬 날짜여야 한다 */
function todayStr(): string {
  return localDate(new Date())
}

/** 서버가 UTC instant 로 준다. 날짜만 쓰더라도 로컬로 바꿔야 자정 근처가 하루 밀리지 않는다 */
function localDateOf(iso: string): string {
  return localDate(new Date(iso))
}

function one(v: unknown): string | undefined {
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : undefined
  if (typeof v === 'string' && v !== '') return v
  return undefined
}

function Content() {
  const { academyId } = useAcademy()
  const [query, setQuery] = useState<SearchValues>({})
  const [selected, setSelected] = useState<string[]>([])
  const [masked, setMasked] = useState(true)
  const [grantOpen, setGrantOpen] = useState(false)
  const [itemId, setItemId] = useState<string>('')
  const [grantReason, setGrantReason] = useState('')
  // 어제 일을 오늘 넣는 경우가 실제로 있다. 기본값은 오늘
  const [grantDate, setGrantDate] = useState(todayStr)
  const [granting, setGranting] = useState(false)
  const [grantMsg, setGrantMsg] = useState<string | null>(null)

  const year = new Date().getFullYear()

  // 반 드롭다운은 하드코딩하지 않는다 — 지점·연도마다 다르다
  const classParams = useMemo(() => ({ year }), [year])
  const classes = useServerData({
    fetcher: fetchClasses,
    params: classParams,
    enabled: academyId !== null,
    errorMessage: '반 목록을 불러오지 못했습니다.',
  })

  const itemParams = useMemo(() => ({ academyId: academyId ?? undefined, year }), [academyId, year])
  const items = useServerData({
    fetcher: fetchPenaltyItems,
    params: itemParams,
    enabled: academyId !== null,
    errorMessage: '상벌점 항목을 불러오지 못했습니다.',
  })

  const classOptions = useMemo(
    () =>
      (classes.data ?? [])
        .filter((c) => c.academyId === academyId)
        .map((c) => ({ value: String(c.id), label: c.name })),
    [classes.data, academyId],
  )

  const fields: Field[] = useMemo(
    () => [
      { type: 'text', name: 'keyword', label: '이름 · 학번', placeholder: '예: 이승민 / 2026-0001', span: 2 },
      { type: 'select', name: 'classId', label: '반', options: classOptions },
      { type: 'chips', name: 'kind', label: '구분', options: KIND_CHIPS },
      { type: 'chips', name: 'source', label: '부여 방식', options: SOURCE_CHIPS, multiple: true },
      { type: 'chips', name: 'enrollStatus', label: '재원 상태', options: ENROLL_CHIPS },
      { type: 'dateRange', name: 'period', label: '기간', presets: true, span: 2 },
    ],
    [classOptions],
  )

  const range = query.period as DateRangeValue | undefined
  // 서버 기본값(이번 달 1일 ~ 오늘)과 같은 값을 명시해 보낸다 — 건수 라벨에 적은 기간과 맞추려는 것
  const period = useMemo(() => {
    const now = new Date()
    return {
      from: range?.from || localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: range?.to || localDate(now),
    }
  }, [range])

  const sourceChips = useMemo(
    () => (Array.isArray(query.source) ? query.source : NO_CHIPS),
    [query.source],
  )
  const enrollStatus = one(query.enrollStatus)

  // ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다
  const params = useMemo(() => {
    const kind = one(query.kind)
    const classId = one(query.classId)
    // 칩 하나가 서버 값 여러 개로 펼쳐진다('자동' → KIOSK·ROUTINE)
    const source = sourceChips.flatMap((c) => CHIP_TO_SOURCES[c] ?? [])

    return {
      academyId: academyId ?? undefined,
      from: period.from,
      to: period.to,
      category: kind ? KIND_TO_CATEGORY[kind] : undefined,
      source: source.length > 0 ? source : undefined,
      enrollmentStatus: enrollStatus ? CHIP_TO_ENROLLMENT[enrollStatus] : undefined,
      keyword: one(query.keyword),
      classId: classId ? Number(classId) : undefined,
    }
  }, [query, academyId, period, sourceChips, enrollStatus])

  const board = useServerData({
    fetcher: fetchPenaltyBoard,
    params,
    enabled: academyId !== null,
    errorMessage: '상벌점 내역을 불러오지 못했습니다.',
  })

  const summary = board.data?.summary
  const serverMasked = board.data?.masked ?? false
  const effectiveMasked = serverMasked ? false : masked

  const rows = board.data?.rows ?? []

  const selectedEnrollments = useMemo(() => {
    const byId = new Map(rows.map((r) => [String(r.id), r.enrollmentId]))
    // 같은 학생의 이력을 여러 건 골랐을 수 있다 — 중복 부여를 막으려면 학생 단위로 접는다
    return [...new Set(selected.map((id) => byId.get(id)).filter((v): v is number => v !== undefined))]
  }, [selected, rows])

  const columns: Column<PenaltyRow>[] = useMemo(
    () => [
      { key: 'occurredAt', header: '일자', width: '100px', sortable: true, value: (r) => localDateOf(r.occurredAt) },
      { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo ?? '-' },
      { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
      // 56px 은 값이 없던 시절 폭이다 — 'N수 1반'이 두 줄로 깨진다
      { key: 'className', header: '반', width: '78px', align: 'center', value: (r) => r.className ?? '-' },
      {
        key: 'category',
        header: '구분',
        width: '64px',
        align: 'center',
        value: (r) => PENALTY_CATEGORY_LABEL[r.category] ?? r.category,
        render: (r, shown) => (
          <span className={`mk ${r.category === 'MERIT' ? 'verified' : 'brandnew'}`}>{shown}</span>
        ),
      },
      { key: 'itemName', header: '항목', width: '140px', value: (r) => r.itemName },
      {
        key: 'point',
        header: '점수',
        width: '64px',
        align: 'right',
        sortable: true,
        // 서버가 부호를 실어 보낸다 — 여기서 category 로 다시 만들지 않는다
        value: (r) => r.point,
        render: (r) => (
          <b style={{ color: r.point > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>
            {r.point > 0 ? `+${r.point}` : r.point}
          </b>
        ),
      },
      { key: 'reason', header: '사유', value: (r) => r.reason ?? '-' },
      { key: 'grantedByName', header: '부여자', width: '90px', value: (r) => r.grantedByName ?? '-' },
      {
        key: 'source',
        header: '방식',
        width: '86px',
        align: 'center',
        value: (r) => (r.source === 'MANUAL' ? '수기' : '자동'),
        render: (r, shown) =>
          r.source === 'MANUAL' ? (
            <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{shown}</span>
          ) : (
            <span className="mk supplement" title={`source: ${r.source}`}>
              {shown}
            </span>
          ),
      },
    ],
    [],
  )

  async function grant() {
    if (selectedEnrollments.length === 0 || itemId === '') return
    setGranting(true)
    setGrantMsg(null)
    try {
      const count = await grantPenalties({
        enrollmentIds: selectedEnrollments,
        itemId: Number(itemId),
        reason: grantReason.trim() || undefined,
        occurredAt: grantDate || undefined,
      })
      setGrantMsg(`${grantDate} 자로 ${count}건을 부여했습니다. 학생 앱 Daily Report 에 즉시 반영됩니다.`)
      setSelected([])
      setGrantOpen(false)
      setGrantReason('')
      board.reload()
    } catch (err) {
      setGrantMsg(err instanceof ApiError ? err.message : '점수 부여에 실패했습니다.')
    } finally {
      setGranting(false)
    }
  }

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="star" size={13} /> 상점 합계
          </div>
          <div className="v" style={{ color: 'var(--green)' }}>
            +{summary?.plusTotal ?? 0}
          </div>
          <div className="d">조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 벌점 합계
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {summary?.minusTotal ?? 0}
          </div>
          <div className="d">조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="zap" size={13} /> 자동 부여
          </div>
          <div className="v">{summary?.autoCount ?? 0}</div>
          <div className="d warn">규칙 확정 시 활성</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="history" size={13} /> 전년도 복사
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            항목 {items.data?.length ?? 0}종
          </div>
          <div className="d">{year}년 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="smartphone" size={13} /> 앱 반영
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            실시간
          </div>
          <div className="d">Daily Report 연동</div>
        </div>
      </div>

      <SearchForm fields={fields} onSearch={setQuery} presetKey="penalty" />

      {academyId === null && (
        <div className="note-box">지점을 먼저 선택하세요. 상벌점은 지점 단위로 조회합니다.</div>
      )}

      {board.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {board.error}
        </div>
      )}

      {grantMsg && <div className="note-box">{grantMsg}</div>}

      {grantOpen && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="pencil" size={15} />
              </span>
              선택 {selectedEnrollments.length}명 일괄 점수부여 (수기)
            </div>
            <div className="r">
              <button className="btn" onClick={() => setGrantOpen(false)}>
                닫기
              </button>
            </div>
          </div>
          <div className="card-sec-b">
            <div className="frow">
              <label className="req">항목</label>
              <select className="sel" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">선택하세요</option>
                {(items.data ?? []).map((it) => (
                  <option key={it.id} value={String(it.id)}>
                    [{PENALTY_CATEGORY_LABEL[it.category]}] {it.itemName} ({it.point > 0 ? `+${it.point}` : it.point})
                  </option>
                ))}
              </select>
            </div>
            <div className="frow">
              <label className="req">일자</label>
              <div className="two">
                {/* 미래 일자는 서버가 거부한다 — 고르지 못하게 막아 400을 먼저 없앤다 */}
                <input
                  className="inp"
                  type="date"
                  value={grantDate}
                  max={todayStr()}
                  onChange={(e) => setGrantDate(e.target.value)}
                />
                <input
                  className="inp"
                  placeholder="사유 (선택)"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                />
              </div>
            </div>
            <div className="frow">
              <label>&nbsp;</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn pri"
                  disabled={granting || itemId === '' || selectedEnrollments.length === 0}
                  onClick={() => void grant()}
                >
                  <Icon name="check" size={14} /> {granting ? '부여 중…' : `${selectedEnrollments.length}명 부여`}
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  점수는 항목 값 그대로라 조정할 수 없습니다. 저장 시 학생 앱 Daily Report 에 즉시 반영됩니다.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        masked={effectiveMasked}
        loading={board.loading}
        pageSize={PAGE_SIZE}
        countLabel={
          <>
            {period.from} ~ {period.to} 내역 <b>{rows.length}</b>건
          </>
        }
        toolbar={
          <>
            <button className="btn" disabled={selected.length === 0} onClick={() => setGrantOpen(true)}>
              <Icon name="plus" size={14} /> 선택 일괄 점수부여
            </button>
            {serverMasked ? (
              <span className="dt-count" style={{ color: 'var(--muted)' }}>
                권한상 마스킹됨
              </span>
            ) : (
              <MaskToggle masked={masked} onChange={setMasked} />
            )}
            <ExcelButton filename="상벌점_내역" columns={columns} rows={rows} masked={effectiveMasked} />
          </>
        }
      />
    </>
  )
}

export const penaltyMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="history" size={14} /> 항목 전년도 복사
      </button>
      <button className="btn">
        <Icon name="settings" size={14} /> 상벌점 항목 관리
      </button>
    </>
  ),
}
