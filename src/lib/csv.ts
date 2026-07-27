/* ============================================================================
 * CSV 생성·다운로드
 *
 * BE에 엑셀 Import/Export 프레임워크가 생기기 전까지 FE에서 목업 다운로드를
 * 제공하기 위한 임시 구현이다. 실제 서비스에서는 서버가 xlsx를 만들어 내려주고
 * (마스킹 여부도 서버 권한이 결정) FE는 링크만 여는 형태가 된다.
 * ========================================================================== */

/** 엑셀이 UTF-8로 인식하도록 BOM을 붙인다 (없으면 한글이 깨짐) */
const BOM = '﻿'

function escapeCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(','))
  return BOM + lines.join('\r\n')
}

/** 브라우저에서 즉시 다운로드 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 탭 구분 텍스트 — 엑셀에 바로 붙여넣기 가능 (교무업무 Copy 버튼) */
export function toTsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.join('\t')).join('\n')
}
