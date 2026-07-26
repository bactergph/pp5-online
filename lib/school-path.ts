/**
 * School-scoped URLs use `/{schoolCode}/...` (e.g. `/phonoi/login`).
 * Legacy `/school/{code}/...` redirects to the new form.
 * Login page files stay under `app/school/[code]/login` and are rewritten.
 */

/** First path segments that must never be treated as school codes */
export const RESERVED_SCHOOL_PATH_SEGMENTS = new Set([
  'login',
  'forgot-password',
  'register',
  'auth',
  'api',
  'v',
  'school',
  'district',
  'dashboard',
  'settings',
  'classrooms',
  'students',
  'scores',
  'attendance',
  'evaluation',
  'classroom-admin',
  'reports',
  'export',
  'documents',
  'sign',
  'schedules',
  'homeroom',
  'score-config',
  'activity',
  'integrations',
  'fonts',
  '_next',
  'favicon.ico',
])

export function normalizeSchoolCode(code: string): string {
  return String(code).trim().toLowerCase()
}

export function isReservedSchoolPathSegment(segment: string): boolean {
  return RESERVED_SCHOOL_PATH_SEGMENTS.has(normalizeSchoolCode(segment))
}

/** True when the segment can be a school code in the URL */
export function isSchoolCodeSegment(segment: string): boolean {
  const code = normalizeSchoolCode(segment)
  return !!code && /^[a-z0-9-]+$/.test(code) && !isReservedSchoolPathSegment(code)
}

/** Public URL prefix for a school, e.g. `/phonoi` */
export function schoolPathPrefix(code: string | null | undefined): string {
  if (!code) return ''
  const normalized = normalizeSchoolCode(code)
  if (!isSchoolCodeSegment(normalized)) return ''
  return `/${normalized}`
}

export function withSchoolPrefix(code: string | null | undefined, href: string): string {
  if (!href.startsWith('/') || href.startsWith('/district')) return href
  const prefix = schoolPathPrefix(code)
  if (!prefix) return href
  return `${prefix}${href}`
}

export function schoolLoginPath(code: string): string {
  return `${schoolPathPrefix(code)}/login`
}

export function schoolDashboardPath(code: string): string {
  return `${schoolPathPrefix(code)}/dashboard`
}

/** Physical Next.js route for school login (target of rewrite) */
export function schoolLoginPhysicalPath(code: string): string {
  return `/school/${normalizeSchoolCode(code)}/login`
}

export function schoolCodeFromPathname(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'school' && parts[1] && isSchoolCodeSegment(parts[1])) {
    return normalizeSchoolCode(parts[1])
  }
  if (parts[0] && isSchoolCodeSegment(parts[0])) {
    return normalizeSchoolCode(parts[0])
  }
  return null
}
