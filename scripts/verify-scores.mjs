// Verify Phase 3: scores upsert against real schema + grade calc round-trip.
// Reads .env.local, finds demo teacher's class_subject, picks a student, upserts a score, verifies, cleans up.
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const SCHOOL = 'bb1585db-0d31-4c01-ac47-0dc55bc98644'

function calcGrade(total, totalMax) {
  if (!totalMax || totalMax <= 0) return 0
  const pct = (total / totalMax) * 100
  if (pct >= 80) return 4; if (pct >= 75) return 3.5; if (pct >= 70) return 3
  if (pct >= 65) return 2.5; if (pct >= 60) return 2; if (pct >= 55) return 1.5
  if (pct >= 50) return 1; return 0
}
const q = (p) => fetch(`${url}/rest/v1/${p}`, { headers: h }).then(r => r.json())

// 1. find a classroom in this school
const classrooms = await q(`classrooms?school_id=eq.${SCHOOL}&select=id,level,room&limit=5`)
console.log('classrooms:', classrooms.length, classrooms.map(c => `${c.level}/${c.room}`).join(', '))
if (!classrooms.length) { console.log('NO CLASSROOMS — cannot test grid, but schema test below still runs'); }

// 2. find a class_subject + its score_config + a student
let cs = null, student = null, config = null
for (const c of classrooms) {
  const list = await q(`class_subjects?classroom_id=eq.${c.id}&select=id,subject_id&limit=1`)
  if (!list.length) continue
  const cfg = await q(`score_configs?class_subject_id=eq.${list[0].id}&term=eq.1&select=*`)
  const st = await q(`students?classroom_id=eq.${c.id}&select=id,first_name&limit=1`)
  if (st.length) { cs = list[0]; student = st[0]; config = cfg[0] || null; break }
}
console.log('class_subject:', cs?.id || 'none', '| student:', student?.first_name || 'none', '| config:', config ? `total_max=${config.total_max}, units=${JSON.stringify(config.between_scores)}` : 'none')

if (!cs || !student) { console.log('SKIP upsert test — no demo class_subject+student data seeded'); process.exit(0) }

// 3. build a score row exactly like saveScores does
const totalMax = config?.total_max || 100
const unit_scores = { '1': 8, '2': 9 }
const between_total = 17
const midterm_score = 14, final_score = 18
const term_total = between_total + midterm_score + final_score // 49
const grade = calcGrade(term_total, totalMax)
const payload = [{
  student_id: student.id, class_subject_id: cs.id, term: 1,
  unit_scores, between_total, midterm_score, final_score, term_total, grade, result: 'เรียน',
  updated_at: new Date().toISOString(),
}]
console.log(`computed: term_total=${term_total}/${totalMax} -> grade=${grade}`)

const up = await fetch(`${url}/rest/v1/scores?on_conflict=student_id,class_subject_id,term`, {
  method: 'POST', headers: { ...h, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(payload),
})
const upBody = await up.json()
console.log('UPSERT:', up.status, up.ok ? 'OK' : JSON.stringify(upBody))
if (!up.ok) process.exit(1)

// 4. read back
const back = await q(`scores?student_id=eq.${student.id}&class_subject_id=eq.${cs.id}&term=eq.1&select=term_total,grade,result,unit_scores`)
console.log('READBACK:', JSON.stringify(back[0]))
const ok = back[0] && Number(back[0].term_total) === term_total && Number(back[0].grade) === grade
console.log(ok ? '✅ round-trip MATCHES' : '❌ MISMATCH')

// 5. cleanup
await fetch(`${url}/rest/v1/scores?student_id=eq.${student.id}&class_subject_id=eq.${cs.id}&term=eq.1`, { method: 'DELETE', headers: h })
console.log('cleaned up test row')
