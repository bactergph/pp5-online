'use server'
import {teachingEventAt} from '@/lib/schedule-joint-teaching'

import { activityTeachers, applyActivityDisplay, lessonTeachers, roomActivityDisplay } from '@/lib/schedule-activity-teams'
import { loadSchedule, lessonKey, requireScheduleClass } from '@/lib/schedule-store'
import {scheduleTeachingView} from '@/lib/schedule-teaching-view'
import { scheduleResult } from '@/lib/schedule-action-result'
import * as scheduleOps from '@/lib/schedule-operations'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import {
  SCHEDULE_DAYS,
  SCHEDULE_EDIT_ROLES,
  SCHEDULE_PERIOD_COUNT,
  SCHEDULE_VIEW_ROLES,
} from '@/lib/schedules'
import { activityTimetableTeacherLabel, isActivityLessonId, scheduleSemesterForYear, teacherTimetableName, type PeriodTimeRow } from '@/lib/schedule-helpers'

type ScheduleSession = {
  userId: string
  role: string
  schoolId: string | null
  fullName: string
  isHomeroom: boolean
}

async function requireScheduleSession() {
  const session = await getSession()
  if (!session || !SCHEDULE_VIEW_ROLES.includes(session.role as typeof SCHEDULE_VIEW_ROLES[number])) {
    throw new Error('ไม่มีสิทธิ์')
  }
  return session as ScheduleSession
}

function canEditSchedule(session: ScheduleSession) {
  return SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])
}

export async function fetchScheduleInit() {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const db = createServerClient()
  const { data: years, error: yearsError } = await db.from('academic_years')
    .select('id, year_be, is_active, term1_start_date, term1_end_date, term2_start_date, term2_end_date')
    .eq('school_id', session.schoolId)
    .order('year_be', { ascending: false })

  if (yearsError) throw new Error('โหลดปีการศึกษาไม่สำเร็จ: ' + yearsError.message)
  const activeYearId = (years || []).find(y => y.is_active)?.id || years?.[0]?.id || null

  let homeroomClassroomIds: string[] = []
  if (session.role === 'teacher' && activeYearId) {
    const { data: homeroomRooms } = await db.from('classrooms')
      .select('id')
      .eq('school_id', session.schoolId)
      .eq('academic_year_id', activeYearId)
      .or(`homeroom_teacher_id.eq.${session.userId},homeroom_teacher2_id.eq.${session.userId}`)
    homeroomClassroomIds = (homeroomRooms || []).map(r => r.id)
  }

  const { data: teachers, error: teachersError } = await db.from('users')
    .select('id, prefix, full_name')
    .or('is_active.eq.true,email.like.pending-%')
    .eq('school_id', session.schoolId)
    .in('role', ['teacher', 'academic_head', 'deputy_principal', 'admin', 'principal'])
    .order('full_name')

  if (teachersError) throw new Error('โหลดรายชื่อครูไม่สำเร็จ: ' + teachersError.message)
  return {
    canEdit: canEditSchedule(session),
    defaultSemester: scheduleSemesterForYear(years?.find(y => y.id === activeYearId)),
    years: years || [],
    teachers: teachers || [],
    homeroomClassroomIds,
    defaultTeacherId: session.role === 'teacher' ? session.userId : teachers?.[0]?.id ?? null,
    role: session.role,
  }
}

export async function fetchScheduleClassrooms(yearId: string) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const db = createServerClient()
  const { data } = await db.from('classrooms')
    .select('id, level, room, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('school_id', session.schoolId)
    .eq('academic_year_id', yearId)
    .order('level')
    .order('room')

  const classrooms = data || []

  return classrooms.map(c => ({
    id: c.id,
    level: c.level,
    room: c.room,
    label: `${c.level}/${c.room}`,
  }))
}

type ScheduleData = Awaited<ReturnType<typeof loadSchedule>>
type GridCell = { class_subject_id: string | null; note: string | null; locked: boolean; expected_lesson_id: string | null }

function subjectRow(lesson: { id: string; teacherId: string | null; code?: string; name: string; teacherName: string; roomName?: string; activity?: boolean }) {
  return { id: lesson.id, teacher_id: lesson.teacherId, subject_code: lesson.code || '', subject_name: lesson.name, teacher_name: lesson.teacherName, room_name: lesson.roomName || '', label: `${lesson.code || ''} ${lesson.name}`.trim(), activity: !!lesson.activity }
}

