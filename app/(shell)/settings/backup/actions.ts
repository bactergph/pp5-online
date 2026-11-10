'use server'

import { createServerClient } from '@/lib/supabase'
import { requireAdminSettings } from '@/lib/settings-guard'
import { logActivity } from '@/lib/audit'
import { requireBackupActor } from '@/lib/school-backup/access'
import { deleteDriveBackup, listDriveBackups, renameDriveBackup, type DriveBackupFile } from '@/lib/school-backup/drive'

export async function fetchBackupPage(): Promise<{
  years: { id: string; year_be: number; is_active: boolean }[]
  drive: { connected: boolean; email: string | null }
  files: DriveBackupFile[]
  error?: string
}> {
  const session = await requireAdminSettings()
  if (!session.schoolId) return { years: [], drive: { connected: false, email: null }, files: [], error: 'ไม่พบโรงเรียน' }
  const db = createServerClient()
  const [{ data: years }, { data: school, error }] = await Promise.all([
    db.from('academic_years').select('id, year_be, is_active').eq('school_id', session.schoolId).order('year_be', { ascending: false }),
    db.from('schools').select('google_drive_folder_id, google_drive_refresh_token, google_drive_connected_email').eq('id', session.schoolId).maybeSingle(),
  ])
  if (error) return { years: years || [], drive: { connected: false, email: null }, files: [], error: error.message }
  const connected = Boolean(school?.google_drive_refresh_token && school.google_drive_folder_id)
  if (!connected) return { years: years || [], drive: { connected: false, email: school?.google_drive_connected_email || null }, files: [] }
  try {
    const files = await listDriveBackups(session.schoolId, school!.google_drive_folder_id!)
    return { years: years || [], drive: { connected: true, email: school?.google_drive_connected_email || null }, files }
  } catch (listError) {
    return {
      years: years || [],
      drive: { connected: true, email: school?.google_drive_connected_email || null },
      files: [],
      error: listError instanceof Error ? listError.message : 'อ่านไฟล์บน Google Drive ไม่สำเร็จ',
    }
  }
}

async function backupDriveTarget() {
  const access = await requireBackupActor()
  if ('error' in access) return access
  const db = createServerClient()
  const { data: school } = await db.from('schools').select('google_drive_folder_id, google_drive_refresh_token').eq('id', access.actor.schoolId).maybeSingle()
  if (!school?.google_drive_refresh_token || !school.google_drive_folder_id) {
    return { error: 'ยังไม่ได้เชื่อม Google Drive', status: 400 }
  }
  return { actor: access.actor, rootFolderId: school.google_drive_folder_id }
}

export async function renameBackupFile(fileId: string, name: string) {
  const target = await backupDriveTarget()
  if ('error' in target) return { error: target.error }
  try {
    const next = await renameDriveBackup(target.actor.schoolId, target.rootFolderId, fileId, name)
    await logActivity({
      actor: target.actor,
      schoolId: target.actor.schoolId,
      action: 'update',
      module: 'backup',
      targetType: 'drive_file',
      targetId: fileId,
      targetLabel: next,
      description: `แก้ชื่อไฟล์สำรองเป็น ${next}`,
    })
    return { name: next }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'แก้ชื่อไฟล์ไม่สำเร็จ' }
  }
}

export async function deleteBackupFile(fileId: string) {
  const target = await backupDriveTarget()
  if ('error' in target) return { error: target.error }
  try {
    const name = await deleteDriveBackup(target.actor.schoolId, target.rootFolderId, fileId)
    await logActivity({
      actor: target.actor,
      schoolId: target.actor.schoolId,
      action: 'delete',
      module: 'backup',
      targetType: 'drive_file',
      targetId: fileId,
      targetLabel: name,
      description: `ลบไฟล์สำรอง ${name} ออกจาก Google Drive`,
    })
    return { ok: true as const }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'ลบไฟล์ไม่สำเร็จ' }
  }
}
