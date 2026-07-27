import { useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'

/* F-4.10-1 기초 관리 — 신규개발-요구사항검증됨
 * 학과·전형·반·강의실·사물함·장학 마스터 + 전년도 복사.
 * 복사 의존 순서를 화면에서 그대로 보여준다(단순 INSERT SELECT 금지). */

interface MasterRow {
  id: string
  code: string
  name: string
  memo: string
  order: number
  active: boolean
}

interface Master {
  key: string
  label: string
  icon: string
  table: string
  /** 전년도 복사 의존 순서 (1부터). 없으면 복사 대상 아님 */
  copyOrder?: number
  rows: MasterRow[]
}

function rows(items: [string, string, string][]): MasterRow[] {
  return items.map(([code, name, memo], i) => ({
    id: `${code}-${i}`,
    code,
    name,
    memo,
    order: i + 1,
    active: true,
  }))
}

const MASTERS: Master[] = [
  {
    key: 'department',
    label: '학과',
    icon: 'graduation-cap',
    table: 'departments',
    copyOrder: 1,
    rows: rows([
      ['DEP-NA', '자연계열', '수학 미적/기하 · 과탐 2과목'],
      ['DEP-IN', '인문계열', '수학 확통 · 사탐 2과목'],
      ['DEP-ME', '메디컬', '의·치·한·수 목표반'],
    ]),
  },
  {
    key: 'course_type',
    label: '전형',
    icon: 'award',
    table: 'course_types',
    copyOrder: 2,
    rows: rows([
      ['CT-RE', '재수 정규', '3월 개강 정규과정'],
      ['CT-SA', '삼수 이상', 'N수 포함'],
      ['CT-SP', '특별전형', '장학 연계'],
    ]),
  },
  {
    key: 'class_group',
    label: '반',
    icon: 'layout-grid',
    table: 'class_groups',
    copyOrder: 3,
    rows: rows([
      ['CG-1', '1반', '인문 · 담임 최지원 · 정원 14'],
      ['CG-2', '2반', '자연 · 담임 김유진 · 정원 14'],
      ['CG-3', '3반', '자연 · 담임 이장원 · 정원 14'],
      ['CG-4', '4반', '자연 · 담임 박서영 · 정원 14'],
    ]),
  },
  {
    key: 'curriculum',
    label: '교육과정',
    icon: 'clipboard-list',
    table: 'curriculums',
    copyOrder: 4,
    rows: rows([
      ['CU-KOR', '국어', '언매 / 화작'],
      ['CU-MAT', '수학', '미적 / 기하 / 확통'],
      ['CU-ENG', '영어', '공통'],
      ['CU-SCI', '과학탐구', '물리Ⅱ · 지구과학 등'],
    ]),
  },
  {
    key: 'penalty_item',
    label: '상벌점 항목',
    icon: 'star',
    table: 'penalty_items',
    copyOrder: 5,
    rows: rows([
      ['PI-LATE', '지각', '-2점 · 트리거 ATTENDANCE_LATE'],
      ['PI-ABS', '무단결석', '-5점 · 트리거 ATTENDANCE_ABSENT'],
      ['PI-FULL', '개근', '+5점'],
    ]),
  },
  {
    key: 'tuition',
    label: '교습비',
    icon: 'badge-dollar-sign',
    table: 'tuitions',
    copyOrder: 6,
    rows: rows([
      ['TU-REG', '정규 교습비', '월 단위 청구'],
      ['TU-SPC', '특강비', '특강별 별도'],
    ]),
  },
  {
    key: 'room',
    label: '강의실',
    icon: 'building-2',
    table: 'rooms',
    rows: rows([
      ['RM-201', '201호', '수용 20 · 2층'],
      ['RM-202', '202호', '수용 20 · 2층'],
      ['RM-301', '301호', '수용 24 · 3층'],
    ]),
  },
  {
    key: 'locker',
    label: '사물함',
    icon: 'lock',
    table: 'lockers',
    rows: rows([
      ['LK-A', 'A블록', 'L-001 ~ L-120'],
      ['LK-B', 'B블록', 'L-121 ~ L-240'],
    ]),
  },
  {
    key: 'scholarship',
    label: '장학',
    icon: 'trophy',
    table: 'scholarships',
    rows: rows([
      ['SC-100', '수능100', '수능 성적 기준 100% 환급'],
      ['SC-50', '평가원50', '평가원 모의고사 기준 50%'],
    ]),
  },
]

const COLUMNS: Column<MasterRow>[] = [
  { key: 'order', header: '순서', width: '64px', align: 'center', sortable: true, value: (r) => r.order },
  {
    key: 'code',
    header: '코드',
    width: '110px',
    value: (r) => r.code,
    render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
  },
  { key: 'name', header: '명칭', width: '160px', sortable: true, value: (r) => r.name },
  { key: 'memo', header: '비고', value: (r) => r.memo },
  {
    key: 'active',
    header: '사용',
    width: '72px',
    align: 'center',
    value: (r) => (r.active ? '사용' : '중지'),
    render: (r) => <span className={`mk ${r.active ? 'verified' : 'brandnew'}`}>{r.active ? '사용' : '중지'}</span>,
  },
  {
    key: 'act',
    header: '',
    width: '92px',
    align: 'center',
    value: () => '',
    render: () => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          수정
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}>
          삭제
        </button>
      </div>
    ),
  },
]

