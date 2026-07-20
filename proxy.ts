// proxy.ts - ควบคุมการเข้าถึง route ตาม session (Next.js 16)
// ใช้ Optimistic Check: ตรวจแค่ว่ามี cookie อยู่ไหม ไม่ decrypt (เร็วกว่า)
// การ verify จริงๆ ทำที่ verifySession() ใน dal.ts แต่ละ page
import { NextRequest, NextResponse } from 'next/server'

// Routes สาธารณะ (ไม่ต้อง login) — ถ้ามี session แล้วจะเด้งไป dashboard
const publicRoutes = ['/login', '/forgot-password', '/register']

// Routes ที่ต้องการ login
const protectedPrefixes = [
  '/dashboard',
  '/settings',
  '/classrooms',
  '/students',
  '/scores',
  '/attendance',
  '/evaluation',
  '/classroom-admin',
  '/reports',
  '/export',
  '/documents',
]

/** URL เก่าที่ย้ายไปหน้าเอกสารเสนอเซ็นแล้ว */
const LEGACY_SIGN_REDIRECTS: Record<string, string> = {
  'reports/pp5/approved': '/documents/sign?tab=subject&section=approved',
  'reports/pp5-class/approved': '/documents/sign?tab=class_pp6&section=approved',
  'reports/pp6/approved': '/documents/sign?tab=class_pp6&section=approved',
  'sign/pp5': '/documents/sign?tab=subject',
  'sign/pp6': '/documents/sign?tab=class_pp6',
}

function legacySignRedirect(req: NextRequest, target: string, schoolCode?: string) {
  const [basePath, queryString] = target.split('?')
  const url = req.nextUrl.clone()
  url.pathname = schoolCode ? `/school/${schoolCode}${basePath}` : basePath
  url.search = queryString ? `?${queryString}` : ''
  return NextResponse.redirect(url, 308)
}

function matchLegacySignRedirect(pathWithoutLeadingSlash: string) {
  return LEGACY_SIGN_REDIRECTS[pathWithoutLeadingSlash] ?? null
}

export default function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const parts = path.split('/').filter(Boolean)
  const hasSession = req.cookies.has('session')

  if (parts[0] === 'school') {
    const code = parts[1]
    const schoolPath = parts.slice(2).join('/')

    if (!code) return NextResponse.next()

    if (!schoolPath) {
      return NextResponse.redirect(new URL(hasSession ? `/school/${code}/dashboard` : `/school/${code}/login`, req.nextUrl))
    }

    if (schoolPath === 'login') {
      if (hasSession) return NextResponse.redirect(new URL(`/school/${code}/dashboard`, req.nextUrl))
      return NextResponse.next()
    }

    if (!hasSession) {
      return NextResponse.redirect(new URL(`/school/${code}/login`, req.nextUrl))
    }

    const legacyTarget = matchLegacySignRedirect(schoolPath)
    if (legacyTarget) {
      return legacySignRedirect(req, legacyTarget, code)
    }

    const url = req.nextUrl.clone()
    url.pathname = `/${schoolPath}`
    return NextResponse.rewrite(url)
  }

  const isPublicRoute = publicRoutes.some(r => path === r || path.startsWith(r + '/'))
  const isProtectedRoute = protectedPrefixes.some(r => path === r || path.startsWith(r + '/'))

  const legacyTarget = matchLegacySignRedirect(path.slice(1))
  if (legacyTarget) {
    return legacySignRedirect(req, legacyTarget)
  }

  // ถ้าเป็น protected route และไม่มี session cookie → ไป login
  if (isProtectedRoute && !hasSession) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  // ถ้าเข้า /login ทั้งที่มี session อยู่แล้ว → ไป dashboard
  if (isPublicRoute && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }

  return NextResponse.next()
}

// กำหนด route ที่ proxy จะทำงาน
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fonts|.*\\.png$|.*\\.svg$|.*\\.(?:woff2?|ttf|otf)$).*)'],
}
