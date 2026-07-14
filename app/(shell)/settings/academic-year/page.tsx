'use client'
import { useState, useEffect } from 'react'
import {
  fetchAcademicYears,
  fetchGlobalTermCalendarsForSchoolYears,
  saveAcademicYear,
  setActiveAcademicYear,
  syncAcademicYearCalendarFromGlobal,
} from '../actions'
import { toBuddhistYear, formatThaiDate } from '@/lib/thaiDate'
import LoadingButton from '@/components/LoadingButton'
import ThaiDatePicker from '@/components/ThaiDatePicker'
import { useAppAlert } from '@/lib/use-app-alert'

type AcademicYear = {
  id: string
  year_be: number
  term1_start_date: string
  term1_end_date: string
  term2_start_date: string
  term2_end_date: string
  is_active: boolean
  school_id: string
}
type GlobalTermCalendar = {
  id: string
  year_be: number
  term1_start_date: string | null
  term1_end_date: string | null
  term2_start_date: string | null
  term2_end_date: string | null
}

export default function AcademicYearPage() {
  const [years, setYears] = useState<AcademicYear[]>([])
  const [globalCalendars, setGlobalCalendars] = useState<GlobalTermCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Partial<AcademicYear> | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const [schoolId, setSchoolId] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { schoolId: sid, years: y } = await fetchAcademicYears()
    const globalData = await fetchGlobalTermCalendarsForSchoolYears()
    setSchoolId(sid)
    setYears(y)
    setGlobalCalendars(globalData as GlobalTermCalendar[])
    setLoading(false)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!schoolId) return
    setSaving(true)
    clearAlert()

    const formData = new FormData(e.currentTarget)
    const updates = {
      school_id: schoolId,
      year_be: parseInt(formData.get('year_be') as string),
      term1_start_date: formData.get('term1_start_date') as string || null,
      term1_end_date: formData.get('term1_end_date') as string || null,
      term2_start_date: formData.get('term2_start_date') as string || null,
      term2_end_date: formData.get('term2_end_date') as string || null,
      is_active: formData.get('is_active') === 'true',
    }

    const { error } = await saveAcademicYear(editItem?.id || null, updates)
    setSaving(false)
    if (error) {
      notify('error', 'เกิดข้อผิดพลาด: ' + error)
    } else {
      notify('success', 'บันทึกเรียบร้อยแล้ว')
      setShowForm(false)
      setEditItem(null)
      loadData()
    }
  }

  async function handleSetActive(id: string) {
    if (!schoolId) return
    await setActiveAcademicYear(id, schoolId)
    loadData()
  }

  async function handleSync(year: AcademicYear) {
    setSyncingId(year.id)
    const { error } = await syncAcademicYearCalendarFromGlobal(year.id)
    setSyncingId(null)
    if (error) {
      notify('error', 'ใช้จากข้อมูลกลางไม่สำเร็จ: ' + error)
      return
    }
    notify('success', `ใช้จากข้อมูลกลาง ปี ${year.year_be} เรียบร้อยแล้ว`)
    loadData()
  }

  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  return (
    <div className="page-stack">
      <div className="control-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>ปีการศึกษา</div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กำหนดเองหรือ Sync วันเปิด-ปิดภาคเรียนจากส่วนกลาง</p>
        </div>
        <button
          onClick={() => { setEditItem({}); setShowForm(true) }}
          className="btn btn-primary"
        >
          + เพิ่มปีการศึกษา
        </button>
      </div>

      <AlertModal />

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-card" style={{ maxWidth: 760, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>
                  {editItem?.id ? 'แก้ไขปีการศึกษา' : 'เพิ่มปีการศึกษาใหม่'}
                </div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กำหนดปีการศึกษาและวันเปิด-ปิดภาคเรียนของโรงเรียน</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                ปิด
              </button>
            </div>
            <form onSubmit={handleSave} className="responsive-grid-sm">
              <div>
                <label className="form-label">ปีการศึกษา (พ.ศ.) *</label>
                <input
                  name="year_be"
                  type="number"
                  defaultValue={editItem?.year_be || toBuddhistYear(new Date().getFullYear())}
                  className="form-input"
                  min="2560"
                  max="2580"
                  required
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" name="is_active" value="true" defaultChecked={editItem?.is_active} />
                  <span style={{ fontSize: 14, fontWeight: 700 }}>ใช้งานอยู่ (active)</span>
                </label>
              </div>
              <div>
                <label className="form-label">เปิดเรียนเทอม 1</label>
                <ThaiDatePicker name="term1_start_date" defaultValue={editItem?.term1_start_date || ''} />
              </div>
              <div>
                <label className="form-label">ปิดเรียนเทอม 1</label>
                <ThaiDatePicker name="term1_end_date" defaultValue={editItem?.term1_end_date || ''} />
              </div>
              <div>
                <label className="form-label">เปิดเรียนเทอม 2</label>
                <ThaiDatePicker name="term2_start_date" defaultValue={editItem?.term2_start_date || ''} />
              </div>
              <div>
                <label className="form-label">ปิดเรียนเทอม 2</label>
                <ThaiDatePicker name="term2_end_date" defaultValue={editItem?.term2_end_date || ''} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-secondary">ยกเลิก</button>
                <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {globalCalendars.length > 0 && (
        <section className="control-card">
          <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}>ข้อมูลกลางที่พร้อมใช้</h3>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '2px 0 12px' }}>
            กด「ใช้จากข้อมูลกลาง」ในแถวปีที่ตรงกัน เพื่อดึงวันเปิด–ปิดภาคเรียนจากเขต
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {globalCalendars.map(calendar => (
              <span key={calendar.id} className="badge badge-primary">ปี {calendar.year_be}</span>
            ))}
          </div>
        </section>
      )}

      <div className="data-card">
        <table className="thai-table">
          <thead>
            <tr>
              <th>ปีการศึกษา (พ.ศ.)</th>
              <th>เทอม 1</th>
              <th>เทอม 2</th>
              <th>สถานะ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {years.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-gray-400 py-8">ยังไม่มีข้อมูลปีการศึกษา</td></tr>
            ) : years.map(year => {
              const globalCalendar = globalCalendars.find(g => g.year_be === year.year_be)
              return (
              <tr key={year.id}>
                <td style={{ fontWeight: 900, fontSize: 18, color: 'var(--primary-dk)' }}>
                  {year.year_be}
                  {globalCalendar && <div><span className="badge badge-primary">มีข้อมูลกลาง</span></div>}
                </td>
                <td className="text-sm">
                  {year.term1_start_date ? `${formatThaiDate(year.term1_start_date)} – ${formatThaiDate(year.term1_end_date)}` : '-'}
                </td>
                <td className="text-sm">
                  {year.term2_start_date ? `${formatThaiDate(year.term2_start_date)} – ${formatThaiDate(year.term2_end_date)}` : '-'}
                </td>
                <td>
                  {year.is_active ? (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">ใช้งานอยู่</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">ไม่ active</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {globalCalendar && (
                      <LoadingButton
                        className="btn btn-secondary"
                        style={{ fontSize: 13, padding: '6px 10px' }}
                        loading={syncingId === year.id}
                        loadingText="กำลังดึง..."
                        onClick={() => handleSync(year)}
                      >
                        ใช้จากข้อมูลกลาง
                      </LoadingButton>
                    )}
                    <button
                      onClick={() => { setEditItem(year); setShowForm(true) }}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >แก้ไข</button>
                    {!year.is_active && (
                      <button
                        onClick={() => handleSetActive(year.id)}
                        className="text-green-600 hover:text-green-800 text-sm"
                      >ตั้งเป็น Active</button>
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  )
}
