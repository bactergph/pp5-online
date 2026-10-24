import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'district' || session.mustChangePassword) return NextResponse.json({ error: 'เฉพาะ Super Admin เท่านั้น' }, { status: 403 })
  try {
    const form = await req.formData(), file = form.get('file')
    if (!(file instanceof File) || file.size < 1 || file.size > 3 * 1024 * 1024) return NextResponse.json({ error: 'เลือกรูปขนาดไม่เกิน 3 MB' }, { status: 400 })
    const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as Record<string, string>)[file.type]
    if (!ext) return NextResponse.json({ error: 'รองรับเฉพาะ PNG, JPG และ WebP' }, { status: 400 })
    const bytes = Buffer.from(await file.arrayBuffer())
    const valid = ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : ext === 'jpg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP'
    if (!valid) return NextResponse.json({ error: 'ไฟล์ไม่ใช่รูปภาพชนิดที่ระบุ' }, { status: 400 })
    const db = createServerClient(), key = `ads/${randomUUID()}.${ext}`
    const result = await db.storage.from('membership-ads').upload(key, bytes, { contentType: file.type, upsert: false })
    if (result.error) return NextResponse.json({ error: 'อัปโหลดรูปไม่สำเร็จ กรุณาตรวจพื้นที่รูปภาพใน migration 082' }, { status: 503 })
    return NextResponse.json({ url: db.storage.from('membership-ads').getPublicUrl(key).data.publicUrl })
  } catch { return NextResponse.json({ error: 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่' }, { status: 400 }) }
}
