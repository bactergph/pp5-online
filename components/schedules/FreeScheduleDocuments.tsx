'use client'
import {useState} from 'react'
import type {FreeWizardPlan} from '@/lib/schedule-device-free'
import {deviceDocumentPages,deviceWorkload,type DeviceDocumentSettings} from '@/lib/schedule-device-documents'
import {buildSchedulePdfBlob,buildWorkloadPdfBlob} from '@/lib/jspdf-schedules'
import {enqueueFileExport} from '@/lib/pdf/pdf-export-queue'
import {bangkokToday} from '@/lib/free-schedule-ad-window'
import {formatThaiDate} from '@/lib/thaiDate'
import ScheduleGridTable from './ScheduleGridTable'

export default function FreeScheduleDocuments({plan,semester,year,workload,onSettings}:{plan:FreeWizardPlan;semester:number;year:string;workload:boolean;onSettings:(value:DeviceDocumentSettings)=>void}){
  const [kind,setKind]=useState<'class'|'teacher'>('class'),[selected,setSelected]=useState<string[]|null>(null),[query,setQuery]=useState(''),[preview,setPreview]=useState('')
  const settings:DeviceDocumentSettings={schoolName:'',academicYear:year,printDate:bangkokToday(),academicHeadName:'',directorName:'',...plan.document}
  const update=(patch:Partial<DeviceDocumentSettings>)=>onSettings({...settings,...patch})
  const items=kind==='class'?plan.rooms.map(room=>({id:room.id,name:room.label})):plan.teachers
  const ids=items.filter(item=>selected===null||selected.includes(item.id)).map(item=>item.id)
  const pages=workload?[]:deviceDocumentPages(plan,kind,ids,semester,year)
  const sheet=pages.find(page=>page.title===preview)||pages[0]
  const rows=(workload?deviceWorkload(plan):[]).filter(row=>row.name.toLowerCase().includes(query.toLowerCase()))
  function exportPdf(){
    const title=`สรุปภาระงานสอน ภาคเรียนที่ ${semester} ปีการศึกษา ${year}`
    const fileName=workload?'สรุปภาระงานสอน.pdf':`${kind==='class'?'ตารางเรียน':'ตารางสอน'}.pdf`
    enqueueFileExport({fileName,label:workload?'ภาระงานสอน':'พิมพ์ตาราง',run:()=>workload?buildWorkloadPdfBlob({...settings,title,fileName,rows}):buildSchedulePdfBlob({...settings,days:plan.days,periodTimes:plan.periods,title:pages[0].title,gridData:pages[0].gridData,pages,fileName})})
  }
  return <article className="local-documents">
    <div className="prep-section-heading"><div><h2>{workload?'ภาระงานสอน':'พิมพ์ตาราง'}</h2><p>{workload?'สรุปคาบสอนต่อสัปดาห์ เรียงจากมากไปน้อย':'เลือกห้องหรือครู ส่งออก PDF ด้วยอุปกรณ์นี้'}</p></div><button className="primary" type="button" disabled={workload?!rows.length:!pages.length} onClick={exportPdf}>บันทึก PDF{!workload&&` ${ids.length} หน้า`}</button></div>
    <div className="local-document-fields">
      <label className="field">ชื่อโรงเรียน<input value={settings.schoolName} onChange={event=>update({schoolName:event.target.value})}/></label>
      <label className="field">ปีการศึกษา พ.ศ.<input inputMode="numeric" value={year} readOnly/></label>
      {!workload&&<label className="field">วันที่ใต้ลายเซ็น<input type="date" value={settings.printDate} onChange={event=>update({printDate:event.target.value})}/><small>{settings.printDate?formatThaiDate(settings.printDate):'ไม่ระบุวันที่'}</small></label>}
      <label className="field">หัวหน้าวิชาการ<input value={settings.academicHeadName} onChange={event=>update({academicHeadName:event.target.value})}/></label>
      <label className="field">ผู้อำนวยการสถานศึกษา<input value={settings.directorName} onChange={event=>update({directorName:event.target.value})}/></label>
    </div>
    {workload?<><label className="field">ค้นหาครู<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="prep-scroll"><table><thead><tr><th>ลำดับ</th><th>ชื่อ-นามสกุล</th><th>ภาระงานคาบต่อสัปดาห์</th><th>หมายเหตุ</th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.id}><td>{index+1}</td><td>{row.name}</td><td>{row.hours}</td><td>{row.note||'—'}</td></tr>)}</tbody></table></div>{!rows.length&&<p>ยังไม่มีภาระสอนที่กำหนดให้ครู</p>}</>:<>
      <div className="actions"><button type="button" aria-pressed={kind==='class'} onClick={()=>{setKind('class');setSelected(null)}}>ตารางเรียน</button><button type="button" aria-pressed={kind==='teacher'} onClick={()=>{setKind('teacher');setSelected(null)}}>ตารางสอน</button><button type="button" onClick={()=>setSelected(null)}>เลือกทั้งหมด</button><button type="button" onClick={()=>setSelected([])}>ล้างการเลือก</button></div>
      <div className="local-print-picks">{items.map(item=><label key={item.id}><input type="checkbox" checked={ids.includes(item.id)} onChange={event=>setSelected(event.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>{item.name}</label>)}</div>
      {sheet&&<><label className="field">ดูตัวอย่าง<select value={sheet.title} onChange={event=>setPreview(event.target.value)}>{pages.map(page=><option key={page.title} value={page.title}>{page.title}</option>)}</select></label><section className="local-print-preview"><h2>{settings.schoolName}</h2><h3>{sheet.title}</h3><div className="board"><ScheduleGridTable days={plan.days} periodTimes={plan.periods} renderCell={(day,period)=>{const cell=sheet.gridData[`${day}-${period}`];return cell?<><b>{cell.line1}</b><small>{cell.line2}</small><small>{cell.line3}</small><small>{cell.line4}</small></>:'—'}}/></div><div className="local-signers">{[[settings.academicHeadName,'หัวหน้าวิชาการ'],[settings.directorName,'ผู้อำนวยการสถานศึกษา']].map(([name,role])=><div key={role}>ลงชื่อ ................................<br/>({name||'................................'})<br/>{role}<br/>{settings.printDate?formatThaiDate(settings.printDate):'วันที่ ......../......../........'}</div>)}</div></section></>}
    </>}
  </article>
}
