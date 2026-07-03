'use client'

import { useEffect, useState } from 'react'
import {
  fetchScheduleInit,
  fetchSubstituteDay,
  importSubstituteFromSchedule,
  loadSubstituteSlotsForTeacher,
  saveSubstituteTeacher,
} from '@/app/schedules/actions'
import AppAlertModal from '@/components/AppAlertModal'

type Year = { id: string; year_be: number; is_active: boolean }
type Teacher = { id: string; prefix: string; full_name: string }
type SubstituteEntry = {
  id: string
  absent_teacher_id: string
  period: number
  class_subject_id: string | null
  classroom_id: string | null
  subject_label: string | null
  room_label: string | null
  substitute_teacher_id: string | null
  leave_type: string
  note: string | null
}

const LEAVE_TYPES = ['ลาป่วย', 'ลากิจ', 'ลาคลอด', 'ไปราชการ', 'อื่นๆ']

const STYLES = `
  .schedule-page { display: grid; gap: 14px; }
  .schedule-head h1 { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .schedule-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: #64748B; }
  .schedule-filters {
    display: grid; grid-template-columns: 140px 160px 1fr; gap: 12px; align-items: end;
    padding: 14px; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .schedule-field { display: grid; gap: 5px; }
  .schedule-field label { font-size: 11px; font-weight: 900; color: #475569; }
  .schedule-field select, .schedule-field input {
    min-height: 36px; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0 10px;
    background: #fff; color: #0F172A; font-size: 13px; font-weight: 800;
  }
  .sub-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .sub-btn {
    min-height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid #CBD5E1;
    background: #fff; color: #334155; font-size: 12px; font-weight: 800; cursor: pointer;
  }
  .sub-btn.primary { border-color: #7C3AED; background: #7C3AED; color: #fff; }
  .sub-table-wrap {
    overflow: auto; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .sub-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .sub-table th, .sub-table td {
    padding: 10px 12px; border-bottom: 1px solid #F1F5F9; text-align: left;
  }
  .sub-table th {
    background: #F8FAFC; font-size: 10px; font-weight: 900; color: #64748B;
  }
  .sub-table select, .sub-table input {
    width: 100%; min-height: 32px; border: 1px solid #CBD5E1; border-radius: 8px;
    padding: 0 8px; font-size: 11px; font-weight: 700;
  }
  .schedule-empty { padding: 28px; text-align: center; color: #64748B; font-size: 13px; font-weight: 700; }
  .sub-day-label {
    padding: 10px 14px; border-radius: 12px; border: 1px solid #E0E7FF; background: #EEF2FF;
    color: #3730A3; font-size: 12.5px; font-weight: 700;
  }
`

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function SubstituteScheduleEntry() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [years, setYears] = useState<Year[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [date, setDate] = useState(todayIso())
  const [dayLabel, setDayLabel] = useState('')
  const [substituteDayId, setSubstituteDayId] = useState('')
  const [entries, setEntries] = useState<SubstituteEntry[]>([])
  const [absentTeacherId, setAbsentTeacherId] = useState('')
  const [leaveType, setLeaveType] = useState('ลาป่วย')
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (!selectedYear || !date) return
    loadDay()
  }, [selectedYear, date])

  async function init() {
    try {
      const data = await fetchScheduleInit()
      setYears(data.years as Year[])
      setTeachers(data.teachers as Teacher[])
      const active = (data.years as Year[]).find(y => y.is_active) || (data.years as Year[])[0]
      if (active) setSelectedYear(active.id)
      if (data.teachers?.[0]) setAbsentTeacherId(data.teachers[0].id)
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setLoading(false)
    }
  }

  async function loadDay() {
    try {
      const data = await fetchSubstituteDay(date, selectedYear)
      setSubstituteDayId(data.day?.id || '')
      setDayLabel(data.day_label || '')
      setEntries(data.entries as SubstituteEntry[])
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    }
  }

  async function handleImport() {
    if (!absentTeacherId || !substituteDayId) return
    setSaving(true)
    try {
      const result = await importSubstituteFromSchedule(
        substituteDayId, date, selectedYear, absentTeacherId, leaveType,
      )
      await loadDay()
      setAlert({
        type: 'success',
        title: 'นำเข้าสำเร็จ',
        message: `ดึง ${result.count} คาบจากตารางเรียน`,
      })
    } catch (e) {
      setAlert({ type: 'error', title: 'นำเข้าไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEntry(entry: SubstituteEntry) {
    if (!substituteDayId) return
    setSaving(true)
    try {
      await saveSubstituteTeacher(substituteDayId, entry.id, {
        absent_teacher_id: entry.absent_teacher_id,
        period: entry.period,
        class_subject_id: entry.class_subject_id,
        classroom_id: entry.classroom_id,
        subject_label: entry.subject_label || '',
        room_label: entry.room_label || '',
        substitute_teacher_id: entry.substitute_teacher_id,
        leave_type: entry.leave_type,
        note: entry.note,
      })
      setAlert({ type: 'success', title: 'บันทึกสำเร็จ' })
    } catch (e) {
      setAlert({ type: 'error', title: 'บันทึกไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setSaving(false)
    }
  }

  async function previewSlots() {
    if (!absentTeacherId) return
    try {
      const slots = await loadSubstituteSlotsForTeacher(date, selectedYear, absentTeacherId)
      if (!slots.length) {
        setAlert({ type: 'error', title: 'ไม่พบคาบสอน', message: 'ครูท่านนี้ไม่มีคาบสอนในวันนี้ตามตารางเรียน' })
        return
      }
      setAlert({
        type: 'success',
        title: `พบ ${slots.length} คาบ`,
        message: slots.map(s => `คาบ ${s.period}: ${s.room_label} ${s.subject_label}`).join('\n'),
      })
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    }
  }

  function updateEntry(id: string, field: keyof SubstituteEntry, value: string | null) {
    setEntries(current => current.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  if (loading) return <div className="schedule-empty">กำลังโหลด...</div>

  return (
    <>
      <style>{STYLES}</style>
      <div className="schedule-page">
        <div className="schedule-head">
          <h1>ตารางสอนแทน</h1>
          <p>บันทึกครูลาและครูสอนแทนรายคาบ</p>
        </div>

        <div className="schedule-filters">
          <div className="schedule-field">
            <label>ปีการศึกษา</label>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="schedule-field">
            <label>วันที่</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="schedule-field">
            <label>ครูที่ลา</label>
            <select value={absentTeacherId} onChange={e => setAbsentTeacherId(e.target.value)}>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.prefix} {t.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {dayLabel && <div className="sub-day-label">วัน{dayLabel} — {date}</div>}

        <div className="sub-actions">
          <select
            value={leaveType}
            onChange={e => setLeaveType(e.target.value)}
            style={{ minHeight: 36, borderRadius: 8, border: '1px solid #CBD5E1', padding: '0 10px', fontWeight: 800 }}
          >
            {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" className="sub-btn" onClick={previewSlots}>ดูคาบจากตารางเรียน</button>
          <button type="button" className="sub-btn primary" onClick={handleImport} disabled={saving || !absentTeacherId}>
            {saving ? 'กำลังนำเข้า...' : 'นำเข้าจากตารางเรียน'}
          </button>
        </div>

        {entries.length === 0 ? (
          <div className="schedule-empty">
            ยังไม่มีรายการสอนแทน — เลือกครูที่ลาแล้วกด &quot;นำเข้าจากตารางเรียน&quot;
          </div>
        ) : (
          <div className="sub-table-wrap">
            <table className="sub-table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>คาบ</th>
                  <th>ห้อง</th>
                  <th>วิชา</th>
                  <th>ประเภทการลา</th>
                  <th>ครูสอนแทน</th>
                  <th>หมายเหตุ</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id}>
                    <td>คาบ {entry.period}</td>
                    <td>{entry.room_label || '—'}</td>
                    <td>{entry.subject_label || '—'}</td>
                    <td>
                      <select
                        value={entry.leave_type}
                        onChange={e => updateEntry(entry.id, 'leave_type', e.target.value)}
                      >
                        {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={entry.substitute_teacher_id || ''}
                        onChange={e => updateEntry(entry.id, 'substitute_teacher_id', e.target.value || null)}
                      >
                        <option value="">— เลือกครูสอนแทน —</option>
                        {teachers.filter(t => t.id !== entry.absent_teacher_id).map(t => (
                          <option key={t.id} value={t.id}>{t.prefix} {t.full_name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={entry.note || ''}
                        onChange={e => updateEntry(entry.id, 'note', e.target.value || null)}
                        placeholder="หมายเหตุ"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="sub-btn"
                        onClick={() => handleSaveEntry(entry)}
                        disabled={saving}
                      >
                        บันทึก
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {alert && (
        <AppAlertModal open type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
    </>
  )
}
