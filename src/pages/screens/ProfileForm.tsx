import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExcelButton, MaskToggle, Modal, useMaskDefault, type Column } from '../../components/common'
import { StudentList, type StudentRow } from '../../components/StudentList'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { useAuth } from '../../auth/AuthContext'
import { searchStudents, type Student } from '../../api/students'
import { studentNoText } from '../../lib/studentNo'
import {
  getFileUrl,
  getStudentProfile,
  listProfileForms,
  saveStudentProfile,
  uploadCertificate,
  type ProfileForm as FormMaster,
  type ProfileUniversity,
  type StudentProfile,
} from '../../api/studentProfiles'
import type { Mockup } from './types'
import './consult.css'

/* 신상기록부 (F-4.11-9) — /api/v1/admin/student-profiles
 *
 * 입학서류로 받던 내용이다. **서버에 저장할 곳이 통째로 없어** 오래 목업이었고,
 * 2026-10-13 에 생겨 붙였다.
 *
 * ★ **목록 API 가 없다.** 서버는 **학생 한 명씩**만 준다 — 「작성 현황 몇 명」을 세려면
 *   학생 수만큼 호출해야 한다. 그래서 **좌우 분할**로 만든다(ConsultLog 와 같은 모양):
 *   왼쪽에서 학생을 고르고 오른쪽에서 그 한 장을 쓴다. **전체 집계는 세지 않는다** —
 *   세는 척하면 틀린 숫자가 화면에 남는다.
 *
 * ★ **안 쓴 학생은 404 다.** 그걸 오류로 띄우면 **처음 쓰는 학생마다 빨간 줄**이 뜬다.
 *   「아직 작성 전입니다」로 받고 빈 양식을 연다.
 *
 * ★ **저장은 한 장을 통째로 보낸다.** 보내지 않은 칸은 비워진다 — 부분 갱신이면
 *   「지운 것」과 「안 보낸 것」을 구분할 수 없어 **잘못 적은 건강 메모를 지울 수 없다.**
 *
 * ★ **건강 2칸은 상위 관리자만 원본**을 본다(`masked: true`). 담임에게는 `null` 로 오는데,
 *   그걸 빈칸으로만 두면 **「아무도 안 썼다」로 읽는다** — 가려졌다고 적는다.
 *   **생활습관은 담임도 본다**(상담에 쓰는 값이라 가리면 화면이 안 돌아간다).
 *
 * ★ **합격증은 올리는 것과 붙이는 것이 따로다.** 먼저 올려 `fileId` 를 받고, 저장할 때
 *   그 id 를 싣는다. **주소는 몇 분 뒤 만료**되므로 열 때마다 새로 받는다.
 *
 * ★ **내신은 한 칸이 정본**이다(`mainSubjectAverage`) — 입학서류 실물에 「내신성적
 *   (주요교과평균)」 칸 하나뿐인 것을 확인해 그렇게 설계했다(2026-10-06 백엔드 회신).
 *   과목별로 쪼개지 않는다.
 */

/** 목표대학 한 줄의 편집 상태 */
interface UniDraft extends ProfileUniversity {
  /** 화면에서만 쓰는 키 — 서버 id 가 없는 새 줄도 지울 수 있어야 한다 */
  key: string
}

const emptyUni = (): UniDraft => ({
  key: `new-${Math.random().toString(36).slice(2, 8)}`,
  universityName: '',
  departmentName: '',
  screeningName: '',
  certificateFileId: null,
  certificateFileName: null,
  passed: null,
})

const EXPORT_COLUMNS: Column<Student>[] = [
  { key: 'studentNo', header: '학번', value: (r) => studentNoText(r.studentNo) },
  { key: 'name', header: '이름', mask: 'name', value: (r) => r.name },
  { key: 'className', header: '반', value: (r) => r.className ?? '-' },
  { key: 'grade', header: '학년', value: (r) => r.grade ?? '-' },
]

