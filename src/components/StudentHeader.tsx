import type { ReactNode } from 'react'
import './student-header.css'

interface Props {
  name: string
  /** 원생코드 — 시안의 code-pill */
  code: string
  /** 계열·반·좌석 등 요약 라인 */
  sub: ReactNode
  /** 우측 배지 영역 */
  right?: ReactNode
}

/** 상담·성적 시안이 공유하던 학생 상세 헤더 */
export function StudentHeader({ name, code, sub, right }: Props) {
  return (
    <div className="stu-head">
      <div className="big">{name.slice(0, 1)}</div>
      <div className="stu-meta">
        <h2>
          {name} <span className="code-pill">{code}</span>
        </h2>
        <div className="sub">{sub}</div>
      </div>
      {right && <div className="stu-right">{right}</div>}
    </div>
  )
}
