import { useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  Unfilled,
  useServerData,
  type Column,
} from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import {
  LECTURE_STATUS_LABEL,
  LECTURE_STATUS_TONE,
  createLecture,
  listLectures,
  updateLecture,
  type Lecture,
  type LectureType,
} from '../../api/lectures'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.10-4 특강 관리(특강 기초 설정) — GET /api/v1/admin/lectures
 *
 * ⚠ 특강관리(F-4.7)와 역할이 다르다 — 화면을 합치면 안 된다.
 *   · 여기(기초 설정) = 마스터. 무엇을 열 수 있는가
 *   · 특강관리(F-4.7) = 운영. 회차 생성·신청명단·대기자·출석부
 *   ★ 다만 **엔드포인트는 같다.** 서버에 마스터/운영 구분이 따로 없다.
 *
 * ★ 탭(특강/설명회)이 서버 lectureType(LECTURE·BRIEFING)과 1:1로 맞는다. 목업의 유형
 *   컬럼(단과·실전·해설)은 그 아래 세분류인데 **서버에 없다** — API_GAPS 7부.
 *
 * ★ 등록이 2콜이다. POST 는 이름·종류만 받고 정원·비용·기간은 PATCH 로 이어 붙인다.
 *   중간에 실패하면 이름만 있는 특강이 남으므로 화면이 그것을 알려야 한다.
 *
 * ★ 삭제 API가 없다. 상태를 CANCELED 로 바꾸는 것이 서버가 주는 유일한 취소 수단이다.
 */

const PAGE_SIZE = 10

/* 특강 목록 조회.
 * ★ 모듈 최상위에 둔다 — 인라인으로 넘기면 매 렌더 새 참조가 된다.
 *   listLectures 가 위치 인자라 useServerData 가 쓰는 객체 형태로 감싼다. */
