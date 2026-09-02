import { useEffect, useMemo, useState } from 'react'
import {
  CopyButton,
  DataTable,
  ExcelButton,
  MaskToggle,
  PrintButton,
  SearchForm,
  Unfilled,
  useServerTable,
  type Column,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { listClasses, type ClassGroup } from '../../api/classes'
import {
  GRADE_LABEL,
  SORTABLE,
  STATUS_LABEL,
  TRACK_LABEL,
  searchStudents,
  type EnrollmentStatus,
  type Student,
  type TrackType,
} from '../../api/students'
import type { Mockup } from './types'

/* F-4.9 교무업무 — 명단 조회·출력 — GET /api/v1/admin/students
 *
 * 학원생 검색(F-4.1-1)과 같은 엔드포인트를 쓰고 컬럼 구성만 다르다.
 * 탭 3개가 같은 조회 결과에 컬럼 세트만 갈아끼우는 구조라 요청은 한 번뿐이다.
 *
 * ⚠ #21 / I-1 (최우선) — 교무업무 '구분 항목' 재정의.
 *   DSA 화면에 (!!) 로 표기돼 있던 항목이고, 실행가이드 4시트가
 *   "I-1은 우회 불가(운영팀 확정 필수)"로 분류한 유일한 항목이다.
 *   → 값을 지어내지 않고 미정 상태로 렌더한다.
 *
 * ★ 서버가 안 주는 컬럼은 지우지 않고 <Unfilled/> 로 둔다(CLAUDE.md 1).
 *   청구기수 · 학부모 연락처 · 재수 구분 3개가 그렇다 — docs/API_GAPS.md 2-2 참고.
 *
 * ★ 장학생 탭은 서버 필터가 없다. 지금은 **받아온 페이지 안에서만** 걸러지므로
 *   건수가 전체 기준이 아니다. 화면에 그 사실을 표시해뒀다. */

const PAGE_SIZE = 20

function one(v: unknown): string | undefined {
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : undefined
  if (typeof v === 'string' && v !== '') return v
  return undefined
}

const sortableKey = (key: string): boolean => (SORTABLE as readonly string[]).includes(key)

/* ── 컬럼 세트 ─────────────────────────────────────────────── */

/** 구분 컬럼 — I-1 확정 전까지 값을 채우지 않는다 */
const UNDEFINED_COL: Column<Student> = {
  key: 'gubun',
  header: (
    <span title="항목 정의 준비 중" style={{ color: 'var(--amber)' }}>
      구분 <Icon name="triangle-alert" size={11} />
    </span>
  ),
  width: '92px',
  align: 'center',
  value: () => '',
  render: () => (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--amber)',
        background: 'var(--amber-wash)',
        padding: '2px 8px',
        borderRadius: 5,
      }}
      title="항목 정의 준비 중"
    >
      미정
    </span>
  ),
}

const BASE: Column<Student>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: sortableKey('studentNo'), value: (r) => r.studentNo ?? '-' },
  { key: 'name', header: '성명', width: '84px', sortable: sortableKey('name'), mask: 'name', value: (r) => r.name },
  {
    key: 'round',
    header: '청구기수',
    width: '76px',
    align: 'center',
    value: () => '',
    render: () => <Unfilled reason="학생 응답에 청구기수가 없다" />,
  },
  { key: 'className', header: '반', width: '56px', align: 'center', value: (r) => r.className ?? '-' },
  { key: 'track', header: '계열', width: '60px', align: 'center', sortable: sortableKey('track'), value: (r) => (r.track ? TRACK_LABEL[r.track] : '-') },
]

/** 수강생 대장 — DSA 실사: 성명/과정/주소/전화번호 + Copy/Excel/Print */
const ROSTER_COLUMNS: Column<Student>[] = [
  ...BASE,
  UNDEFINED_COL,
  { key: 'schoolName', header: '출신학교', width: '92px', value: (r) => r.schoolName ?? '-' },
  { key: 'address', header: '주소', mask: 'address', value: (r) => r.address ?? '-' },
  { key: 'phone', header: '학생 연락처', width: '128px', mask: 'phone', value: (r) => r.phone ?? '-' },
  {
    key: 'parentPhone',
    header: '학부모 연락처',
    width: '128px',
    value: () => '',
    render: () => <Unfilled reason="보호자 연락처가 학생 응답에 없다" />,
  },
]

/** 직반 명단 */
const CLASS_COLUMNS: Column<Student>[] = [
  ...BASE,
  { key: 'homeroomTeacher', header: '담임', width: '78px', value: (r) => r.homeroomTeacher ?? '-' },
  { key: 'seatCd', header: '좌석', width: '68px', align: 'center', value: (r) => r.seatCd ?? '-' },
  {
    key: 'repeat',
    header: '재수 구분',
    width: '80px',
    align: 'center',
    value: () => '',
    // grade 가 N_SU 까지라 재수/삼수/N수가 안 갈린다 — 모델 결정 사항
    render: (r) => <Unfilled reason={`재수 구분이 없다 (현재 학년: ${GRADE_LABEL[r.grade] ?? r.grade})`} />,
  },
  { key: 'admissionDate', header: '등원일', width: '100px', sortable: sortableKey('admissionDate'), value: (r) => r.admissionDate ?? '-' },
]

