import { useCallback, useEffect, useState } from 'react'
import { DataTable, ExcelButton, Unfilled, type Column, Modal } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  PLATFORM_LABEL,
  listAppConfigs,
  listTerms,
  setMaintenance,
  updateAppVersions,
  type AppConfigDetail,
  type Terms,
} from '../../api/appConfig'
import { listNotices, type Notice } from '../../api/notices'
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
 * ⚠ BE 전제 — 푸시·알림톡 발송 로그는 notification_logs 한 테이블에 채널 컬럼으로 구분해
 *   적재한다. 채널별로 테이블을 나누면 "이 학생에게 언제 무엇이 갔나"를 한 번에 못 본다.
 *
 * ⚠ 푸시는 알림톡(F-4.4)과 채널이 다르다. 합치면 안 된다.
 *   · 알림톡 = 학부모 대상 · 심사 필요 · 템플릿 고정 (I-4)
 *   · 앱 알림 = 학생 앱 대상 · 자유 문안 · 수신동의 필요
 *   기술문서상 두 채널은 이중화(F-4.4)이므로 발송 로그는 notification_logs 로 합류시키되
 *   채널 컬럼으로 구분해 적재한다.
 *
 * ⚠ 약관 버전은 반드시 이력으로 관리한다.
 *   동의 시점의 약관 버전을 저장하지 않으면 분쟁 시 근거가 없다.
 *
 * ── 연동 범위 ──────────────────────────────────────────────
 * **'앱 버전 관리'·'약관' 탭이 실연동.** 배너는 공지의 `banner` 축을 읽어 보여주고,
 * **'푸시 발송' 탭은 API가 없어 목업**이다(API_GAPS 17부).
 *
 * ★ 점검 모드는 서버에 있는데 목업에는 없던 축이다. **켜져 있으면 앱이 안 열리는데
 *   아무 데도 안 보이면 원인을 못 짚으므로**, 버전 카드 머리에 상태를 드러낸다. */

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



/* ── 배너 ── */

const API_BANNER_COLUMNS: Column<Notice>[] = [
  { key: 'title', header: '배너명', value: (r) => r.title },
  {
    key: 'place',
    header: '노출 위치',
    width: '110px',
    align: 'center',
    // 공지에는 노출 위치 축이 없다. 상단 고정 여부가 가장 가까운 값이다
    value: (r) => (r.pinned ? '상단 고정' : '일반'),
  },
  {
    key: 'period',
    header: '노출 기간',
    width: '170px',
    align: 'center',
    value: (r) => r.publishedAt ?? '',
    render: (r) =>
      `${r.publishedAt ? r.publishedAt.slice(0, 10) : '-'} ~ ${r.expiresAt ? r.expiresAt.slice(0, 10) : '상시'}`,
  },
  {
    key: 'clicks',
    header: '클릭',
    width: '90px',
    align: 'center',
    value: () => '',
    render: () => <Unfilled reason="배너 클릭 수가 기록되지 않는다" />,
  },
  {
    key: 'read',
    header: '열람',
    width: '84px',
    align: 'center',
    value: (r) => r.readCount ?? '',
    render: (r) => (r.readCount == null ? '-' : `${r.readCount}명`),
  },
]

/* ── 약관 ── */



