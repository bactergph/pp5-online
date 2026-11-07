/** วิชาย่อยของรายวิชาที่เปิดสอน ยังใช้รหัสวิชาเดิมทั้งคะแนนและเช็กชื่อ */

export const MAX_CONTENT_UNITS = 2
export const MAX_OFFERING_TEACHERS = 6

export type ContentUnit = { name: string; periods: number; teacherId: string | null; useMainTeacher: boolean }

function weeklyHoursFromYear(hoursPerYear: number) {
  if (!hoursPerYear || hoursPerYear <= 0) return 1
  return Math.max(1, Math.round(hoursPerYear / 40))
}

export function weeklyOfferingPeriods(level: string, credits: unknown, hours: unknown) {
  const text = (level || '').trim()
  const secondary = /^ม\.?\s*[1-6]\b/i.test(text) || /มัธยม/i.test(text)
  const value = Number(credits)
  if (secondary && Number.isFinite(value) && value > 0 && Number.isInteger(value * 2)) return value * 2
  return Number(hours) > 0 ? weeklyHoursFromYear(Number(hours)) : 0
}

export function readContentUnits(value: unknown): string[] {
  const source = Array.isArray(value) ? value : []
  const names: string[] = []
  for (const item of source) {
    const raw = typeof item === 'string' ? item : item && typeof item === 'object' && 'name' in item ? String((item as { name: unknown }).name) : ''
    const name = raw.trim()
    if (!name || names.includes(name)) continue
    names.push(name.slice(0, 80))
    if (names.length === MAX_CONTENT_UNITS) break
  }
  return names
}

export function assertContentUnits(value: unknown): string[] {
  const source = Array.isArray(value) ? value : []
  const names: string[] = []
  for (const item of source) {
    const raw = typeof item === 'string' ? item : ''
    const name = raw.trim()
    if (!name) continue
    if (name.length > 80) throw Error('ชื่อเนื้อหาย่อยต้องไม่เกิน 80 ตัวอักษร')
    if (!names.includes(name)) names.push(name)
  }
  if (names.length > MAX_CONTENT_UNITS) throw Error('กำหนดเนื้อหาย่อยได้ไม่เกิน 2 ชื่อ ในรหัสวิชาเดียวกัน')
  return names
}

export function readContentUnitRows(value: unknown): ContentUnit[] {
  if (!Array.isArray(value)) return []
  const rows: ContentUnit[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      const name = item.trim()
      if (name) rows.push({ name: name.slice(0, 80), periods: 0, teacherId: null, useMainTeacher: true })
    } else if (item && typeof item === 'object' && 'name' in item) {
      const record = item as Record<string, unknown>
      const name = String(record.name || '').trim()
      if (!name) continue
      const periods = Number(record.periods)
      const teacherId = typeof record.teacher_id === 'string' ? record.teacher_id : typeof record.teacherId === 'string' ? record.teacherId : null
      const useMainTeacher = record.use_main === true || record.useMainTeacher === true || !teacherId
      rows.push({ name: name.slice(0, 80), periods: Number.isInteger(periods) && periods > 0 ? periods : 0, teacherId: useMainTeacher ? null : teacherId, useMainTeacher })
    }
    if (rows.length === MAX_CONTENT_UNITS) break
  }
  return rows
}

export function assertContentUnitRows(value: unknown, weekly?: number): ContentUnit[] {
  if (!Array.isArray(value)) throw Error('ข้อมูลวิชาย่อยไม่ถูกต้อง')
  if (!value.length) return []
  if (weekly != null && weekly < 1) throw Error('ยังไม่ทราบจำนวนคาบต่อสัปดาห์ของวิชานี้ กรุณาตั้งชั่วโมงหรือหน่วยกิตในรายวิชาก่อน')
  const rows: ContentUnit[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') throw Error('ข้อมูลวิชาย่อยไม่ถูกต้อง')
    const record = item as Record<string, unknown>
    const name = String(record.name || '').trim()
    const periods = Number(record.periods)
    if (!name && !periods) continue
    if (!name || name.length > 80) throw Error('ชื่อวิชาย่อยต้องไม่เกิน 80 ตัวอักษร')
    if (!Number.isInteger(periods) || periods < 1 || periods > 40) throw Error(`จำนวนคาบของ ${name} ต้องเป็นจำนวนเต็ม 1–40`)
    const useMainTeacher = record.useMainTeacher === true || record.use_main === true
    const teacherId = useMainTeacher ? null : typeof record.teacherId === 'string' ? record.teacherId : typeof record.teacher_id === 'string' ? record.teacher_id : null
    if (!useMainTeacher && !teacherId) throw Error(`เลือกผู้สอนของวิชาย่อย ${name}`)
    if (rows.some(row => row.name === name)) throw Error('ชื่อวิชาย่อยซ้ำกัน')
    rows.push({ name, periods, teacherId, useMainTeacher })
  }
  if (!rows.length) throw Error('กรอกชื่อวิชาย่อย หรือเลือกไม่มีวิชาย่อย')
  if (rows.length > MAX_CONTENT_UNITS) throw Error('กำหนดวิชาย่อยได้ไม่เกิน 2 ชื่อ ในรหัสวิชาเดียวกัน')
  const sum = rows.reduce((total, row) => total + row.periods, 0)
  if (weekly && sum !== weekly) throw Error(`วิชาย่อยรวม ${sum} คาบ แต่รหัสวิชานี้มี ${weekly} คาบต่อสัปดาห์`)
  return rows
}

