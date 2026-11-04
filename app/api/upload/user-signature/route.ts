import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'
import { staffAccessError } from '@/lib/staff-permissions'
import { randomUUID } from 'node:crypto'
import { readUploadImage } from '@/lib/upload-image'

export async function POST(req: NextRequest) {
  const session = await getSession(true)
  if (!session || session.mustChangePassword) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'ข้อมูลไฟล์ไม่ถูกต้อง' }, { status: 400 })
  const userId = form.get('user_id')

  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  }

  const isSelf = userId === session.userId
  if (!isSelf && !await getSession()) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  if (!isSelf && !['admin', 'district'].includes(session.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const image = await readUploadImage(form.get('file'))
  if (image.error) return NextResponse.json({ error: image.error }, { status: 400 })

  const db = createServerClient()
  const { data: target, error: targetError } = await db.from('users').select('school_id, full_name, role').eq('id', userId).maybeSingle()
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
  if (!isSelf && staffAccessError(session,target)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const schoolId = target.school_id || session.schoolId || 'shared'
  const path = `${schoolId}/signatures/${userId}-${randomUUID()}.${image.ext}`

  const { error: upErr } = await db.storage
    .from('school-files')
    .upload(path, image.bytes, { contentType: image.contentType, upsert: false })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = db.storage.from('school-files').getPublicUrl(path)
  const publicUrl = urlData.publicUrl + '?t=' + Date.now()

  let update = db.from('users').update({ signature_url: urlData.publicUrl }).eq('id', userId)
  update = target.school_id ? update.eq('school_id', target.school_id) : update.is('school_id', null)
  const { data: updated, error: updateError } = await update.select('id').maybeSingle()
  if (updateError || !updated) {
    await db.storage.from('school-files').remove([path])
    return NextResponse.json({ error: updateError?.message || 'ไม่พบผู้ใช้ที่ต้องการบันทึก' }, { status: 500 })
  }

  await logActivity({
    actor: session,
    schoolId: target.school_id ?? session.schoolId,
    action: 'upload',
    module: 'users',
    targetType: 'user_signature',
    targetId: userId,
    targetLabel: target.full_name,
    description: `อัปโหลดลายเซ็น ${target.full_name}`,
  })

  return NextResponse.json({ url: publicUrl })
}
