'use client'
import {useState} from 'react'
import {PERIOD_BANDS,periodBand,validatePeriodProfiles} from '@/lib/schedule-period-profiles'
import PeriodProfilePicker,{selectedPeriodTimes,replacePeriodSelection,type PeriodSelection} from './PeriodProfilePicker'
import {type PeriodTimeRow} from '@/lib/schedule-helpers'
import './schedule-setup.css'
const clock=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`
const minute=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5))
function renumber(rows:PeriodTimeRow[]){let teaching=0,breaks=0;return rows.map((row,index)=>({...row,period:row.is_break?-breaks++:++teaching,sort_order:index+1}))}
export function kindergartenPeriodExample():PeriodTimeRow[]{return renumber([
 ['เคลื่อนไหว','08:30','09:10',false],['เสริมประสบการณ์','09:10','09:50',false],['อาหารว่าง','09:50','10:05',true],['สร้างสรรค์','10:05','10:45',false],['กลางแจ้ง','10:45','11:15',false],['พักกลางวัน','11:15','12:00',true],['นอนพัก / กำหนดครูดูแลในกิจกรรม','12:00','14:00',true],['เกมการศึกษา','14:00','14:30',false],
].map(([label,start_time,end_time,is_break],index)=>({period:index,label:String(label),start_time:String(start_time),end_time:String(end_time),is_break:Boolean(is_break),sort_order:index+1})))}
export default function WizardPeriodEditor({rows:allRows,levels,onChange:changeAll,configured,dirty,onSave}:{rows:PeriodTimeRow[];levels?:string[];onChange:(rows:PeriodTimeRow[])=>void;configured:boolean;dirty:boolean;onSave:()=>void}){
 const available=PERIOD_BANDS.filter(b=>!levels||levels.some(level=>periodBand(level)===b.id))
 const [selection,setSelection]=useState<PeriodSelection>(()=>levels?(available[0]?.id||'shared'):'shared')
 const band=selection==='shared'||available.some(b=>b.id===selection)?selection:available[0]?.id||'shared'
 const [after,setAfter]=useState<number|null>(null),[error,setError]=useState('')
 const rows=selectedPeriodTimes(allRows,band),invalid=validatePeriodProfiles(allRows),title=band==='shared'?'เวลาครูไม่ว่าง / ค่าเริ่มต้น':PERIOD_BANDS.find(b=>b.id===band)?.label
 function update(next:PeriodTimeRow[]){setError('');changeAll(replacePeriodSelection(allRows,band,renumber(next)))}
 function insert(isBreak:boolean){
  const index=after===null?rows.length:Math.min(rows.length,after+1),start=index?rows[index-1].end_time:rows[0]?.start_time||'08:30',duration=isBreak?15:40
  if(!/^\d\d:\d\d$/.test(start)||rows.some(row=>!/^\d\d:\d\d$/.test(row.start_time)||!/^\d\d:\d\d$/.test(row.end_time))||Math.max(...rows.map(row=>minute(row.end_time)),minute(start))+duration>1439){setError('กรุณาตรวจเวลาให้ถูกต้องก่อนเพิ่มช่วงเวลา');return}
  const next=rows.map((row,i)=>i<index?row:{...row,start_time:clock(minute(row.start_time)+duration),end_time:clock(minute(row.end_time)+duration)})
  next.splice(index,0,{period:0,label:isBreak?'ช่วงพัก':band==='kindergarten'?'ช่วงเรียนเพิ่มเติม':`คาบที่ ${rows.filter(row=>!row.is_break).length+1}`,start_time:start,end_time:clock(minute(start)+duration),is_break:isBreak,sort_order:0});update(next);setAfter(index)
 }
 return <div className="schedule-clock-editor">
  <PeriodProfilePicker rows={allRows} levels={levels} selected={band} onSelected={value=>{setSelection(value);setAfter(null);setError('')}}/>
  <section className="schedule-clock-card"><header><h3>{title}</h3><span>{rows.filter(row=>!row.is_break).length} ช่วงเรียน · {rows.filter(row=>row.is_break).length} ช่วงพัก</span></header>
  {band==='kindergarten'&&<button type="button" className="schedule-clock-example" onClick={()=>{if(configured&&!window.confirm('ใช้ตัวอย่างเวลาอนุบาลแทนเวลาที่กำลังแก้ไข? ระบบจะตรวจตารางเดิมก่อนบันทึก'))return;update(kindergartenPeriodExample())}}>ใช้ตัวอย่างเวลาอนุบาล</button>}
  <div className="schedule-clock-row schedule-clock-columns"><span>ชื่อช่วงเวลา</span><span>เริ่ม (24 ชม.)</span><span>สิ้นสุด (24 ชม.)</span><span/></div>
  {rows.map((row,index)=><div className={`schedule-clock-row ${row.is_break?'schedule-clock-break':''}`} key={`${band}-${index}`}><label><span className="sr-only">ชื่อช่วง {index+1}</span><input value={row.label} maxLength={100} aria-label={`${title} ชื่อช่วง ${index+1}`} onChange={e=>update(rows.map((r,i)=>i===index?{...r,label:e.target.value}:r))}/>{row.is_break&&<small>พักนักเรียน · กำหนดครูดูแลเพิ่มเติมในกิจกรรมครูได้</small>}</label>{(['start_time','end_time'] as const).map(field=><input key={field} type="text" inputMode="text" maxLength={5} placeholder="08:30" aria-label={`${title} ${field==='start_time'?'เริ่ม':'สิ้นสุด'} ${row.label}`} value={row[field]} onChange={e=>update(rows.map((r,i)=>i===index?{...r,[field]:e.target.value}:r))}/>)}<button type="button" disabled={rows.length<=1} className="schedule-clock-remove" aria-label={`ลบช่วง ${row.label}`} onClick={()=>{update(rows.filter((_,i)=>i!==index));setAfter(null)}}>×</button></div>)}
  <div className="schedule-clock-add"><label>เพิ่มหลังช่วง<select value={after??rows.length-1} onChange={e=>setAfter(Number(e.target.value))}>{rows.map((row,i)=><option key={i} value={i}>{row.label}</option>)}</select></label><button type="button" disabled={rows.filter(row=>!row.is_break).length>=8||rows.length>=24} onClick={()=>insert(false)}>+ ช่วงเรียน</button><button type="button" disabled={rows.length>=24} onClick={()=>insert(true)}>+ ช่วงพัก</button></div>
  </section>
  <p className="schedule-clock-help">แต่ละช่วงชั้นมีจำนวนคาบและเวลาพักต่างกันได้ · ครูข้ามช่วงชั้นตรวจชนจากเวลาจริง · กิจกรรมดูแลเด็ก/PLC กำหนดครูในขั้นกิจกรรม</p>
  {(invalid||error)&&<p className="prep-error" role="alert">{error||invalid}</p>}
  <button type="button" className="prep-primary" disabled={!!invalid||configured&&!dirty} onClick={onSave}>{configured&&!dirty?'บันทึกเวลาแล้ว':'บันทึกวันและเวลา'}</button>
 </div>
}
