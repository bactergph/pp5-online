import { createServerClient } from '@/lib/supabase'
import { requireBackupActor } from '@/lib/school-backup/access'
import { downloadDriveBackup } from '@/lib/school-backup/drive'
import { assertBackupPayload, backupImportAccepted } from '@/lib/school-backup/format'
import { restoreSchoolBackup } from '@/lib/school-backup/restore-school'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_BACKUP_BYTES = 80 * 1024 * 1024

async function readPayload(request: Request, schoolId: string) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BACKUP_BYTES) throw new Error('ไฟล์สำรองใหญ่เกินกว่าที่ระบบนำเข้าได้')
  const text = await request.text()
  if (text.length > MAX_BACKUP_BYTES) throw new Error('ไฟล์สำรองใหญ่เกินกว่าที่ระบบนำเข้าได้')
  const body = JSON.parse(text) as { fileId?: string; accept?: unknown; format?: string }
  if (body.format === 'jarnsek-school-backup') {
    if (request.headers.get('x-backup-accept') !== 'yes') throw new Error('ต้องติ๊กยอมรับการนำเข้าก่อน')
    return assertBackupPayload(body, schoolId)
  }
  if (!backupImportAccepted(body.accept)) throw new Error('ต้องติ๊กยอมรับการนำเข้าก่อน')
  if (!body.fileId) throw new Error('ยังไม่ได้เลือกไฟล์สำรอง')
  const db = createServerClient()
  const { data: school, error } = await db.from('schools')
    .select('google_drive_folder_id')
    .eq('id', schoolId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!school?.google_drive_folder_id) throw new Error('ยังไม่ได้เชื่อม Google Drive')
  const file = await downloadDriveBackup(schoolId, school.google_drive_folder_id, body.fileId)
  return assertBackupPayload(JSON.parse(file.buffer.toString('utf8')), schoolId)
}

export async function POST(request: Request) {
  const access = await requireBackupActor()
  if ('error' in access) return Response.json({ error: access.error }, { status: access.status })
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      try {
        send({ type: 'phase', key: 'check', label: 'ตรวจการยอมรับและไฟล์สำรอง', state: 'run' })
        const payload = await readPayload(request, access.actor.schoolId)
        send({
          type: 'phase',
          key: 'check',
          label: 'ตรวจการยอมรับและไฟล์สำรอง',
          state: 'done',
          detail: `${payload.school.name} · ปีการศึกษา ${payload.academicYear.yearBe}`,
        })
        const result = await restoreSchoolBackup(access.actor, payload, phase => send({ type: 'phase', ...phase }))
        send({ type: 'done', ...result })
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : 'นำเข้าข้อมูลไม่สำเร็จ' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
