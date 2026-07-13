import { NextRequest, NextResponse } from 'next/server'
import { generateReportPdf, appOrigin } from '@/lib/pdf/generate-report-pdf'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  let path = '/'
  let query = ''
  let landscape = false
  let emulateMedia: 'screen' | 'print' | undefined
  let localStorageSeed: Record<string, string> | undefined
  try {
    const body = await req.json()
    path = typeof body?.path === 'string' ? body.path : '/'
    query = typeof body?.query === 'string' ? body.query : ''
    landscape = body?.landscape === true
    if (body?.emulateMedia === 'screen' || body?.emulateMedia === 'print') {
      emulateMedia = body.emulateMedia
    }
    if (body?.localStorageSeed && typeof body.localStorageSeed === 'object' && !Array.isArray(body.localStorageSeed)) {
      localStorageSeed = Object.fromEntries(
        Object.entries(body.localStorageSeed).filter((entry): entry is [string, string] => (
          typeof entry[0] === 'string' && typeof entry[1] === 'string'
        )),
      )
    }
  } catch {
    return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 400 })
  }

  if (!path.startsWith('/')) {
    return NextResponse.json({ error: 'path ไม่ถูกต้อง' }, { status: 400 })
  }

  const session = req.cookies.get('session')?.value
  if (!session) {
    return NextResponse.json({ error: 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  }

  try {
    const pdf = await generateReportPdf({
      origin: appOrigin(),
      path,
      query,
      sessionToken: session,
      landscape,
      emulateMedia,
      localStorageSeed,
    })
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ'
    return NextResponse.json({ error: `สร้าง PDF ไม่สำเร็จ: ${message}` }, { status: 500 })
  }
}