function classRoomView(data: ScheduleData, classroomId: string) {
  const grid: Record<string, GridCell> = {}
  for (const day of SCHEDULE_DAYS) for (let period = 1; period <= SCHEDULE_PERIOD_COUNT; period++) grid[`${day.value}-${period}`] = { class_subject_id: null, note: null, locked: false, expected_lesson_id: null }
  for (const row of data.slots.filter(slot => slot.classroom_id === classroomId)) {
    const id = lessonKey(row)
    grid[`${row.day_of_week}-${row.period}`] = { class_subject_id: id, note: row.note, locked: row.locked, expected_lesson_id: id }
  }
  const display = roomActivityDisplay(data.activityGroups || [], classroomId, data.lessons, data.teacherNames || {})
  return { grid: applyActivityDisplay(grid, display.cells, { class_subject_id: null, note: null, locked: false, expected_lesson_id: null }), lessons: [...data.lessons.filter(lesson => lesson.classroomId === classroomId), ...display.lessons] }
}

function lessonAt(data: ScheduleData, roomId: string, day: number, period: number) {
  const group = (data.activityGroups || []).find(item => item.roomIds?.includes(roomId) && item.cells?.some(cell => Number(cell.day) === day && Number(cell.period) === period))
  if (group) {
    const lesson = data.lessons.find(item => item.activity && item.classroomId === roomId && item.subjectId === group.settingId)
    if (lesson) return lesson
    return { teacherId: null, teacherIds: activityTeachers(group, roomId), activityGroupId: group.mode === 'joint' ? group.id : undefined }
  }
  const slot = data.slots.find(item => item.classroom_id === roomId && item.day_of_week === day && item.period === period)
  return slot ? data.lessons.find(item => item.id === lessonKey(slot)) : undefined
}

export async function fetchClassScheduleSubjects(classroomId: string, semester = 1) {
  const session = await requireScheduleSession()
  const { data: room, error } = await createServerClient().from('classrooms').select('academic_year_id').eq('id', classroomId).eq('school_id', session.schoolId || '').maybeSingle()
  if (error || !room) throw new Error('ไม่พบห้องเรียน')
  const data = await loadSchedule(session.schoolId, room.academic_year_id, semester)
  const view = classRoomView(data, classroomId)
  const used = new Set(Object.values(view.grid).map(cell => cell.class_subject_id).filter(Boolean))
  return view.lessons.filter(lesson => lesson.selectable !== false || used.has(lesson.id)).map(subjectRow)
}

export async function fetchClassScheduleGrid(classroomId: string, yearId: string, semester = 1) {
  const session = await requireScheduleSession()
  const data = await loadSchedule(session.schoolId, yearId, semester)
  requireScheduleClass(data, classroomId)
  return classRoomView(data, classroomId).grid
}

export async function fetchClassScheduleBundle(classroomId: string, yearId: string, semester = 1) {
  const session = await requireScheduleSession()
  const data = await loadSchedule(session.schoolId, yearId, semester)
  requireScheduleClass(data, classroomId)
  const view = classRoomView(data, classroomId)
  const warnings: Record<string, string[]> = {}
  for (const [key, cell] of Object.entries(view.grid)) {
    if (!cell.class_subject_id) continue
    const [day, period] = key.split('-').map(Number)
    const lesson = view.lessons.find(item => item.id === cell.class_subject_id)
    const teachers = lesson ? lessonTeachers(lesson) : []
    if (!teachers.length) continue
    const busy = data.classrooms.filter(room => {
      if (room.id === classroomId) return false
      const other = lessonAt(data, room.id, day, period)
      if (!other || lesson?.activityGroupId && lesson.activityGroupId === other.activityGroupId || lesson&&'id' in other&&teachingEventAt(lesson,day,period)===teachingEventAt(other,day,period)) return false
      return lessonTeachers(other).some(id => teachers.includes(id))
    })
    if (busy.length) warnings[key] = busy.map(room => `${room.level}/${room.room}`)
  }
  const items = view.lessons.filter(lesson => !lesson.activity).map(lesson => {
    const used = data.slots.filter(slot => lessonKey(slot) === lesson.id).length
    return { class_subject_id: lesson.id, code: lesson.code || '', name: lesson.name, target: lesson.count || 0, used, remaining: (lesson.count || 0) - used }
  })
  const used = new Set(Object.values(view.grid).map(cell => cell.class_subject_id).filter(Boolean))
  return { grid: view.grid, warnings,
    subjects: view.lessons.filter(lesson => lesson.selectable !== false || used.has(lesson.id)).map(subjectRow),
    quotas: { items, filled: items.reduce((sum, lesson) => sum + lesson.used, 0), totalTarget: items.reduce((sum, lesson) => sum + lesson.target, 0) },
  }
}

