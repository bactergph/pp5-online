'use client'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { fetchStudentInit, fetchClassroomsForYear, fetchStudents, saveStudent, deleteStudent } from './actions'
import { formatThaiDate, calculateAge } from '@/lib/thaiDate'
import LoadingButton from '@/components/LoadingButton'
import ThaiDatePicker from '@/components/ThaiDatePicker'
import AppAlertModal from '@/components/AppAlertModal'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = { id: string; level: string; room: number }
type Student = {
  id: string; student_number: number; student_code: string | null; national_id: string | null
  prefix: string | null; first_name: string; last_name: string; gender: string
  birth_date: string | null; address: string | null; google_maps_url: string | null; status: string
}

const PREFIXES = ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว']
const STATUSES = ['เรียน', 'ย้ายเข้า', 'ย้ายออก', 'ไม่เลื่อนชั้น']
const blank = {
  id: '', student_number: '', student_code: '', national_id: '', prefix: 'เด็กชาย',
  first_name: '', last_name: '', gender: 'M', birth_date: '', address: '', google_maps_url: '', status: 'เรียน',
}

export default function StudentsPage() {
  const [canManage, setCanManage] = useState(false)
  const [years, setYears] = useState<Year[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<typeof blank>(blank)
  const [search, setSearch] = useState('')
  const [alertModal, setAlertModal] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)
  const skipYearFetch = useRef(true)
  const skipClassFetch = useRef(true)

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (!selectedYear) return
    if (skipYearFetch.current) {
      skipYearFetch.current = false
      return
    }
    void loadClassrooms(selectedYear)
  }, [selectedYear])
  useEffect(() => {
    if (!selectedClass) return
    if (skipClassFetch.current) {
      skipClassFetch.current = false
      return
    }
    void loadStudents(selectedClass)
  }, [selectedClass])

  async function init() {
    const d = await fetchStudentInit()
    setCanManage(d.canManage)
    setYears(d.years as Year[])
    const cs = (d.classrooms || []) as Classroom[]
    setClassrooms(cs)
    setStudents((d.students || []) as Student[])
    skipYearFetch.current = true
    skipClassFetch.current = true
    setSelectedYear(d.activeYearId || '')
    setSelectedClass(cs[0]?.id || '')
    setLoading(false)
  }
  async function loadClassrooms(yearId: string) {
    const cs = await fetchClassroomsForYear(yearId) as Classroom[]
    const firstClassId = cs[0]?.id || ''
    skipClassFetch.current = true
    setClassrooms(cs)
    setSelectedClass(firstClassId)
    if (!firstClassId) setStudents([])
    else setStudents(await fetchStudents(firstClassId) as Student[])
  }
  async function loadStudents(classId: string) {
    setStudents(await fetchStudents(classId) as Student[])
  }
  function notify(type: 'success' | 'error', text: string) {
    setAlertModal({
      type,
      title: type === 'success' ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ',
      message: text,
    })
  }

  function openAdd() {
    const nextNo = students.length ? Math.max(...students.map(s => s.student_number)) + 1 : 1
    setEditing({ ...blank, student_number: String(nextNo) }); setShowForm(true)
  }
  function openEdit(s: Student) {
    setEditing({
      id: s.id, student_number: String(s.student_number), student_code: s.student_code || '',
      national_id: s.national_id || '', prefix: s.prefix || 'เด็กชาย', first_name: s.first_name,
      last_name: s.last_name, gender: s.gender, birth_date: s.birth_date || '',
      address: s.address || '', google_maps_url: s.google_maps_url || '', status: s.status,
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setAlertModal(null)
    const fd = new FormData(e.currentTarget)
    const payload = {
      classroom_id: selectedClass,
      student_number: Number(fd.get('student_number') || 0),
      student_code: (fd.get('student_code') as string).trim() || null,
      national_id: (fd.get('national_id') as string).trim() || null,
      prefix: fd.get('prefix') as string,
      first_name: (fd.get('first_name') as string).trim(),
      last_name: (fd.get('last_name') as string).trim(),
      gender: fd.get('gender') as string,
      birth_date: (fd.get('birth_date') as string) || null,
      address: (fd.get('address') as string).trim() || null,
      google_maps_url: (fd.get('google_maps_url') as string).trim() || null,
      status: fd.get('status') as string,
    }
    const { error } = await saveStudent(editing.id || null, payload)
    setSaving(false)
    if (error) { notify('error', error); return }
    notify('success', editing.id ? 'แก้ไขข้อมูลนักเรียนเรียบร้อย' : 'เพิ่มนักเรียนเรียบร้อย')
    setShowForm(false); loadStudents(selectedClass)
  }

  async function handleDelete(s: Student) {
    if (!confirm(`ลบนักเรียน "${s.first_name} ${s.last_name}" ?`)) return
    const { error } = await deleteStudent(s.id)
    if (error) { notify('error', error); return }
    loadStudents(selectedClass)
  }

  const filtered = students.filter(s => !search ||
    `${s.first_name} ${s.last_name}`.includes(search) ||
    (s.student_code || '').includes(search) || (s.national_id || '').includes(search))
  const boys = students.filter(s => s.gender === 'M').length
  const girls = students.filter(s => s.gender === 'F').length

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
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">Student registry</span>
          <h1 className="page-title">นักเรียน</h1>
          <p className="page-subtitle">ทะเบียนนักเรียน — ชาย {boys} · หญิง {girls} · รวม {students.length} คน</p>
        </div>
        {canManage && selectedClass && (
          <div className="page-actions">
            <Link href="/settings/import-dmc" className="btn btn-secondary">นำเข้านักเรียน DMC</Link>
            <button onClick={openAdd} className="btn btn-primary">+ เพิ่มนักเรียน</button>
          </div>
        )}
      </div>

      {years.length === 0 ? (
        <div className="alert alert-error">ยังไม่มีปีการศึกษา — ไปเพิ่มที่ ตั้งค่าระบบ → ปีการศึกษา ก่อน</div>
      ) : (
        <>
          <div className="filter-bar control-card">
            <div className="field-inline">
              <label className="form-label" style={{ margin: 0 }}>ปี:</label>
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
            <input value={search} onChange={e => setSearch(e.target.value)} className="form-input" placeholder="ค้นหาชื่อ / รหัส / เลขบัตร..." style={{ maxWidth: 280, marginLeft: 'auto' }} />
          </div>

          {classrooms.length === 0 ? (
            <div className="alert alert-error">ยังไม่มีชั้นเรียนในปีนี้ — ไปเพิ่มที่เมนู &quot;ชั้นเรียน&quot; ก่อน</div>
          ) : (
            <>
              {showForm && (
                <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
                  <div className="modal-card" style={{ maxWidth: 820, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
                      <div>
                        <div className="section-title" style={{ marginBottom: 4 }}>{editing.id ? 'แก้ไขข้อมูลนักเรียน' : 'เพิ่มนักเรียน'}</div>
                        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กรอกข้อมูลนักเรียนในห้องที่เลือก แล้วกดบันทึกเพื่ออัปเดตรายชื่อ</p>
                      </div>
                      <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                        ปิด
                      </button>
                    </div>
                    <form onSubmit={handleSave}>
                      <div className="form-grid">
                        <div><label className="form-label">เลขที่ *</label><input name="student_number" type="number" min={1} defaultValue={editing.student_number} className="form-input" required /></div>
                        <div><label className="form-label">เลขประจำตัวนักเรียน</label><input name="student_code" defaultValue={editing.student_code} className="form-input" /></div>
                        <div><label className="form-label">เลขบัตรประชาชน</label><input name="national_id" defaultValue={editing.national_id} className="form-input" maxLength={13} /></div>
                        <div><label className="form-label">คำนำหน้า *</label><select name="prefix" defaultValue={editing.prefix} className="form-input">{PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                        <div><label className="form-label">ชื่อ *</label><input name="first_name" defaultValue={editing.first_name} className="form-input" required /></div>
                        <div><label className="form-label">นามสกุล *</label><input name="last_name" defaultValue={editing.last_name} className="form-input" required /></div>
                        <div><label className="form-label">เพศ *</label><select name="gender" defaultValue={editing.gender} className="form-input"><option value="M">ชาย</option><option value="F">หญิง</option></select></div>
                        <div style={{ gridColumn: 'span 2' }}><label className="form-label">วันเกิด</label><ThaiDatePicker name="birth_date" defaultValue={editing.birth_date} yearsBack={20} yearsForward={0} /></div>
                        <div><label className="form-label">สถานะ *</label><select name="status" defaultValue={editing.status} className="form-input">{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                        <div style={{ gridColumn: 'span 2' }}><label className="form-label">ที่อยู่</label><input name="address" defaultValue={editing.address} className="form-input" /></div>
                        <div style={{ gridColumn: 'span 2' }}><label className="form-label">พิกัดบ้าน (Google Maps URL)</label><input name="google_maps_url" defaultValue={editing.google_maps_url} className="form-input" placeholder="https://maps.app.goo.gl/..." /></div>
                      </div>
                      <div className="form-actions" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                        <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-secondary">ยกเลิก</button>
                        <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <div className="table-card data-card">
                <table className="thai-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>เลขที่</th>
                      <th>รหัส</th>
                      <th>ชื่อ - นามสกุล</th>
                      <th style={{ width: 60, textAlign: 'center' }}>เพศ</th>
                      <th>วันเกิด</th>
                      <th>อายุ</th>
                      <th style={{ width: 90 }}>สถานะ</th>
                      {canManage && <th style={{ width: 100 }}>จัดการ</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={canManage ? 8 : 7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                        {students.length === 0 ? 'ยังไม่มีนักเรียนในห้องนี้ — เพิ่มเอง หรือ "นำเข้านักเรียน DMC"' : 'ไม่พบนักเรียนที่ค้นหา'}
                      </td></tr>
                    ) : filtered.map(s => (
                      <tr key={s.id}>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{s.student_number}</td>
                        <td style={{ color: 'var(--text-3)' }}>{s.student_code || '-'}</td>
                        <td>{s.prefix}{s.first_name} {s.last_name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: s.gender === 'M' ? '#6B4F32' : '#DB2777' }}>{s.gender === 'M' ? 'ช' : 'ญ'}</span>
                        </td>
                        <td style={{ fontSize: 13 }}>{formatThaiDate(s.birth_date)}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-3)' }}>{s.birth_date ? calculateAge(s.birth_date).display : '-'}</td>
                        <td><span style={{ fontSize: 12 }}>{s.status}</span></td>
                        {canManage && (
                          <td>
                            <button onClick={() => openEdit(s)} style={{ color: 'var(--primary)', fontSize: 13, marginRight: 12, background: 'none', border: 'none', cursor: 'pointer' }}>แก้ไข</button>
                            <button onClick={() => handleDelete(s)} style={{ color: '#DC2626', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>ลบ</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      </div>
    </>
  )
}
