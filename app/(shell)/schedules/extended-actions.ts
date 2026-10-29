import * as substituteDocuments from '@/lib/substitute-documents'
import 'server-only'
import { loadSchedule, loadScheduleConstraints, lessonKey, requireScheduleClass } from '@/lib/schedule-store'
import * as scheduleOps from '@/lib/schedule-operations'
import { summarizeScheduleWorkload } from '@/lib/schedule-workload'
import { substituteTimetableForDay, substituteWeekday } from '@/lib/schedule-substitute'
import {type SubstituteRosterEntry} from '@/lib/substitute-roster'
import type {SubstituteHistoryPage} from '@/lib/substitute-history'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity } from '@/lib/audit'
import {
  DEFAULT_PERIOD_TIMES,
  normalizePeriodTimes,
  type PeriodTimeRow,
  validatePeriodTimes,
} from '@/lib/schedule-helpers'
import {
  SCHEDULE_DAYS,
  SCHEDULE_EDIT_ROLES,
  SCHEDULE_VIEW_ROLES,
} from '@/lib/schedules'

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

function canEdit(session: ScheduleSession) {
  return SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])
}

async function loadAllSlotsForYear(schoolId:string,yearId:string, semester = 1) {
 const data=await loadSchedule(schoolId,yearId, semester)
 return data.slots.map(row=>{const l=data.lessons.find(l=>l.id===lessonKey(row));const room=data.classrooms.find(c=>c.id===row.classroom_id)!;return {...row,class_subject_id:lessonKey(row),classrooms:room,class_subjects:l?{id:l.id,teacher_id:l.teacherId,subject_id:l.subjectId,subjects:{code:l.code,name:l.name,short_name:l.name,hours_per_year:l.count*40}}:null}})
}

export async function fetchPeriodTimes() {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')
  const db = createServerClient()
  const { data, error } = await db.from('school_period_times')
    .select('period, label, start_time, end_time, is_break, sort_order')
    .eq('school_id', session.schoolId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  if (!data?.length) return { times: DEFAULT_PERIOD_TIMES, isDefault: true }
  const teachingCount = (data as PeriodTimeRow[]).filter(t => !t.is_break).length
  if (teachingCount < 1 || teachingCount > 8) {
    return { times: DEFAULT_PERIOD_TIMES, isDefault: true }
  }
  return { times: normalizePeriodTimes(data as PeriodTimeRow[]), isDefault: false }
}

export async function savePeriodTimes(times: PeriodTimeRow[]) {
  const session = await requireScheduleSession()
  if (!canEdit(session) || !session.schoolId) throw new Error('ไม่มีสิทธิ์')
  const invalid = validatePeriodTimes(times)
  if (invalid) throw new Error(invalid)
  const db = createServerClient()
  const { error } = await db.rpc('save_school_period_times', { p_school_id: session.schoolId, p_rows: times })
  if (error) throw new Error(error.message)
  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'update',
    module: 'schedules',
    targetType: 'period_times',
    description: 'บันทึกเวลาคาบเรียน',
  })
  return { ok: true }
}

export async function fetchScheduleQuotas(classroomId:string,yearId:string, semester = 1) {
  const session=await requireScheduleSession()
  const data=await loadSchedule(session.schoolId,yearId, semester)
  requireScheduleClass(data,classroomId)
  const slots=data.slots.filter(s=>s.classroom_id===classroomId)
  const items=data.lessons.filter(l=>l.classroomId===classroomId && !l.activity).map(l=>{ const used=slots.filter(s=>lessonKey(s)===l.id).length; return {class_subject_id:l.id,code:l.code,name:l.name,target:l.count,used,remaining:l.count-used} })
  return {items,filled:slots.filter(s=>lessonKey(s)).length,totalTarget:items.reduce((n,i)=>n+i.target,0)}
}

