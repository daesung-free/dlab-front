import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, MaskToggle, Modal, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { listSelectableScholarships, type ScholarshipMaster } from '../../api/masters'
import {
  ELECTIVE_MODE_LABEL,
  REVIEW_STATUS_LABEL,
  RULE_THRESHOLD_LABEL,
  RULE_TYPE_LABEL,
  cancelScholarshipReview,
  createScholarshipRule,
  deleteScholarshipRule,
  exceptScholarshipReview,
  judgeScholarships,
  listScholarshipReviews,
  listScholarshipRules,
  setScholarshipRuleActive,
  updateScholarshipRule,
  type ElectiveMode,
  type RuleType,
  type ScholarshipReview,
  type ScholarshipRule,
  type ScholarshipRuleBody,
  type ReviewStatus,
} from '../../api/scholarship'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.10-7 장학 취소 기준 · 검토 — /scholarship/rules · /scholarship/reviews
 *
 * ★ **기초 관리의 '장학 종류' 와 다른 화면이다.** 저쪽은 "어떤 장학이 있는가"(종류·할인율),
 *   여기는 "언제 취소하는가"(기준)와 "누구를 취소할 것인가"(검토)다.
 *   둘은 `code` ↔ `scholarshipType` 으로 이어진다.
 *
 * ★ **판정은 취소가 아니다.** 「판정 실행」은 지점 전체를 훑어 **검토 대상을 올릴 뿐**이고,
 *   실제 취소는 건별로 사람이 확정한다. 이걸 화면이 분명히 해야 한다 —
 *   버튼 하나로 장학이 끊기는 줄 알면 아무도 못 누른다.
 *
 * ★ **대안 그룹(OR)을 묶어서 보여준다.** 같은 장학에 대안이 둘이면 **하나만 만족해도
 *   유지**된다. 따로 늘어놓으면 "기준이 왜 두 개냐"가 되고, 하나를 지우면 나머지만
 *   남아 조건이 조용히 좁아진다.
 *
 * ★ 지점 기준과 **전 지점 공통 기준은 다른 목록이다**(`academyId` 를 비우면 공통이 온다).
 *   섞으면 어느 것을 고치는지 알 수 없어 갈라서 보여준다. 공통은 본사만 만들 수 있다.
 *
 * ⚠️ 검토 행의 `detectedValue` 는 **등급합이 2배 스케일**이라 그대로 띄우면 안 된다 —
 *   합이 4 인 학생이 8 로 보인다. 사람에게는 서버가 만든 `detail` 을 보여준다.
 */

const EMPTY_RULE: RuleDraft = {
  id: null,
  ruleType: 'EXAM_GRADE_SUM',
  threshold: '',
  scholarshipType: '',
  alternativeGroup: '1',
  subjectCodes: '',
  examCodes: '',
  electiveMode: '',
  extraSubjectCode: '',
  extraMaxGrade: '',
}

interface RuleDraft {
  id: number | null
  ruleType: RuleType
  threshold: string
  scholarshipType: string
  alternativeGroup: string
  subjectCodes: string
  examCodes: string
  electiveMode: string
  extraSubjectCode: string
  extraMaxGrade: string
}

/** 과목 코드 → 사람 말. 서버가 코드로 주고받아서 화면에서만 바꾼다 */
const SUBJECT_LABEL: Record<string, string> = {
  KOREAN: '국어',
  MATH: '수학',
  ENGLISH: '영어',
  SOCIAL: '통합사회',
  SCIENCE: '통합과학',
  HISTORY: '한국사',
  INQUIRY1: '탐구1',
  INQUIRY2: '탐구2',
}

const EXAM_LABEL: Record<string, string> = {
  JUNE: '6월',
  SEPT: '9월',
  OCT: '10월',
  CSAT: '수능',
}

function codesToText(codes: string | null, dict: Record<string, string>): string {
  if (!codes) return '-'
  return codes
    .split(',')
    .map((c) => dict[c.trim()] ?? c.trim())
    .join(' + ')
}

