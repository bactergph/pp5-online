import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !['admin', 'principal'].includes(session.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const type = form.get('type') as string // 'logo' | 'stamp'
  const schoolId = form.get('school_id') as string

  if (!file || !type || !schoolId) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${schoolId}/${type}.${ext}`
  const bytes = await file.arrayBuffer()

  const db = createServerClient()
  const { error: upErr } = await db.storage
    .from('school-files')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = db.storage.from('school-files').getPublicUrl(path)
  const publicUrl = urlData.publicUrl + '?t=' + Date.now()

  // บันทึก URL ลง schools table
  const col = type === 'logo' ? 'logo_url' : 'stamp_url'
  const { error: updateError } = await db.from('schools').update({ [col]: urlData.publicUrl }).eq('id', schoolId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await logActivity({
    actor: session,
    schoolId,
    action: 'upload',
    module: 'school',
    targetType: 'school_file',
    targetId: schoolId,
    targetLabel: type === 'logo' ? 'โลโก้โรงเรียน' : 'ตราประทับ',
    description: `อัปโหลด${type === 'logo' ? 'โลโก้โรงเรียน' : 'ตราประทับ'}`,
    metadata: { fileType: type, mimeType: file.type, size: file.size },
  })

  return NextResponse.json({ url: publicUrl })
}
