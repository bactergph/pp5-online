import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { homeroomSeatsFromClassrooms, orderTeachers, type HomeroomSeat } from '@/lib/teacher-order'

type Db = ReturnType<typeof createServerClient>

export async function readHomeroomSeats(db: Db, schoolId: string): Promise<HomeroomSeat[]> {
  if (!schoolId) return []
  const year = await db.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  if (!year.data?.id) return []
  const rooms = await db.from('classrooms').select('level, room, homeroom_teacher_id, homeroom_teacher2_id').eq('school_id', schoolId).eq('academic_year_id', year.data.id)
  return homeroomSeatsFromClassrooms(rooms.data || [])
}

export async function withHomeroomOrder<T extends { id: string; role?: string | null; prefix?: string | null; full_name?: string | null; name?: string | null }>(
  db: Db,
  schoolId: string,
  teachers: T[],
  leadersFirst = false,
) {
  return orderTeachers(teachers, await readHomeroomSeats(db, schoolId), leadersFirst)
}
