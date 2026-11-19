import {teacherDisplayPeriod,teacherPeriodTimes,levelPeriodTimes,hasPeriodProfiles,periodBand,clockMinute,type PeriodBand} from './schedule-period-profiles'
import {teacherActivitiesInClock} from './schedule-teacher-activities'
import type {PeriodTimeRow} from './schedule-helpers'
import {substituteTimetableForDay} from './schedule-substitute'
import type {loadSchedule} from './schedule-store'
import type {SchedulePdfCell} from './jspdf-schedules'

export type TeachingViewCell={label:string;subject_line:string;room_line:string;classroomLevels?:string[];pdf:SchedulePdfCell}

function homeroomBand(level?: string | null): PeriodBand | null {
  return level && periodBand(level) ? periodBand(level) : null
}

/** A homeroom teacher keeps that band's bell. A lesson in another band lands
 * in the homeroom period it overlaps, so the sheet stays one layout. */
function lessonDisplayPeriod(times: PeriodTimeRow[], level: string, period: number, homeroomLevel?: string | null) {
  const own = teacherDisplayPeriod(times, level, period)
  if (!homeroomBand(homeroomLevel) || !hasPeriodProfiles(times)) return own
  const lesson = levelPeriodTimes(times, level).find(row => !row.is_break && row.period === period)
  if (!lesson) return own
  const start = clockMinute(lesson.start_time)
  const end = clockMinute(lesson.end_time)
  const home = levelPeriodTimes(times, homeroomLevel || '').filter(row => !row.is_break)
  const exact = home.find(row => row.start_time === lesson.start_time && row.end_time === lesson.end_time)
  const best = exact || home
    .map(row => ({ row, overlap: Math.min(end, clockMinute(row.end_time)) - Math.max(start, clockMinute(row.start_time)) }))
    .filter(item => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.row.start_time.localeCompare(b.row.start_time))[0]?.row
  return best ? teacherDisplayPeriod(times, homeroomLevel || '', best.period) : own
}

/** Project the effective classroom cells (including activity overlays) into a
 * teacher view. Never skip flexible activities or overwrite another room. */
export function scheduleTeachingView(data:Awaited<ReturnType<typeof loadSchedule>>,teacherId:string,homeroomLevel?:string|null) {
  const result:Record<string,TeachingViewCell>={}
  for(let day=1;day<=5;day++){
    const grouped=new Map<number,ReturnType<typeof substituteTimetableForDay>>()
    for(const row of substituteTimetableForDay(data,day))if(row.teacherIds.includes(teacherId)){const level=data.classrooms.find(c=>c.id===row.classroom_id)?.level||'',period=lessonDisplayPeriod(data.periodTimes||[],level,row.period,homeroomLevel);grouped.set(period,[...grouped.get(period)||[],row])}
    for(const [period,rows] of grouped){
      const unique=(values:string[])=>[...new Set(values.filter(Boolean))]
      const rooms=unique(rows.map(row=>row.room_label)).join(' + '),subjects=unique(rows.map(row=>row.subject_line)).join(' / ')
      const classroomLevels=unique(rows.map(row=>data.classrooms.find(c=>c.id===row.classroom_id)?.level||''))
      result[`${day}-${period}`]={classroomLevels,label:rows.map(row=>`${row.room_label}\n${row.subject_line}`).join('\n'),room_line:rooms,subject_line:subjects,
        pdf:{classroomLevels,line1:rooms,line2:unique(rows.map(row=>row.subject_name)).join(' / '),line3:unique(rows.map(row=>row.subject_code?`(${row.subject_code})`:row.activity?'(กิจกรรม)':'')).join(' / '),line4:unique(rows.map(row=>[row.room_name,hasPeriodProfiles(data.periodTimes||[])?levelPeriodTimes(data.periodTimes||[],data.classrooms.find(c=>c.id===row.classroom_id)?.level||'').find(t=>!t.is_break&&t.period===row.period)?.label:''].filter(Boolean).join(' · '))).join(' / ')}}
    }
  }
  for(const activity of teacherActivitiesInClock(data.periodTimes||[]).filter(activity=>activity.teacherIds.includes(teacherId))){
    const axis=teacherPeriodTimes(data.periodTimes||[])
    const slot=axis.find(row=>row.start_time===activity.start_time&&row.end_time===activity.end_time)
      ??axis.find(row=>row.is_break&&row.start_time<=activity.start_time&&activity.end_time<=row.end_time)
    if(!slot)continue
    for(const day of activity.days){
      const key=`${day}-${slot.period}`,current=result[key]
      if(current&&current.room_line!=='กิจกรรมครู')continue
      const name=current?.room_line==='กิจกรรมครู'?`${current.subject_line} / ${activity.name}`:activity.name
      result[key]={label:name,subject_line:name,room_line:'กิจกรรมครู',pdf:{line1:name,line2:'(กิจกรรมครู)',line3:`${activity.start_time}–${activity.end_time}`}}
    }
  }
  return result
}
