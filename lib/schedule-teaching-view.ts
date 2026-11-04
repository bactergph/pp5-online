import {teacherDisplayPeriod,teacherPeriodTimes,levelPeriodTimes,hasPeriodProfiles} from './schedule-period-profiles'
import {teacherActivitiesInClock} from './schedule-teacher-activities'
import type {PeriodTimeRow} from './schedule-helpers'
import {substituteTimetableForDay} from './schedule-substitute'
import type {loadSchedule} from './schedule-store'
import type {SchedulePdfCell} from './jspdf-schedules'

export type TeachingViewCell={label:string;subject_line:string;room_line:string;pdf:SchedulePdfCell}
/** Project the effective classroom cells (including activity overlays) into a
 * teacher view. Never skip flexible activities or overwrite another room. */
export function scheduleTeachingView(data:Awaited<ReturnType<typeof loadSchedule>>,teacherId:string) {
  const result:Record<string,TeachingViewCell>={}
  for(let day=1;day<=5;day++){
    const grouped=new Map<number,ReturnType<typeof substituteTimetableForDay>>()
    for(const row of substituteTimetableForDay(data,day))if(row.teacherIds.includes(teacherId)){const level=data.classrooms.find(c=>c.id===row.classroom_id)?.level||'',period=teacherDisplayPeriod(data.periodTimes||[],level,row.period);grouped.set(period,[...grouped.get(period)||[],row])}
    for(const [period,rows] of grouped){
      const unique=(values:string[])=>[...new Set(values.filter(Boolean))]
      const rooms=unique(rows.map(row=>row.room_label)).join(' + '),subjects=unique(rows.map(row=>row.subject_line)).join(' / ')
      result[`${day}-${period}`]={label:rows.map(row=>`${row.room_label}\n${row.subject_line}`).join('\n'),room_line:rooms,subject_line:subjects,
        pdf:{line1:rooms,line2:unique(rows.map(row=>row.subject_name)).join(' / '),line3:unique(rows.map(row=>row.subject_code?`(${row.subject_code})`:row.activity?'(กิจกรรม)':'')).join(' / '),line4:unique(rows.map(row=>[row.room_name,hasPeriodProfiles(data.periodTimes||[])?levelPeriodTimes(data.periodTimes||[],data.classrooms.find(c=>c.id===row.classroom_id)?.level||'').find(t=>!t.is_break&&t.period===row.period)?.label:''].filter(Boolean).join(' · '))).join(' / ')}}
    }
  }
  for(const activity of teacherActivitiesInClock(data.periodTimes||[]).filter(activity=>activity.teacherIds.includes(teacherId))){
    const period=teacherPeriodTimes(data.periodTimes||[]).find(row=>row.start_time===activity.start_time&&row.end_time===activity.end_time)?.period
    if(!period)continue
    for(const day of activity.days)result[`${day}-${period}`]={label:activity.name,subject_line:activity.name,room_line:'กิจกรรมครู',pdf:{line1:activity.name,line2:'(กิจกรรมครู)',line3:`${activity.start_time}–${activity.end_time}`}}
  }
  return result
}
