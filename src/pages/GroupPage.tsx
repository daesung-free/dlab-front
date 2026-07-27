import { Navigate, useParams } from 'react-router-dom'
import { KIND_LABEL, PHASE, findGroup, screensOf, type PhaseNo } from '../data/menu'
import { ScreenCard } from '../components/ScreenCard'
import { PageHead } from '../components/PageHead'
import './screen.css'

const PHASE_ORDER: PhaseNo[] = [0, 1, 2, 3, 4]

export function GroupPage() {
  const { groupId } = useParams()
  const group = groupId ? findGroup(groupId) : undefined
  if (!group) return <Navigate to="/" replace />

  const screens = screensOf(group.id)

  return (
    <>
      <PageHead
        crumb={
          <>
            <b>
              {group.no} {group.name}
            </b>{' '}
            · {screens.length}개 화면
          </>
        }
        title={group.name}
        icon={group.icon}
        sub={group.desc}
      />

      <div className="legend-inline">
        <div className="li">
          <span className="mk verified">{KIND_LABEL.verified}</span>
        </div>
        <div className="li">
          <span className="mk supplement">{KIND_LABEL.supplement}</span>
        </div>
        <div className="li">
          <span className="mk brandnew">{KIND_LABEL.brandnew}</span>
        </div>
        <div className="li" style={{ marginLeft: 'auto' }}>
          Phase&nbsp;{' '}
          {PHASE_ORDER.map((p) => (
            <span className={`ph p${p}`} key={p} style={{ marginLeft: 4 }} title={PHASE[p].name}>
              P{p}
            </span>
          ))}
        </div>
      </div>

      <div className="cards">
        {screens.map((s) => (
          <ScreenCard key={s.id} s={s} />
        ))}
      </div>
    </>
  )
}
