'use server'

import { createServerClient } from '@/lib/supabase'
import { requireAdminSettings } from '@/lib/settings-guard'
import { listDriveBackups, type DriveBackupFile } from '@/lib/school-backup/drive'

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
