import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import type { Mockup } from './types'

/* 학원생 관리 > 앱 관련 > 앱과 관련된 기능 — 클라이언트 메뉴표 기준 추가 화면
 * 비고: "별도 생성 예정"
 *
 * 앱의 "내용"을 만드는 화면들(Daily Report·학습계획·상담·승인)은 각자 별도 메뉴에 있다.
 * 이 화면은 그것들과 겹치지 않는, 앱 자체를 운영하기 위한 관리 기능만 모은다.
 *   · 푸시 발송 · 예약 · 수신동의 관리
 *   · 앱 버전 / 강제 업데이트 게이트
 *   · 홈 배너 · 팝업 노출 제어
 *   · 약관 · 개인정보 동의 버전 관리
 *
 * ⚠ 푸시는 알림톡(F-4.4)과 채널이 다르다. 합치면 안 된다.
 *   · 알림톡 = 학부모 대상 · 심사 필요 · 템플릿 고정 (I-4)
 *   · FCM 푸시 = 학생 앱 대상 · 자유 문안 · 수신동의 필요
 *   기술문서상 두 채널은 이중화(F-4.4)이므로 발송 로그는 notification_logs 로 합류시키되
 *   채널 컬럼으로 구분해 적재한다.
 *
 * ⚠ 약관 버전은 반드시 이력으로 관리한다.
 *   동의 시점의 약관 버전을 저장하지 않으면 분쟁 시 근거가 없다. */

/* ── 푸시 발송 이력 ── */

type PushStatus = 'SENT' | 'SCHEDULED' | 'FAILED'

const PUSH_STATUS: Record<PushStatus, { label: string; cls: string }> = {
  SENT: { label: '발송완료', cls: 'verified' },
  SCHEDULED: { label: '예약', cls: 'supplement' },
  FAILED: { label: '실패', cls: 'brandnew' },
}

interface PushRow {
  id: string
  at: string
  title: string
  scope: string
  target: number
  received: number
  opened: number
  status: PushStatus
  by: string
}

const PUSH_TEMPLATES: [string, string][] = [
  ['오늘의 Daily Report가 도착했습니다', '전체'],
  ['미등원 확인 요청', '3반'],
  ['6월 급식 신청이 오늘 마감됩니다', '전체'],
  ['주간 학습계획을 아직 작성하지 않았습니다', '미작성자'],
  ['모의고사 성적표가 업로드되었습니다', '전체'],
  ['상담 예약이 확정되었습니다', '개별'],
  ['영단어 시험 응시 안내', '2반'],
  ['좌석 이탈 신청이 승인되었습니다', '개별'],
]

const PUSH_ROWS: PushRow[] = Array.from({ length: 28 }, (_, i) => {
  const [title, scope] = PUSH_TEMPLATES[i % PUSH_TEMPLATES.length]
  const status: PushStatus = i < 3 ? 'SCHEDULED' : i % 11 === 7 ? 'FAILED' : 'SENT'
  const target = scope === '전체' ? 296 : scope === '개별' ? 1 : scope === '미작성자' ? 41 : 74
  const received = status === 'SENT' ? Math.round(target * 0.93) : 0
  return {
    id: `push-${String(i + 1).padStart(3, '0')}`,
    at: `2026-05-${String(28 - Math.floor(i / 4)).padStart(2, '0')} ${String(8 + (i % 13)).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}`,
    title,
    scope,
    target,
    received,
    opened: Math.round(received * 0.61),
    status,
    by: ['강민서', '이장원', '시스템(자동)'][i % 3],
  }
})

