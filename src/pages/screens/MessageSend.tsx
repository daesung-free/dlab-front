import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DataTable, Unfilled, useServerData, type Column, Modal } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import {
  CHANNEL_LABEL,
  EVENT_LABEL,
  RECIPIENT_LABEL,
  REVIEW_STATUS_LABEL,
  listNotificationTemplates,
  recordTemplateReviewResult,
  setTemplateActive,
  submitTemplateReview,
  templateVars,
  updateTemplateContent,
  type NotificationTemplate,
  listManualTemplates,
  previewManualSend,
  sendManual,
  type ManualPreview,
} from '../../api/notifications'
import { useAcademy } from '../../auth/AcademyContext'
import { getNotificationSummary, type NotificationSummaryRow } from '../../api/notifications'
import { createScreenSignal } from './screenSignal'
import { searchStudents, type Student } from '../../api/students'
import { listClasses, type ClassGroup } from '../../api/classes'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.4 알림 발송 — 신규개발-요구사항보완
 *
 * SMS(문자) 발송은 제외한다. 발송 채널은 카카오 알림톡 + FCM 푸시 2종뿐이다.
 *
 * ⚠ SMS를 빼면서 생기는 제약 — 화면이 이걸 드러내야 한다.
 *   알림톡은 사전 승인된 템플릿 문안만 보낼 수 있다. 자유 문안은 알림톡으로 못 나간다.
 *   따라서 자유 문안 발송 수단은 FCM 푸시 하나뿐이고, 그 결과
 *   "앱 미설치 + 템플릿에 없는 내용" 조합은 발송 수단이 존재하지 않는다.
 *   → 공지성 자유 문안은 템플릿으로 사전 등록해 두는 운영이 전제된다.
 *
 * ⚠ #19 / E-5 (최우선) — 알림톡 발신프로필·템플릿 사전승인. 승인 전에는 실발송 불가.
 *
 * ── 연동 범위 ──────────────────────────────────────────────
 * **'템플릿 관리' 탭만 실연동이다.** 서버에 있는 건 템플릿뿐이고,
 * **발송 자체와 발송 이력은 API가 없다**(API_GAPS 15부). 나머지 두 탭은 목업이다.
 *
 * ★ 템플릿은 **이벤트당 하나**다. 이벤트가 사실상 기본키라 같은 이벤트로 또 만들면 409 다.
 *   그래서 수동 발송 전용 템플릿이라는 것이 서버에는 없다 — 전부 이벤트 트리거다.
 *
 * ★ **발송 여부는 세 축이 모두 통과해야 한다**(활성·문구확정·심사). 서버가 `sendable`
 *   하나로 합쳐 주므로 화면은 그걸 쓴다. 심사 배지만 보면 "승인인데 왜 안 나가지"가 된다.
 *
 * ★ **승인된 알림톡 문구를 고치면 심사가 미제출로 되돌아간다**(실측 확인). 카카오가
 *   승인받은 문안 그대로만 허용해서다. 저장 전에 사용자에게 알린다. */

type Channel = 'ALIMTALK' | 'FCM'

const CHANNEL_META: Record<Channel, { label: string; desc: string; cls: string; icon: string }> = {
  ALIMTALK: {
    label: '카카오 알림톡',
    desc: '학부모 대상 · 사전 승인된 템플릿 문안만 발송 가능',
    cls: 'verified',
    icon: 'message-circle',
  },
  FCM: { label: 'FCM 푸시', desc: '학생 앱 설치자 대상 · 자유 문안 가능', cls: 'supplement', icon: 'smartphone' },
}




const SAMPLE: Record<string, string> = {
  학생명: '학생 F',
  시각: '08:12',
  일자: '2026-05-29',
  반: '3반',
  회차: '5월 학력평가',
  학번: '2026-0001',
}

/** 변수 자리를 예시값으로 치환한 미리보기 */
function preview(body: string): string {
  return body.replace(/\{([^}]+)\}/g, (m, k: string) => SAMPLE[k] ?? m)
}

/* ── 실연동 템플릿 컬럼. 목업 컬럼 구성을 그대로 따르고 서버에 없는 둘만 <Unfilled/> 다 ── */

const API_TEMPLATE_COLUMNS: Column<NotificationTemplate>[] = [
  /* ★ **이름을 앞에 둔다.** 전에는 `APPROVAL_APPROVED_BY_ADMIN` 같은 **개발자용 식별자**가
     첫 열이었다 — 데스크가 읽을 값이 아니다. 코드는 뒤로 보내고 작게 쓴다(서버에 문의할
     때 필요해서 지우지는 않는다). */
  {
    key: 'name',
    header: '템플릿명',
    width: '190px',
    sortable: true,
    value: (r) => EVENT_LABEL[r.event] ?? r.event,
  },
  {
    key: 'channel',
    header: '채널',
    width: '110px',
    align: 'center',
    sortable: true,
    value: (r) => CHANNEL_LABEL[r.channel] ?? r.channel,
    render: (r) => (
      <span className={`mk ${r.channel === 'KAKAO_ALIMTALK' ? 'verified' : 'supplement'}`}>
        {CHANNEL_LABEL[r.channel] ?? r.channel}
      </span>
    ),
  },
  {
    key: 'trigger',
    header: '자동발송 트리거',
    width: '150px',
    // 서버 템플릿은 전부 이벤트에 묶여 있다 — 수동 발송 전용이라는 것이 없다
    value: (r) => RECIPIENT_LABEL[r.recipientType] ?? r.recipientType,
    render: (r) => (
      <span style={{ fontSize: 11.5 }}>
        수신 {RECIPIENT_LABEL[r.recipientType] ?? r.recipientType}
      </span>
    ),
  },
  {
    key: 'status',
    header: '알림톡 심사',
    width: '104px',
    align: 'center',
    sortable: true,
    value: (r) => REVIEW_STATUS_LABEL[r.reviewStatus] ?? r.reviewStatus,
    render: (r) =>
      r.reviewStatus === 'NOT_REQUIRED' ? (
        <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>-</span>
      ) : (
        <span className={`mk ${REVIEW_TONE_BY_STATUS[r.reviewStatus] ?? 'supplement'}`}>
          {REVIEW_STATUS_LABEL[r.reviewStatus] ?? r.reviewStatus}
        </span>
      ),
  },
  {
    key: 'sendable',
    header: '발송',
    width: '92px',
    align: 'center',
    sortable: true,
    // 심사만 보면 "승인인데 왜 안 나가지"가 된다 — 활성·문구확정까지 합친 값이다
    value: (r) => (r.sendable ? '나감' : '안 나감'),
    render: (r) =>
      r.sendable ? (
        <span className="mk verified">나감</span>
      ) : (
        <span className="mk brandnew" title={blockedReason(r)}>
          안 나감
        </span>
      ),
  },
  {
    key: 'updatedAt',
    header: '최종 수정',
    width: '100px',
    align: 'center',
    // UTC 로 온다 — 한국 날짜로. 자르기만 하면 자정 근처가 하루 밀린다
    value: (r) => {
      if (!r.updatedAt) return '-'
      const d = new Date(r.updatedAt)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    },
  },
  {
    key: 'updatedBy',
    header: '수정자',
    width: '80px',
    // 2026-09-21 이전에 고친 문구는 누가 고쳤는지 기록이 없다
    value: (r) => r.updatedByName ?? '-',
  },  {
    key: 'event',
    header: '코드',
    width: '186px',
    sortable: true,
    value: (r) => r.event,
    /* 서버에 문의할 때 쓰는 값이라 남기되, 눈에 먼저 들어오지 않게 작게 */
    render: (_r, v) => <code style={{ fontSize: 10, color: 'var(--muted)' }}>{v}</code>,
  },

]

