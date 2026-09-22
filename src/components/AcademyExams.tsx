import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { ApiError } from '../api/client'
import {
  getAcademyExam,
  getAcademyScoring,
  getAcademyTrend,
  listAcademyExams,
  type AcademyExam,
  type AcademyExamDetail,
  type AcademyExamTrend,
  type ScoringArea,
} from '../api/grades'
import '../pages/screens/score.css'

/*
 * 성적 관리(오른쪽 상세 맨 아래)와 상담 관리('성적 추이' 탭)가 같이 쓴다.
 * ★ 스타일이 `.p-score` 아래에 묶여 있어서 이 부품이 스스로 감싼다 — 밖에서 감쌀 필요 없다.
 */

/**
 * 디랩 시험 성적 — 성적 업로드(①)로 반영된 회차. 앱 '성적' 탭과 같은 값이다.
 *
 * ★ 입학 전 성적(위 표)과 섞지 않는다. 출처가 다르다 — 위는 학생이 가입 때 넣은 것,
 *   이건 학원이 받은 파일이다. 한 표에 두면 누가 넣은 값인지 구분이 안 된다.
 * ★ 지망대학 진단이 **없는 시험 종류**(`noDiagnosisByType`)와 **비어 있는 것**을 구분해 적는다.
 */
export function AcademyExams({ enrollmentId }: { enrollmentId: number }) {
  const [exams, setExams] = useState<AcademyExam[] | null>(null)
  const [trend, setTrend] = useState<AcademyExamTrend[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [detail, setDetail] = useState<AcademyExamDetail | null>(null)
  /* 채점 — 문항 정보와 정오표가 둘 다 있어야 나온다. 없으면 빈 목록(오류 아님) */
  const [scoring, setScoring] = useState<ScoringArea[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([listAcademyExams(enrollmentId), getAcademyTrend(enrollmentId)])
      .then(([ex, tr]) => {
        if (!alive) return
        setExams(ex)
        setTrend(tr)
        setSel(ex[0]?.examMasterId ?? null)
      })
      .catch((e) => alive && setErr(e instanceof ApiError ? e.message : '디랩 시험 성적을 불러오지 못했습니다.'))
    return () => {
      alive = false
    }
  }, [enrollmentId])

  useEffect(() => {
    if (sel === null) return
    let alive = true
    setDetail(null)
    setScoring(null)
    getAcademyExam(enrollmentId, sel)
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setErr(e instanceof ApiError ? e.message : '회차 성적을 불러오지 못했습니다.'))
    getAcademyScoring(enrollmentId, sel)
      .then((a) => alive && setScoring(a))
      .catch(() => alive && setScoring([]))
    return () => {
      alive = false
    }
  }, [enrollmentId, sel])

  /* 추이 표의 열 — 회차마다 과목이 달라 합집합으로 모은다 */
  const trendSubjects = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of trend) for (const v of t.values) if (!m.has(v.subjectCode)) m.set(v.subjectCode, v.subjectName)
    return [...m.entries()]
  }, [trend])

  const n = (v: number | null | undefined) => (v === null || v === undefined ? '-' : String(v))

  return (
    <div className="p-score" style={{ marginTop: 26 }}>
      <div className="sec-h">
        <div className="t">
          <span className="ic">
            <Icon name="file-spreadsheet" size={17} />
          </span>{' '}
          디랩 시험
        </div>
        <div className="note">성적 업로드로 올린 시험입니다. 학생 앱 성적 탭과 같은 값입니다.</div>
      </div>

      {err && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {err}
        </div>
      )}
      {exams === null && !err && <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>불러오는 중…</div>}
      {exams !== null && exams.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: '10px 0' }}>
          아직 반영된 디랩 시험이 없습니다. 관리자 &gt; 성적 업로드에서 올리면 여기에 나옵니다.
        </div>
      )}

      {exams !== null && exams.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {exams.map((e) => (
              <button
                key={e.examMasterId}
                type="button"
                className={`chip${sel === e.examMasterId ? ' on' : ''}`}
                onClick={() => setSel(e.examMasterId)}
              >
                {e.examName}
                {e.examDate ? ` · ${e.examDate.slice(5).replace('-', '/')}` : ''}
                {e.kice ? ' · 평가원' : ''}
              </button>
            ))}
          </div>

          {detail === null ? (
            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>불러오는 중…</div>
          ) : (
            <>
              <div className="table-scroll">
                <table className="rtable">
                  <thead>
                    <tr>
                      <th className="rd">과목</th>
                      <th>원점수</th>
                      <th>표준점수</th>
                      <th>백분위</th>
                      <th>등급</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.subjects.map((s) => (
                      <tr key={s.subjectCode}>
                        <td className="rd">{s.subjectName}</td>
                        <td>{n(s.rawScore)}</td>
                        <td>{n(s.standardScore)}</td>
                        <td>{n(s.percentile)}</td>
                        <td>
                          <b>{n(s.gradeLevel)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ margin: '16px 0 8px', fontWeight: 700, fontSize: 13 }}>지망대학 진단</div>
              {detail.noDiagnosisByType ? (
                <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>이 시험은 지망대학 진단을 주지 않습니다.</div>
              ) : detail.choices.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>파일에 적힌 지망대학이 없습니다.</div>
              ) : (
                <div className="table-scroll">
                  <table className="rtable">
                    <thead>
                      <tr>
                        <th>지망</th>
                        <th className="rd">대학 · 학과</th>
                        <th>모집</th>
                        <th>지원자 중 순위</th>
                        <th>반영 영역</th>
                        <th>예상 점수</th>
                        <th>합격선</th>
                        <th>차이</th>
                        <th>진단</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.choices.map((c) => (
                        <tr key={c.rank}>
                          <td>{c.rank}</td>
                          <td className="rd" style={{ whiteSpace: 'nowrap' }}>
                            {c.universityName} {c.departmentName}
                          </td>
                          <td>{n(c.recruitQuota)}</td>
                          <td>
                            {c.applicantRank !== null && c.applicantCount !== null
                              ? `${c.applicantRank} / ${c.applicantCount}`
                              : '-'}
                          </td>
                          <td>{c.appliedAreas ?? '-'}</td>
                          <td>{n(c.expectedScore)}</td>
                          <td>{n(c.cutoffScore)}</td>
                          <td style={{ color: c.gapToCutoff !== null && c.gapToCutoff < 0 ? 'var(--red)' : undefined }}>
                            {c.gapToCutoff === null ? '-' : (c.gapToCutoff > 0 ? '+' : '') + c.gapToCutoff}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{c.diagnosis ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── 채점 — 영역별 맞은 수 · 틀린 문항 · 단원별 정답률(전국 대비) ── */}
          {detail !== null && (
            <>
              <div style={{ margin: '16px 0 8px', fontWeight: 700, fontSize: 13 }}>채점</div>
              {scoring === null ? (
                <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>불러오는 중…</div>
              ) : scoring.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                  이 회차는 채점 결과가 없습니다. 성적 업로드에서 문항 정보와 정오표를 올리면 나옵니다.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {scoring.map((a) => (
                    <div key={`${a.name}-${a.elective ?? ''}`} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <b>
                          {a.name}
                          {a.elective ? ` · ${a.elective}` : ''}
                        </b>
                        <span style={{ fontSize: 12.5 }}>
                          맞음 <b style={{ color: 'var(--mint-d)' }}>{a.correct}</b> / {a.total} · 틀림{' '}
                          <b style={{ color: a.wrong ? 'var(--red)' : undefined }}>{a.wrong}</b> · 잃은 점수 {a.lostPoints}점
                        </span>
                      </div>
                      {a.review.length > 0 && (
                        <div className="table-scroll" style={{ marginTop: 8 }}>
                          <table className="rtable">
                            <thead>
                              <tr>
                                <th>번호</th>
                                <th>내 답</th>
                                <th>정답</th>
                                <th>전국 정답률</th>
                                <th>배점</th>
                                <th className="rd">단원</th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.review.map((q) => (
                                <tr key={`${q.subjectName}-${q.questionNo}`}>
                                  <td>
                                    {q.questionNo}
                                    {/* 전국은 잘 맞혔는데 틀린 문항 — 실수로 본다 */}
                                    {q.trap && (
                                      <span className="mk brandnew" style={{ marginLeft: 4 }} title="전국 정답률이 높은데 틀린 문항입니다">
                                        실수
                                      </span>
                                    )}
                                  </td>
                                  <td>{q.myAnswer ?? '-'}</td>
                                  <td>{q.correctAnswer ?? '-'}</td>
                                  <td>{q.nationalRate == null ? '-' : `${Math.round(q.nationalRate)}%`}</td>
                                  <td>{q.points ?? '-'}</td>
                                  <td className="rd" style={{ whiteSpace: 'nowrap' }}>
                                    {q.unitName ?? '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {a.byUnit.length > 0 && (
                        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                          {a.byUnit.map((u) => (
                            <div key={u.name} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 110px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={u.name}>
                                {u.name}
                              </span>
                              <span style={{ height: 8, background: 'var(--line-2)', borderRadius: 4, position: 'relative' }}>
                                <span style={{ position: 'absolute', inset: 0, width: `${u.myRate ?? 0}%`, background: 'var(--mint)', borderRadius: 4 }} />
                              </span>
                              <span style={{ color: 'var(--muted)' }}>
                                {u.myRate == null ? '-' : `${Math.round(u.myRate)}%`} · 전국 {u.nationalRate == null ? '-' : `${Math.round(u.nationalRate)}%`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {trend.length > 1 && (
            <>
              <div style={{ margin: '16px 0 8px', fontWeight: 700, fontSize: 13 }}>회차별 등급 변화</div>
              <div className="table-scroll">
                <table className="rtable">
                  <thead>
                    <tr>
                      <th className="rd">회차</th>
                      {trendSubjects.map(([code, name]) => (
                        <th key={code}>{name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((t) => {
                      const by = new Map(t.values.map((v) => [v.subjectCode, v]))
                      return (
                        <tr key={t.exam.examMasterId}>
                          <td className="rd" style={{ whiteSpace: 'nowrap' }}>
                            {t.exam.examName}
                          </td>
                          {trendSubjects.map(([code]) => {
                            const v = by.get(code)
                            return (
                              <td key={code}>
                                <b>{n(v?.gradeLevel)}</b>
                                <small style={{ color: 'var(--muted)' }}> {v?.percentile ?? ''}</small>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="hint" style={{ marginTop: 4 }}>굵은 숫자는 등급, 옆 작은 숫자는 백분위입니다.</div>
            </>
          )}
        </>
      )}
    </div>
  )
}
