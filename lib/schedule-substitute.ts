import { lessonTeachers, roomActivityDisplay } from './schedule-activity-teams'
import type { loadSchedule } from './schedule-store'

/** Use the same lessons and activity overlays as the visible class timetable. */
export function substituteTimetableForDay(schedule: Awaited<ReturnType<typeof loadSchedule>>, day: number) {
  return schedule.classrooms.flatMap(room => {
    const display = roomActivityDisplay(schedule.activityGroups || [], room.id, schedule.lessons, schedule.teacherNames)
    const lessons = [...schedule.lessons, ...display.lessons]
    const periods = new Map(schedule.slots.filter(slot => slot.classroom_id === room.id && slot.day_of_week === day)
      .map(slot => [slot.period, slot.activity_id ? `activity:${slot.activity_id}` : slot.class_subject_id]))
    for (const cell of display.cells) if (cell.day === day) periods.set(cell.period, cell.lessonId)
    return [...periods].flatMap(([period, id]) => {
      const lesson = lessons.find(item => item.id === id)
      return lesson ? [{period, teacherIds: lessonTeachers(lesson), class_subject_id: lesson.activity ? null : lesson.id,
        classroom_id: room.id, room_label: `${room.level}/${room.room}`,
        subject_label: `${lesson.code || ''} ${lesson.name}`.trim()}] : []
    })
  }).sort((a, b) => a.period - b.period || a.room_label.localeCompare(b.room_label, 'th', {numeric: true}))
}

export function substituteWeekday(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('วันที่ไม่ถูกต้อง')
  return new Date(date + 'T12:00:00+07:00').getUTCDay() || 7
}
