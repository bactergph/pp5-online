'use server'
import { createServerClient } from '@/lib/supabase'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'
import { seedEvaluationSettingsForSchool } from '@/lib/evaluation-settings-seed'
import { approveSelectedAdmins } from '@/lib/approve-admins'
import { validMembershipDate,type MemberPackage } from '@/lib/membership'
import {schoolAnnualQuote} from '@/lib/membership-offers'
import {validFreeTeacherLimit} from '@/lib/free-schedule-entitlement'

export async function approveAdmins(ids: string[]) {
  return approveSelectedAdmins(ids)
}

type SchoolRow = {
  id: string
  name: string
  created_by?: string | null
  district?: string | null
  province?: string | null
  member_code?: string | null
  moe_school_id?: string | null
  membership_kind?: string | null
  member_plan?: string | null
  membership_started_on?: string | null
  membership_expires_on?: string | null
  membership_version?: number
}

/** ค้นหาจากฐานอ้างอิง (catalog) — ตอนบันทึกจะสร้างโรงเรียนสมาชิกใหม่ให้ */
export async function searchSchoolsForAdminAssign(q: string) {
  await requireDistrict()
  const term = q.trim().replace(/,/g, ' ')
  if (term.length < 1) return [] as SchoolRow[]
  const db = createServerClient()
  const primary = await db
    .from('schools')
    .select('id, name, district, province')
    .eq('is_catalog', true)
    .or(`name.ilike.%${term}%,district.ilike.%${term}%,province.ilike.%${term}%`)
    .order('name')
    .limit(40)
  if (!primary.error) return (primary.data || []) as SchoolRow[]
  if (!String(primary.error.message || '').includes('is_catalog')) {
    throw new Error(primary.error.message)
  }
  const { data, error } = await db
    .from('schools')
    .select('id, name, district, province')
    .or(`name.ilike.%${term}%,district.ilike.%${term}%,province.ilike.%${term}%`)
    .order('name')
    .limit(40)
  if (error) throw new Error(error.message)
  return (data || []) as SchoolRow[]
}

export async function fetchAdminsAndSchools() {
  await requireDistrict()
  const {loadMemberDirectory}=await import('@/lib/member-admin-store')
  return loadMemberDirectory(createServerClient())
}

export async function fetchAdminAccountDetails(id:string) {
  await requireDistrict()
  const db=createServerClient()
  const target=await db.from('users').select('id').eq('id',id).eq('role','admin').maybeSingle()
  if(target.error||!target.data)throw Error('ไม่พบสมาชิก')
  const result=await db.auth.admin.getUserById(id)
  if(result.error||!result.data.user)throw Error('โหลดรายละเอียดบัญชีไม่สำเร็จ')
  return {quota:Number(result.data.user.app_metadata?.user_quota??15),lastSignIn:result.data.user.last_sign_in_at||null}
}

export async function setFreeScheduleTeacherLimit(schoolId:string,version:number,limit:number) {
  const session=await requireDistrict()
  if(!schoolId||!Number.isInteger(version)||version<0||!validFreeTeacherLimit(limit))return {error:'ระบุจำนวนครูเป็นจำนวนเต็ม ตั้งแต่ 25 คนขึ้นไป'}
  const result=await createServerClient().rpc('set_free_teacher_limit',{p_actor:session.userId,p_school:schoolId,p_version:version,p_limit:limit})
  if(result.error)return {error:result.error.code==='PGRST202'?'กรุณารันฐานข้อมูล 084_free_teacher_allowance.sql ก่อนปรับจำนวนครู':result.error.message}
  return {error:undefined}
}

/** ตั้งชนิดสมาชิกของโรงเรียนที่ผูกกับผู้ดูแลแล้ว */
export async function setSchoolPackage(schoolId: string, packageName: MemberPackage, input: {version:number;startDate:string;renew:boolean;note:string;studentCount?:number|null}) {
  const session = await requireDistrict()
  if (!['school', 'free', 'pro','pro_plus'].includes(packageName) || !input || !Number.isInteger(input.version) || typeof input.note!=='string' || input.note.length>500) return { error: 'แพ็กเกจหรือข้อมูลสมาชิกไม่ถูกต้อง' }
  if(packageName!=='free'&&!validMembershipDate(input.startDate))return {error:'กรุณาระบุวันเริ่มสมาชิก'}
  if(packageName==='school'&&!schoolAnnualQuote(input.studentCount??0))return {error:'กรุณาระบุจำนวนนักเรียนเพื่อคำนวณราคา School'}
  const result=await createServerClient().rpc('set_annual_membership_v2',{p_actor:session.userId,p_school:schoolId,p_version:input.version,p_package:packageName,p_start:packageName==='free'?null:input.startDate,p_renew:!!input.renew,p_note:input.note.trim(),p_student_count:packageName==='school'?input.studentCount:null})
  if(result.error)return {error:['PGRST202','PGRST204','42703','42P01'].includes(result.error.code)?'กรุณารัน migration 085_membership_packages_pricing.sql ก่อนจัดการสมาชิก':result.error.message}
  return {error:undefined}
}

