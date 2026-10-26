'use server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { scheduleResult } from '@/lib/schedule-action-result'
import { primarySubjectGrade, type CentralScheduleSubject } from '@/lib/schedule-central-subjects'

/** Shared reference data, available to signed-in Free accounts without school access. */
export async function fetchPrimaryScheduleSubjects() {
  return scheduleResult(async()=>{
    const session=await getSession(true)
    if(!session||session.mustChangePassword)throw Error('กรุณาเข้าสู่ระบบและตั้งรหัสผ่านให้เรียบร้อยก่อนดึงรายวิชากลาง')
    const db=createServerClient(),subjects:CentralScheduleSubject[]=[]
    for(let offset=0;;offset+=500){
      const {data,error}=await db.from('global_subjects')
        .select('code,name,subject_group,type,hours_per_year,sort_order')
        .eq('is_active',true).like('code','_1%').order('code').range(offset,offset+499)
      if(error)throw Error('โหลดโครงสร้างรายวิชากลางไม่สำเร็จ กรุณาลองอีกครั้ง')
      const batch=(data||[]) as CentralScheduleSubject[]
      subjects.push(...batch.filter(subject=>primarySubjectGrade(subject.code)!==null))
      if(batch.length<500)break
    }
    return subjects
  })
}
