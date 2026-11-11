'use client'
import { useCallback, useState, useEffect, useRef } from 'react'
import LoadingButton from '@/components/LoadingButton'
import AppAlertModal from '@/components/AppAlertModal'
import {
  fetchClassSubjectInit, fetchClassroomsLite, fetchClassSubjects,
  setClassSubjectTeacher,
} from '../actions'
import { isSecondaryClassLevel } from '@/lib/class-level'
import { readContentUnitRows, readContentUnits, readScoreTerms, weeklyOfferingPeriods, type ContentUnit } from '@/lib/class-subject-offer'

type Year = { id: string; year_be: number; is_active: boolean }
type Teacher = { id: string; prefix: string; full_name: string }
type Subject = {
  id: string; code: string; name: string; short_name?: string | null
  subject_group: string; type: string; hours_per_year: number; credits: number; max_score: number
}
type Classroom = { id: string; level: string; room: number }
type CS = { id: string; subject_id: string; teacher_id: string | null; co_teacher_ids?: string[] | null; content_units?: unknown; score_terms?: unknown; order_number: number; room_name?: string | null; semester?: number }
type UnitForm = { name: string; periods: string; useMain: boolean; teacherName: string }
type UnitDraft = { enabled: boolean; rows: [UnitForm, UnitForm] }
const blankUnit = (): UnitForm => ({ name: '', periods: '', useMain: true, teacherName: '' })

