import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { isAcademicHeadRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

async function getSchoolStats(schoolId: string) {
  const { createServerClient } = await import('@/lib/supabase')
  const db = createServerClient()
  const [cr, sr, classroomIds] = await Promise.all([
    db.from('classrooms').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    db.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    db.from('classrooms').select('id').eq('school_id', schoolId),
  ])
  const ids = (classroomIds.data || []).map((c: { id: string }) => c.id)
  const [stR, csR] = ids.length > 0 ? await Promise.all([
    db.from('students').select('id', { count: 'exact', head: true }).in('classroom_id', ids),
    db.from('class_subjects').select('id', { count: 'exact', head: true }).in('classroom_id', ids),
  ]) : [{ count: 0 }, { count: 0 }]
  return {
    classrooms: cr.count ?? 0,
    subjects: sr.count ?? 0,
    students: stR.count ?? 0,
    pp5: csR.count ?? 0,
  }
}

async function getSchoolCode(schoolId: string) {
  const { createServerClient } = await import('@/lib/supabase')
  const db = createServerClient()
  const { data } = await db.from('schools').select('code').eq('id', schoolId).maybeSingle()
  return data?.code ? String(data.code).trim().toLowerCase() : null
}

async function getSchoolName(schoolId: string) {
  const { createServerClient } = await import('@/lib/supabase')
  const db = createServerClient()
  const { data } = await db.from('schools').select('name').eq('id', schoolId).maybeSingle()
  return data?.name ? String(data.name).trim() : ''
}

// Super Admin: ภาพรวมสมาชิก/ลูกค้าโรงเรียน
async function getDistrictStats() {
  const { createServerClient } = await import('@/lib/supabase')
  const db = createServerClient()
  const [adminRes, schoolCountRes, codeCountRes, userCountRes] = await Promise.all([
    db.from('users').select('is_active, school_id').eq('role', 'admin'),
    db.from('schools').select('id', { count: 'exact', head: true }),
    db.from('schools').select('id', { count: 'exact', head: true }).not('code', 'is', null),
    db.from('users').select('id', { count: 'exact', head: true }).neq('role', 'district'),
  ])
  const admins = adminRes.data
  const list = admins || []
  const active = list.filter(a => a.is_active).length
  const schoolsWithAdmin = new Set(list.filter(a => a.school_id).map(a => a.school_id)).size
  return {
    total: list.length,
    active,
    pending: list.length - active,
    schoolsWithAdmin,
    schools: schoolCountRes.count ?? 0,
    schoolsWithCode: codeCountRes.count ?? 0,
    memberUsers: userCountRes.count ?? 0,
  }
}

export default async function DashboardPage() {
  const s = await verifySession()
  // admin: กด "ตั้งค่าภายหลัง" ได้ชั่วคราว (cookie) — แต่ถ้าตั้งค่ายังไม่ครบและไม่มี cookie จะเด้ง onboarding
  // ไม่บังคับโลโก้ / Google Drive / นำเข้านักเรียน
  if (s.role === 'admin') {
    const { cookies } = await import('next/headers')
    const skipped = (await cookies()).get('onboarding_skipped')?.value === '1'
    if (!skipped) {
      const { getAdminOnboardingGate, onboardingUrl } = await import('@/lib/onboarding-complete')
      const gate = await getAdminOnboardingGate(s.schoolId)
      if (!gate.complete) redirect(onboardingUrl(gate.step))
    }
  }
  const effectiveRole = s.isHomeroom ? 'homeroom' : s.role
  const isDistrict = s.role === 'district'

  const districtStats = isDistrict ? await getDistrictStats() : null
  const schoolStats = !isDistrict && s.schoolId ? await getSchoolStats(s.schoolId) : null
  const schoolCode = !isDistrict && s.schoolId ? await getSchoolCode(s.schoolId) : null
  const schoolName = !isDistrict && s.schoolId ? await getSchoolName(s.schoolId) : ''

  let isActingDirector = false
  let signCounts: {
    pp5: number
    pp6: number
    classroomAdmin: number
    actionablePp5: number
    actionablePp6: number
    actionableClassroomAdmin: number
  } | null = null
  if (!isDistrict && s.schoolId) {
    const { createServerClient } = await import('@/lib/supabase')
    const db = createServerClient()
    const { data: school } = await db.from('schools')
      .select('acting_director_user_id')
      .eq('id', s.schoolId)
      .maybeSingle()
    isActingDirector = school?.acting_director_user_id === s.userId
  }

  const showSignPanel = s.role === 'principal' || isAcademicHeadRole(s.role) || isActingDirector
  if (showSignPanel && s.schoolId) {
    const { fetchSignPendingCounts } = await import('@/app/sign/actions')
    signCounts = await fetchSignPendingCounts()
  }
  const { withSchoolPrefix } = await import('@/lib/school-path')
  const scopeHref = (href: string) => withSchoolPrefix(schoolCode, href)
  const showClassroomAdminCard = isActingDirector || s.role === 'principal'

  return (
    <div className="page-stack">

      {/* Welcome */}
      <div className="hero-panel page-hero" style={{
        background: isDistrict
          ? 'linear-gradient(135deg, #2C2419 0%, #6B4F32 52%, #C49212 100%)'
          : 'linear-gradient(135deg, #6B4F32 0%, #8B6B45 50%, #C49212 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}>
        <div>
          {!isDistrict && schoolName ? (
            <p className="page-hero-kicker" style={{ color: 'rgba(255,248,231,0.9)', marginBottom: '4px', textTransform: 'none', letterSpacing: '0.02em' }}>
              {schoolName}
            </p>
          ) : null}
          <p className="page-hero-kicker" style={{ color: 'rgba(255,248,231,0.9)', marginBottom: '6px' }}>
            {isDistrict ? 'ระบบจัดการสมาชิก' : 'ยินดีต้อนรับ'}
          </p>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'white', marginBottom: '6px' }}>
            {isDistrict ? 'Super Admin Dashboard' : `คุณ${s.fullName}`}
          </h2>
          {isDistrict && (
            <p style={{ margin: '0 0 10px', color: 'rgba(255,255,255,0.82)', fontSize: 14, maxWidth: 640 }}>
              ดูแลสมาชิกโรงเรียน เปิด/ปิดบัญชี ตั้งโควตาผู้ใช้ และจัดการลิงก์เข้าใช้งานของลูกค้า
            </p>
          )}
          <span style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', fontSize: '12px', fontWeight: 600, padding: '4px 12px', borderRadius: '100px' }}>
            {getRoleLabel(s.role)}{s.isHomeroom ? ' · ครูประจำชั้น' : ''}
            {isDistrict ? ` · ${s.fullName}` : ''}
          </span>
        </div>
        <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {isDistrict ? (
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
              <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"/>
            </svg>
          ) : (
            <svg width="38" height="38" viewBox="0 0 28 28" fill="none">
              <path d="M14 2L26 8V14C26 20.6 20.8 26 14 28C7.2 26 2 20.6 2 14V8L14 2Z" fill="white" fillOpacity="0.9"/>
              <path d="M9 13H19M9 17H15M11 9H17" stroke="#6B4F32" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          )}
        </div>
      </div>

      {/* เอกสารรออนุมัติ — ผอ. / หัวหน้าวิชาการ */}
      {showSignPanel && (
        <div>
          <p className="section-title">เอกสารรออนุมัติ</p>
          <div className="responsive-grid">
            {([
              {
                label: 'ปพ.5 รายวิชา',
                href: scopeHref('/documents/sign?tab=subject'),
                count: signCounts?.pp5 ?? 0,
                actionable: signCounts?.actionablePp5 ?? 0,
                color: '#9D174D',
              },
              {
                label: 'ปพ.5 รวมชั้น / ปพ.6',
                href: scopeHref('/documents/sign?tab=class_pp6'),
                count: signCounts?.pp6 ?? 0,
                actionable: signCounts?.actionablePp6 ?? 0,
                color: '#0E7490',
              },
              ...(showClassroomAdminCard
                ? [{
                    label: 'ธุรการชั้นเรียน',
                    href: scopeHref('/classroom-admin/sign'),
                    count: signCounts?.classroomAdmin ?? 0,
                    actionable: signCounts?.actionableClassroomAdmin ?? 0,
                    color: '#B45309',
                  }]
                : []),
            ]).map(d => (
              <a key={d.href} href={d.href} className="card-sm quick-link" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '28px', fontWeight: 800, color: d.count > 0 ? d.color : '#9CA3AF', lineHeight: 1 }}>{d.count}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>รายการ</span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{d.label}</div>
                <div style={{ fontSize: '11px', color: d.count > 0 ? d.color : 'var(--text-3)' }}>
                  {d.count > 0
                    ? (d.actionable > 0 ? `ถึงคิวคุณ ${d.actionable} · ดูคิว →` : 'เสนอเซ็นแล้ว · ดูคิว →')
                    : 'ยังไม่มีเอกสารเสนอเซ็น'}
                </div>
              </a>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '8px' }}>
            {showClassroomAdminCard
              ? 'ตัวเลขหลัก = เอกสารเสนอเซ็นแล้วทั้งคิว · “ถึงคิวคุณ” = รอผอ./รักษาการลงนาม'
              : 'ตัวเลขหลัก = เอกสารเสนอเซ็นแล้วทั้งคิว · “ถึงคิวคุณ” = รอหัวหน้าวิชาการลงนาม'}
          </p>
        </div>
      )}

      {/* Stats — Super Admin (จัดการสมาชิกโรงเรียน) */}
      {isDistrict && districtStats && (
        <div className="responsive-grid-sm">
          {[
            { label: 'สมาชิกโรงเรียน', value: districtStats.total, icon: <UserIcon/>, color: '#8B6B45' },
            { label: 'ใช้งานอยู่', value: districtStats.active, icon: <GridIcon/>, color: '#059669' },
            { label: 'รออนุมัติ / ระงับ', value: districtStats.pending, icon: <AlertIcon/>, color: districtStats.pending > 0 ? '#D97706' : '#059669' },
            { label: 'โรงเรียนในระบบ', value: districtStats.schools, icon: <HomeIcon/>, color: '#0891B2' },
            { label: 'มีลิงก์เข้าโรงเรียน', value: districtStats.schoolsWithCode, icon: <DocIcon/>, color: '#C49212' },
            { label: 'ผู้ใช้ทั้งหมด', value: districtStats.memberUsers, icon: <BookIcon/>, color: '#DB2777' },
          ].map(m => (
            <div key={m.label} className="stat-card">
              <div style={{ color: m.color, flexShrink: 0 }}>{m.icon}</div>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>{m.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isDistrict && districtStats && (
        <div className="card-padded" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'center' }}>
          <div>
            <p className="section-title" style={{ marginBottom: 6 }}>งานที่ควรติดตาม</p>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>
              มีสมาชิกที่ยังไม่พร้อมใช้งาน {districtStats.pending} บัญชี และโรงเรียนที่มีผู้ดูแลแล้ว {districtStats.schoolsWithAdmin} แห่ง
            </p>
          </div>
          <a href="/district/admins" className="btn btn-primary">จัดการสมาชิกโรงเรียน</a>
        </div>
      )}

      {/* Stats — school roles */}
      {!isDistrict && (
        <div className="responsive-grid-sm">
          <StatCard icon={<HomeIcon/>} label="ห้องเรียน" value={schoolStats?.classrooms ?? '-'} color="#8B6B45" bg="#F5EDE3"/>
          <StatCard icon={<BookIcon/>} label="รายวิชา" value={schoolStats?.subjects ?? '-'} color="#0891B2" bg="#ECFEFF"/>
          <StatCard icon={<UserIcon/>} label="นักเรียน" value={schoolStats?.students ?? '-'} color="#059669" bg="#ECFDF5"/>
          <StatCard icon={<DocIcon/>} label="ปพ.5 ที่เปิดบันทึก" value={schoolStats?.pp5 ?? '-'} color="#D97706" bg="#FFFBEB"/>
        </div>
      )}

      {/* Quick links */}
      <div>
        <p className="section-title">เมนูด่วน</p>
        <div className="responsive-grid">
          {getQuickLinks(effectiveRole).map(ql => (
            <QuickLink key={ql.href} {...ql} href={scopeHref(ql.href)} />
          ))}
        </div>
      </div>
    </div>
  )
}

type QL = { href: string; icon: ReactNode; label: string; desc: string; color: string; bg: string }

function getQuickLinks(role: string): QL[] {
  const all: Record<string, QL> = {
    schools:    { href: '/district/schools',          icon: <HomeIcon/>,  label: 'ฐานข้อมูลโรงเรียน',        desc: 'เพิ่ม แก้ไข และเตรียมข้อมูลโรงเรียนลูกค้า', color: '#8B6B45', bg: '#F5EDE3' },
    admins:     { href: '/district/admins',           icon: <UserIcon/>,  label: 'สมาชิกโรงเรียน',           desc: 'อนุมัติ ระงับ รีเซ็ตรหัสผ่าน และตั้งโควตาผู้ใช้', color: '#0891B2', bg: '#ECFEFF' },
    subjects:   { href: '/district/subjects',         icon: <BookIcon/>,  label: 'โครงสร้างรายวิชากลาง',     desc: 'แม่แบบรายวิชาให้โรงเรียนนำไปใช้',           color: '#059669', bg: '#ECFDF5' },
    d_export:   { href: '/district/reports/export',   icon: <DocIcon/>,   label: 'ส่งออกข้อมูลระบบ',         desc: 'Export ข้อมูลเพื่อบริการลูกค้าและสำรองข้อมูล', color: '#DB2777', bg: '#FDF2F8' },
    school:     { href: '/settings/school',           icon: <HomeIcon/>,  label: 'ตั้งค่าโรงเรียน',        desc: 'ข้อมูลโรงเรียน ผู้บริหาร',               color: '#8B6B45', bg: '#F5EDE3' },
    users:      { href: '/settings/users',            icon: <UserIcon/>,  label: 'จัดการชื่อผู้ใช้งาน',     desc: 'เพิ่ม แก้ไข ครูและบัญชีผู้ใช้งาน',        color: '#0891B2', bg: '#ECFEFF' },
    classrooms: { href: '/classrooms',                icon: <GridIcon/>,  label: 'ชั้นเรียน',              desc: 'จัดการห้องเรียน ครูประจำชั้น',            color: '#059669', bg: '#ECFDF5' },
    scores:     { href: '/scores',                    icon: <EditIcon/>,  label: 'บันทึกคะแนน',            desc: 'กรอกคะแนนระหว่างเรียน กลางภาค ปลายภาค', color: '#D97706', bg: '#FFFBEB' },
    attendance: { href: '/attendance/hourly',         icon: <ClockIcon/>, label: 'เช็คเวลาเรียนรายวิชา',   desc: 'เช็คชื่อตามคาบสอน สำหรับ ปพ.5',          color: '#C49212', bg: '#F5F3FF' },
    admin_att:  { href: '/classroom-admin',           icon: <DocIcon/>,   label: 'ธุรการชั้นเรียน',        desc: 'เวลาเรียน น้ำหนัก/ส่วนสูง ตรวจสุขภาพ',  color: '#DB2777', bg: '#FDF2F8' },
    students:   { href: '/students',                  icon: <UserIcon/>,  label: 'ข้อมูลนักเรียน',         desc: 'ทะเบียนนักเรียนในห้องเรียน',             color: '#059669', bg: '#ECFDF5' },
    eval_sum:   { href: '/evaluation/summary/reading',icon: <GridIcon/>,  label: 'สรุปการประเมินชั้นเรียน', desc: 'ดูสรุปอ่านคิดวิเคราะห์/กิจกรรม เลือกชั้นได้', color: '#0891B2', bg: '#ECFEFF' },
    sign:       { href: '/documents/sign',            icon: <EditIcon/>,  label: 'ลงนาม',                  desc: 'ตรวจและลงนาม ปพ.5 ปพ.6 ธุรการชั้นเรียน', color: '#9D174D', bg: '#FDF2F8' },
    export_pp:  { href: '/export/pp5-all',            icon: <DocIcon/>,   label: 'Export ปพ.5 / ปพ.6',     desc: 'ออกเอกสาร ปพ.5 ทั้งเล่ม และ ปพ.6',       color: '#D97706', bg: '#FFFBEB' },
    report_st:  { href: '/reports/status',            icon: <GridIcon/>,  label: 'สถานะการบันทึก',         desc: 'ชั้นที่บันทึกธุรการ/กรอก ปพ.5 แล้ว',      color: '#C49212', bg: '#F5F3FF' },
    assign:     { href: '/settings/users',            icon: <UserIcon/>,  label: 'มอบหมายครู',             desc: 'กำหนดวิชาสอน และครูประจำชั้น',           color: '#0E7490', bg: '#ECFEFF' },
    evaluation: { href: '/evaluation/character',      icon: <GridIcon/>,  label: 'การวัดและประเมินผล',     desc: 'คุณลักษณะ 8 ข้อ · อ่านคิดวิเคราะห์ · กิจกรรมพัฒนาผู้เรียน', color: '#0891B2', bg: '#ECFEFF' },
    homeroom_pp:{ href: '/homeroom/pp5',              icon: <DocIcon/>,   label: 'ปพ.5 / ปพ.6 ห้องเรียน',  desc: 'ดูและ Export ของนักเรียนประจำชั้น',       color: '#B45309', bg: '#FFFBEB' },
    exp_subj:   { href: '/export/pp5-subject',        icon: <DocIcon/>,   label: 'Export ปพ.5 รายวิชา',    desc: 'ส่งออก ปพ.5 ของวิชาที่สอน',              color: '#D97706', bg: '#FFFBEB' },
    rpt_indiv:  { href: '/reports/individual',        icon: <UserIcon/>,  label: 'รายงานรายบุคคล',         desc: 'ดูพัฒนาการนักเรียนรายคน ทุกชั้น',         color: '#C49212', bg: '#F5F3FF' },
  }

  switch (role) {
    case 'district':
      return [all.admins, all.schools, all.subjects, all.d_export]
    case 'admin':
      return [all.school, all.users, all.classrooms, all.eval_sum, all.report_st, all.export_pp]
    case 'principal':
      return [all.classrooms, all.sign, all.eval_sum, all.report_st, all.rpt_indiv]
    case 'academic_head':
    case 'deputy_principal':
      return [all.assign, all.sign, all.eval_sum, all.classrooms, all.rpt_indiv]
    case 'homeroom':
      return [all.admin_att, all.scores, all.attendance, all.evaluation, all.homeroom_pp, all.students]
    case 'teacher':
      return [all.scores, all.attendance, all.students, all.exp_subj]
    default:
      return [all.attendance, all.students]
  }
}

function StatCard({ icon, label, value, color, bg }: { icon: ReactNode; label: string; value: number | string; color: string; bg: string }) {
  return (
    <div className="card-sm">
      <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>{icon}</div>
      <div style={{ fontSize: '24px', fontWeight: 800, color, marginBottom: '2px' }}>{value}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>{label}</div>
    </div>
  )
}

function QuickLink({ href, icon, label, desc, color, bg }: { href: string; icon: ReactNode; label: string; desc: string; color: string; bg: string }) {
  return (
    <a href={href} className="card-sm quick-link" style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
      <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>{label}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-3)', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </a>
  )
}

function S({ d }: { d: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
}
function HomeIcon() { return <S d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10"/> }
function BookIcon() { return <S d="M4 19.5A2.5 2.5 0 016.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/> }
function UserIcon() { return <S d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z"/> }
function DocIcon()  { return <S d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8"/> }
function GridIcon() { return <S d="M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z"/> }
function EditIcon() { return <S d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5 M17.5 2.5a2.121 2.121 0 013 3L12 14l-4 1 1-4 8.5-8.5z"/> }
function ClockIcon(){ return <S d="M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2"/> }

function AlertIcon() { return <S d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01"/> }

function getRoleLabel(r: string) {
  const map: Record<string, string> = {
    district: 'Super Admin',
    admin: 'ผู้ดูแลโรงเรียน',
    principal: 'ผู้อำนวยการ',
    deputy_principal: 'รองผู้อำนวยการ',
    academic_head: 'หัวหน้าวิชาการ',
    teacher: 'ครูผู้สอน',
  }
  return map[r] || r
}
