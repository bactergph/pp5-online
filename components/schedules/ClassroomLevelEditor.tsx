'use client'
import { useScheduleOperations } from './ScheduleServices'
import { useEffect, useMemo, useRef, useState } from 'react'
import {usePendingScheduleEditor} from './SchedulePendingEdits'
import { SCHOOL_LEVEL_GROUPS } from '@/lib/school-education-type'
import {scheduleRoomEnabled} from '@/lib/schedule-room-state'
import { isTimetableClassroom } from '@/lib/schedules'
import { PERIOD_BANDS, periodBand, type PeriodBand } from '@/lib/schedule-period-profiles'
import './schedule-setup.css'

type Room = { id: string; level: string; room: number; name: string;schedule_enabled?:boolean }

function namesByLevel(rooms: Room[], levels: string[]) {
  return Object.fromEntries(levels.map(level => [
    level,
    rooms.filter(room => room.level === level).sort((a, b) => a.room - b.room).map(room => room.name || String(room.room)),
  ]))
}

export default function ClassroomLevelEditor({ classrooms, year, term, locked, busy, onSaved, onBusy, onDirty }: {
  classrooms: Room[]
  year: string
  term: number
  locked: boolean
  busy: boolean
  onDirty?: (value: boolean) => void
  onSaved: () => Promise<void>
  onBusy: (value: boolean) => void
}) {
  const { saveTimetableClassrooms } = useScheduleOperations()


  const levels = useMemo(() => [...new Set([...SCHOOL_LEVEL_GROUPS.primary,...SCHOOL_LEVEL_GROUPS.secondary].flatMap(group=>group.levels).filter(isTimetableClassroom))], [])
  const stored=useMemo(()=>namesByLevel(classrooms,levels),[classrooms,levels])
  const saved = useMemo(() => namesByLevel(classrooms.filter(scheduleRoomEnabled), levels), [classrooms, levels])
  const signature = JSON.stringify(saved)
  const [edited, setEdited] = useState({source:signature,values:saved})
  const draft = edited.source === signature ? edited.values : saved
  const setDraft = (change:(current:Record<string,string[]>)=>Record<string,string[]>) => {setSaveStatus('idle');setEdited(current=>({source:signature,values:change(current.source===signature?current.values:saved)}))}
  const [active, setActive] = useState(levels.find(level => saved[level]?.length) || 'ป.1')
  const [band, setBand] = useState<PeriodBand>(periodBand(classrooms[0]?.level||'')||'primary')
  const [error, setError] = useState('')
  const [saveStatus,setSaveStatus]=useState<'idle'|'saving'|'saved'|'error'|'refresh-error'>('idle')
  const saving=useRef(false)
  const names = draft[active] || []
  const dirty = JSON.stringify(draft) !== signature
  usePendingScheduleEditor('classrooms',{step:1,label:'ชั้นและห้องเรียน',dirty,save})

  useEffect(()=>{onDirty?.(dirty);return()=>onDirty?.(false)},[dirty,onDirty])

  function openLevel(level: string, open: boolean) {
    setError('')
    setDraft(current => ({ ...current, [level]: open ? (current[level]?.length ? current[level] : stored[level]?.length?stored[level]:['1']) : [] }))
  }
  function setCount(level: string, count: number) {
    const nextCount = Math.max(1, Math.min(30, count))
    setError('')
    setDraft(current => {
      const next = (current[level] || []).slice(0, nextCount)
      while (next.length < nextCount) {
        const suggestion = stored[level]?.[next.length]||String(next.length + 1)
        next.push(next.some(name => name.trim().toLowerCase() === suggestion.toLowerCase()) ? '' : suggestion)
      }
      return { ...current, [level]: next }
    })
  }
  function rename(level: string, index: number, value: string) {
    setError('')
    setDraft(current => ({ ...current, [level]: (current[level] || []).map((name, item) => item === index ? value : name) }))
  }
  async function save() {
    if (locked || busy || saving.current) return false
    const payload = levels.map(level => ({ level, names: (draft[level] || []).map(name => name.trim()) }))
    if (payload.some(row => row.names.some(name => !name))) { setError('กรอกชื่อห้องให้ครบ');setSaveStatus('error');return false }
    let committed=saveStatus==='refresh-error'
    saving.current=true;setSaveStatus('saving');setError('')
    onBusy(true)
    try {
      if(!committed){const result = await saveTimetableClassrooms(year, term, payload);if (result.error) throw Error(result.error);committed=true}
      setError('')
      await onSaved()
      const values=Object.fromEntries(payload.map(row=>[row.level,row.names]))
      setEdited({source:JSON.stringify(values),values});setSaveStatus('saved')
      onDirty?.(false)
      return true
    } catch (cause) {
      const detail=cause instanceof Error?cause.message:'กรุณาลองใหม่'
      setError(committed?`บันทึกชั้นเรียนแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ · ${detail}`:detail)
      setSaveStatus(committed?'refresh-error':'error');return false
    } finally { saving.current=false;onBusy(false) }
  }

  return <section className="prep-classrooms">
    <h2>กำหนดชั้นเรียน</h2>
    <p>เลือกชั้นที่เปิดสอน จำนวนห้อง และชื่อที่แสดง · ปิดห้องแล้วเก็บรายวิชาและตารางเดิมไว้ เปิดกลับมาใช้ต่อได้</p>
    <div className="schedule-clock-tabs" role="group" aria-label="ช่วงชั้นที่เปิดสอน">{PERIOD_BANDS.map(item=><button key={item.id} type="button" disabled={busy||locked} aria-pressed={band===item.id} onClick={()=>{setBand(item.id);setActive(levels.find(level=>periodBand(level)===item.id)||'')}}><strong>{item.label}</strong><small>{item.grades} · {levels.filter(level=>periodBand(level)===item.id).reduce((sum,level)=>sum+(draft[level]?.length||0),0)} ห้อง</small></button>)}</div>
    <div className="prep-checks"><button type="button" disabled={busy||locked} onClick={()=>{setError('');setDraft(current=>({...current,...Object.fromEntries(levels.filter(level=>periodBand(level)===band).map(level=>[level,current[level]?.length?current[level]:['1']]))}))}}>เปิดทุกชั้นในช่วงนี้ ชั้นละ 1 ห้อง</button><small>ห้องที่ตั้งไว้แล้วคงจำนวนและชื่อเดิม</small></div>
    <fieldset disabled={busy||locked} style={{border:0,padding:0,minWidth:0}}><div className="prep-subject-levels" role="group" aria-label="ระดับชั้น">
      {levels.filter(level=>periodBand(level)===band).map(level => <button key={level} type="button" aria-pressed={level === active} onClick={() => setActive(level)}>{level}<small>{(draft[level] || []).length ? `${(draft[level] || []).length} ห้อง` : 'ปิด'}</small></button>)}
    </div>
    {active && <div className="prep-room-editor">
      <div className="prep-room-editor-bar">
        <strong>{active}</strong>
        <button type="button" onClick={() => openLevel(active, names.length === 0)}>{names.length ? 'ปิดชั้นนี้' : 'เปิดชั้นนี้'}</button>
        {names.length > 0 && <>
          <button type="button" disabled={names.length <= 1} onClick={() => setCount(active, names.length - 1)}>ปิดห้องสุดท้าย</button>
          <span>{names.length} ห้อง</span>
          <button type="button" disabled={names.length >= 30} onClick={() => setCount(active, names.length + 1)}>เพิ่มห้อง</button>
        </>}
      </div>
      {names.length > 0 && <div className="prep-room-names">{names.map((name, index) => <label key={`${active}-${index}`}><span>{active}/</span><input value={name} maxLength={20} aria-label={`ชื่อห้อง ${active} ลำดับ ${index + 1}`} onChange={event => rename(active, index, event.target.value)} /></label>)}</div>}
      {names.length === 0 && <p>ชั้นนี้ปิดอยู่ ไม่นำมาจัดตาราง ข้อมูลเดิมยังเก็บไว้ กดเปิดชั้นนี้เพื่อนำกลับมา</p>}
    </div>}
    </fieldset>
    {error && <p className="prep-error" role="alert">{error}</p>}
    {locked && <p className="prep-notice">บันทึกหรือยกเลิกข้อมูลที่กำลังแก้ในขั้นอื่นก่อน</p>}
    <div className="prep-persist-actions"><p className={`prep-persist-state is-${saveStatus==='saving'?'saving':dirty?'dirty':saveStatus==='saved'?'saved':'idle'}`} role="status" aria-live="polite">{saveStatus==='saving'?'กำลังบันทึกชั้นเรียน…':saveStatus==='refresh-error'?'บันทึกแล้ว · ยังโหลดข้อมูลล่าสุดไม่สำเร็จ':dirty?(saveStatus==='error'?'ยังบันทึกไม่สำเร็จ · ข้อมูลที่แก้ยังอยู่':'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก'):saveStatus==='saved'?'✓ บันทึกชั้นเรียนเรียบร้อยแล้ว':classrooms.length?'✓ ข้อมูลตรงกับที่บันทึกไว้':'ยังไม่ได้กำหนดห้องเรียน'}</p><button type="button" className="prep-primary" disabled={busy || locked || (!dirty&&saveStatus!=='refresh-error')} onClick={() => void save()}>{saveStatus==='saving'?'กำลังบันทึก…':saveStatus==='refresh-error'?'โหลดข้อมูลล่าสุด':'บันทึกชั้นเรียน'}</button></div>
  </section>
}
