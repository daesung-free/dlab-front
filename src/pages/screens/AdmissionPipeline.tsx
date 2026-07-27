import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import './admission.css'

/* ── 목업 데이터 (02_admin_ipsi.html 이관) ──
 * ⚠ 시안은 유입 경로를 '구글폼'으로 표기했으나, 요구사항정의서 F-4.2는
 *   D.Lab 사이트(디멤버) 입학예약폼 연동으로 정의한다(D-7 / S-1 미해결).
 *   엑셀 기준에 맞춰 명칭을 '디멤버 입학예약폼'으로 통일했다.
 */

const KPIS = [
  { l: '신규 예약 (디멤버 폼)', v: '148', d: '▲ 오늘 +6', tone: 'up' },
  { l: '방문상담 예정', v: '42', d: '이번 주 18건', tone: 'warn' },
  { l: '입학 확정', v: '89', d: '▲ 전환율 60%', tone: 'up' },
  { l: '입학불가', v: '11', d: '성적미달·검고졸', tone: 'mut' },
  { l: '좌석 대기', v: '7', d: '배정 대기중', tone: 'warn' },
  { l: '장학 신청', v: '23', d: '수능100·평가원 등', tone: 'mut' },
]

interface Lead {
  name: string
  cat: 'na' | 'in'
  catLabel: string
  meta: React.ReactNode
  autoNote?: { icon: string; text: string }
  blockFlag?: { icon: string; text: string; amber?: boolean }
  foot?: { src: string; srcIcon?: string; mini?: { label: string; tone: string } }
  block?: boolean
}

interface Column {
  title: string
  color: string
  count: string
  leads: Lead[]
}

const COLUMNS: Column[] = [
  {
    title: '신규 예약',
    color: 'var(--mint)',
    count: '148',
    leads: [
      {
        name: '정민주',
        cat: 'na',
        catLabel: '자연',
        meta: (
          <>
            2006년생 · 태원고 · 재수
            <br />
            등원희망 <b>06/02</b> · 출신 기숙학원
          </>
        ),
        autoNote: { icon: 'zap', text: '디멤버 폼 자동수집 · 개인정보 동의 완료' },
        foot: { src: '디멤버 폼', srcIcon: 'clipboard-list', mini: { label: '방문예약 잡기', tone: 'book' } },
      },
      {
        name: '김도윤',
        cat: 'in',
        catLabel: '인문',
        meta: (
          <>
            2005년생 · 송림고 · 삼수
            <br />
            등원희망 <b>06/02</b> · 출신 잇올
          </>
        ),
        foot: { src: '디멤버 폼', srcIcon: 'clipboard-list', mini: { label: '방문예약 잡기', tone: 'book' } },
      },
      {
        name: '강현준',
        cat: 'na',
        catLabel: '자연',
        block: true,
        meta: (
          <>
            2005년생 · 유신고
            <br />
            등원희망 06/02
          </>
        ),
        blockFlag: { icon: 'triangle-alert', text: '입학불가 자동감지 — 연락처 크로스체크' },
      },
    ],
  },
  {
    title: '방문상담',
    color: 'var(--blue)',
    count: '42',
    leads: [
      {
        name: '박수빈',
        cat: 'na',
        catLabel: '자연',
        meta: (
          <>
            삼수 · 상담예약 <b>05/26 09:10</b>
            <br />
            담당 김유진
          </>
        ),
        autoNote: { icon: 'mail', text: '방문안내 문자 자동발송됨' },
        foot: { src: '지인추천', mini: { label: '상담일지 작성', tone: '' } },
      },
      {
        name: '이서연',
        cat: 'in',
        catLabel: '인문',
        meta: (
          <>
            재수 · 상담예약 <b>05/26 10:30</b>
            <br />
            담당 최지원
          </>
        ),
        foot: { src: '홈페이지', mini: { label: '장학상담', tone: 'jang' } },
      },
    ],
  },
  {
    title: '입학기준 확인',
    color: 'var(--amber)',
    count: '31',
    leads: [
      {
        name: '한지우',
        cat: 'na',
        catLabel: '자연',
        meta: (
          <>
            입학기준 성적
            <br />
            <span className="grade">국2 · 수2 · 영1 · 탐3</span> · 내신 2등급
          </>
        ),
        autoNote: { icon: 'check-check', text: '입학기준 충족 · 검고졸 아님' },
        foot: { src: '성적 검증완료', mini: { label: '등록 진행', tone: 'done' } },
      },
      {
        name: '오세훈',
        cat: 'in',
        catLabel: '인문',
        meta: (
          <>
            입학기준 성적
            <br />
            <span className="grade">국3 · 수4 · 영2 · 탐3</span> · 내신 3등급
          </>
        ),
        foot: { src: '담임 검토중', mini: { label: '장학기준 확인', tone: 'jang' } },
      },
    ],
  },
  {
    title: '좌석 · 장학 배정',
    color: 'var(--violet)',
    count: '18',
    leads: [
      {
        name: '한지우',
        cat: 'na',
        catLabel: '자연',
        meta: (
          <>
            좌석 <b>A-31</b> 배정 · 독서실 A
            <br />
            장학: 수능100 적용
          </>
        ),
        autoNote: { icon: 'armchair', text: '좌석배치도 실시간 반영' },
        foot: { src: '배정완료', mini: { label: '등록대기', tone: 'done' } },
      },
      {
        name: '임채원',
        cat: 'in',
        catLabel: '인문',
        meta: (
          <>
            좌석 <b>대기 3순위</b>
            <br />
            장학: 평가원50 신청
          </>
        ),
        blockFlag: { icon: 'clock', text: '좌석대기 · 장학대기 동시', amber: true },
      },
    ],
  },
  {
    title: '입학확정 · 등원',
    color: 'var(--green)',
    count: '89',
    leads: [
      {
        name: '이승민',
        cat: 'na',
        catLabel: '자연',
        meta: (
          <>
            원생코드 <span className="grade">DL-2026-0419</span>
            <br />
            3반 4019 · 좌석 A-24 · 등원 03/02
          </>
        ),
        autoNote: { icon: 'link', text: '재원생 전환 → 상담일지 연결' },
        foot: { src: '등원 안내문자 발송', mini: { label: '재원생', tone: 'done' } },
      },
      {
        name: '정하늘',
        cat: 'in',
        catLabel: '인문',
        meta: (
          <>
            원생코드 <span className="grade">DL-2026-0387</span>
            <br />
            1반 1105 · 좌석 B-12 · 등원 03/02
          </>
        ),
        foot: { src: '서류제출 완료', mini: { label: '재원생', tone: 'done' } },
      },
    ],
  },
]

