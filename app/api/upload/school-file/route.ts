import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'
import { randomUUID } from 'node:crypto'
import { readUploadImage } from '@/lib/upload-image'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !session.schoolId || session.mustChangePassword || !['admin', 'principal'].includes(session.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'ข้อมูลไฟล์ไม่ถูกต้อง' }, { status: 400 })
  const type = form.get('type')
  const schoolId = form.get('school_id')

  if (type !== 'logo' && type !== 'stamp') {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  }
  if (schoolId !== session.schoolId) return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขโรงเรียนนี้' }, { status: 403 })
  const image = await readUploadImage(form.get('file'))
  if (image.error) return NextResponse.json({ error: image.error }, { status: 400 })

  const db = createServerClient()
  const { data: school, error: schoolError } = await db.from('schools').select('id').eq('id', schoolId).maybeSingle()
  if (schoolError) return NextResponse.json({ error: schoolError.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'ไม่พบโรงเรียน' }, { status: 404 })
  // Keep the previous file intact until its replacement has been committed.
  const path = `${schoolId}/${type}-${randomUUID()}.${image.ext}`
  const { error: upErr } = await db.storage
    .from('school-files')
    .upload(path, image.bytes, { contentType: image.contentType, upsert: false })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = db.storage.from('school-files').getPublicUrl(path)
  const publicUrl = urlData.publicUrl + '?t=' + Date.now()

  // บันทึก URL ลง schools table
  const col = type === 'logo' ? 'logo_url' : 'stamp_url'
  const { data: updated, error: updateError } = await db.from('schools').update({ [col]: urlData.publicUrl }).eq('id', schoolId).select('id').maybeSingle()
  if (updateError || !updated) {
    await db.storage.from('school-files').remove([path])
    return NextResponse.json({ error: updateError?.message || 'ไม่พบโรงเรียนที่ต้องการบันทึก' }, { status: 500 })
  }

  await logActivity({
    actor: session,
    schoolId,
    action: 'upload',
    module: 'school',
    targetType: 'school_file',
    targetId: schoolId,
    targetLabel: type === 'logo' ? 'โลโก้โรงเรียน' : 'ตราประทับ',
    description: `อัปโหลด${type === 'logo' ? 'โลโก้โรงเรียน' : 'ตราประทับ'}`,
    metadata: { fileType: type, mimeType: image.contentType, size: image.size },
  })

  return NextResponse.json({ url: publicUrl })
}
