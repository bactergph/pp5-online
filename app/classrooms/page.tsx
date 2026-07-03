'use client'
import { useState, useEffect } from 'react'
import LoadingButton from '@/components/LoadingButton'
import AppAlertModal from '@/components/AppAlertModal'
import { fetchClassroomInit, fetchClassrooms, saveClassroom, deleteClassroom } from './actions'

type Teacher = { id: string; prefix: string; full_name: string; is_homeroom: boolean }
type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = {
  id: string; level: string; room: number
  homeroom_teacher_id: string | null; homeroom_teacher2_id: string | null
  academic_year_id: string; student_count: number
}

const LEVELS = ['อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6']
const empty = { id: '', level: 'อ.2', room: 1, homeroom_teacher_id: '', homeroom_teacher2_id: '' }

export default function ClassroomsPage() {
  const [years, setYears] = useState<Year[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [canManage, setCanManage] = useState(false)
  const [selectedYear, setSelectedYear] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<typeof empty>(empty)
  const [alertModal, setAlertModal] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)

  function notify(type: 'success' | 'error', text: string) {
    setAlertModal({
      type,
      title: type === 'success' ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ',
      message: text,
    })
  }

  useEffect(() => { init() }, [])
  useEffect(() => { if (selectedYear) loadClassrooms(selectedYear) }, [selectedYear])

  async function init() {
    const data = await fetchClassroomInit()
    setYears(data.years as Year[])
    setTeachers(data.teachers as Teacher[])
    setCanManage(data.canManage)
    const active = (data.years as Year[]).find(y => y.is_active) || (data.years as Year[])[0]
    if (active) setSelectedYear(active.id)
    else setLoading(false)
  }

  async function loadClassrooms(yearId: string) {
    setClassrooms(await fetchClassrooms(yearId) as Classroom[])
    setLoading(false)
  }

  const teacherName = (id: string | null) => {
    if (!id) return '—'
    const t = teachers.find(t => t.id === id)
    return t ? `${t.prefix}${t.full_name}` : '—'
  }

  function openAdd() { setEditing(empty); setShowForm(true) }
  function openEdit(c: Classroom) {
    setEditing({
      id: c.id, level: c.level, room: c.room,
      homeroom_teacher_id: c.homeroom_teacher_id || '',
      homeroom_teacher2_id: c.homeroom_teacher2_id || '',
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setAlertModal(null)
    const fd = new FormData(e.currentTarget)
    const { error } = await saveClassroom(editing.id || null, {
      level: fd.get('level') as string,
      room: Number(fd.get('room') || 1),
      academic_year_id: selectedYear,
      homeroom_teacher_id: (fd.get('homeroom_teacher_id') as string) || null,
      homeroom_teacher2_id: (fd.get('homeroom_teacher2_id') as string) || null,
    })
    setSaving(false)
    if (error) { notify('error', error); return }
    notify('success', editing.id ? 'แก้ไขชั้นเรียนเรียบร้อย' : 'เพิ่มชั้นเรียนเรียบร้อย')
    setShowForm(false)
    loadClassrooms(selectedYear)
  }

  async function handleDelete(c: Classroom) {
    if (!confirm(`ลบชั้น ${c.level}/${c.room} ?`)) return
    const { error } = await deleteClassroom(c.id)
    if (error) { notify('error', error); return }
    loadClassrooms(selectedYear)
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
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">Classroom setup</span>
          <h1 className="page-title">ชั้นเรียน</h1>
          <p className="page-subtitle">จัดการห้องเรียนและครูประจำชั้น ({classrooms.length} ห้อง)</p>
        </div>
        {canManage && <button onClick={openAdd} className="btn btn-primary">+ เพิ่มชั้นเรียน</button>}
      </div>

      {years.length === 0 ? (
        <div className="alert alert-error">ยังไม่มีปีการศึกษา — ไปเพิ่มที่ ตั้งค่าระบบ → ปีการศึกษา ก่อน</div>
      ) : (
        <>
          <div className="filter-bar control-card">
            <label className="form-label" style={{ margin: 0 }}>ปีการศึกษา:</label>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="form-input" style={{ width: 'auto' }}>
              {years.map(y => <option key={y.id} value={y.id}>{y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
            </select>
          </div>

          {showForm && (
            <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
              <div className="modal-card" style={{ maxWidth: 720, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
                  <div>
                    <div className="section-title" style={{ marginBottom: 4 }}>{editing.id ? 'แก้ไขชั้นเรียน' : 'เพิ่มชั้นเรียน'}</div>
                    <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กำหนดห้องเรียนและครูประจำชั้นสำหรับปีการศึกษาที่เลือก</p>
                  </div>
                  <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                    ปิด
                  </button>
                </div>
                <form onSubmit={handleSave}>
                  <div className="form-grid">
                    <div>
                      <label className="form-label">ระดับชั้น *</label>
                      <select name="level" defaultValue={editing.level} className="form-input" required>
                        {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">ห้อง *</label>
                      <input name="room" type="number" min={1} defaultValue={editing.room} className="form-input" required />
                    </div>
                    <div>
                      <label className="form-label">ครูประจำชั้น</label>
                      <select name="homeroom_teacher_id" defaultValue={editing.homeroom_teacher_id} className="form-input">
                        <option value="">— ไม่ระบุ —</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.prefix}{t.full_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">ครูประจำชั้น (คนที่ 2)</label>
                      <select name="homeroom_teacher2_id" defaultValue={editing.homeroom_teacher2_id} className="form-input">
                        <option value="">— ไม่ระบุ —</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.prefix}{t.full_name}</option>)}
                      </select>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
                    * ครูที่ถูกกำหนดเป็นครูประจำชั้น จะได้สิทธิ์เห็นเมนู &quot;ธุรการชั้นเรียน&quot; อัตโนมัติ
                  </p>
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
                  <th style={{ width: 40 }}>#</th>
                  <th>ชั้น/ห้อง</th>
                  <th>ครูประจำชั้น</th>
                  <th>ครูประจำชั้น (คนที่ 2)</th>
                  <th style={{ width: 110, textAlign: 'right' }}>จำนวนนักเรียน</th>
                  {canManage && <th style={{ width: 100 }}>จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {classrooms.length === 0 ? (
                  <tr><td colSpan={canManage ? 6 : 5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                    ยังไม่มีชั้นเรียนในปีนี้{canManage ? ' — กด "เพิ่มชั้นเรียน" เพื่อเริ่ม' : ''}
                  </td></tr>
                ) : classrooms.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{c.level}/{c.room}</td>
                    <td>{teacherName(c.homeroom_teacher_id)}</td>
                    <td>{teacherName(c.homeroom_teacher2_id)}</td>
                    <td style={{ textAlign: 'right' }}>{c.student_count}</td>
                    {canManage && (
                      <td>
                        <button onClick={() => openEdit(c)} style={{ color: 'var(--primary)', fontSize: 13, marginRight: 12, background: 'none', border: 'none', cursor: 'pointer' }}>แก้ไข</button>
                        <button onClick={() => handleDelete(c)} style={{ color: '#DC2626', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>ลบ</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
    </>
  )
}
