import { useCallback, useEffect, useMemo, useState } from 'react'
import { StudentList, type StudentRow } from '../../components/StudentList'
import { StudentHeader } from '../../components/StudentHeader'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { Unfilled } from '../../components/common'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  CONSULT_METHOD_LABEL,
  CONSULT_TYPE_CLASS,
  CONSULT_TYPE_LABEL,
  listConsultStatus,
  listStudentConsults,
  writeConsult,
  type ConsultLog as ConsultLogRow,
  type ConsultMethod,
  type ConsultStatusRow,
  type ConsultType,
} from '../../api/consults'
import type { Mockup } from './types'
import '../../styles/forms.css'
import './consult.css'

/* F-4.11-4 상담(일지·리포트) — /api/v1/admin/consults
 *
 * 좌: 재원생 목록(누가 상담이 밀렸는가) · 우: 그 학생의 상담 이력 + 새 일지 작성
 *
 * ★ 좌측 목록은 /consults/status 다. 학생 검색이 아니라 **상담 관점의 목록**이라
 *   마지막 상담일·지연일수·미상담 여부가 같이 온다. 필터가 그 값으로 걸린다.
 *
 * ★ 서버에 없어서 못 붙인 것 — docs/API_GAPS.md 참고
 *   · 성적 스트립(국어/수학/영어/탐구 등급) — 성적 도메인이라 묶음 F에서 붙인다
 *   · 상세 탭 3개(성적 추이 · 출결·상벌점 · 학부모 공유내역) — 각각 다른 도메인
 *   · 학부모 공유 설정 — WriteRequest 에 필드가 없다
 *   · 상담 소요시간 — placeNote 한 칸뿐이라 "20분 · 상담실 2"를 통째로 넣는다
 *
 * ★ 작성자(teacherId)를 안 보낸다. 토큰에 accountId 는 있어도 teacherId 가 없고
 *   매핑할 API도 없어서, 지금은 teacherName 이 빈 채로 저장된다. */

const CONSULT_TYPES: ConsultType[] = ['REGULAR', 'SCORE', 'LIFE', 'ADMISSION', 'PARENT']
const METHODS: ConsultMethod[] = ['FACE', 'PHONE', 'ONLINE']

const FILTERS = ['전체', '상담 필요', '미상담'] as const
type Filter = (typeof FILTERS)[number]