export default function ClassSubjectsPage() {
  const [canManage, setCanManage] = useState(false)
  const [years, setYears] = useState<Year[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)
  const [showHistory, setShowHistory] = useState(false)
  const [items, setItems] = useState<CS[]>([])
  const [loadedContext, setLoadedContext] = useState('')
  const [loading, setLoading] = useState(true)
  const [roomDrafts,setRoomDrafts] = useState<Record<string,string>>({})
  const [teacherDrafts, setTeacherDrafts] = useState<Record<string, string>>({})
  const [unitDrafts, setUnitDrafts] = useState<Record<string, UnitDraft>>({})
  const [termDrafts, setTermDrafts] = useState<Record<string, Array<1 | 2>>>({})
  const [openTeacherPicker, setOpenTeacherPicker] = useState<string | null>(null)
  const [alertModal, setAlertModal] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const initialClassroom = useRef('')
  const itemRequest = useRef(0)

  const semesterFor = useCallback((classId: string): 0 | 1 | 2 => {
    const room = classrooms.find(item => item.id === classId)
    return room && isSecondaryClassLevel(room.level) ? term : 0
  }, [classrooms, term])
  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]))
  const itemsReady = loadedContext === `${selectedClass}:${semesterFor(selectedClass)}:${showHistory}`

  const init = useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const d = await fetchClassSubjectInit()
    setCanManage(d.canManage)
    setYears(d.years as Year[]); setTeachers(d.teachers as Teacher[]); setSubjects(d.subjects as Subject[])
    initialClassroom.current = params.get('classroom') || ''
    if (params.get('term') === '1' || params.get('term') === '2') setTerm(Number(params.get('term')) as 1 | 2)
    const active = (d.years as Year[]).find(y => y.id === params.get('year')) || (d.years as Year[]).find(y => y.is_active) || (d.years as Year[])[0]
    if (active) setSelectedYear(active.id)
    setLoading(false)
  }, [])
  const loadClassrooms = useCallback(async (yearId: string, active: () => boolean) => {
    const cs = await fetchClassroomsLite(yearId) as Classroom[]
    if (!active()) return
    setClassrooms(cs)
    setSelectedClass(cs.find(room => room.id === initialClassroom.current)?.id || cs[0]?.id || '')
    initialClassroom.current = ''
  }, [])
  const notify = useCallback((type: 'success' | 'error', text: string) => {
    setAlertModal({
      type,
      title: type === 'success' ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ',
      message: text,
    })
  }, [])
  const loadItems = useCallback(async (classId: string, semester: 0 | 1 | 2) => {
    const request = ++itemRequest.current
    setTeacherDrafts({}); setRoomDrafts({}); setUnitDrafts({});  setTermDrafts({})
    setOpenTeacherPicker(null)
    try {
      const rows = await fetchClassSubjects(classId, semester, showHistory) as CS[]
      if (request === itemRequest.current) {
        setItems(rows)
        setLoadedContext(`${classId}:${semester}:${showHistory}`)
      }
    } catch (error) {
      if (request === itemRequest.current) {
        setItems([])
        setLoadedContext(`${classId}:${semester}:${showHistory}`)
        notify('error', error instanceof Error ? error.message : 'โหลดรายวิชาไม่สำเร็จ')
      }
    }
  }, [showHistory, notify])
  useEffect(() => {
    void Promise.resolve().then(init).catch(error => {
      setLoading(false)
      notify('error', error instanceof Error ? error.message : 'โหลดข้อมูลรายวิชาไม่สำเร็จ')
    })
  }, [init, notify])
  useEffect(() => {
    let active = true
    if (selectedYear) void Promise.resolve().then(() => active ? loadClassrooms(selectedYear, () => active) : undefined).catch(error => {
      if (active) notify('error', error instanceof Error ? error.message : 'โหลดห้องเรียนไม่สำเร็จ')
    })
    return () => { active = false }
  }, [selectedYear, loadClassrooms, notify])
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active && selectedClass) return loadItems(selectedClass, semesterFor(selectedClass))
    })
    return () => {
      active = false
      itemRequest.current++
    }
  }, [selectedClass, semesterFor, loadItems])

  function teacherName(id: string | null) {
    const t = teachers.find(t => t.id === id)
    return t ? `${t.prefix} ${t.full_name}` : ''
  }
  function teacherIdByName(name: string) {
    const normalized = name.trim().toLowerCase()
    if (!normalized) return ''
    return teachers.find(t => `${t.prefix} ${t.full_name}`.trim().toLowerCase() === normalized)?.id || null
  }
  function teacherChoices(input: string, currentName: string) {
    const normalized = input.trim().toLowerCase()
    const shouldFilter = normalized && normalized !== currentName.trim().toLowerCase()
    if (!shouldFilter) return teachers
    return teachers.filter(t => `${t.prefix} ${t.full_name}`.toLowerCase().includes(normalized))
  }
  const annualRoom = !classrooms.some(item => item.id === selectedClass && isSecondaryClassLevel(item.level))
  function termsOf(item: CS) {
    return termDrafts[item.id] || readScoreTerms(item.score_terms)
  }
  function unitsOf(item: CS): UnitDraft {
    if (unitDrafts[item.id]) return unitDrafts[item.id]
    const saved = readContentUnitRows(item.content_units)
    const form = (unit?: ContentUnit): UnitForm => unit ? { name: unit.name, periods: unit.periods ? String(unit.periods) : '', useMain: unit.useMainTeacher, teacherName: unit.useMainTeacher ? '' : teacherName(unit.teacherId) } : blankUnit()
    return saved.length ? { enabled: true, rows: [form(saved[0]), form(saved[1])] } : { enabled: false, rows: [blankUnit(), blankUnit()] }
  }
  function unitPayload(item: CS) {
    const draft = unitsOf(item)
    if (!draft.enabled) return []
    return draft.rows.flatMap(row => {
      if (!row.name.trim() && !row.periods.trim()) return []
      const teacherId = row.useMain ? null : teacherIdByName(row.teacherName)
      return [{ name: row.name.trim(), periods: Number(row.periods), teacherId, useMainTeacher: row.useMain, unresolved: !row.useMain && teacherId === null }]
    })
  }
  function offeringChanged(item: CS) {
    const roomChanged = (roomDrafts[item.id] ?? item.room_name ?? '').trim() !== (item.room_name || '')
    const input = item.id in teacherDrafts ? teacherDrafts[item.id] : teacherName(item.teacher_id)
    const desired = teacherIdByName(input)
    const teacherChanged = desired === null || desired !== (item.teacher_id || '')
    const saved = readContentUnitRows(item.content_units).map(unit => `${unit.name}|${unit.periods}|${unit.useMainTeacher}|${unit.teacherId || ''}`)
    const next = unitPayload(item).map(unit => `${unit.name}|${Number.isFinite(unit.periods) ? unit.periods : ''}|${unit.useMainTeacher}|${unit.teacherId || ''}`)
    const termsChanged = annualRoom && termsOf(item).join() !== readScoreTerms(item.score_terms).join()
    return roomChanged || teacherChanged || saved.join(';') !== next.join(';') || termsChanged
  }
  const pendingTeacherChanges = items.reduce((count, item) => count + (offeringChanged(item) ? 1 : 0), 0)
  async function handleSaveTeachers() {
    if (!itemsReady || savingEdit) return
    const changes: Array<{ item: CS; teacherId?: string; error?: string }> = []
    for (const item of items) {
      if (!offeringChanged(item)) continue
      const input = teacherDrafts[item.id] ?? teacherName(item.teacher_id)
      const desired = teacherIdByName(input)
      if (desired === null) changes.push({ item, error: input.trim() })
      else changes.push({ item, teacherId: desired })
    }

    const invalid = changes.find(change => change.error)
    if (invalid?.error) {
      notify('error', `ไม่พบชื่อครู "${invalid.error}" กรุณาเลือกจากรายการ`)
      return
    }
    if (changes.length === 0) {
      notify('error', 'ยังไม่มีรายการที่เปลี่ยนแปลง')
      return
    }

    setSavingEdit(true)
    setAlertModal(null)
    for (const change of changes) {
      const units = unitPayload(change.item)
      if (units.some(unit => unit.unresolved)) {
        setSavingEdit(false)
        notify('error', `ไม่พบชื่อครูของวิชาย่อย "${units.find(unit => unit.unresolved)?.name || ''}"`)
        return
      }
      const room = classrooms.find(room => room.id === selectedClass)
      const subject = subjectMap[change.item.subject_id]
      const { error } = await setClassSubjectTeacher(change.item.id, change.teacherId || null, (roomDrafts[change.item.id] ?? change.item.room_name ?? '').trim(), {
        contentUnits: units.map(({ name, periods, teacherId, useMainTeacher }) => ({ name, periods, teacherId, useMainTeacher })),
        weeklyPeriods: weeklyOfferingPeriods(room?.level || '', subject?.credits, subject?.hours_per_year),
        ...(annualRoom ? { scoreTerms: termsOf(change.item) } : {}),
      })
      if (error) {
        setSavingEdit(false)
        notify('error', error)
        loadItems(selectedClass, semesterFor(selectedClass))
        return
      }
    }
    setSavingEdit(false)
    setTeacherDrafts({}); setRoomDrafts({}); setUnitDrafts({});  setTermDrafts({})
    setOpenTeacherPicker(null)
    loadItems(selectedClass, semesterFor(selectedClass))
    notify('success', `บันทึกรายวิชา ${changes.length} รายการเรียบร้อย`)
  }
  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  return (
    <>
      <AppAlertModal
        open={alertModal !== null}
        type={alertModal?.type || 'success'}
        title={alertModal?.title || ''}
        message={alertModal?.message}
        onClose={() => setAlertModal(null)}
      />
    <div className="page-stack">
      {years.length === 0 ? (
        <div className="alert alert-error">ยังไม่มีปีการศึกษา — ไปเพิ่มที่ ตั้งค่าระบบ → ปีการศึกษา ก่อน</div>
      ) : (
        <>
          <div className="filter-bar control-card">
            <div className="field-inline">
              <label className="form-label" style={{ margin: 0 }}>ปีการศึกษา:</label>
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="form-input" style={{ width: 'auto' }}>
                {years.map(y => <option key={y.id} value={y.id}>{y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
              </select>
            </div>
            <div className="field-inline">
              <label className="form-label" style={{ margin: 0 }}>ชั้น:</label>
              <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="form-input" style={{ width: 'auto' }} disabled={classrooms.length === 0}>
                {classrooms.length === 0 ? <option>— ไม่มีชั้นเรียน —</option> : classrooms.map(c => <option key={c.id} value={c.id}>{c.level}/{c.room}</option>)}
              </select>
            </div>
            <div className="field-inline">
              {annualRoom ? <span className="badge badge-gray">รายวิชาทั้งปีการศึกษา</span> : <>
                <label className="form-label" htmlFor="class-offering-term" style={{ margin: 0 }}>ภาคเรียน</label>
                <select id="class-offering-term" value={term} onChange={e => setTerm(Number(e.target.value) as 1 | 2)} className="form-input" style={{ width: 'auto' }}>
                  <option value={1}>ภาคเรียนที่ 1</option>
                  <option value={2}>ภาคเรียนที่ 2</option>
                </select>
              </>}
            </div>
            <label><input type="checkbox" checked={showHistory} onChange={event => setShowHistory(event.target.checked)} /> แสดงรายการเดิม</label>
          </div>


          {classrooms.length === 0 ? (
            <div className="alert alert-error">ยังไม่มีชั้นเรียนในปีนี้ — ไปเพิ่มที่เมนู &quot;ชั้นเรียน&quot; ก่อน</div>
          ) : !itemsReady ? (
            <p role="status">กำลังโหลดรายวิชา…</p>
          ) : (
            <>
              <p className="class-subject-offer-note">ครูประจำวิชาเป็นชื่อหลักในตาราง หากเลือกมีวิชาย่อย โควตาคาบจะแบ่งตามชื่อและผู้สอนของแต่ละวิชาย่อย ตารางเรียนและตารางสอนจะแสดงคนที่สอนวิชาย่อยนั้น คะแนนยังใช้รหัสวิชาเดียว</p>
              <datalist id="class-subject-unit-names">{[...new Set(items.flatMap(item => readContentUnitRows(item.content_units).map(unit => unit.name)))].map(name => <option key={name} value={name} />)}</datalist>
              <div className="data-card class-subjects-table-card">
                <table className="thai-table class-subjects-table" style={{ width: '100%', whiteSpace: 'nowrap' }}>
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 96 }} />
                    <col />
                    <col style={{ width: 320 }} /><col style={{width:220}} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center' }}>#</th>
                      <th>รหัสวิชา</th>
                      <th>ชื่อวิชา / ประเภท</th>
                      <th>ครูผู้สอน</th><th>สถานที่เรียน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                        ยังไม่มีวิชาในห้องนี้
                      </td></tr>
                    ) : items.map((cs, i) => {
                      const s = subjectMap[cs.subject_id]
                      return (
                        <tr key={cs.id}>
                          <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{s?.code || '?'}</td>
                          <td className="class-subject-name-cell">
                            <span>{s?.name || '(วิชาถูกลบ)'}</span>
                            {(cs.semester ?? 0) !== semesterFor(selectedClass) && <small>รายการเดิม · {cs.semester ? `ภาคเรียนที่ ${cs.semester}` : 'ทั้งปี'}</small>}
                            {s?.type && <span className="badge badge-gray" style={{ marginLeft: 8 }}>{s.type}</span>}
                            {canManage ? (
                              <div className="class-subject-units">
                                <div className="class-subject-unit-switch" role="group" aria-label={`วิชาย่อย ${s?.name || ''}`}>
                                  <button type="button" aria-pressed={!unitsOf(cs).enabled} disabled={savingEdit} onClick={() => setUnitDrafts(current => ({ ...current, [cs.id]: { ...unitsOf(cs), enabled: false } }))}>ไม่มี</button>
                                  <button type="button" aria-pressed={unitsOf(cs).enabled} disabled={savingEdit} onClick={() => setUnitDrafts(current => ({ ...current, [cs.id]: { ...unitsOf(cs), enabled: true } }))}>มีวิชาย่อย</button>
                                  <span>{weeklyOfferingPeriods(classrooms.find(room => room.id === selectedClass)?.level || '', s?.credits, s?.hours_per_year) || '—'} คาบ/สัปดาห์</span>
                                </div>
                                {unitsOf(cs).enabled && (
                                  <div className="class-subject-unit-table">
                                    {unitsOf(cs).rows.map((row, index) => (
                                      <div className="class-subject-unit-row" key={index}>
                                        <input className="form-input" list="class-subject-unit-names" maxLength={80} disabled={savingEdit} aria-label={`ชื่อวิชาย่อย ${index + 1} ${s?.name || ''}`} placeholder={`วิชาย่อย ${index + 1}`} value={row.name} onChange={event => setUnitDrafts(current => ({ ...current, [cs.id]: { ...unitsOf(cs), rows: unitsOf(cs).rows.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) as [UnitForm, UnitForm] } }))} />
                                        <input className="form-input" inputMode="numeric" disabled={savingEdit} aria-label={`จำนวนคาบวิชาย่อย ${index + 1} ${s?.name || ''}`} placeholder="คาบ" value={row.periods} onChange={event => setUnitDrafts(current => ({ ...current, [cs.id]: { ...unitsOf(cs), rows: unitsOf(cs).rows.map((item, itemIndex) => itemIndex === index ? { ...item, periods: event.target.value.replace(/\D/g, '').slice(0, 2) } : item) as [UnitForm, UnitForm] } }))} />
                                        <label><input type="checkbox" checked={row.useMain} disabled={savingEdit} onChange={event => setUnitDrafts(current => ({ ...current, [cs.id]: { ...unitsOf(cs), rows: unitsOf(cs).rows.map((item, itemIndex) => itemIndex === index ? { ...item, useMain: event.target.checked } : item) as [UnitForm, UnitForm] } }))} /> ใช้ครูประจำวิชา</label>
                                        {!row.useMain && (
                                          <input className="form-input" list={`class-subject-teachers-${cs.id}`} disabled={savingEdit} aria-label={`ผู้สอนวิชาย่อย ${index + 1} ${s?.name || ''}`} placeholder="เลือกผู้สอน" value={row.teacherName} onChange={event => setUnitDrafts(current => ({ ...current, [cs.id]: { ...unitsOf(cs), rows: unitsOf(cs).rows.map((item, itemIndex) => itemIndex === index ? { ...item, teacherName: event.target.value } : item) as [UnitForm, UnitForm] } }))} />
                                        )}
                                      </div>
                                    ))}
                                    <datalist id={`class-subject-teachers-${cs.id}`}>{teachers.map(teacher => <option key={teacher.id} value={`${teacher.prefix} ${teacher.full_name}`} />)}</datalist>
                                  </div>
                                )}
                                {annualRoom && (
                                  <div className="class-subject-terms">
                                    {([1, 2] as const).map(value => (
                                      <label key={value}><input type="checkbox" checked={termsOf(cs).includes(value)} onChange={event => { const next = (event.target.checked ? [...new Set([...termsOf(cs), value])] : termsOf(cs).filter(term => term !== value)).sort() as Array<1 | 2>; if (!next.length) return; setTermDrafts(current => ({ ...current, [cs.id]: next })) }} /> เปิดคะแนนภาค {value}</label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : <small>{readContentUnitRows(cs.content_units).map(unit => `${unit.name}${unit.periods ? ` ${unit.periods} คาบ` : ''}`).join(' · ') || readContentUnits(cs.content_units).join(' · ')}</small>}
                          </td>
                          <td className="class-subject-teacher-cell">
                            {canManage ? (
                              (() => {
                                const currentName = teacherName(cs.teacher_id)
                                const inputValue = cs.id in teacherDrafts ? teacherDrafts[cs.id] : currentName
                                const choices = teacherChoices(inputValue, currentName)
                                const changed = (teacherIdByName(inputValue) || '') !== (cs.teacher_id || '')
                                return (
                                  <div className="class-subject-teacher-picker">
                                    <input
                                      value={inputValue}
                                      onChange={e => {
                                        setTeacherDrafts(prev => ({ ...prev, [cs.id]: e.target.value }))
                                        setOpenTeacherPicker(cs.id)
                                      }}
                                      onFocus={() => setOpenTeacherPicker(cs.id)}
                                      onBlur={() => {
                                        window.setTimeout(() => setOpenTeacherPicker(current => current === cs.id ? null : current), 120)
                                      }}
                                      className="form-input"
                                      style={{ padding: '7px 9px', fontSize: 13 }}
                                      placeholder="ครูประจำวิชา"
                                    />
                                    {changed && <span className="badge badge-warning" style={{ marginTop: 6 }}>รอบันทึก</span>}
                                    {openTeacherPicker === cs.id && (
                                      <div className="teacher-picker-sheet class-subject-teacher-sheet">
                                        {cs.teacher_id && (
                                          <button
                                            type="button"
                                            className="teacher-picker-row teacher-picker-clear"
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={() => {
                                              setTeacherDrafts(prev => ({ ...prev, [cs.id]: '' }))
                                              setOpenTeacherPicker(null)
                                            }}
                                          >
                                            <span className="teacher-picker-avatar">-</span>
                                            <span>ล้างครูผู้สอน</span>
                                          </button>
                                        )}
                                        {choices.length === 0 ? (
                                          <div className="teacher-picker-empty">ไม่พบรายชื่อครู</div>
                                        ) : choices.map(t => {
                                          const name = `${t.prefix} ${t.full_name}`
                                          return (
                                            <button
                                              key={t.id}
                                              type="button"
                                              className="teacher-picker-row"
                                              onMouseDown={e => e.preventDefault()}
                                              onClick={() => {
                                                setTeacherDrafts(prev => ({ ...prev, [cs.id]: name }))
                                                setOpenTeacherPicker(null)
                                              }}
                                            >
                                              <span className="teacher-picker-avatar">{t.full_name.charAt(0)}</span>
                                              <span className="teacher-picker-name">{name}</span>
                                              {t.id === cs.teacher_id && <span className="teacher-picker-check">✓</span>}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()
                            ) : (
                              teacherName(cs.teacher_id) || '— ยังไม่กำหนด —'
                            )}
                          </td>
                          <td>{canManage?<input aria-label={`สถานที่เรียน ${s?.name || ""}`} className="form-input" maxLength={120} disabled={savingEdit} value={roomDrafts[cs.id] ?? cs.room_name ?? ""} placeholder="เช่น ห้องวิทยาศาสตร์" onChange={e=>setRoomDrafts(current=>({...current,[cs.id]:e.target.value}))}/>:cs.room_name || "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {canManage && items.length > 0 && (
                <div className="teacher-assignment-actions action-bar" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    {pendingTeacherChanges > 0 ? `มี ${pendingTeacherChanges} รายการรอบันทึก` : 'ยังไม่มีการเปลี่ยนแปลง'}
                  </div>
                  <LoadingButton loading={savingEdit} onClick={handleSaveTeachers} disabled={pendingTeacherChanges === 0}>
                    บันทึกรายวิชา
                  </LoadingButton>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
    </>
  )
}
