import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Modal, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  createMealVendor,
  deleteMealVendor,
  getMealVendorAssignment,
  listMealVendors,
  saveMealVendorAssignment,
  type MealVendor,
} from '../../api/meals'
import type { Mockup } from './types'

/* 급식 업체 · 지점 배정 (F-4.5 부속 · 계획서 2-7) — /api/v1/admin/meal-vendors
 *
 * 급식 관리(F-4.5)가 아니라 **관리자**에 둔다. 업체 등록·삭제가 본사 전용이고
 * (지점 관리자는 403), 단가는 청구 금액이 되는 값이라 운영 설정 쪽이 맞다.
 *
 * ★ **배정은 연도별이다.** 해가 바뀌면 다시 만들어야 하는데 **전년도 복사가 안 넘긴다**
 *   (`/masters/yearly-copy` 대상에 급식이 없다 — 09-16 확인). 배정이 없으면 그 지점
 *   주문에 금액이 안 박혀 **신청은 받아지는데 청구가 안 만들어진다.** 그래서 이 화면은
 *   미설정 지점을 맨 위에 모아서 보여주고, 전년도 값을 그대로 가져오는 버튼을 둔다.
 *
 * ★ 지점당 업체 하나다(2026-09-16 클라이언트 확정). 요일·기간별로 갈리지 않는다.
 */

interface Row {
  academyId: number
  academyName: string
  /** 아직 안 정한 해면 null — 서버가 오류로 알려주는 것을 여기서 상태로 바꾼다 */
  vendorId: number | null
  vendorName: string | null
  unitPrice: number | null
  deadlineDays: number | null
  /** 전년도 값. 미설정 지점에 "작년 그대로" 를 제안할 때 쓴다 */
  lastYear: { vendorId: number; vendorName: string; unitPrice: number } | null
}

function won(n: number | null): string {
  return n === null ? '-' : `${n.toLocaleString()}원`
}

