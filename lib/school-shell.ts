import 'server-only'
import { cache } from 'react'
import { createServerClient } from '@/lib/supabase'

/** School fields needed by AppLayout — cached once per request */
export const getSchoolShell = cache(async (schoolId: string) => {
  const db = createServerClient()
  const { data } = await db
    .from('schools')
    .select('code, acting_director_user_id')
    .eq('id', schoolId)
    .maybeSingle()
  return data
})
