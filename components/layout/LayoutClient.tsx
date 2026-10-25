'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import NavigationProgress from './NavigationProgress'
import type { SchoolEducationType } from '@/lib/school-education-type'
import { isFreeMembership, membershipAllows, membershipFromRow, membershipPackage, membershipToday, type Membership } from '@/lib/membership'
import { MembershipUpgradeDialog, type MembershipAdData } from './MembershipUI'
import './membership.css'

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
  { prefix: '/documents/sign', title: 'ปพ.5เสนอเซ็น' },
  { prefix: '/classroom-admin/sign', title: 'ธุรการเสนอเซ็น' },
  { prefix: '/sign', title: 'ลงนาม' },
  { prefix: '/homeroom', title: 'ปพ.5 / ปพ.6 (ห้องเรียน)' },
  { prefix: '/score-config', title: 'สัดส่วนคะแนน' },
  { prefix: '/classroom-admin', title: 'ธุรการชั้นเรียน' },
  { prefix: '/activity', title: 'ประวัติการใช้งาน' },
  { prefix: '/export/qr-code', title: 'QR-Code' },
  { prefix: '/export', title: 'Export' },
  { prefix: '/dashboard', title: 'หน้าหลัก' },
]

function titleFromPath(pathname: string, fallback?: string) {
  const hit = TITLE_BY_PREFIX.find(t => pathname === t.prefix || pathname.startsWith(t.prefix + '/'))
  return hit?.title || fallback || 'ระบบ ปพ.5 ออนไลน์'
}

type Props = {
  educationType?: SchoolEducationType
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
  membership?: Membership | null
  membershipAd?: MembershipAdData | null
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
  educationType = 'primary',
  membership = null,
  membershipAd = null,
}: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [today, setToday] = useState(membershipToday)
  const [upgrade, setUpgrade] = useState('')
  const [deviceSchool, setDeviceSchool] = useState<{schoolName:string;logoDataUrl:string}|null>(null)
  const localSchool = pathname.includes('/schedules/device') ? deviceSchool : null
  useEffect(() => {
    const update = (event: Event) => {
      const data = (event as CustomEvent).detail
      if (typeof data?.schoolName !== 'string' || typeof data?.logoDataUrl !== 'string') return
      if (data.logoDataUrl && (data.logoDataUrl.length > 800000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.logoDataUrl))) return
      setDeviceSchool({schoolName:data.schoolName.slice(0,200),logoDataUrl:data.logoDataUrl})
    }
    window.addEventListener('device-school-settings',update)
    return()=>window.removeEventListener('device-school-settings',update)
  },[])
  const packageName = membership?.subscribedPackage || (membership ? membershipPackage(membership) : null)
  const effectiveMembership = membership && packageName ? membershipFromRow({membership_kind:packageName==='school'?'school':'individual',member_plan:packageName==='school'?null:packageName,membership_started_on:membership.startsOn,membership_expires_on:membership.expiresOn,free_schedule_teacher_limit:membership.freeTeacherLimit,membership_student_count:membership.studentCount,membership_annual_price:membership.annualPrice},today) : null
  const freeAccess = !!effectiveMembership && isFreeMembership(effectiveMembership)
  const upgradeRequested = searchParams.get('upgrade') === '1'
  const welcomeRequested = searchParams.get('welcome') === '1' && freeAccess
  useEffect(()=>{const timer=window.setInterval(()=>setToday(membershipToday()),60000);return()=>window.clearInterval(timer)},[])
  useEffect(() => {
    if (!packageName || (!upgradeRequested && !welcomeRequested)) return
    let active = true
    void Promise.resolve().then(() => { if (active) setUpgrade(welcomeRequested ? 'แพ็กเกจสมาชิก' : 'ฟังก์ชันที่เลือก') })
    return () => { active = false }
  }, [upgradeRequested, welcomeRequested, packageName])
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

  function closeUpgrade() {
    // Consume the redirect prompt so refreshes and later renders stay in Free.
    const url = new URL(window.location.href)
    if (url.searchParams.get('upgrade') === '1' || url.searchParams.get('welcome') === '1') {
      for (const key of ['upgrade', 'welcome']) {
        if (url.searchParams.get(key) === '1') url.searchParams.delete(key)
      }
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    setUpgrade('')
    setSidebarOpen(false)
  }

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
    <div className="app-shell workspace-theme" data-membership-free={freeAccess?'true':undefined} data-membership-school-code={schoolCode||undefined} onClickCapture={event=>{
      if(!effectiveMembership || !isFreeMembership(effectiveMembership) || !(event.target instanceof Element))return
      const locked=event.target.closest<HTMLElement>('[data-membership-locked]');if(locked){event.preventDefault();event.stopPropagation();setUpgrade(locked.dataset.membershipLocked||'ฟังก์ชันนี้');return}
      const link=event.target.closest<HTMLAnchorElement>('a[href]');if(!link)return
      const url=new URL(link.href,window.location.href);if(url.origin!==window.location.origin)return
      const path=schoolCode&&url.pathname.startsWith(`/${schoolCode}/`)?url.pathname.slice(schoolCode.length+1):url.pathname
      if(!membershipAllows(path,effectiveMembership)){event.preventDefault();event.stopPropagation();setUpgrade(link.textContent?.replace(/PRO/g,'').trim()||'ฟังก์ชันนี้')}
    }} onKeyDown={e => { if (e.key === 'Escape' && sidebarOpen) { setSidebarOpen(false); document.querySelector<HTMLButtonElement>('.navbar-menu-button')?.focus() } }}>
      <a href="#workspace-main" className="workspace-skip">ข้ามไปยังเนื้อหา</a>
      <NavigationProgress />
      <Sidebar
        educationType={educationType}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userRole={userRole}
        navRole={navRole}
        userName={userFullName}
        isHomeroom={isHomeroom}
        isActingDirector={isActingDirector}
        schoolCode={schoolCode}
        schoolLogoUrl={localSchool?localSchool.logoDataUrl:schoolLogoUrl}
        schoolProgramName={localSchool?.schoolName?null:schoolProgramName}
        schoolName={localSchool?.schoolName||schoolName}
        membership={effectiveMembership}
        onMembershipUpgrade={()=>setUpgrade('แพ็กเกจสมาชิก')}
        membershipAd={effectiveMembership&&isFreeMembership(effectiveMembership)&&pathname.includes('/schedules/device')?membershipAd:null}
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
        schoolName={localSchool?.schoolName||schoolName}
        sidebarOpen={sidebarOpen}
        onMenuClick={() => setSidebarOpen(true)}
        onMembershipUpgrade={effectiveMembership?()=>setUpgrade('แพ็กเกจสมาชิก'):undefined}
      />

      <main id="workspace-main" tabIndex={-1} className="main-content">
        <div className="content-shell">
          {children}
        </div>
      </main>
      <MembershipUpgradeDialog open={!!upgrade} feature={upgrade} membership={effectiveMembership} onClose={closeUpgrade}/>
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
