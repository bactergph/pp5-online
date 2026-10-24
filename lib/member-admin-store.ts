import 'server-only'
import type { createServerClient } from './supabase'
import type { ManagedMember, MemberSchool } from './member-admin'

/** Directory reads must not make an Auth request or count every school's data per row. */
export async function loadMemberDirectory(db:ReturnType<typeof createServerClient>) {
  const admins:ManagedMember[]=[],schools:MemberSchool[]=[]
  for(let offset=0;;offset+=500){
    const result=await db.from('users').select('id,email,prefix,full_name,position,is_active,school_id,created_at')
      .eq('role','admin').order('created_at',{ascending:false,nullsFirst:false}).order('id').range(offset,offset+499)
    if(result.error)throw Error('โหลดสมาชิกไม่สำเร็จ: '+result.error.message)
    admins.push(...result.data)
    if(result.data.length<500)break
  }
  const ids=[...new Set(admins.map(member=>member.school_id).filter((id):id is string=>!!id))]
  for(let offset=0;offset<ids.length;offset+=200){
    const result=await db.from('schools').select('id,name,district,province,member_code,membership_kind,member_plan,membership_started_on,membership_expires_on,membership_version').in('id',ids.slice(offset,offset+200))
    if(result.error)throw Error('โหลดแพ็กเกจสมาชิกไม่สำเร็จ: '+result.error.message)
    schools.push(...result.data)
  }
  const byId=new Map(schools.map(school=>[school.id,school]))
  return {admins:admins.map(member=>({...member,school:member.school_id?byId.get(member.school_id)||null:null})),schools}
}
