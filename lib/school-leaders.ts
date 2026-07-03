import 'server-only'
import { formatStaffName } from '@/lib/roles'

type Db = ReturnType<typeof import('@/lib/supabase').createServerClient>

type UserRow = {
  id: string
  prefix?: string | null
  full_name?: string | null
  role?: string | null
}

const ROLE_LEADER_MAP: Record<string, { nameKey: string; userIdKey: string }> = {
  principal: { nameKey: 'director_name', userIdKey: 'director_user_id' },
  deputy_principal: { nameKey: 'vice_director_name', userIdKey: 'vice_director_user_id' },
  academic_head: { nameKey: 'academic_head_name', userIdKey: 'academic_head_user_id' },
}

const LEADER_USER_ID_COLUMNS = [
  'director_user_id',
  'vice_director_user_id',
  'acting_director_user_id',
  'academic_head_user_id',
  'measurement_head_user_id',
] as const

export async function clearUserFromLeaderSlots(db: Db, schoolId: string, userId: string) {
  for (const col of LEADER_USER_ID_COLUMNS) {
    await db.from('schools').update({ [col]: null }).eq('id', schoolId).eq(col, userId)
  }
}

export async function syncUserRoleToSchoolLeaders(db: Db, schoolId: string, user: UserRow) {
  if (!user.id || !user.role) return
  await clearUserFromLeaderSlots(db, schoolId, user.id)

  const mapping = user.role ? ROLE_LEADER_MAP[user.role] : null
  if (!mapping) return

  const name = formatStaffName(user.prefix, user.full_name)
  await db.from('schools').update({
    [mapping.nameKey]: name || null,
    [mapping.userIdKey]: user.id,
  }).eq('id', schoolId)
}

export async function syncSchoolLeaderSlot(
  db: Db,
  schoolId: string,
  slot: 'director' | 'vice_director' | 'acting' | 'academic_head' | 'measurement_head',
  userId: string | null,
  displayName: string,
) {
  const map = {
    director: { nameKey: 'director_name', userIdKey: 'director_user_id' },
    vice_director: { nameKey: 'vice_director_name', userIdKey: 'vice_director_user_id' },
    acting: { nameKey: 'acting_director', userIdKey: 'acting_director_user_id' },
    academic_head: { nameKey: 'academic_head_name', userIdKey: 'academic_head_user_id' },
    measurement_head: { nameKey: 'measurement_head_name', userIdKey: 'measurement_head_user_id' },
  } as const

  const keys = map[slot]
  await db.from('schools').update({
    [keys.nameKey]: displayName.trim() || null,
    [keys.userIdKey]: userId,
  }).eq('id', schoolId)
}