export async function saveClassScheduleCell(classroomId: string, yearId: string, day: number, period: number, lesson: string | null, note: string | null = null, semester = 1, expectedLesson?:string|null) {
  return scheduleResult(() => scheduleOps.saveCell(classroomId, yearId, day, period, lesson, note, semester, expectedLesson))
}

export async function moveClassScheduleCell(roomId:string,yearId:string,fromDay:number,fromPeriod:number,toDay:number,toPeriod:number,expectedLesson:string,semester=1) {
  return scheduleResult(()=>scheduleOps.moveCell(roomId,yearId,fromDay,fromPeriod,toDay,toPeriod,expectedLesson,semester))
}
function teachingCells(data: ScheduleData, teacherId: string) {return scheduleTeachingView(data,teacherId)}

function classPdfGrid(data: ScheduleData, classroomId: string) {
  const view = classRoomView(data, classroomId)
  const lessons = new Map(view.lessons.map(lesson => [lesson.id, lesson]))
  const grid: Record<string, { line1: string; line2: string; line3?: string; line4?: string }> = {}
  for (const [key, cell] of Object.entries(view.grid)) {
    const lesson = cell.class_subject_id ? lessons.get(cell.class_subject_id) : undefined
    const activity = isActivityLessonId(cell.class_subject_id) || !!lesson?.activity
    grid[key] = lesson
      ? {
        line1: lesson.name || (activity ? 'กิจกรรม' : '—'),
        line2: lesson.code ? `(${lesson.code})` : activity ? '(กิจกรรม)' : '',
        line3: activity ? activityTimetableTeacherLabel(lesson.teacherName) : teacherTimetableName(lesson.teacherName),
        line4: lesson.roomName || '',
      }
      : { line1: cell.note || '—', line2: '' }
  }
  return grid
}

function teachingPdfGrid(cells: Record<string, { subject_line: string; room_line: string; pdf?:import('@/lib/jspdf-schedules').SchedulePdfCell }>) {
  const grid: Record<string, { line1: string; line2: string; line3?: string; line4?: string }> = {}
  for (const [key, cell] of Object.entries(cells)) {
    if(cell.pdf){grid[key]=cell.pdf;continue}
    const [subjectPart, place = ''] = (cell.subject_line || '').split(/\s*·\s*/)
    const match = subjectPart.trim().match(/^(\S+)\s+(.+)$/)
    grid[key] = {
      line1: cell.room_line || '—',
      line2: match?.[2] || subjectPart,
      line3: match ? `(${match[1]})` : '',
      line4: place,
    }
  }
  return grid
}

export async function fetchTeachingScheduleGrid(teacherId: string, yearId: string, semester = 1) {
  const session = await requireScheduleSession()
  if (session.role === 'teacher' && teacherId !== session.userId) throw new Error('ไม่มีสิทธิ์ดูตารางสอนของครูท่านอื่น')
  const data = await loadSchedule(session.schoolId, yearId, semester)
  return teachingCells(data, teacherId)
}

/** โหลดตารางทั้งภาคครั้งเดียว แล้วตัดเป็นหน้า PDF ตามห้องหรือครูที่เลือก */
export async function fetchSchedulePdfGrids(yearId: string, semester: number, kind: 'class' | 'teaching', ids: string[]) {
  const session = await requireScheduleSession()
  if (!ids.length || ids.length > 200) throw new Error('เลือกห้องหรือครูได้ครั้งละ 1–200 รายการ')
  if (kind === 'teaching' && session.role === 'teacher' && ids.some(id => id !== session.userId)) throw new Error('ไม่มีสิทธิ์ดูตารางสอนของครูท่านอื่น')
  const data = await loadSchedule(session.schoolId, yearId, semester)
  const result: Record<string, Record<string, { line1: string; line2: string; line3?: string; line4?: string }>> = {}
  for (const id of ids) {
    if (kind === 'class') {
      requireScheduleClass(data, id)
      result[id] = classPdfGrid(data, id)
    } else result[id] = teachingPdfGrid(teachingCells(data, id))
  }
  return result
}