export async function fetchScheduleConflicts(yearId: string, semester = 1) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const slots = await loadAllSlotsForYear(session.schoolId, yearId, semester)
  const teacherMap: Record<string, Record<string, Record<number, { room: string; subject: string }[]>>> = {}

  for (const row of slots) {
    const cs = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects
    if (!cs?.teacher_id || !row.class_subject_id) continue
    const classroom = Array.isArray(row.classrooms) ? row.classrooms[0] : row.classrooms
    const subject = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects
    const room = classroom ? `${classroom.level}/${classroom.room}` : '?'
    const subj = subject?.short_name || subject?.name || ''
    const tid = cs.teacher_id
    const day = String(row.day_of_week)
    const period = row.period
    if (!teacherMap[tid]) teacherMap[tid] = {}
    if (!teacherMap[tid][day]) teacherMap[tid][day] = {}
    if (!teacherMap[tid][day][period]) teacherMap[tid][day][period] = []
    teacherMap[tid][day][period].push({ room, subject: subj })
  }

  const db = createServerClient()
  const teacherIds = Object.keys(teacherMap)
  const { data: teachers } = teacherIds.length
    ? await db.from('users').select('id, prefix, full_name').in('id', teacherIds)
    : { data: [] }
  const nameMap = Object.fromEntries(
    (teachers || []).map(t => [t.id, `${t.prefix} ${t.full_name}`.trim()]),
  )

  const conflicts: {
    teacher_id: string
    teacher_name: string
    day: number
    period: number
    day_label: string
    rooms: { room: string; subject: string }[]
  }[] = []

  for (const tid of teacherIds) {
    for (const day of Object.keys(teacherMap[tid])) {
      for (const period of Object.keys(teacherMap[tid][day])) {
        const rooms = teacherMap[tid][day][Number(period)]
        if (rooms.length >= 2) {
          conflicts.push({
            teacher_id: tid,
            teacher_name: nameMap[tid] || tid,
            day: Number(day),
            period: Number(period),
            day_label: SCHEDULE_DAYS.find(d => d.value === Number(day))?.label || day,
            rooms,
          })
        }
      }
    }
  }

  return { conflicts, count: conflicts.length }
}

export async function fetchScheduleWorkload(yearId: string, semester = 1) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const data = await loadSchedule(session.schoolId, yearId, semester)
  const db = createServerClient()
  const { data: teachers, error } = await db.from('users')
    .select('id, prefix, full_name, position')
    .eq('school_id', session.schoolId)
    .in('role', ['teacher', 'academic_head', 'deputy_principal', 'admin', 'principal'])
    .order('full_name')

  if (error) throw new Error('โหลดรายชื่อครูสำหรับสรุปภาระสอนไม่สำเร็จ กรุณาลองใหม่')
  return summarizeScheduleWorkload(data, teachers || [])
}

export async function fetchScheduleCurriculumCheck(classroomId: string, yearId: string, semester = 1) {
  const quotas = await fetchScheduleQuotas(classroomId, yearId, semester)
  return quotas.items.map(item => ({
    ...item,
    label: item.code ? `${item.code} ${item.name}`.trim() : item.name,
    ok: item.remaining === 0,
    over: item.remaining < 0,
    under: item.remaining > 0,
  }))
}

export async function toggleScheduleCellLock(classroomId:string,yearId:string,day:number,period:number, semester = 1) { return scheduleOps.toggleLock(classroomId,yearId,day,period, semester) }

export async function copyClassSchedule(from:string,to:string,yearId:string, semester = 1) { return scheduleOps.copyRoom(from,to,yearId, semester) }

export async function clearClassSchedule(classroomId:string,yearId:string, semester = 1) { return scheduleOps.clearRoom(classroomId,yearId, semester) }

export async function runAutoScheduleClass(classroomId:string,yearId:string,mode:'spread'|'random'='spread',clearFirst=false, semester = 1) { if (!['spread','random'].includes(mode)) throw new Error('รูปแบบไม่ถูกต้อง'); const p=await import('@/lib/schedule-preparation'); return p.generate(yearId,semester,[classroomId],clearFirst) }

export async function fetchScheduleExportContext() {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')
  const db = createServerClient()
  const { data: school, error: schoolError } = await db.from('schools')
    .select('name, logo_url, director_name, academic_head_name, acting_director, acting_director_position')
    .eq('id', session.schoolId)
    .maybeSingle()
  if (schoolError) throw new Error('โหลดข้อมูลโรงเรียนไม่สำเร็จ')
  const periodTimes = await fetchPeriodTimes()
  return { school: school ? { ...school, director_position: 'ผู้อำนวยการสถานศึกษา' } : null, periodTimes: periodTimes.times }
}

export async function fetchSubstituteHistory(yearId:string,semester=1,before?:string):Promise<SubstituteHistoryPage>{return substituteDocuments.documentHistory(yearId,semester,before)}

export async function fetchSubstituteDay(date:string,yearId:string,semester=1){return substituteDocuments.documentDay(date,yearId,semester)}

export async function loadSubstituteSlotsForTeacher(
  date: string,
  yearId: string,
  absentTeacherId: string, semester = 1
) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const schedule = await loadSchedule(session.schoolId, yearId, semester)
  return substituteTimetableForDay(schedule, substituteWeekday(date))
    .filter(slot => slot.teacherIds.includes(absentTeacherId))
    .map(slot => ({period:slot.period, class_subject_id:slot.class_subject_id, classroom_id:slot.classroom_id, room_label:slot.room_label, subject_label:slot.subject_label}))
}

