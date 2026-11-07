'use client'

import {substituteDocumentNames} from '@/lib/substitute-document-model'
import {Fragment,useCallback,useEffect,useRef,useState} from 'react'
import {FiDownload,FiEdit2,FiTrash2,FiSearch,FiCheckCircle,FiChevronDown,FiFileText,FiRefreshCw} from 'react-icons/fi'
import {useScheduleOperations} from './ScheduleServices'
import {substituteHistoryRecords,type SubstituteHistoryPage,type SubstituteHistoryRecord} from '@/lib/substitute-history'

export default function SubstituteSavedHistory({year,term,revision,disabled,pdfDisabled,unsavedChanges,names,onEdit,onPdf,onDelete}:{
  year:string;term:number;revision:number;disabled:boolean;pdfDisabled:boolean;unsavedChanges:boolean;names:Record<string,string>
  onEdit:(record:SubstituteHistoryRecord)=>void
  onPdf:(record:SubstituteHistoryRecord,names:Record<string,string>)=>void
  onDelete:(record:SubstituteHistoryRecord)=>void
}) {
  const {fetchSubstituteHistory,fetchSubstituteStats}=useScheduleOperations()
  const [page,setPage]=useState<SubstituteHistoryPage>({days:[],teacher_names:{},nextBefore:null})
  const [stats,setStats]=useState<Array<{teacherId:string;periods:number;name:string}>>([])
  const [loadedScope,setLoadedScope]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('')
  const [status,setStatus]=useState('all'),[expanded,setExpanded]=useState('')
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
  useEffect(()=>{if(!year)return;let cancelled=false;void fetchSubstituteStats(year,term).then(rows=>{if(!cancelled)setStats(rows)}).catch(()=>{if(!cancelled)setStats([])});return()=>{cancelled=true}},[fetchSubstituteStats,year,term,revision])
  const teacherNames={...names,...page.teacher_names},days=loadedScope===scope?page.days:[]
  const records=substituteHistoryRecords(days).sort((a,b)=>b.day.date.localeCompare(a.day.date)||(teacherNames[a.absentId]||'').localeCompare(teacherNames[b.absentId]||'','th'))
  const dateText=(date:string)=>new Intl.DateTimeFormat('th-TH',{dateStyle:'long',timeZone:'Asia/Bangkok'}).format(new Date(date+'T12:00:00+07:00'))
  const visible=records.filter(record=>{
    const recordNames=substituteDocumentNames(record.entries,teacherNames)
    const matches=[record.day.date,dateText(record.day.date),recordNames[record.absentId],...record.entries.map(row=>recordNames[row.substitute_teacher_id||''])].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    const waiting=record.entries.some(row=>!row.substitute_teacher_id)
    return matches&&(status==='all'||status==='pending'&&waiting||status==='complete'&&!waiting||status==='busy'&&record.entries.some(row=>row.override_conflicts))
  })
  return <section id="substitute-saved-history" tabIndex={-1} className="sub-roster-saved" aria-labelledby="sub-saved-title" aria-busy={loading}>
    <div className="sub-roster-section-head sub-history-heading"><div><h2 id="sub-saved-title">รายการสอนแทนที่บันทึกแล้ว</h2><p>แยกตามครูและวันที่ · เปิดดูคาบ ดาวน์โหลด PDF หรือแก้ไขได้จากแถวเดียวกัน</p></div><span>{records.length} รายการที่โหลด · {days.length} วัน</span></div>
    {!!stats.length&&<div className="sub-history-stats"><h3>สถิติครูสอนแทนในภาคเรียนนี้</h3><table><thead><tr><th>ครูสอนแทน</th><th>จำนวนคาบ</th></tr></thead><tbody>{stats.map(row=><tr key={row.teacherId}><td>{row.name||teacherNames[row.teacherId]||'ครูสอนแทน'}</td><td>{row.periods} คาบ</td></tr>)}</tbody></table></div>}
    <div className="sub-history-toolbar"><label className="sub-roster-search sub-history-search"><FiSearch aria-hidden="true"/><input type="search" aria-label="ค้นหารายการที่บันทึกแล้ว" placeholder="ค้นหาครูหรือวันที่ เช่น 2026-11-02" value={search} onChange={event=>setSearch(event.target.value)}/></label><label className="sub-history-status-filter"><span>สถานะ</span><select aria-label="กรองสถานะรายการสอนแทน" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">ทั้งหมด</option><option value="pending">รอครูสอนแทน</option><option value="complete">กำหนดครูครบแล้ว</option><option value="busy">มีข้อสังเกตเวลาว่าง</option></select></label><button type="button" disabled={disabled||loading||!year} onClick={()=>void load()}><FiRefreshCw aria-hidden="true"/>โหลดรายการใหม่</button></div>
    {unsavedChanges&&<p className="sub-history-hint">มีร่างที่ยังไม่บันทึก · PDF ใช้ข้อมูลที่บันทึกแล้ว หากจะแก้ไขหรือลบรายการ ให้ <a href="#sub-roster-workbench">บันทึกหรือยกเลิกร่างด้านบน</a> ก่อน</p>}
    {error&&<p className="sub-roster-error" role="alert">{error} <button type="button" disabled={disabled||loading} onClick={()=>void load()}>ลองใหม่</button></p>}
    {loading&&<p className="sub-roster-loading" role="status">กำลังโหลดรายการที่บันทึกแล้ว…</p>}
    {!!visible.length&&<div className="sub-history-table-wrap"><table className="sub-history-table"><caption>แสดง {visible.length} จาก {records.length} รายการที่โหลดในภาคเรียนนี้</caption><thead><tr><th>วันที่ / ครูที่ลา</th><th>คาบและห้อง</th><th>ครูสอนแทน</th><th>สถานะ</th><th>เอกสาร / จัดการ</th></tr></thead><tbody>{visible.map(record=>{
      const recordNames=substituteDocumentNames(record.entries,teacherNames),assigned=[...new Set(record.entries.flatMap(row=>row.substitute_teacher_id?[row.substitute_teacher_id]:[]))]
      const waiting=record.entries.filter(row=>!row.substitute_teacher_id).length,overrides=record.entries.filter(row=>row.override_conflicts).length,open=expanded===record.key
      return <Fragment key={record.key}><tr data-history-key={record.key} className={open?'is-expanded':undefined}>
        <td data-label="วันที่ / ครูที่ลา"><time dateTime={record.day.date}>{dateText(record.day.date)}</time><button type="button" className="sub-history-detail-toggle" aria-expanded={open} aria-label={`ดูรายละเอียด ${recordNames[record.absentId]} ${record.day.date}`} onClick={()=>setExpanded(open?'':record.key)}><strong>{recordNames[record.absentId]||'ครูเจ้าของคาบ'}</strong><FiChevronDown aria-hidden="true"/></button><small>{[...new Set(record.entries.map(row=>row.leave_type))].join(' · ')}</small></td>
        <td data-label="คาบและห้อง"><strong>{record.entries.length} คาบ</strong><small>คาบ {[...new Set(record.entries.map(row=>row.period))].join(', ')}</small><small>{[...new Set(record.entries.map(row=>row.room_label||'ไม่ระบุห้อง'))].join(', ')}</small></td>
        <td data-label="ครูสอนแทน"><div className="sub-history-names">{assigned.slice(0,3).map(id=><span key={id}>{recordNames[id]||'ครูสอนแทน'}</span>)}{assigned.length>3&&<small>และอีก {assigned.length-3} คน · กดชื่อครูที่ลาเพื่อดูทั้งหมด</small>}</div>{!assigned.length&&<small>ยังไม่กำหนดครูสอนแทน</small>}</td>
        <td data-label="สถานะ"><span className={'sub-history-status '+(waiting?'is-pending':'is-complete')}>{waiting?`รอครู ${waiting} คาบ`:<><FiCheckCircle aria-hidden="true"/>ครบแล้ว</>}</span>{!!overrides&&<small className="sub-history-busy-note">ไม่ว่าง {overrides} คาบ · ยังเลือกได้</small>}</td>
        <td data-label="เอกสาร / จัดการ"><div className="sub-history-actions"><button type="button" className="sub-history-pdf" disabled={pdfDisabled||loading} onClick={()=>onPdf(record,recordNames)} aria-label={`PDF ${recordNames[record.absentId]} ${record.day.date}`}><FiDownload aria-hidden="true"/>PDF</button><button type="button" disabled={disabled||loading} onClick={()=>onEdit(record)} aria-label={`แก้ไข ${recordNames[record.absentId]} ${record.day.date}`}><FiEdit2 aria-hidden="true"/>แก้ไข</button><button type="button" className="sub-roster-danger" disabled={disabled||loading} onClick={()=>onDelete(record)} aria-label={`ลบ ${recordNames[record.absentId]} ${record.day.date}`}><FiTrash2 aria-hidden="true"/>ลบ</button></div></td>
      </tr>{open&&<tr className="sub-history-expanded"><td colSpan={5}><div className="sub-history-detail-heading"><FiFileText aria-hidden="true"/><strong>รายละเอียดคาบสอนแทน</strong><span>{recordNames[record.absentId]} · {dateText(record.day.date)}</span></div><ul className="sub-history-periods">{record.entries.map(row=><li key={row.id}><b>คาบ {row.period}</b><div><strong>{row.room_label||'ไม่ระบุห้อง'} · {row.subject_label||'ไม่ระบุวิชา'}</strong><span>{row.substitute_teacher_id?recordNames[row.substitute_teacher_id]||'ครูสอนแทน':'ยังไม่กำหนดครูสอนแทน'}</span>{row.note&&<small>หมายเหตุ: {row.note}</small>}{row.override_conflicts&&<small className="sub-history-busy-note">{row.conflict_details?.join(' · ')||'มีข้อสังเกตเวลาว่าง'}</small>}</div></li>)}</ul></td></tr>}</Fragment>
    })}</tbody></table></div>}
    {!loading&&!error&&!visible.length&&<div className="sub-roster-empty sub-desk-empty-history"><FiFileText aria-hidden="true"/><h3>{records.length?'ไม่พบรายการที่ตรงกับตัวกรอง':'ยังไม่มีรายการสอนแทนที่บันทึก'}</h3><p>{records.length?'ลองเปลี่ยนชื่อ วันที่ หรือสถานะที่เลือก':'เลือกวันที่ด้านบน แล้วกด “จัดรายการสอนแทน” เพื่อเริ่มงาน'}</p>{(search||status!=='all')&&<button type="button" onClick={()=>{setSearch('');setStatus('all')}}>ล้างตัวกรอง</button>}</div>}
    {page.nextBefore&&loadedScope===scope&&<button type="button" className="sub-history-more" disabled={disabled||loading} onClick={()=>void load(page.nextBefore!)}>ดูรายการเก่ากว่านี้<FiChevronDown aria-hidden="true"/></button>}
  </section>
}
