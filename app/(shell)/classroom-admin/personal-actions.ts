'use server'
import {createServerClient} from '@/lib/supabase'
import {getSession} from '@/lib/session'
import {readMembership} from '@/lib/member-plan'
import {personalHomeroomLimit,membershipLabel} from '@/lib/membership'

export async function fetchPersonalHomeroomSettings(){
  const session=await getSession()
  if(!session?.schoolId||session.mustChangePassword)throw Error('กรุณาเข้าสู่ระบบ')
  if(session.role==='district')return null
  const membership=await readMembership(session.schoolId),limit=personalHomeroomLimit(membership)
  if(limit===null)return null
  if(!limit)throw Error('แพ็กเกจนี้ไม่มีสิทธิ์งานประจำชั้น')
  const db=createServerClient()
  const [owner,years,rooms,selected]=await Promise.all([
    db.from('schools').select('membership_owner_id').eq('id',session.schoolId).maybeSingle(),
    db.from('academic_years').select('id,year_be,is_active').eq('school_id',session.schoolId).order('year_be',{ascending:false}),
    db.from('classrooms').select('id,level,room,academic_year_id').eq('school_id',session.schoolId).order('level').order('room'),
    db.from('personal_homeroom_rooms').select('classroom_id,academic_year_id').eq('school_id',session.schoolId),
  ])
  if(owner.error||owner.data?.membership_owner_id!==session.userId)throw Error('บัญชีส่วนตัวใช้ได้เฉพาะเจ้าของสมาชิก')
  if(years.error||rooms.error||selected.error)throw Error('โหลดห้องประจำชั้นไม่สำเร็จ กรุณาตรวจ SQL 087 หรือลองใหม่')
  return {limit,label:membershipLabel(membership),years:years.data||[],rooms:rooms.data||[],selected:selected.data||[]}
}
export async function savePersonalHomeroomSettings(yearId:string,roomIds:string[]){
  const session=await getSession()
  if(!session?.schoolId||session.mustChangePassword)return {error:'กรุณาเข้าสู่ระบบ'}
  const membership=await readMembership(session.schoolId),limit=personalHomeroomLimit(membership)
  if(limit===null||!limit)return {error:'ใช้ได้เฉพาะสมาชิก Pro / Pro Plus ส่วนตัว'}
  if(!Array.isArray(roomIds)||roomIds.some(id=>typeof id!=='string')||new Set(roomIds).size!==roomIds.length||roomIds.length>limit)return {error:`เลือกห้องประจำชั้นได้ไม่เกิน ${limit} ห้อง`}
  const {error}=await createServerClient().rpc('set_personal_homeroom_rooms',{p_school:session.schoolId,p_actor:session.userId,p_year:yearId,p_rooms:roomIds})
  return {error:error?.message||null}
}
