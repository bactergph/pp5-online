import { getSession } from '@/lib/session'
import { hasRoleInList } from '@/lib/roles'
import Link from 'next/link'
import { redirect } from 'next/navigation'

type MenuItem = {
  href: string
  label: string
  desc: string
  color: string
  bg: string
  icon: React.ReactNode
  roles: string[] | 'all'
}

const ALL_MENU: MenuItem[] = [
  {
    href: '/settings/profile',
    label: 'ข้อมูลตัวเอง',
    desc: 'ชื่อ-นามสกุล รหัสผ่าน และลายเซ็น',
    color: '#8B6B45',
    bg: '#F5EDE3',
    icon: <UserIcon />,
    roles: 'all',
  },
  {
    href: '/settings/school',
    label: 'ข้อมูลโรงเรียน',
    desc: 'ชื่อโรงเรียน ผู้บริหาร ที่อยู่',
    color: '#8B6B45',
    bg: '#F5EDE3',
    icon: <SchoolIcon />,
    roles: ['admin', 'district'],
  },
  {
    href: '/settings/academic-year',
    label: 'ปีการศึกษา',
    desc: 'กำหนดวันเปิด-ปิดภาคเรียน',
    color: '#0891B2',
    bg: '#ECFEFF',
    icon: <CalIcon />,
    roles: ['admin', 'district'],
  },
  {
    href: '/settings/holidays',
    label: 'วันหยุด',
    desc: 'จัดการวันหยุดประจำปี',
    color: '#059669',
    bg: '#ECFDF5',
    icon: <HolidayIcon />,
    roles: ['admin', 'district'],
  },
  {
    href: '/settings/subjects',
    label: 'รายวิชา',
    desc: 'จัดการรายวิชาตามกลุ่มสาระ',
    color: '#DB2777',
    bg: '#FDF2F8',
    icon: <BookIcon />,
    roles: ['admin', 'district', 'academic_head', 'deputy_principal'],
  },
  {
    href: '/settings/class-subjects',
    label: 'กำหนดครูผู้สอน',
    desc: 'จัดวิชาในห้องและเลือกครูผู้สอน',
    color: '#0284C7',
    bg: '#F0F9FF',
    icon: <GridIcon />,
    roles: ['admin', 'district', 'academic_head', 'deputy_principal'],
  },
  {
    href: '/settings/evaluation-criteria',
    label: 'คุณลักษณะ / อ่านคิด / สมรรถนะ',
    desc: 'ตั้งค่าเกณฑ์ประเมิน',
    color: '#C49212',
    bg: '#F5F3FF',
    icon: <BookIcon />,
    roles: ['admin', 'district', 'academic_head', 'deputy_principal'],
  },
  {
    href: '/settings/users',
    label: 'ข้อมูลบุคลากร',
    desc: 'จัดการบัญชีครูและผู้บริหาร',
    color: '#0F766E',
    bg: '#F0FDFA',
    icon: <UserIcon />,
    roles: ['admin', 'district'],
  },
  {
    href: '/score-config',
    label: 'สัดส่วนคะแนน',
    desc: 'กำหนดสัดส่วนคะแนนแต่ละรายวิชา',
    color: '#16A34A',
    bg: '#F0FDF4',
    icon: <ChartIcon />,
    roles: ['admin', 'district', 'academic_head', 'deputy_principal'],
  },
  {
    href: '/activity',
    label: 'ประวัติการใช้งาน',
    desc: 'ดูว่าใครแก้ไขหรือบันทึกข้อมูลอะไร',
    color: '#D97706',
    bg: '#FFFBEB',
    icon: <ClockIcon />,
    roles: 'all',
  },
]

function canSeeItem(role: string, roles: MenuItem['roles']) {
  if (roles === 'all') return true
  return hasRoleInList(role, roles)
}

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const visibleMenu = ALL_MENU.filter(item => canSeeItem(session.role, item.roles))
  if (visibleMenu.length === 1 && visibleMenu[0].href === '/settings/profile') {
    redirect('/settings/profile')
  }

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">ตั้งค่า</span>
          <h1 className="page-title">เมนูตั้งค่า</h1>
          <p className="page-subtitle">เลือกรายการที่ต้องการจัดการ</p>
        </div>
      </div>
      <div className="responsive-grid">
        {visibleMenu.map(item => (
          <Link key={item.href} href={item.href} className="nav-tile">
            <div style={{ width: 44, height: 44, borderRadius: 12, background: item.bg, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Svg({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
function SchoolIcon() { return <Svg d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" /> }
function CalIcon() { return <Svg d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" /> }
function HolidayIcon() { return <Svg d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> }
function BookIcon() { return <Svg d="M4 19.5A2.5 2.5 0 016.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /> }
function GridIcon() { return <Svg d="M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z" /> }
function ChartIcon() { return <Svg d="M18 20V10 M12 20V4 M6 20v-6" /> }
function ClockIcon() { return <Svg d="M12 8v5l3 2 M21 12a9 9 0 11-18 0 9 9 0 0118 0" /> }
function UserIcon() { return <Svg d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z" /> }