/**
 * 숫자 뒤에 붙는 목적격 조사.
 *
 * ★ 숫자를 **소리 내어 읽은 끝소리**로 갈린다 — 2(이)·4(사)·5(오)·9(구)는 받침이 없어 '를',
 *   나머지는 '을'이다. 0 으로 끝나면 십·백·천이라 받침이 있어 '을'.
 *   고정으로 '을'을 쓰면 "등급합이 **4을** 넘으면" 처럼 어색해진다(실제로 그랬다).
 */
function objParticle(n: number): string {
  return [2, 4, 5, 9].includes(Math.abs(n) % 10) ? '를' : '을'
}

/** 기준 한 줄을 사람이 읽는 문장으로. 종류마다 단위가 달라 숫자만으로는 못 읽는다 */
function ruleText(r: ScholarshipRule): string {
  if (r.ruleType === 'PENALTY_POINT') return `벌점이 ${r.threshold}점을 넘으면`
  if (r.ruleType === 'MOCK_EXAM_ABSENCE') return `모의고사를 ${r.threshold}회 결시하면`
  const subj = codesToText(r.subjectCodes, SUBJECT_LABEL)
  const elective = r.electiveMode ? ` + ${ELECTIVE_MODE_LABEL[r.electiveMode]}` : ''
  const extra =
    r.extraSubjectCode && r.extraMaxGrade != null
      ? ` · ${SUBJECT_LABEL[r.extraSubjectCode] ?? r.extraSubjectCode} ${r.extraMaxGrade}등급 이내`
      : ''
  return `${subj}${elective} 등급합이 ${r.threshold}${objParticle(r.threshold)} 넘으면${extra}`
}

