import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'

/* F-4.10-6 실적 관리(실적 입력) — 신규개발-요구사항검증됨
 * DSA '실적>실적 입력(부산기숙)'에서 연도/시험선택·실적목록·수정 확인.
 * 실적 통계(집계) 화면은 별도 확인 필요.
 *
 * ▷[0723] 목표 계열 명칭·순서 표준화 (#42 / I-22):
 *   ①메디컬 ②서울 최상위 ③서울 지거국 ④수도권 ⑤지방 4년제 — 마스터로 관리 */

const TRACKS = ['메디컬', '서울 최상위', '서울 지거국', '수도권', '지방 4년제'] as const
type TrackName = (typeof TRACKS)[number]

const TRACK_COLOR: Record<TrackName, string> = {
  메디컬: 'var(--red)',
  '서울 최상위': 'var(--violet)',
  '서울 지거국': 'var(--blue)',
  수도권: 'var(--mint)',
  '지방 4년제': 'var(--muted)',
}

const UNIVERSITIES: Record<TrackName, string[]> = {
  메디컬: ['서울대 의예', '연세대 치의예', '경희대 한의예', '충남대 수의예'],
  '서울 최상위': ['서울대 경영', '연세대 전기전자', '고려대 반도체공', '서강대 컴퓨터'],
  '서울 지거국': ['서울시립대 행정', '서울과기대 기계'],
  수도권: ['인하대 전자', '아주대 소프트웨어', '경기대 경영'],
  '지방 4년제': ['부산대 기계', '경북대 전자', '전남대 경영'],
}

interface ResultRow {
  id: string
  year: string
  studentNo: string
  name: string
  classNo: string
  track: TrackName
  university: string
  admissionType: '수시' | '정시'
  confirmed: boolean
}

const ROWS: ResultRow[] = MOCK_STUDENTS.slice(0, 38).map((s, i) => {
  const track = TRACKS[i % TRACKS.length]
  const unis = UNIVERSITIES[track]
  return {
    id: `rs-${i + 1}`,
    year: i % 6 === 5 ? '2025' : '2026',
    studentNo: s.studentNo,
    name: s.name,
    classNo: s.classNo,
    track,
    university: unis[i % unis.length],
    admissionType: i % 3 === 0 ? '수시' : '정시',
    confirmed: i % 9 !== 8,
  }
})

const COLUMNS: Column<ResultRow>[] = [
  { key: 'year', header: '연도', width: '72px', align: 'center', sortable: true, value: (r) => r.year },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  {
    key: 'track',
    header: '계열',
    width: '116px',
    align: 'center',
    sortable: true,
    value: (r) => TRACKS.indexOf(r.track),
    render: (r) => (
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          padding: '2px 8px',
          borderRadius: 6,
          color: '#fff',
          background: TRACK_COLOR[r.track],
          whiteSpace: 'nowrap',
        }}
      >
        {r.track}
      </span>
    ),
  },
  { key: 'university', header: '합격 대학·학과', sortable: true, value: (r) => r.university },
  {
    key: 'admissionType',
    header: '전형',
    width: '70px',
    align: 'center',
    value: (r) => r.admissionType,
    render: (r) => <span className="mk supplement">{r.admissionType}</span>,
  },
  {
    key: 'confirmed',
    header: '등록 확정',
    width: '90px',
    align: 'center',
    value: (r) => (r.confirmed ? '확정' : '미확정'),
    render: (r) =>
      r.confirmed ? (
        <span className="mk verified">확정</span>
      ) : (
        <span className="mk brandnew">미확정</span>
      ),
  },
  {
    key: 'act',
    header: '',
    width: '64px',
    align: 'center',
    value: () => '',
    render: () => (
      <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
        수정
      </button>
    ),
  },
]

function Content() {
  const [tab, setTab] = useState('list')
  const [year, setYear] = useState('2026')
  const [masked, setMasked] = useState(true)

  const rows = useMemo(() => ROWS.filter((r) => r.year === year), [year])

  const byTrack = useMemo(() => {
    const map = new Map<TrackName, number>()
    for (const t of TRACKS) map.set(t, 0)
    for (const r of rows) map.set(r.track, (map.get(r.track) ?? 0) + 1)
    return map
  }, [rows])

  const max = Math.max(1, ...Array.from(byTrack.values()))

  return (
    <>
      <div className="stat-strip">
        {TRACKS.map((t) => (
          <div className="stat" key={t}>
            <div className="l">
              <Icon name="award" size={13} /> {t}
            </div>
            <div className="v" style={{ color: TRACK_COLOR[t] }}>
              {byTrack.get(t)}
            </div>
            <div className="d">
              {rows.length ? Math.round(((byTrack.get(t) ?? 0) / rows.length) * 100) : 0}%
            </div>
          </div>
        ))}
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '실적 입력', count: rows.length },
            { key: 'stat', label: '현황 · 통계' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'list' ? (
          <div style={{ padding: 14 }}>
            <DataTable
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => r.id}
              masked={masked}
              pageSize={12}
              countLabel={
                <>
                  {year}학년도 실적 <b>{rows.length}</b>건
                </>
              }
              toolbar={
                <>
                  <select className="sel" style={{ width: 110 }} value={year} onChange={(e) => setYear(e.target.value)}>
                    <option value="2026">2026학년도</option>
                    <option value="2025">2025학년도</option>
                  </select>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename={`${year}_합격실적`} columns={COLUMNS} rows={rows} masked={masked} />
                  <button className="btn pri">
                    <Icon name="plus" size={14} /> 실적 입력
                  </button>
                </>
              }
            />
          </div>
        ) : (
          <div className="card-sec-b">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {TRACKS.map((t) => {
                const n = byTrack.get(t) ?? 0
                return (
                  <div key={t} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 84px', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: TRACK_COLOR[t] }}>{t}</span>
                    <div style={{ height: 22, background: 'var(--line-2)', borderRadius: 7, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${(n / max) * 100}%`,
                          height: '100%',
                          background: TRACK_COLOR[t],
                          borderRadius: 7,
                          transition: 'width .2s',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
                      <b style={{ color: 'var(--ink)', fontSize: 14 }}>{n}</b>명
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="note-box" style={{ marginTop: 18, marginBottom: 0 }}>
              <div className="ic">
                <Icon name="info" size={17} />
              </div>
              <div>
                <div className="tt">통계 화면은 별도 확인 대상</div>
                <div className="tx">
                  DSA에서 <b>실적 입력</b> 화면은 확인했지만 <b>실적 통계(집계)</b> 화면은 실사에서 확인되지
                  않았습니다. 위 막대는 계열별 단순 집계이며, 실제로 필요한 지표(전년 대비·반별·담임별·수시/정시
                  비율 등)는 운영팀 확인 후 확정합니다. 전체 통계 대시보드는 <b>Phase 4</b> 범위입니다.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export const adminResultMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="upload" size={14} /> 엑셀 일괄 등록
      </button>
      <button className="btn">
        <Icon name="printer" size={14} /> 실적 현황 출력
      </button>
    </>
  ),
}
