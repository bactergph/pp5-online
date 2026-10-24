export const INDIVIDUAL_PRO_ROOM_LIMIT = 10
export const MEMBERSHIP_CONTACT_URL = 'https://www.facebook.com/share/1Dn81diqEv/?mibextid=wwXIfr'
export type MemberPackage = 'free' | 'pro' | 'school'
type Dates = { startsOn?: string | null; expiresOn?: string | null; expired?: boolean; scheduled?: boolean; subscribedPackage?: MemberPackage; version?: number }
export type Membership = ({ kind: 'school' } | { kind: 'individual'; plan: 'free' | 'pro' }) & Dates
export function membershipToday(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
export function validMembershipDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function annualMembershipEnd(start: string) {
  if (!validMembershipDate(start)) throw Error('วันเริ่มสมาชิกไม่ถูกต้อง')
  const [year, month, day] = start.split('-').map(Number)
  return new Date(Date.UTC(year + 1, month - 1, day) - 86400000).toISOString().slice(0, 10)
}
export function membershipFromRow(row: { membership_kind?: string | null; member_plan?: string | null; membership_started_on?: string | null; membership_expires_on?: string | null; membership_version?: number | null }, today = membershipToday()): Membership {
  const subscribedPackage: MemberPackage = row.membership_kind === 'individual' ? row.member_plan === 'pro' ? 'pro' : 'free' : 'school'
  const dates: Dates = { startsOn: row.membership_started_on, expiresOn: row.membership_expires_on, subscribedPackage, version: row.membership_version || 0 }
  const expired = subscribedPackage !== 'free' && !!dates.expiresOn && dates.expiresOn < today
  const scheduled = subscribedPackage !== 'free' && !!dates.startsOn && dates.startsOn > today
  if (expired || scheduled) return { kind: 'individual', plan: 'free', ...dates, expired, scheduled }
  return subscribedPackage === 'school' ? { kind: 'school', ...dates } : { kind: 'individual', plan: subscribedPackage, ...dates }
}
export const isFreeMembership = (membership: Membership) => membership.kind === 'individual' && membership.plan === 'free'
export const membershipPackage = (membership: Membership): MemberPackage => membership.kind === 'school' ? 'school' : membership.plan
export function membershipLabel(membership: Membership) { return membership.kind === 'school' ? 'SCHOOL · สมาชิกโรงเรียน' : membership.plan === 'pro' ? 'PRO · สมาชิกโปร' : 'FREE · สมาชิกฟรี' }
export function membershipDateLabel(value?: string | null) { return value && validMembershipDate(value) ? new Date(value + 'T12:00:00+07:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }) : '' }
export function serverRoomLimit(membership: Membership): number | null { return membership.kind === 'school' ? null : membership.plan === 'pro' ? INDIVIDUAL_PRO_ROOM_LIMIT : 0 }
export function membershipHome(membership: Membership) { return isFreeMembership(membership) ? '/schedules/device/manage' : '/dashboard' }
export function membershipAllows(path: string, membership: Membership) {
  const clean = path.split(/[?#]/)[0].replace(/\/$/, '') || '/'
  const matches = (prefix: string) => clean === prefix || clean.startsWith(prefix + '/')
  if (matches('/district')) return false
  return !isFreeMembership(membership) || ['/schedules/device', '/settings/profile', '/auth/change-password'].some(matches)
}
export function filterMembershipItems<T extends { href?: string; children?: Array<{ href?: string; children?: T['children'] }> }>(items: T[], membership: Membership): T[] {
  return items.flatMap(item => {
    if (item.children?.length) { const children = filterMembershipItems(item.children as T[], membership); return children.length ? [{ ...item, children: children as T['children'] }] : [] }
    return !item.href || membershipAllows(item.href, membership) ? [item] : []
  })
}
