// proxy.ts - ควบคุมการเข้าถึง route ตาม session (Next.js 16)
// ใช้ Optimistic Check: ตรวจแค่ว่ามี cookie อยู่ไหม ไม่ decrypt (เร็วกว่า)
// การ verify จริงๆ ทำที่ verifySession() ใน dal.ts แต่ละ page
import { NextRequest, NextResponse } from 'next/server'
import {
  isSchoolCodeSegment,
  normalizeSchoolCode,
  schoolDashboardPath,
  schoolLoginPath,
  schoolLoginPhysicalPath,
} from '@/lib/school-path'

// Routes สาธารณะ (ไม่ต้อง login) — ถ้ามี session แล้วจะเด้งไป dashboard
const publicRoutes = ['/login', '/forgot-password', '/register']
/** เข้าได้โดยไม่ login และไม่เด้งไป dashboard แม้มี session */
const openRoutes = ['/v']

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
  '/sign',
]

/** URL เก่าที่ย้ายไปหน้าเอกสารเสนอเซ็นแล้ว */
const LEGACY_SIGN_REDIRECTS: Record<string, string> = {
  'reports/pp5/approved': '/documents/sign?tab=subject&section=approved',
  'reports/pp5-class/approved': '/documents/sign?tab=class_pp6&section=approved',
  'reports/pp6/approved': '/documents/sign?tab=class_pp6&section=approved',
  'sign/pp5': '/documents/sign?tab=subject',
  'sign/pp6': '/documents/sign?tab=class_pp6',
  'sign/classroom-admin': '/classroom-admin/sign',
}

function legacySignRedirect(req: NextRequest, target: string, schoolCode?: string) {
  const [basePath, queryString] = target.split('?')
  const url = req.nextUrl.clone()
  url.pathname = schoolCode ? `/${normalizeSchoolCode(schoolCode)}${basePath}` : basePath
  url.search = queryString ? `?${queryString}` : ''
  return NextResponse.redirect(url, 308)
}

function matchLegacySignRedirect(pathWithoutLeadingSlash: string) {
  return LEGACY_SIGN_REDIRECTS[pathWithoutLeadingSlash] ?? null
}

function handleSchoolScopedPath(req: NextRequest, codeRaw: string, schoolPath: string, hasSession: boolean) {
  const code = normalizeSchoolCode(codeRaw)

  if (!schoolPath) {
    return NextResponse.redirect(
      new URL(hasSession ? schoolDashboardPath(code) : schoolLoginPath(code), req.nextUrl),
    )
  }

  if (schoolPath === 'login') {
    // แสดงหน้า login ของโรงเรียนเสมอ — rewrite ไปไฟล์เดิมใต้ app/school/[code]/login
    const url = req.nextUrl.clone()
    url.pathname = schoolLoginPhysicalPath(code)
    return NextResponse.rewrite(url)
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL(schoolLoginPath(code), req.nextUrl))
  }

  const legacyTarget = matchLegacySignRedirect(schoolPath)
  if (legacyTarget) {
    return legacySignRedirect(req, legacyTarget, code)
  }

  const url = req.nextUrl.clone()
  url.pathname = `/${schoolPath}`
  return NextResponse.rewrite(url)
}

export default function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const parts = path.split('/').filter(Boolean)
  const hasSession = req.cookies.has('session')

  // Legacy /school/{code}/... → /{code}/...
  if (parts[0] === 'school' && parts[1] && isSchoolCodeSegment(parts[1])) {
    const code = normalizeSchoolCode(parts[1])
    const rest = parts.slice(2).join('/')
    const url = req.nextUrl.clone()
    url.pathname = rest ? `/${code}/${rest}` : `/${code}`
    return NextResponse.redirect(url, 308)
  }

  // New /{code}/... school-scoped URLs
  if (parts[0] && isSchoolCodeSegment(parts[0])) {
    return handleSchoolScopedPath(req, parts[0], parts.slice(1).join('/'), hasSession)
  }

  const isPublicRoute = publicRoutes.some(r => path === r || path.startsWith(r + '/'))
  const isOpenRoute = openRoutes.some(r => path === r || path.startsWith(r + '/'))
  const isProtectedRoute = protectedPrefixes.some(r => path === r || path.startsWith(r + '/'))

  const legacyTarget = matchLegacySignRedirect(path.slice(1))
  if (legacyTarget) {
    return legacySignRedirect(req, legacyTarget)
  }

  // หน้าตรวจเอกสารสาธารณะ — ผ่านได้เสมอ
  if (isOpenRoute) {
    return NextResponse.next()
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
