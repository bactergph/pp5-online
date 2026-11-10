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

async function getSchoolContext(schoolId: string) {
  const { createServerClient } = await import('@/lib/supabase')
  const db = createServerClient()
  const [{ data: school }, { data: year }] = await Promise.all([
    db.from('schools').select('name, code, acting_director_user_id').eq('id', schoolId).maybeSingle(),
    db.from('academic_years').select('year_be').eq('school_id', schoolId).eq('is_active', true).maybeSingle(),
  ])
  return {
    name: school?.name ? String(school.name).trim() : '',
    code: school?.code ? String(school.code).trim().toLowerCase() : null,
    yearBe: year?.year_be ?? null,
    actingDirectorId: school?.acting_director_user_id ? String(school.acting_director_user_id) : null,
  }
}

async function getDistrictStats() {
  const { createServerClient } = await import('@/lib/supabase')
  const db = createServerClient()
  const [adminRes, schoolCountRes, codeCountRes, userCountRes] = await Promise.all([
    db.from('users').select('is_active, school_id').eq('role', 'admin'),
    db.from('schools').select('id', { count: 'exact', head: true }),
    db.from('schools').select('id', { count: 'exact', head: true }).not('code', 'is', null),
    db.from('users').select('id', { count: 'exact', head: true }).neq('role', 'district'),
  ])
  const list = adminRes.data || []
  const active = list.filter(a => a.is_active).length
  return {
    total: list.length,
    active,
    pending: list.length - active,
    schoolsWithAdmin: new Set(list.filter(a => a.school_id).map(a => a.school_id)).size,
    schools: schoolCountRes.count ?? 0,
    schoolsWithCode: codeCountRes.count ?? 0,
    memberUsers: userCountRes.count ?? 0,
  }
}

function countText(value: number) {
  return value.toLocaleString('th-TH')
}

