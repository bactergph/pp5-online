function normalizeOrigin(raw?: string | null) {
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

function isLocalhostOrigin(origin: string) {
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

/** Base URL ของแอป — ใช้สร้าง PDF, OAuth callback, ฯลฯ */
export function appOrigin() {
  const candidates = [
    normalizeOrigin(process.env.APP_URL),
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
    normalizeOrigin(
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : null,
    ),
    normalizeOrigin(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null),
  ].filter((v): v is string => Boolean(v))

  const inProd = process.env.NODE_ENV === 'production'
  for (const origin of candidates) {
    if (inProd && isLocalhostOrigin(origin)) continue
    return origin
  }
  return 'http://localhost:3000'
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
 * ลำดับความสำคัญ: env ที่ตั้งชัดเจน (APP_URL ฯลฯ) → host จาก request → fallback localhost
 * ป้องกันกรณี env ไม่ได้ตั้งบน server จริงแล้ว OAuth/redirect หลุดไป localhost
 */
export function resolveRequestOrigin(headers: Headers): string {
  const envOrigin = [
    normalizeOrigin(process.env.APP_URL),
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
    normalizeOrigin(
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : null,
    ),
  ].find((v): v is string => Boolean(v) && !isLocalhostOrigin(v))
  if (envOrigin) return envOrigin
  return originFromHeaders(headers) ?? appOrigin()
}
