import { useState } from 'react'
import { downloadCsv, toCsv, toTsv } from '../../lib/csv'
import { displayCell, type Column } from './DataTable'
import { Icon } from '../Icon'
import './export-buttons.css'

interface Props<T> {
  filename: string
  columns: Column<T>[]
  rows: T[]
  /**
   * 마스킹 여부. 기본 ON — 실행가이드 3.2
   * "엑셀 다운로드 마스킹 기본 ON(010-****-1234)"
   */
  masked?: boolean
  label?: string
}

function extract<T>(columns: Column<T>[], rows: T[], masked: boolean): { headers: string[]; body: string[][] } {
  // 헤더가 문자열이 아니면(배지·아이콘) exportHeader 를 쓰고, 그것도 없을 때만 key 로 떨어진다
  const headers = columns.map((c) =>
    typeof c.header === 'string' ? c.header : (c.exportHeader ?? c.key),
  )
  const body = rows.map((r) => columns.map((c) => displayCell(c, r, masked)))
  return { headers, body }
}

/** 엑셀(CSV) 다운로드. 마스킹 상태를 배지로 항상 표시한다 */
export function ExcelButton<T>({ filename, columns, rows, masked = true, label = '엑셀' }: Props<T>) {
  return (
    <button
      type="button"
      className="btn"
      onClick={() => {
        const { headers, body } = extract(columns, rows, masked)
        downloadCsv(filename, toCsv(headers, body))
      }}
    >
      <Icon name="file-spreadsheet" size={14} />
      {label}
      {/* 두 글자를 겹쳐 두고 하나만 보인다 — '마스킹'·'원본' 폭이 달라 토글할 때 옆 버튼이 밀렸다 */}
      <span className={`mask-pill${masked ? '' : ' off'}`}>
        <span style={{ visibility: masked ? 'visible' : 'hidden' }}>마스킹</span>
        <span style={{ visibility: masked ? 'hidden' : 'visible' }}>원본</span>
      </span>
    </button>
  )
}

/** 클립보드 복사 — 교무업무 명단조회의 Copy 버튼 */
export function CopyButton<T>({ columns, rows, masked = true }: Omit<Props<T>, 'filename'>) {
  const [done, setDone] = useState(false)

  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        const { headers, body } = extract(columns, rows, masked)
        try {
          await navigator.clipboard.writeText(toTsv(headers, body))
          setDone(true)
          window.setTimeout(() => setDone(false), 1600)
        } catch {
          /* 클립보드 권한 거부 — 조용히 무시 */
        }
      }}
    >
      <Icon name={done ? 'check' : 'clipboard-list'} size={14} />
      {done ? '복사됨' : 'Copy'}
    </button>
  )
}

/** 인쇄 — 교무업무 명단조회의 Print 버튼 */
export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      <Icon name="printer" size={14} />
      {label}
    </button>
  )
}

/** 마스킹 ON/OFF 토글. 실제 해제 권한은 BE RBAC이 최종 결정한다 */
export function MaskToggle({ masked, onChange }: { masked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`mask-toggle${masked ? ' on' : ''}`}
      onClick={() => onChange(!masked)}
      title="개인정보 가리기 — 해제할 수 있는지는 계정 권한에 따라 다릅니다"
    >
      <Icon name={masked ? 'shield-check' : 'shield-off'} size={14} />
      마스킹{' '}
      {/* ON·OFF 를 한 칸에 겹쳐 두고 하나만 보인다 — 글자 폭이 달라 누를 때마다 옆 버튼들이 밀렸다 */}
      <span className="mask-st">
        <span style={{ visibility: masked ? 'visible' : 'hidden' }}>ON</span>
        <span style={{ visibility: masked ? 'hidden' : 'visible' }}>OFF</span>
      </span>
    </button>
  )
}