export function storedContentUnits(units: ContentUnit[]) {
  return units.map(unit => ({ name: unit.name, periods: unit.periods, teacher_id: unit.teacherId, use_main: unit.useMainTeacher }))
}

export function coTeachersFromUnits(mainTeacherId: string | null, units: ContentUnit[]) {
  return [...new Set(units.flatMap(unit => !unit.useMainTeacher && unit.teacherId && unit.teacherId !== mainTeacherId ? [unit.teacherId] : []))]
}

export function contentUnitFromNote(note?: string | null) {
  const match = /^unit:([01])$/.exec(note || '')
  return match ? Number(match[1]) : null
}

export function scheduledLessonId(row: { activity_id?: string | null; class_subject_id?: string | null; note?: string | null; content_unit?: number | null }) {
  if (row.activity_id) return `activity:${row.activity_id}`
  if (row.class_subject_id && row.content_unit != null) return `${row.class_subject_id}#${row.content_unit}`
  const unit = contentUnitFromNote(row.note)
  if (row.class_subject_id && unit != null) return `${row.class_subject_id}#${unit}`
  return row.class_subject_id || null
}

export function subjectWithUnits(name: string, units: string[]) {
  const extra = units.filter(Boolean).join(' · ')
  return extra ? `${name} (${extra})` : name
}

export function readScoreTerms(value: unknown): Array<1 | 2> {
  const terms = [...new Set((Array.isArray(value) ? value : [1, 2]).map(Number))].filter((term): term is 1 | 2 => term === 1 || term === 2)
  return terms.length ? terms.sort() : [1, 2]
}

export function assertScoreTerms(value: unknown): Array<1 | 2> {
  if (!Array.isArray(value)) throw Error('ต้องเปิดบันทึกคะแนนอย่างน้อย 1 ภาคเรียน')
  const terms = [...new Set(value.map(Number))].filter((term): term is 1 | 2 => term === 1 || term === 2).sort()
  if (!terms.length) throw Error('ต้องเปิดบันทึกคะแนนอย่างน้อย 1 ภาคเรียน')
  return terms
}

/** ภาค 1/2 ของมัธยมใช้ semester ของแถวนั้น ประถมรายปีใช้ score_terms */
export function scoreTermVisible(semester: number | null | undefined, scoreTerms: unknown, term: 1 | 2) {
  if (semester === 1 || semester === 2) return semester === term
  return readScoreTerms(scoreTerms).includes(term)
}

export function offeringTeacherIds(row: { teacher_id?: string | null; co_teacher_ids?: string[] | null }) {
  return [...new Set([row.teacher_id, ...(Array.isArray(row.co_teacher_ids) ? row.co_teacher_ids : [])].filter((id): id is string => !!id))]
}

export function teacherOwnsOffering(row: { teacher_id?: string | null; co_teacher_ids?: string[] | null }, userId: string) {
  return offeringTeacherIds(row).includes(userId)
}

export function assignScheduledUnits<T extends { class_subject_id: string | null; activity_id: string | null; day_of_week: number; period: number; note: string | null; content_unit?: number | null }>(slots: T[], lessons: Array<{ id: string; count: number }>) {
  const groups = new Map<string, Array<{ count: number } | undefined>>()
  for (const lesson of lessons) {
    const match = /^(.*)#([01])$/.exec(lesson.id)
    if (!match) continue
    const list = groups.get(match[1]) || []
    list[Number(match[2])] = { count: lesson.count }
    groups.set(match[1], list)
  }
  const pending = new Map<string, T[]>()
  const used = new Map<string, number[]>()
  for (const slot of slots) {
    if (!slot.class_subject_id || slot.activity_id || !groups.has(slot.class_subject_id)) continue
    const noted = contentUnitFromNote(slot.note)
    if (noted != null) {
      slot.content_unit = noted
      const counts = used.get(slot.class_subject_id) || []
      counts[noted] = (counts[noted] || 0) + 1
      used.set(slot.class_subject_id, counts)
      continue
    }
    pending.set(slot.class_subject_id, [...(pending.get(slot.class_subject_id) || []), slot])
  }
  for (const [subjectId, rows] of pending) {
    const pieces = groups.get(subjectId) || []
    const counts = used.get(subjectId) || []
    let index = 0
    for (const slot of [...rows].sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period)) {
      while (pieces[index] && (counts[index] || 0) >= (pieces[index]?.count || 0)) index += 1
      slot.content_unit = pieces[index] ? index : 0
      counts[slot.content_unit] = (counts[slot.content_unit] || 0) + 1
    }
  }
}

export function splitOfferingTeachers(ids: string[]) {
  const unique = [...new Set(ids.map(id => id.trim()).filter(Boolean))]
  if (unique.length > MAX_OFFERING_TEACHERS) throw Error(`เลือกครูผู้สอนได้ไม่เกิน ${MAX_OFFERING_TEACHERS} คน`)
  return { teacherId: unique[0] || null, coTeacherIds: unique.slice(1) }
}
