'use client'
import { useState, useEffect } from 'react'
import LoadingButton from '@/components/LoadingButton'
import AppAlertModal from '@/components/AppAlertModal'
import {
  fetchClassSubjectInit, fetchClassroomsLite, fetchClassSubjects,
  setClassSubjectTeacher,
} from '../actions'

type Year = { id: string; year_be: number; is_active: boolean }
type Teacher = { id: string; prefix: string; full_name: string }
type Subject = {
  id: string; code: string; name: string; short_name?: string | null
  subject_group: string; type: string; hours_per_year: number; credits: number; max_score: number
}
type Classroom = { id: string; level: string; room: number }
type CS = { id: string; subject_id: string; teacher_id: string | null; order_number: number }

export default function ClassSubjectsPage() {
  const [canManage, setCanManage] = useState(false)
  const [years, setYears] = useState<Year[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [items, setItems] = useState<CS[]>([])
  const [loading, setLoading] = useState(true)
  const [teacherDrafts, setTeacherDrafts] = useState<Record<string, string>>({})
  const [openTeacherPicker, setOpenTeacherPicker] = useState<string | null>(null)
  const [alertModal, setAlertModal] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]))

  useEffect(() => { init() }, [])
  useEffect(() => { if (selectedYear) loadClassrooms(selectedYear) }, [selectedYear])
  useEffect(() => {
    if (selectedClass) {
      loadItems(selectedClass)
      return
    }
    Promise.resolve().then(() => {
      setItems([])
      setTeacherDrafts({})
      setOpenTeacherPicker(null)
    })
  }, [selectedClass])

  async function init() {
    const d = await fetchClassSubjectInit()
    setCanManage(d.canManage)
    setYears(d.years as Year[]); setTeachers(d.teachers as Teacher[]); setSubjects(d.subjects as Subject[])
    const active = (d.years as Year[]).find(y => y.is_active) || (d.years as Year[])[0]
    if (active) setSelectedYear(active.id)
    setLoading(false)
  }
  async function loadClassrooms(yearId: string) {
    const cs = await fetchClassroomsLite(yearId) as Classroom[]
    setClassrooms(cs)
    setSelectedClass(cs[0]?.id || '')
  }
  async function loadItems(classId: string) {
    setTeacherDrafts({})
    setOpenTeacherPicker(null)
    setItems(await fetchClassSubjects(classId) as CS[])
  }

  function notify(type: 'success' | 'error', text: string) {
    setAlertModal({
      type,
      title: type === 'success' ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ',
      message: text,
    })
  }

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
  const pendingTeacherChanges = items.reduce((count, item) => {
    if (!(item.id in teacherDrafts)) return count
    const desired = teacherIdByName(teacherDrafts[item.id])
    if (desired === null) return count + 1
    return desired !== (item.teacher_id || '') ? count + 1 : count
  }, 0)
  async function handleSaveTeachers() {
    const changes = items.map(item => {
      if (!(item.id in teacherDrafts)) return null
      const input = teacherDrafts[item.id]
      const desired = teacherIdByName(input)
      if (desired === null) return { item, error: input.trim() }
      if (desired === (item.teacher_id || '')) return null
      return { item, teacherId: desired }
    }).filter(Boolean) as Array<{ item: CS; teacherId?: string; error?: string }>

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
      const { error } = await setClassSubjectTeacher(change.item.id, change.teacherId || null)
      if (error) {
        setSavingEdit(false)
        notify('error', error)
        loadItems(selectedClass)
        return
      }
    }
    setSavingEdit(false)
    setTeacherDrafts({})
    setOpenTeacherPicker(null)
    loadItems(selectedClass)
    notify('success', `บันทึกครูผู้สอน ${changes.length} รายการเรียบร้อย`)
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
          </div>


          {classrooms.length === 0 ? (
            <div className="alert alert-error">ยังไม่มีชั้นเรียนในปีนี้ — ไปเพิ่มที่เมนู &quot;ชั้นเรียน&quot; ก่อน</div>
          ) : (
            <>
              <div className="data-card class-subjects-table-card">
                <table className="thai-table class-subjects-table" style={{ width: '100%', whiteSpace: 'nowrap' }}>
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 96 }} />
                    <col />
                    <col style={{ width: 320 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center' }}>#</th>
                      <th>รหัสวิชา</th>
                      <th>ชื่อวิชา / ประเภท</th>
                      <th>ครูผู้สอน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
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
                            {s?.type && <span className="badge badge-gray" style={{ marginLeft: 8 }}>{s.type}</span>}
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
                                      placeholder="เลือกครู หรือพิมพ์ค้นหา"
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
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {canManage && items.length > 0 && (
                <div className="teacher-assignment-actions action-bar" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    {pendingTeacherChanges > 0 ? `มี ${pendingTeacherChanges} รายการรอบันทึก` : 'ยังไม่มีการเปลี่ยนครูผู้สอน'}
                  </div>
                  <LoadingButton loading={savingEdit} onClick={handleSaveTeachers} disabled={pendingTeacherChanges === 0}>
                    บันทึกครูผู้สอน
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