export async function fetchMembershipHistory(schoolId:string){
  await requireDistrict()
  const result=await createServerClient().from('membership_history').select('id,previous_package,package,starts_on,expires_on,note,created_at,student_count,annual_price').eq('school_id',schoolId).order('created_at',{ascending:false}).limit(12)
  if(result.error)return {data:[],error:'โหลดประวัติสมาชิกไม่สำเร็จ กรุณาตรวจ migration 082'}
  return {data:result.data||[],error:null}
}

// Super Admin ตั้งโควต้าจำนวน user ที่ admin สร้างได้ในโรงเรียน
export async function setAdminQuota(adminId: string, quota: number) {
  const session = await requireDistrict()
  const db = createServerClient()
  const q = Math.max(0, Math.floor(Number(quota) || 0))
  const { data: target } = await db.from('users').select('full_name, school_id').eq('id', adminId).maybeSingle()
  const { error } = await db.auth.admin.updateUserById(adminId, { app_metadata: { user_quota: q } })
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: target?.school_id ?? null,
      action: 'set_quota',
      module: 'district_admins',
      targetType: 'user',
      targetId: adminId,
      targetLabel: target?.full_name ?? 'ผู้ดูแลโรงเรียน',
      description: `ตั้งโควต้าผู้ใช้ ${target?.full_name || ''} เป็น ${q} คน`.trim(),
      metadata: { quota: q },
    })
  }
  return { error: error?.message }
}

export async function updateAdmin(id: string, payload: {
  prefix?: string; full_name?: string; position?: string; school_id?: string
}) {
  const session = await requireDistrict()
  const db = createServerClient()

  const nextPayload = { ...payload }
  const {data:current,error:currentError}=await db.from('users').select('id,school_id').eq('id',id).eq('role','admin').maybeSingle()
  if(currentError||!current)return {error:'ไม่พบสมาชิก'}
  let memberMeta: { memberCode?: string | null; catalogId?: string } = {}
  if (payload.school_id && payload.school_id!==current.school_id) {
    try {
      const { resolveMemberSchoolId } = await import('@/lib/school-member')
      const member = await resolveMemberSchoolId(payload.school_id)
      nextPayload.school_id = member.id
      memberMeta = { memberCode: member.member_code, catalogId: payload.school_id }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'สร้างโรงเรียนสมาชิกไม่สำเร็จ' }
    }
  }

  const { error } = await db.from('users').update(nextPayload).eq('id', id).eq('role','admin')
  if (!error) {
    if (nextPayload.school_id) {
      const { data: admin } = await db.from('users').select('is_active, role').eq('id', id).maybeSingle()
      if (admin?.is_active && admin.role === 'admin') {
        await seedEvaluationSettingsForSchool(nextPayload.school_id)
      }
    }
    await logActivity({
      actor: session,
      schoolId: nextPayload.school_id ?? current.school_id ?? null,
      action: 'update',
      module: 'district_admins',
      targetType: 'user',
      targetId: id,
      targetLabel: payload.full_name ?? 'ผู้ดูแลโรงเรียน',
      description: `แก้ไขผู้ดูแลโรงเรียน ${payload.full_name || ''}`.trim(),
      metadata: { fields: Object.keys(payload), ...memberMeta },
    })
  }
  return { error: error?.message }
}

export async function toggleAdminActive(id: string, isActive: boolean) {
  const session = await requireDistrict()
  const db = createServerClient()
  if(typeof isActive!=='boolean')return {error:'สถานะไม่ถูกต้อง'}
  const { data: target,error:targetError } = await db.from('users').select('full_name, school_id').eq('id', id).eq('role','admin').maybeSingle()
  if(targetError||!target)return {error:'ไม่พบสมาชิก'}
  const { error } = await db.from('users').update({ is_active: isActive }).eq('id', id).eq('role','admin')
  if (!error) {
    if (isActive && target?.school_id) {
      const { data: admin } = await db.from('users').select('role').eq('id', id).maybeSingle()
      if (admin?.role === 'admin') {
        await seedEvaluationSettingsForSchool(target.school_id)
      }
    }
    await logActivity({
      actor: session,
      schoolId: target?.school_id ?? null,
      action: isActive ? 'activate' : 'deactivate',
      module: 'district_admins',
      targetType: 'user',
      targetId: id,
      targetLabel: target?.full_name ?? 'ผู้ดูแลโรงเรียน',
      description: `${isActive ? 'เปิดใช้งาน' : 'ระงับ'}ผู้ดูแลโรงเรียน ${target?.full_name || ''}`.trim(),
    })
  }
  return {error:error?.message}
}

