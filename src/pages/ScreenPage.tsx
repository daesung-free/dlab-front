import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { KIND_DESC, KIND_LABEL, PHASE, findGroup, findScreen } from '../data/menu'
import { resolveIssue } from '../data/issues'
import { Icon } from '../components/Icon'
import { PageHead } from '../components/PageHead'
import { Tabs } from '../components/Tabs'
import { MOCKUPS } from './screens'
import './screen.css'

/** 요구사항 명세 패널 — 목업이 있든 없든 항상 열람 가능 */
function SpecView({ screenId }: { screenId: string }) {
  const s = findScreen(screenId)!

  return (
    <div className="detail-grid">
      <div className="detail-body">
        {s.logic.length > 0 && (
          <div className="dsec">
            <h3>
              <span className="ico">
                <Icon name="route" size={15} />
              </span>
              핵심 요구사항 · 로직
            </h3>
            <ul className="sc-feats" style={{ marginBottom: 0 }}>
              {s.logic.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="dsec">
          <h3>
            <span className="ico">
              <Icon name="file-spreadsheet" size={15} />
            </span>
            DSA 화면 실사 근거
          </h3>
          <div className="sc-dsa" style={{ marginBottom: 0 }}>
            {s.dsaNote}
          </div>
        </div>

        {s.note0723 && (
          <div className="dsec">
            <h3>
              <span className="ico">
                <Icon name="triangle-alert" size={15} />
              </span>
              0723 미팅 반영분
            </h3>
            <div className="sc-0723" style={{ marginBottom: 0 }}>
              {s.note0723}
            </div>
          </div>
        )}
      </div>

      <aside className="detail-body">
        <div className="dsec">
          <h3>
            <span className="ico">
              <Icon name="layout-dashboard" size={15} />
            </span>
            개발 정보
          </h3>
          <div className="kv">
            <div className="row">
              <span className="k">기능번호</span>
              <span className="v">
                <code style={{ fontSize: 12 }}>{s.code}</code>
              </span>
            </div>
            <div className="row">
              <span className="k">구분</span>
              <span className="v">
                <span className={`mk ${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--muted)' }}>{KIND_DESC[s.kind]}</div>
              </span>
            </div>
            <div className="row">
              <span className="k">Phase</span>
              <span className="v">
                <span className={`mk-ph p${s.phase}`}>{PHASE[s.phase].name}</span>
                <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--muted)' }}>{PHASE[s.phase].period}</div>
              </span>
            </div>
            <div className="row">
              <span className="k">FE 순서</span>
              <span className="v">{s.feOrder ? `${s.feOrder}순위` : '실행가이드 미지정'}</span>
            </div>
          </div>
        </div>

        {s.tables.length > 0 && (
          <div className="dsec">
            <h3>
              <span className="ico">
                <Icon name="layout-grid" size={15} />
              </span>
              주요 데이터 항목
            </h3>
            <div className="sc-tables" style={{ marginBottom: 0 }}>
              {s.tables.map((t) => (
                <code key={t}>{t}</code>
              ))}
            </div>
          </div>
        )}

        <div className="dsec">
          <h3>
            <span className="ico">
              <Icon name="alert-circle" size={15} />
            </span>
            관련 오픈이슈 {s.issues.length}건
          </h3>
          {s.issues.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>연결된 미해결 이슈 없음</div>
          ) : (
            <div className="kv">
              {s.issues.map((ref) => {
                const issue = resolveIssue(ref)
                if (!issue) return null
                return (
                  <div className="row" key={ref} style={{ flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span
                        className={
                          issue.priority === '최우선' ? 'iss p0' : issue.priority === '높음' ? 'iss p1' : 'iss p2'
                        }
                      >
                        {issue.code} · {issue.priority}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{issue.owner}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>{issue.body}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

export function ScreenPage() {
  const { screenId } = useParams()
  const [tab, setTab] = useState('mock')

  const s = screenId ? findScreen(screenId) : undefined
  if (!s) return <Navigate to="/" replace />

  const group = findGroup(s.groupId)!
  const mockup = MOCKUPS[s.id]
  const showMock = mockup && tab === 'mock'

  return (
    <>
      <PageHead
        crumb={
          <>
            <Link to={`/g/${group.id}`}>
              <b>
                {group.no} {group.name}
              </b>
            </Link>{' '}
            · {s.code}
          </>
        }
        title={s.name}
        icon={s.icon}
        sub={s.summary}
        actions={showMock ? mockup.actions : undefined}
      />

      {mockup && (
        <Tabs
          standalone
          items={[
            { key: 'mock', label: '화면 목업' },
            { key: 'spec', label: '요구사항 명세' },
          ]}
          active={tab}
          onChange={setTab}
        />
      )}

      {showMock ? (
        <mockup.Content />
      ) : (
        <>
          {!mockup && (
            <div className="mock-stub" style={{ marginBottom: 16 }}>
              <div className="t">화면 목업 준비 중</div>
              <div className="x">
                {PHASE[s.phase].name} · {PHASE[s.phase].period}
                <br />
                {s.feOrder ? `FE ${s.feOrder}순위 · ` : ''}아래 요구사항 명세를 기준으로 목업을 붙일 자리입니다.
              </div>
            </div>
          )}
          <SpecView screenId={s.id} />
        </>
      )}
    </>
  )
}
