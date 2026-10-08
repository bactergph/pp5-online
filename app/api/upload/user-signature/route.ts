import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'
import { staffAccessError } from '@/lib/staff-permissions'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.mustChangePassword) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const userId = form.get('user_id') as string | null

  if (!file || !userId) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  }

  const isSelf = userId === session.userId
  if (!isSelf && !['admin', 'district'].includes(session.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: 'รองรับเฉพาะ PNG, JPG, WEBP' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: target } = await db.from('users').select('school_id, full_name, role').eq('id', userId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
  if (!isSelf && staffAccessError(session,target)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const schoolId = target.school_id || session.schoolId || 'shared'
  const path = `${schoolId}/signatures/${userId}.png`
  const bytes = await file.arrayBuffer()

  const { error: upErr } = await db.storage
    .from('school-files')
    .upload(path, bytes, { contentType: 'image/png', upsert: true })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = db.storage.from('school-files').getPublicUrl(path)
  const publicUrl = urlData.publicUrl + '?t=' + Date.now()

  const { error: updateError } = await db.from('users').update({ signature_url: urlData.publicUrl }).eq('id', userId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

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
