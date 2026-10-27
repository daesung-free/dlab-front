import { useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  MaskToggle,
  SearchForm,
  useServerData,
  addDaysStr,
  todayStr,
  type Column,
  type Field,
  type SearchValues,
} from '../../components/common'
import { useAcademy } from '../../auth/AcademyContext'
import {
  listEmergencyAccess,
  listEmergencyResults,
  type EmergencyAccessRow as Row,
  type EmergencyResultCode,
} from '../../api/emergencyAccess'
import type { Mockup } from './types'

/* 긴급 출입 요청 내역 (추가개발 10번)
 *
 * 연동(2026-10-12) — GET /api/v1/admin/emergency-access. src/api/emergencyAccess.ts 참고.
 *   학생이 아침에 출입문 QR 로 번호를 요청한 기록이다.
 *
 * ★ **사유 목록을 서버에서 받는다**(`/results`). 화면에 코드 이름을 박지 않는다 —
 *   실제로 6종에서 7종으로 늘었다(`RATE_LIMITED` 추가). 박아 뒀으면 그날 필터가 깨진다.
 *
 * ★ **거절 건은 학생 칸이 빈다.** 못 찾아서 거절한 것이라 이름도 학번도 없다 —
 *   그 자리에 입력한 번호(`phoneMasked`)를 보여준다. 이름 칸에 번호가 들어가면
 *   표가 읽히지 않으므로 **무엇을 보여주는지 칸 안에서 밝힌다.**
 *
 * ★ **「지점 조치 필요」를 색으로 가른다**(`needsBranchAction`). 「지점에 등록된 번호 없음」은
 *   학생이 아니라 **지점 관리자가 조치할 일**이다 — 다른 거절과 같은 모양이면 담당자가
 *   학생을 붙잡고 묻게 된다.
 *
 * ★ `RATE_LIMITED`(시도 횟수 초과)는 **막은 시도**다. 남기지 않으면 번호를 두드린 일이
 *   있었다는 사실 자체가 안 보인다 — 그래서 거절 사유로 함께 쌓인다.
 */

function dateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* 다른 목록 화면과 같은 검색 틀. 사유 선택지는 서버에서 받아 넣는다 */
const DEFAULT_RANGE: SearchValues = { date: { from: addDaysStr(todayStr(), -14), to: todayStr() } }

