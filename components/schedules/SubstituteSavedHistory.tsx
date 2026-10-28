'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import {FiDownload,FiEdit2,FiTrash2,FiSearch,FiCheckCircle} from 'react-icons/fi'
import {useScheduleOperations} from './ScheduleServices'
import {substituteHistoryRecords,type SubstituteHistoryPage,type SubstituteHistoryRecord} from '@/lib/substitute-history'

export default function SubstituteSavedHistory({year,term,revision,disabled,names,onEdit,onPdf,onDelete}:{
  year:string;term:number;revision:number;disabled:boolean;names:Record<string,string>
  onEdit:(record:SubstituteHistoryRecord)=>void
  onPdf:(record:SubstituteHistoryRecord,names:Record<string,string>)=>void
  onDelete:(record:SubstituteHistoryRecord)=>void
}) {
  const {fetchSubstituteHistory}=useScheduleOperations()
  const [page,setPage]=useState<SubstituteHistoryPage>({days:[],teacher_names:{},nextBefore:null})
  const [loadedScope,setLoadedScope]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('')
  const scope=`${year}:${term}`,request=useRef(0)
  const load=useCallback(async(before?:string)=>{
    if(!year)return
    const ticket=++request.current;setLoading(true);setError('')
    try {
      const result=await fetchSubstituteHistory(year,term,before)
      if(ticket!==request.current)return
      setPage(previous=>before?{days:[...previous.days,...result.days.filter(day=>!previous.days.some(old=>old.id===day.id))],teacher_names:{...previous.teacher_names,...result.teacher_names},nextBefore:result.nextBefore}:result)
      setLoadedScope(`${year}:${term}`)
    } catch(error) {if(ticket===request.current)setError(error instanceof Error?error.message:'โหลดรายการที่บันทึกแล้วไม่สำเร็จ')}
    finally {if(ticket===request.current)setLoading(false)}
  },[fetchSubstituteHistory,year,term])
  useEffect(()=>{const counter=request;let cancelled=false;void Promise.resolve().then(()=>{if(!cancelled)void load()});return()=>{cancelled=true;counter.current++}},[load,revision])
  const teacherNames={...names,...page.teacher_names},days=loadedScope===scope?page.days:[]
  const records=substituteHistoryRecords(days).sort((a,b)=>b.day.date.localeCompare(a.day.date)||(teacherNames[a.absentId]||'').localeCompare(teacherNames[b.absentId]||'','th'))
  const dateText=(date:string)=>new Intl.DateTimeFormat('th-TH',{dateStyle:'long',timeZone:'Asia/Bangkok'}).format(new Date(date+'T12:00:00+07:00'))
  const visible=records.filter(record=>[record.day.date,dateText(record.day.date),teacherNames[record.absentId],...record.entries.map(row=>teacherNames[row.substitute_teacher_id||''])].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  return <section id="substitute-saved-history" className="sub-roster-saved" aria-labelledby="sub-saved-title" aria-busy={loading}>
    <div className="sub-roster-section-head"><div><h2 id="sub-saved-title"><FiCheckCircle aria-hidden/>รายการสอนแทนที่บันทึกแล้ว</h2><p>แยกตามวันที่และครูเจ้าของคาบ · ดาวน์โหลด PDF แก้ไข หรือลบได้ทีละรายการ</p></div><button type="button" disabled={disabled||loading||!year} onClick={()=>void load()}>โหลดรายการใหม่</button></div>
    <label className="sub-roster-search sub-history-search"><FiSearch aria-hidden/><input type="search" aria-label="ค้นหารายการที่บันทึกแล้ว" placeholder="ค้นหาครูหรือวันที่ในรายการที่โหลด" value={search} onChange={event=>setSearch(event.target.value)}/></label>
    {disabled&&<p className="sub-history-hint">บันทึกหรือยกเลิกการแก้ไขด้านบนก่อนจัดการรายการที่บันทึกแล้ว</p>}
    {error&&<p className="sub-roster-error" role="alert">{error} <button type="button" disabled={disabled||loading} onClick={()=>void load()}>ลองใหม่</button></p>}
    {loading&&<p className="sub-roster-loading" role="status">กำลังโหลดรายการที่บันทึกแล้ว…</p>}
    {!!visible.length&&<div className="sub-history-table-wrap"><table className="sub-history-table"><caption>{records.length} รายการ จาก {days.length} วันที่ในภาคเรียนที่เลือก</caption><thead><tr><th>วันที่ / ครูเจ้าของคาบ</th><th>ครูสอนแทน</th><th>คาบ / สถานะ</th><th>จัดการรายการ</th></tr></thead><tbody>{visible.map(record=>{
      const assigned=[...new Set(record.entries.flatMap(row=>row.substitute_teacher_id?[row.substitute_teacher_id]:[]))]
      const waiting=record.entries.filter(row=>!row.substitute_teacher_id).length,overrides=record.entries.filter(row=>row.override_conflicts).length
      return <tr key={record.key} data-history-key={record.key}>
        <td data-label="วันที่ / ครูเจ้าของคาบ"><time dateTime={record.day.date}>{dateText(record.day.date)}</time><strong>{teacherNames[record.absentId]||'ครูเจ้าของคาบ'}</strong><small>{[...new Set(record.entries.map(row=>row.leave_type))].join(' · ')}</small></td>
        <td data-label="ครูสอนแทน"><div className="sub-history-names">{assigned.map(id=><span key={id}>{teacherNames[id]||'ครูสอนแทน'}</span>)}</div>{!assigned.length&&<small>ยังไม่กำหนดครูสอนแทน</small>}</td>
        <td data-label="คาบ / สถานะ"><strong>{record.entries.length} รายการ</strong><small>คาบ {[...new Set(record.entries.map(row=>row.period))].join(', ')}</small><span className={'sub-history-status '+(waiting?'is-pending':'is-complete')}>{waiting?`รอครู ${waiting} รายการ`:'กำหนดครูครบแล้ว'}</span>{!!overrides&&<small>ยืนยันทั้งที่ไม่ว่าง {overrides} รายการ</small>}</td>
        <td data-label="จัดการรายการ"><div className="sub-history-actions"><button type="button" disabled={disabled||loading} onClick={()=>onPdf(record,teacherNames)} aria-label={`PDF ${teacherNames[record.absentId]} ${record.day.date}`}><FiDownload aria-hidden/>PDF</button><button type="button" disabled={disabled||loading} onClick={()=>onEdit(record)} aria-label={`แก้ไข ${teacherNames[record.absentId]} ${record.day.date}`}><FiEdit2 aria-hidden/>แก้ไข</button><button type="button" className="sub-roster-danger" disabled={disabled||loading} onClick={()=>onDelete(record)} aria-label={`ลบ ${teacherNames[record.absentId]} ${record.day.date}`}><FiTrash2 aria-hidden/>ลบ</button></div></td>
      </tr>
    })}</tbody></table></div>}
    {!loading&&!error&&!visible.length&&<div className="sub-roster-empty">{records.length?'ไม่พบรายการที่ตรงกับคำค้น':'ยังไม่มีรายการที่บันทึกในภาคเรียนนี้ เมื่อบันทึกแล้วรายการจะแสดงที่นี่'}</div>}
    {page.nextBefore&&loadedScope===scope&&<button type="button" className="sub-history-more" disabled={disabled||loading} onClick={()=>void load(page.nextBefore!)}>ดูรายการเก่ากว่านี้</button>}
  </section>
}
