'use client'
import {rosterPeriodClock,levelPeriodTimes} from '@/lib/schedule-period-profiles'

import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {FiPlus,FiSearch,FiCheckCircle,FiAlertTriangle,FiUsers,FiEdit2,FiTrash2,FiDownload,FiFileText,FiCalendar,FiRefreshCw,FiArrowLeft,FiX,FiInfo,FiLoader,FiSave} from 'react-icons/fi'
import {useScheduleGuard,useScheduleOperations,useScheduleServices} from './ScheduleServices'
import {currentScheduleSemester,periodTimeLabel,type PeriodTimeRow} from '@/lib/schedule-helpers'
import {indexSubstituteAvailability,substitutePdfWorkload,teachingPeriodCount,validateSubstituteRoster,SUBSTITUTE_LEAVE_TYPES,type SubstituteRosterEntry as Entry,type SubstituteBusy} from '@/lib/substitute-roster'
import {directorDisplayName} from '@/lib/school-director'
import {buildSubstitutePdf} from '@/lib/jspdf-substitute'
import AppAlertModal from '@/components/AppAlertModal'
import SubstituteSavedHistory from './SubstituteSavedHistory'
import {substituteDocumentNames} from '@/lib/substitute-document-model'
import type {SubstituteHistoryRecord} from '@/lib/substitute-history'
import './substitute-roster.css'

type Teacher={id:string;prefix:string;full_name:string}
type Year={id:string;year_be:number;is_active:boolean}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const rowKey=(row:Entry)=>[row.absent_teacher_id,row.period,row.classroom_id].join(':')

