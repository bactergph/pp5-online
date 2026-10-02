'use client'

import { SCHEDULE_PRESENTATION } from './schedule-presentation'

import { Fragment, useEffect, useState, useRef, useCallback } from 'react'
import {
  fetchScheduleInit,
  fetchPeriodTimes,
  fetchSubstituteDay,
  importSubstituteFromSchedule,
  loadSubstituteSlotsForTeacher,
  saveSubstituteDay,
  fetchSubstitutePdfContext,
} from '@/app/schedules/actions'
import { periodTimeLabel, type PeriodTimeRow } from '@/lib/schedule-helpers'
import { availableSubstitutes } from '@/lib/substitute-availability'
import { directorDisplayName } from '@/lib/school-director'
import { buildSubstitutePdf } from '@/lib/jspdf-substitute'
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
  .sub-footer {position:sticky;bottom:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:16px;background:#fff;border:1px solid #dbe3ef;border-radius:16px;box-shadow:0 6px 24px #0f172a12}
  .sub-footer span {flex:1;font-size:13px;color:#475569}
  .sub-btn:disabled {opacity:.5;cursor:not-allowed}
  @media(max-width:700px){.schedule-filters{grid-template-columns:1fr!important}.sub-table{min-width:850px}.sub-footer{position:static}}
  .schedule-page { display: grid; gap: 14px; }
  .schedule-head h1 { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .schedule-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: #64748B; }
  .schedule-filters {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; align-items: end;
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
  .sub-btn.primary { border-color: #C49212; background: #C49212; color: #fff; }
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
    padding: 10px 14px; border-radius: 12px; border: 1px solid #EFE6D8; background: #F5EDE3;
    color: #5C4330; font-size: 12.5px; font-weight: 700;
  }
`

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export default function SubstituteScheduleEntry() {
  const [periodTimes, setPeriodTimes] = useState<PeriodTimeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingDay, setLoadingDay] = useState(false)
  const [loadedDay, setLoadedDay] = useState('')
  const dayRequest = useRef(0)
  const [years, setYears] = useState<Year[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [term, setTerm] = useState('1')
  const [date, setDate] = useState(todayIso())
  const blocked = saving || loadingDay || loadedDay !== `${selectedYear}:${term}:${date}`
  const [dayLabel, setDayLabel] = useState('')
  const [substituteDayId, setSubstituteDayId] = useState('')
  const [busy, setBusy] = useState<{teacherId:string;period:number}[]>([])
  const [original, setOriginal] = useState<SubstituteEntry[]>([])
  const [dirty, setDirty] = useState(false)
  const [entries, setEntries] = useState<SubstituteEntry[]>([])
  const [absentTeacherId, setAbsentTeacherId] = useState('')
  const [leaveType, setLeaveType] = useState('ลาป่วย')
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)

  async function init() {
    try {
      const [data, periods] = await Promise.all([fetchScheduleInit(), fetchPeriodTimes()])
      setPeriodTimes(periods.times)
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

  const loadDay = useCallback(async () => {
    const request = ++dayRequest.current
    setLoadingDay(true)
    try {
      const data = await fetchSubstituteDay(date, selectedYear, Number(term))
      if (request !== dayRequest.current) return
      setSubstituteDayId(data.day?.id || '')
      setDayLabel(data.day_label || '')
      setEntries(data.entries as SubstituteEntry[])
      setOriginal(data.entries as SubstituteEntry[])
      setBusy(data.busy)
      setDirty(false)
      setLoadedDay(`${selectedYear}:${term}:${date}`)
    } catch (e) {
      if (request !== dayRequest.current) return
      setLoadedDay(''); setEntries([]); setSubstituteDayId('')
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally { if (request === dayRequest.current) setLoadingDay(false) }
  }, [date, selectedYear, term])

  useEffect(() => { void Promise.resolve().then(init) }, [])
  useEffect(() => {
    if (!selectedYear || !date) return
    void Promise.resolve().then(loadDay)
  }, [date, selectedYear, loadDay])

  async function handleImport() {
    if (blocked || !absentTeacherId || !substituteDayId) return
    if (dirty) { setAlert({type:'error',title:'กรุณาบันทึกการแก้ไขก่อนนำเข้าคาบเพิ่มเติม'}); return }
    if (entries.some(e => e.absent_teacher_id === absentTeacherId) && !window.confirm('นำเข้าคาบใหม่แทนคาบเดิมของครูที่เลือก? ต้องกำหนดครูสอนแทนของคาบเหล่านี้ใหม่')) return
    setSaving(true)
    try {
      const response = await importSubstituteFromSchedule(
        substituteDayId, date, selectedYear, absentTeacherId, leaveType, Number(term),
      )
      if (response.error || !response.data) throw new Error(response.error || 'นำเข้าไม่สำเร็จ')
      const result = response.data
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

  const changes = (rows: SubstituteEntry[]) => rows.map(({id,substitute_teacher_id,leave_type,note}) => ({id,substitute_teacher_id,leave_type,note}))
  async function handleSaveAll() {
    if (blocked || !substituteDayId) return
    setSaving(true)
    try {
      const invalid = entries.find(e => e.substitute_teacher_id && !availableSubstitutes(teachers,busy,entries,e).some(t => t.id === e.substitute_teacher_id))
      if (invalid) throw new Error('ครูสอนแทนมีคาบชนกันหรือเป็นครูที่ลา กรุณาเลือกใหม่')
      const result = await saveSubstituteDay(substituteDayId, changes(original), changes(entries))
      if (result.error) throw new Error(result.error)
      await loadDay()
      setAlert({type:'success',title:'บันทึกตารางสอนแทนทั้งหมดแล้ว'})
    } catch(e) { setAlert({type:'error',title:'บันทึกไม่สำเร็จ',message:e instanceof Error ? e.message : 'กรุณาลองใหม่'}) }
    finally {setSaving(false)}
  }
  async function downloadPdf() {
    if (blocked || dirty || !entries.length) return
    setSaving(true)
    try {
      const context = await fetchSubstitutePdfContext()
      const result = await buildSubstitutePdf({schoolName:context.school?.name || 'โรงเรียน',logoUrl:context.school?.logo_url,date,year:years.find(y=>y.id===selectedYear)?.year_be || 0,term,academicHead:context.academicHead,director:directorDisplayName(context.school, ''),times:context.periodTimes,teachers,entries})
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a'); a.href=url; a.download=result.fileName; a.click()
      setTimeout(()=>URL.revokeObjectURL(url),30000)
    } catch(e) {setAlert({type:'error',title:'สร้าง PDF ไม่สำเร็จ',message:e instanceof Error ? e.message : 'กรุณาลองใหม่'})}
    finally {setSaving(false)}
  }

  async function previewSlots() {
    if (!absentTeacherId) return
    try {
      const slots = await loadSubstituteSlotsForTeacher(date, selectedYear, absentTeacherId, Number(term))
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
    setDirty(true)
    setEntries(current => current.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  const entryReady = (entry: SubstituteEntry) => !!entry.substitute_teacher_id && availableSubstitutes(teachers,busy,entries,entry).some(t=>t.id===entry.substitute_teacher_id)
  const pendingCount = entries.filter(e=>!entryReady(e)).length

  if (loading) return <div className="schedule-empty">กำลังโหลด...</div>

  return (
    <>
      <style>{STYLES + SCHEDULE_PRESENTATION}</style>
      <div className="schedule-page schedule-workspace">
        <div className="schedule-head">
          <h1>ตารางสอนแทน</h1>
          <p>1. เลือกครูที่ลา → 2. เลือกครูที่ว่างแต่ละคาบ → 3. บันทึกและออกเอกสาร</p>
        </div>

        <div className="schedule-filters">
          <div className="schedule-field">
            <label>ปีการศึกษา</label>
            <select disabled={saving || dirty} value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="schedule-field"><label>ภาคเรียน</label><select disabled={saving || dirty} value={term} onChange={e=>setTerm(e.target.value)}><option value="1">ภาคเรียนที่ 1</option><option value="2">ภาคเรียนที่ 2</option></select></div>
          <div className="schedule-field">
            <label>วันที่</label>
            <input type="date" disabled={saving || dirty} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="schedule-field">
            <label>ครูที่ลา</label>
            <select disabled={saving} value={absentTeacherId} onChange={e => setAbsentTeacherId(e.target.value)}>
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
          <button type="button" className="sub-btn" disabled={blocked} onClick={previewSlots}>ดูคาบจากตารางเรียน</button>
          <button type="button" className="sub-btn primary" onClick={handleImport} disabled={blocked || !absentTeacherId}>
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
                  <th>สถานะ</th><th>ห้อง</th>
                  <th>วิชา</th>
                  <th>ประเภทการลา</th>
                  <th>ครูสอนแทน</th>
                  <th>หมายเหตุ</th>

                </tr>
              </thead>
              <tbody>
                {Array.from(new Set(entries.map(e=>e.absent_teacher_id))).map(absentId => <Fragment key={absentId}>
                  <tr className="sub-group-head"><td colSpan={7}><div className="sub-group-summary"><span>ครูที่ลา: {teachers.find(t=>t.id===absentId)?.full_name || '—'} · {entries.filter(e=>e.absent_teacher_id===absentId).length} คาบ</span><span className={`sub-status${entries.some(e=>e.absent_teacher_id===absentId && !entryReady(e))?' pending':''}`}>{entries.some(e=>e.absent_teacher_id===absentId && !entryReady(e))?'ยังขาดครูสอนแทน':'กำหนดครบแล้ว'}</span></div></td></tr>
                  {entries.filter(e=>e.absent_teacher_id===absentId).sort((a,b)=>a.period-b.period).map(entry => (
                  <tr key={entry.id}>
                    <td>คาบ {entry.period}<span className="sub-period-time">{periodTimeLabel(periodTimes,entry.period)}</span></td>
                    <td><span className={`sub-status${entryReady(entry)?'':' pending'}`}>{entryReady(entry)?'พร้อม':'รอเลือกครู'}</span></td>
                    <td>{entry.room_label || '—'}</td>
                    <td>{entry.subject_label || '—'}</td>
                    <td>
                      <select
                        disabled={blocked}
                        value={entry.leave_type}
                        onChange={e => updateEntry(entry.id, 'leave_type', e.target.value)}
                      >
                        {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        disabled={blocked}
                        value={entry.substitute_teacher_id || ''}
                        onChange={e => updateEntry(entry.id, 'substitute_teacher_id', e.target.value || null)}
                      >
                        <option value="">— เลือกครูที่ว่าง —</option>
                        {entry.substitute_teacher_id && !availableSubstitutes(teachers,busy,entries,entry).some(t=>t.id===entry.substitute_teacher_id) && <option disabled value={entry.substitute_teacher_id}>ครูเดิมไม่ว่าง กรุณาเลือกใหม่</option>}
                        {availableSubstitutes(teachers,busy,entries,entry).map(t => (
                          <option key={t.id} value={t.id}>{t.prefix} {t.full_name} · สอนแทน {entries.filter(e=>e.substitute_teacher_id===t.id).length} คาบวันนี้</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        disabled={blocked}
                        value={entry.note || ''}
                        onChange={e => updateEntry(entry.id, 'note', e.target.value || null)}
                        placeholder="หมายเหตุ"
                      />
                    </td>

                  </tr>
                ))}
                </Fragment>)}
              </tbody>
            </table>
          </div>
        )}
        {entries.length > 0 && <div className="sub-footer">
          <span>{entries.length} คาบ · พร้อม {entries.length-pendingCount} คาบ · ยังขาด/ต้องแก้ {pendingCount} คาบ{dirty ? ' · มีการแก้ไขที่ยังไม่บันทึก' : ''}</span>

          <button className="sub-btn" disabled={blocked || dirty} title={dirty ? 'บันทึกการแก้ไขก่อนออก PDF' : 'ดาวน์โหลดเอกสารจากรายการที่บันทึกแล้ว'} onClick={downloadPdf}>ดาวน์โหลด PDF</button>
          <button className="sub-btn primary" disabled={blocked} onClick={handleSaveAll}>{saving ? 'กำลังดำเนินการ...' : 'บันทึกทั้งหมด'}</button>
        </div>}
      </div>

      {alert && (
        <AppAlertModal open type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
    </>
  )
}
