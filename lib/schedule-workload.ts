import { activityTeachers, lessonTeachers, type ActivityTeam } from './schedule-activity-teams'
import type { ScheduleLesson, ScheduleSlot } from './schedule-store'
import { workloadStatus, workloadLabel } from './schedule-helpers'

export type ScheduleWorkloadRow = {
  id: string; name: string; position: string | null; note?: string
  hours: number; subject_hours: number; activity_hours: number
  scheduled_hours: number; remaining: number
  status: 'ok' | 'warn' | 'over'; status_label: string
}

/** Assigned quotas are available before generation. Placed periods use the
 * same activity overlay as the timetable; joint teams count once per teacher. */
export function summarizeScheduleWorkload(
  data: { lessons: ScheduleLesson[]; slots: ScheduleSlot[]; activityGroups?: ActivityTeam[] },
  teachers: { id: string; prefix: string | null; full_name: string; position: string | null }[],
): ScheduleWorkloadRow[] {
  const lessons = new Map(data.lessons.map(lesson => [lesson.id, lesson]))
  const totals = new Map<string, { subjects: number; activities: number; cells: Set<string> }>()
  const get = (id: string) => {
    let row = totals.get(id)
    if (!row) { row = { subjects: 0, activities: 0, cells: new Set() }; totals.set(id, row) }
    return row
  }
  const quota = (value: number) => Number.isFinite(value) && value > 0 ? value : 0
  const counted=new Set<string>()
  for (const lesson of data.lessons.filter(lesson => !lesson.activity))
    for (const id of lessonTeachers(lesson)) {const key=id+':'+(lesson.activityGroupId||lesson.id);if(!counted.has(key)){counted.add(key);get(id).subjects += quota(lesson.count)}}

  const cellKey = (room: string, day: number, period: number) => `${room}:${day}:${period}`
  const cells = new Map<string, { day: number; period: number; teachers: string[] }>()
  const legacyActivityCells = new Map<string, Set<string>>()
  for (const slot of data.slots) {
    const id = slot.activity_id ? `activity:${slot.activity_id}` : slot.class_subject_id
    const lesson = id ? lessons.get(id) : undefined
    if (lesson) cells.set(cellKey(slot.classroom_id, slot.day_of_week, slot.period), { day: slot.day_of_week, period: slot.period, teachers: lessonTeachers(lesson) })
    if (lesson?.activity) {
      const used = legacyActivityCells.get(lesson.id) || new Set<string>()
      used.add(`${slot.day_of_week}:${slot.period}`); legacyActivityCells.set(lesson.id, used)
    }
  }
  const grouped = new Set<string>()
  for (const group of data.activityGroups || []) {
    for (const room of group.roomIds) {
      grouped.add(`${room}:${group.settingId}`)
      for (const cell of group.cells || []) cells.set(cellKey(room, cell.day, cell.period), { day: cell.day, period: cell.period, teachers: activityTeachers(group, room) })
    }
    const teams = group.mode === 'joint' ? [group.teacherIds] : group.roomIds.map(room => activityTeachers(group, room))
    for (const team of teams) for (const id of new Set(team)) get(id).activities += quota(group.weeklyPeriods)
  }
  for (const lesson of data.lessons.filter(lesson => lesson.activity && !grouped.has(`${lesson.classroomId}:${lesson.subjectId}`)))
    for (const id of lessonTeachers(lesson)) get(id).activities += quota(lesson.count) || legacyActivityCells.get(lesson.id)?.size || 0
  for (const cell of cells.values()) for (const id of cell.teachers) get(id).cells.add(`${cell.day}:${cell.period}`)

  return teachers.flatMap(teacher => {
    const row = totals.get(teacher.id)
    if (!row || !row.subjects && !row.activities && !row.cells.size) return []
    const hours = row.subjects + row.activities, status = workloadStatus(hours)
    return [{ id: teacher.id, name: `${teacher.prefix?.trim() || ''}${teacher.full_name.trim()}`, position: teacher.position,
      hours, subject_hours: row.subjects, activity_hours: row.activities, scheduled_hours: row.cells.size,
      remaining: Math.max(0, hours - row.cells.size), status, status_label: workloadLabel(status) }]
  }).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'th'))
}
