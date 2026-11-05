'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isSchoolCodeSegment } from '@/lib/school-path'
import type { AcademicBand } from '@/lib/secondary-academic'
import './secondary-academic.css'

export function useAcademicHref() {
  const pathname = usePathname()
  const first = pathname.split('/').filter(Boolean)[0]
  const prefix = first && isSchoolCodeSegment(first) ? `/${first}` : ''
  return (href: string) => `${prefix}${href}`
}

const items = [
  ['overview', '/evaluation/secondary', 'ภาพรวมมัธยม'],
  ['scores', '/scores/secondary', 'คะแนนรายภาค'],
  ['attendance', '/attendance/secondary', 'เช็กชื่อรายวิชา'],
  ['evaluation', '/evaluation/secondary/activities', 'ประเมินรายภาค'],
  ['pp5', '/reports/secondary/pp5', 'ปพ.5 มัธยม'],
  ['pp6', '/reports/secondary/pp6', 'ปพ.6 มัธยม'],
] as const

export default function AcademicBandNavigation({ band, active }: { band?: AcademicBand; active: string }) {
  const href = useAcademicHref()
  if (band !== 'secondary') return null
  return <nav className="secondary-academic-nav" aria-label="งานวัดผลมัธยมศึกษา">
    {items.map(([key, path, label]) => <Link key={key} href={href(path)} aria-current={active === key ? 'page' : undefined}>{label}</Link>)}
  </nav>
}
