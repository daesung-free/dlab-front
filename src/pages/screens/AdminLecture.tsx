import { useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.10-4 특강 관리(특강 기초 설정) — 신규개발-요구사항검증됨
 * DSA '관리자>특강관리>특강 관리'에서 상태별 필터·특강목록·등록/배정/수정/삭제 확인.
 * '설명회 신청 항목'은 별도 추가 개발이 필요할 수 있어 확인 대상. */

interface LectureMaster {
  id: string
  code: string
  month: string
  name: string
  category: '단과' | '실전' | '해설' | '설명회'
  teacher: string
  capacity: number
  fee: number
  status: '준비' | '모집중' | '마감' | '종료'
}

const MASTERS: LectureMaster[] = [
  { id: 'm1', code: 'LEC-2606-01', month: '2026-06', name: '수학 미적 킬러문항 특강', category: '단과', teacher: '김유진', capacity: 30, fee: 320000, status: '마감' },
  { id: 'm2', code: 'LEC-2606-02', month: '2026-06', name: '국어 언매 심화', category: '단과', teacher: '최지원', capacity: 25, fee: 280000, status: '모집중' },
  { id: 'm3', code: 'LEC-2606-03', month: '2026-06', name: '지구과학 신유형 대비', category: '실전', teacher: '이장원', capacity: 20, fee: 240000, status: '마감' },
  { id: 'm4', code: 'LEC-2607-01', month: '2026-07', name: '7월 학평 해설 특강', category: '해설', teacher: '박서영', capacity: 40, fee: 90000, status: '준비' },
  { id: 'm5', code: 'LEC-2605-01', month: '2026-05', name: '영어 빈칸추론 집중', category: '단과', teacher: '박서영', capacity: 25, fee: 260000, status: '종료' },
]

const BRIEFINGS: LectureMaster[] = [
  { id: 'b1', code: 'BRF-2606-01', month: '2026-06', name: '2027학년도 입학 설명회 (1차)', category: '설명회', teacher: '최지원', capacity: 120, fee: 0, status: '모집중' },
  { id: 'b2', code: 'BRF-2607-01', month: '2026-07', name: '2027학년도 입학 설명회 (2차)', category: '설명회', teacher: '최지원', capacity: 120, fee: 0, status: '준비' },
]

const STATUS_TONE: Record<LectureMaster['status'], string> = {
  준비: 'supplement',
  모집중: 'verified',
  마감: 'supplement',
  종료: 'brandnew',
}

const COLUMNS: Column<LectureMaster>[] = [
  {
    key: 'code',
    header: '코드',
    width: '128px',
    sortable: true,
    value: (r) => r.code,
    render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
  },
  { key: 'month', header: '월', width: '84px', align: 'center', sortable: true, value: (r) => r.month },
  { key: 'name', header: '명칭', sortable: true, value: (r) => r.name },
  {
    key: 'category',
    header: '유형',
    width: '76px',
    align: 'center',
    value: (r) => r.category,
    render: (r) => <span className="mk supplement">{r.category}</span>,
  },
  { key: 'teacher', header: '담당', width: '78px', value: (r) => r.teacher },
  { key: 'capacity', header: '정원', width: '68px', align: 'right', sortable: true, value: (r) => r.capacity },
  {
    key: 'fee',
    header: '비용',
    width: '96px',
    align: 'right',
    value: (r) => r.fee,
    render: (r) => (r.fee ? `${r.fee.toLocaleString()}원` : <span style={{ color: 'var(--muted)' }}>무료</span>),
  },
  {
    key: 'status',
    header: '상태',
    width: '80px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => <span className={`mk ${STATUS_TONE[r.status]}`}>{r.status}</span>,
  },
  {
    key: 'act',
    header: '',
    width: '130px',
    align: 'center',
    value: () => '',
    render: () => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          배정
        </button>
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
  const [tab, setTab] = useState('lecture')
  const rows = tab === 'lecture' ? MASTERS : BRIEFINGS

  return (
    <>
      {tab === 'briefing' && (
        <div className="blocked-note">
          <span className="ic">
            <Icon name="triangle-alert" size={16} />
          </span>
          <div>
            <div className="tt">설명회 신청 — 추가 개발 범위 확인 필요</div>
            <div className="tx">
              DSA '관리자 &gt; 특강관리'에는 <b>설명회 신청 항목이 없습니다</b>. 특강 마스터에 유형만 추가해 재사용할지,
              별도 도메인으로 분리할지 확정이 필요합니다. 지금은 <b>특강 마스터의 유형 하나(설명회)</b>로 다루는 안을
              그려 뒀습니다 — 신청자 관리는 특강 신청명단(F-4.7)을 그대로 쓸 수 있습니다.
            </div>
          </div>
        </div>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'lecture', label: '특강 기초 설정', count: MASTERS.length },
            { key: 'briefing', label: '설명회', count: BRIEFINGS.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div style={{ padding: 14 }}>
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.id}
            masked={false}
            pageSize={10}
            countLabel={
              <>
                {tab === 'lecture' ? '특강' : '설명회'} <b>{rows.length}</b>건
              </>
            }
            toolbar={
              <>
                <ExcelButton filename={tab === 'lecture' ? '특강_기초설정' : '설명회_목록'} columns={COLUMNS} rows={rows} masked={false} />
                <button className="btn pri">
                  <Icon name="plus" size={14} /> {tab === 'lecture' ? '특강' : '설명회'} 등록
                </button>
              </>
            }
          />
        </div>
      </div>

      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="plus" size={15} />
            </span>
            {tab === 'lecture' ? '특강' : '설명회'} 등록
          </div>
        </div>
        <div className="card-sec-b">
          <div className="split">
            <div>
              <div className="frow">
                <label className="req">명칭</label>
                <input className="inp" placeholder={tab === 'lecture' ? '수학 미적 킬러문항 특강' : '2027학년도 입학 설명회'} />
              </div>
              <div className="frow">
                <label className="req">개설 월</label>
                <div className="two">
                  <input className="inp" type="month" defaultValue="2026-07" />
                  <select className="sel">
                    <option>단과</option>
                    <option>실전</option>
                    <option>해설</option>
                    <option>설명회</option>
                  </select>
                </div>
              </div>
              <div className="frow">
                <label className="req">담당</label>
                <select className="sel">
                  <option>김유진</option>
                  <option>최지원</option>
                  <option>이장원</option>
                  <option>박서영</option>
                </select>
              </div>
            </div>
            <div>
              <div className="frow">
                <label className="req">정원</label>
                <div className="two">
                  <input className="inp" type="number" defaultValue={30} />
                  <select className="sel">
                    <option>대기자 접수 허용</option>
                    <option>대기자 접수 안 함</option>
                  </select>
                </div>
              </div>
              <div className="frow">
                <label>비용</label>
                <div className="two">
                  <input className="inp" type="number" placeholder="320000" />
                  <select className="sel">
                    <option>수납 연동</option>
                    <option>무료</option>
                  </select>
                </div>
              </div>
              <div className="frow">
                <label>강의실</label>
                <select className="sel">
                  <option>201호</option>
                  <option>202호</option>
                  <option>301호</option>
                </select>
              </div>
              <div className="frow">
                <label>&nbsp;</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn pri">
                    <Icon name="save" size={14} /> 등록
                  </button>
                  <button className="btn">초기화</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export const adminLectureMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
    </>
  ),
}
