import 'server-only'
import {cache} from 'react'
import {createServerClient} from '@/lib/supabase'
import {readMembership} from '@/lib/member-plan'
import {personalHomeroomLimit} from '@/lib/membership'

type Access={userId:string;schoolId:string|null;role:string}
export const readPersonalDataScope=cache(async(schoolId:string,userId:string)=>{
  const membership=await readMembership(schoolId)
  const limit=personalHomeroomLimit(membership)
  if(limit===null)return null
  if(limit===0)throw Error('สมาชิกฟรีใช้จัดตารางบนอุปกรณ์ กรุณาสมัครสมาชิกเพื่อใช้งานนี้')
  const db=createServerClient()
  const [{data:school,error:ownerError},{data:rooms,error}]=await Promise.all([
    db.from('schools').select('membership_owner_id').eq('id',schoolId).maybeSingle(),
    db.from('personal_homeroom_rooms').select('classroom_id,academic_year_id').eq('school_id',schoolId),
  ])
  if(ownerError||school?.membership_owner_id!==userId)throw Error('บัญชีส่วนตัวใช้ได้เฉพาะเจ้าของสมาชิก')
  if(error)throw Error('โหลดสิทธิ์ห้องประจำชั้นไม่สำเร็จ กรุณาตรวจ SQL 087 หรือลองใหม่')
  return {membership,limit,rooms:rooms||[]}
})
export async function personalScope(access:Access){
  if(access.role==='district')return null
  if(!access.schoolId)throw Error('กรุณาเลือกโรงเรียน')
  return readPersonalDataScope(access.schoolId,access.userId)
}
export async function isPersonalSubjectAccess(access:Access){return (await personalScope(access))!==null}
export async function personalHomeroomIds(access:Access,yearId?:string):Promise<string[]|null>{
  const scope=await personalScope(access)
  if(!scope)return null
  const rooms=scope.rooms.filter(row=>!yearId||row.academic_year_id===yearId)
  const counts=new Map<string,number>()
  for(const row of rooms)counts.set(row.academic_year_id,(counts.get(row.academic_year_id)||0)+1)
  if([...counts.values()].some(count=>count>scope.limit))throw Error(`แพ็กเกจปัจจุบันทำงานประจำชั้นได้ ${scope.limit} ห้อง กรุณาเลือกห้องประจำชั้นใหม่`)
  return rooms.map(row=>row.classroom_id)
}
export async function assertPersonalHomeroom(access:Access,classroomId:string,yearId?:string){
  const ids=await personalHomeroomIds(access,yearId)
  if(ids&&!ids.includes(classroomId))throw Error('ทำงานประจำชั้นได้เฉพาะห้องที่เลือกไว้ใน “ห้องประจำชั้นของฉัน”')
}
