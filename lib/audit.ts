import 'server-only'
import { createServerClient } from './supabase'
import { getSession, type SessionPayload } from './session'

type MetadataValue = string | number | boolean | null | MetadataValue[] | { [key: string]: MetadataValue }

export type ActivityLogInput = {
  schoolId?: string | null
  actor?: Pick<SessionPayload, 'userId' | 'role' | 'fullName' | 'schoolId'> | null
  action: string
  module: string
  targetType?: string | null
  targetId?: string | null
  targetLabel?: string | null
  description: string
  metadata?: Record<string, MetadataValue>
}

export type ActivityLogFilters = {
  schoolId?: string | null
  actorId?: string | null
  actorRole?: string | null
  module?: string | null
  action?: string | null
  from?: string | null
  to?: string | null
  limit?: number
}

export async function logActivity(input: ActivityLogInput) {
  try {
    const actor = input.actor ?? await getSession()
    const schoolId = input.schoolId ?? actor?.schoolId ?? null
    const db = createServerClient()

    await db.from('activity_logs').insert({
      school_id: schoolId,
      actor_id: actor?.userId ?? null,
      actor_name: actor?.fullName ?? null,
      actor_role: actor?.role ?? null,
      action: input.action,
      module: input.module,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      target_label: input.targetLabel ?? null,
      description: input.description,
      metadata: input.metadata ?? {},
    })
  } catch (error) {
    console.error('[audit] failed to write activity log', error)
  }
}

export async function fetchActivityLogs(filters: ActivityLogFilters = {}) {
  const db = createServerClient()
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200)
  let query = db.from('activity_logs')
    .select('id, school_id, actor_id, actor_name, actor_role, action, module, target_type, target_id, target_label, description, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters.schoolId) query = query.eq('school_id', filters.schoolId)
  if (filters.actorId) query = query.eq('actor_id', filters.actorId)
  if (filters.actorRole) query = query.eq('actor_role', filters.actorRole)
  if (filters.module) query = query.eq('module', filters.module)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)

  const { data, error } = await query
  if (error) {
    const missingTable = error.message.includes('activity_logs') || error.code === 'PGRST205'
    return {
      logs: [],
      error: missingTable
        ? 'ยังไม่ได้ติดตั้งตาราง activity_logs กรุณา apply migration 012_activity_logs.sql ก่อนใช้งานประวัติ'
        : error.message,
    }
  }
  return { logs: data || [], error: null }
}

export async function fetchActivitySchools() {
  const db = createServerClient()
  const { data: admins } = await db.from('users')
    .select('school_id')
    .eq('role', 'admin')
    .not('school_id', 'is', null)
  const schoolIds = [...new Set((admins || []).map(row => row.school_id).filter(Boolean))]
  if (schoolIds.length === 0) return []

  const { data, error } = await db.from('schools')
    .select('id, name, code')
    .in('id', schoolIds)
    .order('name')
  if (error) return []
  return data || []
}

export async function resolveClassroomSchoolId(classroomId: string) {
  const db = createServerClient()
  const { data } = await db.from('classrooms')
    .select('school_id')
    .eq('id', classroomId)
    .maybeSingle()
  return data?.school_id ?? null
}

export async function resolveStudentSchoolId(studentId: string) {
  const db = createServerClient()
  const { data } = await db.from('students')
    .select('classrooms(school_id)')
    .eq('id', studentId)
    .maybeSingle()
  const classroom = Array.isArray(data?.classrooms) ? data?.classrooms[0] : data?.classrooms
  return classroom?.school_id ?? null
}

export async function resolveClassSubjectContext(classSubjectId: string) {
  const db = createServerClient()
  const { data } = await db.from('class_subjects')
    .select('id, subjects(code, name), classrooms(id, level, room, school_id)')
    .eq('id', classSubjectId)
    .maybeSingle()
  const subject = Array.isArray(data?.subjects) ? data?.subjects[0] : data?.subjects
  const classroom = Array.isArray(data?.classrooms) ? data?.classrooms[0] : data?.classrooms
  return {
    schoolId: classroom?.school_id ?? null,
    classroomLabel: classroom ? `${classroom.level}/${classroom.room}` : null,
    subjectLabel: subject ? `${subject.name} (${subject.code})` : null,
  }
}