function Content() {
  const { academyId, ready: academyReady } = useAcademy()
  const year = new Date().getFullYear()
  const [tab, setTab] = useState('rules')

  const [rules, setRules] = useState<ScholarshipRule[]>([])
  const [commonRules, setCommonRules] = useState<ScholarshipRule[]>([])
  const [masters, setMasters] = useState<ScholarshipMaster[]>([])
  const [reviews, setReviews] = useState<ScholarshipReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /* 켜기/끄기는 **그 줄만** 잠근다. 화면 전체를 막으면 한 줄 바꾸는 동안 아무것도 못 한다 */
  const [rowBusy, setRowBusy] = useState<number | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [masked, setMasked] = useState(true)

  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [draftErr, setDraftErr] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ScholarshipRule | null>(null)
  const [deciding, setDeciding] = useState<{ row: ScholarshipReview; kind: 'cancel' | 'except'; note: string } | null>(
    null,
  )

  const load = useCallback(async () => {
    if (academyId === null) {
      setRules([])
      setCommonRules([])
      setReviews([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    /* ★ `Promise.all` 로 묶으면 **하나만 실패해도 넷 다 날아간다.** 검토 목록이 안 와도
         기준은 보여줄 수 있어야 한다 — 서로 다른 엔드포인트다. allSettled 로 받는다. */
    const [mine, common, ms, rv] = await Promise.allSettled([
      listScholarshipRules({ academyId, year }),
      /* 공통 기준은 academyId 를 빼고 부른다 — 지점 것과 다른 목록이다 */
      listScholarshipRules({ year }),
      /* ★ `/scholarship-masters?academyId=8` 은 **그 지점이 직접 만든 것만** 준다 —
           전 지점 공통 장학이 빠져서 실측 0건이었다. `/selectable` 이 "그 지점에서
           고를 수 있는" 목록이고 공통까지 포함한다. 드롭다운은 이쪽을 쓴다. */
      listSelectableScholarships(year, academyId),
      listScholarshipReviews({ academyId, year }),
    ])
    setRules(mine.status === 'fulfilled' ? mine.value : [])
    setCommonRules(common.status === 'fulfilled' ? common.value : [])
    setMasters(ms.status === 'fulfilled' ? ms.value : [])
    setReviews(rv.status === 'fulfilled' ? rv.value : [])

    /* 실패한 것이 있으면 첫 이유를 그대로 띄운다. 서버가 안 떠 있으면
       "서버에 연결하지 못했습니다" 가 나와 **빈 목록과 구분된다** */
    const failed = [mine, common, ms, rv].find((r) => r.status === 'rejected')
    if (failed && failed.status === 'rejected') {
      const e = failed.reason
      setError(e instanceof ApiError ? e.message : '장학 기준을 불러오지 못했습니다.')
    }
    setLoading(false)
  }, [academyId, year])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 장학별 · 대안 그룹별로 묶는다.
   *
   * ★ 대안은 **OR** 다. 나란히 늘어놓으면 AND 로 읽혀서 "왜 둘 다 만족해야 하냐"가 된다.
   */
  const grouped = useMemo(() => {
    /* ★ **서버 목록 순서가 보장되지 않는다.** 같은 조건으로 두 번 불러도 순서가 다르다 —
         실측: 7,8,9,4,5,6,3,1 → 7,4,5,6,8,9,3,1(2026-09-16). 그대로 그리면 켜기 한 번에
         줄이 위아래로 튀어서 "왜 움직이냐"가 된다. 화면이 순서를 못박는다. */
    const all = [...rules, ...commonRules].sort(
      (a, b) => a.alternativeGroup - b.alternativeGroup || a.id - b.id,
    )
    const byType = new Map<string, ScholarshipRule[]>()
    for (const r of all) {
      const key = r.scholarshipType ?? '__none__'
      byType.set(key, [...(byType.get(key) ?? []), r])
    }
    const named = [...byType.entries()].map(([key, list]) => {
      const alts = new Map<number, ScholarshipRule[]>()
      for (const r of list) alts.set(r.alternativeGroup, [...(alts.get(r.alternativeGroup) ?? []), r])
      return {
        key,
        name: key === '__none__' ? '장학 종류와 무관' : (masters.find((m) => m.code === key)?.name ?? key),
        alts: [...alts.entries()].sort((a, b) => a[0] - b[0]),
      }
    })
    /* 묶음 차례도 못박는다. '장학 종류와 무관'(벌점·결시)은 맨 뒤로 — 특정 장학 기준이 먼저다 */
    return named.sort((a, b) => {
      if (a.key === '__none__') return 1
      if (b.key === '__none__') return -1
      return a.name.localeCompare(b.name, 'ko')
    })
  }, [rules, commonRules, masters])

  const pending = useMemo(() => reviews.filter((r) => r.status === 'PENDING'), [reviews])

  async function submitRule() {
    if (!draft || academyId === null) return
    setBusy(true)
    setDraftErr(null)
    try {
      const n = Number(draft.threshold)
      if (!Number.isFinite(n)) throw new Error('기준값을 숫자로 입력하세요.')
      const body: ScholarshipRuleBody = {
        academyId,
        year,
        ruleType: draft.ruleType,
        threshold: n,
        scholarshipType: draft.scholarshipType || undefined,
        alternativeGroup: Number(draft.alternativeGroup) || 1,
      }
      /* 등급합만 과목·회차·탐구를 쓴다. 나머지 종류에 실어 보내면 뜻 없는 값이 남는다 */
      if (draft.ruleType === 'EXAM_GRADE_SUM') {
        body.subjectCodes = draft.subjectCodes || undefined
        body.examCodes = draft.examCodes || undefined
        body.electiveMode = (draft.electiveMode || undefined) as ElectiveMode | undefined
        if (draft.extraSubjectCode && draft.extraMaxGrade) {
          body.extraSubjectCode = draft.extraSubjectCode
          body.extraMaxGrade = Number(draft.extraMaxGrade)
        }
      }
      if (draft.id === null) {
        await createScholarshipRule(body)
        setDone('기준을 만들었습니다. 확인하고 켜 주세요 — 만든 기준은 꺼진 상태입니다.')
      } else {
        await updateScholarshipRule(draft.id, body)
        setDone('기준을 고쳤습니다.')
      }
      setDraft(null)
      await load()
    } catch (err) {
      setDraftErr(err instanceof ApiError ? err.message : err instanceof Error ? err.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 한 줄의 active 만 갈아끼운다. 공통 기준은 별도 목록이라 양쪽을 다 본다 */
  function patchLocal(id: number, active: boolean) {
    const swap = (list: ScholarshipRule[]) => list.map((x) => (x.id === id ? { ...x, active } : x))
    setRules(swap)
    setCommonRules(swap)
  }

  /**
   * 켜기 / 끄기.
   *
   * ★ **전체를 다시 불러오지 않는다.** 예전에는 `load()` 를 불러서 한 줄 켤 때마다
   *   API 4개가 다시 나가고 화면이 통째로 '불러오는 중' 으로 돌아갔다. 바뀌는 값은
   *   그 줄의 `active` 하나뿐이다.
   *
   * ★ 먼저 화면을 바꾸고 요청을 보낸다. 실패하면 **되돌리고** 이유를 띄운다 —
   *   안 되돌리면 화면은 켜졌는데 서버는 꺼진 채로 어긋난다.
   */
  async function toggle(r: ScholarshipRule) {
    const next = !r.active
    setRowBusy(r.id)
    setError(null)
    patchLocal(r.id, next)
    try {
      await setScholarshipRuleActive(r.id, next)
    } catch (err) {
      patchLocal(r.id, r.active)
      setError(err instanceof ApiError ? err.message : '바꾸지 못했습니다.')
    } finally {
      setRowBusy(null)
    }
  }

  async function runRemove() {
    if (!removing) return
    setBusy(true)
    setError(null)
    try {
      await deleteScholarshipRule(removing.id)
      /* 지운 줄만 뺀다 — 여기서도 전체를 다시 부를 이유가 없다 */
      setRules((l) => l.filter((x) => x.id !== removing.id))
      setCommonRules((l) => l.filter((x) => x.id !== removing.id))
      setRemoving(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '지우지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function runJudge() {
    if (academyId === null) return
    setBusy(true)
    setError(null)
    try {
      await judgeScholarships({ academyId, year })
      await load()
      setDone('판정을 마쳤습니다. 아래 목록에서 건별로 확정해 주세요 — 아직 취소된 것은 없습니다.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '판정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function submitDecision() {
    if (!deciding) return
    setBusy(true)
    setError(null)
    try {
      if (deciding.kind === 'except') await exceptScholarshipReview(deciding.row.id, deciding.note)
      else await cancelScholarshipReview(deciding.row.id, deciding.note || undefined)
      /* 처리한 줄만 바꾼다. 전체를 다시 부르면 보고 있던 자리가 사라진다 */
      const next: ReviewStatus = deciding.kind === 'except' ? 'EXCEPTED' : 'CANCELED'
      setReviews((l) =>
        l.map((x) => (x.id === deciding.row.id ? { ...x, status: next, decisionNote: deciding.note || null } : x)),
      )
      setDeciding(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '처리하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const reviewColumns: Column<ScholarshipReview>[] = useMemo(
    () => [
      { key: 'studentNo', header: '학번', width: '104px', value: (r) => r.studentNo ?? '-' },
      { key: 'studentName', header: '이름', width: '84px', mask: 'name', value: (r) => r.studentName },
      {
        key: 'ruleType',
        header: '걸린 기준',
        width: '104px',
        align: 'center',
        value: (r) => (r.ruleType ? RULE_TYPE_LABEL[r.ruleType] : '-'),
      },
      {
        key: 'detail',
        header: '판정 근거',
        /* ⚠️ detectedValue 는 등급합이 2배 스케일이라 그대로 띄우면 안 된다 —
               합이 4 인 학생이 8 로 보인다. 서버가 만든 문장을 쓴다 */
        value: (r) => r.detail ?? '-',
      },
      {
        key: 'status',
        header: '상태',
        width: '88px',
        align: 'center',
        value: (r) => REVIEW_STATUS_LABEL[r.status] ?? r.status,
        render: (r, shown) => (
          <span
            className={`mk ${r.status === 'CANCELED' ? 'brandnew' : r.status === 'EXCEPTED' ? 'verified' : 'supplement'}`}
          >
            {shown}
          </span>
        ),
      },
      { key: 'decisionNote', header: '사유', width: '160px', value: (r) => r.decisionNote ?? '-' },
      {
        key: 'act',
        header: '',
        width: '150px',
        align: 'center',
        value: () => '',
        render: (r) =>
          r.status !== 'PENDING' ? (
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>처리됨</span>
          ) : (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5 }}
                disabled={busy}
                onClick={() => setDeciding({ row: r, kind: 'except', note: '' })}
              >
                예외 인정
              </button>
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
                disabled={busy}
                onClick={() => setDeciding({ row: r, kind: 'cancel', note: '' })}
              >
                취소 확정
              </button>
            </div>
          ),
      },
    ],
    [busy],
  )

  return (
    <>
      <div className="note-box">
        <div className="ic">
          <Icon name="award" size={17} />
        </div>
        <div>
          <div className="tt">기준을 정해 두고, 학기마다 판정해 건별로 확정합니다</div>
          <div className="tx">
            판정을 실행해도 <b>장학이 바로 끊기지는 않습니다.</b> 대상이 목록에 올라올 뿐이고,
            취소할지 예외로 둘지는 사람이 한 건씩 정합니다.
          </div>
        </div>
      </div>

      {/* 지점을 못 고른 상태를 먼저 말한다. 다른 화면과 같은 문구를 쓴다 —
          이 상태에서는 목록이 비는 것이 정상이고, 버튼이 잠긴 것도 그래서다 */}
      {academyId === null && academyReady && (
        <div className="note-box">지점을 먼저 선택하세요. 장학 기준은 지점 단위로 관리합니다.</div>
      )}

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {done && (
        <div className="note-box" style={{ borderColor: 'var(--mint)' }}>
          <div className="ic">
            <Icon name="check" size={17} />
          </div>
          <div style={{ flex: 1 }}>{done}</div>
          <button className="btn" onClick={() => setDone(null)}>
            닫기
          </button>
        </div>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'rules', label: '취소 기준', count: rules.length + commonRules.length },
            { key: 'reviews', label: '검토 · 판정', count: pending.length },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div className="card-sec-b">
          {tab === 'rules' ? (
            <>
              {/* 다른 화면의 표 머리(.dt-toolbar)와 같은 줄을 쓴다 — 버튼만 오른쪽에 띄워 두면
                   왼쪽이 비어 한 줄이 통째로 빈 띠처럼 보이고, 아래 목록과 선이 안 맞는다 */}
              {/* ★ `.dt-toolbar` 는 아래 테두리를 긋는다. 바로 밑 제목 줄도 긋고 있어서
                     선이 둘 겹쳐 보였다 — 여기서는 지운다 */}
              <div
                className="dt-toolbar"
                style={{ padding: '0 0 12px', marginBottom: 18, borderBottomColor: 'var(--line)' }}
              >
                <span className="dt-count">
                  기준 <b>{rules.length + commonRules.length}</b>건 · 켜짐{' '}
                  <b>{[...rules, ...commonRules].filter((r) => r.active).length}</b>건
                </span>
                <div className="dt-right">
                  {/* ★ 막아두면 **왜 막혔는지 함께 적는다**(CLAUDE.md 5-1). 이유 없이 회색이면
                         고장으로 읽힌다 — 실제로 "기준 추가가 꺼져 있다"는 지적을 받았다 */}
                  <button
                    className="btn pri"
                    disabled={academyId === null}
                    title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
                    onClick={() => {
                      setDraftErr(null)
                      setDraft(EMPTY_RULE)
                    }}
                  >
                    <Icon name="plus" size={14} /> 기준 추가
                  </button>
                </div>
              </div>

              {loading && <div className="hint">불러오는 중…</div>}

              {/* ★ 빈 목록에 "없습니다" 한 줄만 두지 않는다. 처음 여는 사람은 **무엇을 해야
                     하는지** 모르고, 서버가 안 뜬 것인지 정말 없는 것인지도 구분이 안 된다.
                     오류가 났으면 위 배너가 이미 말하므로 여기서는 할 일만 적는다. */}
              {!loading && grouped.length === 0 && error === null && academyId !== null && (
                <div className="note-box" style={{ marginTop: 4 }}>
                  <div className="ic">
                    <Icon name="award" size={17} />
                  </div>
                  <div>
                    <div className="tt">아직 취소 기준이 없습니다</div>
                    <div className="tx">
                      기준을 만들어 두면 학기마다 <b>판정 실행</b>으로 대상을 찾을 수 있습니다.
                      보통 이렇게 씁니다 —
                      <br />
                      <b>벌점 누적</b> 40점을 넘으면 · <b>등급합</b>이 기준을 넘으면 ·{' '}
                      <b>모의고사</b>를 몇 회 결시하면
                      <br />
                      만든 기준은 <b>꺼진 채</b>로 시작하니, 확인하고 켜면 됩니다.
                    </div>
                  </div>
                </div>
              )}

              {/* ★ 카드(.card-sec)를 쓰지 않는다. 이 블록 자체가 이미 카드 안이라 카드 속 카드가
                     되어 그림자·모서리가 겹치고 들여쓰기가 어긋나 보였다 — 제목 줄 + 목록으로 둔다 */}
              {grouped.map((g) => (
                <section key={g.key} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      paddingBottom: 6,
                    }}
                  >
                    <span style={{ color: 'var(--mint-d)', display: 'flex' }}>
                      <Icon name="award" size={15} />
                    </span>
                    <b style={{ fontSize: 13.5 }}>{g.name}</b>
                    {g.alts.length > 1 && (
                      /* ★ OR 이라는 것을 반드시 적는다. 안 적으면 둘 다 만족해야 하는 줄 안다 */
                      <span className="mk supplement" style={{ marginLeft: 'auto' }}>
                        아래 {g.alts.length}가지 중 하나만 만족하면 유지
                      </span>
                    )}
                  </div>
                  <div>
                    {g.alts.map(([groupNo, list]) => (
                      <div key={groupNo} style={{ marginBottom: 10 }}>
                        {g.alts.length > 1 && (
                          <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '10px 0 2px' }}>
                            대안 {groupNo}
                          </div>
                        )}
                        {list.map((r) => (
                          <div
                            key={r.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '8px 2px',
                              borderBottom: '1px solid var(--line-2)',
                            }}
                          >
                            <span className={`mk ${r.active ? 'verified' : ''}`}>{r.active ? '켜짐' : '꺼짐'}</span>
                            <span style={{ fontSize: 13 }}>{ruleText(r)}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                              {r.ruleType === 'EXAM_GRADE_SUM' && `· ${codesToText(r.examCodes, EXAM_LABEL)}`}
                            </span>
                            {r.academyId === null && (
                              /* 공통 기준은 본사만 고칠 수 있다 — 지점에서 눌렀다가 403 을 보면 당황한다 */
                              <span className="mk" style={{ background: 'var(--bg)' }}>
                                전 지점 공통
                              </span>
                            )}
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                              <button
                                className="btn"
                                disabled={rowBusy === r.id}
                                onClick={() => void toggle(r)}
                              >
                                {r.active ? '끄기' : '켜기'}
                              </button>
                              <button
                                className="btn"
                                disabled={busy}
                                onClick={() => {
                                  setDraftErr(null)
                                  setDraft({
                                    id: r.id,
                                    ruleType: r.ruleType,
                                    threshold: String(r.threshold),
                                    scholarshipType: r.scholarshipType ?? '',
                                    alternativeGroup: String(r.alternativeGroup),
                                    subjectCodes: r.subjectCodes ?? '',
                                    examCodes: r.examCodes ?? '',
                                    electiveMode: r.electiveMode ?? '',
                                    extraSubjectCode: r.extraSubjectCode ?? '',
                                    extraMaxGrade: r.extraMaxGrade != null ? String(r.extraMaxGrade) : '',
                                  })
                                }}
                              >
                                수정
                              </button>
                              <button
                                className="btn"
                                style={{ color: 'var(--red)' }}
                                disabled={busy}
                                onClick={() => setRemoving(r)}
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          ) : (
            <DataTable
              columns={reviewColumns}
              rows={reviews}
              rowKey={(r) => String(r.id)}
              masked={masked}
              loading={loading}
              pageSize={15}
              countLabel={
                <>
                  검토 <b>{reviews.length}</b>건 · 처리 대기 <b>{pending.length}</b>건
                </>
              }
              toolbar={
                <>
                  <button
                    className="btn pri"
                    disabled={busy || academyId === null}
                    title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
                    onClick={() => void runJudge()}
                  >
                    <Icon name="scan-line" size={14} /> 판정 실행
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                </>
              }
              emptyText="판정된 건이 없습니다. 「판정 실행」을 누르면 기준에 걸리는 학생을 찾습니다."
            />
          )}
        </div>
      </div>

      {/* ── 기준 등록·수정 ── */}
      {draft && (
        <Modal
          title={draft.id === null ? '취소 기준 추가' : '취소 기준 수정'}
          sub={draft.id === null ? '만든 기준은 꺼진 상태로 시작합니다.' : undefined}
          wide
          busy={busy}
          error={draftErr}
          confirmDisabled={draft.threshold.trim() === ''}
          onConfirm={() => void submitRule()}
          onClose={() => setDraft(null)}
        >
          <div className="frow">
            <label className="req">기준 종류</label>
            <div>
              <select
                className="sel"
                value={draft.ruleType}
                onChange={(e) => setDraft({ ...draft, ruleType: e.target.value as RuleType })}
              >
                {(Object.keys(RULE_TYPE_LABEL) as RuleType[]).map((k) => (
                  <option key={k} value={k}>
                    {RULE_TYPE_LABEL[k]}
                  </option>
                ))}
              </select>
              <div className="hint">등급합만 과목·회차를 씁니다. 벌점·결시는 숫자 하나로 끝납니다.</div>
            </div>
          </div>

          <div className="frow">
            <label className="req">{RULE_THRESHOLD_LABEL[draft.ruleType]}</label>
            <div>
              <input
                className="inp"
                type="number"
                value={draft.threshold}
                onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
              />
              <div className="hint">이 값을 넘으면 검토 대상이 됩니다.</div>
            </div>
          </div>

          <div className="frow">
            <label>적용 장학</label>
            <div>
              <select
                className="sel"
                value={draft.scholarshipType}
                onChange={(e) => setDraft({ ...draft, scholarshipType: e.target.value })}
              >
                <option value="">전체 (장학 종류와 무관)</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="hint">벌점처럼 장학과 무관한 기준이면 비워 둡니다.</div>
            </div>
          </div>

          {draft.ruleType === 'EXAM_GRADE_SUM' && (
            <>
              <div className="frow">
                <label>대상 과목</label>
                <div>
                  <input
                    className="inp"
                    placeholder="KOREAN,MATH"
                    value={draft.subjectCodes}
                    onChange={(e) => setDraft({ ...draft, subjectCodes: e.target.value })}
                  />
                  <div className="hint">등급합에 고정으로 들어가는 과목입니다. 탐구는 여기 적지 않습니다.</div>
                </div>
              </div>
              <div className="frow">
                <label>탐구 집계</label>
                <div>
                  <select
                    className="sel"
                    value={draft.electiveMode}
                    onChange={(e) => setDraft({ ...draft, electiveMode: e.target.value })}
                  >
                    <option value="">탐구를 보지 않음</option>
                    {(Object.keys(ELECTIVE_MODE_LABEL) as ElectiveMode[]).map((k) => (
                      <option key={k} value={k}>
                        {ELECTIVE_MODE_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="frow">
                <label>대상 회차</label>
                <div>
                  <input
                    className="inp"
                    placeholder="JUNE,SEPT"
                    value={draft.examCodes}
                    onChange={(e) => setDraft({ ...draft, examCodes: e.target.value })}
                  />
                  <div className="hint">비우면 6월·9월입니다.</div>
                </div>
              </div>
              <div className="frow">
                <label>추가 조건</label>
                <div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="inp"
                      placeholder="ENGLISH"
                      value={draft.extraSubjectCode}
                      onChange={(e) => setDraft({ ...draft, extraSubjectCode: e.target.value })}
                    />
                    <input
                      className="inp"
                      type="number"
                      placeholder="등급 이내"
                      value={draft.extraMaxGrade}
                      onChange={(e) => setDraft({ ...draft, extraMaxGrade: e.target.value })}
                    />
                  </div>
                  {/* 둘 중 하나만 넣으면 서버가 안 받는다 — 함께 지정해야 한다 */}
                  <div className="hint">
                    등급합과 <b>함께</b> 만족해야 하는 조건입니다. 과목과 등급을 둘 다 적어야 합니다.
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="frow">
            <label>대안 번호</label>
            <div>
              <input
                className="inp"
                type="number"
                min={1}
                value={draft.alternativeGroup}
                onChange={(e) => setDraft({ ...draft, alternativeGroup: e.target.value })}
              />
              <div className="hint">
                같은 장학에 번호가 다른 기준을 두면 <b>둘 중 하나만 만족해도 유지</b>됩니다. 보통 1입니다.
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 기준 삭제 ── */}
      {removing && (
        <Modal
          title="기준 삭제"
          sub={ruleText(removing)}
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={() => void runRemove()}
          onClose={() => setRemoving(null)}
        >
          <div className="note-box risk">
            <div className="ic">
              <Icon name="alert-triangle" size={17} />
            </div>
            <div>
              <div className="tt">같은 장학에 대안이 남아 있는지 확인하세요</div>
              <div className="tx">
                대안 중 하나만 지우면 <b>남은 조건만으로 판정</b>됩니다. 기준이 조용히 좁아집니다.
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 건별 확정 ── */}
      {deciding && (
        <Modal
          title={deciding.kind === 'except' ? '예외 인정' : '취소 확정'}
          sub={`${deciding.row.studentName}(${deciding.row.studentNo ?? '-'})`}
          confirmLabel={deciding.kind === 'except' ? '예외로 둡니다' : '장학 취소'}
          danger={deciding.kind === 'cancel'}
          busy={busy}
          /* ★ 예외 인정은 사유가 필수다 — 서버가 막고, 없으면 "왜 살려뒀나"에 답할 수 없다 */
          confirmDisabled={deciding.kind === 'except' && deciding.note.trim() === ''}
          onConfirm={() => void submitDecision()}
          onClose={() => setDeciding(null)}
        >
          <div className="frow">
            <label>판정 근거</label>
            <div style={{ fontSize: 13 }}>{deciding.row.detail ?? '-'}</div>
          </div>
          <div className="frow">
            <label className={deciding.kind === 'except' ? 'req' : undefined}>사유</label>
            <div>
              <input
                className="inp"
                value={deciding.note}
                placeholder={deciding.kind === 'except' ? '예: 병결로 결시, 진단서 확인' : '예: 기준 초과로 취소'}
                onChange={(e) => setDeciding({ ...deciding, note: e.target.value })}
              />
              <div className="hint">
                {deciding.kind === 'except'
                  ? '예외로 두는 이유를 남겨야 합니다. 나중에 근거가 됩니다.'
                  : '남겨 두면 나중에 왜 취소했는지 알 수 있습니다.'}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export const scholarshipRulesMockup: Mockup = { Content }