/** 장학생 명단 */
const SCHOLAR_COLUMNS: Column<Student>[] = [
  ...BASE,
  {
    key: 'scholarship',
    header: '장학 유형',
    width: '96px',
    align: 'center',
    value: (r) => r.scholarshipTypes.join(', '),
    render: (r) =>
      r.scholarshipTypes.length > 0 ? (
        <span className="mk verified">{r.scholarshipTypes.join(', ')}</span>
      ) : (
        '-'
      ),
  },
  { key: 'schoolName', header: '출신학교', width: '92px', value: (r) => r.schoolName ?? '-' },
  { key: 'phone', header: '연락처', width: '128px', mask: 'phone', value: (r) => r.phone ?? '-' },
]

const TABS = [
  { key: 'roster', label: '수강생 대장' },
  { key: 'class', label: '직반 명단' },
  { key: 'scholar', label: '장학생 명단' },
]

function Content() {
  const [tab, setTab] = useState('roster')
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)
  const [classes, setClasses] = useState<ClassGroup[]>([])

  // 반 드롭다운. 실패해도 화면은 살려둔다 — 나머지 조건으로는 조회할 수 있다
  useEffect(() => {
    let cancelled = false
    listClasses()
      .then((list) => !cancelled && setClasses(list))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const fields = useMemo<Field[]>(
    () => [
      { type: 'text', name: 'keyword', label: '이름 · 학번', placeholder: '예: 임민주', span: 2 },
      {
        type: 'select',
        name: 'classId',
        label: '반',
        options: classes.map((c) => ({ value: String(c.id), label: c.name })),
      },
      {
        type: 'select',
        name: 'track',
        label: '계열',
        options: (['SCIENCE', 'HUMANITIES', 'ART', 'COMMON'] as TrackType[]).map((v) => ({ value: v, label: TRACK_LABEL[v] })),
      },
      {
        type: 'select',
        name: 'status',
        label: '상태',
        options: (['ENROLLED', 'LEAVE', 'WITHDRAWN', 'EXPELLED', 'GRADUATED'] as EnrollmentStatus[]).map((v) => ({
          value: v,
          label: STATUS_LABEL[v],
        })),
      },
      { type: 'text', name: 'schoolName', label: '출신학교', placeholder: '예: 분당고' },
    ],
    [classes],
  )

  const params = useMemo(() => {
    const classId = one(query.classId)
    return {
      keyword: one(query.keyword),
      classId: classId ? Number(classId) : undefined,
      track: one(query.track) as TrackType | undefined,
      status: one(query.status) as EnrollmentStatus | undefined,
      schoolName: one(query.schoolName),
    }
  }, [query])

  const table = useServerTable({
    fetcher: searchStudents,
    params,
    pageSize: PAGE_SIZE,
    sortable: SORTABLE,
  })

  // 장학생 탭에는 서버 필터가 없다. 받아온 페이지 안에서만 거른다 —
  // 전체 장학생 목록이 아니므로 건수 표기에 그 사실을 남긴다.
  const scholarOnly = tab === 'scholar'
  const rows = useMemo(
    () => (scholarOnly ? table.rows.filter((r) => r.scholarshipTypes.length > 0) : table.rows),
    [table.rows, scholarOnly],
  )

  const columns = tab === 'roster' ? ROSTER_COLUMNS : tab === 'class' ? CLASS_COLUMNS : SCHOLAR_COLUMNS
  const label = TABS.find((t) => t.key === tab)!.label

  const serverMasked = table.rows.some((r) => r.masked)
  const effectiveMasked = serverMasked ? false : masked

  return (
    <>
      <SearchForm fields={fields} onSearch={setQuery} presetKey="affairs" />

      {table.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {table.error}
        </div>
      )}

      <div className="card-sec">
        <Tabs items={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={setTab} />
        <div style={{ padding: 14 }}>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => String(r.enrollmentId)}
            masked={effectiveMasked}
            loading={table.loading}
            // 장학생 탭은 페이지 안에서 걸러내 행 수가 달라지므로 서버 페이징 UI를 그대로 쓰면
            // "20건씩"과 실제 표시 건수가 어긋난다. 그래도 페이지 이동은 있어야 해서 그대로 둔다.
            serverPaging={table.serverPaging}
            countLabel={
              scholarOnly ? (
                <>
                  {label} — 이 페이지 <b>{rows.length}</b>명{' '}
                  <span style={{ color: 'var(--amber)' }} title="서버에 장학생 필터가 없어 전체 집계가 아니다">
                    (전체 아님)
                  </span>
                </>
              ) : (
                <>
                  {label} <b>{table.totalElements}</b>명
                </>
              )
            }
            toolbar={
              <>
                {serverMasked ? (
                  <span className="dt-count" style={{ color: 'var(--muted)' }}>
                    권한상 마스킹됨
                  </span>
                ) : (
                  <MaskToggle masked={masked} onChange={setMasked} />
                )}
                <CopyButton columns={columns} rows={rows} masked={effectiveMasked} />
                <ExcelButton filename={label} columns={columns} rows={rows} masked={effectiveMasked} />
                <PrintButton />
              </>
            }
          />
        </div>
      </div>
    </>
  )
}

export const affairsMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
    </>
  ),
}
