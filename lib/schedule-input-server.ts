import 'server-only'
import { getSession } from './session'
import { createServerClient } from './supabase'
import { SCHEDULE_EDIT_ROLES } from './schedules'
import { saveStaffRows } from './staff-table'
import { preparation, type Preparation } from './schedule-preparation'
import { validateSubjectInputs, type SubjectInputRow } from './schedule-input'
import { prepareSubjectDetails, type SubjectDetailsInput } from './schedule-subject-details'

export async function saveSubjectDetails(year:string,term:number,hash:string,lessonId:string,input:SubjectDetailsInput){
  const session=await getSession()
  if(!session?.schoolId||session.mustChangePassword||!SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number]))throw Error('ไม่มีสิทธิ์แก้ไขรายวิชา')
  const current=await preparation(year,term)
  if(current.hash!==hash)throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
  const {details,rule}=prepareSubjectDetails(current,lessonId,input)
  const saved=await createServerClient().rpc('save_schedule_subject_details',{p_school:session.schoolId,p_year:year,p_term:term,p_hash:hash,p_lesson:lessonId,p_details:details,p_rule:rule})
  failWrite(saved.error,'บันทึกรายละเอียดรายวิชาไม่สำเร็จ')
  return preparation(year,term)
}

function failWrite(error: { message?: string; code?: string } | null, fallback: string) {
  if (!error) return
  const message = error.message || ''
  if (error.code === '23514' || /subjects_group_check|subject_group/.test(message)) throw Error('กลุ่มสาระไม่ถูกต้อง')
  if (/invalid input syntax for type uuid/.test(message)) throw Error('รายวิชายังไม่กำหนดครู จึงบันทึกไม่ได้')
  if (/^[\u0E00-\u0E7F]/.test(message)) throw Error(message)
  throw Error(fallback)
}
async function fetchPages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>, fallback: string) {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const page = await load(from, from + 999)
    failWrite(page.error ?? null, fallback)
    const data = page.data || []
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}
function venueId(config: Preparation['plan'], venue: string, current: string | null | undefined) {
  const name = venue.trim()
  if (!name) return current || null
  const found = config.rooms.find(room => room.name === name)
  if (found) return found.id
  const id = crypto.randomUUID()
  config.rooms.push({ id, name })
  return id
}

export async function importScheduleTeachers(year: string, term: number, rows: { key: string; prefix: string; name: string; position: string }[]) {
  // Reuse the personnel service: account roles, quota and permission checks stay intact.
  const current = await preparation(year, term)
  if (!Array.isArray(rows) || !rows.length || rows.length > 50) throw Error('เพิ่มครูได้ครั้งละ 1–50 คน')
  const known = new Map(current.teachers.map(t => [`${(t.prefix || '').trim()}|${t.full_name.trim()}`, t.id]))
  const sourceKeys = new Map<string, string>()
  const filtered = rows.filter(r => {
    if (!r.name?.trim() || r.name.length > 200 || r.prefix.length > 30 || r.position.length > 100) throw Error('กรอกชื่อครูและตำแหน่งให้ถูกต้อง')
    const key = `${r.prefix.trim()}|${r.name.trim()}`
    if (known.has(key) || sourceKeys.has(key)) return false
    sourceKeys.set(key, r.key); return true
  })
  const results = filtered.length ? await saveStaffRows(filtered.map(r => ({ key: r.key, prefix: r.prefix.trim(), full_name: r.name.trim(), position: r.position.trim(), role: '', username: '', password: '', is_homeroom: false }))) : []
  return { results: rows.map(r => {
    const nameKey = `${r.prefix.trim()}|${r.name.trim()}`
    const existingId = known.get(nameKey)
    if (existingId) return { key: r.key, id: existingId }
    const outcome = results.find(result => result.key === sourceKeys.get(nameKey))
    return { key: r.key, id: outcome?.id, error: outcome?.error || (!outcome ? 'ไม่พบผลบันทึกรายการนี้ กรุณาโหลดข้อมูลล่าสุด' : undefined) }
  }), reused: rows.length - filtered.length }
}

