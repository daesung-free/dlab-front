import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { listLectureCategories, type LectureCategory } from '../../api/lectureCategories'
import { useAcademy } from '../../auth/AcademyContext'
import {
  LECTURE_STATUS_LABEL,
  LECTURE_STATUS_TONE,
  changeLectureStatus,
  createLecture,
  updateLecture,
  listLectures,
  setLectureVisible,
  type Lecture,
  type LectureStatus,
} from '../../api/lectures'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.10-4 특강 관리(특강 기초 설정) — 신규개발-요구사항검증됨
 * DSA '관리자>특강관리>특강 관리'에서 상태별 필터·특강목록·등록/배정/수정/삭제 확인.
 * '설명회 신청 항목'은 별도 추가 개발이 필요할 수 있어 확인 대상.
 *
 * ⚠ 특강관리(F-4.7)와 역할이 다르다 — 화면을 합치면 안 된다.
 *   · 여기(기초 설정) = 마스터. 특강 유형·설명회 항목·기본 정원/특강비 템플릿
 *   · 특강관리(F-4.7) = 운영. 실제 특강 개설(회차 생성)·신청명단·대기자·출석부
 *   개설 폼은 F-4.7에 있고, 여기서는 개설할 때 고를 수 있는 선택지를 관리한다.
 *
 * ── 연동 범위 ──────────────────────────────────────────────
 * ★ 축이 둘이다. `lectureType`(LECTURE·BRIEFING)은 특강이냐 설명회냐이고, 그 안의
 *   **세부 유형(단과·실전·해설)은 /lecture-categories 마스터**다. 세부 유형은
 *   **특강에만 붙는다** — 설명회 탭에서는 감춘다.
 *   유형 목록 자체는 기초 관리(F-4.10-1)의 '특강 유형' 탭에서 관리한다.
 *
 * ★ 이 화면은 개설된 특강·설명회를 종류별로 보여주고 접수·노출을 여닫는 역할이다.
 *   명단·회차·출석부는 F-4.7 이 맡는다 — 겹치지 않는다.
 *
 * ★ **접수 상태와 앱 노출은 별개 축이다.** 접수를 열어도(OPEN) 노출을 안 켜면
 *   앱에 안 보인다 — "왜 신청이 안 들어오지"의 흔한 원인이라 두 축을 따로 보여준다. */