const DETAIL_TABS = [
  { key: 'log', label: '상담 이력' },
  { key: 'score', label: '성적 추이' },
  { key: 'att', label: '출결 · 상벌점' },
  { key: 'share', label: '학부모 공유내역' },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 상담 현황 → 좌측 목록 행 */
function toRow(s: ConsultStatusRow): StudentRow {
  const meta = [s.className ?? '반 미배정', s.studentNo ?? ''].filter(Boolean).join(' · ')
  return {
    id: String(s.enrollmentId),
    name: s.name,
    meta,
    tag: s.neverConsulted
      ? { label: '미상담', tone: 'risk' }
      : s.lastConsultType
        ? { label: CONSULT_TYPE_LABEL[s.lastConsultType], tone: 'na' }
        : undefined,
    due: s.overdueDays > 0 ? `지연 ${s.overdueDays}일` : undefined,
    date: s.lastConsultedAt ?? '기록 없음',
    warn: s.overdueDays > 0,
  }
}

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('log')
  const [filter, setFilter] = useState<Filter>('전체')
  const [status, setStatus] = useState<ConsultStatusRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<ConsultLogRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* 작성 폼 */
  const [type, setType] = useState<ConsultType>('REGULAR')
  const [method, setMethod] = useState<ConsultMethod>('FACE')
  const [placeNote, setPlaceNote] = useState('')
  const [content, setContent] = useState('')
  const [actionPlan, setActionPlan] = useState('')
  const [nextDueDate, setNextDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (academyId === null) {
      setListLoading(false)
      return
    }
    setListLoading(true)
    try {
      const rows = await listConsultStatus(academyId)
      setStatus(rows)
      setSelectedId((prev) => prev ?? (rows[0] ? String(rows[0].enrollmentId) : null))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '상담 현황을 불러오지 못했습니다.')
    } finally {
      setListLoading(false)
    }
  }, [academyId])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  // 선택한 학생의 상담 이력
  useEffect(() => {
    if (selectedId === null) {
      setLogs([])
      return
    }
    let cancelled = false
    listStudentConsults(Number(selectedId))
      .then((list) => !cancelled && setLogs(list))
      .catch(() => !cancelled && setLogs([]))
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const filtered = useMemo(() => {
    if (filter === '상담 필요') return status.filter((s) => s.overdueDays > 0)
    if (filter === '미상담') return status.filter((s) => s.neverConsulted)
    return status
  }, [status, filter])

  const selected = status.find((s) => String(s.enrollmentId) === selectedId) ?? null

  async function save() {
    if (selected === null || content.trim() === '') return
    setSaving(true)
    setSaveMsg(null)
    try {
      await writeConsult({
        enrollmentId: selected.enrollmentId,
        consultType: type,
        method,
        consultedAt: today(),
        placeNote: placeNote.trim() || undefined,
        content: content.trim(),
        actionPlan: actionPlan.trim() || undefined,
        nextDueDate: nextDueDate.trim() || undefined,
      })
      setContent('')
      setActionPlan('')
      setPlaceNote('')
      setNextDueDate('')
      setSaveMsg('상담일지를 저장했습니다.')
      setLogs(await listStudentConsults(selected.enrollmentId))
      await loadStatus()
    } catch (err) {
      setSaveMsg(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-consult">
      <div className="layout">
        <StudentList
          title="재원생"
          count={`전체 ${status.length}명`}
          filters={[...FILTERS]}
          filter={filter}
          onFilterChange={(f) => setFilter(f as Filter)}
          rows={filtered.map(toRow)}
          selected={selectedId ?? undefined}
          onSelect={setSelectedId}
          loading={listLoading}
          emptyText={academyId === null ? '지점을 먼저 선택하세요.' : '해당하는 학생이 없습니다.'}
        />

        <section className="panel">
          {error && (
            <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <StudentHeader
            name={selected?.name ?? '—'}
            code={selected?.studentNo ?? '—'}
            sub={
              selected ? (
                <>
                  {selected.className ?? '반 미배정'} · <b>담임</b> {selected.homeroomTeacherName ?? '미지정'} ·{' '}
                  마지막 상담 {selected.lastConsultedAt ?? '없음'}
                </>
              ) : (
                '학생을 선택하세요'
              )
            }
            right={
              selected && selected.overdueDays > 0 ? (
                <div className="risk-badge">
                  <Icon name="alert-circle" size={13} /> 상담 지연 {selected.overdueDays}일
                </div>
              ) : undefined
            }
          />

          {/* 성적 스트립은 성적 도메인(묶음 F)에서 붙인다 */}
          <div className="score-strip">
            <div className="sc" style={{ gridColumn: '1 / -1' }}>
              <div className="l">성적 요약</div>
              <div className="v" style={{ fontSize: 13 }}>
                <Unfilled reason="성적 API 연동은 묶음 F(성적 관리)에서 한다" />
              </div>
            </div>
          </div>

          <Tabs items={DETAIL_TABS} active={tab} onChange={setTab} />

          <div className="panel-body">
            {tab !== 'log' ? (
              <div className="note-box plain">
                <div className="ic">
                  <Icon name="alert-circle" size={17} />
                </div>
                <div>
                  <div className="tt">아직 연동하지 않은 탭입니다</div>
                  <div className="tx">
                    성적 추이 · 출결·상벌점 · 학부모 공유내역은 각각 다른 도메인이라 해당 묶음에서 붙입니다.
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* ── 새 상담일지 작성 ── */}
                <div className="composer">
                  <div className="comp-h">
                    <div className="t">
                      <Icon name="pencil" size={15} /> 새 상담일지 작성
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--mint-d)' }}>{today()}</div>
                  </div>

                  <div className="comp-body">
                    <div className="frow">
                      <label className="req">상담 유형</label>
                      <div className="type-picks">
                        {CONSULT_TYPES.map((t) => (
                          <button
                            type="button"
                            key={t}
                            className={`type-pick${type === t ? ' on' : ''}`}
                            onClick={() => setType(t)}
                          >
                            {CONSULT_TYPE_LABEL[t]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="frow">
                      <label className="req">상담 방식</label>
                      <div className="two">
                        <select className="sel" value={method} onChange={(e) => setMethod(e.target.value as ConsultMethod)}>
                          {METHODS.map((m) => (
                            <option key={m} value={m}>
                              {CONSULT_METHOD_LABEL[m]}
                            </option>
                          ))}
                        </select>
                        <input
                          className="inp"
                          value={placeNote}
                          onChange={(e) => setPlaceNote(e.target.value)}
                          placeholder="소요시간 · 장소 (예: 20분 · 상담실 2)"
                        />
                      </div>
                    </div>

                    <div className="frow">
                      <label className="req">상담 내용</label>
                      <textarea
                        className="ta"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="상담에서 다룬 내용을 기록하세요. (학생 상태, 학습 현황, 논의사항)"
                      />
                    </div>

                    <div className="frow">
                      <label>합의 · 다음 행동</label>
                      <textarea
                        className="ta"
                        style={{ minHeight: 56 }}
                        value={actionPlan}
                        onChange={(e) => setActionPlan(e.target.value)}
                        placeholder="학생과 합의한 실행 계획 (Action)"
                      />
                    </div>

                    <div className="frow">
                      <label>후속 상담</label>
                      <div className="two">
                        <input
                          className="inp"
                          type="date"
                          value={nextDueDate}
                          onChange={(e) => setNextDueDate(e.target.value)}
                          placeholder="다음 상담 예정일"
                        />
                        <div className="link-box" style={{ alignItems: 'center' }}>
                          <div>
                            학부모 공유 설정 <Unfilled reason="저장 요청에 공유 설정 필드가 없다" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="comp-foot">
                    <div className="hint">
                      {saveMsg ?? '저장 시 학생 앱 · 학부모 앱(공유 설정에 따라)에 즉시 반영됩니다.'}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" disabled title="임시저장 API가 없습니다">
                        임시저장
                      </button>
                      <button
                        className="btn pri"
                        disabled={selected === null || content.trim() === '' || saving}
                        onClick={() => void save()}
                      >
                        {saving ? '저장 중…' : '상담일지 저장'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── 상담 이력 타임라인 ── */}
                <div className="tl-head">
                  <div className="t">상담 이력 {logs.length > 0 && `(${logs.length})`}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>최신순</div>
                </div>

                <div className="timeline">
                  {logs.length === 0 && <div className="dt-empty">상담 기록이 없습니다.</div>}
                  {logs.map((e) => (
                    <div className={`entry ${CONSULT_TYPE_CLASS[e.consultType] === 'scr' ? 'sc' : ''}`} key={e.id}>
                      <div className="ecard">
                        <div className="ecard-h">
                          <span className={`ty ${CONSULT_TYPE_CLASS[e.consultType]}`}>
                            {CONSULT_TYPE_LABEL[e.consultType]}
                          </span>
                          <span className="dt">{e.consultedAt}</span>
                          <span className="who">
                            {e.teacherName ?? '작성자 미기록'}
                            {e.method && ` · ${CONSULT_METHOD_LABEL[e.method]}`}
                            {e.placeNote && ` · ${e.placeNote}`}
                          </span>
                        </div>
                        <div className="ecard-b">
                          <div className="esec">
                            <div className="sl">상담 내용</div>
                            <div className="sx">{e.content}</div>
                          </div>
                          {e.actionPlan && (
                            <div className="esec">
                              <div className="sl">합의 · 다음 행동</div>
                              <span className={`action-tag${e.actionDone ? ' done-tag' : ''}`}>
                                <Icon name="check" size={13} /> {e.actionDone ? '완료 — ' : ''}
                                {e.actionPlan}
                              </span>
                            </div>
                          )}
                          {e.nextDueDate && (
                            <div className="esec">
                              <div className="sl">다음 상담 예정</div>
                              <div className="sx">{e.nextDueDate}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export const consultMockup: Mockup = {
  Content,
}
