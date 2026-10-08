type Actor = {userId:string;role:string;schoolId:string|null;mustChangePassword?:boolean}
type Target = {id?:string;role:string;school_id:string|null}
export const SCHOOL_STAFF_ROLES = ['teacher','academic_head','deputy_principal','principal','admin']
export function staffAccessError(actor:Actor|null,target?:Target|null) {
  if (!actor || !['admin','district'].includes(actor.role) || actor.mustChangePassword) return 'ไม่มีสิทธิ์จัดการบุคลากร'
  if (!actor.schoolId) return 'กรุณากำหนดโรงเรียนก่อนจัดการบุคลากร'
  if (target !== undefined && (!target || target.school_id !== actor.schoolId || !SCHOOL_STAFF_ROLES.includes(target.role))) return 'ไม่มีสิทธิ์จัดการบัญชีนี้ หรือบัญชีไม่ได้อยู่ในโรงเรียนของคุณ'
  return null
}
export function staffProfileError(payload:Record<string,unknown>) {
  const allowed=['prefix','full_name','position','role','is_homeroom','signature_url']
  if (Object.keys(payload).some(k=>!allowed.includes(k))) return 'ข้อมูลที่แก้ไขมีฟิลด์ที่ไม่อนุญาต'
  if ('role' in payload && (typeof payload.role!=='string' || !SCHOOL_STAFF_ROLES.includes(payload.role))) return 'บทบาทไม่ถูกต้อง'
  if ('full_name' in payload && (typeof payload.full_name!=='string' || !payload.full_name.trim())) return 'กรุณากรอกชื่อ-นามสกุล'
  if ('is_homeroom' in payload && typeof payload.is_homeroom!=='boolean') return 'ข้อมูลครูประจำชั้นไม่ถูกต้อง'
  if (['prefix','position','signature_url'].some(k=>k in payload && payload[k]!==null && typeof payload[k]!=='string')) return 'ข้อมูลบุคลากรไม่ถูกต้อง'
  return null
}
