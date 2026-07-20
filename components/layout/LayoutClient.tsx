'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import NavigationProgress from './NavigationProgress'

/** Navbar titles — same labels as the old per-section layouts */
const TITLE_BY_PREFIX: { prefix: string; title: string }[] = [
  { prefix: '/district', title: 'สำนักงานเขต' },
  { prefix: '/settings', title: 'ตั้งค่า' },
  { prefix: '/classrooms', title: 'ชั้นเรียน' },
  { prefix: '/students', title: 'นักเรียน' },
  { prefix: '/scores', title: 'บันทึกคะแนน' },
  { prefix: '/attendance', title: 'เช็คเวลาเรียนรายวิชา' },
  { prefix: '/evaluation', title: 'การประเมิน' },
  { prefix: '/reports', title: 'รายงาน' },
  { prefix: '/schedules', title: 'ตารางเรียน / ตารางสอน' },
  { prefix: '/documents/sign', title: 'เอกสารเสนอเซ็น' },
  { prefix: '/sign', title: 'ลงนาม' },
  { prefix: '/homeroom', title: 'ปพ.5 / ปพ.6 (ห้องเรียน)' },
  { prefix: '/score-config', title: 'สัดส่วนคะแนน' },
  { prefix: '/classroom-admin', title: 'ธุรการชั้นเรียน' },
  { prefix: '/activity', title: 'ประวัติการใช้งาน' },
  { prefix: '/export', title: 'Export' },
  { prefix: '/dashboard', title: 'หน้าหลัก' },
]

function titleFromPath(pathname: string, fallback?: string) {
  const hit = TITLE_BY_PREFIX.find(t => pathname === t.prefix || pathname.startsWith(t.prefix + '/'))
  return hit?.title || fallback || 'ระบบ ปพ.5 ออนไลน์'
}

type Props = {
  children: React.ReactNode
  title?: string
  userRole: string
  navRole: string
  userFullName: string
  isHomeroom: boolean
  schoolCode: string | null
  schoolLogoUrl?: string | null
  schoolProgramName?: string | null
  schoolName?: string | null
  hasSchool?: boolean
  isActingDirector?: boolean
}

function LayoutClientInner({
  children,
  title,
  userRole,
  navRole,
  userFullName,
  isHomeroom,
  schoolCode,
  schoolLogoUrl = null,
  schoolProgramName = null,
  schoolName = null,
  hasSchool = false,
  isActingDirector = false,
}: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pageTitle = titleFromPath(pathname, title)
  // onboarding wizard: ไม่โชว์ sidebar/navbar — โหลดเต็มจอเลยหลังเลือกโรงเรียน
  const onSchoolSettings = pathname === '/settings/school' || pathname.endsWith('/settings/school')
  const chromeless =
    searchParams.get('embed') === '1'
    || searchParams.get('print') === '1'
    || searchParams.get('autoprint') === '1'
    || searchParams.get('onboarding') === '1'
    || (onSchoolSettings && userRole === 'admin' && !hasSchool)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (chromeless || !sidebarOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [chromeless, sidebarOpen])

  if (chromeless) {
    return (
      <div className="app-shell app-shell--chromeless">
        <NavigationProgress />
        <main className="main-content main-content--chromeless">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <NavigationProgress />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userRole={userRole}
        navRole={navRole}
        userName={userFullName}
        isHomeroom={isHomeroom}
        isActingDirector={isActingDirector}
        schoolCode={schoolCode}
        schoolLogoUrl={schoolLogoUrl}
        schoolProgramName={schoolProgramName}
        schoolName={schoolName}
      />

      {sidebarOpen && (
        <div
          className="sidebar-overlay lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Navbar
        title={pageTitle}
        userRole={userRole}
        userFullName={userFullName}
        schoolCode={schoolCode}
        onMenuClick={() => setSidebarOpen(true)}
      />

      <main className="main-content">
        <div className="content-shell">
          {children}
        </div>
      </main>
    </div>
  )
}

export default function LayoutClient(props: Props) {
  return (
    <Suspense fallback={<div className="app-shell"><main className="main-content">{props.children}</main></div>}>
      <LayoutClientInner {...props} />
    </Suspense>
  )
}
