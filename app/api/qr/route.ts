import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

export const runtime = 'nodejs'

/** GET /api/qr?text=... — คืน PNG ของ QR */
export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text')?.trim() || ''
  if (!text || text.length > 2048) {
    return NextResponse.json({ error: 'invalid text' }, { status: 400 })
  }

  try {
    const png = await QRCode.toBuffer(text, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
      color: { dark: '#111827', light: '#ffffff' },
    })
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'qr failed' }, { status: 500 })
  }
}
