import 'server-only'
import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { schoolMemberEmail } from '@/lib/schoolAuth'
import { logActivity } from '@/lib/audit'
import { assertBackupPayload, type BackupPayload } from '@/lib/school-backup/format'
import type { BackupActor } from '@/lib/school-backup/access'

type Phase = { key: string; label: string; state: 'run' | 'done' | 'error'; detail?: string }
const STAFF_ROLES = new Set(['teacher', 'academic_head', 'deputy_principal', 'principal', 'admin'])
const UPSERT_STEPS = [
  ['subjects', 'รายวิชา'],
  ['evaluation_settings', 'เกณฑ์การประเมิน'],
  ['clubs', 'ชุมนุม'],
] as const
const CLEAR_STEPS = [
  ['schedule_substitute_entries', 'ล้างแถวสอนแทนเดิม'],
  ['hourly_attendance', 'ล้างเวลาเรียนเดิม'],
  ['daily_attendance', 'ล้างการมาเรียนเดิม'],
  ['daily_activities', 'ล้างกิจกรรมประจำวันเดิม'],
  ['scores', 'ล้างคะแนนเดิม'],
  ['score_configs', 'ล้างสัดส่วนคะแนนเดิม'],
  ['approval_signatures', 'ล้างการอนุมัติคะแนนเดิม'],
  ['class_schedule_slots', 'ล้างตารางเรียนเดิม'],
  ['class_schedule_activities', 'ล้างกิจกรรมในตารางเดิม'],
  ['document_references', 'ล้างรหัสเอกสารเดิม'],
  ['approved_document_exports', 'ล้างเอกสารที่อนุมัติเดิม'],
  ['class_document_approvals', 'ล้างการเสนอเซ็นเดิม'],
  ['document_approval_submissions', 'ล้างประวัติการเสนอเดิม'],
  ['student_health', 'ล้างข้อมูลสุขภาพเดิม'],
  ['health_inspection', 'ล้างการตรวจสุขภาพเดิม'],
  ['character_traits', 'ล้างคุณลักษณะเดิม'],
  ['reading_evaluation', 'ล้างการอ่านคิดวิเคราะห์เดิม'],
  ['activities_evaluation', 'ล้างกิจกรรมพัฒนาผู้เรียนเดิม'],
  ['competency_evaluation', 'ล้างสมรรถนะเดิม'],
  ['evaluation_custom_scores', 'ล้างคะแนนประเมินเดิม'],
  ['teacher_comments', 'ล้างความเห็นครูเดิม'],
  ['student_club_assignments', 'ล้างชุมนุมของนักเรียนเดิม'],
  ['students', 'ล้างรายชื่อนักเรียนเดิม'],
  ['class_subjects', 'ล้างวิชาที่เปิดสอนเดิม'],
  ['teacher_permissions', 'ล้างสิทธิ์ครูเดิม'],
  ['period_config', 'ล้างเวลาเรียนรายห้องเดิม'],
  ['personal_homeroom_rooms', 'ล้างห้องประจำชั้นเดิม'],
  ['schedule_drafts', 'ล้างฉบับร่างตารางเดิม'],
  ['schedule_plans', 'ล้างแผนตารางเดิม'],
  ['schedule_teacher_blocks', 'ล้างคาบล็อกเดิม'],
  ['schedule_substitute_days', 'ล้างวันสอนแทนเดิม'],
  ['substitute_documents', 'ล้างเอกสารสอนแทนเดิม'],
  ['classrooms', 'ล้างห้องเรียนเดิม'],
  ['holidays', 'ล้างวันหยุดเดิม'],
  ['weekend_school_days', 'ล้างวันเปิดสอนพิเศษเดิม'],
] as const
const INSERT_STEPS = [
  ['classrooms', 'ห้องเรียน'],
  ['period_config', 'เวลาเรียนรายห้อง'],
  ['holidays', 'วันหยุด'],
  ['weekend_school_days', 'วันเปิดสอนพิเศษ'],
  ['students', 'นักเรียน'],
  ['class_subjects', 'วิชาที่เปิดสอน'],
  ['teacher_permissions', 'สิทธิ์ครู'],
  ['score_configs', 'สัดส่วนคะแนน'],
  ['scores', 'คะแนนและเกรด'],
  ['daily_attendance', 'การมาเรียน'],
  ['hourly_attendance', 'เวลาเรียน'],
  ['daily_activities', 'กิจกรรมประจำวัน'],
  ['student_health', 'น้ำหนักและส่วนสูง'],
  ['health_inspection', 'การตรวจสุขภาพ'],
  ['character_traits', 'คุณลักษณะอันพึงประสงค์'],
  ['reading_evaluation', 'อ่านคิดวิเคราะห์'],
  ['activities_evaluation', 'กิจกรรมพัฒนาผู้เรียน'],
  ['competency_evaluation', 'สมรรถนะ'],
  ['evaluation_custom_scores', 'คะแนนประเมินเพิ่มเติม'],
  ['teacher_comments', 'ความเห็นครู'],
  ['student_club_assignments', 'ชุมนุมของนักเรียน'],
  ['class_schedule_activities', 'กิจกรรมในตาราง'],
  ['class_schedule_slots', 'ตารางเรียน'],
  ['schedule_plans', 'แผนตาราง'],
  ['schedule_drafts', 'ฉบับร่างตาราง'],
  ['schedule_teacher_blocks', 'คาบล็อก'],
  ['schedule_substitute_days', 'วันสอนแทน'],
  ['schedule_substitute_entries', 'แถวสอนแทน'],
  ['substitute_documents', 'เอกสารสอนแทน'],
  ['personal_homeroom_rooms', 'ห้องประจำชั้น'],
  ['class_document_approvals', 'การเสนอเซ็น'],
  ['document_approval_submissions', 'ประวัติการเสนอ'],
  ['approval_signatures', 'การอนุมัติคะแนน'],
  ['approved_document_exports', 'เอกสารที่อนุมัติ'],
  ['document_references', 'รหัสเอกสาร'],
] as const

function timeoutMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'นำเข้าข้อมูลไม่สำเร็จ'
  return /statement timeout/i.test(message)
    ? 'นำเข้าใช้เวลานานเกินกำหนดของฐานข้อมูล ลองอีกครั้งได้ ระบบจะทำต่อเป็นชุดเล็ก'
    : message
}

async function rpc(db: ReturnType<typeof createServerClient>, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

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

    const { data: before } = await db.from('users').select('id, email').eq('school_id', actor.schoolId)
    onPhase({ key: 'catalog', label: 'ข้อมูลโรงเรียน บุคลากร และเวลาคาบ', state: 'run' })
    const preparePayload = {
      ...payload,
      data: {
        school: payload.data.school,
        academicYear: payload.data.academicYear,
        users: payload.data.users,
        school_subject_groups: payload.data.school_subject_groups,
        subject_group_heads: payload.data.subject_group_heads,
        school_period_times: payload.data.school_period_times,
        device_schedule_uploads: payload.data.device_schedule_uploads,
      },
    }
    await rpc(db, 'backup_restore_prepare', {
      p_school_id: actor.schoolId,
      p_actor_id: actor.userId,
      p_payload: preparePayload,
    })
    restored = true
    onPhase({ key: 'catalog', label: 'ข้อมูลโรงเรียน บุคลากร และเวลาคาบ', state: 'done' })

    onPhase({ key: 'upsert', label: 'รายวิชาและเกณฑ์', state: 'run' })
    for (const [target, label] of UPSERT_STEPS) {
      const rows = Array.isArray(payload.data[target]) ? payload.data[target] as unknown[] : []
      for (let index = 0; index < rows.length; index += 200) {
        await rpc(db, 'backup_restore_upsert_batch', {
          p_school_id: actor.schoolId,
          p_target: target,
          p_rows: rows.slice(index, index + 200),
        })
        onPhase({
          key: 'upsert',
          label: 'รายวิชาและเกณฑ์',
          state: 'run',
          detail: `${label} ${Math.min(index + 200, rows.length).toLocaleString('th-TH')}/${rows.length.toLocaleString('th-TH')}`,
        })
      }
    }
    onPhase({ key: 'upsert', label: 'รายวิชาและเกณฑ์', state: 'done' })

    onPhase({ key: 'clear', label: 'ล้างข้อมูลเดิมของปีนี้', state: 'run' })
    for (const [target, label] of CLEAR_STEPS) {
      let removed = 0
      let limit = 250
      for (;;) {
        let count = 0
        try {
          count = Number(await rpc(db, 'backup_restore_clear_batch', {
            p_school_id: actor.schoolId,
            p_year: payload.academicYear.id,
            p_target: target,
            p_limit: limit,
          }) || 0)
        } catch (error) {
          if (limit <= 100 || !/statement timeout/i.test(error instanceof Error ? error.message : '')) throw error
          limit = Math.floor(limit / 2)
          continue
        }
        if (!count) break
        removed += count
        onPhase({ key: 'clear', label: 'ล้างข้อมูลเดิมของปีนี้', state: 'run', detail: `${label} · ลบแล้ว ${removed.toLocaleString('th-TH')} แถว` })
      }
    }
    onPhase({ key: 'clear', label: 'ล้างข้อมูลเดิมของปีนี้', state: 'done' })

    onPhase({ key: 'insert', label: 'นำเข้าข้อมูลใหม่', state: 'run' })
    for (const [target, label] of INSERT_STEPS) {
      const rows = Array.isArray(payload.data[target]) ? payload.data[target] as unknown[] : []
      let limit = 200
      for (let index = 0; index < rows.length;) {
        try {
          await rpc(db, 'backup_restore_insert_batch', {
            p_school_id: actor.schoolId,
            p_year: payload.academicYear.id,
            p_target: target,
            p_rows: rows.slice(index, index + limit),
          })
        } catch (error) {
          if (limit <= 25 || !/statement timeout/i.test(error instanceof Error ? error.message : '')) throw error
          limit = Math.floor(limit / 2)
          continue
        }
        index += limit
        onPhase({
          key: 'insert',
          label: 'นำเข้าข้อมูลใหม่',
          state: 'run',
          detail: rows.length ? `${label} ${Math.min(index, rows.length).toLocaleString('th-TH')}/${rows.length.toLocaleString('th-TH')}` : label,
        })
      }
    }
    onPhase({ key: 'insert', label: 'นำเข้าข้อมูลใหม่', state: 'done' })

    onPhase({ key: 'write', label: 'ตรวจผลหลังนำเข้า', state: 'run' })
    const data = await rpc(db, 'backup_restore_counts', {
      p_school_id: actor.schoolId,
      p_year: payload.academicYear.id,
    })
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
    onPhase({ key: 'write', label: 'ตรวจผลหลังนำเข้า', state: 'done', detail })
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
    throw new Error(timeoutMessage(error))
  }
}
