'use client'

import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {FiPlus,FiSearch,FiCheckCircle,FiAlertTriangle,FiUsers,FiEdit2,FiTrash2,FiDownload} from 'react-icons/fi'
import {useScheduleGuard,useScheduleOperations,useScheduleServices} from './ScheduleServices'
import {currentScheduleSemester,periodTimeLabel,type PeriodTimeRow} from '@/lib/schedule-helpers'
import {indexSubstituteAvailability,validateSubstituteRoster,SUBSTITUTE_LEAVE_TYPES,type SubstituteRosterEntry as Entry,type SubstituteBusy} from '@/lib/substitute-roster'
import {directorDisplayName} from '@/lib/school-director'
import {buildSubstitutePdf} from '@/lib/jspdf-substitute'
import AppAlertModal from '@/components/AppAlertModal'
import SubstituteSavedHistory from './SubstituteSavedHistory'
import type {SubstituteHistoryRecord} from '@/lib/substitute-history'
import './substitute-roster.css'

type Teacher={id:string;prefix:string;full_name:string}
type Year={id:string;year_be:number;is_active:boolean}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const rowKey=(row:Entry)=>[row.absent_teacher_id,row.period,row.classroom_id].join(':')

export default function SubstituteScheduleEntry(){
  const {fetchScheduleInit,fetchPeriodTimes,fetchSubstituteDay,loadSubstituteRosterSlots,saveSubstituteRoster,deleteSubstituteRosterEntries,fetchSubstitutePdfContext}=useScheduleOperations()
  const {local}=useScheduleServices()
  const [years,setYears]=useState<Year[]>([]),[teachers,setTeachers]=useState<Teacher[]>([]),[periods,setPeriods]=useState<PeriodTimeRow[]>([])
  const [year,setYear]=useState(''),[term,setTerm]=useState(String(currentScheduleSemester())),[date,setDate]=useState(today)
  const [loading,setLoading]=useState(true),[working,setWorking]=useState(''),[loadingDay,setLoadingDay]=useState(false),[loadedKey,setLoadedKey]=useState('')
  const [dayId,setDayId]=useState(''),[dayLabel,setDayLabel]=useState(''),[busy,setBusy]=useState<SubstituteBusy[]>([]),[rooms,setRooms]=useState<{id:string;label:string}[]>([])
  const [dayNames,setDayNames]=useState<Record<string,string>>({}),[entries,setEntries]=useState<Entry[]>([]),[original,setOriginal]=useState<Entry[]>([]),[dirty,setDirty]=useState(false)
  const [selected,setSelected]=useState<string[]>([]),[teacherSearch,setTeacherSearch]=useState(''),[leaveType,setLeaveType]=useState('ลาป่วย')
  const [alert,setAlert]=useState<{type:'success'|'error';title:string;message?:string}|null>(null)
  const [deletion,setDeletion]=useState<{ids:string[];label:string}|null>(null),[editorRow,setEditorRow]=useState<Entry|null>(null),[editorError,setEditorError]=useState('')
  const [groupFilter,setGroupFilter]=useState('')
  const [pendingSave,setPendingSave]=useState<Entry[]|null>(null)
  const [historyRevision,setHistoryRevision]=useState(0),[savedDeletion,setSavedDeletion]=useState<SubstituteHistoryRecord|null>(null),[editing,setEditing]=useState(true)
  const workbench=useRef<HTMLDetailsElement>(null),focusEdit=useRef(false)
  const request=useRef(0),operation=useRef(false),editor=useRef<HTMLDialogElement>(null),confirmation=useRef<HTMLDialogElement>(null)
  const names=useMemo(()=>({...Object.fromEntries(teachers.map(teacher=>[teacher.id,`${teacher.prefix||''} ${teacher.full_name}`.trim()])),...dayNames}),[teachers,dayNames])
  const key=`${year}:${term}:${date}`,blocked=!!working||loadingDay||loadedKey!==key||!date||!year
  const regularPeriods=periods.filter(row=>!row.is_break)
  const editorOpen=editorRow!==null,confirmOpen=pendingSave!==null
  useScheduleGuard(dirty,!!working||loadingDay)
  useEffect(()=>{if(editorOpen)editor.current?.showModal();else editor.current?.close()},[editorOpen])
  useEffect(()=>{if(confirmOpen)confirmation.current?.showModal();else confirmation.current?.close()},[confirmOpen])
  useEffect(()=>{let active=true;void(async()=>{try{
    const [data,time]=await Promise.all([fetchScheduleInit(),fetchPeriodTimes()]);if(!active)return
    setYears(data.years);setTeachers(data.teachers);setPeriods(time.times);setTerm(String(data.defaultSemester))
    setYear(data.years.find(row=>row.is_active)?.id||data.years[0]?.id||'');setSelected(data.teachers[0]?[data.teachers[0].id]:[])
  }catch(error){if(active)setAlert({type:'error',title:'โหลดไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}finally{if(active)setLoading(false)}})();return()=>{active=false}},[fetchScheduleInit,fetchPeriodTimes])
  const loadDay=useCallback(async()=>{
    const ticket=++request.current;setLoadingDay(true)
    try{const data=await fetchSubstituteDay(date,year,Number(term));if(ticket!==request.current)return false
      setDayId(data.day?.id||'');setDayLabel(data.day_label||'');setBusy(data.busy);setRooms(data.classrooms);setDayNames(data.teacher_names)
      setEntries(data.entries as Entry[]);setOriginal(data.entries as Entry[]);setDirty(false);setLoadedKey(`${year}:${term}:${date}`);setHistoryRevision(value=>value+1);return true
    }catch(error){if(ticket===request.current){setLoadedKey('');setAlert({type:'error',title:'โหลดตารางสอนแทนไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}return false}
    finally{if(ticket===request.current)setLoadingDay(false)}
  },[fetchSubstituteDay,date,year,term])
  useEffect(()=>{const counter=request;let cancelled=false;void Promise.resolve().then(()=>{if(!cancelled&&year&&date)return loadDay()});return()=>{cancelled=true;counter.current++}},[loadDay,year,date])
  useEffect(()=>{if(editing&&loadedKey===key&&focusEdit.current){focusEdit.current=false;workbench.current?.focus({preventScroll:true});workbench.current?.scrollIntoView({block:'start',behavior:'instant'})}},[editing,loadedKey,key])
  const conflictFor=useMemo(()=>indexSubstituteAvailability(entries,busy,names),[entries,busy,names])
  const reasons=(row:Entry)=>row.substitute_teacher_id?conflictFor(row.substitute_teacher_id,row):[]
  const conflicts=entries.filter(row=>reasons(row).length>0),unassigned=entries.filter(row=>!row.substitute_teacher_id)
  const visibleTeachers=teachers.filter(teacher=>names[teacher.id]?.toLocaleLowerCase().includes(teacherSearch.trim().toLocaleLowerCase()))
  const absentIds=[...new Set(entries.map(row=>row.absent_teacher_id))].sort((a,b)=>(names[a]||'').localeCompare(names[b]||'','th'))
  function change(id:string,patch:Partial<Entry>){setEntries(current=>current.map(row=>row.id===id?{...row,...patch,override_conflicts:false,conflict_details:[]}:row));setDirty(true)}
  async function importRows(){
    if(blocked||operation.current||!selected.length)return
    operation.current=true;setWorking('กำลังดึงคาบของครูที่เลือก…')
    try{const data=await loadSubstituteRosterSlots(date,year,selected,Number(term)),seen=new Set(entries.map(rowKey))
      const added:Entry[]=data.slots.flatMap(slot=>{const row:Entry={...slot,id:crypto.randomUUID(),substitute_teacher_id:null,leave_type:leaveType,note:null,override_conflicts:false,conflict_details:[]};if(seen.has(rowKey(row)))return [];seen.add(rowKey(row));return [row]})
      if(added.length){setEntries(current=>[...current,...added]);setDirty(true)}
      setAlert({type:added.length?'success':'error',title:added.length?`เพิ่ม ${added.length} คาบในร่างแล้ว`:'ไม่มีคาบใหม่ให้เพิ่ม',message:[`เลือกครู ${selected.length} คน · รายการเดิมและครูสอนแทนเดิมยังคงอยู่`,data.missing.length?'ไม่พบคาบของ '+data.missing.map(id=>names[id]||id).join(', ')+' สามารถใช้ปุ่มเพิ่มรายการเองได้':'',added.length?'เลือกครูสอนแทน แล้วกดบันทึกทั้งหมด':''].filter(Boolean).join('\n')})
    }catch(error){setAlert({type:'error',title:'นำเข้าไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}
    finally{operation.current=false;setWorking('')}
  }
  function openEditor(row?:Entry){setEditorError('');setEditorRow(row?{...row}:{id:crypto.randomUUID(),absent_teacher_id:selected[0]||teachers[0]?.id||'',period:regularPeriods[0]?.period||1,class_subject_id:null,classroom_id:rooms[0]?.id||null,subject_label:'',room_label:rooms[0]?.label||null,substitute_teacher_id:null,leave_type:leaveType,note:null})}
  function applyEditor(){
    if(!editorRow)return
    const row={...editorRow,subject_label:editorRow.subject_label?.trim()||null,room_label:rooms.find(room=>room.id===editorRow.classroom_id)?.label||null,override_conflicts:false,conflict_details:[]}
    const next=entries.some(item=>item.id===row.id)?entries.map(item=>item.id===row.id?row:item):[...entries,row]
    try{validateSubstituteRoster(next,new Set(Object.keys(names)),new Set(rooms.map(room=>room.id)),new Set(regularPeriods.map(period=>period.period)));setEntries(next);setDirty(true);setEditorRow(null)}catch(error){setEditorError(error instanceof Error?error.message:'ข้อมูลไม่ถูกต้อง')}
  }
  function prepareSave(){
    if(blocked||operation.current)return
    try{
      validateSubstituteRoster(entries,new Set(Object.keys(names)),new Set(rooms.map(room=>room.id)),new Set(regularPeriods.map(row=>row.period)))
      const prepared=entries.map(row=>{const detail=reasons(row);return {...row,override_conflicts:detail.length>0,conflict_details:detail}})
      if(conflicts.length)setPendingSave(prepared);else void persist(prepared)
    }catch(error){setAlert({type:'error',title:'กรุณาตรวจรายการก่อนบันทึก',message:error instanceof Error?error.message:'ข้อมูลไม่ครบ'})}
  }
  async function persist(rows:Entry[]){
    if(blocked||operation.current)return
    operation.current=true;setPendingSave(null);setWorking('กำลังบันทึกตารางสอนแทนทั้งหมด…')
    try{const result=await saveSubstituteRoster(dayId,original,rows);if(result.error)throw Error(result.error)
      setEntries(rows);setOriginal(rows);setDirty(false)
      setEditing(false);if(await loadDay())setAlert({type:'success',title:'บันทึกตารางสอนแทนทั้งหมดแล้ว',message:`ครูที่ลา ${new Set(rows.map(row=>row.absent_teacher_id)).size} คน · ${rows.length} รายการ · ยังรอครูสอนแทน ${rows.filter(row=>!row.substitute_teacher_id).length} รายการ`})
    }catch(error){setAlert({type:'error',title:'บันทึกไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}
    finally{operation.current=false;setWorking('')}
  }
  function editSaved(record:SubstituteHistoryRecord){
    if(blocked||dirty)return
    setGroupFilter(record.absentId);setSelected([record.absentId]);setEditing(true);focusEdit.current=true
    if(date===record.day.date)void loadDay();else setDate(record.day.date)
  }
  async function deleteSaved(){
    const record=savedDeletion
    if(!record||blocked||dirty||operation.current)return
    operation.current=true;setSavedDeletion(null);setWorking('กำลังลบรายการที่บันทึกแล้ว…')
    try{
      const result=await deleteSubstituteRosterEntries(record.day.id,record.day.entries,record.entries.map(row=>row.id))
      if(result.error)throw Error(result.error)
      setHistoryRevision(value=>value+1)
      if(date===record.day.date&&!await loadDay())return
      setAlert({type:'success',title:'ลบรายการสอนแทนแล้ว',message:'ลบเฉพาะรายการของครูที่เลือก รายการครูอื่นและตารางเรียนยังคงอยู่'})
    }catch(error){setAlert({type:'error',title:'ลบไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}
    finally{operation.current=false;setWorking('')}
  }
  async function pdf(record?:SubstituteHistoryRecord,historyNames:Record<string,string>={}){
    const rows=record?.entries||original,pdfDate=record?.day.date||date
    if(blocked||dirty||!rows.length||operation.current)return
    operation.current=true;setWorking('กำลังสร้าง PDF…')
    try{const context=await fetchSubstitutePdfContext(),result=await buildSubstitutePdf({schoolName:context.school?.name||'โรงเรียน',logoUrl:context.school?.logo_url,date:pdfDate,year:years.find(row=>row.id===year)?.year_be||0,term,academicHead:context.academicHead,director:directorDisplayName(context.school,''),times:context.periodTimes,teachers,teacherNames:{...names,...historyNames},entries:rows.map(row=>({...row,note:[row.note,row.override_conflicts?'ยืนยันสอนแทนทั้งที่ไม่ว่าง (รายละเอียดในระบบ)':''].filter(Boolean).join(' · ')||null}))})
      const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=result.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)
    }catch(error){setAlert({type:'error',title:'สร้าง PDF ไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}
    finally{operation.current=false;setWorking('')}
  }
  if(loading)return <p className="sub-roster-loading" role="status">กำลังโหลดตารางสอนแทน…</p>
  return <div className="sub-roster schedule-workspace">
    <header className="sub-roster-head"><div><span className="sub-roster-eyebrow">จัดการครูและคาบประจำวัน</span><h1>ตารางสอนแทน</h1><p>เลือกครูที่ลาหลายคน ตรวจเวลาว่าง แล้วบันทึกพร้อมกันทั้งวัน</p></div><span className="sub-roster-storage">{local?'บันทึกในอุปกรณ์นี้':'ข้อมูลของโรงเรียน'}</span></header>
    <section className="sub-roster-filters" aria-label="เลือกวันและภาคเรียน">
      <label>ปีการศึกษา<select aria-label="ปีการศึกษา" disabled={!!working||dirty} value={year} onChange={event=>setYear(event.target.value)}>{years.map(row=><option key={row.id} value={row.id}>พ.ศ. {row.year_be}</option>)}</select></label>
      <label>ภาคเรียน<select aria-label="ภาคเรียน" disabled={!!working||dirty} value={term} onChange={event=>setTerm(event.target.value)}><option value="1">ภาคเรียนที่ 1</option><option value="2">ภาคเรียนที่ 2</option></select></label>
      <label>วันที่<input aria-label="วันที่สอนแทน" type="date" disabled={!!working||dirty} value={date} onChange={event=>{setEditing(true);setGroupFilter('');setDate(event.target.value)}}/></label>
      <div className="sub-roster-day sub-day-label">{date?new Intl.DateTimeFormat('th-TH',{dateStyle:'long',timeZone:'Asia/Bangkok'}).format(new Date(date+'T12:00:00+07:00')):'เลือกวันที่'}<small>{dayLabel?'วัน'+dayLabel:''}</small></div>
    </section>
    {!year&&<p role="status">ยังไม่มีปีการศึกษา กรุณาตั้งค่าปีการศึกษาก่อนใช้งาน</p>}
    {!!working||loadingDay?<p className="sub-roster-loading" role="status">{working||'กำลังโหลดข้อมูลของวันที่เลือก…'}</p>:null}
    <details ref={workbench} tabIndex={-1} className="sub-roster-workbench" open={editing} onToggle={event=>setEditing(event.currentTarget.open)}><summary><span><strong>{editing?'จัดรายการสอนแทนของวันที่เลือก':'แก้ไขหรือเพิ่มรายการของวันที่เลือก'}</strong><small>{original.length?`บันทึกแล้ว ${original.length} รายการ`:'เลือกครูที่ลา แล้วกำหนดครูสอนแทน'}</small></span><FiEdit2 aria-hidden/></summary><div className="sub-roster-workbench-body">
    <section className="sub-roster-picker" aria-labelledby="sub-absent-title">
      <div className="sub-roster-section-head"><div><h2 id="sub-absent-title"><FiUsers aria-hidden/>ครูที่ลา / ไม่อยู่</h2><p>เลือกได้หลายคนในวันเดียว เช่น เลือก 5 คนแล้วนำเข้าคาบพร้อมกัน</p></div><strong>เลือก {selected.length} คน</strong></div>
      <div className="sub-roster-picker-tools"><label className="sub-roster-search"><FiSearch aria-hidden/><input type="search" aria-label="ค้นหาครูที่ลา" placeholder="ค้นหาชื่อครู" value={teacherSearch} onChange={event=>setTeacherSearch(event.target.value)}/></label><button type="button" disabled={blocked} onClick={()=>setSelected(current=>[...new Set([...current,...visibleTeachers.map(teacher=>teacher.id)])])}>เลือกผลค้นหาทั้งหมด</button><button type="button" disabled={blocked||!selected.length} onClick={()=>setSelected([])}>ล้างการเลือก</button></div>
      <div className="sub-roster-teachers">{visibleTeachers.map(teacher=><label key={teacher.id} className={selected.includes(teacher.id)?'is-selected':''}><input type="checkbox" disabled={blocked} checked={selected.includes(teacher.id)} onChange={()=>setSelected(current=>current.includes(teacher.id)?current.filter(id=>id!==teacher.id):[...current,teacher.id])}/><span>{names[teacher.id]}</span>{entries.some(row=>row.absent_teacher_id===teacher.id)&&<small>มีรายการแล้ว</small>}</label>)}{!visibleTeachers.length&&<p>ไม่พบครูที่ค้นหา</p>}</div>
      <div className="sub-roster-import sub-actions"><label>ประเภทการลา<select aria-label="ประเภทการลาที่นำเข้า" disabled={blocked} value={leaveType} onChange={event=>setLeaveType(event.target.value)}>{SUBSTITUTE_LEAVE_TYPES.map(type=><option key={type}>{type}</option>)}</select></label><button type="button" className="sub-roster-primary" disabled={blocked||!selected.length} onClick={()=>void importRows()}>นำเข้าจากตารางเรียน ({selected.length} คน)</button><button type="button" disabled={blocked||!rooms.length||!teachers.length} onClick={()=>openEditor()}><FiPlus aria-hidden/>เพิ่มรายการเอง</button></div>
    </section>
    <div className="sub-roster-overview" aria-live="polite"><span><b>{absentIds.length}</b> ครูที่ลา</span><span><b>{entries.length}</b> รายการ</span><span><FiCheckCircle aria-hidden/><b>{entries.length-unassigned.length}</b> กำหนดครูแล้ว</span><span className={conflicts.length?'has-conflicts':''}><FiAlertTriangle aria-hidden/><b>{conflicts.length}</b> รายการไม่ว่าง</span></div>

    <div className="sub-roster-list-head"><h2>คาบที่ต้องจัดสอนแทน</h2><button type="button" disabled={!!working||loadingDay||dirty||!year||!date} onClick={()=>void loadDay()}>ตรวจข้อมูลล่าสุด</button></div>
    {(entries.length>0||original.length>0||dirty)&&<div className="sub-roster-actions"><button type="button" disabled={blocked||dirty||!original.length} onClick={()=>void pdf()}><FiDownload aria-hidden/>ดาวน์โหลด PDF</button>{dirty&&<button type="button" disabled={blocked} onClick={()=>{setEntries(original);setDirty(false)}}>ยกเลิกการแก้ไข</button>}<button type="button" className="sub-roster-danger" disabled={blocked||!entries.length} onClick={()=>setDeletion({ids:entries.map(row=>row.id),label:'ทุกรายการในวันนี้'})}>ลบทั้งหมดของวันนี้</button></div>}
    {absentIds.length>1&&<div className="sub-roster-group-filter" role="group" aria-label="แสดงรายการของครู"><button type="button" aria-pressed={!groupFilter||!absentIds.includes(groupFilter)} onClick={()=>setGroupFilter('')}>ครูทุกคน ({absentIds.length})</button>{absentIds.map(id=><button type="button" key={id} aria-pressed={groupFilter===id} onClick={()=>setGroupFilter(id)}>{names[id]}</button>)}</div>}
    {!entries.length?<div className="sub-roster-empty">ยังไม่มีรายการในร่าง เลือกครูที่ลาแล้วนำเข้าคาบ หรือเพิ่มรายการเองได้</div>:(groupFilter&&absentIds.includes(groupFilter)?[groupFilter]:absentIds).map(absentId=>{
      const group=entries.filter(row=>row.absent_teacher_id===absentId).sort((a,b)=>a.period-b.period||(a.room_label||'').localeCompare(b.room_label||'','th'))
      return <section className="sub-roster-group" key={absentId}><div className="sub-roster-group-head sub-group-head"><div><h3>{names[absentId]||'ครูเจ้าของคาบ'}</h3><p>{group.length} รายการ · รอครู {group.filter(row=>!row.substitute_teacher_id).length} · ไม่ว่าง {group.filter(row=>reasons(row).length).length}</p></div><button type="button" className="sub-roster-danger" disabled={blocked} onClick={()=>setDeletion({ids:group.map(row=>row.id),label:'ทุกรายการของ '+(names[absentId]||'ครูคนนี้')})}>ลบรายการครูคนนี้</button></div>
        <div className="sub-roster-table-wrap"><table className="sub-roster-table sub-table"><thead><tr><th>คาบ / ห้อง / วิชา</th><th>ประเภทการลา</th><th>ครูสอนแทนและเวลาว่าง</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead><tbody>{group.map(row=>{
          const detail=reasons(row),candidates=teachers.filter(teacher=>teacher.id!==row.absent_teacher_id).map(teacher=>({teacher,detail:conflictFor(teacher.id,row)})).sort((a,b)=>Number(a.detail.length>0)-Number(b.detail.length>0)||(names[a.teacher.id]||'').localeCompare(names[b.teacher.id]||'','th'))
          return <tr key={row.id} data-entry-id={row.id}><td data-label="คาบ / ห้อง / วิชา"><strong>คาบ {row.period} · {row.room_label}</strong><small>{periodTimeLabel(periods,row.period)}</small><span>{row.subject_label}</span></td><td data-label="ประเภทการลา"><select aria-label={`ประเภทการลา ${row.id}`} disabled={blocked} value={row.leave_type} onChange={event=>change(row.id,{leave_type:event.target.value})}>{[...new Set([...SUBSTITUTE_LEAVE_TYPES,row.leave_type])].map(type=><option key={type}>{type}</option>)}</select></td>
            <td data-label="ครูสอนแทน"><select className="sub-roster-assignee" aria-label={`ครูสอนแทน ${row.id}`} disabled={blocked} value={row.substitute_teacher_id||''} onChange={event=>change(row.id,{substitute_teacher_id:event.target.value||null})}><option value="">ยังไม่กำหนดครู</option>{row.substitute_teacher_id&&!candidates.some(item=>item.teacher.id===row.substitute_teacher_id)&&<option value={row.substitute_teacher_id}>{names[row.substitute_teacher_id]||'ครูเดิม'} · ตรวจข้อมูลครู</option>}{[false,true].map(isBusy=><optgroup key={String(isBusy)} label={isBusy?'ไม่ว่าง · ยังเลือกได้เมื่อยืนยัน':'ว่างในคาบนี้'}>{candidates.filter(item=>!!item.detail.length===isBusy).map(({teacher,detail})=><option key={teacher.id} value={teacher.id}>{names[teacher.id]}{detail.length?' · ไม่ว่าง: '+detail.join(' / '):' · ว่าง'}</option>)}</optgroup>)}</select>
              {row.substitute_teacher_id?<div className={'sub-roster-availability '+(detail.length?'is-busy':'is-free')}>{detail.length?<><strong>ไม่ว่าง{row.override_conflicts?' · เคยยืนยันไว้แล้ว':''}</strong><ul>{detail.map(text=><li key={text}>{text}</li>)}</ul></>:<><FiCheckCircle aria-hidden/>ว่างในคาบนี้</>}</div>:<small>แสดงครูที่ว่างก่อน ครูที่ไม่ว่างยังเลือกได้</small>}</td>
            <td data-label="หมายเหตุ"><input aria-label={`หมายเหตุ ${row.id}`} disabled={blocked} value={row.note||''} maxLength={1000} placeholder="ระบุเพิ่มเติม" onChange={event=>change(row.id,{note:event.target.value||null})}/></td><td data-label="จัดการ"><div className="sub-roster-row-actions"><button type="button" disabled={blocked} onClick={()=>openEditor(row)}><FiEdit2 aria-hidden/>แก้ไข</button><button type="button" disabled={blocked} className="sub-roster-danger" onClick={()=>setDeletion({ids:[row.id],label:`คาบ ${row.period} · ${row.room_label} · ${row.subject_label}`})}><FiTrash2 aria-hidden/>ลบคาบ</button></div></td></tr>
        })}</tbody></table></div></section>
    })}
    {(entries.length>0||original.length>0||dirty)&&<footer className="sub-roster-footer sub-footer"><div><strong>{dirty?'มีการเปลี่ยนแปลงที่ยังไม่บันทึก':'ข้อมูลที่บันทึกแล้ว'}</strong><small>{unassigned.length} รายการยังไม่มีครู · {conflicts.length} รายการไม่ว่าง</small></div><button type="button" className="sub-roster-primary" disabled={blocked} onClick={prepareSave}>{working?'กำลังดำเนินการ…':'บันทึกทั้งหมด'}</button></footer>}
    </div></details>
    <SubstituteSavedHistory year={year} term={Number(term)} revision={historyRevision} disabled={blocked||dirty} names={names} onEdit={editSaved} onPdf={(record,teacherNames)=>void pdf(record,teacherNames)} onDelete={setSavedDeletion}/>
    <dialog ref={editor} className="sub-roster-dialog" aria-labelledby="sub-editor-title" onCancel={()=>setEditorRow(null)} onClose={()=>setEditorRow(null)}><form onSubmit={event=>{event.preventDefault();applyEditor()}}><header><h2 id="sub-editor-title">{entries.some(row=>row.id===editorRow?.id)?'แก้ไขรายการสอนแทน':'เพิ่มรายการสอนแทน'}</h2><button type="button" onClick={()=>setEditorRow(null)}>ปิด</button></header>{editorRow&&<div className="sub-roster-editor-grid"><label>ครูเจ้าของคาบ<select aria-label="ครูเจ้าของคาบ" value={editorRow.absent_teacher_id} onChange={event=>setEditorRow({...editorRow,absent_teacher_id:event.target.value,class_subject_id:null})}>{teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{names[teacher.id]}</option>)}</select></label><label>คาบเรียน<select aria-label="คาบเรียน" value={editorRow.period} onChange={event=>setEditorRow({...editorRow,period:Number(event.target.value)})}>{regularPeriods.map(period=><option key={period.period} value={period.period}>คาบ {period.period} · {periodTimeLabel(periods,period.period)}</option>)}</select></label><label>ชั้น / ห้อง<select aria-label="ชั้นและห้อง" value={editorRow.classroom_id||''} onChange={event=>setEditorRow({...editorRow,classroom_id:event.target.value,class_subject_id:null})}>{rooms.map(room=><option key={room.id} value={room.id}>{room.label}</option>)}</select></label><label>รายวิชา<input aria-label="รายวิชาสอนแทน" required maxLength={300} value={editorRow.subject_label||''} onChange={event=>setEditorRow({...editorRow,subject_label:event.target.value,class_subject_id:null})}/></label><label>ประเภทการลา<select value={editorRow.leave_type} onChange={event=>setEditorRow({...editorRow,leave_type:event.target.value})}>{[...new Set([...SUBSTITUTE_LEAVE_TYPES,editorRow.leave_type])].map(type=><option key={type}>{type}</option>)}</select></label><label>หมายเหตุ<input maxLength={1000} value={editorRow.note||''} onChange={event=>setEditorRow({...editorRow,note:event.target.value||null})}/></label>{editorError&&<p className="sub-roster-error" role="alert">{editorError}</p>}</div>}<footer><button type="button" onClick={()=>setEditorRow(null)}>ยกเลิก</button><button type="submit" className="sub-roster-primary">ใช้รายการนี้</button></footer></form></dialog>
    <dialog ref={confirmation} className="sub-roster-dialog" aria-labelledby="sub-conflict-title" onCancel={()=>setPendingSave(null)} onClose={()=>setPendingSave(null)}><header><div><h2 id="sub-conflict-title">ยืนยันสอนแทนทั้งที่ไม่ว่าง?</h2><p>ตรวจรายละเอียดก่อนบันทึก ครูเหล่านี้มีภาระในเวลาที่เลือก</p></div></header><div className="sub-roster-confirm-list">{pendingSave?.filter(row=>row.conflict_details?.length).map(row=><article key={row.id}><strong>{names[row.substitute_teacher_id||'']} · คาบ {row.period}</strong><p>แทน {names[row.absent_teacher_id]} · {row.room_label} · {row.subject_label}</p><ul>{row.conflict_details?.map(text=><li key={text}>{text}</li>)}</ul></article>)}</div><footer><button type="button" onClick={()=>setPendingSave(null)}>กลับไปแก้ไข</button><button type="button" className="sub-roster-primary" disabled={!!working} onClick={()=>pendingSave&&void persist(pendingSave)}>ยืนยันบันทึกทั้งที่ไม่ว่าง</button></footer></dialog>
    {alert&&<AppAlertModal open autoCloseMs={0} type={alert.type} title={alert.title} message={alert.message} onClose={()=>setAlert(null)}/>}
    {savedDeletion&&<AppAlertModal open type="confirm" title="ลบรายการที่บันทึกแล้ว?" message={`${names[savedDeletion.absentId]||'ครูเจ้าของคาบ'} · ${savedDeletion.day.date} · ${savedDeletion.entries.length} รายการ จะลบเฉพาะครูคนนี้ในวันนี้`} confirmLabel="ยืนยันลบรายการ" cancelLabel="ยกเลิก" onClose={()=>setSavedDeletion(null)} onConfirm={()=>void deleteSaved()}/>}
    {deletion&&<AppAlertModal open type="confirm" title="ลบรายการสอนแทน?" message={`${deletion.label} (${deletion.ids.length} รายการ) จะนำออกจากร่าง แล้วกดบันทึกทั้งหมดเพื่อยืนยันการเปลี่ยนแปลง`} confirmLabel="ยืนยันลบ" cancelLabel="ยกเลิก" onClose={()=>setDeletion(null)} onConfirm={()=>{setEntries(current=>current.filter(row=>!deletion.ids.includes(row.id)));setDirty(true);setDeletion(null)}}/>}
  </div>
}
