'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { DEFAULT_PERIOD_TIMES, periodTimeLabel, type PeriodTimeRow } from '@/lib/schedule-helpers'
import { availableSubstitutes } from '@/lib/substitute-availability'
import { bangkokToday } from '@/lib/free-schedule-ad-window'
import type { LocalCell } from '@/lib/schedule-device-free'

export type { LocalCell }
export type FreeSubstituteEntry = {
  id: string
  absentTeacherId: string
  period: number
  subjectId: string
  roomId: string
  subjectLabel: string
  roomLabel: string
  substituteTeacherId: string | null
  leaveType: string
  note: string | null
}

type Teacher = { id: string; name: string }
type Room = { id: string; label: string }
type Subject = { id: string; roomId: string; name: string; teacherId: string }

const LEAVE_TYPES = ['ลาป่วย', 'ลากิจ', 'ลาคลอด', 'ไปราชการ', 'อื่นๆ']
const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

function weekdayOf(iso: string) {
  const day = new Date(`${iso}T12:00:00+07:00`).getUTCDay()
  return day === 0 ? 7 : day
}

function newId() {
  return globalThis.crypto.randomUUID()
}

export default function FreeSubstituteDesk({
  teachers,
  rooms,
  subjects,
  timetable,
  days,
  periods = DEFAULT_PERIOD_TIMES,
  onSave,
  reservations=[],
  onDirty,
}: {
  teachers: Teacher[]
  rooms: Room[]
  subjects: Subject[]
  timetable: LocalCell[]
  days: Record<string, FreeSubstituteEntry[]>
  periods?: PeriodTimeRow[]
  onSave: (days: Record<string, FreeSubstituteEntry[]>) => void|boolean|Promise<void|boolean>
  reservations?:{teacherId:string;day:number;period:number}[]
  onDirty?:(dirty:boolean)=>void
}) {
  const [date, setDate] = useState(bangkokToday)
  const [chosenAbsent, setAbsentId] = useState(teachers[0]?.id || '')
  const absentId=teachers.some(teacher=>teacher.id===chosenAbsent)?chosenAbsent:teachers[0]?.id||''
  const [leaveType, setLeaveType] = useState('ลาป่วย')
  const [entries, setEntries] = useState<FreeSubstituteEntry[]>([])
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  const [saving,setSaving]=useState(false)
  const savingRef=useRef(false)
  const savedDays = useRef(days)
  useEffect(()=>{savedDays.current=days},[days])
  useEffect(()=>{onDirty?.(dirty)},[dirty,onDirty])
  useEffect(()=>()=>{onDirty?.(false)},[onDirty])

  useEffect(() => {
    setEntries(savedDays.current[date] || [])
    setDirty(false)
    setMessage('')
  }, [date])


  const weekday = weekdayOf(date)
  const shaped = entries.map(entry => ({
    id: entry.id,
    absent_teacher_id: entry.absentTeacherId,
    substitute_teacher_id: entry.substituteTeacherId,
    period: entry.period,
  }))
  const busy = timetable.flatMap(cell => {
    if (cell.day !== weekday) return []
    const teacherId = subjects.find(subject => subject.id === cell.subjectId)?.teacherId
    return teacherId ? [{ teacherId, period: cell.period }] : []
  }).concat(reservations.filter(row=>row.day===weekday).map(({teacherId,period})=>({teacherId,period})))
  const slotsFor = (teacherId: string) => timetable.filter(cell => cell.day === weekday && subjects.find(subject => subject.id === cell.subjectId)?.teacherId === teacherId)
  const choices = (entry: FreeSubstituteEntry) => availableSubstitutes(teachers, busy, shaped, entry)
  const ready = (entry: FreeSubstituteEntry) => !!entry.substituteTeacherId && choices(entry).some(teacher => teacher.id === entry.substituteTeacherId)
  const pending = entries.filter(entry => !ready(entry)).length

  function preview() {
    if (!absentId) return
    if (weekday > 5) {
      setMessage('ไม่มีคาบสอนในวันเสาร์หรืออาทิตย์')
      return
    }
    const slots = slotsFor(absentId)
    setMessage(slots.length ? slots.map(slot => `คาบ ${slot.period}: ${rooms.find(room => room.id === slot.classroomId)?.label || 'ห้อง'} ${subjects.find(subject => subject.id === slot.subjectId)?.name || 'วิชา'}`).join('\n') : 'ครูท่านนี้ไม่มีคาบสอนในวันนี้ตามตารางบนเครื่อง')
  }

  function importDay() {
    if (!absentId) return
    if (!timetable.length) {
      setMessage('จัดตารางบนเครื่องนี้ก่อน แล้วค่อยนำเข้าคาบ')
      return
    }
    if (weekday > 5) {
      setMessage('ไม่มีคาบสอนในวันเสาร์หรืออาทิตย์')
      return
    }
    const slots = slotsFor(absentId)
    if (!slots.length) {
      setMessage('ครูท่านนี้ไม่มีคาบสอนในวันนี้ตามตารางบนเครื่อง')
      return
    }
    if (entries.some(entry => entry.absentTeacherId === absentId) && !window.confirm('นำเข้าคาบใหม่แทนคาบเดิมของครูที่เลือก? ต้องกำหนดครูสอนแทนของคาบเหล่านี้ใหม่')) return
    setEntries([
      ...entries.filter(entry => entry.absentTeacherId !== absentId),
      ...slots.map(slot => ({
        id: newId(),
        absentTeacherId: absentId,
        period: slot.period,
        subjectId: slot.subjectId,
        roomId: slot.classroomId,
        subjectLabel: subjects.find(subject => subject.id === slot.subjectId)?.name || 'วิชา',
        roomLabel: rooms.find(room => room.id === slot.classroomId)?.label || 'ห้อง',
        substituteTeacherId: null,
        leaveType,
        note: null,
      })),
    ])
    setDirty(true)
    setMessage(`ดึง ${slots.length} คาบจากตารางบนเครื่องนี้`)
  }

  function updateEntry(id: string, field: 'leaveType' | 'substituteTeacherId' | 'note', value: string | null) {
    setDirty(true)
    setEntries(current => current.map(entry => entry.id === id ? { ...entry, [field]: value } : entry))
  }

  async function save(){
    if(savingRef.current)return
    if(entries.some(entry=>entry.substituteTeacherId&&!ready(entry))){setMessage('ครูสอนแทนบางคาบไม่ว่างหรือถูกกำหนดซ้ำ กรุณาเลือกใหม่');return}
    savingRef.current=true;setSaving(true);setMessage('กำลังบันทึกลงเครื่อง…')
    try{
      if(await onSave({...savedDays.current,[date]:entries})===false)throw Error('บันทึกลงเครื่องไม่สำเร็จ')
      setDirty(false);setMessage('บันทึกตารางสอนแทนไว้บนเครื่องนี้แล้ว')
    }catch(error){setMessage(error instanceof Error?error.message:'บันทึกไม่สำเร็จ')}
    finally{savingRef.current=false;setSaving(false)}
  }

  return (
    <div className="free-sub">
      <div className="schedule-head">
        <h2>ตารางสอนแทน</h2>
        <p>1. เลือกครูที่ลา → 2. เลือกครูที่ว่างแต่ละคาบ → 3. บันทึกไว้บนเครื่องนี้</p>
      </div>
      <div className="schedule-filters">
        <div className="schedule-field">
          <label>วันที่</label>
          <input type="date" disabled={saving} value={date} onChange={event => {if(!dirty||window.confirm('เปลี่ยนวันที่และยกเลิกข้อมูลที่ยังไม่บันทึก?'))setDate(event.target.value)}} />
        </div>
        <div className="schedule-field">
          <label>ครูที่ลา</label>
          <select value={absentId} onChange={event => setAbsentId(event.target.value)}>
            {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
        </div>
      </div>
      {weekday <= 5 && <div className="sub-day-label">วัน{DAY_NAMES[weekday]} — {date}</div>}
      <div className="sub-actions">
        <select value={leaveType} onChange={event => setLeaveType(event.target.value)} aria-label="ประเภทการลา">
          {LEAVE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
        <button type="button" onClick={preview}>ดูคาบจากตารางเรียน</button>
        <button type="button" className="primary" onClick={importDay}>นำเข้าจากตารางเรียน</button>
      </div>
      {message && <p className="sub-note">{message}</p>}
      {entries.length === 0 ? (
        <p className="schedule-empty">ยังไม่มีรายการสอนแทน — เลือกครูที่ลาแล้วกด &quot;นำเข้าจากตารางเรียน&quot;</p>
      ) : (
        <div className="sub-table-wrap">
          <table className="sub-table">
            <thead>
              <tr>
                <th>คาบ</th>
                <th>สถานะ</th>
                <th>ห้อง</th>
                <th>วิชา</th>
                <th>ประเภทการลา</th>
                <th>ครูสอนแทน</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set(entries.map(entry => entry.absentTeacherId))).map(teacherId => (
                <Fragment key={teacherId}>
                  <tr className="sub-group-head">
                    <td colSpan={7}>
                      <div className="sub-group-summary">
                        <span>ครูที่ลา: {teachers.find(teacher => teacher.id === teacherId)?.name || '—'} · {entries.filter(entry => entry.absentTeacherId === teacherId).length} คาบ</span>
                        <span className={`sub-status${entries.some(entry => entry.absentTeacherId === teacherId && !ready(entry)) ? ' pending' : ''}`}>{entries.some(entry => entry.absentTeacherId === teacherId && !ready(entry)) ? 'ยังขาดครูสอนแทน' : 'กำหนดครบแล้ว'}</span>
                      </div>
                    </td>
                  </tr>
                  {entries.filter(entry => entry.absentTeacherId === teacherId).sort((a, b) => a.period - b.period).map(entry => (
                    <tr key={entry.id}>
                      <td>คาบ {entry.period}<span className="sub-period-time">{periodTimeLabel(periods, entry.period)}</span></td>
                      <td><span className={`sub-status${ready(entry) ? '' : ' pending'}`}>{ready(entry) ? 'พร้อม' : 'รอเลือกครู'}</span></td>
                      <td>{entry.roomLabel || '—'}</td>
                      <td>{entry.subjectLabel || '—'}</td>
                      <td>
                        <select value={entry.leaveType} onChange={event => updateEntry(entry.id, 'leaveType', event.target.value)} aria-label={`ประเภทการลาคาบ ${entry.period}`}>
                          {LEAVE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={entry.substituteTeacherId || ''} onChange={event => updateEntry(entry.id, 'substituteTeacherId', event.target.value || null)} aria-label={`ครูสอนแทนคาบ ${entry.period}`}>
                          <option value="">— เลือกครูที่ว่าง —</option>
                          {entry.substituteTeacherId && !choices(entry).some(teacher => teacher.id === entry.substituteTeacherId) && <option disabled value={entry.substituteTeacherId}>ครูเดิมไม่ว่าง กรุณาเลือกใหม่</option>}
                          {choices(entry).map(teacher => (
                            <option key={teacher.id} value={teacher.id}>{teacher.name} · สอนแทน {entries.filter(item => item.substituteTeacherId === teacher.id).length} คาบวันนี้</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input value={entry.note || ''} onChange={event => updateEntry(entry.id, 'note', event.target.value || null)} placeholder="หมายเหตุ" aria-label={`หมายเหตุคาบ ${entry.period}`} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entries.length > 0 && (
        <div className="sub-footer">
          <span>{entries.length} คาบ · พร้อม {entries.length - pending} คาบ · ยังขาด/ต้องแก้ {pending} คาบ{dirty ? ' · มีการแก้ไขที่ยังไม่บันทึก' : ''}</span>
          <button type="button" className="primary" disabled={saving} onClick={()=>void save()}>{saving?'กำลังบันทึก…':'บันทึกบนเครื่องนี้'}</button>
        </div>
      )}
    </div>
  )
}
