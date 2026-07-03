'use server'

import { createServerClient } from '@/lib/supabase'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'
import { deleteEvaluationSettingsForSchool } from '@/lib/evaluation-settings-seed'

export type CleanupSchoolRow = {
  id: string
  name: string
  province: string | null
  district: string | null
  settings_count: number
}

async function activeSchoolIds(db: ReturnType<typeof createServerClient>) {
  const active = new Set<string>()
  for (const table of ['users', 'classrooms'] as const) {
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from(table).select('school_id').range(from, from + 999)
      if (!data?.length) break
      for (const row of data) {
        if (row.school_id) active.add(row.school_id)
      }
      if (data.length < 1000) break
    }
  }
  return active
}

export async function fetchCleanupSummary() {
  await requireDistrict()
  const db = createServerClient()
  const activeIds = await activeSchoolIds(db)

  const { count: schoolCount } = await db.from('schools').select('id', { count: 'exact', head: true })
  const { count: settingsCount } = await db.from('evaluation_settings').select('id', { count: 'exact', head: true })

  const activeList = [...activeIds]
  let activeSettingsCount = 0
  if (activeList.length > 0) {
    const { count } = await db.from('evaluation_settings')
      .select('id', { count: 'exact', head: true })
      .in('school_id', activeList)
    activeSettingsCount = count ?? 0
  }

  return {
    schoolCount: schoolCount ?? 0,
    activeSchoolCount: activeIds.size,
    orphanSchoolCount: Math.max(0, (schoolCount ?? 0) - activeIds.size),
    settingsCount: settingsCount ?? 0,
    orphanSettingsCount: Math.max(0, (settingsCount ?? 0) - activeSettingsCount),
  }
}

export async function fetchCleanupCandidates(search = '', limit = 80) {
  await requireDistrict()
  const db = createServerClient()
  const activeIds = await activeSchoolIds(db)
  const needle = search.trim().toLowerCase()

  const rows: CleanupSchoolRow[] = []
  for (let from = 0; rows.length < limit; from += 1000) {
    let query = db.from('schools').select('id, name, province, district').order('name').range(from, from + 999)
    if (needle) query = query.ilike('name', `%${needle}%`)
    const { data: schools } = await query
    if (!schools?.length) break

    for (const school of schools) {
      if (activeIds.has(school.id)) continue
      const { count } = await db.from('evaluation_settings')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', school.id)
      if (!count) continue
      rows.push({
        id: school.id,
        name: school.name,
        province: school.province,
        district: school.district,
        settings_count: count,
      })
      if (rows.length >= limit) break
    }
    if (schools.length < 1000) break
  }

  return { schools: rows }
}

export async function cleanupEvaluationSettings(schoolIds: string[]) {
  const session = await requireDistrict()
  if (!schoolIds.length) return { error: 'ไม่ได้เลือกโรงเรียน', deleted: 0 }

  const db = createServerClient()
  const activeIds = await activeSchoolIds(db)
  const blocked = schoolIds.filter(id => activeIds.has(id))
  if (blocked.length > 0) {
    return { error: 'ไม่สามารถล้างข้อมูลโรงเรียนที่มีผู้ใช้หรือห้องเรียนแล้ว', deleted: 0 }
  }

  let deleted = 0
  const cleanedNames: string[] = []
  for (const schoolId of schoolIds) {
    const { data: school } = await db.from('schools').select('name').eq('id', schoolId).maybeSingle()
    const result = await deleteEvaluationSettingsForSchool(schoolId)
    if (result.error) return { error: result.error, deleted }
    deleted += result.count
    if (school?.name) cleanedNames.push(school.name)
  }

  await logActivity({
    actor: session,
    schoolId: null,
    action: 'cleanup',
    module: 'school_cleanup',
    targetType: 'evaluation_settings',
    targetId: null,
    targetLabel: 'evaluation_settings',
    description: `ล้างการตั้งค่าประเมินของโรงเรียนที่ไม่ใช้งาน ${schoolIds.length} แห่ง (${deleted} แถว)`,
    metadata: { schoolIds, deleted, schoolNames: cleanedNames.slice(0, 20) },
  })

  return { error: null, deleted }
}

export async function cleanupAllOrphanEvaluationSettings() {
  const session = await requireDistrict()
  const db = createServerClient()
  const activeIds = await activeSchoolIds(db)

  const orphanIds: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('schools').select('id').range(from, from + 999)
    if (!data?.length) break
    for (const school of data) {
      if (!activeIds.has(school.id)) orphanIds.push(school.id)
    }
    if (data.length < 1000) break
  }

  let deleted = 0
  const BATCH = 25
  for (let i = 0; i < orphanIds.length; i += BATCH) {
    const chunk = orphanIds.slice(i, i + BATCH)
    const { error, count } = await db.from('evaluation_settings')
      .delete({ count: 'exact' })
      .in('school_id', chunk)
    if (error) return { error: error.message, deleted }
    deleted += count ?? 0
  }

  await logActivity({
    actor: session,
    schoolId: null,
    action: 'cleanup_all',
    module: 'school_cleanup',
    targetType: 'evaluation_settings',
    description: `ล้างการตั้งค่าประเมินของโรงเรียนที่ไม่ใช้งานทั้งหมด (${deleted} แถว)`,
    metadata: { orphanSchools: orphanIds.length, deleted },
  })

  return {
    error: null,
    deleted,
    orphanSchools: orphanIds.length,
    vacuumHint: deleted > 0
      ? 'ลบแถวแล้ว แต่ disk อาจยังไม่ลดจนกว่าจะรัน VACUUM FULL ใน SQL Editor (ดู migration 029)'
      : null,
  }
}
