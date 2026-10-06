import { NextRequest, NextResponse } from 'next/server'
import { buildSchoolMisGradesExport, buildSchoolMisSchoolExport } from '@/lib/schoolmis-export'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  let academicYearId = ''
  let classroomId = ''
  let scope: 'classroom' | 'school' = 'classroom'
  try {
    const body = await req.json()
    if (body?.scope !== undefined && !['classroom', 'school'].includes(body.scope)) return NextResponse.json({ error: 'รูปแบบส่งออกไม่ถูกต้อง' }, { status: 400 })
    scope = body?.scope === 'school' ? 'school' : 'classroom'
    academicYearId = typeof body?.academicYearId === 'string' ? body.academicYearId : ''
    classroomId = typeof body?.classroomId === 'string' ? body.classroomId : ''
  } catch {
    return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 400 })
  }

  if (!academicYearId || (scope === 'classroom' && !classroomId)) {
    return NextResponse.json({ error: 'กรุณาเลือกปีการศึกษาและห้องเรียน' }, { status: 400 })
  }

  try {
    const result = scope === 'school' ? await buildSchoolMisSchoolExport(academicYearId) : await buildSchoolMisGradesExport({ academicYearId, classroomId })
    if (result.error !== null) {
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
