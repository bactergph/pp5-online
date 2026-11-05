import 'server-only'
import { cache } from 'react'
import { createServerClient } from '@/lib/supabase'

/** School fields needed by AppLayout — cached once per request */
export const getSchoolShell = cache(async (schoolId: string) => {
  const db = createServerClient()
  let { data, error } = await db
    .from('schools')
    .select('code, acting_director_user_id, name, logo_url, program_name, education_type')
    .eq('id', schoolId)
    .maybeSingle()
  if (error && ['PGRST204', '42703'].includes(error.code)) {
    const fallback = await db.from('schools').select('code, acting_director_user_id, name, logo_url, program_name').eq('id', schoolId).maybeSingle()
    data = fallback.data ? { ...fallback.data, education_type: null } : null
    error = fallback.error
  }
  if (error) throw new Error('โหลดข้อมูลโรงเรียนไม่สำเร็จ')
  return data
})

/** Include opportunity-expansion schools whose school type remains primary. */
export const getSchoolHasSecondaryClasses = cache(async (schoolId: string) => {
  const { data, error } = await createServerClient().from('classrooms').select('id')
    .eq('school_id', schoolId).in('level', ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6']).limit(1)
  if (error) throw new Error('ตรวจสอบชั้นมัธยมของโรงเรียนไม่สำเร็จ')
  return Boolean(data?.length)
})
