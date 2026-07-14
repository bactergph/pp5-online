'use server'
import { createServerClient } from '@/lib/supabase'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'
import { schoolCatalogKey } from '@/lib/moe-open-data'

/**
 * ลบโรงเรียนซ้ำ (ชื่อ+อำเภอ+จังหวัด เดียวกัน)
 * คงไว้แถวที่มีผู้ดูแล / มีข้อมูลใช้งาน / สร้างก่อน
 */
export async function dedupeCatalogSchools() {
  const session = await requireDistrict()
  const client = createServerClient()

  const PAGE = 1000
  const rows: { id: string; name: string | null; district: string | null; province: string | null; created_at?: string | null }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('schools')
      .select('id,name,district,province,created_at')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) return { error: error.message, removed: 0, kept: 0 }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }

  const { data: admins } = await client
    .from('users')
    .select('school_id')
    .eq('role', 'admin')
    .eq('is_active', true)
    .not('school_id', 'is', null)
  const adminSchools = new Set((admins || []).map(a => a.school_id as string))

  const { data: usedClassrooms } = await client.from('classrooms').select('school_id')
  const used = new Set((usedClassrooms || []).map(c => c.school_id as string).filter(Boolean))

  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = schoolCatalogKey(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }

  const toDelete: string[] = []
  let kept = 0
  for (const list of groups.values()) {
    if (list.length === 1) { kept += 1; continue }
    const ranked = [...list].sort((a, b) => {
      const score = (x: typeof a) =>
        (adminSchools.has(x.id) ? 100 : 0) +
        (used.has(x.id) ? 50 : 0)
      const ds = score(b) - score(a)
      if (ds !== 0) return ds
      return String(a.created_at || a.id).localeCompare(String(b.created_at || b.id))
    })
    kept += 1
    for (const dup of ranked.slice(1)) toDelete.push(dup.id)
  }

  let removed = 0
  const BATCH = 200
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const chunk = toDelete.slice(i, i + BATCH)
    // ห้ามลบถ้ายังมี user ผูกอยู่ (กันพลาด)
    const { data: linked } = await client.from('users').select('school_id').in('school_id', chunk)
    const blocked = new Set((linked || []).map(u => u.school_id as string))
    const safe = chunk.filter(id => !blocked.has(id))
    if (!safe.length) continue
    const { error } = await client.from('schools').delete().in('id', safe)
    if (error) return { error: error.message, removed, kept }
    removed += safe.length
  }

  await logActivity({
    actor: session,
    schoolId: null,
    action: 'delete',
    module: 'district_schools',
    targetType: 'school',
    description: `ลบโรงเรียนซ้ำในฐานข้อมูล ${removed} รายการ (เหลือกลุ่มไม่ซ้ำ ${kept})`,
    metadata: { removed, kept, scanned: rows.length },
  })

  return { error: undefined as string | undefined, removed, kept, scanned: rows.length }
}
