function normalizeOrigin(raw?: string | null) {
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

export function isLocalhostOrigin(origin: string) {
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

function shouldSkipLocalOrigin(origin: string) {
  // บน production ห้ามใช้ localhost เป็น base ของ OAuth/redirect
  return process.env.NODE_ENV === 'production' && isLocalhostOrigin(origin)
}

function firstPublicOrigin(candidates: Array<string | null | undefined>) {
  for (const raw of candidates) {
    const origin = normalizeOrigin(raw)
    if (!origin) continue
    if (shouldSkipLocalOrigin(origin)) continue
    return origin
  }
  return null
}

/** Base URL ของแอป — ใช้สร้าง PDF, OAuth callback, ฯลฯ */
export function appOrigin() {
  return firstPublicOrigin([
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ]) ?? 'http://localhost:3000'
}

/**
 * หา origin จาก header ของ request จริง (รองรับ reverse proxy)
 * ใช้กับ OAuth callback เพื่อไม่ให้ redirect ชี้ localhost บน server จริง
 */
export function originFromHeaders(headers: Headers): string | null {
  const forwardedHost = headers.get('x-forwarded-host')
  const host = (forwardedHost || headers.get('host') || '').split(',')[0].trim()
  if (!host) return null
  const forwardedProto = (headers.get('x-forwarded-proto') || '').split(',')[0].trim()
  const proto = forwardedProto || (isLocalhostOrigin(`http://${host}`) ? 'http' : 'https')
  return normalizeOrigin(`${proto}://${host}`)
}

/**
 * Base URL ที่ควรใช้จริงในการ handle request หนึ่ง ๆ
 * ลำดับ: host จาก request → env สาธารณะ → fallback
 * (ไม่เอา localhost จาก env บน production)
 */
export function resolveRequestOrigin(headers: Headers): string {
  const fromRequest = originFromHeaders(headers)
  if (fromRequest && !shouldSkipLocalOrigin(fromRequest)) {
    return fromRequest
  }

  return firstPublicOrigin([
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    fromRequest,
  ]) ?? appOrigin()
}
