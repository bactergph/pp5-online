import 'server-only'
import { requireDistrict } from '@/lib/district'
import { createServerClient } from '@/lib/supabase'
import { seedEvaluationSettingsForSchool } from '@/lib/evaluation-settings-seed'
import { logActivity } from '@/lib/audit'

export async function approveSelectedAdmins(ids: string[]) {
  const session = await requireDistrict()
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id=>typeof id!=='string')) throw Error('เลือกผู้ดูแลได้ครั้งละ 1–200 รายการ')
  const unique = [...new Set(ids)]
  const db = createServerClient()
  const {data:targets,error} = await db.from('users').select('id, full_name, school_id, role, is_active').in('id',unique).eq('role','admin')
  if (error) throw Error(error.message)
  const approved:string[] = [], skipped:string[] = [], failed:{id:string;name:string;error:string}[] = []
  for (const id of unique) {
    const target=targets?.find(t=>t.id===id)
    if (!target) {failed.push({id,name:id,error:'ไม่พบผู้ดูแลโรงเรียน'});continue}
    if (target.is_active) {skipped.push(id);continue}
    try {
      if (!target.school_id) throw Error('ยังไม่ได้กำหนดโรงเรียน')
      const seeded=await seedEvaluationSettingsForSchool(target.school_id, true)
      if (seeded.error) throw Error(seeded.error)
      const {data:updated,error:updateError}=await db.from('users').update({is_active:true}).eq('id',id).eq('role','admin').eq('is_active',false).select('id')
      if (updateError) throw Error(updateError.message)
      if (!updated?.length) {skipped.push(id);continue}
      approved.push(id)
      try {
        await logActivity({actor:session,schoolId:target.school_id,action:'activate',module:'district_admins',targetType:'user',targetId:id,targetLabel:target.full_name,description:`อนุมัติผู้ดูแลโรงเรียน ${target.full_name} จากรายการที่เลือก`})
      } catch { /* Activation succeeded; do not report it as a failed approval. */ }
    } catch(e) {failed.push({id,name:target.full_name,error:e instanceof Error?e.message:'อนุมัติไม่สำเร็จ'})}
  }
  return {approved,skipped,failed}
}