export async function loadSubstituteRosterSlots(date:string,yearId:string,teacherIds:string[],semester=1) {
  const session=await requireScheduleSession()
  if(!session.schoolId||!canEdit(session))throw Error('ไม่มีสิทธิ์')
  if(!Array.isArray(teacherIds)||!teacherIds.length||teacherIds.length>200||new Set(teacherIds).size!==teacherIds.length)throw Error('กรุณาเลือกครูที่ลา 1–200 คน')
  const schedule=await loadSchedule(session.schoolId,yearId,semester)
  if(teacherIds.some(id=>!schedule.teacherNames[id]))throw Error('ไม่พบครูในโรงเรียนนี้')
  const timetable=substituteTimetableForDay(schedule,substituteWeekday(date))
  const slots=teacherIds.flatMap(absent_teacher_id=>timetable.filter(slot=>slot.teacherIds.includes(absent_teacher_id)).map(slot=>({absent_teacher_id,period:slot.period,class_subject_id:slot.class_subject_id,classroom_id:slot.classroom_id,room_label:slot.room_label,subject_label:slot.subject_label})))
  return {slots,missing:teacherIds.filter(id=>!slots.some(slot=>slot.absent_teacher_id===id))}
}

/** All adds/edits/deletions commit together. The timetable is never rewritten. */
export async function saveSubstituteRoster(dayId:string,expected:SubstituteRosterEntry[],rows:SubstituteRosterEntry[]){return substituteDocuments.saveDocument(dayId,expected,rows)}

export async function saveSubstituteTeacher(substituteDayId:string,entryId:string|null,payload:{absent_teacher_id:string;period:number;class_subject_id:string|null;classroom_id:string|null;subject_label:string;room_label:string;substitute_teacher_id:string|null;leave_type:string;note:string|null}){return substituteDocuments.changeDocumentTeacher(substituteDayId,entryId,payload)}

export async function importSubstituteFromSchedule(substituteDayId:string,date:string,yearId:string,absentTeacherId:string,leaveType:string,semester=1){return substituteDocuments.importDocumentSlots(substituteDayId,date,yearId,absentTeacherId,leaveType,semester)}

export async function getTeacherConflictAt(
  yearId: string,
  teacherId: string,
  day: number,
  period: number,
  ignoreClassroomId?: string, semester = 1
) {
  const session = await requireScheduleSession()
  if (!session.schoolId) return { busy: false, rooms: [] as string[] }

  const slots = await loadAllSlotsForYear(session.schoolId, yearId, semester)
  const rooms: string[] = []
  const constraints = await loadScheduleConstraints(session.schoolId,yearId,semester)
  if (constraints.blocks.some(b=>b.teacherId===teacherId && b.day===day && b.period===period)) rooms.push('คาบว่างที่ครูล็อกไว้')
  for (const row of slots) {
    if (row.day_of_week !== day || row.period !== period) continue
    if (ignoreClassroomId && row.classroom_id === ignoreClassroomId) continue
    const cs = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects
    if (cs?.teacher_id !== teacherId || !row.class_subject_id) continue
    const classroom = Array.isArray(row.classrooms) ? row.classrooms[0] : row.classrooms
    if (classroom) rooms.push(`${classroom.level}/${classroom.room}`)
  }
  return { busy: rooms.length > 0, rooms }
}

export type SubstituteChange = { id: string; substitute_teacher_id: string | null; leave_type: string; note: string | null }
export async function saveSubstituteDay(substituteDayId:string,expected:SubstituteChange[],rows:SubstituteChange[]){return substituteDocuments.changeDocumentEntries(substituteDayId,expected,rows)}

export async function fetchSubstitutePdfContext() {
  const session = await requireScheduleSession()
  if (!session.schoolId || !canEdit(session)) throw new Error('ไม่มีสิทธิ์')
  const context = await fetchScheduleExportContext()
  return { ...context, academicHead: context.school?.academic_head_name || '' }
}

export async function deleteSubstituteEntries(dayId:string,expected:SubstituteChange[],ids:string[]){return substituteDocuments.changeDocumentEntries(dayId,expected,expected,ids)}

export async function deleteSubstituteRosterEntries(dayId:string,expected:SubstituteRosterEntry[],ids:string[]){return substituteDocuments.deleteDocumentEntries(dayId,expected,ids)}