export default async function DashboardPage() {
  const s = await verifySession()
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
  const school = !isDistrict && s.schoolId ? await getSchoolContext(s.schoolId) : null
  const schoolStats = !isDistrict && s.schoolId ? await getSchoolStats(s.schoolId) : null
  const isActingDirector = Boolean(school && school.actingDirectorId === s.userId)

  let signCounts: {
    pp5: number
    pp6: number
    classroomAdmin: number
    actionablePp5: number
    actionablePp6: number
    actionableClassroomAdmin: number
  } | null = null
  const showSignPanel = s.role === 'principal' || isAcademicHeadRole(s.role) || isActingDirector
  if (showSignPanel && s.schoolId) {
    const { fetchSignPendingCounts } = await import('@/app/sign/actions')
    signCounts = await fetchSignPendingCounts()
  }
  const { withSchoolPrefix } = await import('@/lib/school-path')
  const scopeHref = (href: string) => withSchoolPrefix(school?.code || null, href)
  const showClassroomAdminCard = isActingDirector || s.role === 'principal'
  const links = getQuickLinks(effectiveRole)
  const queues = showSignPanel ? [
    {
      label: 'ปพ.5 รายวิชา',
      href: scopeHref('/documents/sign?tab=subject'),
      count: signCounts?.pp5 ?? 0,
      actionable: signCounts?.actionablePp5 ?? 0,
    },
    {
      label: 'ปพ.5 รวมชั้น / ปพ.6',
      href: scopeHref('/documents/sign?tab=class_pp6'),
      count: signCounts?.pp6 ?? 0,
      actionable: signCounts?.actionablePp6 ?? 0,
    },
    ...(showClassroomAdminCard ? [{
      label: 'ธุรการชั้นเรียน',
      href: scopeHref('/classroom-admin/sign'),
      count: signCounts?.classroomAdmin ?? 0,
      actionable: signCounts?.actionableClassroomAdmin ?? 0,
    }] : []),
  ] : []
  const urgent = queues.find(item => item.actionable > 0)
  const primary = urgent
    ? { href: urgent.href, label: `ลงนาม${urgent.label}` }
    : { href: scopeHref(links[0]?.href || '/dashboard'), label: links[0]?.label || 'เริ่มงาน' }
  const roleBits = [
    getRoleLabel(s.role),
    s.isHomeroom ? 'ครูประจำชั้น' : '',
    school?.yearBe ? `ปีการศึกษา ${school.yearBe}` : '',
  ].filter(Boolean)

  return (
    <div className="page-stack">
      <section className="control-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>{isDistrict ? 'ดูแลสมาชิกโรงเรียน' : (school?.name || 'หน้าหลัก')}</div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
            {roleBits.join(' · ')}
            {isDistrict ? ` · ${s.fullName}` : ''}
          </p>
          <p style={{ margin: '8px 0 0', color: 'var(--text-2)', fontSize: 14, maxWidth: 640 }}>
            {isDistrict && districtStats
              ? `สมาชิกที่ยังไม่พร้อมใช้งาน ${countText(districtStats.pending)} บัญชี · โรงเรียนที่มีผู้ดูแลแล้ว ${countText(districtStats.schoolsWithAdmin)} แห่ง`
              : roleLead(effectiveRole)}
          </p>
        </div>
        <a className="btn btn-primary" href={isDistrict ? '/district/admins' : primary.href}>
          {isDistrict ? 'จัดการสมาชิกโรงเรียน' : primary.label}
        </a>
      </section>

      {queues.length > 0 ? (
        <section className="data-card" style={{ padding: '8px 20px 16px' }}>
          <div className="section-title" style={{ margin: '12px 0 4px' }}>เอกสารรออนุมัติ</div>
          <p style={{ margin: '0 0 4px', color: 'var(--text-3)', fontSize: 13 }}>
            {showClassroomAdminCard
              ? 'ตัวเลขคือเอกสารที่เสนอเซ็นแล้วทั้งคิว ถึงคิวคุณคือรอผู้อำนวยการหรือผู้รักษาการ'
              : 'ตัวเลขคือเอกสารที่เสนอเซ็นแล้วทั้งคิว ถึงคิวคุณคือรอหัวหน้าวิชาการ'}
          </p>
          {queues.map(item => (
            <a key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderTop: '1px solid #F1F5F9', textDecoration: 'none', color: 'inherit' }}>
              <strong style={{ width: 72, fontSize: 28, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: item.count > 0 ? 'var(--text)' : 'var(--text-3)' }}>{countText(item.count)}</strong>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{item.label}</span>
                <span style={{ display: 'block', marginTop: 2, color: 'var(--text-3)', fontSize: 13 }}>
                  {item.count > 0 ? (item.actionable > 0 ? `ถึงคิวคุณ ${countText(item.actionable)} รายการ` : 'เสนอเซ็นแล้ว ยังไม่ถึงคิว') : 'ยังไม่มีเอกสารเสนอเซ็น'}
                </span>
              </span>
              <span style={{ color: 'var(--text-3)', fontSize: 13 }}>เปิด</span>
            </a>
          ))}
        </section>
      ) : null}

      <section className="data-card" style={{ padding: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))' }}>
        {(isDistrict && districtStats ? [
          { label: 'สมาชิกโรงเรียน', value: districtStats.total },
          { label: 'ใช้งานอยู่', value: districtStats.active },
          { label: 'รออนุมัติหรือระงับ', value: districtStats.pending },
          { label: 'โรงเรียนในระบบ', value: districtStats.schools },
          { label: 'มีลิงก์เข้าโรงเรียน', value: districtStats.schoolsWithCode },
          { label: 'ผู้ใช้ทั้งหมด', value: districtStats.memberUsers },
        ] : [
          { label: 'ห้องเรียน', value: schoolStats?.classrooms ?? 0 },
          { label: 'รายวิชา', value: schoolStats?.subjects ?? 0 },
          { label: 'นักเรียน', value: schoolStats?.students ?? 0 },
          { label: 'ปพ.5 ที่เปิดบันทึก', value: schoolStats?.pp5 ?? 0 },
        ]).map(item => (
          <div key={item.label} style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 28, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, color: item.label === 'รออนุมัติหรือระงับ' && item.value > 0 ? '#92400E' : 'var(--text)' }}>{countText(item.value)}</div>
            <div style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 13 }}>{item.label}</div>
          </div>
        ))}
      </section>

      <section className="data-card" style={{ padding: '8px 20px 12px' }}>
        <div className="section-title" style={{ margin: '12px 0 0' }}>{workTitle(effectiveRole)}</div>
        {links.map(link => (
          <a key={link.href} href={scopeHref(link.href)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: '1px solid #F1F5F9', textDecoration: 'none', color: 'inherit' }}>
            <span style={{ width: 20, flex: 'none', color: 'var(--text-3)' }}>{link.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', fontWeight: 600 }}>{link.label}</strong>
              <span style={{ display: 'block', marginTop: 2, color: 'var(--text-3)', fontSize: 13 }}>{link.desc}</span>
            </span>
            <span style={{ color: 'var(--text-3)', fontSize: 13 }}>เปิด</span>
          </a>
        ))}
      </section>
    </div>
  )
}

