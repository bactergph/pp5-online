'use client'
import { useState, useEffect } from 'react'
import {
  fetchAcademicYears,
  setScoreEntryOpen,
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
  term1_scores_open?: boolean
  term2_scores_open?: boolean
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
  const [togglingPeriod, setTogglingPeriod] = useState<string | null>(null)
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

  async function handleToggleScoreEntry(year: AcademicYear, term: 1 | 2) {
    const field = term === 1 ? 'term1_scores_open' : 'term2_scores_open'
    const open = !year[field]
    setTogglingPeriod(`${year.id}-${term}`)
    try {
      const { error } = await setScoreEntryOpen(year.id, term, open)
      if (error) { notify('error', error); return }
      setYears(previous => previous.map(item => item.id === year.id ? { ...item, [field]: open } : item))
      notify('success', `${open ? 'เปิด' : 'ปิด'}การบันทึกคะแนน ปี ${year.year_be} ภาคเรียนที่ ${term} แล้ว`)
    } catch {
      notify('error', 'เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setTogglingPeriod(null)
    }
  }

  function scoreEntryControl(year: AcademicYear, term: 1 | 2) {
    const open = term === 1 ? year.term1_scores_open : year.term2_scores_open
    return (
      <div style={{ marginTop: 8 }}>
        <div>{open === undefined ? 'ยังไม่พร้อมตั้งค่าการบันทึกคะแนน' : open ? 'เปิดบันทึกคะแนน' : 'ปิดบันทึกคะแนน'}</div>
        <button type="button" className="btn btn-secondary" style={{ marginTop: 4, fontSize: 12 }}
          disabled={togglingPeriod !== null || open === undefined}
          aria-label={`${open ? 'ปิด' : 'เปิด'}บันทึกคะแนน ปี ${year.year_be} ภาคเรียนที่ ${term}`}
          onClick={() => handleToggleScoreEntry(year, term)}>
          {togglingPeriod === `${year.id}-${term}` ? 'กำลังบันทึก...' : open ? 'ปิดการบันทึก' : 'เปิดการบันทึก'}
        </button>
      </div>
    )
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
            <form onSubmit={handleSave} className="term-calendar-form">
              <div className="term-calendar-form__meta">
                <div className="term-calendar-form__year">
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
                <label className="term-calendar-form__active">
                  <input type="checkbox" name="is_active" value="true" defaultChecked={editItem?.is_active} />
                  <span>ใช้งานอยู่ (active)</span>
                </label>
              </div>

              <div className="term-calendar-form__block">
                <div className="term-calendar-form__block-title">เทอม 1</div>
                <div className="term-calendar-form__dates">
                  <div>
                    <label className="form-label">เปิดเรียนเทอม 1</label>
                    <ThaiDatePicker
                      key={`t1s-${editItem?.id || 'new'}`}
                      name="term1_start_date"
                      defaultValue={editItem?.term1_start_date || ''}
                      yearsBack={2}
                      yearsForward={3}
                    />
                  </div>
                  <div>
                    <label className="form-label">ปิดเรียนเทอม 1</label>
                    <ThaiDatePicker
                      key={`t1e-${editItem?.id || 'new'}`}
                      name="term1_end_date"
                      defaultValue={editItem?.term1_end_date || ''}
                      yearsBack={2}
                      yearsForward={3}
                    />
                  </div>
                </div>
              </div>

              <div className="term-calendar-form__block">
                <div className="term-calendar-form__block-title">เทอม 2</div>
                <div className="term-calendar-form__dates">
                  <div>
                    <label className="form-label">เปิดเรียนเทอม 2</label>
                    <ThaiDatePicker
                      key={`t2s-${editItem?.id || 'new'}`}
                      name="term2_start_date"
                      defaultValue={editItem?.term2_start_date || ''}
                      yearsBack={2}
                      yearsForward={3}
                    />
                  </div>
                  <div>
                    <label className="form-label">ปิดเรียนเทอม 2</label>
                    <ThaiDatePicker
                      key={`t2e-${editItem?.id || 'new'}`}
                      name="term2_end_date"
                      defaultValue={editItem?.term2_end_date || ''}
                      yearsBack={2}
                      yearsForward={3}
                    />
                  </div>
                </div>
              </div>

              <div className="term-calendar-form__actions">
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-secondary">ยกเลิก</button>
                <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {globalCalendars.length > 0 ? (
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
      ) : (
        <section className="control-card" style={{ borderStyle: 'dashed' }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}>ยังไม่มีปุ่มซิงก์จากส่วนกลาง</h3>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '6px 0 0', lineHeight: 1.55 }}>
            ปุ่ม「ใช้จากข้อมูลกลาง」จะแสดงเมื่อสำนักงานเขตตั้ง<span style={{ fontWeight: 700 }}>ปฏิทินภาคเรียนกลาง</span>
            ของปีเดียวกับโรงเรียนนี้แล้ว (เมนูเขต → ปฏิทินภาคเรียน)
            {years.length > 0 && (
              <> · ปีที่มีในโรงเรียน: {years.map(y => y.year_be).join(', ')}</>
            )}
          </p>
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
                  {scoreEntryControl(year, 1)}
                </td>
                <td className="text-sm">
                  {year.term2_start_date ? `${formatThaiDate(year.term2_start_date)} – ${formatThaiDate(year.term2_end_date)}` : '-'}
                  {scoreEntryControl(year, 2)}
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