export async function deleteAdmins(ids: string[]) {
  const session = await requireDistrict()
  if (!Array.isArray(ids)||!ids.length||ids.length>200||ids.some(id=>typeof id!=='string')) return { error:'เลือกสมาชิกได้ครั้งละ 1–200 บัญชี' }
  ids=[...new Set(ids)]
  const db = createServerClient()
  const { data: targets,error:readError } = await db.from('users').select('id, full_name, school_id').in('id', ids).eq('role','admin')
  if(readError)return {error:readError.message}
  if(targets?.length!==ids.length)return {error:'ไม่พบสมาชิกบางบัญชี กรุณาโหลดข้อมูลใหม่'}
  const removed:string[]=[],failed:string[]=[]
  for(const target of targets){
    const auth=await db.auth.admin.deleteUser(target.id)
    if(auth.error){failed.push(`${target.full_name}: ${auth.error.message}`);continue}
    const result=await db.from('users').delete().eq('id',target.id).eq('role','admin')
    if(result.error)failed.push(`${target.full_name}: ${result.error.message}`)
    else removed.push(target.id)
  }
  if (removed.length) {
    try {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'delete',
      module: 'district_admins',
      targetType: 'user',
      description: `ลบสมาชิก ${removed.length} บัญชี`,
      metadata: { count: removed.length, names: targets.filter(target=>removed.includes(target.id)).map(target=>target.full_name) },
    })
    } catch { /* Account deletion succeeded; do not misreport an audit failure. */ }
  }
  return { error:failed.length?`ลบสำเร็จ ${removed.length} บัญชี · ไม่สำเร็จ ${failed.join('; ')}`:undefined }
}

export async function resetAdminPassword(userId: string, newPassword: string) {
  const session = await requireDistrict()
  if (newPassword.length < 8) return { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }
  const db = createServerClient()
  const { data: target } = await db.from('users').select('full_name, school_id').eq('id', userId).maybeSingle()
  const { error } = await db.auth.admin.updateUserById(userId, { password: newPassword })
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: target?.school_id ?? null,
      action: 'reset_password',
      module: 'district_admins',
      targetType: 'user',
      targetId: userId,
      targetLabel: target?.full_name ?? 'ผู้ดูแลโรงเรียน',
      description: `รีเซ็ตรหัสผ่านผู้ดูแลโรงเรียน ${target?.full_name || ''}`.trim(),
    })
  }
  return { error: error?.message }
}

/**
 * ล้างการตั้งค่าที่ผู้ดูแลโรงเรียนตั้งไว้ (onboarding / settings)
 * คงชื่อโรงเรียนและข้อมูลบัญชีรายชื่อจากเขต — ไม่ลบผู้ใช้ / ห้องเรียน / นักเรียน
 */
export async function resetSchoolMemberSettings(schoolId: string) {
  const session = await requireDistrict()
  const id = String(schoolId || '').trim()
  if (!id) return { error: 'ไม่ได้ระบุโรงเรียน' }

  const db = createServerClient()
  const { data: school, error: schoolErr } = await db
    .from('schools')
    .select('id, name, code')
    .eq('id', id)
    .maybeSingle()
  if (schoolErr) return { error: schoolErr.message }
  if (!school) return { error: 'ไม่พบโรงเรียน' }

  const { error: updateErr } = await db.from('schools').update({
    director_name: null,
    vice_director_name: null,
    acting_director: null,
    acting_director_position: null,
    academic_head_name: null,
    measurement_head_name: null,
    director_user_id: null,
    vice_director_user_id: null,
    acting_director_user_id: null,
    academic_head_user_id: null,
    measurement_head_user_id: null,
    code: null,
    program_name: null,
    created_by: null,
    logo_url: null,
    stamp_url: null,
    google_drive_refresh_token: null,
    google_drive_access_token: null,
    google_drive_token_expiry: null,
    google_drive_connected_email: null,
    google_drive_folder_id: null,
  }).eq('id', id)

  if (updateErr) return { error: updateErr.message }

  const { error: headsErr } = await db.from('subject_group_heads').delete().eq('school_id', id)
  if (headsErr && !headsErr.message.includes('subject_group_heads')) {
    return { error: headsErr.message }
  }

  await logActivity({
    actor: session,
    schoolId: id,
    action: 'reset_settings',
    module: 'district_admins',
    targetType: 'school',
    targetId: id,
    targetLabel: school.name,
    description: `ล้างการตั้งค่าโรงเรียน ${school.name}${school.code ? ` (เดิม /${school.code})` : ''}`.trim(),
    metadata: { previousCode: school.code || null },
  })

  return { error: undefined, schoolName: school.name as string }
}