function Content() {
  const [active, setActive] = useState(MASTERS[0])

  return (
    <>
      <div className="note-box plain">
        <div className="ic">
          <Icon name="history" size={17} />
        </div>
        <div>
          <div className="tt">전년도 복사 의존 순서 — 이 순서를 지켜 순회해야 합니다</div>
          <div className="tx">
            {MASTERS.filter((m) => m.copyOrder)
              .sort((a, b) => a.copyOrder! - b.copyOrder!)
              .map((m, i, arr) => (
                <span key={m.key}>
                  <code>{m.key}</code>
                  {i < arr.length - 1 && ' → '}
                </span>
              ))}
            <br />
            <b>단순 INSERT SELECT는 금지</b>입니다. 앞 단계가 만든 새 연도 ID를 뒤 단계가 참조하기 때문에,
            <b> YearlySnapshotService</b>가 의존 그래프를 순회하며 ID를 다시 매핑해야 합니다.
          </div>
        </div>
      </div>

      <div className="split-3-2">
        <div>
          <DataTable
            columns={COLUMNS}
            rows={active.rows}
            rowKey={(r) => r.id}
            masked={false}
            pageSize={10}
            countLabel={
              <>
                {active.label} <b>{active.rows.length}</b>건 · <code style={{ fontSize: 11 }}>{active.table}</code>
              </>
            }
            toolbar={
              <>
                <button className="btn">
                  <Icon name="history" size={14} /> 전년도 복사
                </button>
                <ExcelButton filename={`기초_${active.label}`} columns={COLUMNS} rows={active.rows} masked={false} />
                <button className="btn pri">
                  <Icon name="plus" size={14} /> 등록
                </button>
              </>
            }
          />
        </div>

        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="sliders-horizontal" size={15} />
              </span>
              기초 데이터 종류
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 11 }}>
            {MASTERS.map((m) => (
              <button
                type="button"
                key={m.key}
                onClick={() => setActive(m)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: active.key === m.key ? 'var(--mint-wash)' : 'transparent',
                  color: active.key === m.key ? 'var(--mint-d)' : 'var(--ink-2)',
                  fontWeight: active.key === m.key ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <Icon name={m.icon} size={15} />
                <span style={{ flex: 1 }}>{m.label}</span>
                {m.copyOrder && (
                  <span className="ph p1" title="전년도 복사 대상">
                    복사 {m.copyOrder}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{m.rows.length}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export const basicSettingsMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn">
        <Icon name="history" size={14} /> 전체 전년도 복사
      </button>
    </>
  ),
}
