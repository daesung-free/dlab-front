import { useNavigate } from 'react-router-dom'
import {
  GROUPS,
  KIND_LABEL,
  PHASE,
  SCREENS,
  countByKind,
  countByPhase,
  screensOf,
  type PhaseNo,
} from '../data/menu'
import { Icon } from '../components/Icon'
import { PageHead } from '../components/PageHead'
import './home.css'

const PHASE_ORDER: PhaseNo[] = [0, 1, 2, 3, 4]

export function Home() {
  const nav = useNavigate()

  return (
    <>
      <PageHead
        crumb={
          <>
            <b>전체 메뉴 구성</b> · IA
          </>
        }
        title="통합관리프로그램 · 전체 화면 구성"
        sub={
          <>
            요구사항정의서 <b>1.화면별 요구사항</b> 시트를 그대로 옮긴{' '}
            <b>
              {GROUPS.length}개 대분류 · {SCREENS.length}개 화면
            </b>
            입니다. Phase·FE 작업순서는 <b>개발착수 실행가이드</b> 기준입니다. 상단 탭 또는 아래 카드를 눌러 대분류로
            이동하세요.
          </>
        }
      />

      <div className="note-box warn">
        <div className="ic">
          <Icon name="triangle-alert" size={17} />
        </div>
        <div>
          <div className="tt">중요 전제 — DSA 레거시 소스코드·DB 접근 불가</div>
          <div className="tx">
            이관할 코드 자체가 없으므로 <b>[기존이관-무수정]</b> 같은 코드 재사용 분류는 존재하지 않습니다. DSA 실사 화면은{' '}
            <b>요구사항이 실제 운영에서 검증되었다는 근거</b>와 <b>UI/UX 참고자료</b>로만 활용되며, 코드·DB 스키마·내부
            로직은 예외 없이 전량 신규 설계·구현 대상입니다. → <b>'요구사항 검증됨'으로 분류된 화면도 구현 공수는 완전
            신규와 동일하게 산정</b>해야 합니다.
          </div>
        </div>
      </div>

      <div className="note-box">
        <div className="ic">
          <Icon name="git-compare" size={17} />
        </div>
        <div>
          <div className="tt">4.11 신규 확장 — 참고할 UX 자산이 전혀 없는 구간</div>
          <div className="tx">
            데일리루틴 · 학습계획 · 메시지(1:1채팅/가족채팅방) · 상담리포트 · 승인라우팅 · Daily Report 집계 · 대면QnA ·
            좌석이탈 · 영단어시험 · 신상기록부 · 연간행사는 DSA에 대응 화면이 <b>전혀 없는 완전 신규</b> 도메인입니다.
            화면설계 단계부터 더 걸리므로 일정에 반영해야 하며, <b>학습계획(F-4.11-2)</b>이 FE 최대 공수 단일화면입니다.
          </div>
        </div>
      </div>

      <div className="stat-strip c6 home-stats">
        {PHASE_ORDER.map((p) => (
          <div className="stat" key={p}>
            <div className="l">
              <span className={`ph p${p}`}>P{p}</span> {PHASE[p].label}
            </div>
            <div className="v" style={{ color: PHASE[p].color }}>
              {countByPhase(p)}
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}> 화면</span>
            </div>
            <div className="d">{PHASE[p].period}</div>
          </div>
        ))}
      </div>

      <div className="legend-inline">
        <div className="li">
          <span className="mk verified">검증됨</span> <b>{countByKind('verified')}</b> — DSA 대응 화면 있음
        </div>
        <div className="li">
          <span className="mk supplement">보완</span> <b>{countByKind('supplement')}</b> — 화면은 있으나 확장 필요
        </div>
        <div className="li">
          <span className="mk brandnew">신규</span> <b>{countByKind('brandnew')}</b> — 대응 화면 없음
        </div>
        <div className="li" style={{ marginLeft: 'auto' }}>
          Phase&nbsp;{' '}
          {PHASE_ORDER.map((p) => (
            <span className={`ph p${p}`} key={p} style={{ marginLeft: 4 }}>
              P{p}
            </span>
          ))}
        </div>
      </div>

      <div className="ov-grid">
        {GROUPS.map((g) => {
          const items = screensOf(g.id)
          return (
            <button type="button" className="ov-cat" key={g.id} onClick={() => nav(`/g/${g.id}`)}>
              <div className="ov-cat-h">
                <span className="ic">
                  <Icon name={g.icon} size={17} />
                </span>
                <span className="no">{g.no}</span>
                <span className="nm">{g.name}</span>
                <span className="ct">{items.length}</span>
              </div>
              <div className="cd">{g.desc}</div>
              <div className="ov-items">
                {items.map((s) => (
                  <div className="ov-item" key={s.id}>
                    <span className="d" style={{ background: PHASE[s.phase].color }} title={PHASE[s.phase].name} />
                    <span className="nm">{s.name}</span>
                    <span
                      className={`mk ${s.kind === 'brandnew' ? 'brandnew' : s.kind === 'supplement' ? 'supplement' : 'verified'}`}
                      title={KIND_LABEL[s.kind]}
                    >
                      {s.kind === 'brandnew' ? '신규' : s.kind === 'supplement' ? '보완' : '검증'}
                    </span>
                  </div>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}