const MONTH_OF = (l: Lecture): string => (l.startDate ? l.startDate.slice(0, 7) : '-')

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('lecture')
  const [year, setYear] = useState(new Date().getFullYear())
  const [all, setAll] = useState<Lecture[]>([])
  const [categories, setCategories] = useState<LectureCategory[]>([])
  /** 등록 폼에서 고른 세부 유형. 특강에만 쓴다 */
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    if (academyId === null) {
      setAll([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [lectures, cats] = await Promise.all([
        listLectures(academyId, year),
        // 드롭다운은 사용 중인 것만. academyId 를 같이 안 보내면 400이다
        listLectureCategories({ academyId, year, activeOnly: true }),
      ])
      setAll(lectures)
      setCategories(cats)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '목록을 불러오지 못했습니다.')
      setAll([])
    } finally {
      setLoading(false)
    }
  }, [academyId, year])

  useEffect(() => {
    void load()
  }, [load])

  const wantType = tab === 'lecture' ? 'LECTURE' : 'BRIEFING'
  const rows = useMemo(() => all.filter((l) => l.lectureType === wantType), [all, wantType])
  const hidden = rows.filter((l) => !l.visible && l.status === 'OPEN')

  /**
   * 동작 하나를 돌리고 결과를 알린다.
   *
   * ★ `done`·`failed` 를 **완성된 문장으로** 받는다. 예전에는 어간('접수를 열')을 받아
   *   뒤에 '했습니다'를 붙였는데, 한국어는 그렇게 이어지지 않는다 —
   *   "접수를 열 했습니다" · "최신 버전을 바꾸 했습니다" 가 그대로 화면에 나갔다.
   */
  async function run(done: string, failed: string, fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      setNotice(done)
      await load()
    } catch (err) {
      setNotice(err instanceof ApiError ? `${failed} — ${err.message}` : failed)
    } finally {
      setBusy(false)
    }
  }

  function add() {
    if (academyId === null) {
      setNotice('먼저 지점을 고르세요.')
      return
    }
    if (name.trim() === '') return
    // 만들 때 정하는 건 이름과 종류뿐이다. 정원·기간·비용은 F-4.7 개설 폼에서 채운다
    const kind = tab === 'lecture' ? '특강' : '설명회'
    void run(`${kind}을 등록했습니다.`, `${kind}을 등록하지 못했습니다.`, async () => {
      const created = await createLecture({ academyId, year, lectureType: wantType, name: name.trim() })
      // ★ POST 는 이름·종류만 받는다. 유형은 PATCH 로 이어 붙여야 해서 등록이 2콜이다
      if (wantType === 'LECTURE' && categoryId !== '') {
        await updateLecture(created.id, { categoryId: Number(categoryId) })
      }
      setName('')
      setCategoryId('')
    })
  }

  const COLUMNS: Column<Lecture>[] = useMemo(
    () => [
      {
        key: 'code',
        header: '코드',
        width: '96px',
        align: 'center',
        sortable: true,
        // 서버가 채번하지 않는다 — 수정에서 넣기 전까지 비어 있다
        value: (r) => r.code ?? '',
        render: (_r, shown) =>
          shown ? <code style={{ fontSize: 11 }}>{shown}</code> : <span style={{ color: 'var(--muted)' }}>-</span>,
      },
      { key: 'month', header: '개설 월', width: '92px', align: 'center', sortable: true, value: MONTH_OF },
      { key: 'name', header: '명칭', sortable: true, value: (r) => r.name },
      // 세부 유형은 특강에만 붙는다 — 설명회 탭에서는 컬럼 자체를 안 그린다
      ...(wantType === 'LECTURE'
        ? [
            {
              key: 'categoryName',
              header: '유형',
              width: '92px',
              align: 'center' as const,
              sortable: true,
              value: (r: Lecture) => r.categoryName ?? '',
              render: (r: Lecture) =>
                r.categoryName ? (
                  <span className="mk supplement">{r.categoryName}</span>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>-</span>
                ),
            },
          ]
        : []),
      {
        key: 'teacher',
        header: '담당',
        width: '90px',
        value: (r) => r.teacherName ?? '',
        render: (r) => r.teacherName ?? '미지정',
      },
      {
        key: 'capacity',
        header: '정원',
        width: '92px',
        align: 'center',
        sortable: true,
        value: (r) => r.capacity ?? 0,
        render: (r) => (r.capacity == null ? '-' : `${r.confirmedCount}/${r.capacity}`),
      },
      {
        key: 'fee',
        header: '비용',
        width: '110px',
        align: 'right',
        sortable: true,
        value: (r) => r.fee ?? 0,
        render: (r) => (r.fee == null ? '-' : r.fee === 0 ? '무료' : `${r.fee.toLocaleString()}원`),
      },
      {
        key: 'status',
        header: '접수',
        width: '86px',
        align: 'center',
        sortable: true,
        value: (r) => LECTURE_STATUS_LABEL[r.status] ?? r.status,
        render: (r) => (
          <span className={`mk ${LECTURE_STATUS_TONE[r.status] ?? 'supplement'}`}>
            {LECTURE_STATUS_LABEL[r.status] ?? r.status}
          </span>
        ),
      },
      {
        key: 'visible',
        header: '앱 노출',
        width: '86px',
        align: 'center',
        sortable: true,
        // 접수 상태와 별개 축이다. 열려 있어도 노출을 안 켜면 앱에 안 보인다
        value: (r) => (r.visible ? '노출' : '숨김'),
        render: (r) =>
          r.visible ? (
            <span className="mk verified">노출</span>
          ) : (
            <span className="mk brandnew" title="앱에서 보이지 않습니다">
              숨김
            </span>
          ),
      },
      {
        key: 'act',
        header: '',
        width: '160px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy}
              onClick={() =>
                  void run(
                    r.visible ? '앱에서 숨겼습니다.' : '앱에 노출했습니다.',
                    r.visible ? '숨기지 못했습니다.' : '노출하지 못했습니다.',
                    () => setLectureVisible(r.id, !r.visible),
                  )
                }
            >
              {r.visible ? '숨기기' : '노출'}
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={busy}
              onClick={() => {
                const next: LectureStatus = r.status === 'OPEN' ? 'CLOSED' : 'OPEN'
                // 닫아도 이미 신청한 건은 그대로 남는다 — 상태는 "지금 받는가"다
                void run(
                  next === 'OPEN' ? '접수를 열었습니다.' : '접수를 닫았습니다.',
                  next === 'OPEN' ? '접수를 열지 못했습니다.' : '접수를 닫지 못했습니다.',
                  () => changeLectureStatus(r.id, next),
                )
              }}
            >
              {r.status === 'OPEN' ? '접수 닫기' : '접수 열기'}
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, wantType],
  )

  return (
    <>
      {/* 접수만 열고 노출을 안 켜면 앱에 안 뜬다. 신청이 안 들어오는 흔한 원인이다 */}
      {hidden.length > 0 && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--amber)' }}>
          <div className="ic">
            <Icon name="triangle-alert" size={17} />
          </div>
          <div>
            <div className="tt">접수는 열려 있는데 앱에 안 보이는 것이 {hidden.length}건 있습니다</div>
            <div className="tx">
              접수를 여는 것과 앱에 띄우는 것은 별개입니다. <b>노출</b>을 켜야 학생 앱에서 보이고 신청이 들어옵니다.
              — {hidden.map((l) => l.name).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {academyId === null && (
        <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
          위에서 지점을 먼저 고르세요.
        </div>
      )}
      {loadError && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {loadError}
        </div>
      )}
      {notice && (
        <div className="note-box" role="status" style={{ borderColor: 'var(--violet)' }}>
          {notice}
        </div>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'lecture', label: '특강 기초 설정', count: all.filter((l) => l.lectureType === 'LECTURE').length },
            { key: 'briefing', label: '설명회', count: all.filter((l) => l.lectureType === 'BRIEFING').length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div style={{ padding: 14 }}>
          {/* 단과·실전·해설 구분이 서버에 없다는 걸 먼저 밝힌다 */}
          <div className="note-box">
            <div className="ic">
              <Icon name="info" size={17} />
            </div>
            <div>
              <div className="tt">여기서 정하는 것은 이름 · 종류 · 유형까지입니다</div>
              <div className="tx">
                단과·실전·해설 같은 <b>세부 유형</b>은 <b>기초 관리 &gt; 특강 유형</b>에서 만들어 두면
                위 드롭다운에 나옵니다. 설명회에는 붙지 않습니다.
                <br />
                정원·기간·비용·회차는 <b>특강 관리</b> 화면에서 채웁니다. <b>회차를 만들지 않으면 출석부가
                비어 있고 신청도 받을 수 없습니다.</b>
              </div>
            </div>
          </div>

          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => String(r.id)}
            masked={false}
            loading={loading}
            pageSize={10}
            countLabel={
              <>
                {tab === 'lecture' ? '특강' : '설명회'} <b>{rows.length}</b>건 · {year}년
              </>
            }
            toolbar={
              <>
                <ExcelButton
                  filename={tab === 'lecture' ? '특강_기초설정' : '설명회_목록'}
                  columns={COLUMNS}
                  rows={rows}
                  masked={false}
                />
                <select className="sel" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 106 }}>
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y} value={y}>
                      {y} 시즌
                    </option>
                  ))}
                </select>
              </>
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
            {tab === 'lecture' ? '특강' : '설명회'} 등록
          </div>
        </div>
        <div className="card-sec-b">
          {/* 세부 유형은 특강에만 붙는다. 설명회 탭에서는 아예 안 보여준다 */}
          {tab === 'lecture' && (
            <div className="frow">
              <label>유형</label>
              {categories.length === 0 ? (
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  등록된 유형이 없습니다 — 기초 관리 &gt; 특강 유형에서 먼저 만드세요.
                </span>
              ) : (
                <select className="sel" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">선택 안 함</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.nationwide ? ' (전 지점)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="frow">
            <label className="req">명칭</label>
            <input
              className="inp"
              placeholder={tab === 'lecture' ? '수학 미적 킬러문항 특강' : '2027학년도 입학 설명회'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="frow">
            <label>&nbsp;</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn pri" disabled={busy || academyId === null || name.trim() === ''} onClick={add}>
                <Icon name="save" size={14} /> 등록
              </button>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                등록하면 접수는 닫힌 상태로 만들어집니다. 정원·기간·비용·회차는 특강 관리에서 채우세요.
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export const adminLectureMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled title="준비 중입니다">기수 선택 ▾</button>
    </>
  ),
}
