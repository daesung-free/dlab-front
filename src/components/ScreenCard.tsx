import { Link } from 'react-router-dom'
import { KIND_LABEL, PHASE, type Screen } from '../data/menu'
import { resolveIssue } from '../data/issues'
import { Icon } from './Icon'

const KIND_CLASS: Record<Screen['kind'], string> = {
  verified: 'verified',
  supplement: 'supplement',
  brandnew: 'brandnew',
}

/** 우선순위 → 배지 강조 단계 */
function issueClass(priority?: string) {
  if (priority === '최우선') return 'iss p0'
  if (priority === '높음') return 'iss p1'
  return 'iss p2'
}

export function ScreenCard({ s }: { s: Screen }) {
  return (
    <article className="scard">
      <div className="scard-h">
        <span className="sc-ic">
          <Icon name={s.icon} size={18} />
        </span>
        <span className="sc-t">{s.name}</span>
        <span className="sc-code">{s.code}</span>
      </div>

      <div className="sc-marks">
        <span className={`mk-ph p${s.phase}`}>{PHASE[s.phase].name}</span>
        <span className={`mk ${KIND_CLASS[s.kind]}`}>{KIND_LABEL[s.kind]}</span>
        {s.feOrder && <span className="sc-fe">FE {s.feOrder}순위</span>}
      </div>

      <div className="sc-desc">{s.summary}</div>

      {s.logic.length > 0 && (
        <>
          <div className="sc-sub">핵심 요구사항 · 로직</div>
          <ul className="sc-feats">
            {s.logic.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </>
      )}

      {s.tables.length > 0 && (
        <>
          <div className="sc-sub">주요 데이터 항목</div>
          <div className="sc-tables">
            {s.tables.map((t) => (
              <code key={t}>{t}</code>
            ))}
          </div>
        </>
      )}

      {s.issues.length > 0 && (
        <>
          <div className="sc-sub">관련 오픈이슈</div>
          <div className="sc-issues">
            {s.issues.map((ref) => {
              const issue = resolveIssue(ref)
              return (
                <span key={ref} className={issueClass(issue?.priority)} title={issue ? `[${issue.priority}] ${issue.body}` : ref}>
                  {ref}
                  {issue ? ` · ${issue.priority}` : ''}
                </span>
              )
            })}
          </div>
        </>
      )}

      {s.note0723 && (
        <div className="sc-0723">
          <b>▷ [0723 미팅 반영]</b> {s.note0723}
        </div>
      )}

      <div className="sc-dsa">
        <b>DSA 실사 근거</b> (코드 아님 · UX 참고용) — {s.dsaNote}
      </div>

      <div className="sc-foot">
        <Link className="sc-open" to={`/s/${s.id}`}>
          <Icon name="chevron-right" size={14} /> 화면 열기
        </Link>
        {s.refHtml && (
          <a className="sc-ref" href={s.refHtml} target="_blank" rel="noreferrer">
            정적 시안 보기 ↗
          </a>
        )}
      </div>
    </article>
  )
}