export async function fetchPeriodTimes() {
  const mod = await import('./extended-actions')
  return mod.fetchPeriodTimes()
}

export async function savePeriodTimes(times: PeriodTimeRow[]) {
  const mod = await import('./extended-actions')
  return mod.savePeriodTimes(times)
}

export async function fetchTeacherAvailability(yearId: string, semester = 1) {
  return scheduleOps.teacherAvailability(yearId,semester)
}
export async function editTeacherScheduleCell(yearId:string,semester:number,teacherId:string,classroomId:string,day:number,period:number,expectedLesson:string|null,lessonId:string|null) {
  return scheduleResult(()=>scheduleOps.editTeacherCell(yearId,semester,teacherId,classroomId,day,period,expectedLesson,lessonId))
}
export async function removeScheduleSubjectCell(classroomId:string,yearId:string,day:number,period:number,expectedLesson:string,semester=1) {
  return scheduleResult(()=>scheduleOps.removeSubjectCell(classroomId,yearId,day,period,expectedLesson,semester))
}
export async function setTeacherAvailabilityBlock(yearId: string, semester: number, teacherId: string, day: number, period: number, blocked: boolean) {
  return scheduleResult(()=>scheduleOps.setTeacherBlock(yearId,semester,teacherId,day,period,blocked))
}

export async function fetchScheduleQuotas(classroomId: string, yearId: string, semester = 1) {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleQuotas(classroomId, yearId, semester)
}

export async function fetchScheduleConflicts(yearId: string, semester = 1) {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleConflicts(yearId, semester)
}

export async function fetchScheduleWorkload(yearId: string, semester = 1) {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleWorkload(yearId, semester)
}

export async function fetchScheduleCurriculumCheck(classroomId: string, yearId: string, semester = 1) {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleCurriculumCheck(classroomId, yearId, semester)
}

export async function toggleScheduleCellLock(
  classroomId: string,
  yearId: string,
  dayOfWeek: number,
  period: number, semester = 1
) {
  const mod = await import('./extended-actions')
  return scheduleResult(() => mod.toggleScheduleCellLock(classroomId, yearId, dayOfWeek, period, semester))
}

export async function copyClassSchedule(fromClassroomId: string, toClassroomId: string, yearId: string, semester = 1) {
  const mod = await import('./extended-actions')
  return scheduleResult(() => mod.copyClassSchedule(fromClassroomId, toClassroomId, yearId, semester))
}

export async function clearClassSchedule(classroomId: string, yearId: string, semester = 1) {
  const mod = await import('./extended-actions')
  return scheduleResult(() => mod.clearClassSchedule(classroomId, yearId, semester))
}
export async function clearScheduleScope(yearId:string,semester:number,scope:'room'|'level'|'school'|'selected',classroomId:string,selectedRooms?:string[]) {
  return scheduleResult(()=>scheduleOps.clearScope(yearId,semester,scope,classroomId,selectedRooms))
}
export async function clearTeacherSchedule(yearId:string,semester:number,teacherId:string) {
  return scheduleResult(()=>scheduleOps.clearTeacher(yearId,semester,teacherId))
}
export async function fetchActivityLevelOptions(yearId:string,semester:number) {return scheduleOps.activityLevelOptions(yearId,semester)}
export async function saveActivityLevelSchedule(yearId:string,semester:number,settingId:string,levels:string[],day:number,period:number) {return scheduleResult(()=>scheduleOps.scheduleActivityLevel(yearId,semester,settingId,levels,day,period))}

export async function runAutoScheduleClass(
  classroomId: string,
  yearId: string,
  mode: 'spread' | 'random' = 'spread',
  clearFirst = false, semester = 1
) {
  const mod = await import('./extended-actions')
  return scheduleResult(() => mod.runAutoScheduleClass(classroomId, yearId, mode, clearFirst, semester))
}

export async function fetchScheduleExportContext() {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleExportContext()
}

export async function fetchSubstituteDay(date: string, yearId: string, semester = 1) {
  const mod = await import('./extended-actions')
  return mod.fetchSubstituteDay(date, yearId, semester)
}

export async function loadSubstituteSlotsForTeacher(
  date: string,
  yearId: string,
  absentTeacherId: string, semester = 1
) {
  const mod = await import('./extended-actions')
  return mod.loadSubstituteSlotsForTeacher(date, yearId, absentTeacherId, semester)
}

