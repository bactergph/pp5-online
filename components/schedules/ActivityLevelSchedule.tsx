'use client'
import {useEffect,useState} from 'react'
import Swal from 'sweetalert2'
import {fetchActivityLevelOptions,saveActivityLevelSchedule} from '@/app/schedules/actions'
import {type PeriodTimeRow} from '@/lib/schedule-helpers'
export default function ActivityLevelSchedule({yearId,semester,periodTimes,onChanged}:{yearId:string;semester:number;periodTimes:PeriodTimeRow[];onChanged:()=>Promise<void>}){
  const [data,setData]=useState<Awaited<ReturnType<typeof fetchActivityLevelOptions>>|null>(null)
  const [activity,setActivity]=useState(''),[levels,setLevels]=useState<string[]>([]),[day,setDay]=useState(1),[period,setPeriod]=useState(1),[saving,setSaving]=useState(false)
  useEffect(()=>{let active=true;void fetchActivityLevelOptions(yearId,semester).then(next=>{if(active){setData(next);setActivity(next.activities[0]?.id||'')}}).catch(e=>{if(active)void Swal.fire({icon:'error',title:'โหลดกิจกรรมไม่สำเร็จ',text:e.message})});return()=>{active=false}},[yearId,semester])
  async function save(){
    if(!activity||!levels.length)return
    const confirm=await Swal.fire({icon:'question',title:'ลงกิจกรรมในระดับชั้นที่เลือก?',text:`${data?.activities.find(a=>a.id===activity)?.name} · ${levels.join(', ')} · คาบ ${period} · ภาคเรียนที่ ${semester} ลงให้ทุกห้องในระดับชั้นที่เลือก`,showCancelButton:true,confirmButtonText:'ลงกิจกรรม',cancelButtonText:'ยกเลิก',confirmButtonColor:'#946b25'})
    if(!confirm.isConfirmed)return
    setSaving(true)
    try{const result=await saveActivityLevelSchedule(yearId,semester,activity,levels,day,period);if(result.error)throw Error(result.error);await onChanged();await Swal.fire({icon:'success',title:'ลงกิจกรรมแล้ว',text:`เพิ่ม ${result.data?.added} ห้อง`,confirmButtonText:'ตกลง'})}catch(e){await Swal.fire({icon:'error',title:'ลงกิจกรรมไม่สำเร็จ',text:e instanceof Error?e.message:'เกิดข้อผิดพลาด'})}finally{setSaving(false)}
  }
  return <section className="grid gap-4 rounded-lg border border-emerald-200 bg-white p-5 [&_select]:min-h-11 [&_select]:rounded-md [&_select]:border [&_select]:border-stone-300 [&_select]:bg-white [&_select]:px-3 [&_label]:grid [&_label]:gap-2 [&_label]:text-sm">
    <div><h2 className="text-lg font-semibold">เลือกกิจกรรมและระดับชั้น</h2><p className="mt-1 text-sm text-stone-500">ไม่ต้องระบุครู · ลงทุกห้องในชั้นที่เลือก · กิจกรรมละ 1 คาบต่อสัปดาห์</p></div>
    {!data?<p>กำลังโหลด...</p>:<fieldset disabled={saving} className="grid gap-4 disabled:opacity-60">
      <label>กิจกรรม<select value={activity} onChange={e=>setActivity(e.target.value)}>{data.activities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <div><p className="mb-2 text-sm font-semibold">ลงให้ระดับชั้นไหน</p><div className="flex flex-wrap gap-3">{data.levels.map(level=><label key={level} className="flex! flex-row! items-center gap-2 rounded-md border border-stone-200 px-3 py-2"><input type="checkbox" checked={levels.includes(level)} onChange={e=>setLevels(current=>e.target.checked?[...current,level]:current.filter(x=>x!==level))}/>{level}</label>)}</div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label>วัน<select value={day} onChange={e=>setDay(Number(e.target.value))}>{['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์'].map((name,i)=><option key={name} value={i+1}>{name}</option>)}</select></label><label>คาบ<select value={period} onChange={e=>setPeriod(Number(e.target.value))}>{periodTimes.filter(t=>!t.is_break).map(t=><option key={t.period} value={t.period}>คาบ {t.period} · {t.start_time}–{t.end_time}</option>)}</select></label></div>
      <button className="w-fit rounded-md bg-emerald-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!activity||!levels.length} onClick={()=>void save()}>{saving?'กำลังลงกิจกรรม...':'ลงกิจกรรมให้ระดับชั้นที่เลือก'}</button>
    </fieldset>}
  </section>
}
