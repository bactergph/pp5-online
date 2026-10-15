export const INDIVIDUAL_PRO_ROOM_LIMIT = 3

export type Membership =
  | { kind: 'school' }
  | { kind: 'individual'; plan: 'free' | 'pro' }

const FREE_PREFIXES = ['/schedules/device', '/settings/profile']

const PRO_PREFIXES = [
  '/dashboard',
  '/schedules/device',
  '/settings/profile',
  '/settings/school',
  '/settings/academic-year',
  '/settings/holidays',
  '/settings/subjects',
  '/settings/activities',
  '/settings/evaluation-criteria',
  '/settings/class-subjects',
  '/classrooms',
  '/students',
  '/scores',
  '/score-config',
  '/classroom-admin',
  '/homeroom',
  '/evaluation',
  '/reports/pp5',
  '/reports/pp6',
  '/reports/pp5-class',
  '/export/classroom-admin',
]

const PRO_DENY = [
  '/classroom-admin/sign',
  '/attendance',
  '/documents',
  '/sign',
  '/activity',
  '/settings/import-dmc',
]

function cleanPath(path: string) {
  const bare = path.split('?')[0].split('#')[0]
  if (!bare || bare === '/') return '/'
  return bare.endsWith('/') && bare.length > 1 ? bare.slice(0, -1) : bare
}

function matches(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/** null = ไม่จำกัดห้องบนเซิร์ฟเวอร์ */
export function serverRoomLimit(membership: Membership): number | null {
  if (membership.kind === 'school') return null
  return membership.plan === 'pro' ? INDIVIDUAL_PRO_ROOM_LIMIT : 0
}

export function membershipHome(membership: Membership) {
  return membership.kind === 'individual' && membership.plan === 'free' ? '/schedules/device' : '/dashboard'
}

export function membershipAllows(path: string, membership: Membership) {
  const clean = cleanPath(path)
  if (membership.kind === 'school') return !matches(clean, '/schedules/device')
  if (membership.plan === 'free') return FREE_PREFIXES.some(prefix => matches(clean, prefix))
  if (matches(clean, '/schedules') && !matches(clean, '/schedules/device')) return false
  if (PRO_DENY.some(prefix => matches(clean, prefix))) return false
  return PRO_PREFIXES.some(prefix => matches(clean, prefix))
}

export function filterMembershipItems<T extends { href?: string; children?: Array<{ href?: string; children?: T['children'] }> }>(items: T[], membership: Membership): T[] {
  return items.flatMap(item => {
    if (item.children?.length) {
      const children = filterMembershipItems(item.children as T[], membership)
      return children.length ? [{ ...item, children: children as T['children'] }] : []
    }
    return !item.href || membershipAllows(item.href, membership) ? [item] : []
  })
}