export async function saveSubstituteTeacher(
  substituteDayId: string,
  entryId: string | null,
  payload: {
    absent_teacher_id: string
    period: number
    class_subject_id: string | null
    classroom_id: string | null
    subject_label: string
    room_label: string
    substitute_teacher_id: string | null
    leave_type: string
    note: string | null
  },
) {
  const mod = await import('./extended-actions')
  return mod.saveSubstituteTeacher(substituteDayId, entryId, payload)
}

export async function importSubstituteFromSchedule(
  substituteDayId: string,
  date: string,
  yearId: string,
  absentTeacherId: string,
  leaveType: string, semester = 1
) {
  const mod = await import('./extended-actions')
  return scheduleResult(() => mod.importSubstituteFromSchedule(substituteDayId, date, yearId, absentTeacherId, leaveType, semester))
}

export async function getTeacherConflictAt(
  yearId: string,
  teacherId: string,
  day: number,
  period: number,
  ignoreClassroomId?: string, semester = 1
) {
  const mod = await import('./extended-actions')
  return mod.getTeacherConflictAt(yearId, teacherId, day, period, ignoreClassroomId, semester)
}

export async function runAutoScheduleSchool(yearId: string, clearFirst = true, semester = 1) { return scheduleResult(async () => { const p=await import('@/lib/schedule-preparation');const data=await p.preparation(yearId,semester);return p.generate(yearId,semester,data.classrooms.map(c=>c.id),clearFirst) }) }
export async function fetchScheduleActivities(yearId: string, classroomId: string, semester = 1) { return scheduleOps.activityOptions(yearId, classroomId, semester) }
export async function saveScheduleActivity(yearId: string, classroomId: string, settingId: string, teacherId: string, count: number, semester = 1) { return scheduleOps.saveActivity(yearId, classroomId, settingId, teacherId, count, semester) }

export async function saveSubstituteDay(dayId: string, expected: import('./extended-actions').SubstituteChange[], rows: import('./extended-actions').SubstituteChange[]) {
  const mod = await import('./extended-actions')
  return scheduleResult(() => mod.saveSubstituteDay(dayId, expected, rows))
}
export async function loadSubstituteRosterSlots(date:string,year:string,teachers:string[],term=1) {
  const mod=await import('./extended-actions')
  return mod.loadSubstituteRosterSlots(date,year,teachers,term)
}
export async function saveSubstituteRoster(dayId:string,expected:import('@/lib/substitute-roster').SubstituteRosterEntry[],rows:import('@/lib/substitute-roster').SubstituteRosterEntry[]) {
  const mod=await import('./extended-actions')
  return scheduleResult(()=>mod.saveSubstituteRoster(dayId,expected,rows))
}
export async function fetchSubstitutePdfContext() {
  const mod = await import('./extended-actions')
  return mod.fetchSubstitutePdfContext()
}

export async function fetchSubstituteHistory(year:string,term=1,before?:string) {
  const mod=await import('./extended-actions')
  return mod.fetchSubstituteHistory(year,term,before)
}

export async function deleteSubstituteRosterEntries(dayId:string,expected:import('@/lib/substitute-roster').SubstituteRosterEntry[],ids:string[]) {
  const mod=await import('./extended-actions')
  return scheduleResult(()=>mod.deleteSubstituteRosterEntries(dayId,expected,ids))
}

export async function deleteSubstituteEntries(dayId: string, expected: import('./extended-actions').SubstituteChange[], ids: string[]) {
  const mod = await import('./extended-actions')
  return scheduleResult(() => mod.deleteSubstituteEntries(dayId, expected, ids))
}

export async function fetchScheduleDays(yearId:string,semester=1) {
 const session=await requireScheduleSession()
 if(!session.schoolId)throw new Error('ไม่พบโรงเรียน')
 const db=createServerClient()
 const y=await db.from('academic_years').select('id').eq('id',yearId).eq('school_id',session.schoolId).maybeSingle()
 if(y.error||!y.data)throw new Error('ไม่พบปีการศึกษา')
 const r=await db.from('schedule_plans').select('config').eq('school_id',session.schoolId).eq('academic_year_id',yearId).eq('semester',semester).maybeSingle()
 if(r.error&&!['42P01','PGRST205'].includes(r.error.code))throw new Error('โหลดวันเรียนไม่สำเร็จ')
 return (r.data?.config?.days||[1,2,3,4,5]) as number[]
}