const PUSH_COLUMNS: Column<PushRow>[] = [
  { key: 'at', header: '발송 시각', width: '132px', sortable: true, value: (r) => r.at },
  { key: 'title', header: '제목', value: (r) => r.title },
  { key: 'scope', header: '대상', width: '84px', align: 'center', sortable: true, value: (r) => r.scope },
  { key: 'target', header: '대상 수', width: '78px', align: 'right', sortable: true, value: (r) => r.target },
  {
    key: 'received',
    header: '수신',
    width: '96px',
    align: 'right',
    sortable: true,
    value: (r) => r.received,
    render: (r) =>
      r.received ? (
        <span>
          {r.received}
          <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({Math.round((r.received / r.target) * 100)}%)</span>
        </span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
  {
    key: 'opened',
    header: '열람',
    width: '96px',
    align: 'right',
    sortable: true,
    value: (r) => r.opened,
    render: (r) =>
      r.opened ? (
        <span>
          {r.opened}
          <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({Math.round((r.opened / r.target) * 100)}%)</span>
        </span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
  {
    key: 'status',
    header: '상태',
    width: '90px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => <span className={`mk ${PUSH_STATUS[r.status].cls}`}>{PUSH_STATUS[r.status].label}</span>,
  },
  { key: 'by', header: '발송자', width: '96px', value: (r) => r.by },
]

/* ── 앱 버전 ── */

interface VersionRow {
  platform: 'iOS' | 'Android'
  latest: string
  minSupported: string
  forceUpdate: boolean
  adoption: number
  reviewedAt: string
}

const VERSIONS: VersionRow[] = [
  { platform: 'iOS', latest: '1.4.2', minSupported: '1.3.0', forceUpdate: true, adoption: 87, reviewedAt: '2026-05-21' },
  { platform: 'Android', latest: '1.4.2', minSupported: '1.2.5', forceUpdate: false, adoption: 79, reviewedAt: '2026-05-20' },
]

/* ── 배너 ── */

interface BannerRow {
  id: string
  title: string
  place: string
  period: string
  active: boolean
  clicks: number
}

const BANNER_COLUMNS: Column<BannerRow>[] = [
  { key: 'title', header: '배너명', value: (r) => r.title },
  { key: 'place', header: '노출 위치', width: '110px', align: 'center', sortable: true, value: (r) => r.place },
  { key: 'period', header: '노출 기간', width: '150px', align: 'center', value: (r) => r.period },
  { key: 'clicks', header: '클릭', width: '90px', align: 'right', sortable: true, value: (r) => r.clicks },
  {
    key: 'active',
    header: '상태',
    width: '84px',
    align: 'center',
    value: (r) => (r.active ? '노출중' : '종료'),
    render: (r) => <span className={`mk ${r.active ? 'verified' : 'supplement'}`}>{r.active ? '노출중' : '종료'}</span>,
  },
]

const BANNERS: BannerRow[] = [
  { id: 'bn-1', title: '6월 급식 신청 안내', place: '홈 상단', period: '05-24 ~ 05-31', active: true, clicks: 412 },
  { id: 'bn-2', title: '여름 특강 설명회 접수', place: '홈 상단', period: '05-26 ~ 06-10', active: true, clicks: 268 },
  { id: 'bn-3', title: '앱 사용 가이드', place: '마이페이지', period: '상시', active: true, clicks: 96 },
  { id: 'bn-4', title: '5월 모의고사 안내', place: '홈 팝업', period: '05-01 ~ 05-12', active: false, clicks: 731 },
]

/* ── 약관 ── */

interface TermRow {
  id: string
  name: string
  version: string
  required: boolean
  effectiveAt: string
  agreedRate: number
}

const TERMS: TermRow[] = [
  { id: 'tm-1', name: '서비스 이용약관', version: 'v2.1', required: true, effectiveAt: '2026-03-01', agreedRate: 100 },
  { id: 'tm-2', name: '개인정보 수집·이용 동의', version: 'v2.1', required: true, effectiveAt: '2026-03-01', agreedRate: 100 },
  { id: 'tm-3', name: '위치정보 이용 동의', version: 'v1.0', required: false, effectiveAt: '2026-03-01', agreedRate: 62 },
  { id: 'tm-4', name: '푸시 알림 수신 동의', version: 'v1.2', required: false, effectiveAt: '2026-04-15', agreedRate: 91 },
]

function Content() {
  const [tab, setTab] = useState('push')

  const pushToday = useMemo(() => PUSH_ROWS.filter((r) => r.at.startsWith('2026-05-28')), [])
  const pushAgree = TERMS.find((t) => t.name.includes('푸시'))?.agreedRate ?? 0

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="smartphone" size={13} /> 앱 가입
          </div>
          <div className="v">289</div>
          <div className="d">재원 296명 중 97.6%</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="bell" size={13} /> 푸시 수신동의
          </div>
          <div className="v">{pushAgree}%</div>
          <div className="d">미동의자는 알림톡으로 폴백</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="send" size={13} /> 금일 푸시
          </div>
          <div className="v">{pushToday.length}</div>
          <div className="d">예약 {PUSH_ROWS.filter((r) => r.status === 'SCHEDULED').length}건 대기</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="upload" size={13} /> 최신버전 적용률
          </div>
          <div className="v">{Math.round((VERSIONS[0].adoption + VERSIONS[1].adoption) / 2)}%</div>
          <div className="d warn">iOS 강제 업데이트 적용 중</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="megaphone" size={13} /> 노출 배너
          </div>
          <div className="v">{BANNERS.filter((b) => b.active).length}</div>
          <div className="d">전체 {BANNERS.length}건</div>
        </div>
      </div>

      <div className="note-box plain">
        <div className="ic">
          <Icon name="git-compare" size={17} />
        </div>
        <div>
          <div className="tt">푸시(FCM)와 알림톡은 서로 다른 채널입니다 — 이 화면은 푸시만 다룹니다</div>
          <div className="tx">
            학부모 대상 <b>카카오 알림톡</b>은 템플릿 심사가 필요하므로 <b>문자발송</b> 메뉴에서 관리합니다. 여기서는 학생 앱
            대상 <b>FCM 푸시</b>만 발송하며, 수신 미동의자는 서버가 알림톡으로 폴백합니다. <b>SMS는 제공하지 않으므로</b>{' '}
            승인된 알림톡 문안이 없는 자유 문안은 폴백 경로가 없습니다. 두 채널의 발송 로그는{' '}
            <code>notification_logs</code> 한 테이블에 채널 컬럼으로 구분해 적재합니다.
          </div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'push', label: '푸시 발송', count: PUSH_ROWS.length },
          { key: 'version', label: '앱 버전 관리' },
          { key: 'banner', label: '배너 · 팝업', count: BANNERS.length },
          { key: 'terms', label: '약관 · 동의', count: TERMS.length },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {tab === 'push' && (
        <DataTable
          columns={PUSH_COLUMNS}
          rows={PUSH_ROWS}
          rowKey={(r) => r.id}
          masked={false}
          pageSize={12}
          countLabel={
            <>
              푸시 발송 이력 <b>{PUSH_ROWS.length}</b>건
            </>
          }
          toolbar={
            <>
              <button className="btn">
                <Icon name="clock" size={14} /> 예약 발송
              </button>
              <ExcelButton filename="앱_푸시발송이력" columns={PUSH_COLUMNS} rows={PUSH_ROWS} masked={false} />
              <button className="btn pri">
                <Icon name="send" size={14} /> 새 푸시 발송
              </button>
            </>
          }
        />
      )}

      {tab === 'version' && (
        <div className="split">
          {VERSIONS.map((v) => (
            <div className="card-sec" key={v.platform}>
              <div className="card-sec-h">
                <div className="t">
                  <span className="ico">
                    <Icon name={v.platform === 'iOS' ? 'smartphone' : 'monitor'} size={15} />
                  </span>
                  {v.platform}
                </div>
                <div className="r">
                  {v.forceUpdate ? (
                    <span className="mk brandnew">강제 업데이트 ON</span>
                  ) : (
                    <span className="mk verified">권장 업데이트</span>
                  )}
                </div>
              </div>
              <div className="card-sec-b">
                <div className="kv" style={{ marginBottom: 14 }}>
                  <div className="row">
                    <span className="k">최신 버전</span>
                    <span className="v">
                      <b>{v.latest}</b>
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">최소 지원</span>
                    <span className="v">
                      {v.minSupported}
                      <span style={{ color: 'var(--muted)', fontSize: 11.5 }}> — 미만은 실행 시 업데이트 게이트</span>
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">심사 통과</span>
                    <span className="v">{v.reviewedAt}</span>
                  </div>
                </div>

                <div style={{ marginBottom: 6, fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                  최신 버전 적용률
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, height: 20, borderRadius: 7, background: 'var(--line-2)', overflow: 'hidden' }}>
                    <span
                      style={{
                        display: 'block',
                        width: `${v.adoption}%`,
                        height: '100%',
                        background: v.adoption >= 85 ? 'var(--mint)' : 'var(--amber)',
                      }}
                    />
                  </span>
                  <b style={{ fontSize: 13 }}>{v.adoption}%</b>
                </div>

                <div style={{ display: 'flex', gap: 7, marginTop: 15 }}>
                  <button className="btn">최소 지원 버전 변경</button>
                  <button className="btn">강제 업데이트 {v.forceUpdate ? '해제' : '설정'}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'banner' && (
        <DataTable
          columns={BANNER_COLUMNS}
          rows={BANNERS}
          rowKey={(r) => r.id}
          masked={false}
          pageSize={10}
          countLabel={
            <>
              배너 <b>{BANNERS.length}</b>건
            </>
          }
          toolbar={
            <button className="btn pri">
              <Icon name="plus" size={14} /> 배너 등록
            </button>
          }
        />
      )}

      {tab === 'terms' && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="file-text" size={15} />
              </span>
              약관 · 동의 버전
            </div>
            <div className="r">
              <span className="mk supplement" title="동의 시점의 약관 버전을 함께 저장합니다">
                동의 이력 버전 고정
              </span>
              <button className="btn pri">
                <Icon name="plus" size={14} /> 새 버전 배포
              </button>
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TERMS.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</span>
                  <span style={{ marginLeft: 8 }} className={`mk ${t.required ? 'brandnew' : 'supplement'}`}>
                    {t.required ? '필수' : '선택'}
                  </span>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                    <code style={{ fontSize: 10.5 }}>{t.version}</code> · 시행 {t.effectiveAt}
                  </div>
                </span>
                <span style={{ width: 160, display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--line-2)', overflow: 'hidden' }}>
                    <span
                      style={{
                        display: 'block',
                        width: `${t.agreedRate}%`,
                        height: '100%',
                        background: t.agreedRate === 100 ? 'var(--mint)' : 'var(--blue)',
                      }}
                    />
                  </span>
                  <b style={{ fontSize: 11.5, minWidth: 34, textAlign: 'right' }}>{t.agreedRate}%</b>
                </span>
                <button className="btn" style={{ padding: '6px 12px', fontSize: 12 }}>
                  이력
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export const appManageMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="qr-code" size={14} /> 앱 설치 안내
      </button>
      <button className="btn pri">
        <Icon name="send" size={14} /> 푸시 발송
      </button>
    </>
  ),
}