type QL = { href: string; icon: ReactNode; label: string; desc: string; color: string; bg: string }

function getQuickLinks(role: string): QL[] {
  const all: Record<string, QL> = {
    schools:    { href: '/district/schools',          icon: <HomeIcon/>,  label: 'ฐานข้อมูลโรงเรียน',        desc: 'เพิ่ม แก้ไข และเตรียมข้อมูลโรงเรียนลูกค้า', color: '#235bc8', bg: '#edf4ff' },
    admins:     { href: '/district/admins',           icon: <UserIcon/>,  label: 'สมาชิกโรงเรียน',           desc: 'อนุมัติ ระงับ รีเซ็ตรหัสผ่าน และตั้งโควตาผู้ใช้', color: '#0891B2', bg: '#ECFEFF' },
    schedules:  { href: '/schedules/class/manage',    icon: <GridIcon/>,  label: 'จัดตารางเรียน',           desc: 'เตรียมข้อมูลและจัดตารางอัตโนมัติ 7 ขั้นตอน', color: '#235bc8', bg: '#edf4ff' },
    timetable:  { href: '/schedules/teaching',         icon: <ClockIcon/>, label: 'ดูตารางสอน',           desc: 'ดูคาบสอนและตารางสอนรายสัปดาห์', color: '#235bc8', bg: '#edf4ff' },
    subjects:   { href: '/district/subjects',         icon: <BookIcon/>,  label: 'โครงสร้างรายวิชากลาง',     desc: 'แม่แบบรายวิชาให้โรงเรียนนำไปใช้',           color: '#059669', bg: '#ECFDF5' },
    d_export:   { href: '/district/free-ad',          icon: <DocIcon/>,   label: 'จัดการโฆษณา',             desc: 'กำหนดโฆษณาสำหรับหน้าจัดตารางสอนฟรี', color: '#DB2777', bg: '#FDF2F8' },
    school:     { href: '/settings/school',           icon: <HomeIcon/>,  label: 'ตั้งค่าโรงเรียน',        desc: 'ข้อมูลโรงเรียน ผู้บริหาร',               color: '#235bc8', bg: '#edf4ff' },
    users:      { href: '/settings/users',            icon: <UserIcon/>,  label: 'จัดการชื่อผู้ใช้งาน',     desc: 'เพิ่ม แก้ไข ครูและบัญชีผู้ใช้งาน',        color: '#0891B2', bg: '#ECFEFF' },
    classrooms: { href: '/classrooms',                icon: <GridIcon/>,  label: 'ชั้นเรียน',              desc: 'จัดการห้องเรียน ครูประจำชั้น',            color: '#059669', bg: '#ECFDF5' },
    scores:     { href: '/scores',                    icon: <EditIcon/>,  label: 'บันทึกคะแนน',            desc: 'กรอกคะแนนระหว่างเรียน กลางภาค ปลายภาค', color: '#D97706', bg: '#FFFBEB' },
    attendance: { href: '/attendance/hourly',         icon: <ClockIcon/>, label: 'เช็คเวลาเรียนรายวิชา',   desc: 'เช็คชื่อตามคาบสอน สำหรับ ปพ.5',          color: '#C49212', bg: '#F5F3FF' },
    admin_att:  { href: '/classroom-admin',           icon: <DocIcon/>,   label: 'ธุรการชั้นเรียน',        desc: 'เวลาเรียน น้ำหนัก/ส่วนสูง ตรวจสุขภาพ',  color: '#DB2777', bg: '#FDF2F8' },
    students:   { href: '/students',                  icon: <UserIcon/>,  label: 'ข้อมูลนักเรียน',         desc: 'ทะเบียนนักเรียนในห้องเรียน',             color: '#059669', bg: '#ECFDF5' },
    eval_sum:   { href: '/evaluation/reading',        icon: <GridIcon/>,  label: 'ประเมินการอ่าน คิด เขียน', desc: 'เลือกห้องและบันทึกผลการประเมินนักเรียน', color: '#0891B2', bg: '#ECFEFF' },
    sign:       { href: '/documents/sign',            icon: <EditIcon/>,  label: 'ลงนาม',                  desc: 'ตรวจและลงนาม ปพ.5 ปพ.6 ธุรการชั้นเรียน', color: '#9D174D', bg: '#FDF2F8' },
    export_pp:  { href: '/reports/pp5',              icon: <DocIcon/>,   label: 'พิมพ์ ปพ.5 รายวิชา',       desc: 'ดูตัวอย่างและพิมพ์รายงานรายวิชาเป็น PDF',       color: '#D97706', bg: '#FFFBEB' },
    report_st:  { href: '/reports/pp6',              icon: <GridIcon/>,  label: 'ปพ.6 นักเรียน',           desc: 'ดูผลการเรียนและพิมพ์รายงานนักเรียน',      color: '#C49212', bg: '#F5F3FF' },
    assign:     { href: '/settings/class-subjects',  icon: <UserIcon/>,  label: 'มอบหมายครูผู้สอน',         desc: 'กำหนดผู้รับผิดชอบรายวิชาและห้องเรียน',           color: '#0E7490', bg: '#ECFEFF' },
    evaluation: { href: '/evaluation/character',      icon: <GridIcon/>,  label: 'การวัดและประเมินผล',     desc: 'คุณลักษณะ 8 ข้อ อ่านคิดวิเคราะห์ กิจกรรมพัฒนาผู้เรียน', color: '#0891B2', bg: '#ECFEFF' },
    homeroom_pp:{ href: '/reports/pp6',              icon: <DocIcon/>,   label: 'ปพ.6 ห้องประจำชั้น',       desc: 'ดูและพิมพ์ผลการเรียนของนักเรียนประจำชั้น',       color: '#B45309', bg: '#FFFBEB' },
    exp_subj:   { href: '/reports/pp5',              icon: <DocIcon/>,   label: 'พิมพ์ ปพ.5 รายวิชา',       desc: 'ดูตัวอย่างและพิมพ์ ปพ.5 ของวิชาที่สอน',              color: '#D97706', bg: '#FFFBEB' },
    rpt_indiv:  { href: '/reports/pp6',              icon: <UserIcon/>,  label: 'ปพ.6 นักเรียน',           desc: 'ดูผลการเรียนและพิมพ์รายงานนักเรียน',         color: '#C49212', bg: '#F5F3FF' },
  }

  switch (role) {
    case 'district':
      return [all.admins, all.schools, all.subjects, all.d_export]
    case 'admin':
      return [all.schedules, all.school, all.users, all.classrooms, all.eval_sum, all.export_pp]
    case 'principal':
      return [all.classrooms, all.sign, all.eval_sum, all.timetable, all.rpt_indiv]
    case 'academic_head':
    case 'deputy_principal':
      return [all.schedules, all.assign, all.sign, all.eval_sum, all.classrooms, all.rpt_indiv]
    case 'homeroom':
      return [all.admin_att, all.scores, all.attendance, all.evaluation, all.homeroom_pp, all.students]
    case 'teacher':
      return [all.scores, all.attendance, all.timetable, all.students, all.exp_subj]
    default:
      return [all.attendance, all.students]
  }
}

