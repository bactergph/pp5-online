'use client'
import {useEffect,useState} from 'react'
import {useScheduleGuard,useScheduleOperations} from './ScheduleServices'
import WizardPeriodEditor from './WizardPeriodEditor'
import AppAlertModal from '@/components/AppAlertModal'
import {validatePeriodProfiles} from '@/lib/schedule-period-profiles'
import type {PeriodTimeRow} from '@/lib/schedule-helpers'
export default function PeriodTimesEntry(){
 const {fetchPeriodTimes,savePeriodTimes}=useScheduleOperations()
 const [rows,setRows]=useState<PeriodTimeRow[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[configured,setConfigured]=useState(false)
 const [alert,setAlert]=useState<{type:'success'|'error';title:string;message?:string}|null>(null)
 useScheduleGuard(dirty,busy)
 useEffect(()=>{let active=true;fetchPeriodTimes().then(data=>{if(active){setRows(data.times);setConfigured(!data.isDefault)}}).catch(cause=>{if(active)setAlert({type:'error',title:'โหลดเวลาเรียนไม่สำเร็จ',message:cause instanceof Error?cause.message:'กรุณาลองใหม่'})}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[fetchPeriodTimes])
 async function save(){
  if(busy)return
  const invalid=validatePeriodProfiles(rows);if(invalid){setAlert({type:'error',title:'ตรวจสอบเวลาเรียน',message:invalid});return}
  if(!window.confirm('บันทึกเวลาเรียนของโรงเรียน? ใช้ร่วมกันทุกปีและภาคเรียน ระบบจะตรวจตารางเดิมก่อนเปลี่ยนเวลา'))return
  setBusy(true)
  try{await savePeriodTimes(rows);setDirty(false);setConfigured(true);setAlert({type:'success',title:'บันทึกเวลาเรียนแล้ว',message:'ตารางเรียนและตารางครูใช้เวลาชุดเดียวกัน'})}catch(cause){setAlert({type:'error',title:'บันทึกไม่สำเร็จ',message:cause instanceof Error?cause.message:'กรุณาลองใหม่'})}finally{setBusy(false)}
 }
 return <section className="schedule-prep period-workspace"><h1>เวลาเรียนและช่วงพัก</h1><p>แยกเวลาอนุบาล ประถม และมัธยมได้ จำนวนคาบและช่วงพักไม่จำเป็นต้องเท่ากัน</p>{loading?<p role="status">กำลังโหลดเวลาเรียน…</p>:rows.length?<fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><WizardPeriodEditor rows={rows} onChange={next=>{setRows(next);setDirty(true)}} configured={configured} dirty={dirty} onSave={()=>void save()}/></fieldset>:<p role="alert">ยังโหลดเวลาเรียนไม่ได้ กรุณาเปิดหน้านี้ใหม่</p>}{alert&&<AppAlertModal open {...alert} onClose={()=>setAlert(null)}/>}</section>
}
