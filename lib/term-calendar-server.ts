import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { termClosedDays } from '@/lib/term-calendar'
export async function fetchTermClosedDays(academicYearId:string,start:string,end:string) {
  const {data,error}=await createServerClient().from('academic_years').select('term1_start_date,term1_end_date,term2_start_date,term2_end_date').eq('id',academicYearId).maybeSingle()
  if(error) throw Error('โหลดวันเปิด–ปิดภาคเรียนไม่สำเร็จ')
  return termClosedDays(start,end,data)
}
