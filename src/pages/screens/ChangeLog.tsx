import { useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  SearchForm,
  Unfilled,
  todayStr,
  useServerTable,
  type Column,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { listAuditLogs, type AuditAction, type AuditLog } from '../../api/auditLogs'
import type { Mockup } from './types'

/* 학원생 관리 > 메모/기타 > 금일 수정 이력 — 클라이언트 메뉴표 기준 추가 화면
 *
 * "오늘 누가 무엇을 바꿨는가"를 되짚는 감사(audit) 화면이다.
 * 원본 화면이 왜 필요한지: 원생 정보·수납·출결은 여러 직원이 동시에 만지므로
 * 값이 틀어졌을 때 되돌릴 근거가 없으면 운영이 막힌다.
 *
 * ⚠ BE 전제 — 이 화면은 별도 테이블이 아니라 공통 변경이력 적재 규약이 있어야 성립한다.
 *   · 모든 도메인 UPDATE/DELETE 시 audit_logs 에 (before, after) JSON 스냅샷 적재
 *   · 적재 위치는 서비스 레이어가 아니라 JPA EntityListener / AOP 로 일괄 처리할 것
 *     (화면마다 수기로 넣으면 반드시 누락된다)
 *   · 조회 기본값 = 오늘. 보존기간은 개인정보 처리방침에 맞춰 확정 필요 */

type Action = 'CREATE' | 'UPDATE' | 'DELETE'

const ACTION_META: Record<Action, { label: string; cls: string; icon: string }> = {
  CREATE: { label: '등록', cls: 'verified', icon: 'plus' },
  UPDATE: { label: '수정', cls: 'supplement', icon: 'pencil' },
  DELETE: { label: '삭제', cls: 'brandnew', icon: 'trash-2' },
}

/** 변경이 발생한 업무 영역 — 화면이 아니라 도메인 기준으로 묶는다 */
/* 업무 영역 = 서버의 entityType 이다. **서버가 한국어로 준다** — 목록에서 실제로 온 값이
   '상벌점' · '공지' · '학생 등록' 이었다. 감사 로그가 opt-in 이라 아래 7개만 남는다
   (auditLogs.ts 첫 주석). 목업의 '출결 · 반 배정 · 급식 · 특강'은 대상이 아니라 뺐다 —
   골라도 항상 0건이면 "그날 변경이 없었다"로 잘못 읽힌다. */
const AREAS = ['학생 등록', '사유신청', '상벌점', '청구', '성적', '공지', '직원 계정'] as const

const FIELDS: Field[] = [
  { type: 'dateRange', name: 'date', label: '조회 기간', presets: true, span: 2 },
  {
    type: 'text',
    name: 'keyword',
    label: '대상 · 항목 · 값',
    placeholder: '예: 이승민 / 연락처',
    span: 2,
    disabled: true,
    disabledReason: '기록에 대상 이름과 변경 내용이 아직 담기지 않아 검색할 수 없습니다.',
  },
  {
    type: 'select',
    name: 'area',
    label: '업무 영역',
    options: AREAS.map((v) => ({ value: v, label: v })),
  },
  {
    type: 'select',
    name: 'actor',
    label: '수정한 사용자',
    options: [],
    disabled: true,
    disabledReason: '사용자 목록을 불러올 수 없어 지금은 전체만 조회됩니다.',
  },
  {
    type: 'chips',
    name: 'action',
    label: '변경 유형',
    options: ['등록', '수정', '삭제'],
    multiple: true,
    disabled: true,
    disabledReason: '유형별 조회는 아직 지원되지 않습니다.',
  },
]

/** 표에 그리는 한 줄. 서버 응답 + 화면에서 쓰기 좋은 형태 */
interface LogRow extends AuditLog {
  /** 한국 시각 문자열. 서버는 UTC instant 를 준다 — 문자열을 자르면 날짜가 하루 밀린다 */
  at: string
}

/** UTC instant → 한국 시각 `yyyy-MM-dd HH:mm:ss` */
function localAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const COLUMNS: Column<LogRow>[] = [
  { key: 'at', header: '변경 시각', width: '164px', value: (r) => r.at },
  {
    key: 'actor',
    header: '수정자',
    width: '176px',
    value: (r) => r.actorName ?? '',
    /* ★ 서버가 계정 유형('EMPLOYEE')을 이름 자리에 넣어 보내던 때가 있었다. 고쳐졌지만
         배포가 안 올라간 환경에서는 그대로 오므로, 사람 이름이 아닌 것이 그대로 보이면
         오해를 만든다. 그 값만 따로 알린다. */
    render: (r) =>
      !r.actorName || r.actorName === 'EMPLOYEE' ? (
        <Unfilled reason="바꾼 사람의 이름을 아직 안 준다" />
      ) : (
        r.actorName
      ),
  },
  { key: 'area', header: '업무 영역', width: '100px', align: 'center', value: (r) => r.entityType },
  {
    key: 'action',
    header: '유형',
    width: '72px',
    align: 'center',
    value: (r) => ACTION_META[r.action]?.label ?? r.action,
    render: (r) => {
      const m = ACTION_META[r.action]
      return m ? <span className={`mk ${m.cls}`}>{m.label}</span> : <span>{r.action}</span>
    },
  },
  {
    key: 'targetNo',
    header: '대상 학번',
    width: '100px',
    value: () => '',
    render: () => <Unfilled reason="기록에 학번이 없다" />,
  },
  {
    key: 'target',
    header: '대상',
    width: '80px',
    value: () => '',
    render: () => <Unfilled reason="기록에 대상 이름이 없다" />,
  },
  {
    key: 'field',
    header: '변경 항목',
    width: '96px',
    value: () => '',
    render: () => <Unfilled reason="어느 항목을 바꿨는지 안 준다" />,
  },
  {
    key: 'diff',
    header: '변경 전 → 변경 후',
    /* ★ 이 화면의 존재 이유인 열이다. 서버가 changes 를 채우면 여기부터 살아난다 —
         지금은 전 건 null 이다(API_GAPS 24-1). 열을 지우지 않는 이유가 그것이다. */
    value: () => '',
    render: () => <Unfilled reason="변경 전후 값을 아직 안 준다" />,
  },
  {
    key: 'ip',
    header: '접속 IP',
    width: '108px',
    align: 'center',
    value: (r) => r.actorIp ?? '-',
    render: (r) =>
      r.actorIp ? (
        <code style={{ fontSize: 10.5, color: 'var(--muted)' }}>{r.actorIp}</code>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
]

/* 기본값을 화면에도 적어둔다.
   ★ 서버는 기간을 안 보내면 오늘분만 준다. 그런데 조회 칸이 비어 있으면 "전체를 보고 있다"로
     읽혀서, 어제 것이 왜 없냐는 말이 나온다. 실제로 4차 점검에서 그렇게 올라왔다. */
const TODAY_RANGE: SearchValues = { date: { from: todayStr(), to: todayStr() } }

function Content() {
  const [query, setQuery] = useState<SearchValues>(TODAY_RANGE)
  const [masked, setMasked] = useState(true)
  const { academyId } = useAcademy()

  /* ★ useMemo 필수 — 매 렌더 새 객체를 넘기면 무한 요청이 된다.
     ★ 기간을 안 보내면 서버가 오늘분만 준다. 화면 이름이 '금일 수정 이력'이라 그게 맞다.
     ★ action 은 **일부러 안 보낸다.** 서버가 받지 않고 조용히 무시해서, 보내면 걸러진
       것처럼 보이는데 결과가 그대로다(auditLogs.ts 주석). */
  const params = useMemo(() => {
    const d = query.date as { from?: string; to?: string } | undefined
    const area = typeof query.area === 'string' ? query.area : ''
    return {
      from: d?.from || undefined,
      to: d?.to || undefined,
      entityType: area || undefined,
      academyId: academyId ?? undefined,
    }
  }, [query, academyId])

  const table = useServerTable({ fetcher: listAuditLogs, params })

  /* 표시용 한 줄로 바꾼다. 서버는 UTC instant 를 주므로 한국 시각으로 환산한다 —
     문자열을 그냥 자르면 자정 근처 기록이 하루 밀린다. */
  const rows: LogRow[] = useMemo(
    () => table.rows.map((r) => ({ ...r, at: localAt(r.occurredAt) })),
    [table.rows],
  )

  /* ⚠ 아래 집계는 **현재 페이지 기준**이다. 서버가 유형별 합계를 주지 않아 전체를 셀 수
     없다. '금일 변경'만 서버 총건수를 쓴다 — 그 숫자와 유형별 합이 안 맞는 이유다. */
  /* 기간을 넓혔는데 카드 이름이 '금일 변경'으로 남아 있으면 그 숫자를 오늘 것으로 읽는다 */
  const periodLabel = useMemo(() => {
    const d = query.date as { from?: string; to?: string } | undefined
    if (!d?.from && !d?.to) return '전체 변경'
    if (d.from && d.from === d.to) return d.from === todayStr() ? '금일 변경' : `${d.from} 변경`
    return `${d.from || '처음'} ~ ${d.to || '오늘'} 변경`
  }, [query])

  const countAct = (a: AuditAction) => rows.filter((r) => r.action === a).length
  const actorCount = new Set(rows.map((r) => r.actorName ?? r.actorId)).size

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="history" size={13} /> {periodLabel}
          </div>
          <div className="v">{table.serverPaging?.totalElements ?? rows.length}</div>
          <div className="d">조회 조건 기준</div>
        </div>
        {(['CREATE', 'UPDATE', 'DELETE'] as AuditAction[]).map((a) => (
          <div className="stat" key={a}>
            <div className="l">
              <Icon name={ACTION_META[a].icon} size={13} /> {ACTION_META[a].label}
            </div>
            <div className="v">{countAct(a)}</div>
            <div className={`d${a === 'DELETE' && countAct(a) > 0 ? ' down' : ''}`}>이 페이지 기준</div>
          </div>
        ))}
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 수정한 사용자
          </div>
          <div className="v">{actorCount}</div>
          <div className="d">이 페이지 기준</div>
        </div>
      </div>

      <div className="note-box plain">
        <div className="ic">
          <Icon name="shield" size={17} />
        </div>
        <div>
          <div className="tt">주요 변경이 자동으로 기록됩니다</div>
          <div className="tx">
            학생 등록 · 사유신청 · 상벌점 · 청구 · 성적 · 공지 · 직원 계정에서 생긴 변경이 남습니다.
            담당자가 따로 기록할 필요는 없습니다. <b>무엇을 어떤 값으로 바꿨는지</b>는 아직
            기록되지 않아 지금은 비어 있습니다.
          </div>
        </div>
      </div>

      <SearchForm
        fields={FIELDS}
        onSearch={setQuery}
        initial={TODAY_RANGE}
        presetKey="change-log"
        headerRight={
          <span className="mk supplement" title="조회 기본값은 오늘입니다">
            <Icon name="clock" size={11} /> 기본 조회 = 금일
          </span>
        }
      />

      {table.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {table.error}
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => String(r.id)}
        serverPaging={table.serverPaging}
        loading={table.loading}
        masked={masked}
        pageSize={15}
        countLabel={
          <>
            수정 이력 <b>{table.serverPaging?.totalElements ?? rows.length}</b>건
          </>
        }
        emptyText="이 기간에 기록된 변경이 없습니다."
        toolbar={
          <>
            <button className="btn" disabled data-soon title="준비 중입니다">
              <Icon name="refresh-cw" size={14} /> 되돌리기 요청
            </button>
            <MaskToggle masked={masked} onChange={setMasked} />
            <ExcelButton filename="금일_수정이력" columns={COLUMNS} rows={rows} masked={masked} />
          </>
        }
      />
    </>
  )
}

export const changeLogMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled data-soon title="준비 중입니다">기간 선택 ▾</button>
      <button className="btn" disabled data-soon title="준비 중입니다">
        <Icon name="shield-check" size={14} /> 보존정책
      </button>
    </>
  ),
}
