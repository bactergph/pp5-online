import 'server-only'
import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { schoolMemberEmail } from '@/lib/schoolAuth'
import { logActivity } from '@/lib/audit'
import { assertBackupPayload, type BackupPayload } from '@/lib/school-backup/format'
import type { BackupActor } from '@/lib/school-backup/access'

type Phase = { key: string; label: string; state: 'run' | 'done' | 'error'; detail?: string }
const STAFF_ROLES = new Set(['teacher', 'academic_head', 'deputy_principal', 'principal', 'admin'])

function staffEmail(row: Record<string, unknown>, schoolId: string) {
  if (typeof row.email === 'string' && row.email.includes('@')) return row.email
  if (typeof row.username === 'string' && row.username.trim()) return schoolMemberEmail(row.username, schoolId)
  return schoolMemberEmail(`pending-${row.id}`, schoolId)
}

export async function restoreSchoolBackup(
  actor: BackupActor,
  payload: BackupPayload,
  onPhase: (phase: Phase) => void,
) {
  assertBackupPayload(payload, actor.schoolId)
  const db = createServerClient()
  const users = Array.isArray(payload.data.users) ? payload.data.users as Record<string, unknown>[] : []
  onPhase({ key: 'accounts', label: 'เตรียมบัญชีบุคลากร', state: 'run' })
  const created: string[] = []
  let restored = false
  try {
    for (const row of users) {
      if (typeof row.id !== 'string' || typeof row.full_name !== 'string' || !row.full_name.trim()) {
        throw new Error('รายชื่อบุคลากรในไฟล์ไม่ครบ')
      }
      if (!STAFF_ROLES.has(String(row.role || ''))) throw new Error(`นำเข้าบทบาทของ ${row.full_name} ไม่ได้`)
      const { data: existing, error } = await db.from('users').select('id, school_id').eq('id', row.id).maybeSingle()
      if (error) throw new Error(error.message)
      if (existing?.school_id && existing.school_id !== actor.schoolId) {
        throw new Error(`${row.full_name} เป็นบุคลากรของโรงเรียนอื่น`)
      }
      if (existing) continue
      const email = staffEmail(row, actor.schoolId)
      const { error: authError } = await db.auth.admin.createUser({
        id: row.id,
        email,
        password: randomUUID() + randomUUID(),
        email_confirm: true,
        user_metadata: { full_name: row.full_name },
      })
      if (authError) throw new Error(`สร้างบัญชี ${row.full_name} ไม่สำเร็จ: ${authError.message}`)
      created.push(row.id)
      const { error: profileError } = await db.from('users').insert({
        id: row.id,
        school_id: actor.schoolId,
        email,
        prefix: typeof row.prefix === 'string' ? row.prefix : '',
        full_name: row.full_name.trim(),
        position: typeof row.position === 'string' ? row.position : '',
        role: row.role,
        is_active: false,
        is_homeroom: false,
        must_change_password: true,
      })
      if (profileError) throw new Error(profileError.message)
    }
    onPhase({
      key: 'accounts',
      label: 'เตรียมบัญชีบุคลากร',
      state: 'done',
      detail: created.length ? `สร้างบัญชีใหม่ ${created.length} บัญชี` : 'ใช้บัญชีที่มีอยู่',
    })

    onPhase({ key: 'write', label: 'นำเข้าข้อมูลและแทนที่ปีการศึกษานี้', state: 'run' })
    const { data: before } = await db.from('users').select('id, email').eq('school_id', actor.schoolId)
    const { data, error } = await db.rpc('restore_school_backup', {
      p_school_id: actor.schoolId,
      p_actor_id: actor.userId,
      p_payload: payload,
    })
    if (error) throw new Error(error.message)
    restored = true
    if (created.length) {
      const { error: passwordError } = await db.from('users')
        .update({ must_change_password: true })
        .in('id', created)
        .eq('school_id', actor.schoolId)
      if (passwordError) throw new Error(passwordError.message)
    }
    const warnings: string[] = []
    const previous = new Map((before || []).map(row => [row.id, row.email]))
    const { data: after } = await db.from('users').select('id, email').eq('school_id', actor.schoolId)
    for (const row of after || []) {
      if (row.id === actor.userId || !row.email || row.email === previous.get(row.id)) continue
      const { error: emailError } = await db.auth.admin.updateUserById(row.id, { email: row.email, email_confirm: true })
      if (emailError) warnings.push(`${row.email}: ${emailError.message}`)
    }
    const counts = (data || {}) as { students?: number; scores?: number; attendance?: number; schedule?: number }
    const detail = `นักเรียน ${counts.students ?? 0} · คะแนน ${counts.scores ?? 0} · มาเรียน ${counts.attendance ?? 0} · คาบตาราง ${counts.schedule ?? 0}`
    onPhase({ key: 'write', label: 'นำเข้าข้อมูลและแทนที่ปีการศึกษานี้', state: 'done', detail })
    await logActivity({
      actor,
      schoolId: actor.schoolId,
      action: 'import',
      module: 'backup',
      targetType: 'academic_year',
      targetId: payload.academicYear.id,
      targetLabel: String(payload.academicYear.yearBe),
      description: `นำเข้าข้อมูลสำรองปีการศึกษา ${payload.academicYear.yearBe}`,
      metadata: {
        students: counts.students ?? 0,
        scores: counts.scores ?? 0,
        attendance: counts.attendance ?? 0,
        schedule: counts.schedule ?? 0,
        newAccounts: created.length,
      },
    })
    return { counts, created: created.length, warnings }
  } catch (error) {
    if (!restored) {
      for (const id of created) await db.auth.admin.deleteUser(id).catch(() => undefined)
    }
    throw error
  }
}
