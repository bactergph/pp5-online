'use server'

import { loadSchedule, lessonKey, requireScheduleClass } from '@/lib/schedule-store'
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
import type { PeriodTimeRow } from '@/lib/schedule-helpers'

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
  const { data: years } = await db.from('academic_years')
    .select('id, year_be, is_active')
    .eq('school_id', session.schoolId)
    .order('year_be', { ascending: false })

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

  const { data: teachers } = await db.from('users')
    .select('id, prefix, full_name')
    .or('is_active.eq.true,email.like.pending-%')
    .eq('school_id', session.schoolId)
    .in('role', ['teacher', 'academic_head', 'deputy_principal', 'admin', 'principal'])
    .order('full_name')

  return {
    canEdit: canEditSchedule(session),
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

export async function fetchClassScheduleSubjects(classroomId: string, semester = 1) {
  const session = await requireScheduleSession()
  const { data: room, error } = await createServerClient().from('classrooms').select('academic_year_id').eq('id', classroomId).eq('school_id', session.schoolId || '').maybeSingle()
  if (error || !room) throw new Error('ไม่พบห้องเรียน')
  const data = await loadSchedule(session.schoolId, room.academic_year_id, semester)
  return data.lessons.filter(l => l.classroomId === classroomId && l.selectable !== false).map(l => ({ id:l.id,teacher_id:l.teacherId,subject_code:l.code,subject_name:l.name,teacher_name:l.teacherName,room_name:l.roomName || "",label:(l.code+' '+l.name).trim(),activity:l.activity }))
}

export async function fetchClassScheduleGrid(classroomId: string, yearId: string, semester = 1) {
  const session = await requireScheduleSession()
  const data = await loadSchedule(session.schoolId, yearId, semester)
  requireScheduleClass(data, classroomId)
  const cells: Record<string, { class_subject_id: string | null; note: string | null; locked: boolean }> = {}
  for (const day of SCHEDULE_DAYS) for (let period=1; period<=SCHEDULE_PERIOD_COUNT; period++) cells[day.value+'-'+period]={class_subject_id:null,note:null,locked:false}
  for (const row of data.slots.filter(s=>s.classroom_id===classroomId)) cells[row.day_of_week+'-'+row.period]={class_subject_id:lessonKey(row),note:row.note,locked:row.locked}
  return cells
}

export async function fetchClassScheduleBundle(classroomId: string, yearId: string, semester = 1) {
  const session = await requireScheduleSession()
  const data = await loadSchedule(session.schoolId, yearId, semester)
  requireScheduleClass(data, classroomId)
  const lessons = data.lessons.filter(l => l.classroomId === classroomId)
  const grid: Record<string, { class_subject_id: string | null; note: string | null; locked: boolean }> = {}
  for (const day of SCHEDULE_DAYS) for (let p = 1; p <= SCHEDULE_PERIOD_COUNT; p++) grid[`${day.value}-${p}`] = { class_subject_id: null, note: null, locked: false }
  const warnings: Record<string, string[]> = {}
  for (const s of data.slots.filter(s => s.classroom_id === classroomId)) {
    const key = `${s.day_of_week}-${s.period}`
    grid[key] = { class_subject_id: lessonKey(s), note: s.note, locked: s.locked }
    const lesson = lessons.find(l => l.id === lessonKey(s))
    if (!lesson?.teacherId) continue
    const busy = data.slots.filter(other => other.classroom_id !== classroomId && other.day_of_week === s.day_of_week && other.period === s.period && data.lessons.find(l => l.id === lessonKey(other))?.teacherId === lesson.teacherId)
    if (busy.length) warnings[key] = busy.map(s => { const c = data.classrooms.find(c => c.id === s.classroom_id)!; return `${c.level}/${c.room}` })
  }
  const items = lessons.filter(l => !l.activity).map(l => {
    const used = data.slots.filter(s => lessonKey(s) === l.id).length
    return { class_subject_id: l.id, code: l.code, name: l.name, target: l.count, used, remaining: l.count - used }
  })
  return { grid, warnings,
    subjects: lessons.filter(l => l.selectable !== false || data.slots.some(s => lessonKey(s) === l.id)).map(l => ({ id:l.id, teacher_id:l.teacherId, subject_code:l.code, subject_name:l.name, teacher_name:l.teacherName,room_name:l.roomName || "", label:`${l.code} ${l.name}`.trim() })),
    quotas: { items, filled: items.reduce((n,l) => n+l.used,0), totalTarget: items.reduce((n,l) => n+l.target,0) },
  }
}

export async function saveClassScheduleCell(classroomId: string, yearId: string, day: number, period: number, lesson: string | null, note: string | null = null, semester = 1) {
  return scheduleResult(() => scheduleOps.saveCell(classroomId, yearId, day, period, lesson, note, semester))
}

export async function fetchTeachingScheduleGrid(teacherId: string, yearId: string, semester = 1) {
  const session = await requireScheduleSession()
  if (session.role === 'teacher' && teacherId !== session.userId) throw new Error('ไม่มีสิทธิ์ดูตารางสอนของครูท่านอื่น')
  const data = await loadSchedule(session.schoolId, yearId, semester)
  const cells: Record<string,{label:string;subject_line:string;room_line:string}> = {}
  for (const d of SCHEDULE_DAYS) for(let p=1;p<=SCHEDULE_PERIOD_COUNT;p++) cells[d.value+'-'+p]={label:'',subject_line:'',room_line:''}
  for(const row of data.slots) {
    const lesson=data.lessons.find(l=>l.id===lessonKey(row))
    if(!lesson || lesson.teacherId!==teacherId) continue
    const room=data.classrooms.find(c=>c.id===row.classroom_id)!
    const roomLine=room.level+'/'+room.room
    const subjectLine=(lesson.code+' '+lesson.name).trim()
    const key=row.day_of_week+'-'+row.period
    cells[key]={label:[cells[key]?.label,roomLine+'\n'+subjectLine].filter(Boolean).join('\n'),subject_line:subjectLine,room_line:roomLine}
  }
  return cells
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
export async function clearScheduleScope(yearId:string,semester:number,scope:'room'|'level'|'school',classroomId:string) {
  return scheduleResult(()=>scheduleOps.clearScope(yearId,semester,scope,classroomId))
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

export async function runAutoScheduleSchool(yearId: string, clearFirst = true, semester = 1) { return scheduleResult(() => scheduleOps.autoSchedule(yearId, null, clearFirst, semester)) }
export async function fetchScheduleActivities(yearId: string, classroomId: string, semester = 1) { return scheduleOps.activityOptions(yearId, classroomId, semester) }
export async function saveScheduleActivity(yearId: string, classroomId: string, settingId: string, teacherId: string, count: number, semester = 1) { return scheduleOps.saveActivity(yearId, classroomId, settingId, teacherId, count, semester) }

export async function saveSubstituteDay(dayId: string, expected: import('./extended-actions').SubstituteChange[], rows: import('./extended-actions').SubstituteChange[]) {
  const mod = await import('./extended-actions')
  return scheduleResult(() => mod.saveSubstituteDay(dayId, expected, rows))
}
export async function fetchSubstitutePdfContext() {
  const mod = await import('./extended-actions')
  return mod.fetchSubstitutePdfContext()
}