function roleLead(role: string) {
  const map: Record<string, string> = {
    district: 'ดูแลสมาชิกโรงเรียน เปิดปิดบัญชี และลิงก์เข้าใช้งาน',
    admin: 'จัดตาราง ตั้งค่าโรงเรียน และดูแลบัญชีผู้ใช้',
    principal: 'ลงนามเอกสารที่ถึงคิว และดูภาพรวมห้องเรียน',
    deputy_principal: 'จัดตาราง มอบหมายครู และลงนามวิชาการ',
    academic_head: 'จัดตาราง มอบหมายครู และลงนามวิชาการ',
    homeroom: 'เริ่มจากธุรการห้องประจำชั้น แล้วตามด้วยคะแนนและเวลาเรียน',
    teacher: 'เริ่มจากคะแนน เวลาเรียน และตารางสอน',
  }
  return map[role] || 'เลือกงานจากรายการด้านล่าง'
}

function workTitle(role: string) {
  const map: Record<string, string> = {
    district: 'งานดูแลสมาชิก',
    admin: 'งานผู้ดูแลโรงเรียน',
    principal: 'งานผู้อำนวยการ',
    deputy_principal: 'งานวิชาการ',
    academic_head: 'งานวิชาการ',
    homeroom: 'งานครูประจำชั้น',
    teacher: 'งานครูผู้สอน',
  }
  return map[role] || 'งานวันนี้'
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

function getRoleLabel(r: string) {
  const map: Record<string, string> = {
    district: 'ผู้ดูแลระบบ',
    admin: 'ผู้ดูแลโรงเรียน',
    principal: 'ผู้อำนวยการ',
    deputy_principal: 'รองผู้อำนวยการ',
    academic_head: 'หัวหน้าวิชาการ',
    teacher: 'ครูผู้สอน',
  }
  return map[r] || r
}