function Content() {
  const { academyId } = useAcademy()
  const [query, setQuery] = useState<SearchValues>(DEFAULT_RANGE)
  const result = typeof query.result === 'string' ? query.result : ''
  /* 마스킹은 **기본 켜짐**이다(DataTable 기본값). 토글을 안 주면 영영 가려진 채라
     담당자가 누구 건인지 못 본다 — 마스킹을 쓰는 다른 화면도 전부 토글을 같이 준다 */
  const [masked, setMasked] = useState(true)

  const params = useMemo(() => {
    const d = query.date as { from?: string; to?: string } | undefined
    return { from: d?.from || addDaysStr(todayStr(), -14), to: d?.to || todayStr(), academyId }
  }, [query, academyId])
  /* ★ **지점을 고르기 전에는 부르지 않는다.** 전 지점 권한 계정이 `academyId` 없이 부르면
     서버가 400 을 준다 — 화면을 열 때마다 4xx 가 쌓이고, 사용자에게는 **빈 화면에 오류 배너**만
     보인다. 지점을 고르면 그때 읽는다(CLAUDE.md 4 — `enabled: false` 로 막는다) */
  const list = useServerData({
    fetcher: listEmergencyAccess,
    params,
    enabled: academyId !== null,
    errorMessage: '요청 내역을 불러오지 못했습니다.',
  })

  /* 사유 목록은 바뀌는 값이 아니라 한 번만 읽는다 */
  const [codes, setCodes] = useState<EmergencyResultCode[]>([])
  useEffect(() => {
    let alive = true
    listEmergencyResults()
      .then((c) => alive && setCodes(c))
      .catch(() => alive && setCodes([]))
    return () => {
      alive = false
    }
  }, [])

  const fields: Field[] = useMemo(
    () => [
      { type: 'dateRange', name: 'date', label: '조회 기간', presets: true, span: 2 },
      {
        type: 'select',
        name: 'result',
        label: '결과',
        /* ★ 선택지를 서버에서 받는다 — 사유가 6종에서 7종으로 늘었는데 화면을 안 고쳤다 */
        options: [{ value: '', label: '전체' }, ...codes.map((c) => ({ value: c.code, label: c.label }))],
        span: 2,
      },
    ],
    [codes],
  )

  const rows = useMemo(() => {
    const all = list.data ?? []
    return result ? all.filter((r) => r.result === result) : all
  }, [list.data, result])

  const branchAction = useMemo(() => rows.filter((r) => r.needsBranchAction).length, [rows])

  const cols: Column<Row>[] = useMemo(
    () => [
      { key: 'requestedAt', header: '요청 시각', width: '160px', sortable: true, value: (r) => dateTime(r.requestedAt) },
      { key: 'academyName', header: '지점', width: '90px', value: (r) => r.academyName ?? '-' },
      /* ★ 학번은 **따로 칸을 둔다** — 다른 목록 화면이 전부 그렇다(상벌점·사유신청).
            이름 옆에 배지로 붙이면 글자 크기가 달라 표가 들쭉날쭉해진다 */
      { key: 'studentNo', header: '학번', width: '110px', value: (r) => r.studentNo ?? '-' },
      {
        key: 'student',
        header: '학생',
        width: '170px',
        mask: 'name',
        value: (r) => r.studentName ?? r.phoneMasked ?? '-',
        /* ★ 못 찾은 거절 건은 이름이 없다 — 입력한 번호를 대신 쓰되 **같은 글자 크기**로 둔다.
              배지로 감싸면 그 줄만 작아져 표가 읽히지 않는다.
           ★ `shown` 을 쓴다 — 직접 `r.studentName` 을 그리면 **마스킹이 조용히 무시된다**
              (render 가 셀을 통째로 대신 그리기 때문이다). 실제로 그래서 이름이 그대로 보였다 */
        render: (r, shown) =>
          r.studentName ? shown : <span style={{ color: 'var(--muted)' }}>{r.phoneMasked ?? '-'}</span>,
      },
      {
        key: 'requesterIp',
        header: '접속 IP',
        width: '150px',
        /* ★ 제공 건에는 안 온다. 같은 IP 가 연달아 거절된 것이 보여야
              대입 시도와 단순 실수가 갈린다 */
        value: (r) => r.requesterIp ?? '-',
        render: (r) =>
          r.requesterIp ? <span style={{ color: 'var(--muted)' }}>{r.requesterIp}</span> : '-',
      },
      {
        key: 'resultLabel',
        header: '결과',
        width: '220px',
        value: (r) => r.resultLabel ?? r.result,
        render: (r) => (
          <span
            className={`mk ${r.result === 'PROVIDED' ? 'verified' : r.needsBranchAction ? 'supplement' : 'brandnew'}`}
          >
            {r.resultLabel ?? r.result}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <>
      <div className="note-box">
        <div>
          학생이 아침에 출입문 QR 로 비밀번호를 요청한 기록입니다. <b>오전 7시부터 8시 사이</b>에만
          번호가 안내되고, 그 밖의 시간이나 확인되지 않는 번호는 거절로 남습니다.
        </div>
      </div>

      {branchAction > 0 && (
        <div className="note-box" style={{ borderColor: 'var(--rose)' }} role="status">
          <div>
            <b>{branchAction}건</b>은 그 지점에 등록된 번호가 없어 학생이 못 들어갔습니다. 도어락 번호
            화면에서 번호를 먼저 넣어 주세요.
          </div>
        </div>
      )}

      <SearchForm fields={fields} initial={DEFAULT_RANGE} onSearch={setQuery} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 8px' }}>
        <MaskToggle masked={masked} onChange={setMasked} />
      </div>

      {list.error && (
        <div className="note-box" style={{ borderColor: 'var(--rose)' }} role="status">
          <div>{list.error}</div>
        </div>
      )}

      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(r) => String(r.id)}
        masked={masked}
        loading={list.loading}
        pageSize={20}
        /* ★ 지점을 고르기 전에는 **아직 안 읽은 것**이지 「요청이 없는」 것이 아니다 —
           그렇게 사용하면 담당자가 그날 요청이 없었다고 읽는다 */
        emptyText={academyId === null ? '지점을 먼저 선택해 주세요.' : '그 기간에 요청이 없습니다.'}
      />
    </>
  )
}

export const emergencyAccessMockup: Mockup = { Content }