const BEFORE = [
  '디멤버 폼 → 예약현황 → 좌석/장학/대기 시트로 사람이 반복 복사',
  '입학불가(성적미달·검고졸)를 연락처로 눈대조',
  '방문·좌석·장학·대기가 서로 다른 시트에 분리',
  '방문/예약/등원 안내 문자를 양식에서 복붙 발송',
  '상담 내용은 셀 한 칸에 텍스트 한 덩어리 (추적 불가)',
]

const AFTER = [
  '디멤버 입학예약폼 유입이 파이프라인 카드로 자동 생성',
  '입학기준·검고졸 자동 크로스체크, 미달 시 자동 플래그',
  '좌석배치도·장학·대기가 한 화면에서 실시간 연동',
  '단계 전환 시 안내 문자 자동발송',
  '입학상담이 그대로 재원생 상담일지의 첫 기록으로 연결',
]

function Content() {
  return (
    <div className="p-admission">
      <div className="kpis">
        {KPIS.map((k) => (
          <div className="kpi" key={k.l}>
            <div className="l">{k.l}</div>
            <div className="v">{k.v}</div>
            <div className={`d ${k.tone}`}>{k.d}</div>
          </div>
        ))}
      </div>

      <div className="board">
        {COLUMNS.map((col) => (
          <div className="col" key={col.title}>
            <div className="col-h">
              <div className="t">
                <span className="dot" style={{ background: col.color }} />
                {col.title}
              </div>
              <span className="n">{col.count}</span>
            </div>
            <div className="col-b">
              {col.leads.map((l) => (
                <div className={`lead${l.block ? ' block' : ''}`} key={col.title + l.name}>
                  <div className="lead-top">
                    <span className="nm">{l.name}</span>
                    <span className={`cat ${l.cat}`}>{l.catLabel}</span>
                  </div>
                  <div className="lead-meta">{l.meta}</div>

                  {l.autoNote && (
                    <div className="auto-note">
                      <Icon name={l.autoNote.icon} size={12} /> {l.autoNote.text}
                    </div>
                  )}
                  {l.blockFlag && (
                    <div
                      className="block-flag"
                      style={l.blockFlag.amber ? { background: 'var(--amber-wash)', color: 'var(--amber)' } : undefined}
                    >
                      <Icon name={l.blockFlag.icon} size={12} /> {l.blockFlag.text}
                    </div>
                  )}
                  {l.foot && (
                    <div className="lead-foot">
                      <span className="src">
                        {l.foot.srcIcon && <Icon name={l.foot.srcIcon} size={12} />}
                        {l.foot.src}
                      </span>
                      {l.foot.mini && <span className={`mini ${l.foot.mini.tone}`}>{l.foot.mini.label}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="colnote">
          <h3>
            <Icon name="bar-chart-3" size={17} /> 이 화면 하나가 대체하는 것 — 현재 「입학_예약_및_상담_현황.xlsx」 14개 시트
          </h3>
          <div className="before-after">
            <div className="ba-col before">
              <div className="lab">현재 (엑셀 수기)</div>
              <ul>
                {BEFORE.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
            <div className="ba-col after">
              <div className="lab">DLab 통합관리 (To-Be)</div>
              <ul>
                {AFTER.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const admissionMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn">문자 자동발송 설정</button>
      <button className="btn pri">+ 예약 수동등록</button>
    </>
  ),
}
