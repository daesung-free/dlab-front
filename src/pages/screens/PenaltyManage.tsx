import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { DataTable, ExcelButton, MaskToggle, SearchForm, useServerData, type Column, type DateRangeValue, type Field, type SearchValues, Modal } from '../../components/common'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import { listClasses } from '../../api/classes'
import {
  PENALTY_CATEGORY_LABEL,
  PENALTY_TRIGGER_LABEL,
  createPenaltyItem,
  deletePenaltyItem,
  deletePenaltyRule,
  fetchPenaltyBoard,
  fetchPenaltyItems,
  grantPenalties,
  listPenaltyItems,
  listPenaltyRules,
  revokePenalty,
  setPenaltyRuleActive,
  updatePenaltyItem,
  type PenaltyCategory,
  type PenaltyItemRow,
  type PenaltyRow,
  type PenaltyRuleRow,
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
 * ★ **내역의 point 와 항목 관리의 point 는 규칙이 다르다.** 내역은 서버가 항상 음수로
 *   정규화해 주지만, 항목 마스터(`/penalty-items`)는 저장된 값을 그대로 준다 —
 *   같은 DEMERIT 인데 '지각'은 +5, '무단조퇴'는 -3 으로 온다. 그래서 **항목 관리 화면은
 *   절댓값으로 보여주고 절댓값으로 보낸다.** 부호는 구분(상점/벌점)이 갖는다.
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

/* 항목을 고치면 아래 표의 부여 드롭다운도 같이 바뀌어야 한다. 그런데 헤더 액션(`actions`)과
 * 본문(`Content`)은 ScreenPage 가 **따로 렌더**해서 상태를 공유할 수 없다 —
 * props 로 내릴 자리가 없다. 그래서 모듈 안에 작은 신호를 두고 본문이 구독한다.
 * 이게 없으면 항목을 추가한 직후 부여 드롭다운에 그 항목이 안 보인다. */
let itemsVersion = 0
const itemsListeners = new Set<() => void>()

function bumpItems(): void {
  itemsVersion += 1
  for (const fn of itemsListeners) fn()
}

function useItemsVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      itemsListeners.add(cb)
      return () => {
        itemsListeners.delete(cb)
      }
    },
    () => itemsVersion,
  )
}

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

  /* 헤더의 항목 관리에서 항목이 바뀌면 부여 드롭다운을 다시 읽는다.
     첫 렌더의 0 은 건너뛴다 — 방금 읽은 것을 한 번 더 읽을 이유가 없다 */
  const itemsVer = useItemsVersion()
  const reloadItems = items.reload
  useEffect(() => {
    if (itemsVer > 0) reloadItems()
  }, [itemsVer, reloadItems])

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

  const [revoking, setRevoking] = useState<number | null>(null)
  /** 취소 확인 모달 */
  const [confirming, setConfirming] = useState<PenaltyRow | null>(null)

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
      {
        /* 요구사항의 '학생별 내역 조회·수정'. 잘못 준 점수를 상점으로 상쇄하면
           이력에 두 줄이 남아 무엇이 실수였는지 나중에 알 수 없다 — 그래서 취소로 지운다.
           서버는 soft delete 라 "누가 왜 취소했나"가 남는다. */
        key: 'revoke',
        header: '',
        width: '68px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <button
            className="btn"
            type="button"
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            disabled={revoking !== null}
            onClick={() => setConfirming(r)}
          >
            {revoking === r.id ? '취소 중…' : '취소'}
          </button>
        ),
      },
    ],
    [revoking],
  )

  async function revoke(row: PenaltyRow): Promise<boolean> {
    const label = `${row.name} · ${PENALTY_CATEGORY_LABEL[row.category]} ${row.point > 0 ? `+${row.point}` : row.point}점 (${row.itemName})`
    setRevoking(row.id)
    setGrantMsg(null)
    try {
      await revokePenalty(row.id)
      setGrantMsg(`${label} 을 취소했습니다. 학생 앱 Daily Report 에도 즉시 반영됩니다.`)
      // 합계가 상단 통계에 걸려 있어 목록만 지우면 숫자가 안 맞는다
      board.reload()
      return true
    } catch (err) {
      setGrantMsg(err instanceof ApiError ? err.message : '취소하지 못했습니다.')
      return false
    } finally {
      setRevoking(null)
    }
  }

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
      {confirming && (
        <Modal
          title="이 부여를 취소할까요?"
          sub={`${confirming.name} · ${PENALTY_CATEGORY_LABEL[confirming.category]} ${
            confirming.point > 0 ? `+${confirming.point}` : confirming.point
          }점 (${confirming.itemName}) · 되돌릴 수 없습니다.`}
          confirmLabel="취소 처리"
          danger
          busy={revoking !== null}
          onConfirm={() => void revoke(confirming).then((ok) => ok && setConfirming(null))}
          onClose={() => setConfirming(null)}
        />
      )}

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