const REVIEW_TONE_BY_STATUS: Record<string, string> = {
  APPROVED: 'verified',
  SUBMITTED: 'supplement',
  REJECTED: 'brandnew',
  DRAFT: 'supplement',
  NOT_REQUIRED: 'supplement',
}

/** 왜 안 나가는지 — 세 축 중 막힌 것을 그대로 알려준다 */
function blockedReason(t: NotificationTemplate): string {
  const why: string[] = []
  if (!t.active) why.push('사용 안 함')
  if (!t.contentConfirmed) why.push('문구 미확정')
  if (t.reviewStatus === 'DRAFT') why.push('심사 미제출')
  if (t.reviewStatus === 'SUBMITTED') why.push('심사 대기')
  if (t.reviewStatus === 'REJECTED') why.push('심사 반려')
  return why.length > 0 ? why.join(' · ') : '발송 조건 미충족'
}

/* ── 발송 이력 ── */

/* 헤더 「발송 이력」 → 본문 탭. 헤더는 본문과 상태를 공유하지 못한다(screenSignal.ts) */
const logTab = createScreenSignal()

/** 오늘 기준 n일 전. 기본 조회 기간을 만든다 */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const LOG_COLUMNS: Column<NotificationSummaryRow>[] = [
  {
    key: 'sentAt',
    header: '발송일시',
    width: '150px',
    sortable: true,
    value: (r) => `${r.date} ${hhmm(r.firstAt)}`,
  },
  { key: 'template', header: '템플릿', width: '176px', value: (r) => EVENT_LABEL[r.event] ?? r.event },
  {
    key: 'channel',
    header: '채널',
    width: '120px',
    align: 'center',
    value: (r) => CHANNEL_LABEL[r.channel] ?? r.channel,
    render: (r) => (
      <span className={`mk ${r.channel === 'KAKAO_ALIMTALK' ? 'brandnew' : 'supplement'}`}>
        {CHANNEL_LABEL[r.channel] ?? r.channel}
      </span>
    ),
  },
  {
    key: 'scope',
    header: '범위',
    width: '90px',
    align: 'center',
    /* 자동 발송이라 범위를 사람이 고르지 않는다 — 사유가 대상을 정한다.
       컬럼을 지우면 "원래 없던 항목"이 되므로 비워둔 채로 남긴다(CLAUDE.md 4) */
    value: () => '',
    render: () => <Unfilled reason="자동 발송이라 범위를 고르지 않는다" />,
  },
  { key: 'targets', header: '대상', width: '72px', align: 'right', sortable: true, value: (r) => r.total },
  {
    key: 'success',
    header: '성공',
    width: '150px',
    align: 'right',
    value: (r) => r.sent,
    /* ★ 실패와 보류를 갈라 쓴다. 합쳐서 "-6" 으로만 보이면 발송이 죽은 것처럼 읽히는데,
         보류는 알림톡 템플릿 심사가 안 끝난 것이라 **심사가 통과되면 그대로 나간다.** */
    render: (r) => (
      <span style={{ color: r.sent === r.total ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
        {r.sent}
        {r.failed > 0 && <span style={{ color: 'var(--red)' }}> · 실패 {r.failed}</span>}
        {r.skipped > 0 && <span style={{ color: 'var(--muted)' }}> · 보류 {r.skipped}</span>}
      </span>
    ),
  },
  {
    key: 'by',
    header: '발송자',
    width: '84px',
    /* 사건이 생기면 서버가 보낸다 — 누른 사람이 없다 */
    value: () => '자동',
  },
]

/* ★ **대상 수를 화면에 박아 두지 않는다.** 전에는 17·12·1 이 하드코딩돼 있어
     지점을 바꿔도 숫자가 그대로였다 — 「값이 없는데 있는 척」이다(CLAUDE.md 5-1).
     이제 `/students` 의 `totalElements` 를 그대로 쓴다. */
const SCOPES = [
  { key: 'ALL', label: '전체', desc: '본사 관리자만' },
  { key: 'BRANCH', label: '지점', desc: '지점 관리자' },
  { key: 'CLASS', label: '반', desc: '담임' },
  { key: 'INDIVIDUAL', label: '개별', desc: '전체 권한' },
]

function Content() {
  // 다른 화면(출결 '출결 알림 템플릿')에서 템플릿 탭으로 바로 오게 ?tab= 을 받는다
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    return t === 'tpl' || t === 'log' ? t : 'send'
  })
  const { academyId } = useAcademy()

  /* 헤더 「발송 이력」을 누르면 그 탭으로 옮긴다. 첫 렌더의 0 은 건너뛴다 */
  const logSignal = logTab.useVersion()
  useEffect(() => {
    if (logSignal > 0) setTab('log')
  }, [logSignal])


  /* 발송 이력 탭 — 기본 30일. 기간을 안 좁히면 집계가 통째로 온다(페이징이 없다) */
  const [logFrom, setLogFrom] = useState(() => daysAgo(30))
  const [logTo, setLogTo] = useState(() => daysAgo(0))
  const logParams = useMemo(
    () => ({ academyId: academyId ?? undefined, from: logFrom, to: logTo }),
    [academyId, logFrom, logTo],
  )
  const logs = useServerData({
    fetcher: getNotificationSummary,
    params: logParams,
    // 지점을 못 고른 상태로 부르면 전 지점 권한 계정이 400을 받는다
    enabled: academyId !== null,
    errorMessage: '발송 이력을 불러오지 못했습니다.',
  })
  /* ★ 서버는 날짜 desc 안에서 사유 순으로 준다 — 시각이 16:24 · 16:42 · 16:25 로 섞여
       "정렬이 안 된 표" 로 보인다. 최근 것이 위로 오게 화면에서 다시 세운다 */
  const logRows = useMemo(
    () => [...(logs.data ?? [])].sort((a, b) => b.firstAt.localeCompare(a.firstAt)),
    [logs.data],
  )

  /* 발송 탭 */
  /* ★ 기본을 **「지점」**으로 둔다. 「반」이면 들어오자마자 「반을 먼저 고르세요」만 보여
     **화면이 빈 채로 열린다** — 전에는 가짜 숫자 12가 박혀 있어 그게 안 보였다 */
  const [scope, setScope] = useState('BRANCH')

  /* 템플릿 관리 탭 — 여기만 실연동이다 */
  const [rows, setRows] = useState<NotificationTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  /** 승인된 문안을 고칠 때 한 번 더 묻는다 — 심사가 미제출로 되돌아간다 */
  const [reconfirm, setReconfirm] = useState<number | null>(null)
  /** 카카오 템플릿 코드 입력 */
  const [codeInput, setCodeInput] = useState<{ id: number; code: string } | null>(null)
  /** 심사 반려 사유 기록 */
  const [rejectNote, setRejectNote] = useState<{ id: number; note: string } | null>(null)
  /** 모달 안에서 보여줄 실패 메시지 */
  const [modalErr, setModalErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listNotificationTemplates()
      setRows(list)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '템플릿을 불러오지 못했습니다.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* ★ 막힌 이유를 **세어서** 보여준다. 행마다 「안 나감」이 적혀 있어도
     **몇 종이 왜 막혀 있는지**는 눈으로 세어야 알 수 있다 */
  const blockedSummary = useMemo(() => {
    const blocked = rows.filter((t) => !t.sendable)
    return {
      total: blocked.length,
      noContent: blocked.filter((t) => !t.contentConfirmed).length,
      noReview: blocked.filter((t) => t.reviewStatus === 'DRAFT').length,
      /* 앱 푸시는 심사가 없다 — 문구만 오면 바로 돈다 */
      pushReady: blocked.filter((t) => t.channel === 'FCM_PUSH' && !t.contentConfirmed).length,
      missingAttendance: blocked.some((t) => t.event === 'MISSING_ATTENDANCE'),
    }
  }, [rows])

  const picked = rows.find((r) => r.id === pickedId) ?? null

  /* 목록을 다시 불러오면 편집 중이던 문구가 서버 값으로 덮이면 안 되므로,
     행을 고를 때만 초안을 채운다 */
  function pickApiTemplate(t: NotificationTemplate) {
    setPickedId(t.id)
    setTitle(t.titleTemplate ?? '')
    setBody(t.bodyTemplate ?? '')
    setNotice(null)
  }

  /** 저장·심사 조작을 한 곳에서 감싼다 — 결과 메시지를 빠뜨리지 않기 위해 */
  /** 성공하면 true. 호출부가 모달을 **성공했을 때만** 닫는 데 쓴다 */
  async function run(what: string, fn: () => Promise<NotificationTemplate>): Promise<boolean> {
    setBusy(true)
    try {
      const next = await fn()
      setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))
      setTitle(next.titleTemplate ?? '')
      setBody(next.bodyTemplate ?? '')
      setNotice(
        next.sendable
          ? `${what} 완료 — 지금 발송됩니다.`
          : `${what} 완료 — 아직 발송되지 않습니다 (${blockedReason(next)}).`,
      )
      return true
    } catch (err) {
      const msg = err instanceof ApiError ? `${what} 실패 — ${err.message}` : `${what}에 실패했습니다.`
      // 모달이 열려 있으면 그 안에서, 아니면 화면 배너로. 둘 다 채워 두고 보이는 쪽이 쓴다
      setModalErr(msg)
      setNotice(msg)
      return false
    } finally {
      setBusy(false)
    }
  }

  const scopeMeta = SCOPES.find((s) => s.key === scope)!

  /* ★ **발송 대상을 지점 → 반 → 학생 3단계로 좁힌다**(디랩 9/28 요청, 1016 알림톡 3-1).
     ★ 「전체」는 **본사 계정에서도 상단바에서 고른 지점**이다. 전 지점 발송은 사고가
       너무 크다 — 정말 전 지점으로 보내려면 서버가 그 경로를 따로 줘야 한다.
     ★ 숫자는 `totalElements` 를 그대로 쓴다. **화면이 세면 2페이지부터 틀린다.** */
  const [pickedClassId, setPickedClassId] = useState<number | null>(null)
  const [pickedStudents, setPickedStudents] = useState<string[]>([])
  const [classes, setClasses] = useState<ClassGroup[]>([])

  useEffect(() => {
    if (academyId === null) {
      setClasses([])
      return
    }
    let alive = true
    listClasses(undefined, academyId)
      .then((c) => alive && setClasses(c))
      .catch(() => alive && setClasses([]))
    return () => {
      alive = false
    }
  }, [academyId])

  /* 지점을 바꾸면 고른 반·학생을 비운다 — 안 비우면 **남의 지점 반이 고른 채로 남는다** */
  useEffect(() => {
    setPickedClassId(null)
    setPickedStudents([])
  }, [academyId])

  /* 범위를 바꿔도 비운다 — 「반」에서 고른 사람이 「개별」 발송에 섞이면 안 된다 */
  useEffect(() => {
    setPickedStudents([])
    if (scope !== 'CLASS') setPickedClassId(null)
  }, [scope])

  const targetParams = useMemo(
    () => ({
      academyId: academyId ?? undefined,
      status: 'ENROLLED' as const,
      ...(scope === 'CLASS' && pickedClassId !== null ? { classId: pickedClassId } : {}),
      size: 500,
    }),
    [academyId, scope, pickedClassId],
  )
  const targets = useServerData({
    fetcher: searchStudents,
    params: targetParams,
    /* 반을 안 고른 「반」 범위는 **전 지점을 세게 되므로** 부르지 않는다 */
    enabled: academyId !== null && (scope !== 'CLASS' || pickedClassId !== null),
    errorMessage: '발송 대상을 불러오지 못했습니다.',
  })
  const targetRows: Student[] = targets.data?.rows ?? []
  /* 개별은 **고른 사람 수**, 나머지는 **범위 안 전원** */
  const targetCount =
    scope === 'INDIVIDUAL' ? pickedStudents.length : (targets.data?.totalElements ?? targetRows.length)
  const target = { ...scopeMeta, count: targetCount }

  /* ★★ **직원 발송.** 템플릿은 **서버가 가려 준다**(`manual=true`) — 화면이 이벤트 이름으로
     추측하면 새 템플릿이 생길 때마다 화면을 고쳐야 한다.
     ⚠️ 경로가 아직 없는 동안에는 404 가 온다. 그때는 **전체 템플릿으로 떨어뜨리지 않는다** —
        자동 발송 전용 템플릿까지 고를 수 있게 되면 **보냈는데 안 나간다** */
  const [manualRows, setManualRows] = useState<NotificationTemplate[] | null>(null)
  const [manualSoon, setManualSoon] = useState(false)
  useEffect(() => {
    let alive = true
    listManualTemplates()
      .then((v) => alive && setManualRows(v))
      .catch((e) => {
        if (!alive) return
        setManualRows([])
        setManualSoon(e instanceof ApiError && e.status === 404)
      })
    return () => {
      alive = false
    }
  }, [])

  /** 템플릿이 요구하는 변수에 채워 넣는 값 */
  const [vars, setVars] = useState<Record<string, string>>({})
  /** 미리보기 결과. ★ **이게 있어야만 발송 버튼이 열린다** */
  const [prev, setPrev] = useState<ManualPreview | null>(null)
  const [prevBusy, setPrevBusy] = useState(false)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  /** 보내기 전 마지막 확인. 되돌릴 수 없다 */
  const [confirming, setConfirming] = useState(false)

  /* ★ 드롭다운이 서버 템플릿이 됐으므로 **아래 미리보기도 그 값을 따라가야 한다.**
     따로 두면 「고른 것과 보이는 내용이 다른」 화면이 된다 */
  const sendRows = manualRows ?? []
  const sendPick = sendRows.find((r) => r.id === pickedId) ?? null
  /** 템플릿이 요구하는 변수 목록 */
  const needVars = sendPick ? templateVars(sendPick) : []

  /* ★★ **조건이 바뀌면 미리보기를 버린다.** 안 버리면 **본 것과 다른 사람에게 나간다** —
     대상을 바꿔 놓고 옛 미리보기로 발송 버튼을 누를 수 있게 된다. 서버도 `previewId` 로만
     받으므로 화면이 여기서 끊어야 한다 */
  useEffect(() => {
    setPrev(null)
    setSendErr(null)
    setSent(null)
  }, [pickedId, scope, pickedClassId, pickedStudents, academyId, vars])

  /** 템플릿을 바꾸면 변수도 비운다 — 앞 템플릿 값이 남으면 엉뚱한 월이 나간다 */
  useEffect(() => {
    setVars({})
  }, [pickedId])

  async function runPreview() {
    if (sendPick === null || academyId === null) return
    setPrevBusy(true)
    setSendErr(null)
    try {
      setPrev(
        await previewManualSend({
          templateId: sendPick.id,
          academyId,
          scope: scope === 'INDIVIDUAL' ? 'SELECTED' : (scope as 'BRANCH' | 'CLASS'),
          ...(scope === 'CLASS' && pickedClassId !== null ? { classId: pickedClassId } : {}),
          ...(scope === 'INDIVIDUAL' ? { enrollmentIds: pickedStudents.map(Number) } : {}),
          variables: vars,
        }),
      )
    } catch (e) {
      /* ★ 404 는 우리 사정이다 — 「경로를 찾을 수 없습니다」를 담당자에게 띄우지 않는다 */
      setSendErr(
        e instanceof ApiError && e.status === 404
          ? '직접 발송은 준비 중입니다.'
          : e instanceof ApiError
            ? e.message
            : '미리보기를 불러오지 못했습니다.',
      )
    } finally {
      setPrevBusy(false)
    }
  }

  async function runSend() {
    if (prev === null) return
    setPrevBusy(true)
    setSendErr(null)
    try {
      const r = await sendManual(prev.previewId)
      setSent(
        r.skipped > 0
          ? `${r.requested}명에게 발송했습니다. ${r.skipped}명은 보내지 못했습니다 — 발송 이력에서 확인하세요.`
          : `${r.requested}명에게 발송했습니다.`,
      )
      /* ★ 보낸 미리보기는 **다시 쓸 수 없다**(서버가 한 번만 받는다). 화면에서도 지워
         **두 번째 발송 버튼이 아예 안 보이게** 한다 */
      setPrev(null)
    } catch (e) {
      setSendErr(e instanceof ApiError ? e.message : '발송하지 못했습니다.')
    } finally {
      setPrevBusy(false)
      setConfirming(false)
    }
  }
  /* 서버 채널(KAKAO_ALIMTALK·FCM_PUSH) → 화면 채널 */
  const channel: Channel = sendPick?.channel === 'FCM_PUSH' ? 'FCM' : 'ALIMTALK'

  /* ★ **「지금 실제로 나가는가」는 서버가 `sendable` 하나로 내려준다** — 활성·문구확정·심사
     세 축이 모두 통과해야 true 다. 화면이 축을 따로 보면 「왜 알림이 안 가지」를 못 짚는다 */
  const blocked = sendPick ? !sendPick.sendable : true

  // 통계는 실제 템플릿 기준이다. 발송 탭이 목업이어도 이 숫자는 서버 값이어야 한다
  const counts = useMemo(
    () => ({
      alimtalk: rows.filter((t) => t.channel === 'KAKAO_ALIMTALK').length,
      approved: rows.filter((t) => t.reviewStatus === 'APPROVED').length,
      waiting: rows.filter((t) => t.reviewStatus === 'SUBMITTED').length,
      rejected: rows.filter((t) => t.reviewStatus === 'REJECTED').length,
      sendable: rows.filter((t) => t.sendable).length,
    }),
    [rows],
  )


  return (
    <>
      {reconfirm !== null && (
        <Modal
          title="승인받은 문안입니다"
          sub="고치면 심사를 다시 받아야 하고, 그때까지 이 알림은 나가지 않습니다."
          confirmLabel="저장하고 재심사"
          danger
          busy={busy}
          error={modalErr}
          onConfirm={() =>
            void run('문안 확정', () =>
              updateTemplateContent(reconfirm, {
                titleTemplate: title,
                bodyTemplate: body,
                contentConfirmed: true,
              }),
            ).then((ok) => ok && setReconfirm(null))
          }
          onClose={() => { setModalErr(null); setReconfirm(null) }}
        />
      )}

      {codeInput && (
        <Modal
          title="카카오 템플릿 코드"
          sub="카카오에 등록할 때 발급받은 코드를 그대로 입력하세요."
          confirmLabel="심사 제출"
          busy={busy}
          confirmDisabled={codeInput.code.trim() === ''}
          error={modalErr}
          onConfirm={() =>
            void run('심사 제출', () => submitTemplateReview(codeInput.id, codeInput.code.trim())).then(
              (ok) => ok && setCodeInput(null),
            )
          }
          onClose={() => { setModalErr(null); setCodeInput(null) }}
        >
          <div className="frow">
            <label className="req">코드</label>
            <input
              className="inp"
              value={codeInput.code}
              maxLength={40}
              onChange={(e) => setCodeInput({ ...codeInput, code: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {rejectNote && (
        <Modal
          title="심사 반려 기록"
          sub="카카오가 알려준 반려 사유를 적어 두면 다음에 고칠 때 참고할 수 있습니다."
          confirmLabel="기록"
          busy={busy}
          error={modalErr}
          onConfirm={() =>
            void run('심사 반려 기록', () =>
              recordTemplateReviewResult(rejectNote.id, false, rejectNote.note.trim() || undefined),
            ).then((ok) => ok && setRejectNote(null))
          }
          onClose={() => { setModalErr(null); setRejectNote(null) }}
        >
          <div className="frow">
            <label>사유</label>
            <textarea
              className="ta"
              value={rejectNote.note}
              maxLength={200}
              onChange={(e) => setRejectNote({ ...rejectNote, note: e.target.value })}
            />
          </div>
        </Modal>
      )}

      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="file-text" size={13} /> 등록 템플릿
          </div>
          <div className="v">{rows.length}</div>
          <div className="d">알림톡 {counts.alimtalk} · 푸시 {rows.length - counts.alimtalk}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="check-check" size={13} /> 심사 승인
          </div>
          <div className="v" style={{ color: 'var(--green)' }}>
            {counts.approved}
          </div>
          <div className="d up">즉시 발송 가능</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="clock" size={13} /> 심사 대기
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {counts.waiting}
          </div>
          <div className="d warn">승인 전 발송 불가</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 반려
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {counts.rejected}
          </div>
          <div className="d down">문안 수정 후 재제출</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="zap" size={13} /> 발송 중
          </div>
          {/* 심사만 보면 "승인인데 왜 안 나가지"가 된다 — 세 축을 합친 값이다 */}
          <div className="v" style={{ color: counts.sendable > 0 ? 'var(--green)' : 'var(--red)' }}>
            {counts.sendable}
          </div>
          <div className="d">활성 · 문구확정 · 심사 통과</div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'send', label: '메시지 발송' },
          { key: 'tpl', label: '템플릿 관리', count: rows.length },
          { key: 'log', label: '발송 이력', count: logRows.length },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {/* ═══ 메시지 발송 ═══ */}
      {/* ★ 배너를 **경로가 없을 때만** 띄운다. 붙은 뒤에도 「아직 안 나갑니다」가 남아 있으면
            담당자가 **진짜로 나간 발송을 연습이라고 읽는다.**
         ★ 발송 이력은 실연동됐다 — 배너를 같이 씌우면 진짜 기록을 예시로 읽게 된다 */}
      {tab === 'send' && manualSoon && (
        <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
          <div className="ic">
            <Icon name="triangle-alert" size={17} />
          </div>
          <div>
            <div className="tt">직접 발송은 준비 중입니다</div>
            <div className="tx">
              알림은 등원·승인·상담 같은 사건이 일어날 때 <b>자동으로</b> 나갑니다. 직원이 때를 골라
              보내는 기능은 <b>준비 중</b>입니다.
              {/* ★ 발송 이력은 **실연동됐다** — 「기록되지 않는다」고 적어 두면 진짜 기록을 예시로 읽는다 */}
              <br />
              템플릿은 <b>「템플릿 관리」 탭의 실제 값</b>이고, <b>「발송 이력」도 실제 기록</b>입니다.
            </div>
          </div>
        </div>
      )}

      {tab === 'send' && (
        <div className="split-3-2">
          <div className="card-sec">
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="send" size={15} />
                </span>
                메시지 발송
              </div>
              <div className="r">
                <span className="mk supplement">대상 {target.count.toLocaleString()}명</span>
              </div>
            </div>
            <div className="card-sec-b">
              <div className="frow">
                <label className="req">발송 범위</label>
                <div className="type-picks">
                  {SCOPES.map((s) => (
                    <button
                      type="button"
                      key={s.key}
                      className={`type-pick${scope === s.key ? ' on' : ''}`}
                      onClick={() => setScope(s.key)}
                      title={`발송 권한: ${s.desc}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="frow">
                <label>권한</label>
                <div style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 9 }}>
                  발송 권한 <b>{target.desc}</b>
                  {' · '}전체=본사 / 지점=지점관리자 / 반=담임
                </div>
              </div>

              {/* ★ 2단계 — 반. 「반」 범위일 때만 묻는다 */}
              {scope === 'CLASS' && (
                <div className="frow">
                  <label className="req">반</label>
                  <div>
                    <select
                      className="sel"
                      value={pickedClassId ?? ''}
                      onChange={(e) => setPickedClassId(e.target.value === '' ? null : Number(e.target.value))}
                    >
                      <option value="">반 선택</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {classes.length === 0 && (
                      <div className="hint">이 지점에 등록된 반이 없습니다.</div>
                    )}
                  </div>
                </div>
              )}

              {/* ★ 3단계 — 학생. 「개별」일 때만. **한 명씩 고른 사람에게만** 나간다 */}
              {scope === 'INDIVIDUAL' && (
                <div className="frow">
                  <label className="req">학생</label>
                  <div>
                    <div className="pick-list">
                      {targets.loading ? (
                        <div className="hint">불러오는 중…</div>
                      ) : targetRows.length === 0 ? (
                        <div className="hint">보낼 수 있는 학생이 없습니다.</div>
                      ) : (
                        targetRows.map((r) => {
                          const key = String(r.enrollmentId)
                          const on = pickedStudents.includes(key)
                          return (
                            <label key={key} className={`pick-row${on ? ' on' : ''}`}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={(e) =>
                                  setPickedStudents((v) =>
                                    e.target.checked ? [...v, key] : v.filter((x) => x !== key),
                                  )
                                }
                              />
                              <span>
                                {r.name} · {r.studentNo ?? '미배정'}
                                {r.className ? ` · ${r.className}` : ''}
                              </span>
                            </label>
                          )
                        })
                      )}
                    </div>
                    {targetRows.length > 0 && (
                      <div className="hint">
                        {pickedStudents.length}명 골랐습니다.
                        {pickedStudents.length > 0 && (
                          <button
                            type="button"
                            className="lnk"
                            style={{ marginLeft: 8 }}
                            onClick={() => setPickedStudents([])}
                          >
                            모두 해제
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ★ **누구에게 나가는지**를 숫자 하나로 말한다. 고르기 전에는 묻는다 */}
              <div className="frow">
                <label>발송 대상</label>
                <div style={{ paddingTop: 9 }}>
                  {scope === 'CLASS' && pickedClassId === null ? (
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>반을 먼저 고르세요.</span>
                  ) : targets.loading ? (
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>세는 중…</span>
                  ) : targets.error ? (
                    <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{targets.error}</span>
                  ) : (
                    <>
                      <b style={{ fontSize: 15 }}>{target.count.toLocaleString()}명</b>
                      <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
                        재원 중인 학생만 셉니다.
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* ★ 전에는 **화면에 박아 둔 예시 8개**를 띄우고 있었다. 디랩이 그걸 실제 기능으로
                     읽고 「초안 6개 말고 더 있는 것 같다」고 문의했다 — **없는 것을 있는 것처럼**
                     보여준 셈이다. 서버 템플릿(「템플릿 관리」 탭과 같은 값)으로 바꾼다 */}
              <div className="frow">
                <label className="req">템플릿</label>
                <div>
                  <select
                    className="sel"
                    value={pickedId ?? ''}
                    onChange={(e) => setPickedId(e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">템플릿 선택</option>
                    {sendRows.map((t) => (
                      <option key={t.id} value={t.id}>
                        {EVENT_LABEL[t.event] ?? t.event} · {CHANNEL_LABEL[t.channel] ?? t.channel}
                        {/* ★ 「지금 실제로 나가는가」는 활성·문구확정·심사 세 축이 다 통과해야 한다 —
                               서버가 `sendable` 하나로 내려주므로 그걸 그대로 쓴다 */}
                        {t.sendable ? '' : ' — 발송 불가'}
                      </option>
                    ))}
                  </select>
                  {sendRows.length === 0 && manualRows !== null && (
                    <div className="hint">
                      {manualSoon
                        ? '직접 발송은 준비 중입니다.'
                        : '직접 보낼 수 있는 템플릿이 없습니다. 대부분의 알림은 사건이 일어날 때 자동으로 나갑니다.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="frow">
                <label>채널</label>
                <div style={{ paddingTop: 8 }}>
                  <span className={`mk ${CHANNEL_META[channel].cls}`}>
                    <Icon name={CHANNEL_META[channel].icon} size={11} /> {CHANNEL_META[channel].label}
                  </span>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                    채널은 템플릿에 고정돼 있습니다. {CHANNEL_META[channel].desc}
                  </div>
                </div>
              </div>

              {/* ★ **받는 사람은 템플릿이 정한다.** 발송할 때 고르게 하지 않는다 —
                     수신자는 그 문구의 일부다(「#{학생명} 학생의 등록비가…」를 학생 본인에게
                     보내면 문장이 어긋난다). 다만 **누구에게 가는지는 보고 보내야** 한다 */}
              {sendPick && (
                <div className="frow">
                  <label>받는 사람</label>
                  <div style={{ paddingTop: 9 }}>
                    <b style={{ fontSize: 13 }}>{RECIPIENT_LABEL[sendPick.recipientType]}</b>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>
                      템플릿에 정해져 있습니다. 바꾸려면 「템플릿 관리」 탭에서 고칩니다.
                    </div>
                  </div>
                </div>
              )}

              {sendPick && (
                <div className="frow">
                  <label>자동발송</label>
                  <div className="link-box">
                    <div className="chk">
                      <Icon name="zap" size={12} />
                    </div>
                    <div>
                      <code style={{ fontSize: 11 }}>{EVENT_LABEL[sendPick.event] ?? sendPick.event}</code> 이벤트에 연동된{' '}
                      <b>자동발송 템플릿</b>입니다. 수동 발송 시에도 같은 문안이 나가며, 문구 수정은{' '}
                      <b>템플릿 관리</b> 탭에서 합니다.
                    </div>
                  </div>
                </div>
              )}

              <div className="frow">
                <label className="req">내용</label>
                <div>
                  <textarea
                    className="ta"
                    value={sendPick?.bodyTemplate ?? ''}
                    /* ★ **여기서 못 고친다.** 문구는 「템플릿 관리」 탭에서 고치고 재심사를 받는다 —
                       여기서 고치게 두면 **승인된 문안과 다른 글이 나가는** 것처럼 보인다 */
                    readOnly
                    placeholder="템플릿을 고르면 내용이 보입니다."
                    onChange={() => {}}
                  />
                  {true && (
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                      문구는 <b>「템플릿 관리」 탭</b>에서 고칩니다. 알림톡은 <b>승인된 문안만</b> 나가므로
                      고친 뒤 재심사를 받아야 합니다.
                    </div>
                  )}
                </div>
              </div>

              {/* ★ 템플릿이 요구하는 변수만 묻는다. 문구에 없는 칸을 받으면 어디에 쓰이는지
                     알 수 없고, 빠뜨리면 **「#{월}」이 그대로 나간다** — 서버도 막지만
                     보내기 전에 화면에서 먼저 센다 */}
              {needVars.length > 0 && (
                <div className="frow">
                  <label className="req">문구에 넣을 값</label>
                  <div>
                    {needVars.map((v) => (
                      <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, minWidth: 92, color: 'var(--ink-2)' }}>{v}</span>
                        <input
                          className="inp"
                          maxLength={60}
                          value={vars[v] ?? ''}
                          onChange={(e) => setVars((o) => ({ ...o, [v]: e.target.value }))}
                        />
                      </div>
                    ))}
                    <div className="hint">문구의 그 자리에 그대로 들어갑니다.</div>
                  </div>
                </div>
              )}

              <div className="frow">
                <label>&nbsp;</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* ★★ **미리보기를 거치지 않으면 보낼 수 없다.** 서버도 `previewId` 로만
                      받는다 — 조건을 발송 때 다시 보내면 **본 것과 다른 사람에게 나간다** */}
                  {prev === null ? (
                    <button
                      className="btn pri"
                      disabled={
                        prevBusy ||
                        sendPick === null ||
                        blocked ||
                        target.count === 0 ||
                        needVars.some((v) => (vars[v] ?? '').trim() === '')
                      }
                      onClick={() => void runPreview()}
                    >
                      <Icon name="monitor" size={14} /> {prevBusy ? '확인 중…' : '보낼 내용 확인'}
                    </button>
                  ) : (
                    <button
                      className="btn pri"
                      disabled={prevBusy || prev.missingVariables.length > 0 || prev.targetCount === 0}
                      onClick={() => setConfirming(true)}
                    >
                      <Icon name="send" size={14} /> {prev.targetCount.toLocaleString()}명에게 발송
                    </button>
                  )}
                  {blocked ? (
                    <span style={{ fontSize: 11.5, color: 'var(--red)', fontWeight: 700 }}>
                      {sendPick ? '아직 발송할 수 있는 상태가 아닙니다' : '템플릿을 먼저 고르세요'}
                    </span>
                  ) : (
                    target.count === 0 && (
                      <span style={{ fontSize: 11.5, color: 'var(--red)', fontWeight: 700 }}>
                        {scope === 'INDIVIDUAL' ? '학생을 고르세요' : '보낼 대상이 없습니다'}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card-sec">
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="monitor" size={15} />
                </span>
                발송 미리보기
              </div>
            </div>
            <div className="card-sec-b">
              <div
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                  padding: 14,
                  background: channel === 'ALIMTALK' ? '#fef7d4' : 'var(--bg)',
                  minHeight: 120,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                  <Icon name={CHANNEL_META[channel].icon} size={14} />
                  <b style={{ fontSize: 12 }}>{CHANNEL_META[channel].label}</b>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>
                    {channel === 'ALIMTALK' ? '학부모 수신' : '학생 앱 수신'}
                  </span>
                </div>
                {/* ★ 미리보기를 받았으면 **서버가 변수를 채운 문장**을 보여준다. 화면이 채운
                       것을 보여주면 **본 것과 실제로 나가는 것이 다를 수 있다** */}
                <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
                  {(prev?.rendered.body ?? preview(sendPick?.bodyTemplate ?? '')) || (
                    <span style={{ color: 'var(--muted)' }}>템플릿을 고르면 내용이 보입니다.</span>
                  )}
                </div>
              </div>

              {sendErr !== null && (
                <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)', marginTop: 12 }}>
                  <div>{sendErr}</div>
                </div>
              )}

              {sent !== null && (
                <div className="note-box" role="status" style={{ marginTop: 12 }}>
                  <div>{sent}</div>
                </div>
              )}

              {prev !== null && (
                <>
                  <div className="note-box" style={{ marginTop: 12 }}>
                    <div>
                      <b>{prev.targetCount.toLocaleString()}명</b>에게 나갑니다. 위 문장 그대로 발송됩니다.
                    </div>
                  </div>

                  {/* ★★ **빠지는 사람을 반드시 보여준다.** 「30명」이라고 했는데 28명에게
                         가면 담당자는 영영 모른다. 사유는 서버 문장을 그대로 쓴다 */}
                  {prev.blocked.length > 0 && (
                    <div className="note-box risk" style={{ marginTop: 10 }}>
                      <div className="ic">
                        <Icon name="triangle-alert" size={17} />
                      </div>
                      <div>
                        <div className="tt">{prev.blocked.length}명에게는 가지 않습니다</div>
                        <div className="tx">
                          {prev.blocked.slice(0, 8).map((b) => (
                            <div key={`${b.studentName}-${b.reason}`}>
                              {b.studentName} — {b.message}
                            </div>
                          ))}
                          {prev.blocked.length > 8 && <div>그 밖 {prev.blocked.length - 8}명</div>}
                        </div>
                      </div>
                    </div>
                  )}

                  {prev.missingVariables.length > 0 && (
                    <div className="note-box risk" style={{ marginTop: 10 }}>
                      <div>
                        아직 채우지 않은 값이 있습니다 — <b>{prev.missingVariables.join(' · ')}</b>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="note-box warn" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="ic">
                  <Icon name="info" size={17} />
                </div>
                <div>
                  <div className="tt">SMS 발송은 제공하지 않습니다</div>
                  <div className="tx">
                    발송 채널은 <b>알림톡 · 푸시 2종</b>입니다. 알림톡은 승인 문안만 나가므로 <b>자유 문안은 푸시로만</b>{' '}
                    발송됩니다. 즉 <b>앱 미설치 학생에게 템플릿에 없는 내용</b>을 보낼 수단은 없으므로, 공지성 문안은
                    템플릿으로 미리 등록해 두는 운영이 필요합니다.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ★★ 되돌릴 수 없다. 알림톡은 보내는 즉시 나가고 취소가 없다 —
             **몇 명에게 나가는지**를 버튼 문구에 그대로 쓴다 */}
      {confirming && prev !== null && (
        <Modal
          title={`${prev.targetCount.toLocaleString()}명에게 발송할까요?`}
          sub="보내면 되돌릴 수 없습니다."
          confirmLabel={`${prev.targetCount.toLocaleString()}명에게 발송`}
          busy={prevBusy}
          onConfirm={() => void runSend()}
          onClose={() => setConfirming(false)}
        >
          <div className="note-box">
            <div style={{ whiteSpace: 'pre-wrap' }}>{prev.rendered.body}</div>
          </div>
          {prev.blocked.length > 0 && (
            <div className="hint">{prev.blocked.length}명은 번호가 없거나 수신을 거부해 빠집니다.</div>
          )}
        </Modal>
      )}

      {/* ═══ 템플릿 관리 — 이 탭만 실연동이다 ═══ */}
      {tab === 'tpl' && (
        <div className="split-3-2">
          <div>
            {loadError && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {loadError}
              </div>
            )}
            {/* ★★ **하나도 안 나가고 있는데 표만 보면 모른다.** 행마다 「안 나감」이
                적혀 있어도 **몇 종이 왜 막혀 있는지**는 세어 봐야 안다.
                ★ 특히 **미등원 안내**가 막혀 있으면 **무단결석 학부모에게 아무 연락도
                  가지 않는다** — SMS 폴백도 폐기돼 대체 경로가 없다(E-5). 따로 띄운다. */}
            {rows.length > 0 && blockedSummary.total > 0 && (
              <div className="note-box risk">
                <div className="ic">
                  <Icon name="triangle-alert" size={17} />
                </div>
                <div>
                  <div className="tt">{blockedSummary.total}종이 나가지 않습니다</div>
                  <div className="tx">
                    {blockedSummary.noContent > 0 && (
                      <>
                        문구가 아직 안 들어온 것 <b>{blockedSummary.noContent}종</b>
                        {blockedSummary.noReview > 0 && ' · '}
                      </>
                    )}
                    {blockedSummary.noReview > 0 && (
                      <>
                        카카오 심사를 안 받은 것 <b>{blockedSummary.noReview}종</b>
                      </>
                    )}
                    {blockedSummary.pushReady > 0 && (
                      <div style={{ marginTop: 4 }}>
                        이 중 <b>앱 푸시 {blockedSummary.pushReady}종</b>은 심사가 없어 <b>문구만 들어오면</b>{' '}
                        바로 나갑니다.
                      </div>
                    )}
                    {blockedSummary.missingAttendance && (
                      <div style={{ marginTop: 6, fontWeight: 700 }}>
                        ⚠️ 미등원 안내가 막혀 있습니다 — 지금은 무단결석 학부모에게 아무 연락도 가지
                        않습니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <DataTable
              columns={API_TEMPLATE_COLUMNS}
              rows={rows}
              rowKey={(r) => String(r.id)}
              masked={false}
              loading={loading}
              pageSize={10}
              onRowClick={pickApiTemplate}
              countLabel={
                <>
                  템플릿 <b>{rows.length}</b>건 · 발송 중 <b>{counts.sendable}</b>건 · 행을 누르면 편집합니다
                </>
              }
              toolbar={
                <>
                  {/* 서버는 템플릿을 이벤트당 하나만 둔다. 11개 이벤트가 이미 다 차 있어
                      새로 만들 자리가 없다 — 목업 버튼은 두되 이유를 붙여 막는다 */}
                  <button className="btn" disabled title="심사는 템플릿마다 카카오 템플릿 코드가 필요해 일괄로 낼 수 없습니다">
                    <Icon name="upload" size={14} /> 심사 일괄 제출
                  </button>
                  <button className="btn pri" disabled title="이벤트마다 템플릿이 하나씩 이미 있습니다">
                    <Icon name="plus" size={14} /> 템플릿 등록
                  </button>
                </>
              }
            />
          </div>

          <div className="card-sec">
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="pencil" size={15} />
                </span>
                {picked ? (EVENT_LABEL[picked.event] ?? picked.event) : '템플릿을 고르세요'}
              </div>
              <div className="r">
                {picked && picked.reviewStatus !== 'NOT_REQUIRED' && (
                  <span className={`mk ${REVIEW_TONE_BY_STATUS[picked.reviewStatus] ?? 'supplement'}`}>
                    {REVIEW_STATUS_LABEL[picked.reviewStatus] ?? picked.reviewStatus}
                  </span>
                )}
              </div>
            </div>

            {!picked && (
              <div className="card-sec-b">
                <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: '18px 2px' }}>
                  왼쪽 목록에서 템플릿을 고르면 문안을 편집할 수 있습니다.
                </div>
              </div>
            )}

            {picked && (
              <div className="card-sec-b">
                {/* 왜 안 나가는지를 맨 위에 둔다. 심사 배지만 보면 원인을 못 짚는다 */}
                <div
                  className="note-box"
                  style={{ borderColor: picked.sendable ? 'var(--green)' : 'var(--amber)', marginTop: 0 }}
                >
                  <div className="ic">
                    <Icon name={picked.sendable ? 'check-check' : 'triangle-alert'} size={17} />
                  </div>
                  <div>
                    <div className="tt">
                      {picked.sendable ? '지금 발송되는 템플릿입니다' : '지금은 발송되지 않습니다'}
                    </div>
                    <div className="tx">
                      {picked.sendable
                        ? '사용 중이고 문안이 확정됐으며 심사도 통과했습니다.'
                        : `${blockedReason(picked)} — 세 가지(사용 여부 · 문안 확정 · 심사)가 모두 갖춰져야 발송됩니다.`}
                    </div>
                  </div>
                </div>

                {notice && (
                  <div className="note-box" role="status" style={{ borderColor: 'var(--violet)' }}>
                    {notice}
                  </div>
                )}

                <div className="frow">
                  <label>코드</label>
                  <div style={{ paddingTop: 9 }}>
                    <code style={{ fontSize: 11 }}>{picked.event}</code>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      이 사건이 일어나면 자동으로 나갑니다. 코드는 바뀌지 않습니다.
                    </div>
                  </div>
                </div>

                <div className="frow">
                  <label>채널</label>
                  <div style={{ paddingTop: 9, fontSize: 12.5 }}>
                    {CHANNEL_LABEL[picked.channel] ?? picked.channel}
                    <span style={{ color: 'var(--muted)' }}>
                      {' · '}
                      {RECIPIENT_LABEL[picked.recipientType] ?? picked.recipientType} 수신
                    </span>
                  </div>
                </div>

                <div className="frow">
                  <label>치환 변수</label>
                  <div className="sf-chips" style={{ paddingTop: 5 }}>
                    {templateVars(picked).length === 0 && (
                      <span style={{ color: 'var(--muted)', fontSize: 11.5, paddingTop: 4 }}>지정된 변수가 없습니다</span>
                    )}
                    {templateVars(picked).map((v) => (
                      <button type="button" key={v} className="chip" onClick={() => setBody((d) => `${d}{${v}}`)}>
                        {'{'}
                        {v}
                        {'}'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="frow">
                  <label>제목</label>
                  <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div className="frow">
                  <label className="req">문안</label>
                  <textarea className="ta" value={body} onChange={(e) => setBody(e.target.value)} />
                </div>

                <div className="frow">
                  <label>미리보기</label>
                  <div
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 11,
                      padding: '11px 13px',
                      background: picked.channel === 'KAKAO_ALIMTALK' ? '#fef7d4' : 'var(--bg)',
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {preview(body) || <span style={{ color: 'var(--muted)' }}>문안을 입력하세요.</span>}
                  </div>
                </div>

                <div className="frow">
                  <label>&nbsp;</label>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        void run('임시 저장', () =>
                          updateTemplateContent(picked.id, {
                            titleTemplate: title,
                            bodyTemplate: body,
                            contentConfirmed: false,
                          }),
                        )
                      }
                    >
                      임시 저장
                    </button>
                    <button
                      className="btn pri"
                      disabled={busy || body.trim() === ''}
                      // 승인된 알림톡 문안을 고치면 심사가 미제출로 되돌아간다 — 먼저 알린다
                      onClick={() => {
                        if (picked.channel === 'KAKAO_ALIMTALK' && picked.reviewStatus === 'APPROVED') {
                          setReconfirm(picked.id)
                          return
                        }
                        void run('문안 확정', () =>
                          updateTemplateContent(picked.id, {
                            titleTemplate: title,
                            bodyTemplate: body,
                            contentConfirmed: true,
                          }),
                        )
                      }}
                    >
                      <Icon name="save" size={14} /> 문안 확정
                    </button>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => void run(picked.active ? '사용 중지' : '사용 시작', () => setTemplateActive(picked.id, !picked.active))}
                    >
                      {picked.active ? '사용 중지' : '사용 시작'}
                    </button>
                  </div>
                </div>

                {/* 알림톡만 카카오 심사를 탄다. 자동 연동 창구가 없어 결과를 사람이 넣는다 */}
                {picked.channel === 'KAKAO_ALIMTALK' && (
                  <div className="frow">
                    <label>카카오 심사</label>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', paddingTop: 4 }}>
                      <button
                        className="btn"
                        disabled={busy || !picked.contentConfirmed}
                        title={picked.contentConfirmed ? undefined : '문안을 확정한 뒤 제출할 수 있습니다'}
                        onClick={() => {
                          setCodeInput({ id: picked.id, code: picked.kakaoTemplateCode ?? '' })
                        }}
                      >
                        <Icon name="upload" size={14} /> 심사 제출
                      </button>
                      <button
                        className="btn"
                        disabled={busy || picked.reviewStatus !== 'SUBMITTED'}
                        title={picked.reviewStatus === 'SUBMITTED' ? undefined : '제출한 템플릿에만 결과를 넣을 수 있습니다'}
                        onClick={() => void run('심사 승인 기록', () => recordTemplateReviewResult(picked.id, true))}
                      >
                        승인됨
                      </button>
                      <button
                        className="btn"
                        style={{ color: 'var(--red)' }}
                        disabled={busy || picked.reviewStatus !== 'SUBMITTED'}
                        onClick={() => {
                          setRejectNote({ id: picked.id, note: '' })
                        }}
                      >
                        반려됨
                      </button>
                    </div>
                  </div>
                )}

                {picked.reviewNote && (
                  <div className="frow">
                    <label>심사 메모</label>
                    <div style={{ paddingTop: 9, fontSize: 12.5 }}>{picked.reviewNote}</div>
                  </div>
                )}

                {picked.channel === 'KAKAO_ALIMTALK' && (
                  <div className="blocked-note" style={{ marginTop: 4, marginBottom: 0 }}>
                    <div className="ic">
                      <Icon name="triangle-alert" size={16} />
                    </div>
                    <div>
                      <div className="tt">문안을 고치면 심사를 다시 받아야 합니다</div>
                      <div className="tx">
                        카카오는 <b>승인받은 문안 그대로만</b> 발송을 허용합니다. 오타 하나를 고쳐도 심사가
                        미제출로 돌아가고, 다시 승인될 때까지 이 템플릿은 나가지 않습니다.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ 발송 이력 ═══ */}
      {tab === 'log' && (
        <>
          {/* 사람이 골라 보내는 발송이 아직 없다는 것을 여기서 한 번 짚는다 —
              표에 '발송자: 자동'만 늘어서면 "내가 보낸 건 왜 없지" 가 된다 */}
          <div className="note-box">
            <div className="tx">
              등원·승인·상담 같은 <b>사건이 일어날 때 자동으로 나간 알림</b>이 날짜·사유별로 묶여
              있습니다. 보류는 카카오 템플릿 심사가 끝나지 않은 건으로, 심사가 통과되면 그대로 나갑니다.
            </div>
          </div>

          {logs.error && (
            <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              {logs.error}
            </div>
          )}

          <DataTable
            columns={LOG_COLUMNS}
            rows={logRows}
            rowKey={(r) => `${r.date}-${r.event}-${r.channel}`}
            masked={false}
            loading={logs.loading}
            pageSize={12}
            countLabel={
              <>
                발송 묶음 <b>{logRows.length}</b>건 · 총{' '}
                <b>{logRows.reduce((n, r) => n + r.total, 0).toLocaleString()}</b>통
              </>
            }
            toolbar={
              <>
                <input
                  className="inp"
                  style={{ width: 138 }}
                  type="date"
                  value={logFrom}
                  max={logTo}
                  onChange={(e) => setLogFrom(e.target.value)}
                  aria-label="조회 시작일"
                />
                <span style={{ color: 'var(--muted)' }}>~</span>
                <input
                  className="inp"
                  style={{ width: 138 }}
                  type="date"
                  value={logTo}
                  min={logFrom}
                  onChange={(e) => setLogTo(e.target.value)}
                  aria-label="조회 종료일"
                />
              </>
            }
          />
        </>
      )}
    </>
  )
}

export const messageMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" onClick={() => logTab.bump()} title="발송 이력 탭으로 이동합니다">
        <Icon name="history" size={14} /> 발송 이력
      </button>
      <button className="btn pri" disabled data-soon title="준비 중입니다">
        <Icon name="send" size={14} /> 새 발송
      </button>
    </>
  ),
}
