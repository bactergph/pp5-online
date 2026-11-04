'use client'
import {hasPeriodProfiles,periodProfiles,type PeriodBand} from '@/lib/schedule-period-profiles'
import type {PeriodTimeRow} from '@/lib/schedule-helpers'
export type PeriodSelection='shared'|PeriodBand
export function selectedPeriodTimes(rows:PeriodTimeRow[],selected:PeriodSelection){return selected==='shared'?rows:periodProfiles(rows)[selected]||rows}
export function replacePeriodSelection(all:PeriodTimeRow[],selected:PeriodSelection,rows:PeriodTimeRow[]){
 const clean=rows.map(({profiles:_,...row})=>row)
 const profiles=periodProfiles(all)
 return selected==='shared'?clean.map((row,i)=>i===0&&Object.keys(profiles).length?{...row,profiles}:row):all.map((row,i)=>({...row,...(i===0?{profiles:{...profiles,[selected]:clean}}:{})}))
}
export default function PeriodProfilePicker({rows,onChange,selected,onSelected,disabled=false}:{rows:PeriodTimeRow[];onChange:(rows:PeriodTimeRow[])=>void;selected:PeriodSelection;onSelected:(band:PeriodSelection)=>void;disabled?:boolean}){
 const split=hasPeriodProfiles(rows)
 function toggle(){
  if(split){if(!window.confirm('กลับไปใช้เวลาชุดเดียวทั้งโรงเรียน? ระบบจะตรวจว่าตารางเดิมมีคาบชนกันหรือไม่ก่อนบันทึก'))return;onChange(rows.map(({profiles:_,...row})=>row));onSelected('shared')}
  else{const clean=rows.map(({profiles:_,...row})=>row);onChange(clean.map((row,i)=>i===0?{...row,profiles:{primary:clean.map(r=>({...r})),secondary:clean.map(r=>({...r}))}}:row));onSelected('primary')}
 }
 return <section style={{padding:16,border:'1px solid #cbdcf4',borderRadius:16,background:'#f3f7ff',marginBottom:16}} aria-label="เวลาเรียนแยกระดับชั้น">
  <label style={{display:'flex',gap:10,alignItems:'center',fontWeight:600}}><input type="checkbox" checked={split} disabled={disabled} onChange={toggle}/>แยกเวลาประถม–มัธยม</label>
  <p style={{fontSize:13,color:'#536881',margin:'8px 0'}}>โรงเรียนขยายโอกาสกำหนดเวลาพักของแต่ละระดับได้ ครูที่สอนข้ามระดับจะตรวจชนตามเวลาจริง</p>
  {split&&<><div role="group" aria-label="เลือกกลุ่มเวลา" style={{display:'flex',gap:8,flexWrap:'wrap'}}>{(['primary','secondary','shared'] as const).map(value=><button type="button" key={value} disabled={disabled} aria-pressed={selected===value} onClick={()=>onSelected(value)} style={{padding:'9px 16px',border:'1px solid #adc6ed',borderRadius:10,background:selected===value?'#235bc8':'white',color:selected===value?'white':'#244264'}}>{value==='primary'?'ประถม ป.1–ป.6':value==='secondary'?'มัธยม ม.1–ม.6':'ค่าเริ่มต้น / เวลาครูไม่ว่าง'}</button>)}</div><p style={{fontSize:12,margin:'8px 0 0'}}>ใช้กับทุกห้องในระดับนั้น · จำนวนคาบต่อวันเท่ากัน · คาบไม่ว่างของครูอ้างอิงเวลาชุดค่าเริ่มต้น</p></>}
 </section>
}