export async function importScheduleSubjects(year: string, term: number, hash: string, rows: SubjectInputRow[]) {
  const session = await getSession()
  if (!session?.schoolId || session.mustChangePassword || !SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])) throw Error('ไม่มีสิทธิ์จัดตารางเรียน')
  validateSubjectInputs(rows)
  const current = await preparation(year, term)
  if (hash !== current.hash) throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
  for (const row of rows) {
    if (!current.classrooms.some(c => c.id === row.classroomId)) throw Error('ห้องไม่ได้อยู่ในโรงเรียนและปีการศึกษานี้')
    if (row.teacherId && !current.teachers.some(t => t.id === row.teacherId)) throw Error('ครูไม่ได้อยู่ในโรงเรียนและปีการศึกษานี้')
  }
  const db = createServerClient()
  const roomLevel = (classroomId: string) => current.classrooms.find(room => room.id === classroomId)?.level || ''
  const offerings = new Map(current.lessons.filter(lesson => !lesson.activity).map(lesson => [`${lesson.classroomId}|${lesson.code.trim().toLowerCase()}`, lesson]))
  let levelColumn = true
  let listed: { id: string; code: string; name: string; level: string | null }[]
  try {
    listed = await fetchPages((from, to) => db.from('subjects').select('id,code,name,level').eq('school_id', session.schoolId).range(from, to), 'โหลดรายวิชาเดิมไม่สำเร็จ')
  } catch {
    levelColumn = false
    listed = (await fetchPages<{ id: string; code: string; name: string }>((from, to) => db.from('subjects').select('id,code,name').eq('school_id', session.schoolId).range(from, to), 'โหลดรายวิชาเดิมไม่สำเร็จ')).map(item => ({ ...item, level: null }))
  }
  const catalog = listed.map(item => ({ id: item.id, code: item.code.trim(), name: item.name, level: item.level || '' }))
  const findSubject = (code: string, level: string) => {
    const key = code.trim().toLowerCase()
    const exact = catalog.find(item => item.code.toLowerCase() === key && item.level === level)
    if (exact) return exact
    const same = catalog.filter(item => item.code.toLowerCase() === key)
    if (same.length === 1 && !same[0].level) return same[0]
    return undefined
  }
  for (const row of rows) {
    const knownSubject = findSubject(row.code, roomLevel(row.classroomId))
    const offering = offerings.get(`${row.classroomId}|${row.code.trim().toLowerCase()}`)
    const existingName = offering?.fullName || offering?.name || knownSubject?.name || ''
    if (existingName && existingName.trim() !== row.name.trim()) throw Error(`รหัสวิชา ${row.code} มีชื่อเดิมต่างจากข้อมูลนำเข้า กรุณาใช้ชื่อเดิมหรือแก้ที่ข้อมูลรายวิชา`)
    const placed = (current.slots || []).filter(slot => slot.class_subject_id === offering?.id).length
    if (offering && placed > row.count) throw Error(`วิชา ${row.code} มีคาบในตาราง ${placed} คาบ มากกว่าจำนวนที่นำเข้า`)
  }
  const missing: { school_id: string; code: string; name: string; subject_group: string; type: string; hours_per_year: number; level: string | null }[] = []
  for (const row of rows) {
    const code = row.code.trim()
    const level = roomLevel(row.classroomId)
    if (findSubject(code, level) || missing.some(item => item.code.toLowerCase() === code.toLowerCase() && (item.level || '') === level)) continue
    missing.push({ school_id: session.schoolId, code, name: row.name.trim(), subject_group: row.group, type: row.type, hours_per_year: 0, level: level || null })
  }
  for (let offset = 0; offset < missing.length; offset += 500) {
    const chunk = missing.slice(offset, offset + 500)
    const withoutLevel = ({school_id,code,name,subject_group,type,hours_per_year}: typeof missing[number]) => ({school_id,code,name,subject_group,type,hours_per_year})
    const rowsToInsert = levelColumn ? chunk : chunk.map(withoutLevel)
    // Keep select strings literal so Supabase can infer the returned columns.
    let created = levelColumn
      ? await db.from('subjects').insert(rowsToInsert).select('id,code,name,level')
      : await db.from('subjects').insert(rowsToInsert).select('id,code,name')
    if (created.error && levelColumn && /level/i.test(created.error.message)) {
      levelColumn = false
      created = await db.from('subjects').insert(chunk.map(withoutLevel)).select('id,code,name')
    }
    failWrite(created.error, 'บันทึกรายวิชาใหม่ไม่สำเร็จ')
    for (const item of created.data || []) {
      const source = chunk.find(row => row.code.toLowerCase() === item.code.trim().toLowerCase() && (levelColumn ? (row.level || '') === ((item as { level?: string | null }).level || '') : true))
      catalog.push({ id: item.id, code: item.code.trim(), name: item.name, level: source?.level || '' })
    }
  }
  const config = JSON.parse(JSON.stringify(current.plan)) as Preparation['plan']
  config.rules = { ...config.rules }
  config.rooms = [...(config.rooms || [])]
  const fresh: { classroom_id: string; subject_id: string; teacher_id: string | null; academic_year_id: string; semester: number; key: string }[] = []
  for (const row of rows) {
    const code = row.code.trim()
    const key = `${row.classroomId}|${code.toLowerCase()}`
    const offering = offerings.get(key)
    const level = current.classrooms.find(room => room.id === row.classroomId)?.level || ''
    const semester = /^(ม\.|มัธยม)/.test(level) ? term : 0
    const offeringId = offering?.id || ''
    if (!offering) {
      const subject = findSubject(code, level)
      if (!subject?.id) throw Error('บันทึกรายวิชาไม่สำเร็จ')
      fresh.push({ classroom_id: row.classroomId, subject_id: subject.id, teacher_id: row.teacherId || null, academic_year_id: year, semester, key })
    } else if (row.teacherId && offering.teacherId !== row.teacherId) {
      const placed = await db.from('class_schedule_slots').select('id', { count: 'exact', head: true }).eq('class_subject_id', offering.id).eq('semester', term)
      failWrite(placed.error, 'ตรวจคาบในตารางก่อนเปลี่ยนครูไม่สำเร็จ')
      if ((placed.count ?? 0) > 0) throw Error(`วิชา ${code} มีคาบสอนแล้ว กรุณานำคาบออกก่อนเปลี่ยนครู`)
      const updated = await db.from('class_subjects').update({ teacher_id: row.teacherId }).eq('id', offering.id)
      failWrite(updated.error, 'บันทึกครูผู้สอนไม่สำเร็จ')
    }
    if (!offeringId) continue
    const previous = config.rules[offeringId] || { morning: false, spread: true, count: row.count, pattern: row.pattern, roomId: null }
    config.rules[offeringId] = { ...previous, count: row.count, pattern: row.pattern, roomId: venueId(config, row.venue, previous.roomId), morning: previous.morning ?? false, spread: previous.spread ?? true }
  }
  for (let offset = 0; offset < fresh.length; offset += 500) {
    const chunk = fresh.slice(offset, offset + 500)
    const created = await db.from('class_subjects').insert(chunk.map(({classroom_id,subject_id,teacher_id,academic_year_id,semester}) => ({classroom_id,subject_id,teacher_id,academic_year_id,semester}))).select('id,classroom_id,subject_id')
    failWrite(created.error, 'บันทึกวิชาของห้องไม่สำเร็จ')
    if ((created.data || []).length !== chunk.length) throw Error('บันทึกวิชาของห้องไม่สำเร็จ')
    for (const item of created.data || []) {
      const match = chunk.find(row => row.classroom_id === item.classroom_id && row.subject_id === item.subject_id)
      if (!match) continue
      const source = rows.find(row => `${row.classroomId}|${row.code.trim().toLowerCase()}` === match.key)
      if (!source) continue
      const previous = { morning: false, spread: true, count: source.count, pattern: source.pattern, roomId: null as string | null }
      config.rules[item.id] = { ...previous, count: source.count, pattern: source.pattern, roomId: venueId(config, source.venue, null), morning: false, spread: true }
    }
  }
  const plan = await db.from('schedule_plans').upsert({ school_id: session.schoolId, academic_year_id: year, semester: term, config }, { onConflict: 'school_id,academic_year_id,semester' })
  failWrite(plan.error, 'บันทึกภาระสอนของรายวิชาไม่สำเร็จ')
  return preparation(year, term)
}

