'use client'
import { useEffect, useState } from 'react'
import {
  deleteGlobalTermCalendar,
  fetchGlobalTermCalendars,
  saveGlobalTermCalendar,
  type GlobalTermCalendar,
} from './actions'
import LoadingButton from '@/components/LoadingButton'
import ThaiDatePicker from '@/components/ThaiDatePicker'
import { formatThaiDate } from '@/lib/thaiDate'
import { useAppAlert } from '@/lib/use-app-alert'

export default function DistrictTermCalendarsPage() {
  const currentYearBe = new Date().getFullYear() + 543
  const [items, setItems] = useState<GlobalTermCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const { notify, AlertModal } = useAppAlert()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await fetchGlobalTermCalendars()
    setItems(data as GlobalTermCalendar[])
    setLoading(false)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const { error } = await saveGlobalTermCalendar({
      year_be: Number(fd.get('year_be')),
      term1_start_date: fd.get('term1_start_date') as string || null,
      term1_end_date: fd.get('term1_end_date') as string || null,
      term2_start_date: fd.get('term2_start_date') as string || null,
      term2_end_date: fd.get('term2_end_date') as string || null,
    })
    setSaving(false)
    if (error) {
      notify('error', error)
      return
    }
    setFormKey(k => k + 1)
    notify('success', 'บันทึกปฏิทินกลางเรียบร้อยแล้ว')
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบปฏิทินกลางปีนี้? โรงเรียนที่ sync ไปแล้วจะไม่ถูกเปลี่ยน')) return
    const { error } = await deleteGlobalTermCalendar(id)
    if (error) notify('error', error)
    else {
      notify('success', 'ลบปฏิทินกลางเรียบร้อยแล้ว')
      load()
    }
  }

  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  return (
    <div className="page-stack">
      <div className="page-hero" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <span className="page-hero-kicker">Central calendar</span>
          <h1 className="page-title">ปฏิทินเปิด-ปิดภาคเรียนกลาง</h1>
          <p className="page-hero-kicker">กำหนดวันเปิด/ปิดภาคเรียน เทอม 1 และ 2 เพื่อให้โรงเรียนกด Sync ไปใช้</p>
        </div>
        <span className="badge badge-primary">{items.length} ปีการศึกษา</span>
      </div>

      <AlertModal />

      <section className="card-padded term-calendar-card">
        <h3 style={{ fontSize: 17, fontWeight: 900, marginBottom: 14 }}>เพิ่ม/อัปเดตปฏิทินกลาง</h3>
        <form key={formKey} onSubmit={handleSave} className="term-calendar-form">
          <div className="term-calendar-form__year">
            <label className="form-label">ปีการศึกษา (พ.ศ.)</label>
            <input name="year_be" type="number" defaultValue={currentYearBe} className="form-input" required min={2560} max={2580} />
          </div>

          <div className="term-calendar-form__block">
            <div className="term-calendar-form__block-title">เทอม 1</div>
            <div className="term-calendar-form__dates">
              <div>
                <label className="form-label">เปิดเทอม 1</label>
                <ThaiDatePicker name="term1_start_date" yearsBack={2} yearsForward={3} />
              </div>
              <div>
                <label className="form-label">ปิดเทอม 1</label>
                <ThaiDatePicker name="term1_end_date" yearsBack={2} yearsForward={3} />
              </div>
            </div>
          </div>

          <div className="term-calendar-form__block">
            <div className="term-calendar-form__block-title">เทอม 2</div>
            <div className="term-calendar-form__dates">
              <div>
                <label className="form-label">เปิดเทอม 2</label>
                <ThaiDatePicker name="term2_start_date" yearsBack={2} yearsForward={3} />
              </div>
              <div>
                <label className="form-label">ปิดเทอม 2</label>
                <ThaiDatePicker name="term2_end_date" yearsBack={2} yearsForward={3} />
              </div>
            </div>
          </div>

          <div className="term-calendar-form__actions">
            <LoadingButton type="submit" loading={saving} className="btn btn-primary btn-lg">
              บันทึกปฏิทินกลาง
            </LoadingButton>
          </div>
        </form>
      </section>

      <section className="data-card">
        <table className="thai-table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>ปี พ.ศ.</th>
              <th>เทอม 1</th>
              <th>เทอม 2</th>
              <th style={{ width: 100, textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 36 }}>ยังไม่มีปฏิทินกลาง</td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td style={{ fontWeight: 900, color: 'var(--primary-dk)' }}>{item.year_be}</td>
                <td>{item.term1_start_date ? `${formatThaiDate(item.term1_start_date)} - ${formatThaiDate(item.term1_end_date || item.term1_start_date)}` : '-'}</td>
                <td>{item.term2_start_date ? `${formatThaiDate(item.term2_start_date)} - ${formatThaiDate(item.term2_end_date || item.term2_start_date)}` : '-'}</td>
                <td style={{ textAlign: 'center' }}>
                  <button type="button" onClick={() => handleDelete(item.id)} style={{ color: '#DC2626', background: 'none', border: 0, cursor: 'pointer', fontSize: 13 }}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
