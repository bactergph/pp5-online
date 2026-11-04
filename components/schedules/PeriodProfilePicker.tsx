'use client'
import {PERIOD_BANDS,periodBand,periodProfiles,type PeriodBand} from '@/lib/schedule-period-profiles'
import type {PeriodTimeRow} from '@/lib/schedule-helpers'
export type PeriodSelection='shared'|PeriodBand
export function selectedPeriodTimes(rows:PeriodTimeRow[],selected:PeriodSelection){return selected==='shared'?rows:periodProfiles(rows)[selected]||rows}
export function replacePeriodSelection(all:PeriodTimeRow[],selected:PeriodSelection,rows:PeriodTimeRow[]){
 const clean=rows.map(({profiles:_,teacherActivities:__,...row})=>row),profiles=periodProfiles(all)
 return selected==='shared'?clean.map((row,i)=>i===0&&Object.keys(profiles).length?{...row,profiles}:row):all.map(({teacherActivities:_,...row},i)=>({...row,...(i===0?{profiles:{...profiles,[selected]:clean}}:{})}))
}
export default function PeriodProfilePicker({rows,levels,selected,onSelected,disabled=false}:{rows:PeriodTimeRow[];levels?:string[];onChange?:(rows:PeriodTimeRow[])=>void;selected:PeriodSelection;onSelected:(band:PeriodSelection)=>void;disabled?:boolean}){
 const bands=PERIOD_BANDS.filter(b=>!levels||levels.some(level=>periodBand(level)===b.id))
 return <section className="schedule-clock-picker" aria-label="เวลาเรียนแยกช่วงชั้น">
  {bands.length>0&&<div className="schedule-clock-tabs" role="group" aria-label="เลือกช่วงชั้น">{bands.map(b=>{const times=selectedPeriodTimes(rows,b.id);return <button type="button" key={b.id} disabled={disabled} aria-pressed={selected===b.id} onClick={()=>onSelected(b.id)}><strong>{b.label}</strong><span>{b.grades}</span><small>{times[0]?.start_time}–{times.at(-1)?.end_time} · {times.filter(t=>!t.is_break).length} ช่วงเรียน</small></button>})}</div>}
  <details className="schedule-clock-advanced"><summary>ตั้งค่าช่วงเวลาสำหรับล็อกครูไม่ว่าง</summary><p>คาบไม่ว่างแบบเดิมอ้างอิงเวลาชุดนี้ และตรวจทับกับเวลาเรียนจริงของทุกช่วงชั้น</p><button type="button" disabled={disabled} aria-pressed={selected==='shared'} onClick={()=>onSelected('shared')}>เวลาครูไม่ว่าง / ค่าเริ่มต้น</button></details>
 </section>
}
