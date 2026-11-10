import { requireBackupActor } from '@/lib/school-backup/access'
import { exportSchoolBackup } from '@/lib/school-backup/export-school'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const access = await requireBackupActor()
  if ('error' in access) return Response.json({ error: access.error }, { status: access.status })
  let yearId = ''
  try {
    const body = await request.json() as { yearId?: string }
    yearId = body.yearId || ''
  } catch {
    return Response.json({ error: 'ไม่ได้เลือกปีการศึกษา' }, { status: 400 })
  }
  if (!yearId) return Response.json({ error: 'ไม่ได้เลือกปีการศึกษา' }, { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      try {
        const result = await exportSchoolBackup(access.actor, yearId, phase => send({ type: 'phase', ...phase }))
        send({ type: 'done', ...result })
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : 'สำรองข้อมูลไม่สำเร็จ' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