const fetchLectures = ({ academyId, year }: { academyId: number; year: number }) =>
  listLectures(academyId, year)

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** 화면의 '월'은 특강 시작일에서 뽑는다. 서버에 월 필드가 따로 없다 */
function monthOf(startDate: string | null): string {
  return startDate === null ? '-' : startDate.slice(0, 7)
}

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState<LectureType>('LECTURE')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // 등록 폼
  const [name, setName] = useState('')
  const [month, setMonth] = useState(thisMonth)
  const [capacity, setCapacity] = useState('30')
  const [fee, setFee] = useState('')

  const year = new Date().getFullYear()

  // ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다
  const params = useMemo(() => ({ academyId: academyId ?? 0, year }), [academyId, year])

  const list = useServerData({
    fetcher: fetchLectures,
    params,
    // academyId·year 가 없으면 서버가 400이 아니라 500을 낸다 — 아예 부르지 않는다
    enabled: academyId !== null,
    errorMessage: '특강 목록을 불러오지 못했습니다.',
  })

  const all = list.data ?? []
  const rows = useMemo(() => all.filter((l) => l.lectureType === tab), [all, tab])
  const countOf = (t: LectureType) => all.filter((l) => l.lectureType === t).length

  const columns: Column<Lecture>[] = useMemo(
    () => [
      {
        key: 'code',
        header: '코드',
        width: '128px',
        value: () => '',
        // 특강 코드가 응답에 없다 (docs/API_GAPS.md 7부)
        render: () => <Unfilled reason="/lectures 응답에 코드 없음" />,
      },
      { key: 'month', header: '월', width: '84px', align: 'center', sortable: true, value: (r) => monthOf(r.startDate) },
      { key: 'name', header: '명칭', sortable: true, value: (r) => r.name },
      {
        key: 'category',
        header: '유형',
        width: '86px',
        align: 'center',
        value: () => '',
        // 서버 유형은 특강/설명회 2종뿐이고 그건 이미 탭이 나눈다.
        // 목업의 단과·실전·해설 세분류는 서버에 없다
        render: () => <Unfilled reason="단과·실전·해설 구분이 서버에 없음" />,
      },
      {
        key: 'teacher',
        header: '담당',
        width: '78px',
        value: () => '',
        render: () => <Unfilled reason="담당 강사 필드 없음" />,
      },
      {
        key: 'capacity',
        header: '정원',
        width: '96px',
        align: 'right',
        sortable: true,
        value: (r) => r.capacity ?? 0,
        // 정원만 보여주면 "얼마나 찼는지"를 알 수 없다. 확정 인원이 같이 오므로 함께 찍는다
        render: (r) =>
          r.capacity === null ? (
            <span style={{ color: 'var(--muted)' }}>-</span>
          ) : (
            <span>
              {r.confirmedCount}/{r.capacity}
              {r.waitlistedCount > 0 && (
                <span style={{ color: 'var(--amber)', fontSize: 11 }} title="대기자">
                  {' '}
                  +{r.waitlistedCount}
                </span>
              )}
            </span>
          ),
      },
      {
        key: 'fee',
        header: '비용',
        width: '96px',
        align: 'right',
        value: (r) => r.fee ?? 0,
        render: (r) =>
          r.fee ? `${r.fee.toLocaleString()}원` : <span style={{ color: 'var(--muted)' }}>무료</span>,
      },
      {
        key: 'status',
        header: '상태',
        width: '96px',
        align: 'center',
        sortable: true,
        value: (r) => LECTURE_STATUS_LABEL[r.status] ?? r.status,
        render: (r, shown) => (
          <span style={{ display: 'inline-flex', gap: 3, justifyContent: 'center' }}>
            <span className={`mk ${LECTURE_STATUS_TONE[r.status] ?? ''}`} title={r.status}>
              {shown}
            </span>
            {/* 노출은 상태와 별개 축이다 — 모집중인데 앱에서 안 보일 수 있다 */}
            {!r.visible && (
              <span className="mk" title="학생 앱에 노출되지 않음">
                숨김
              </span>
            )}
          </span>
        ),
      },
      {
        key: 'act',
        header: '',
        width: '130px',
        align: 'center',
        value: () => '',
        render: () => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled title="배정은 특강 관리(F-4.7)에서 합니다">
              배정
            </button>
            <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled title="수정 폼은 아직 없습니다">
              수정
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
              disabled
              title="삭제 API가 없습니다. 상태를 '취소'로 바꾸는 것이 유일한 방법입니다"
            >
              삭제
            </button>
          </div>
        ),
      },
    ],
    [],
  )

  async function submit() {
    if (academyId === null || name.trim() === '') return
    setSaving(true)
    setMsg(null)

    let created: Lecture | null = null
    try {
      created = await createLecture({ academyId, year, lectureType: tab, name: name.trim() })

      // 2콜째 — POST 가 이름·종류만 받는다
      const patch: Record<string, unknown> = {}
      if (capacity.trim() !== '') patch.capacity = Number(capacity)
      if (fee.trim() !== '') patch.fee = Number(fee)
      if (month) patch.startDate = `${month}-01`
      if (Object.keys(patch).length > 0) await updateLecture(created.id, patch)

      setMsg(`'${name.trim()}' 을(를) 등록했습니다.`)
      setName('')
      setFee('')
      list.reload()
    } catch (err) {
      const reason = err instanceof ApiError ? err.message : '등록에 실패했습니다.'
      // 1콜째가 성공하고 2콜째가 실패하면 이름만 있는 특강이 남는다. 그걸 숨기면 안 된다
      setMsg(
        created === null
          ? reason
          : `${reason} — 이름만 등록된 특강이 목록에 남았습니다. 정원·비용은 다시 설정해야 합니다.`,
      )
      if (created !== null) list.reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {academyId === null && (
        <div className="note-box">지점을 먼저 선택하세요. 특강은 지점 단위로 관리합니다.</div>
      )}

      {list.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {list.error}
        </div>
      )}

      {msg && <div className="note-box">{msg}</div>}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'LECTURE', label: '특강 기초 설정', count: countOf('LECTURE') },
            { key: 'BRIEFING', label: '설명회', count: countOf('BRIEFING') },
          ]}
          active={tab}
          onChange={(k) => setTab(k as LectureType)}
        />
        <div style={{ padding: 14 }}>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => String(r.id)}
            masked={false}
            loading={list.loading}
            pageSize={PAGE_SIZE}
            countLabel={
              <>
                {year}년 {tab === 'LECTURE' ? '특강' : '설명회'} <b>{rows.length}</b>건
              </>
            }
            toolbar={
              <ExcelButton
                filename={tab === 'LECTURE' ? '특강_기초설정' : '설명회_목록'}
                columns={columns}
                rows={rows}
                masked={false}
              />
            }
          />
        </div>
      </div>

      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="plus" size={15} />
            </span>
            {tab === 'LECTURE' ? '특강' : '설명회'} 등록
          </div>
        </div>
        <div className="card-sec-b">
          <div className="split">
            <div>
              <div className="frow">
                <label className="req">명칭</label>
                <input
                  className="inp"
                  placeholder={tab === 'LECTURE' ? '수학 미적 킬러문항 특강' : '2027학년도 입학 설명회'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="frow">
                <label className="req">개설 월</label>
                <input className="inp" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
              <div className="frow">
                <label>담당</label>
                <Unfilled reason="담당 강사 필드가 서버에 없음" />
              </div>
            </div>
            <div>
              <div className="frow">
                <label>정원</label>
                <input
                  className="inp"
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </div>
              <div className="frow">
                <label>비용</label>
                <input
                  className="inp"
                  type="number"
                  placeholder="비우면 무료"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </div>
              <div className="frow">
                <label>강의실</label>
                <Unfilled reason="강의실 마스터가 아직 없음" />
              </div>
              <div className="frow">
                <label>&nbsp;</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="btn pri"
                    disabled={saving || academyId === null || name.trim() === ''}
                    onClick={() => void submit()}
                  >
                    <Icon name="save" size={14} /> {saving ? '등록 중…' : '등록'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setName('')
                      setFee('')
                      setCapacity('30')
                      setMonth(thisMonth())
                    }}
                  >
                    초기화
                  </button>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    등록 직후 상태는 <b>준비</b>입니다. 모집은 목록에서 상태를 바꿔 시작합니다.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export const adminLectureMockup: Mockup = {
  Content,
  // 목업의 시즌 표시를 유지한다. actions 는 상태를 못 가져 고를 수는 없고,
  // 하드코딩이 굳지 않도록 연도만 실제 값으로 찍는다 — 조회도 같은 연도를 쓴다
  actions: <button className="btn" disabled>{new Date().getFullYear()} 시즌</button>,
}
