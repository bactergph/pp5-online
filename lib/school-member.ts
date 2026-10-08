import 'server-only'
import { createServerClient } from '@/lib/supabase'

function generateMemberCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = 'MS-'
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

type CatalogTemplate = {
  name:string;department?:string|null;area_office?:string|null;district?:string|null;
  province?:string|null;address?:string|null;phone?:string|null;document_prefix?:string|null
}
function schemaError(message:string) {
  if (message.includes('is_catalog') || message.includes('member_code')) {
    return new Error('ฐานข้อมูลยังไม่พร้อมสำหรับโรงเรียนสมาชิก กรุณาติดตั้ง migration 044_member_schools.sql ก่อนเลือกโรงเรียน')
  }
  return new Error(message)
}

/** Clone public catalog details into a fresh tenant; never attach to an existing member school. */
export async function createMemberSchoolFromCatalog(catalogId:string) {
  const db=createServerClient()
  const {data:src,error}=await db.from('schools')
    .select('id, name, department, area_office, district, province, address, phone, document_prefix, is_catalog')
    .eq('id',catalogId).maybeSingle()
  if (error) throw schemaError(error.message)
  if (!src) throw new Error('ไม่พบโรงเรียนในฐานข้อมูลอ้างอิง')
  if (src.is_catalog !== true) throw new Error('กรุณาเลือกโรงเรียนจากฐานอ้างอิง ไม่สามารถใช้โรงเรียนสมาชิกของบัญชีอื่นได้')
  return insertMemberSchool(db,src)
}

async function insertMemberSchool(db:ReturnType<typeof createServerClient>,src:CatalogTemplate) {
  for(let attempt=0;attempt<5;attempt++) {
    const memberCode=generateMemberCode()
    // Omitted optional columns keep database defaults. Ministry IDs, credentials,
    // leaders, branding and Drive connections are never copied from the catalog.
    const payload={name:src.name,department:src.department??null,area_office:src.area_office??null,
      district:src.district??null,province:src.province??null,address:src.address??null,
      phone:src.phone??null,document_prefix:src.document_prefix??null,is_catalog:false,member_code:memberCode}
    const {data,error}=await db.from('schools').insert(payload).select('id, name, member_code').single()
    if (!error && data) return {id:data.id as string,name:data.name as string,member_code:(data.member_code as string)||memberCode}
    if(error?.code==='23505' && error.message.includes('member_code')) continue
    throw schemaError(error?.message || 'สร้างโรงเรียนสมาชิกไม่สำเร็จ')
  }
  throw new Error('สร้างรหัสสมาชิกไม่สำเร็จ กรุณาลองอีกครั้ง')
}

/** District assignment may select an existing member; self-service onboarding uses catalog cloning only. */
export async function resolveMemberSchoolId(selectedSchoolId:string) {
  const {data,error}=await createServerClient().from('schools').select('id, name, is_catalog, member_code').eq('id',selectedSchoolId).maybeSingle()
  if(error) throw schemaError(error.message)
  if(!data) throw new Error('ไม่พบโรงเรียนที่เลือก')
  if(data.is_catalog===false) return {id:data.id as string,name:data.name as string,member_code:(data.member_code as string)||null}
  return createMemberSchoolFromCatalog(selectedSchoolId)
}
