import type { ReactNode } from 'react'

export type SidebarTone =
  | 'indigo' | 'emerald' | 'amber' | 'sky' | 'violet' | 'rose' | 'cyan' | 'slate'
  | 'daily' | 'health' | 'docs'

export const SIDEBAR_TONE_CYCLE: SidebarTone[] = [
  'indigo', 'emerald', 'amber', 'sky', 'violet', 'rose', 'cyan', 'slate',
]

export function normalizeSidebarTone(tone: SidebarTone | undefined, index: number): Exclude<SidebarTone, 'daily' | 'health' | 'docs'> {
  if (tone === 'daily') return 'indigo'
  if (tone === 'health') return 'emerald'
  if (tone === 'docs') return 'amber'
  if (tone && tone !== 'daily' && tone !== 'health' && tone !== 'docs') return tone
  const cycled = SIDEBAR_TONE_CYCLE[index % SIDEBAR_TONE_CYCLE.length]
  if (cycled === 'daily' || cycled === 'health' || cycled === 'docs') return 'indigo'
  return cycled
}

type IconFn = (d: string) => ReactNode

/** ไอคอนเริ่มต้นตาม path เมื่อเมนูไม่ได้กำหนด icon */
export function defaultSidebarIcon(href: string, ic: IconFn, paths: Record<string, string>): ReactNode | undefined {
  const entries = Object.entries(paths).sort((a, b) => b[0].length - a[0].length)
  for (const [prefix, path] of entries) {
    if (href === prefix || href.startsWith(prefix + '/')) return ic(path)
  }
  return undefined
}
