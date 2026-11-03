'use client'
import {useEffect,useState} from 'react'
import {fetchStudentValueSummary} from '@/app/classroom-admin/actions'
import type {LedgerSummary,StudentValueKind} from '@/lib/student-value-ledger'
import {enqueueFileExport} from '@/lib/pdf/pdf-export-queue'
import './student-value-summary.css'

type Props={kind:StudentValueKind;classroomId:string;yearId:string;yearBe:number;monthKey:string;classLabel:string;schoolName:string}
export default function StudentValueSummary(props:Props){
  const {kind,classroomId,yearId,yearBe,monthKey,classLabel,schoolName}=props
  const [scope,setScope]=useState<'month'|'year'>('month'),[response,setResponse]=useState<{key:string;summary:LedgerSummary|null;error:string}|null>(null),[exportError,setError]=useState(''),[revision,setRevision]=useState(0),[search,setSearch]=useState(''),[busy,setBusy]=useState(false)
  const title=kind==='saving'?'สรุปเงินออม':'สรุปคะแนนความดี',unit=kind==='saving'?'บาท':'คะแนน'
  const money=(value:number)=>value.toLocaleString('th-TH',{minimumFractionDigits:kind==='saving'?2:0,maximumFractionDigits:kind==='saving'?2:0})
  const monthText=new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(monthKey+'-15T12:00:00+07:00'))
  const period=scope==='year'?`ปีการศึกษา ${yearBe} (พฤษภาคม - เมษายน)`:`เดือน${monthText}`
  const requestKey=[classroomId,yearId,kind,scope,monthKey,revision].join('|')
  const data=response?.key===requestKey?response.summary:null,loading=response?.key!==requestKey,error=response?.key===requestKey?(response.error||exportError):''
  useEffect(()=>{
    let active=true
    fetchStudentValueSummary(classroomId,yearId,kind,scope,monthKey).then(result=>{if(active){setError('');setResponse({key:requestKey,summary:result.summary,error:result.error||(!result.summary?'โหลดสรุปไม่สำเร็จ':'')})}}).catch(()=>{if(active)setResponse({key:requestKey,summary:null,error:'โหลดสรุปไม่สำเร็จ กรุณาลองใหม่'})})
    return()=>{active=false}
  },[classroomId,yearId,kind,scope,monthKey,revision,requestKey])

  const rows=data?.rows.filter(row=>`${row.number??''} ${row.name}`.toLocaleLowerCase('th').includes(search.trim().toLocaleLowerCase('th')))||[]
  async function excel(){if(!data)return;setBusy(true);try{const XLSX=await import('xlsx');const sheet=XLSX.utils.aoa_to_sheet([[title,schoolName],['ห้อง',classLabel,period],['อันดับ','เลขที่','ชื่อ-นามสกุล',`รวม (${unit})`,'วันที่บันทึก'],...data.rows.map(row=>[row.rank??'',row.number??'',row.name,row.total,row.days]),['รวมทั้งห้อง','','',data.total]]);sheet['!cols']=[{wch:8},{wch:8},{wch:40},{wch:18},{wch:14}];const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'สรุป');XLSX.writeFile(book,`${title}-${classLabel}-${scope==='year'?yearBe:monthKey}.xlsx`.replace(/[\\/:*?"<>|]/g,'-'))}catch{setError('ส่งออก Excel ไม่สำเร็จ กรุณาลองใหม่')}finally{setBusy(false)}}
  function pdf(){if(!data||busy)return;setBusy(true);enqueueFileExport({fileName:`${title}-${classLabel}-${scope==='year'?yearBe:monthKey}.pdf`.replace(/[\\/:*?"<>|]/g,'-'),label:title,run:async()=>{try{const {buildStudentLedgerPdf}=await import('@/lib/jspdf-student-ledger');return await buildStudentLedgerPdf({title,schoolName,classLabel,period,unit,summary:data})}catch(error){setError('สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่');throw error}finally{setBusy(false)}}})}

  return <section className="student-ledger-summary" aria-labelledby="student-ledger-title">
    <header><div><h2 id="student-ledger-title">{title}</h2><p>ห้อง {classLabel} · {period} · ยอดที่บันทึกแล้ว{kind==='saving'?' ไม่รวมเปอร์เซ็นต์ครูออมช่วย':''}</p></div><div className="student-ledger-tools"><label>ช่วงสรุป<select value={scope} disabled={busy} onChange={event=>setScope(event.target.value as 'month'|'year')}><option value="month">เดือนที่เลือก</option><option value="year">ทั้งปีการศึกษา</option></select></label><button type="button" disabled={loading||busy} onClick={()=>setRevision(value=>value+1)}>โหลดใหม่</button></div></header>
    {loading?<p role="status">กำลังสรุปข้อมูล…</p>:null}
    {error&&<p className="student-ledger-error" role="alert">{error} <button type="button" onClick={()=>setRevision(value=>value+1)}>ลองใหม่</button></p>}
    {data&&!loading&&<>
      <div className="student-ledger-metrics"><div><span>{kind==='saving'?'ยอดเงินออมรวม':'คะแนนความดีรวม'}</span><strong>{money(data.total)} <small>{unit}</small></strong></div><div><span>{kind==='saving'?'นักเรียนที่มียอดออม':'นักเรียนที่มีคะแนน'}</span><strong>{data.participantCount} <small>คน</small></strong></div><div><span>นักเรียนในห้องปัจจุบัน</span><strong>{data.studentCount} <small>คน</small></strong></div></div>
      {scope==='year'&&data.months.length>0&&<details className="student-ledger-months"><summary>ดูยอดแยกรายเดือน</summary><div>{data.months.map(row=><p key={row.month}><span>{new Intl.DateTimeFormat('th-TH',{month:'short',year:'numeric'}).format(new Date(row.month+'-15T12:00:00+07:00'))}</span><strong>{money(row.total)} {unit}</strong></p>)}</div></details>}
      <div className="student-ledger-table-tools"><label>ค้นหานักเรียน<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="เลขที่หรือชื่อ"/></label><div><button type="button" disabled={busy} onClick={()=>void excel()}>ส่งออก Excel</button><button type="button" disabled={busy} onClick={pdf}>ดาวน์โหลด PDF สรุป</button></div></div>
      <p className="student-ledger-count">แสดง {rows.length} จาก {data.rows.length} คน · เรียงยอดสะสมจากมากไปน้อย · อันดับเท่ากันเมื่อยอดเท่ากัน</p>
      <div className="student-ledger-table"><table><thead><tr><th>อันดับ</th><th>เลขที่</th><th>ชื่อ-นามสกุล</th><th>วันที่บันทึก</th><th>รวม ({unit})</th></tr></thead><tbody>{rows.map(row=><tr key={row.studentId}><td>{row.rank??'-'}</td><td>{row.number??'-'}</td><td>{row.name}{row.former&&<small>รวมยอดจากรายการเดิม</small>}</td><td>{row.days} วัน</td><td>{money(row.total)}</td></tr>)}{!rows.length&&<tr><td colSpan={5}>{search.trim()?'ไม่พบรายการที่ค้นหา':'ยังไม่มีรายชื่อนักเรียนหรือรายการที่บันทึก'}</td></tr>}</tbody><tfoot><tr><th colSpan={4}>รวมทั้งห้อง{search.trim()?' (ทุกคน)':''}</th><td>{money(data.total)}</td></tr></tfoot></table></div>
    </>}
  </section>
}
