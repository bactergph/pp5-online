import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { formatStaffName, splitThaiStaffName } from '@/lib/roles'
import { saveStaffRows } from '@/lib/staff-table'

export type LeaderStaffRequest = {
  key: string
  name?: string | null
  userId?: string | null
  position: string
  role: string
}

const ROLE_RANK: Record<string, number> = { principal: 4, deputy_principal: 3, academic_head: 2, teacher: 1 }

function personKey(prefix: string, fullName: string) {
  return formatStaffName(prefix, fullName).replace(/\s+/g, '')
}

/** A typed leader name becomes a school staff row, reusing a person who is already on the roster. */
export async function attachTypedNamesToStaff(schoolId: string, requests: LeaderStaffRequest[]) {
  const db = createServerClient()
  const { data, error } = await db.from('users').select('id, prefix, full_name').eq('school_id', schoolId).neq('role', 'district')
  if (error) throw new Error(error.message)
  const byName = new Map<string, string>()
  for (const user of data || []) byName.set(personKey(user.prefix || '', user.full_name || ''), user.id)

  const resolved: Record<string, { userId: string | null; name: string | null }> = {}
  const pending: { key: string; prefix: string; full_name: string; position: string; role: string }[] = []
  for (const request of requests) {
    const typed = (request.name || '').trim()
    if (request.userId) {
      const known = (data || []).find(user => user.id === request.userId)
      if (known) byName.set(personKey(known.prefix || '', known.full_name || ''), known.id)
      resolved[request.key] = { userId: request.userId, name: typed || null }
      continue
    }
    if (!typed) {
      resolved[request.key] = { userId: null, name: null }
      continue
    }
    const parts = splitThaiStaffName(typed)
    if (!parts.full_name) throw new Error('กรอกชื่อและนามสกุลของผู้บริหาร')
    const key = personKey(parts.prefix, parts.full_name)
    const existing = byName.get(key)
    if (existing) {
      resolved[request.key] = { userId: existing, name: formatStaffName(parts.prefix, parts.full_name) }
      continue
    }
    const queued = pending.find(row => row.key === key)
    if (queued) {
      if ((ROLE_RANK[request.role] || 0) > (ROLE_RANK[queued.role] || 0)) {
        queued.role = request.role
        queued.position = request.position
      }
      continue
    }
    pending.push({ key, prefix: parts.prefix, full_name: parts.full_name, position: request.position, role: request.role || 'teacher' })
  }

  if (pending.length) {
    const results = await saveStaffRows(pending.map(row => ({
      key: row.key,
      prefix: row.prefix,
      full_name: row.full_name,
      position: row.position,
      role: '',
      username: '',
      password: '',
      is_homeroom: false,
    })))
    const failed = results.find(row => row.error)
    if (failed?.error) throw new Error(failed.error)
    for (const row of pending) {
      const created = results.find(item => item.key === row.key)
      if (!created?.id) throw new Error('เพิ่มบุคลากรไม่สำเร็จ')
      const { error: updateError } = await db.from('users').update({
        role: row.role || 'teacher',
        position: row.position,
        is_active: true,
      }).eq('id', created.id).eq('school_id', schoolId)
      if (updateError) throw new Error(updateError.message)
      byName.set(row.key, created.id)
    }
  }

  for (const request of requests) {
    if (resolved[request.key]) continue
    const parts = splitThaiStaffName(request.name || '')
    const userId = byName.get(personKey(parts.prefix, parts.full_name)) || null
    resolved[request.key] = { userId, name: userId ? formatStaffName(parts.prefix, parts.full_name) : null }
  }
  return resolved
}

export function actingLeaderRole(position?: string | null) {
  const text = (position || '').trim()
  if (text.includes('รอง')) return 'deputy_principal'
  if (text.includes('ผู้อำนวยการ') || text.includes('ผอ')) return 'principal'
  return 'teacher'
}