/** 편집 중인 항목. 새로 만드는 중이면 `id` 가 null */
interface ItemDraft {
  id: number | null
  itemName: string
  point: string
  category: PenaltyCategory
}

const EMPTY_DRAFT: ItemDraft = { id: null, itemName: '', point: '', category: 'DEMERIT' }

/**
 * 헤더 우측 액션 — 항목 관리 · 전년도 복사.
 *
 * ★ 본문과 분리된 컴포넌트다(위 `bumpItems` 주석 참고). 지점·연도는 여기서 직접 읽는다.
 */
function PenaltyActions() {
  const { academyId } = useAcademy()
  const year = new Date().getFullYear()

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PenaltyItemRow[] | null>(null)
  const [rules, setRules] = useState<PenaltyRuleRow[] | null>(null)
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [copyOpen, setCopyOpen] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  async function load() {
    if (academyId === null) return
    setErr(null)
    try {
      const [i, r] = await Promise.all([
        listPenaltyItems({ academyId, year }),
        /* 규칙을 못 읽어도 항목 관리는 되게 둔다 — 둘은 독립이다 */
        listPenaltyRules({ academyId, year }).catch(() => [] as PenaltyRuleRow[]),
      ])
      setItems(i)
      setRules(r)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '항목을 불러오지 못했습니다.')
    }
  }

  function openManage() {
    setItems(null)
    setRules(null)
    setDraft(EMPTY_DRAFT)
    setOpen(true)
    void load()
  }

  async function saveDraft() {
    if (academyId === null) return
    setBusy(true)
    setErr(null)
    try {
      /* 절댓값으로 보낸다. 부호는 서버가 구분을 보고 붙인다 — 머리 주석 참고 */
      const body = {
        academyId,
        year,
        itemName: draft.itemName.trim(),
        point: Math.abs(Number(draft.point)),
        category: draft.category,
      }
      if (draft.id === null) await createPenaltyItem(body)
      else await updatePenaltyItem(draft.id, body)
      setDraft(EMPTY_DRAFT)
      await load()
      bumpItems()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function removeItem(row: PenaltyItemRow) {
    setBusy(true)
    setErr(null)
    try {
      await deletePenaltyItem(row.id)
      if (draft.id === row.id) setDraft(EMPTY_DRAFT)
      await load()
      bumpItems()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleRule(row: PenaltyRuleRow) {
    setBusy(true)
    setErr(null)
    try {
      await setPenaltyRuleActive(row.id, !row.active)
      await load()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function removeRule(row: PenaltyRuleRow) {
    setBusy(true)
    setErr(null)
    try {
      await deletePenaltyRule(row.id)
      await load()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 전년도 항목을 그대로 가져온다.
   *
   * ★ 일괄 API 가 없어 **한 건씩 POST** 한다. 중간에 실패할 수 있으므로 건수를 세어
   *   그대로 알린다 — "몇 개가 됐고 몇 개가 안 됐는지"를 안 알려주면 다시 눌러서
   *   **같은 항목이 두 벌** 생긴다(CLAUDE.md 4).
   * ★ 이름이 겹치는 것은 건너뛴다. 두 번 눌러도 늘어나지 않아야 한다.
   */
  async function copyLastYear() {
    if (academyId === null) return
    setCopyBusy(true)
    setCopyMsg(null)
    try {
      const [prev, now] = await Promise.all([
        listPenaltyItems({ academyId, year: year - 1 }),
        listPenaltyItems({ academyId, year }),
      ])
      const have = new Set(now.map((i) => i.itemName))
      const todo = prev.filter((i) => !have.has(i.itemName))
      if (prev.length === 0) {
        setCopyMsg(`${year - 1}년에 등록된 항목이 없습니다.`)
        return
      }
      if (todo.length === 0) {
        setCopyMsg(`${year - 1}년 항목 ${prev.length}개가 이미 모두 있습니다. 새로 만든 것은 없습니다.`)
        return
      }
      let ok = 0
      const failed: string[] = []
      for (const it of todo) {
        try {
          await createPenaltyItem({
            academyId,
            year,
            itemName: it.itemName,
            point: Math.abs(it.point),
            category: it.category,
          })
          ok += 1
        } catch {
          failed.push(it.itemName)
        }
      }
      setCopyMsg(
        failed.length === 0
          ? `${ok}개를 가져왔습니다. 이미 있던 ${prev.length - todo.length}개는 건너뛰었습니다.`
          : `${todo.length}개 중 ${ok}개만 가져왔습니다. 실패: ${failed.join(' · ')}`,
      )
      bumpItems()
    } catch (e) {
      setCopyMsg(e instanceof ApiError ? e.message : '가져오지 못했습니다.')
    } finally {
      setCopyBusy(false)
    }
  }

  const nameTaken =
    draft.itemName.trim() !== '' &&
    (items ?? []).some((i) => i.itemName === draft.itemName.trim() && i.id !== draft.id)

  return (
    <>
      <button
        className="btn"
        disabled={academyId === null}
        onClick={() => {
          setCopyMsg(null)
          setCopyOpen(true)
        }}
      >
        <Icon name="history" size={14} /> 항목 전년도 복사
      </button>
      <button className="btn" disabled={academyId === null} onClick={openManage}>
        <Icon name="settings" size={14} /> 상벌점 항목 관리
      </button>

      {open && (
        <Modal
          title={`${year}년 상벌점 항목`}
          sub="여기서 등록한 항목으로 점수를 부여합니다."
          hideCancel
          confirmLabel="닫기"
          busy={busy}
          error={err}
          onConfirm={() => setOpen(false)}
          onClose={() => setOpen(false)}
        >
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead>
                <tr>
                  <th>항목</th>
                  <th>구분</th>
                  <th>점수</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items === null && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      불러오는 중…
                    </td>
                  </tr>
                )}
                {items?.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      등록된 항목이 없습니다.
                    </td>
                  </tr>
                )}
                {items?.map((it) => (
                  <tr key={it.id}>
                    <td>{it.itemName}</td>
                    <td>{PENALTY_CATEGORY_LABEL[it.category]}</td>
                    {/* 저장된 부호가 제각각이라 절댓값으로 보여준다 — 머리 주석 참고 */}
                    <td>{Math.abs(it.point)}점</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          setDraft({
                            id: it.id,
                            itemName: it.itemName,
                            point: String(Math.abs(it.point)),
                            category: it.category,
                          })
                        }
                      >
                        수정
                      </button>{' '}
                      <button className="btn" disabled={busy} onClick={() => void removeItem(it)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="frow">
            <label className="req">{draft.id === null ? '새 항목' : '항목 수정'}</label>
            <input
              className="inp"
              placeholder="항목 이름"
              value={draft.itemName}
              onChange={(e) => setDraft({ ...draft, itemName: e.target.value })}
            />
            {nameTaken && <div className="hint bad">같은 이름의 항목이 이미 있습니다.</div>}
          </div>
          <div className="frow">
            <label className="req">구분 · 점수</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                className="sel"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as PenaltyCategory })}
              >
                <option value="DEMERIT">벌점</option>
                <option value="MERIT">상점</option>
              </select>
              <input
                className="inp"
                type="number"
                min={0}
                placeholder="점수"
                value={draft.point}
                onChange={(e) => setDraft({ ...draft, point: e.target.value })}
              />
            </div>
            <div className="hint">점수는 부호 없이 적습니다. 벌점은 깎이는 점수로 들어갑니다.</div>
          </div>
          <div className="frow">
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn pri"
                disabled={busy || nameTaken || draft.itemName.trim() === '' || draft.point.trim() === ''}
                onClick={() => void saveDraft()}
              >
                {draft.id === null ? '추가' : '저장'}
              </button>
              {draft.id !== null && (
                <button className="btn" disabled={busy} onClick={() => setDraft(EMPTY_DRAFT)}>
                  새 항목으로
                </button>
              )}
            </div>
          </div>

          {/* ── 자동 부여 규칙 ── */}
          <div className="frow">
            <label>자동 부여 규칙</label>
            {rules === null || rules.length === 0 ? (
              <div className="hint">등록된 자동 부여 규칙이 없습니다.</div>
            ) : (
              <table className="dt">
                <thead>
                  <tr>
                    <th>상황</th>
                    <th>항목</th>
                    <th>사용</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>{PENALTY_TRIGGER_LABEL[r.triggerType] ?? r.triggerType}</td>
                      <td>
                        {r.itemName} {Math.abs(r.point)}점
                      </td>
                      <td>{r.active ? '켜짐' : '꺼짐'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn" disabled={busy} onClick={() => void toggleRule(r)}>
                          {r.active ? '끄기' : '켜기'}
                        </button>{' '}
                        <button className="btn" disabled={busy} onClick={() => void removeRule(r)}>
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* ⚠️ 규칙을 새로 만드는 칸은 일부러 없다. 어떤 상황 코드가 실제로 걸리는지
                   서버에서 못 받았고, 서버가 값을 검증하지도 않는다 — 틀린 값으로 만들면
                   영영 안 걸리는 규칙이 조용히 쌓인다(api/penalties.ts triggerCondition 주석). */}
            <div className="hint">새 규칙 추가는 준비 중입니다.</div>
          </div>
        </Modal>
      )}

      {copyOpen && (
        <Modal
          title="전년도 항목 가져오기"
          sub={`${year - 1}년 항목을 ${year}년으로 복사합니다.`}
          confirmLabel="가져오기"
          busy={copyBusy}
          onConfirm={() => void copyLastYear()}
          onClose={() => setCopyOpen(false)}
        >
          <div className="frow">
            <div className="hint">
              이름이 같은 항목은 건너뜁니다. 여러 번 눌러도 같은 항목이 두 벌 생기지 않습니다.
            </div>
          </div>
          {copyMsg && (
            <div className="frow">
              <div className="hint">{copyMsg}</div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

export const penaltyMockup: Mockup = {
  Content,
  actions: <PenaltyActions />,
}