function Content() {
  const { academyId } = useAcademy()
  const { teacherOnly, readOnly } = useAuth()
  const [masked, setMasked] = useState(useMaskDefault())

  const [students, setStudents] = useState<Student[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [classFilter, setClassFilter] = useState('')
  const [keyword, setKeyword] = useState('')

  const [forms, setForms] = useState<FormMaster[]>([])
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  /** 아직 안 쓴 학생(404). **오류가 아니다** */
  const [unwritten, setUnwritten] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [healthNote, setHealthNote] = useState('')
  const [lifeNote, setLifeNote] = useState('')
  const [unis, setUnis] = useState<UniDraft[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [removing, setRemoving] = useState<UniDraft | null>(null)

  const canWrite = !readOnly

  useEffect(() => {
    let alive = true
    setListLoading(true)
    searchStudents({ academyId: academyId ?? undefined, size: 300 })
      .then((r) => {
        if (!alive) return
        setStudents(r.rows)
        setSelectedId((prev) => (prev !== '' ? prev : String(r.rows[0]?.enrollmentId ?? '')))
      })
      .catch(() => alive && setStudents([]))
      .finally(() => alive && setListLoading(false))
    return () => {
      alive = false
    }
  }, [academyId])

  /* ★ **`academyId` 가 필수다**(「지점을 지정해야 합니다」 400). 지점을 아직 못 고른
     상태에서 부르면 **화면을 열 때마다 4xx** 가 쌓인다 */
  useEffect(() => {
    if (academyId === null) {
      setForms([])
      return
    }
    let alive = true
    listProfileForms({ academyId, year: new Date().getFullYear() })
      .then((v) => alive && setForms(v))
      .catch(() => alive && setForms([]))
    return () => {
      alive = false
    }
  }, [academyId])

  const load = useCallback(async () => {
    if (selectedId === '') {
      setProfile(null)
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const p = await getStudentProfile(Number(selectedId))
      setProfile(p)
      setUnwritten(false)
      setHealthNote(p.healthNote ?? '')
      setLifeNote(p.lifeNote ?? '')
      setUnis((p.universities ?? []).map((u, i) => ({ ...u, key: String(u.id ?? `row-${i}`) })))
    } catch (e) {
      /* ★ **404 는 오류가 아니다** — 아직 안 쓴 학생이다. 빨간 줄을 띄우면 처음 쓰는
         학생마다 경고가 뜬다 */
      if (e instanceof ApiError && e.status === 404) {
        setProfile(null)
        setUnwritten(true)
        setHealthNote('')
        setLifeNote('')
        setUnis([])
      } else {
        setError(e instanceof ApiError ? e.message : '신상기록부를 불러오지 못했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    void load()
  }, [load])

  const classNames = useMemo(
    () => [...new Set(students.map((s) => s.className).filter((v): v is string => !!v))].sort(),
    [students],
  )

  const filtered = useMemo(
    () =>
      students.filter(
        (s) =>
          (classFilter === '' || s.className === classFilter) &&
          (keyword.trim() === '' || (s.name ?? '').includes(keyword.trim())),
      ),
    [students, classFilter, keyword],
  )

  const listRows: StudentRow[] = useMemo(
    () =>
      filtered.map((s) => ({
        id: String(s.enrollmentId),
        name: s.name,
        meta: `${s.className ?? '미배정'} · ${studentNoText(s.studentNo)}`,
      })),
    [filtered],
  )

  const student = students.find((s) => String(s.enrollmentId) === selectedId) ?? null
  /** 건강 항목이 서버에서 가려져 왔는가 */
  const healthMasked = profile?.masked === true

  async function save() {
    if (selectedId === '') return
    setSaving(true)
    setError(null)
    try {
      /* ★ **한 장을 통째로 보낸다.** 목표대학도 표 전체다 — 뺀 줄은 서버가 soft delete 로 남긴다 */
      const saved = await saveStudentProfile(Number(selectedId), {
        /* ★ 가려진 상태에서 저장하면 **담임이 안 보고 있는 원본을 빈 값으로 덮는다.**
           그래서 가려졌을 때는 건강 칸을 아예 안 보낸다(undefined = 안 보냄이 아니라
           서버가 비우므로, 가려진 계정은 저장 자체를 막는다) */
        healthNote: healthNote.trim() === '' ? null : healthNote.trim(),
        lifeNote: lifeNote.trim() === '' ? null : lifeNote.trim(),
        universities: unis
          .filter((u) => (u.universityName ?? '').trim() !== '')
          .map((u, i) => ({
            id: typeof u.id === 'number' ? u.id : undefined,
            sortOrder: i + 1,
            universityName: (u.universityName ?? '').trim(),
            departmentName: (u.departmentName ?? '').trim() || null,
            screeningName: (u.screeningName ?? '').trim() || null,
            certificateFileId: u.certificateFileId ?? null,
            passed: u.passed ?? null,
          })),
        formId: forms.find((f) => f.active)?.id ?? null,
      })
      setProfile(saved)
      setUnwritten(false)
      setUnis((saved.universities ?? []).map((u, i) => ({ ...u, key: String(u.id ?? `row-${i}`) })))
      setNotice(`${student?.name ?? ''} 학생의 신상기록부를 저장했습니다.`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function pickFile(row: UniDraft, file: File) {
    setUploading(row.key)
    setError(null)
    try {
      const up = await uploadCertificate(file, Number(selectedId))
      setUnis((list) =>
        list.map((u) => (u.key === row.key ? { ...u, certificateFileId: up.id, certificateFileName: up.fileName } : u)),
      )
      /* ★ 올리기만 하면 **붙지 않은 파일**이 남는다 — 저장해야 신상기록부에 붙는다 */
      setNotice('합격증을 올렸습니다. 아래 「저장」을 눌러야 기록부에 붙습니다.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '합격증을 올리지 못했습니다.')
    } finally {
      setUploading(null)
    }
  }

  async function openFile(id: number) {
    try {
      /* ★ **열 때마다 주소를 새로 받는다.** 받아 둔 주소는 몇 분 뒤 만료돼 403 이 난다 */
      const { url } = await getFileUrl(id)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '파일을 열지 못했습니다.')
    }
  }

  return (
    <div className="p-consult">
      <div className="layout">
        <StudentList
          title="재원생"
          count={`${filtered.length}명`}
          right={
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <ExcelButton filename="신상기록부_대상" columns={EXPORT_COLUMNS} rows={filtered} masked={masked} label="내려받기" />
              <MaskToggle masked={masked} onChange={setMasked} />
            </div>
          }
          filters={['전체']}
          rows={listRows}
          selected={selectedId}
          onSelect={setSelectedId}
          loading={listLoading}
          emptyText={academyId === null ? '지점을 먼저 고르세요.' : '학생이 없습니다.'}
          belowFilters={
            <>
              <select className="sel" style={{ width: 118 }} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="">반 전체</option>
                {classNames.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                className="inp"
                style={{ flex: 1, minWidth: 80 }}
                placeholder="이름"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </>
          }
        />

        <div>
          {notice && (
            <div className="note-box" role="status">
              <div>{notice}</div>
            </div>
          )}
          {error && (
            <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <div className="card-sec">
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="file-text" size={15} />
                </span>
                {student ? `${masked ? '***' : student.name} · 신상기록부` : '학생을 고르세요'}
                {unwritten && (
                  <span className="mk brandnew" style={{ marginLeft: 6 }}>
                    아직 작성 전입니다
                  </span>
                )}
              </div>
              <div className="r" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {profile?.writtenAt && (
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    최초 작성 {profile.writtenAt.slice(0, 10)}
                  </span>
                )}
                <button className="btn pri" disabled={!canWrite || saving || selectedId === ''} onClick={() => void save()}>
                  {saving ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>

            <div className="card-sec-b">
              {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</div>}

              {!loading && selectedId !== '' && (
                <>
                  {/* ★ 가려진 계정이 저장하면 **안 보고 있는 원본을 빈 값으로 덮는다** */}
                  {healthMasked && (
                    <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
                      <div>
                        건강상태는 <b>상위 관리자만 볼 수 있습니다.</b> 이 계정에서는 내용이 보이지 않아
                        <b> 저장하면 원본이 지워집니다</b> — 건강 칸은 수정하지 마세요.
                      </div>
                    </div>
                  )}

                  <div className="frow">
                    <label>건강상태</label>
                    <div>
                      <textarea
                        className="inp"
                        rows={3}
                        maxLength={2000}
                        disabled={!canWrite || healthMasked}
                        placeholder={healthMasked ? '상위 관리자만 볼 수 있습니다' : '알레르기·복용 약·주의사항 등'}
                        value={healthNote}
                        onChange={(e) => setHealthNote(e.target.value)}
                      />
                      <div className="hint">응급 상황에 바로 보는 칸입니다. 2000자까지 쓸 수 있습니다.</div>
                    </div>
                  </div>

                  <div className="frow">
                    <label>생활습관</label>
                    <div>
                      <textarea
                        className="inp"
                        rows={3}
                        maxLength={2000}
                        disabled={!canWrite}
                        placeholder="기상·수면·집중 시간대 등 상담에 쓰는 내용"
                        value={lifeNote}
                        onChange={(e) => setLifeNote(e.target.value)}
                      />
                      <div className="hint">상담에 쓰는 값이라 담임도 봅니다.</div>
                    </div>
                  </div>

                  <div className="frow">
                    <label>목표대학</label>
                    <div>
                      {unis.length === 0 && <div className="hint">아직 적은 목표대학이 없습니다.</div>}
                      {unis.map((u) => (
                        <div
                          key={u.key}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 1fr 0.9fr auto auto',
                            gap: 6,
                            alignItems: 'center',
                            padding: '6px 0',
                            borderTop: '1px solid var(--line)',
                          }}
                        >
                          <input
                            className="inp"
                            placeholder="대학"
                            disabled={!canWrite}
                            value={u.universityName ?? ''}
                            onChange={(e) =>
                              setUnis((l) => l.map((x) => (x.key === u.key ? { ...x, universityName: e.target.value } : x)))
                            }
                          />
                          <input
                            className="inp"
                            placeholder="학과"
                            disabled={!canWrite}
                            value={u.departmentName ?? ''}
                            onChange={(e) =>
                              setUnis((l) => l.map((x) => (x.key === u.key ? { ...x, departmentName: e.target.value } : x)))
                            }
                          />
                          <input
                            className="inp"
                            placeholder="전형"
                            disabled={!canWrite}
                            value={u.screeningName ?? ''}
                            onChange={(e) =>
                              setUnis((l) => l.map((x) => (x.key === u.key ? { ...x, screeningName: e.target.value } : x)))
                            }
                          />
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {u.certificateFileId ? (
                              <button
                                type="button"
                                className="btn"
                                style={{ padding: '3px 8px', fontSize: 11.5 }}
                                onClick={() => void openFile(u.certificateFileId as number)}
                                title="합격증을 엽니다"
                              >
                                <Icon name="file-text" size={12} /> 합격증
                              </button>
                            ) : (
                              <label
                                className="btn"
                                style={{ padding: '3px 8px', fontSize: 11.5, cursor: canWrite ? 'pointer' : 'default' }}
                              >
                                {uploading === u.key ? '올리는 중…' : '합격증 첨부'}
                                <input
                                  type="file"
                                  hidden
                                  disabled={!canWrite || uploading !== null}
                                  accept="image/*,.pdf"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0]
                                    if (f) void pickFile(u, f)
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                            )}
                            {/* ★ `null` 이 「아직 확인 안 함」이다 — 불합격(false)과 다르다 */}
                            <select
                              className="sel"
                              style={{ width: 92 }}
                              disabled={!canWrite}
                              value={u.passed === null || u.passed === undefined ? '' : u.passed ? 'Y' : 'N'}
                              onChange={(e) =>
                                setUnis((l) =>
                                  l.map((x) =>
                                    x.key === u.key
                                      ? { ...x, passed: e.target.value === '' ? null : e.target.value === 'Y' }
                                      : x,
                                  ),
                                )
                              }
                            >
                              <option value="">확인 전</option>
                              <option value="Y">합격</option>
                              <option value="N">불합격</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '3px 8px', fontSize: 11.5 }}
                            disabled={!canWrite}
                            onClick={() => setRemoving(u)}
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn"
                        style={{ marginTop: 8 }}
                        disabled={!canWrite}
                        onClick={() => setUnis((l) => [...l, emptyUni()])}
                      >
                        <Icon name="plus" size={13} /> 목표대학 추가
                      </button>
                      <div className="hint">
                        합격증을 올린 뒤 <b>저장을 눌러야</b> 기록부에 붙습니다. 수시 6 · 정시 3까지 적습니다.
                      </div>
                    </div>
                  </div>

                  {teacherOnly && (
                    <div className="note-box">
                      <div>담임 계정에서는 건강상태가 가려집니다. 나머지는 그대로 쓰고 저장할 수 있습니다.</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {removing && (
        <Modal
          title="목표대학을 지웁니다"
          confirmLabel="삭제"
          danger
          onConfirm={() => {
            setUnis((l) => l.filter((x) => x.key !== removing.key))
            setRemoving(null)
          }}
          onClose={() => setRemoving(null)}
        >
          <div className="note-box">
            <div>
              {removing.universityName || '(대학 미입력)'} {removing.departmentName ?? ''}
            </div>
          </div>
          <div className="hint">저장을 눌러야 서버에서도 지워집니다.</div>
        </Modal>
      )}
    </div>
  )
}

export const profileFormMockup: Mockup = { Content }