export async function removeScheduleSubjects(year: string, term: number, hash: string, lessonIds: string[]) {
  const session = await getSession()
  if (!session?.schoolId || session.mustChangePassword || !SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])) throw Error('ไม่มีสิทธิ์จัดตารางเรียน')
  const current = await preparation(year, term)
  if (hash !== current.hash) throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
  if (!Array.isArray(lessonIds) || !lessonIds.length || lessonIds.length > 500 || new Set(lessonIds).size !== lessonIds.length) throw Error('เลือกรายวิชาที่จะลบได้ครั้งละ 1–500 รายการ')
  for (const id of lessonIds) {
    const lesson = current.lessons.find(item => item.id === id && !item.activity && current.classrooms.some(room => room.id === item.classroomId))
    if (!lesson) throw Error('มีรายวิชาที่ไม่อยู่ในห้องของโรงเรียนนี้')
  }
  const db = createServerClient()
  const scores = await db.from('scores').select('id', { count: 'exact', head: true }).in('class_subject_id', lessonIds)
  if (scores.error) throw Error('ตรวจคะแนนก่อนลบรายวิชาไม่สำเร็จ')
  if ((scores.count ?? 0) > 0) throw Error('ลบไม่ได้ เพราะมีรายวิชาที่กรอกคะแนนแล้ว')
  const slots = await db.from('class_schedule_slots').select('id', { count: 'exact', head: true }).in('class_subject_id', lessonIds)
  if (slots.error) throw Error('ตรวจคาบในตารางก่อนลบรายวิชาไม่สำเร็จ')
  if ((slots.count ?? 0) > 0) throw Error('มีคาบในตารางแล้ว นำคาบออกก่อนลบรายวิชา')
  const rules = { ...current.plan.rules }
  for (const id of lessonIds) delete rules[id]
  const plan = await db.from('schedule_plans').update({ config: { ...current.plan, rules } }).eq('school_id', session.schoolId).eq('academic_year_id', year).eq('semester', term)
  if (plan.error) throw Error('ลบภาระสอนของรายวิชานี้ไม่สำเร็จ')
  const removed = await db.from('class_subjects').delete().in('id', lessonIds)
  if (removed.error) throw Error('ลบรายวิชาไม่สำเร็จ อาจมีเอกสารที่อ้างถึงวิชานี้อยู่')
  return preparation(year, term)
}