export default function SubstituteScheduleEntry(){
  const {fetchScheduleInit,fetchPeriodTimes,fetchSubstituteDay,fetchSubstituteStats,loadSubstituteRosterSlots,saveSubstituteRoster,deleteSubstituteRosterEntries,fetchSubstitutePdfContext}=useScheduleOperations()
  const {local}=useScheduleServices()
  const [years,setYears]=useState<Year[]>([]),[teachers,setTeachers]=useState<Teacher[]>([]),[periods,setPeriods]=useState<PeriodTimeRow[]>([])
  const [year,setYear]=useState(''),[term,setTerm]=useState(String(currentScheduleSemester())),[date,setDate]=useState(today)
  const [loading,setLoading]=useState(true),[working,setWorking]=useState(''),[loadingDay,setLoadingDay]=useState(false),[loadedKey,setLoadedKey]=useState('')
  const [dayId,setDayId]=useState(''),[dayLabel,setDayLabel]=useState(''),[busy,setBusy]=useState<SubstituteBusy[]>([]),[rooms,setRooms]=useState<{id:string;label:string}[]>([])
  const [dayNames,setDayNames]=useState<Record<string,string>>({}),[entries,setEntries]=useState<Entry[]>([]),[original,setOriginal]=useState<Entry[]>([]),[dirty,setDirty]=useState(false)
  const [availabilityWarning,setAvailabilityWarning]=useState('')
  const [download,setDownload]=useState<{url:string;fileName:string}|null>(null)
  const [notice,setNotice]=useState<{title:string;message:string}|null>(null)
  const [pickerOpen,setPickerOpen]=useState(true)
  const [selected,setSelected]=useState<string[]>([]),[teacherSearch,setTeacherSearch]=useState(''),[leaveType,setLeaveType]=useState('ลาป่วย')
  const [alert,setAlert]=useState<{type:'success'|'error';title:string;message?:string}|null>(null)
  const [deletion,setDeletion]=useState<{ids:string[];label:string}|null>(null),[editorRow,setEditorRow]=useState<Entry|null>(null),[editorError,setEditorError]=useState('')
  const [groupFilter,setGroupFilter]=useState('')
  const [historyRevision,setHistoryRevision]=useState(0),[savedDeletion,setSavedDeletion]=useState<SubstituteHistoryRecord|null>(null),[editing,setEditing]=useState(false)
  const workbench=useRef<HTMLElement>(null),focusEdit=useRef(false)
  const assignments=useRef<HTMLDivElement>(null),focusAssignments=useRef(false),focusHistory=useRef(false)
  const request=useRef(0),operation=useRef(false),editor=useRef<HTMLDialogElement>(null)
  const names=useMemo(()=>({...Object.fromEntries(teachers.map(teacher=>[teacher.id,`${teacher.prefix||''} ${teacher.full_name}`.trim()])),...dayNames}),[teachers,dayNames])
  const key=`${year}:${term}:${date}`,blocked=!!working||loadingDay||loadedKey!==key||!date||!year
  const regularPeriods=periods.filter(row=>!row.is_break)
  const editorOpen=editorRow!==null
  useScheduleGuard(dirty,!!working||loadingDay)
  useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url)},[download])
  useEffect(()=>{if(editorOpen)editor.current?.showModal();else editor.current?.close()},[editorOpen])
  useEffect(()=>{let active=true;void(async()=>{try{
    const [data,time]=await Promise.all([fetchScheduleInit(),fetchPeriodTimes()]);if(!active)return
    setYears(data.years);setTeachers(data.teachers);setPeriods(time.times);setTerm(String(data.defaultSemester))
    setYear(data.years.find(row=>row.is_active)?.id||data.years[0]?.id||'')
  }catch(error){if(active)setAlert({type:'error',title:'โหลดไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}finally{if(active)setLoading(false)}})();return()=>{active=false}},[fetchScheduleInit,fetchPeriodTimes])
  const loadDay=useCallback(async()=>{
    const ticket=++request.current;setLoadingDay(true)
    try{const data=await fetchSubstituteDay(date,year,Number(term));if(ticket!==request.current)return false
      setDayId(data.day?.id||'');setDayLabel(data.day_label||'');setBusy(data.busy);setRooms([...data.classrooms,...data.entries.filter(row=>row.classroom_id&&!data.classrooms.some(room=>room.id===row.classroom_id)).map(row=>({id:row.classroom_id!,label:row.room_label||'ห้องในเอกสาร'}))].filter((room,index,all)=>all.findIndex(item=>item.id===room.id)===index));setDayNames(data.teacher_names)
      setAvailabilityWarning(data.availability_warning||'');setEntries(data.entries as Entry[]);setOriginal(data.entries as Entry[]);setDirty(false);setLoadedKey(`${year}:${term}:${date}`);setHistoryRevision(value=>value+1);return true
    }catch(error){if(ticket===request.current){setLoadedKey('');setAlert({type:'error',title:'โหลดตารางสอนแทนไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}return false}
    finally{if(ticket===request.current)setLoadingDay(false)}
  },[fetchSubstituteDay,date,year,term])
  useEffect(()=>{const counter=request;let cancelled=false;void Promise.resolve().then(()=>{if(!cancelled&&year&&date)return loadDay()});return()=>{cancelled=true;counter.current++}},[loadDay,year,date])
  useEffect(()=>{if(editing&&loadedKey===key&&focusEdit.current){focusEdit.current=false;workbench.current?.focus({preventScroll:true});workbench.current?.scrollIntoView({block:'start',behavior:'instant'})}},[editing,loadedKey,key])
  useEffect(()=>{if(editing&&!pickerOpen&&!working&&focusAssignments.current){focusAssignments.current=false;assignments.current?.focus({preventScroll:true});assignments.current?.scrollIntoView({block:'start',behavior:'instant'})}},[editing,pickerOpen,working])
  useEffect(()=>{if(!editing&&focusHistory.current){focusHistory.current=false;const history=document.getElementById('substitute-saved-history');history?.focus({preventScroll:true});history?.scrollIntoView({block:'start',behavior:'instant'})}},[editing,historyRevision])
  const conflictFor=useMemo(()=>{const lookup=indexSubstituteAvailability(entries,busy,names);return (teacherId:string,row:Entry)=>availabilityWarning?['ยังตรวจเวลาว่างจากตารางปกติไม่ได้']:lookup(teacherId,row)},[entries,busy,names,availabilityWarning])
  const scheduledLoads=useMemo(()=>new Map(teachers.map(teacher=>[teacher.id,teachingPeriodCount(busy,teacher.id)])),[busy,teachers])
  const reasons=(row:Entry)=>row.substitute_teacher_id?conflictFor(row.substitute_teacher_id,row):[]
  const conflicts=entries.filter(row=>reasons(row).length>0),unassigned=entries.filter(row=>!row.substitute_teacher_id)
  const visibleTeachers=teachers.filter(teacher=>names[teacher.id]?.toLocaleLowerCase().includes(teacherSearch.trim().toLocaleLowerCase()))
  const absentIds=[...new Set(entries.map(row=>row.absent_teacher_id))].sort((a,b)=>(names[a]||'').localeCompare(names[b]||'','th'))
  function beginEdit(){if(blocked)return;setNotice(null);setGroupFilter('');setSelected([]);setPickerOpen(!original.length);focusEdit.current=true;setEditing(true)}
  function cancelEdit(){if(blocked)return;setEntries(original);setDirty(false);setGroupFilter('');focusHistory.current=true;setEditing(false);setNotice(null)}
  function change(id:string,patch:Partial<Entry>){setEntries(current=>current.map(row=>row.id===id?{...row,...patch,override_conflicts:false,conflict_details:[]}:row));setDirty(true)}
  async function importRows(){
    if(blocked||operation.current||!selected.length)return
    operation.current=true;setWorking('กำลังดึงคาบของครูที่เลือก…')
    try{const data=await loadSubstituteRosterSlots(date,year,selected,Number(term)),seen=new Set(entries.map(rowKey))
      const added:Entry[]=data.slots.flatMap(slot=>{const row:Entry={...slot,id:crypto.randomUUID(),substitute_teacher_id:null,leave_type:leaveType,note:null,override_conflicts:false,conflict_details:[]};if(seen.has(rowKey(row)))return [];seen.add(rowKey(row));return [row]})
      if(added.length){setEntries(current=>[...current,...added]);setDirty(true);focusAssignments.current=true;setPickerOpen(false)}
      setNotice({title:added.length?`นำเข้า ${added.length} คาบแล้ว`:'ไม่มีคาบใหม่ให้เพิ่ม',message:[data.missing.length?'ไม่พบคาบของ '+data.missing.map(id=>names[id]||id).join(', ')+' เพิ่มรายการเองได้':'',added.length?'เลือกครูสอนแทนให้แต่ละคาบ แล้วกดบันทึกทั้งหมด':'คาบที่มีอยู่แล้วจะไม่ถูกเพิ่มซ้ำ'].filter(Boolean).join(' · ')})
    }catch(error){setAlert({type:'error',title:'นำเข้าไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}
    finally{operation.current=false;setWorking('')}
  }
  function openEditor(row?:Entry){setEditorError('');setEditorRow(row?{...row}:{id:crypto.randomUUID(),absent_teacher_id:selected[0]||teachers[0]?.id||'',period:regularPeriods[0]?.period||1,class_subject_id:null,classroom_id:rooms[0]?.id||null,subject_label:'',room_label:rooms[0]?.label||null,substitute_teacher_id:null,leave_type:leaveType,note:null})}
  function applyEditor(){
    if(!editorRow)return
    const row={...editorRow,...rosterPeriodClock(periods,rooms.find(room=>room.id===editorRow.classroom_id)?.label||'',editorRow.period),subject_label:editorRow.subject_label?.trim()||null,room_label:rooms.find(room=>room.id===editorRow.classroom_id)?.label||null,override_conflicts:false,conflict_details:[]}
    const next=entries.some(item=>item.id===row.id)?entries.map(item=>item.id===row.id?row:item):[...entries,row]
    try{validateSubstituteRoster(next,new Set(Object.keys(names)),new Set(rooms.map(room=>room.id)),new Set([1,2,3,4,5,6,7,8]));setEntries(next);setDirty(true);setEditorRow(null)}catch(error){setEditorError(error instanceof Error?error.message:'ข้อมูลไม่ถูกต้อง')}
  }
  function prepareSave(){
    if(blocked||operation.current)return
    try{
      validateSubstituteRoster(entries,new Set(Object.keys(names)),new Set(rooms.map(room=>room.id)),new Set([1,2,3,4,5,6,7,8]))
      const prepared=entries.map(row=>{const detail=reasons(row);return {...row,override_conflicts:detail.length>0,conflict_details:detail}})
      void persist(prepared)
    }catch(error){setAlert({type:'error',title:'กรุณาตรวจรายการก่อนบันทึก',message:error instanceof Error?error.message:'ข้อมูลไม่ครบ'})}
  }
  async function persist(rows:Entry[]){
    if(blocked||operation.current)return
    operation.current=true;setWorking('กำลังบันทึกตารางสอนแทนทั้งหมด…')
    try{const result=await saveSubstituteRoster(dayId,original,rows);if(result.error)throw Error(result.error)
      setEntries(rows);setOriginal(rows);setDirty(false)
      focusHistory.current=true;setEditing(false);setHistoryRevision(value=>value+1);if(await loadDay())setNotice({title:'บันทึกรายการสอนแทนแล้ว',message:`ครูที่ลา ${new Set(rows.map(row=>row.absent_teacher_id)).size} คน · ${rows.length} คาบ · ดาวน์โหลด PDF แก้ไข หรือลบได้จากรายการด้านล่าง`})
    }catch(error){setAlert({type:'error',title:'บันทึกไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}
    finally{operation.current=false;setWorking('')}
  }
  function editSaved(record:SubstituteHistoryRecord){
    if(blocked||dirty)return
    setNotice(null);setGroupFilter(record.absentId);setSelected([record.absentId]);setPickerOpen(false);setEditing(true);focusEdit.current=true
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
      setNotice({title:'ลบรายการสอนแทนแล้ว',message:'ลบเฉพาะเอกสารของครูและวันที่เลือกเรียบร้อยแล้ว'})
    }catch(error){setAlert({type:'error',title:'ลบไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}
    finally{operation.current=false;setWorking('')}
  }
  async function pdf(record?:SubstituteHistoryRecord,historyNames:Record<string,string>={}){
    const pdfDate=record?.day.date||date
    // Saved documents are independent of the current editor's unsaved draft.
    if((!record&&(blocked||dirty||!original.length))||!year||operation.current)return
    operation.current=true;setDownload(null);setWorking('กำลังสร้าง PDF จากข้อมูลที่บันทึกแล้ว…')
    try{
      const [context,day,otherDays]=await Promise.all([
        fetchSubstitutePdfContext(),fetchSubstituteDay(pdfDate,year,Number(term),true),fetchSubstituteStats(year,Number(term),pdfDate),
      ])
      const rows=record?day.entries.filter(row=>row.absent_teacher_id===record.absentId):day.entries
      const workload=substitutePdfWorkload(day.entries,day.period_times===null?null:day.busy,otherDays)
      const result=await buildSubstitutePdf({
        schoolName:context.school?.name||'โรงเรียน',logoUrl:context.school?.logo_url,date:pdfDate,
        year:years.find(row=>row.id===year)?.year_be||0,term,academicHead:context.academicHead,
        director:directorDisplayName(context.school,''),times:day.period_times??[],teachers,
        teacherNames:substituteDocumentNames(rows,{...names,...historyNames,...day.teacher_names}),entries:rows,workload,
      })
      const url=URL.createObjectURL(result.blob),link=document.createElement('a')
      setDownload({url,fileName:result.fileName})
      try{link.href=url;link.download=result.fileName;document.body.appendChild(link);link.click()}finally{link.remove()}
    }catch(error){setAlert({type:'error',title:'สร้าง PDF ไม่สำเร็จ',message:error instanceof Error?error.message:'กรุณาลองใหม่'})}
    finally{operation.current=false;setWorking('')}
  }
  if(loading)return <p className="sub-roster-loading" role="status">กำลังโหลดตารางสอนแทน…</p>
  return <div className="sub-roster sub-desk schedule-workspace">
    <header className="sub-roster-head">
      <div className="sub-desk-title"><span className="sub-desk-mark"><FiFileText aria-hidden="true"/></span><div><span className="sub-roster-eyebrow">งานเอกสาร · ตารางสอนแทน</span><h1>จัดครูสอนแทน</h1><p>เลือกครู ตรวจเวลาว่าง แล้วสร้างเอกสารพร้อมเสนอเซ็น</p></div></div>
      <div className="sub-desk-head-actions"><span className="sub-roster-storage">{local?'ข้อมูลในเครื่องนี้':'ข้อมูลของโรงเรียน'}</span>{!editing&&<button type="button" className="sub-roster-primary sub-desk-create" disabled={blocked} onClick={beginEdit}><FiPlus aria-hidden="true"/>จัดรายการสอนแทน</button>}</div>
    </header>
    <section className="sub-roster-filters" aria-label="เลือกวันและภาคเรียน">
      <label>ปีการศึกษา<select aria-label="ปีการศึกษา" disabled={!!working||dirty} value={year} onChange={event=>setYear(event.target.value)}>{years.map(row=><option key={row.id} value={row.id}>พ.ศ. {row.year_be}</option>)}</select></label>
      <label>ภาคเรียน<select aria-label="ภาคเรียน" disabled={!!working||dirty} value={term} onChange={event=>setTerm(event.target.value)}><option value="1">เทอม 1</option><option value="2">เทอม 2</option></select></label>
      <label>วันที่จัดสอนแทน<input aria-label="วันที่สอนแทน" type="date" disabled={!!working||dirty} value={date} onChange={event=>{setNotice(null);setPickerOpen(true);setEditing(true);setGroupFilter('');setDate(event.target.value)}}/></label>
      <div className="sub-roster-day"><FiCalendar aria-hidden="true"/><div>{date?new Intl.DateTimeFormat('th-TH',{dateStyle:'long',timeZone:'Asia/Bangkok'}).format(new Date(date+'T12:00:00+07:00')):'เลือกวันที่'}<small>{dayLabel?`วัน${dayLabel} · `:null}{original.length?`บันทึกไว้ ${original.length} คาบ`:'ยังไม่มีรายการของวันนี้'}</small></div></div>
      <button type="button" className="sub-desk-refresh" title="ตรวจข้อมูลล่าสุด" aria-label="ตรวจข้อมูลล่าสุด" disabled={!!working||loadingDay||dirty||!year||!date} onClick={()=>void loadDay()}><FiRefreshCw aria-hidden="true"/></button>
    </section>
    <p className="sub-desk-document-hint"><FiInfo aria-hidden="true"/>เอกสารสอนแทนแยกจากตารางสอนจริง · ครูที่ติดสอนยังเลือกได้ พร้อมแสดงเหตุผล</p>
    {!year&&<p className="sub-roster-error" role="status">ยังไม่มีปีการศึกษา กรุณาตั้งค่าปีการศึกษาก่อนใช้งาน</p>}
    {availabilityWarning&&<p className="sub-desk-warning" role="status"><FiAlertTriangle aria-hidden="true"/>{availabilityWarning} · ยังเลือกครูและบันทึกเอกสารได้</p>}
    {(!!working||loadingDay)&&<p className="sub-roster-loading" role="status"><FiLoader aria-hidden="true"/>{working||'กำลังโหลดข้อมูลของวันที่เลือก…'}</p>}
    {notice&&<div className="sub-desk-notice" role="status"><FiCheckCircle aria-hidden="true"/><div><strong>{notice.title}</strong><p>{notice.message}</p></div><button type="button" aria-label="ปิดข้อความแจ้งผล" onClick={()=>setNotice(null)}><FiX aria-hidden="true"/></button></div>}
    {editing&&<section id="sub-roster-workbench" ref={workbench} tabIndex={-1} className="sub-roster-workbench" data-picker-open={pickerOpen} aria-labelledby="sub-workbench-title">
      <div className="sub-desk-editor-heading"><div><span className="sub-desk-step-label">กำลังจัดรายการ · {dirty?'ยังไม่บันทึก':'ข้อมูลของวันที่เลือก'}</span><h2 id="sub-workbench-title">{groupFilter?`แก้ไขรายการของ ${names[groupFilter]||'ครูที่เลือก'}`:'จัดรายการสอนแทน'}</h2></div><button type="button" className="sub-editor-close" disabled={blocked} onClick={cancelEdit}><FiArrowLeft aria-hidden="true"/>{dirty?'ยกเลิกการแก้ไข':'กลับไปรายการที่บันทึก'}</button></div>
      <div className="sub-desk-editor-layout">
        <aside className="sub-roster-picker" aria-labelledby="sub-absent-title">
          <div className="sub-roster-section-head"><div><span className="sub-desk-step">1</span><h3 id="sub-absent-title">ครูที่ลา / ไม่อยู่</h3></div><button type="button" className="sub-desk-picker-toggle" aria-expanded={pickerOpen} aria-controls="sub-desk-picker-fields" onClick={()=>setPickerOpen(value=>!value)}>{pickerOpen?'ย่อ':'เปลี่ยนครู'}</button></div><div id="sub-desk-picker-fields" className="sub-desk-picker-content" hidden={!pickerOpen}>
          <label className="sub-roster-search"><FiSearch aria-hidden="true"/><input type="search" aria-label="ค้นหาครูที่ลา" placeholder="ค้นหาชื่อครู" value={teacherSearch} onChange={event=>setTeacherSearch(event.target.value)}/></label>
          <div className="sub-roster-picker-tools"><button type="button" disabled={blocked||!visibleTeachers.length} onClick={()=>setSelected(current=>[...new Set([...current,...visibleTeachers.map(teacher=>teacher.id)])])}>เลือกผลค้นหาทั้งหมด</button><button type="button" disabled={blocked||!selected.length} onClick={()=>setSelected([])}>ล้างการเลือก</button></div>
          <div className="sub-roster-teachers">{visibleTeachers.map(teacher=><label key={teacher.id} className={selected.includes(teacher.id)?'is-selected':''}><input type="checkbox" disabled={blocked} checked={selected.includes(teacher.id)} onChange={()=>setSelected(current=>current.includes(teacher.id)?current.filter(id=>id!==teacher.id):[...current,teacher.id])}/><span>{names[teacher.id]}</span>{entries.some(row=>row.absent_teacher_id===teacher.id)&&<small>มีคาบแล้ว</small>}</label>)}{!visibleTeachers.length&&<p className="sub-desk-picker-empty">{teachers.length?'ไม่พบชื่อที่ค้นหา':'เพิ่มรายชื่อครูในข้อมูลตารางเรียนก่อนเริ่มจัดสอนแทน'}</p>}</div>
          {selected.length>0&&<div className="sub-desk-selected" aria-label="ครูที่เลือก">{selected.slice(0,6).map(id=><button type="button" key={id} disabled={blocked} title={`นำ ${names[id]} ออกจากการเลือก`} onClick={()=>setSelected(current=>current.filter(value=>value!==id))}><span>{names[id]}</span><FiX aria-hidden="true"/></button>)}{selected.length>6&&<small>และอีก {selected.length-6} คน</small>}</div>}
          <div className="sub-roster-import"><label>ประเภทการลา<select aria-label="ประเภทการลาที่นำเข้า" disabled={blocked} value={leaveType} onChange={event=>setLeaveType(event.target.value)}>{SUBSTITUTE_LEAVE_TYPES.map(type=><option key={type}>{type}</option>)}</select></label><button type="button" className="sub-roster-primary" disabled={blocked||!selected.length} onClick={()=>void importRows()}><FiPlus aria-hidden="true"/>นำเข้าจากตารางเรียน ({selected.length} คน)</button><small>เลือกหลายคนแล้วนำเข้าคาบพร้อมกันได้</small></div></div>
          {!pickerOpen&&<nav className="sub-desk-teacher-nav" aria-label="รายการของครูที่ลา"><button type="button" aria-pressed={!groupFilter||!absentIds.includes(groupFilter)} onClick={()=>setGroupFilter('')}>ครูทุกคน<span>{absentIds.length} คน</span></button>{absentIds.map(id=>{const waiting=entries.filter(row=>row.absent_teacher_id===id&&!row.substitute_teacher_id).length;return <button key={id} type="button" aria-pressed={groupFilter===id} onClick={()=>setGroupFilter(id)}><span>{names[id]}</span><small>{waiting?`รอ ${waiting} คาบ`:'ครบแล้ว'}</small></button>})}</nav>}
        </aside>
        <div className="sub-desk-assignments">
          <div className="sub-roster-list-head" ref={assignments} tabIndex={-1}><div><span className="sub-desk-step">2</span><h3>กำหนดครูสอนแทน</h3></div><button type="button" disabled={blocked||!rooms.length||!teachers.length} onClick={()=>openEditor()}><FiPlus aria-hidden="true"/>เพิ่มรายการเอง</button></div>
          {entries.length>0&&<div className="sub-roster-overview" aria-live="polite"><span><b>{absentIds.length}</b> ครูที่ลา</span><span><b>{entries.length}</b> คาบ</span><span className={unassigned.length?'is-pending':''}><b>{unassigned.length}</b> รอครูสอนแทน</span><span className={conflicts.length?'has-conflicts':''}><b>{conflicts.length}</b> ข้อสังเกตเวลาว่าง</span></div>}
          {absentIds.length>1&&<label className="sub-desk-group-select">แสดงรายการ<select aria-label="แสดงรายการของครู" value={absentIds.includes(groupFilter)?groupFilter:''} onChange={event=>setGroupFilter(event.target.value)}><option value="">ครูทุกคน ({absentIds.length} คน)</option>{absentIds.map(id=><option key={id} value={id}>{names[id]}</option>)}</select></label>}
          {!entries.length?<div className="sub-roster-empty sub-desk-empty-draft"><FiUsers aria-hidden="true"/><h3>{dirty&&original.length?'นำรายการทั้งหมดออกจากร่างแล้ว':'เริ่มจากเลือกครูที่ลา'}</h3><p>{dirty&&original.length?'กดบันทึกทั้งหมดเพื่อยืนยันการลบ หรือยกเลิกการแก้ไขเพื่อคืนรายการ':<>เลือกครูแล้วนำเข้าคาบจากตารางเรียน<br/>หรือกด “เพิ่มรายการเอง” เพื่อระบุคาบที่ต้องการ</>}</p></div>:(groupFilter&&absentIds.includes(groupFilter)?[groupFilter]:absentIds).map(absentId=>{
            const group=entries.filter(row=>row.absent_teacher_id===absentId).sort((a,b)=>a.period-b.period||(a.room_label||'').localeCompare(b.room_label||'','th'))
            return <section className="sub-roster-group" key={absentId}><div className="sub-roster-group-head"><div><span className="sub-desk-person-mark" aria-hidden="true">{names[absentId]?.charAt(0)||'ค'}</span><div><h3>{names[absentId]||'ครูเจ้าของคาบ'}</h3><p>{group.length} คาบ · รอครูสอนแทน {group.filter(row=>!row.substitute_teacher_id).length} คาบ</p></div></div><button type="button" className="sub-roster-danger" disabled={blocked} onClick={()=>setDeletion({ids:group.map(row=>row.id),label:'ทุกรายการของ '+(names[absentId]||'ครูคนนี้')})} title="ลบคาบของครูคนนี้"><FiTrash2 aria-hidden="true"/>ลบรายการครูคนนี้</button></div>
              <div className="sub-roster-table-wrap"><table className="sub-roster-table sub-table"><thead><tr><th>คาบ / ห้อง / วิชา</th><th>ครูสอนแทน</th><th>การลา / หมายเหตุ</th><th>จัดการ</th></tr></thead><tbody>{group.map(row=>{
                const detail=reasons(row),candidates=teachers.filter(teacher=>teacher.id!==row.absent_teacher_id).map(teacher=>({teacher,detail:conflictFor(teacher.id,row),load:scheduledLoads.get(teacher.id)??0})).sort((a,b)=>Number(a.detail.length>0)-Number(b.detail.length>0)||a.load-b.load||(names[a.teacher.id]||'').localeCompare(names[b.teacher.id]||'','th'))
                return <tr key={row.id} data-entry-id={row.id}><td data-label="คาบ / ห้อง / วิชา"><strong>คาบ {row.period} · {row.room_label}</strong><small>{periodTimeLabel(levelPeriodTimes(periods,row.room_label||''),row.period)}</small><span>{row.subject_label}</span></td>
                  <td data-label="ครูสอนแทน"><select className="sub-roster-assignee" aria-label={`ครูสอนแทน ${row.id}`} disabled={blocked} value={row.substitute_teacher_id||''} onChange={event=>change(row.id,{substitute_teacher_id:event.target.value||null})}><option value="">เลือกครูสอนแทน</option>{row.substitute_teacher_id&&!candidates.some(item=>item.teacher.id===row.substitute_teacher_id)&&<option value={row.substitute_teacher_id}>{names[row.substitute_teacher_id]||'ครูเดิม'} · ตรวจข้อมูลครู</option>}{[false,true].map(isBusy=><optgroup key={String(isBusy)} label={isBusy?'ไม่ว่าง · ยังเลือกได้':'ว่างในคาบนี้'}>{candidates.filter(item=>!!item.detail.length===isBusy).map(({teacher,detail,load})=><option key={teacher.id} value={teacher.id}>{names[teacher.id]} · {availabilityWarning?'ตรวจจำนวนคาบไม่ได้':`ตามตาราง ${load} คาบ`}{detail.length?' · ไม่ว่าง: '+detail[0]:' · ว่าง'}</option>)}</optgroup>)}</select>
                    {row.substitute_teacher_id?<div className={'sub-roster-availability '+(detail.length?'is-busy':'is-free')}>{detail.length?<><strong><FiAlertTriangle aria-hidden="true"/>ไม่ว่าง · ยังเลือกได้</strong><span>{detail[0]}</span>{detail.length>1&&<details><summary>ดูอีก {detail.length-1} ข้อสังเกต</summary><ul>{detail.slice(1).map(text=><li key={text}>{text}</li>)}</ul></details>}</>:<><FiCheckCircle aria-hidden="true"/>ว่างในคาบนี้</>}</div>:<small className="sub-desk-field-hint">เรียงครูที่ว่างไว้ก่อน</small>}</td>
                  <td data-label="การลา / หมายเหตุ"><select aria-label={`ประเภทการลา ${row.id}`} disabled={blocked} value={row.leave_type} onChange={event=>change(row.id,{leave_type:event.target.value})}>{[...new Set([...SUBSTITUTE_LEAVE_TYPES,row.leave_type])].map(type=><option key={type}>{type}</option>)}</select><input aria-label={`หมายเหตุ ${row.id}`} disabled={blocked} value={row.note||''} maxLength={1000} placeholder="ระบุเพิ่มเติม" onChange={event=>change(row.id,{note:event.target.value||null})}/></td>
                  <td data-label="จัดการ"><div className="sub-roster-row-actions"><button type="button" disabled={blocked} onClick={()=>openEditor(row)}><FiEdit2 aria-hidden="true"/>แก้ไข</button><button type="button" disabled={blocked} className="sub-roster-danger" onClick={()=>setDeletion({ids:[row.id],label:`คาบ ${row.period} · ${row.room_label} · ${row.subject_label}`})}><FiTrash2 aria-hidden="true"/>ลบคาบ</button></div></td></tr>
              })}</tbody></table></div></section>
          })}
          {entries.length>0&&<button type="button" className="sub-roster-danger sub-desk-delete-day" disabled={blocked} onClick={()=>setDeletion({ids:entries.map(row=>row.id),label:'ทุกรายการในวันนี้'})}><FiTrash2 aria-hidden="true"/>ลบทั้งหมดของวันนี้</button>}
        </div>
      </div>
      <footer className="sub-roster-footer"><div><strong>{dirty?'ร่างนี้ยังไม่บันทึก':original.length?'ข้อมูลที่บันทึกแล้ว':'ยังไม่มีคาบในร่าง'}</strong><small>{date?new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'}).format(new Date(date+'T12:00:00+07:00'))+' · ':''}{entries.length} คาบ · {entries.length?(unassigned.length?`รอครู ${unassigned.length} คาบ`:'กำหนดครูครบแล้ว'):dirty&&original.length?'รอยืนยันลบรายการทั้งหมด':'ยังไม่เพิ่มรายการ'}{conflicts.length?` · มีข้อสังเกต ${conflicts.length} คาบ`:''}</small></div><div className="sub-roster-actions"><button type="button" className="sub-editor-cancel" disabled={blocked} onClick={cancelEdit}>{dirty?'ยกเลิกการแก้ไข':'ปิด'}</button><button type="button" className="sub-editor-pdf" disabled={blocked||dirty||!original.length} onClick={()=>void pdf()}><FiDownload aria-hidden="true"/>PDF ทั้งวัน</button><button type="button" className="sub-roster-primary" disabled={blocked||(!entries.length&&!original.length)} onClick={prepareSave}><FiSave aria-hidden="true"/>{working.startsWith('กำลังบันทึก')?'กำลังบันทึก…':'บันทึกทั้งหมด'}</button></div></footer>
    </section>}
    {download&&<div className="sub-desk-download" role="status"><FiDownload aria-hidden="true"/><div><strong>PDF พร้อมดาวน์โหลด</strong><p>{download.fileName}</p></div><a href={download.url} download={download.fileName}>ดาวน์โหลดอีกครั้ง</a></div>}
    <SubstituteSavedHistory year={year} term={Number(term)} revision={historyRevision} disabled={blocked||dirty} pdfDisabled={!!working||!year} unsavedChanges={dirty} names={names} onEdit={editSaved} onPdf={(record,teacherNames)=>void pdf(record,teacherNames)} onDelete={setSavedDeletion}/>

    <dialog ref={editor} className="sub-roster-dialog" aria-labelledby="sub-editor-title" onCancel={()=>setEditorRow(null)} onClose={()=>setEditorRow(null)}><form onSubmit={event=>{event.preventDefault();applyEditor()}}><header><h2 id="sub-editor-title">{entries.some(row=>row.id===editorRow?.id)?'แก้ไขรายการสอนแทน':'เพิ่มรายการสอนแทน'}</h2><button type="button" onClick={()=>setEditorRow(null)}>ปิด</button></header>{editorRow&&<div className="sub-roster-editor-grid"><label>ครูเจ้าของคาบ<select aria-label="ครูเจ้าของคาบ" value={editorRow.absent_teacher_id} onChange={event=>setEditorRow({...editorRow,absent_teacher_id:event.target.value,class_subject_id:null})}>{teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{names[teacher.id]}</option>)}</select></label><label>คาบเรียน<select aria-label="คาบเรียน" value={editorRow.period} onChange={event=>setEditorRow({...editorRow,period:Number(event.target.value)})}>{regularPeriods.map(period=><option key={period.period} value={period.period}>คาบ {period.period} · {periodTimeLabel(levelPeriodTimes(periods,rooms.find(room=>room.id===editorRow.classroom_id)?.label||''),period.period)}</option>)}</select></label><label>ชั้น / ห้อง<select aria-label="ชั้นและห้อง" value={editorRow.classroom_id||''} onChange={event=>setEditorRow({...editorRow,classroom_id:event.target.value,class_subject_id:null})}>{rooms.map(room=><option key={room.id} value={room.id}>{room.label}</option>)}</select></label><label>รายวิชา<input aria-label="รายวิชาสอนแทน" required maxLength={300} value={editorRow.subject_label||''} onChange={event=>setEditorRow({...editorRow,subject_label:event.target.value,class_subject_id:null})}/></label><label>ประเภทการลา<select value={editorRow.leave_type} onChange={event=>setEditorRow({...editorRow,leave_type:event.target.value})}>{[...new Set([...SUBSTITUTE_LEAVE_TYPES,editorRow.leave_type])].map(type=><option key={type}>{type}</option>)}</select></label><label>หมายเหตุ<input maxLength={1000} value={editorRow.note||''} onChange={event=>setEditorRow({...editorRow,note:event.target.value||null})}/></label>{editorError&&<p className="sub-roster-error" role="alert">{editorError}</p>}</div>}<footer><button type="button" onClick={()=>setEditorRow(null)}>ยกเลิก</button><button type="submit" className="sub-roster-primary">ใช้รายการนี้</button></footer></form></dialog>
    {alert&&<AppAlertModal open autoCloseMs={0} type={alert.type} title={alert.title} message={alert.message} onClose={()=>setAlert(null)}/>}
    {savedDeletion&&<AppAlertModal open type="confirm" title="ลบรายการที่บันทึกแล้ว?" message={`${names[savedDeletion.absentId]||'ครูเจ้าของคาบ'} · ${savedDeletion.day.date} · ${savedDeletion.entries.length} รายการ จะลบเฉพาะครูคนนี้ในวันนี้`} confirmLabel="ยืนยันลบรายการ" cancelLabel="ยกเลิก" onClose={()=>setSavedDeletion(null)} onConfirm={()=>void deleteSaved()}/>}
    {deletion&&<AppAlertModal open type="confirm" title="ลบรายการสอนแทน?" message={`${deletion.label} (${deletion.ids.length} รายการ) จะนำออกจากร่าง แล้วกดบันทึกทั้งหมดเพื่อยืนยันการเปลี่ยนแปลง`} confirmLabel="ยืนยันลบ" cancelLabel="ยกเลิก" onClose={()=>setDeletion(null)} onConfirm={()=>{setEntries(current=>current.filter(row=>!deletion.ids.includes(row.id)));setDirty(true);setDeletion(null)}}/>}
  </div>
}
