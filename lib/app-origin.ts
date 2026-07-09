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
