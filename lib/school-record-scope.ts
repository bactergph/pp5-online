import type { createServerClient } from '@/lib/supabase'
type Db = ReturnType<typeof createServerClient>
type SchoolTable = 'academic_years' | 'classrooms' | 'users' | 'subjects' | 'clubs'

/** Validate every referenced ID, including batches, before a service-role write. */
export async function schoolRecordsMatch(db: Db, schoolId: string | null, table: SchoolTable, ids: readonly unknown[]): Promise<boolean> {
  if (!schoolId || ids.some(id => typeof id !== 'string' || !id.trim())) return false
  const unique = [...new Set(ids as string[])]
  if (!unique.length) return true
  const { data, error } = await db.from(table).select('id').in('id', unique).eq('school_id', schoolId)
  return !error && new Set((data || []).map(row => row.id)).size === unique.length
}

export async function schoolClassSubjectsMatch(db: Db, schoolId: string | null, ids: readonly string[]): Promise<boolean> {
  const unique = [...new Set(ids)]
  if (!schoolId || unique.some(id => !id)) return false
  if (!unique.length) return true
  const { data, error } = await db.from('class_subjects').select('id,classroom_id').in('id', unique)
  return !error && (data || []).length === unique.length
    && schoolRecordsMatch(db, schoolId, 'classrooms', (data || []).map(row => row.classroom_id))
}

export async function schoolStudentsMatchYear(db: Db, schoolId: string | null, yearId: string, ids: readonly string[]): Promise<boolean> {
  const unique = [...new Set(ids)]
  if (!schoolId || !yearId || unique.some(id => !id)) return false
  if (!unique.length) return true
  const { data, error } = await db.from('students').select('id,classroom_id').in('id', unique)
  if (error || (data || []).length !== unique.length) return false
  const rooms = [...new Set((data || []).map(row => row.classroom_id))]
  const { data: classrooms, error: roomError } = await db.from('classrooms').select('id')
    .in('id', rooms).eq('school_id', schoolId).eq('academic_year_id', yearId)
  return !roomError && (classrooms || []).length === rooms.length
}
