import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'
import { requireBackupActor } from '@/lib/school-backup/access'
import { downloadDriveBackup } from '@/lib/school-backup/drive'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const access = await requireBackupActor()
  if ('error' in access) return Response.json({ error: access.error }, { status: access.status })
  try {
    const body = await request.json() as { fileId?: string }
    if (!body.fileId) return Response.json({ error: 'ยังไม่ได้เลือกไฟล์สำรอง' }, { status: 400 })
    const db = createServerClient()
    const { data: school, error } = await db.from('schools')
      .select('google_drive_folder_id')
      .eq('id', access.actor.schoolId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!school?.google_drive_folder_id) throw new Error('ยังไม่ได้เชื่อม Google Drive')
    const file = await downloadDriveBackup(access.actor.schoolId, school.google_drive_folder_id, body.fileId)
    await logActivity({
      actor: access.actor,
      schoolId: access.actor.schoolId,
      action: 'export',
      module: 'backup',
      targetType: 'drive_file',
      targetId: body.fileId,
      targetLabel: file.name,
      description: `ดาวน์โหลดไฟล์สำรอง ${file.name}`,
    })
    const encoded = encodeURIComponent(file.name)
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="backup.json"; filename*=UTF-8''${encoded}`,
      },
    })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'ดาวน์โหลดไฟล์สำรองไม่สำเร็จ' }, { status: 400 })
  }
}