/** Update existing offerings only; curriculum metadata comes from the server. */
export async function saveTeachingAssignments(year: string, term: number, hash: string, assignments: { lessonId: string; teacherId: string }[]) {
  const session = await getSession()
  if (!session?.schoolId || session.mustChangePassword || !SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])) throw Error('ไม่มีสิทธิ์จัดตารางเรียน')
  const current = await preparation(year, term)
  if (current.hash !== hash) throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
  if (!Array.isArray(assignments) || !assignments.length || assignments.length > 500 || new Set(assignments.map(r=>r.lessonId)).size !== assignments.length) throw Error('เลือกได้ครั้งละ 1–500 รายวิชาและห้ามซ้ำ')
  const eligible = current.plan.teacherIds ?? current.teachers.map(t=>t.id)
  const changes: { lessonId: string; teacherId: string; code: string }[] = []
  const clears: typeof current.lessons = []
  const rows: SubjectInputRow[] = []
  for (const row of assignments) {
    const lesson = current.lessons.find(l=>l.id===row.lessonId && !l.activity && current.classrooms.some(c=>c.id===l.classroomId))
    if (!lesson) throw Error('รายวิชาหรือครูไม่ได้อยู่ในขอบเขตจัดตารางของโรงเรียน')
    if (row.teacherId && (!eligible.includes(row.teacherId) || !current.teachers.some(t=>t.id===row.teacherId))) throw Error('รายวิชาหรือครูไม่ได้อยู่ในขอบเขตจัดตารางของโรงเรียน')
    if ((lesson.teacherId || '') !== row.teacherId) changes.push({ ...row, code: lesson.code })
    if (!row.teacherId) { clears.push(lesson); continue }
    const rule = current.plan.rules[lesson.id]
    rows.push({classroomId:lesson.classroomId, code:lesson.code, name:lesson.fullName || lesson.name, teacherId:row.teacherId,
      count:rule?.count ?? lesson.count, pattern:rule?.pattern ?? Array(lesson.count).fill(1),
      venue:current.plan.rooms.find(r=>r.id===rule?.roomId)?.name || lesson.roomName || '', group:lesson.subjectGroup || '', type:lesson.subjectType || 'พื้นฐาน'})
  }
  if (!changes.length) return current
  // The room/code/teacher editors assign one teacher (or clear one teacher) at a
  // time. Update their existing offerings together: do not import the curriculum,
  // rewrite its plan/venues or reload the full school between every operation.
  if (new Set(changes.map(row=>row.teacherId)).size === 1) {
    const occupied = new Set(current.slots.map(slot=>slot.class_subject_id).filter(Boolean))
    const placed = changes.find(row=>occupied.has(row.lessonId))
    if (placed) throw Error(`วิชา ${placed.code} มีคาบในตารางแล้ว นำคาบออกก่อนเปลี่ยนผู้สอน`)
    const updated = await createServerClient().from('class_subjects')
      .update({ teacher_id: changes[0].teacherId || null }).eq('academic_year_id', year)
      .in('id', changes.map(row=>row.lessonId)).select('id')
    failWrite(updated.error, 'บันทึกครูผู้สอนไม่สำเร็จ')
    if ((updated.data || []).length !== changes.length) throw Error('ข้อมูลรายวิชาเปลี่ยนระหว่างบันทึก กรุณาโหลดข้อมูลล่าสุด')
    return preparation(year, term)
  }
  const saved = rows.length ? await importScheduleSubjects(year, term, hash, rows) : current
  if (!clears.length) return saved
  const db = createServerClient()
  for (const lesson of clears) {
    const placed = await db.from('class_schedule_slots').select('id', { count: 'exact', head: true }).eq('class_subject_id', lesson.id)
    if (placed.error) throw Error('ตรวจคาบในตารางก่อนนำวิชาออกจากภาระครูไม่สำเร็จ')
    if ((placed.count ?? 0) > 0) throw Error(`วิชา ${lesson.code} มีคาบในตารางแล้ว นำคาบออกก่อนเอาออกจากภาระครู`)
  }
  const cleared = await db.from('class_subjects').update({ teacher_id: null }).in('id', clears.map(lesson => lesson.id))
  if (cleared.error) throw Error('นำวิชาออกจากภาระครูไม่สำเร็จ')
  return preparation(year, term)
}
