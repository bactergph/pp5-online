import { NextRequest, NextResponse } from 'next/server'
import { buildSchoolMisGradesExport } from '@/lib/schoolmis-export'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  let academicYearId = ''
  let classroomId = ''
  try {
    const body = await req.json()
    academicYearId = typeof body?.academicYearId === 'string' ? body.academicYearId : ''
    classroomId = typeof body?.classroomId === 'string' ? body.classroomId : ''
  } catch {
    return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 400 })
  }

  if (!academicYearId || !classroomId) {
    return NextResponse.json({ error: 'กรุณาเลือกปีการศึกษาและห้องเรียน' }, { status: 400 })
  }

  try {
    const result = await buildSchoolMisGradesExport({ academicYearId, classroomId })
    if (result.error) {
      const status = result.error.includes('สิทธิ์') || result.error.includes('เข้าสู่ระบบ') ? 403 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    // Header ต้องเป็น ByteString (ASCII) — ชื่อไทยใส่ใน filename* / X-Export-Filename แบบ percent-encode
    const encoded = encodeURIComponent(result.fileName)
    const asciiFallback = result.fileName
      .replace(/[^\x20-\x7E]+/g, '_')
      .replace(/["\\]/g, '_')
      || 'schoolmis.csv'
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Export-Filename': encoded,
        'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ส่งออกไม่สำเร็จ'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