function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('push')

  const [configs, setConfigs] = useState<AppConfigDetail[]>([])
  const [terms, setTerms] = useState<Terms[]>([])
  const [banners, setBanners] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  /** 버전 입력 모달 */
  const [verEdit, setVerEdit] = useState<{ c: AppConfigDetail; field: 'minVersion' | 'latestVersion'; value: string } | null>(null)
  /** 점검 모드 안내 문구 모달. 켜면 그 플랫폼 사용자 전원이 앱을 못 쓴다 */
  const [maintEdit, setMaintEdit] = useState<{ c: AppConfigDetail; message: string } | null>(null)
  /** 모달 안에서 보여줄 실패 메시지 */
  const [modalErr, setModalErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      /* 셋을 나란히 부른다. 하나가 늦어도 나머지 탭은 먼저 그려져야 한다 */
      const [cfg, tm, nt] = await Promise.all([
        listAppConfigs(),
        listTerms(academyId ?? undefined),
        listNotices(new Date().getFullYear()),
      ])
      setConfigs(cfg)
      setTerms(tm)
      setBanners(nt.filter((n) => n.banner))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '앱 설정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [academyId])

  useEffect(() => {
    void load()
  }, [load])

  /** `done`·`failed` 를 완성된 문장으로 받는다 — AdminLecture 의 같은 함수 주석 참고 */
  /** 성공하면 true. 호출부가 모달을 **성공했을 때만** 닫는 데 쓴다 */
  async function run(done: string, failed: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true)
    try {
      await fn()
      setNotice(done)
      return true
      await load()
    } catch (err) {
      setModalErr(err instanceof ApiError ? err.message : failed)
      setNotice(null)
      return false
    } finally {
      setBusy(false)
    }
  }

  function changeVersion(c: AppConfigDetail, field: 'minVersion' | 'latestVersion') {
    setVerEdit({ c, field, value: c[field] ?? '' })
  }

  function toggleMaintenance(c: AppConfigDetail) {
    // 켜면 그 플랫폼 전 사용자가 앱을 못 쓴다 — 되묻지 않으면 사고가 된다
    if (!c.maintenance) {
      setMaintEdit({ c, message: c.maintenanceMessage ?? '시스템 점검 중입니다.' })
      return
    }
    void run('점검 모드를 껐습니다.', '점검 모드를 끄지 못했습니다.', () =>
      setMaintenance(c.platform, { maintenance: false }),
    )
  }

  const inMaintenance = configs.filter((c) => c.maintenance)

  return (
    <>
      {verEdit && (
        <Modal
          title={`${PLATFORM_LABEL[verEdit.c.platform]} ${verEdit.field === 'minVersion' ? '최소 지원 버전' : '최신 버전'}`}
          sub={verEdit.field === 'minVersion' ? '이보다 낮은 버전은 앱이 열리지 않습니다.' : undefined}
          confirmLabel="저장"
          confirmDisabled={verEdit.value.trim() === ''}
          error={modalErr}
          onConfirm={() => {
            const e = verEdit
            const label = e.field === 'minVersion' ? '최소 지원 버전' : '최신 버전'
            void run(`${label}을 바꿨습니다.`, `${label}을 바꾸지 못했습니다.`, () =>
              updateAppVersions(e.c.platform, { [e.field]: e.value.trim() }),
            ).then((ok) => ok && setVerEdit(null))
          }}
          onClose={() => { setModalErr(null); setVerEdit(null) }}
        >
          <div className="frow">
            <label className="req">버전</label>
            <input
              className="inp"
              value={verEdit.value}
              placeholder="1.0.0"
              maxLength={20}
              onChange={(e) => setVerEdit({ ...verEdit, value: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {maintEdit && (
        <Modal
          title={`${PLATFORM_LABEL[maintEdit.c.platform]} 점검 모드를 켤까요?`}
          sub="켜는 즉시 이 플랫폼 사용자 전원이 앱을 쓸 수 없습니다."
          confirmLabel="점검 모드 켜기"
          danger
          confirmDisabled={maintEdit.message.trim() === ''}
          error={modalErr}
          onConfirm={() => {
            const e = maintEdit
            void run('점검 모드를 켰습니다.', '점검 모드를 켜지 못했습니다.', () =>
              setMaintenance(e.c.platform, { maintenance: true, message: e.message.trim() }),
            ).then((ok) => ok && setMaintEdit(null))
          }}
          onClose={() => { setModalErr(null); setMaintEdit(null) }}
        >
          <div className="frow">
            <label className="req">안내 문구</label>
            <textarea
              className="ta"
              value={maintEdit.message}
              maxLength={100}
              onChange={(e) => setMaintEdit({ ...maintEdit, message: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {/* 점검 모드가 켜져 있으면 어느 탭에 있든 보여야 한다 */}
      {inMaintenance.length > 0 && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)' }}>
          <div className="ic">
            <Icon name="triangle-alert" size={17} />
          </div>
          <div>
            <div className="tt">
              지금 {inMaintenance.map((c) => PLATFORM_LABEL[c.platform]).join(' · ')} 사용자는 앱을 쓸 수 없습니다
            </div>
            <div className="tx">
              점검 모드가 켜져 있습니다. {inMaintenance[0].maintenanceMessage ?? ''} 끄기 전까지 앱이 열리지 않습니다.
            </div>
          </div>
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

      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="smartphone" size={13} /> 앱 가입
          </div>
          {/* 앱 가입자 수를 세는 경로가 없다 */}
          <div className="v" style={{ fontSize: 14, paddingTop: 8 }}>
            <Unfilled reason="앱 가입자 수가 서버에 없다" />
          </div>
          <div className="d">재원생 대비</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="bell" size={13} /> 푸시 수신동의
          </div>
          <div className="v" style={{ fontSize: 14, paddingTop: 8 }}>
            <Unfilled reason="동의율 집계가 없다 — 계정별 조회만 있다" />
          </div>
          <div className="d">미동의자는 알림톡으로 폴백</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="send" size={13} /> 금일 푸시
          </div>
          <div className="v" style={{ fontSize: 14, paddingTop: 8 }}>
            <Unfilled reason="푸시 발송 이력이 없다" />
          </div>
          <div className="d">발송 기록 미제공</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="upload" size={13} /> 점검 모드
          </div>
          <div className="v" style={{ color: inMaintenance.length > 0 ? 'var(--red)' : 'var(--green)' }}>
            {inMaintenance.length > 0 ? `${inMaintenance.length}곳` : '정상'}
          </div>
          <div className={inMaintenance.length > 0 ? 'd down' : 'd'}>
            {configs.length > 0 ? `${configs.length}개 플랫폼` : '불러오는 중'}
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="megaphone" size={13} /> 노출 배너
          </div>
          <div className="v">{banners.length}</div>
          <div className="d">공지 중 배너 지정</div>
        </div>
      </div>

      <div className="note-box plain">
        <div className="ic">
          <Icon name="git-compare" size={17} />
        </div>
        <div>
          <div className="tt">앱 알림과 카카오 알림톡은 서로 다릅니다 — 이 화면은 앱 알림만 다룹니다</div>
          <div className="tx">
            학부모 대상 <b>카카오 알림톡</b>은 템플릿 심사가 필요하므로 <b>문자발송</b> 메뉴에서 관리합니다. 여기서는 학생 앱
            대상 <b>앱 알림</b>만 발송하며, 수신 미동의자는 서버가 알림톡으로 폴백합니다. <b>SMS는 제공하지 않으므로</b>{' '}
            승인된 알림톡 문안이 없는 자유 문안은 폴백 경로가 없습니다.
          </div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'push', label: '푸시 발송' },
          { key: 'version', label: '앱 버전 관리', count: configs.length },
          { key: 'banner', label: '배너 · 팝업', count: banners.length },
          { key: 'terms', label: '약관 · 동의', count: terms.length },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {tab === 'push' && (
        <>
          {/* 발송 경로도 이력도 없다. 화면은 두되 예시임을 밝힌다 */}
          <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
            <div className="ic">
              <Icon name="triangle-alert" size={17} />
            </div>
            <div>
              <div className="tt">아래 내용은 예시입니다 — 실제로 발송되거나 기록되지 않습니다</div>
              <div className="tx">
                푸시는 등원·승인·상담 같은 사건이 일어날 때 <b>자동으로</b> 나갑니다. 사람이 직접 골라 보내는 기능과
                발송 기록은 아직 준비되지 않았습니다.
              </div>
            </div>
          </div>
          <DataTable
            columns={PUSH_COLUMNS}
            rows={PUSH_ROWS}
            rowKey={(r) => r.id}
            masked={false}
            pageSize={12}
            countLabel={
              <>
                푸시 발송 이력 <b>{PUSH_ROWS.length}</b>건 (예시)
              </>
            }
            toolbar={
              <>
                <button className="btn" disabled title="준비 중입니다">
                  <Icon name="clock" size={14} /> 예약 발송
                </button>
                <ExcelButton filename="앱_푸시발송이력" columns={PUSH_COLUMNS} rows={PUSH_ROWS} masked={false} />
                <button className="btn pri" disabled title="준비 중입니다">
                  <Icon name="send" size={14} /> 새 푸시 발송
                </button>
              </>
            }
          />
        </>
      )}

      {tab === 'version' && (
        <div className="split">
          {configs.length === 0 && !loading && (
            <div className="note-box">등록된 플랫폼 설정이 없습니다.</div>
          )}
          {configs.map((c) => (
            <div className="card-sec" key={c.id}>
              <div className="card-sec-h">
                <div className="t">
                  <span className="ico">
                    <Icon name={c.platform === 'IOS' ? 'smartphone' : 'monitor'} size={15} />
                  </span>
                  {PLATFORM_LABEL[c.platform] ?? c.platform}
                </div>
                <div className="r">
                  {c.maintenance ? (
                    <span className="mk brandnew">점검 중 — 앱 사용 불가</span>
                  ) : c.minVersion ? (
                    <span className="mk brandnew">업데이트 게이트 ON</span>
                  ) : (
                    <span className="mk verified">게이트 없음</span>
                  )}
                </div>
              </div>
              <div className="card-sec-b">
                <div className="kv" style={{ marginBottom: 14 }}>
                  <div className="row">
                    <span className="k">최신 버전</span>
                    <span className="v">
                      <b>{c.latestVersion ?? '-'}</b>
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">최소 지원</span>
                    <span className="v">
                      {c.minVersion ?? '-'}
                      <span style={{ color: 'var(--muted)', fontSize: 11.5 }}> — 미만은 실행 시 업데이트 게이트</span>
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">심사 통과</span>
                    <span className="v">
                      <Unfilled reason="스토어 심사일이 서버에 없다" />
                    </span>
                  </div>
                </div>

                <div style={{ marginBottom: 6, fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                  최신 버전 적용률
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Unfilled reason="버전별 사용자 분포가 서버에 없다" />
                </div>

                <div style={{ display: 'flex', gap: 7, marginTop: 15, flexWrap: 'wrap' }}>
                  <button className="btn" disabled={busy} onClick={() => changeVersion(c, 'minVersion')}>
                    최소 지원 버전 변경
                  </button>
                  <button className="btn" disabled={busy} onClick={() => changeVersion(c, 'latestVersion')}>
                    최신 버전 변경
                  </button>
                  <button
                    className="btn"
                    style={c.maintenance ? undefined : { color: 'var(--red)' }}
                    disabled={busy}
                    onClick={() => toggleMaintenance(c)}
                  >
                    점검 모드 {c.maintenance ? '해제' : '켜기'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'banner' && (
        <>
          {/* 배너는 별도 도메인이 아니라 공지의 한 축이다 */}
          <div className="note-box">
            <div className="ic">
              <Icon name="info" size={17} />
            </div>
            <div>
              <div className="tt">배너는 공지에서 지정합니다</div>
              <div className="tx">
                배너로 띄울 내용은 <b>메시지 관리</b>에서 공지를 쓰고 배너로 지정하면 여기 나옵니다.
                노출 위치와 클릭 수는 아직 기록되지 않습니다.
              </div>
            </div>
          </div>
          <DataTable
            columns={API_BANNER_COLUMNS}
            rows={banners}
            rowKey={(r) => String(r.id)}
            masked={false}
            loading={loading}
            pageSize={10}
            countLabel={
              <>
                배너로 지정된 공지 <b>{banners.length}</b>건
              </>
            }
          />
        </>
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
              <button className="btn pri" disabled title="약관 본문 입력은 별도 화면이 필요합니다">
                <Icon name="plus" size={14} /> 새 버전 배포
              </button>
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {terms.length === 0 && !loading && (
              <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>등록된 약관이 없습니다.</span>
            )}
            {terms.map((t) => (
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
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{t.title}</span>
                  <span style={{ marginLeft: 8 }} className={`mk ${t.required ? 'brandnew' : 'supplement'}`}>
                    {t.required ? '필수' : '선택'}
                  </span>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                    <code style={{ fontSize: 10.5 }}>{t.code}</code> {t.version} · 시행{' '}
                    {t.effectiveAt ? t.effectiveAt.slice(0, 10) : '-'}
                    {t.academyId === null && ' · 전 지점 공통'}
                  </div>
                </span>
                <span style={{ width: 160, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  {/* 계정별 조회만 있어 전체 동의율을 못 낸다 */}
                  <Unfilled reason="약관 동의율 집계가 없다 — 계정별 조회만 있다" />
                </span>
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
      <button className="btn" disabled title="준비 중입니다">
        <Icon name="qr-code" size={14} /> 앱 설치 안내
      </button>
      <button className="btn pri" disabled title="준비 중입니다">
        <Icon name="send" size={14} /> 푸시 발송
      </button>
    </>
  ),
}
