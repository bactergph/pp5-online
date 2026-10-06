'use client'
import { useState } from 'react'
import { moveLegacyHourlyRecord } from '@/app/attendance/actions'
import { HOURLY_STATUS_LABELS, type HourlyStatus, type TeachingWeek } from '@/lib/hourly-attendance'

export type LegacyHourlyRecord = { id: string; student_id: string; week_number: number; hour_number: number; status: string }

export default function LegacyHourlyRecords({ records, students, weeks, hoursPerWeek, context, canEdit, onReload, onBusyChange }: {
  records: LegacyHourlyRecord[]
  students: { id: string; first_name: string; last_name: string }[]
  weeks: TeachingWeek[]; hoursPerWeek: number; canEdit: boolean
  context: { classroomId: string; classSubjectId: string; academicYearId: string; term: 1 | 2 }
  onReload: () => Promise<void>
  onBusyChange: (busy: boolean) => void
}) {
  const [selectedId, setSelectedId] = useState('')
  const [week, setWeek] = useState('')
  const [slot, setSlot] = useState('1')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!records.length) return null
  async function move() {
    if (!canEdit || !selectedId || !week || busy) return
    setBusy(true)
    onBusyChange(true)
    try {
      const result = await moveLegacyHourlyRecord({ ...context, recordId: selectedId, weekNumber: Number(week), slot: Number(slot) })
      setMessage(result.error || 'ย้ายข้อมูลเรียบร้อยแล้ว')
      setSelectedId('')
      await onReload()
    } catch { setMessage('ย้ายไม่สำเร็จ กรุณารีเฟรชเพื่อตรวจสอบข้อมูลก่อนลองใหม่') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <details className="control-card" style={{ borderColor: '#d5a854', background: '#fffbef' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>มีข้อมูลเดิมนอกคาบปัจจุบัน {records.length} รายการ — กดเพื่อตรวจสอบ</summary>
    <p>ข้อมูลเหล่านี้ยังอยู่ในระบบ และยังไม่นับในยอดเวลาเรียนของคาบปัจจุบัน ตรวจสอบก่อนเลือกย้ายไปคาบที่ถูกต้อง ระบบจะไม่เขียนทับคาบที่มีข้อมูลแล้ว</p>
    <div style={{ overflow: 'auto', maxHeight: 300 }}><table className="thai-table"><thead><tr><th>นักเรียน</th><th>สัปดาห์เดิม</th><th>คาบเดิม</th><th>สถานะ</th></tr></thead><tbody>
      {records.map(record => { const student = students.find(item => item.id === record.student_id); return <tr key={record.id}><td>{student?.first_name} {student?.last_name}</td><td>{record.week_number}</td><td>{record.hour_number}</td><td>{HOURLY_STATUS_LABELS[record.status as HourlyStatus] || record.status}</td></tr> })}
    </tbody></table></div>
    {(canEdit || busy) && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginTop: 16 }}>
      <label style={{ flex: '1 1 240px' }}>รายการเดิม<select className="form-input" value={selectedId} disabled={busy} onChange={event => setSelectedId(event.target.value)}><option value="">เลือกข้อมูลที่จะย้าย</option>{records.map(record => { const student = students.find(item => item.id === record.student_id); return <option key={record.id} value={record.id}>{student?.first_name} {student?.last_name} · สัปดาห์ {record.week_number} คาบ {record.hour_number}</option> })}</select></label>
      <label>สัปดาห์ปลายทาง<select className="form-input" value={week} disabled={busy} onChange={event => setWeek(event.target.value)}><option value="">เลือกสัปดาห์</option>{weeks.map(item => <option key={item.weekNumber} value={item.weekNumber}>สัปดาห์ {item.weekNumber}</option>)}</select></label>
      <label>คาบปลายทาง<select className="form-input" value={slot} disabled={busy} onChange={event => setSlot(event.target.value)}>{Array.from({ length: hoursPerWeek }, (_, index) => <option key={index} value={index + 1}>คาบ {index + 1}</option>)}</select></label>
      <button className="btn btn-secondary" disabled={busy || !selectedId || !week} onClick={() => void move()}>{busy ? 'กำลังย้าย…' : 'ย้ายไปคาบที่เลือก'}</button>
    </div>}
    <p role="status" aria-live="polite">{message}</p>
  </details>
}
