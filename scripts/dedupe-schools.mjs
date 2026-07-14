import { createClient } from '@supabase/supabase-js'

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const PAGE = 1000
const rows = []

for (let from = 0; ; from += PAGE) {
  const { data, error } = await s
    .from('schools')
    .select('id,name,district,province,created_at')
    .order('id')
    .range(from, from + PAGE - 1)
  if (error) {
    console.error('err', error.message)
    process.exit(1)
  }
  if (!data?.length) break
  rows.push(...data)
  if (data.length < PAGE) break
}

const { data: admins } = await s
  .from('users')
  .select('school_id')
  .eq('role', 'admin')
  .eq('is_active', true)
  .not('school_id', 'is', null)
const adminSet = new Set((admins || []).map(a => a.school_id))

const { data: cls } = await s.from('classrooms').select('school_id')
const used = new Set((cls || []).map(c => c.school_id).filter(Boolean))

const key = (r) => `${String(r.name || '').trim()}|${String(r.district || '').trim()}|${String(r.province || '').trim()}`
const groups = new Map()
for (const r of rows) {
  const k = key(r)
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}

const toDelete = []
let kept = 0
for (const list of groups.values()) {
  if (list.length === 1) {
    kept++
    continue
  }
  const ranked = [...list].sort((a, b) => {
    const sc = (x) => (adminSet.has(x.id) ? 100 : 0) + (used.has(x.id) ? 50 : 0)
    const d = sc(b) - sc(a)
    if (d) return d
    return String(a.created_at || a.id).localeCompare(String(b.created_at || b.id))
  })
  kept++
  for (const d of ranked.slice(1)) toDelete.push(d.id)
}

console.log('scanned', rows.length, 'groups', groups.size, 'toDelete', toDelete.length, 'kept', kept)

const BATCH = 200
let removed = 0
for (let i = 0; i < toDelete.length; i += BATCH) {
  const chunk = toDelete.slice(i, i + BATCH)
  const { data: linked } = await s.from('users').select('school_id').in('school_id', chunk)
  const blocked = new Set((linked || []).map(u => u.school_id))
  const safe = chunk.filter(id => !blocked.has(id))
  if (!safe.length) continue
  const { error } = await s.from('schools').delete().in('id', safe)
  if (error) {
    console.error('del err', error.message)
    break
  }
  removed += safe.length
  if (removed % 2000 === 0) console.log('removed', removed)
}

const { count } = await s.from('schools').select('*', { count: 'exact', head: true })
console.log('done removed', removed, 'remaining', count)