function Content() {
  const { academies } = useAcademy()
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [vendors, setVendors] = useState<MealVendor[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  /** 편집 중인 지점 한 줄 */
  const [edit, setEdit] = useState<{ row: Row; vendorId: number; unitPrice: string } | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)
  /** 업체 등록 */
  const [newVendor, setNewVendor] = useState<{ name: string; contactName: string; contactPhone: string } | null>(null)
  /** 업체 내리기 확인 */
  const [dropping, setDropping] = useState<MealVendor | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listMealVendors()
      setVendors(list)
      /* 지점별 조회가 한 건씩이다 — 일괄 조회 경로가 없다. 지점 수가 11개라 그대로 돈다.
         ★ 배정이 없으면 **오류로 온다**(MEAL_POLICY_NOT_FOUND). 그건 실패가 아니라
            "아직 안 정했다" 이므로 여기서 null 로 받아 넘긴다 */
      const got = await Promise.all(
        academies.map(async (a) => {
          const [now, prev] = await Promise.all([
            getMealVendorAssignment(a.id, year).catch(() => null),
            getMealVendorAssignment(a.id, year - 1).catch(() => null),
          ])
          const row: Row = {
            academyId: a.id,
            academyName: a.acadNm,
            vendorId: now?.vendorId ?? null,
            vendorName: now?.vendorName ?? null,
            unitPrice: now?.unitPrice ?? null,
            deadlineDays: now?.deadlineDays ?? null,
            lastYear: prev ? { vendorId: prev.vendorId, vendorName: prev.vendorName, unitPrice: prev.unitPrice } : null,
          }
          return row
        }),
      )
      /* 미설정을 위로 올린다 — 11줄 중 한 줄이 비어 있는 것을 스크롤로 찾게 하지 않는다 */
      got.sort((a, b) => Number(a.vendorId !== null) - Number(b.vendorId !== null))
      setRows(got)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '급식 업체를 불러오지 못했습니다.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [academies, year])

  useEffect(() => {
    void load()
  }, [load])

  const missing = rows.filter((r) => r.vendorId === null)

  async function save(academyId: number, vendorId: number, unitPrice: number): Promise<boolean> {
    setBusy(academyId)
    setEditErr(null)
    try {
      const res = await saveMealVendorAssignment({ academyId, year, vendorId, unitPrice })
      /* '원' 은 ㄴ받침이라 '으로' 다 — '7,700원 로' 가 됐었다 */
      setNotice(`${rows.find((r) => r.academyId === academyId)?.academyName} · ${res.vendorName} ${won(res.unitPrice)}으로 저장했습니다.`)
      await load()
      return true
    } catch (err) {
      setEditErr(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
      return false
    } finally {
      setBusy(null)
    }
  }

  /** 미설정 지점에 전년도 값을 그대로 넣는다. 전년도가 없는 지점은 건너뛴다 */
  async function copyLastYear() {
    const targets = missing.filter((r) => r.lastYear !== null)
    if (targets.length === 0) return
    setBusy(-1)
    const done: string[] = []
    const failed: string[] = []
    for (const r of targets) {
      try {
        await saveMealVendorAssignment({
          academyId: r.academyId,
          year,
          vendorId: r.lastYear!.vendorId,
          unitPrice: r.lastYear!.unitPrice,
        })
        done.push(r.academyName)
      } catch {
        /* ★ 일괄 경로가 없어 지점마다 부른다. 중간에 실패하면 **일부만 반영된 채 남으므로**
             무엇이 됐고 무엇이 안 됐는지 그대로 알린다(CLAUDE.md 4) */
        failed.push(r.academyName)
      }
    }
    setBusy(null)
    setNotice(
      failed.length === 0
        ? `${done.length}개 지점에 ${year - 1}년 값을 넣었습니다 — ${done.join(' · ')}`
        : `${done.length}개 지점은 됐고(${done.join(' · ')}), ${failed.length}개는 실패했습니다(${failed.join(' · ')}). 실패한 지점은 직접 정해 주세요.`,
    )
    await load()
  }

  const columns: Column<Row>[] = useMemo(
    () => [
      { key: 'academyName', header: '지점', width: '96px', sortable: true, value: (r) => r.academyName },
      {
        key: 'vendorName',
        header: '급식 업체',
        width: '140px',
        sortable: true,
        value: (r) => r.vendorName ?? '',
        render: (r) =>
          r.vendorName !== null ? (
            <b>{r.vendorName}</b>
          ) : (
            <span className="mk brandnew">미설정</span>
          ),
      },
      {
        key: 'unitPrice',
        header: '1식 단가',
        width: '100px',
        align: 'right',
        sortable: true,
        value: (r) => r.unitPrice ?? 0,
        render: (r) => (r.unitPrice === null ? <span style={{ color: 'var(--muted)' }}>-</span> : won(r.unitPrice)),
      },
      {
        key: 'deadlineDays',
        header: '신청 마감',
        width: '96px',
        align: 'center',
        /* 여기서 바꾸지 않는다 — 급식 관리의 마감 규칙이 정한다. 값만 같이 보여준다 */
        value: (r) => (r.deadlineDays === null ? '-' : `이용일 D-${r.deadlineDays}`),
      },
      {
        key: 'lastYear',
        /* ★ thisYear 가 아니라 **보고 있는 해**의 전년도다. 고정해 두면 2027 을 보는데
             제목만 2025 가 되어 값과 어긋난다 */
        header: `${year - 1}년`,
        width: '150px',
        value: (r) => (r.lastYear ? `${r.lastYear.vendorName} ${r.lastYear.unitPrice.toLocaleString()}` : '-'),
        render: (r) =>
          r.lastYear === null ? (
            <span style={{ color: 'var(--muted)' }}>-</span>
          ) : (
            <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
              {r.lastYear.vendorName} · {won(r.lastYear.unitPrice)}
            </span>
          ),
      },
      {
        key: 'act',
        header: '',
        width: '96px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <button
            className={r.vendorId === null ? 'btn pri' : 'btn'}
            style={{ padding: '4px 9px', fontSize: 11.5, whiteSpace: 'nowrap' }}
            disabled={busy !== null || vendors.length === 0}
            onClick={() => {
              setEditErr(null)
              setEdit({
                row: r,
                vendorId: r.vendorId ?? r.lastYear?.vendorId ?? vendors[0].id,
                unitPrice: String(r.unitPrice ?? r.lastYear?.unitPrice ?? ''),
              })
            }}
          >
            {r.vendorId === null ? '정하기' : '변경'}
          </button>
        ),
      },
    ],
    [busy, vendors, year],
  )

  return (
    <>
      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}
      {notice && <div className="note-box">{notice}</div>}

      {/* ★ 이 경고가 이 화면의 존재 이유다. 배정이 없으면 신청은 받아지는데 금액이 안 박혀
             청구가 안 만들어진다 — 연말에 조용히 터지는 자리라 맨 위에서 막는다 */}
      {!loading && missing.length > 0 && (
        <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
          <div className="ic">
            <Icon name="triangle-alert" size={17} />
          </div>
          <div>
            <div className="tt">
              {year}년 급식 업체가 정해지지 않은 지점이 {missing.length}곳 있습니다
            </div>
            <div className="tx">
              업체와 단가가 없으면 그 지점은 <b>급식 신청은 받아지는데 청구가 만들어지지 않습니다.</b>{' '}
              업체 배정은 해마다 새로 정해야 하고 전년도 복사에 포함되지 않습니다.
              {missing.some((m) => m.lastYear !== null) && (
                <>
                  {' '}
                  <button
                    className="btn"
                    style={{ marginLeft: 4, padding: '3px 9px', fontSize: 12 }}
                    disabled={busy !== null}
                    onClick={() => void copyLastYear()}
                  >
                    <Icon name="history" size={13} /> {year - 1}년 값 그대로 넣기
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.academyId)}
        masked={false}
        loading={loading}
        pageSize={12}
        countLabel={
          <>
            지점 <b>{rows.length}</b>곳
            {missing.length > 0 && (
              <span style={{ color: 'var(--amber)', fontWeight: 700 }}> · 미설정 {missing.length}</span>
            )}
          </>
        }
        emptyText="지점이 없습니다."
        toolbar={
          <>
            <select className="sel" style={{ width: 104 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => setNewVendor({ name: '', contactName: '', contactPhone: '' })}
            >
              <Icon name="plus" size={14} /> 업체 등록
            </button>
          </>
        }
      />

      {/* 등록된 업체 — 어디에도 안 붙은 업체를 여기서 내린다 */}
      <div className="card-sec" style={{ marginTop: 14 }}>
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="utensils" size={15} />
            </span>
            등록된 업체 {vendors.length}곳
          </div>
        </div>
        <div className="card-sec-b">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {vendors.map((v) => {
              const used = rows.filter((r) => r.vendorId === v.id).length
              return (
                <div
                  key={v.id}
                  className="note-box"
                  style={{ display: 'block', margin: 0, padding: '9px 12px', minWidth: 190 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b>{v.name}</b>
                    {/* 배정은 연도별이라 해를 함께 적는다 — 안 적으면 "디온푸드 0개" 만 보인다 */}
                    <span className="mk supplement">{year}년 {used}곳</span>
                    <button
                      className="btn"
                      style={{ marginLeft: 'auto', padding: '2px 7px', fontSize: 11, color: 'var(--red)' }}
                      disabled={busy !== null || used > 0}
                      title={used > 0 ? '배정된 지점이 있어 내릴 수 없습니다' : '목록에서 내립니다'}
                      onClick={() => setDropping(v)}
                    >
                      내리기
                    </button>
                  </div>
                  <div className="tx" style={{ marginTop: 3 }}>
                    {v.contactName || v.contactPhone ? (
                      `${v.contactName ?? ''} ${v.contactPhone ?? ''}`.trim()
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>연락처 없음</span>
                    )}
                  </div>
                </div>
              )
            })}
            {vendors.length === 0 && !loading && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>등록된 업체가 없습니다. 먼저 업체를 등록하세요.</div>
            )}
          </div>
        </div>
      </div>

      {edit && (
        <Modal
          title={`${edit.row.academyName} · ${year}년 급식`}
          sub="지점마다 업체는 하나입니다. 단가는 그 지점 급식 청구 금액이 됩니다."
          confirmLabel="저장"
          busy={busy === edit.row.academyId}
          confirmDisabled={edit.unitPrice.trim() === '' || Number(edit.unitPrice) <= 0}
          error={editErr}
          onConfirm={() => void save(edit.row.academyId, edit.vendorId, Number(edit.unitPrice)).then((ok) => ok && setEdit(null))}
          onClose={() => setEdit(null)}
        >
          <div className="frow">
            <label className="req">급식 업체</label>
            <div>
              <select
                className="sel"
                value={edit.vendorId}
                onChange={(e) => setEdit({ ...edit, vendorId: Number(e.target.value) })}
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="frow">
            <label className="req">1식 단가</label>
            <div>
              {/* ★ `step` 을 걸지 않는다. Modal 은 내용을 <form> 으로 감싸고 확인이 submit 이라,
                     값이 step 배수가 아니면 **브라우저가 제출을 조용히 막는다** — 요청도
                     오류도 안 뜨고 버튼만 안 먹는다. step={100} · min={1} 이면 7,700 이 막혔다 */}
              <input
                className="inp"
                type="number"
                min={0}
                style={{ width: 130 }}
                value={edit.unitPrice}
                onChange={(e) => setEdit({ ...edit, unitPrice: e.target.value })}
              />
              <div className="hint">
                {edit.row.lastYear
                  ? `${year - 1}년에는 ${edit.row.lastYear.vendorName} ${won(edit.row.lastYear.unitPrice)} 이었습니다.`
                  : '이 지점은 전년도 기록이 없습니다.'}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {newVendor && (
        <Modal
          title="급식 업체 등록"
          sub="업체를 먼저 등록한 뒤 지점에 배정합니다. 업체 등록은 본사만 할 수 있습니다."
          confirmLabel="등록"
          busy={busy === -2}
          confirmDisabled={newVendor.name.trim() === ''}
          error={editErr}
          onConfirm={() => {
            setBusy(-2)
            setEditErr(null)
            void createMealVendor({
              name: newVendor.name.trim(),
              contactName: newVendor.contactName.trim() || undefined,
              contactPhone: newVendor.contactPhone.trim() || undefined,
            })
              .then(async (v) => {
                setNewVendor(null)
                setNotice(`${v.name} 을(를) 등록했습니다. 아직 배정된 지점은 없습니다.`)
                await load()
              })
              .catch((e) => setEditErr(e instanceof ApiError ? e.message : '등록하지 못했습니다.'))
              .finally(() => setBusy(null))
          }}
          onClose={() => setNewVendor(null)}
        >
          <div className="frow">
            <label className="req">업체명</label>
            <div>
              <input
                className="inp"
                maxLength={40}
                value={newVendor.name}
                onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
              />
            </div>
          </div>
          <div className="frow">
            <label>담당자</label>
            <div>
              <input
                className="inp"
                maxLength={20}
                value={newVendor.contactName}
                onChange={(e) => setNewVendor({ ...newVendor, contactName: e.target.value })}
              />
            </div>
          </div>
          <div className="frow">
            <label>연락처</label>
            <div>
              <input
                className="inp"
                maxLength={20}
                placeholder="010-0000-0000"
                value={newVendor.contactPhone}
                onChange={(e) => setNewVendor({ ...newVendor, contactPhone: e.target.value })}
              />
            </div>
          </div>
        </Modal>
      )}

      {dropping && (
        <Modal
          title={`${dropping.name} 을(를) 목록에서 내릴까요?`}
          sub="배정된 지점이 없을 때만 내릴 수 있습니다."
          confirmLabel="내리기"
          danger
          busy={busy === -3}
          error={editErr}
          onConfirm={() => {
            setBusy(-3)
            setEditErr(null)
            void deleteMealVendor(dropping.id)
              .then(async () => {
                setDropping(null)
                setNotice(`${dropping.name} 을(를) 내렸습니다.`)
                await load()
              })
              .catch((e) => setEditErr(e instanceof ApiError ? e.message : '내리지 못했습니다.'))
              .finally(() => setBusy(null))
          }}
          onClose={() => setDropping(null)}
        />
      )}
    </>
  )
}

export const mealVendorMockup: Mockup = { Content, allBranches: true }
