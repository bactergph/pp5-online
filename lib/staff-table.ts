import 'server-only'
import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { schoolMemberEmail } from '@/lib/schoolAuth'
import { syncUserRoleToSchoolLeaders } from '@/lib/school-leaders'
import { logActivity } from '@/lib/audit'
import { staffAccessError } from '@/lib/staff-permissions'

const roles = ['teacher', 'academic_head', 'deputy_principal', 'principal', 'admin']
export type StaffTableRow = { key: string; id?: string; prefix: string; full_name: string; position: string; role: string; username: string; password: string; is_homeroom: boolean }

export function validateStaffRow(row: StaffTableRow) {
  if (!row.full_name?.trim()) throw Error('กรุณากรอกชื่อ-นามสกุล')
  if (row.role && !roles.includes(row.role)) throw Error('บทบาทไม่ถูกต้อง')
  if (row.username && !/^[a-z0-9._]+$/i.test(row.username.trim())) throw Error('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _')
  if (row.password && row.password.length < 6) throw Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
  if (!row.id && Boolean(row.username) !== Boolean(row.password)) throw Error('กรอกชื่อผู้ใช้และรหัสผ่านคู่กัน หรือเว้นทั้งสองช่องไว้ก่อน')
}

export async function saveStaffRows(rows: StaffTableRow[]) {
  const session = await getSession()
  if (!session?.schoolId || staffAccessError(session)) throw Error('ไม่มีสิทธิ์จัดการบุคลากร')
  if (!Array.isArray(rows) || !rows.length || rows.length > 50) throw Error('บันทึกได้ครั้งละ 1–50 รายการ')
  const db = createServerClient()
  const results: {key:string;id?:string;error?:string}[] = []
  for (const row of rows) {
    let createdId: string | undefined
    try {
      validateStaffRow(row)
      const username = row.username?.trim().toLowerCase() || null
      const { data: old, error: readError } = row.id
        ? await db.from('users').select('*').eq('id',row.id).eq('school_id',session.schoolId).maybeSingle()
        : {data:null,error:null}
      if (readError) throw Error(readError.message)
      if (row.id && !old) throw Error('ไม่พบบุคลากรในโรงเรียนนี้')
      if (old?.role === 'district') throw Error('ไม่สามารถแก้ไขบัญชีผู้ดูแลเขตผ่านตารางนี้')
      if (old?.id === session.userId && row.role !== old.role) throw Error('ไม่สามารถเปลี่ยนบทบาทบัญชีที่กำลังใช้งาน')
      const draft = !old || old.email?.startsWith('pending-')
      if (draft && Boolean(username) !== Boolean(row.password)) throw Error('กรอกชื่อผู้ใช้และรหัสผ่านคู่กัน หรือเว้นทั้งสองช่องไว้ก่อน')
      if (old && !draft && !row.role) throw Error('กรุณาเลือกบทบาทสำหรับบัญชีที่เปิดใช้งานแล้ว')
      if (draft && username && (!row.password || !row.role)) throw Error('เมื่อเปิดบัญชี กรุณากำหนดชื่อผู้ใช้ รหัสผ่าน และบทบาทให้ครบ')
      if (old?.username && !username) throw Error('ไม่สามารถลบชื่อผู้ใช้ของบัญชีที่เปิดใช้งานแล้ว')
      if (username) {
        const {data:dup,error} = await db.from('users').select('id').eq('school_id',session.schoolId).eq('username',username).maybeSingle()
        if (error) throw Error(error.message)
        if (dup && dup.id !== row.id) throw Error('ชื่อผู้ใช้นี้ถูกใช้แล้วในโรงเรียน')
      }
      const role = row.role || old?.role || 'teacher'
      const email = username && username !== old?.username ? schoolMemberEmail(username,session.schoolId) : old?.email || schoolMemberEmail(`pending-${randomUUID()}`,session.schoolId)
      const profile = {prefix:row.prefix || '',full_name:row.full_name.trim(),position:row.position || '',role,is_homeroom:Boolean(row.is_homeroom),username,email,is_active:old ? (draft ? Boolean(username && row.role) : old.is_active) : Boolean(username && row.role)}
      let id = row.id
      if (!id) {
        if (session.role === 'admin') {
          const {data:actor,error:actorError} = await db.auth.admin.getUserById(session.userId)
          if (actorError) throw Error(actorError.message)
          const quota = Number(actor.user?.app_metadata?.user_quota ?? 15)
          const {count,error} = await db.from('users').select('id',{count:'exact',head:true}).eq('school_id',session.schoolId).neq('role','district')
          if (error) throw Error(error.message)
          if ((count ?? 0) >= quota) throw Error(`เกินโควต้าบุคลากร (${quota} คน)`)
        }
        const {data,error} = await db.auth.admin.createUser({email,password:row.password || randomUUID()+randomUUID(),email_confirm:true,user_metadata:{full_name:profile.full_name},app_metadata:{staff_role_pending:!row.role}})
        if (error || !data.user) throw Error(error?.message || 'สร้างบัญชีไม่สำเร็จ')
        id = createdId = data.user.id
        const {error:profileError} = await db.from('users').upsert({id,school_id:session.schoolId,...profile})
        if (profileError) throw Error(profileError.message)
      } else {
        const {error} = await db.from('users').update(profile).eq('id',id).eq('school_id',session.schoolId)
        if (error) throw Error(error.message)
        if (email !== old.email || row.password || draft) {
          const {error:authError} = await db.auth.admin.updateUserById(id,{email,...(row.password?{password:row.password}:{}),...(draft?{app_metadata:{staff_role_pending:!row.role}}:{})})
          if (authError) {
            const {error:rollbackError} = await db.from('users').update(Object.fromEntries(Object.keys(profile).map(key=>[key,old[key]]))).eq('id',id).eq('school_id',session.schoolId)
            throw Error(authError.message + (rollbackError ? ' · คืนข้อมูลเดิมไม่สำเร็จ กรุณาตรวจสอบรายการนี้' : ''))
          }
        }
      }
      // The core save succeeded; reporting must not cause a retry to create duplicates.
      results.push({key:row.key,id})
      try {
        if (row.role) await syncUserRoleToSchoolLeaders(db,session.schoolId,{id,prefix:profile.prefix,full_name:profile.full_name,role})
        await logActivity({actor:session,schoolId:session.schoolId,action:row.id?'update':'create',module:'users',targetType:'user',targetId:id,targetLabel:profile.full_name,description:'บันทึกบุคลากรจากตาราง',metadata:{role,accountReady:profile.is_active}})
      } catch { /* Preserve the successful save result. */ }
    } catch (e) {
      if (createdId) await db.auth.admin.deleteUser(createdId)
      results.push({key:row.key,error:e instanceof Error?e.message:'บันทึกไม่สำเร็จ'})
    }
  }
  return results
}
