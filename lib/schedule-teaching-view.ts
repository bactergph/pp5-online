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
    for(const row of substituteTimetableForDay(data,day))if(row.teacherIds.includes(teacherId))grouped.set(row.period,[...grouped.get(row.period)||[],row])
    for(const [period,rows] of grouped){
      const unique=(values:string[])=>[...new Set(values.filter(Boolean))]
      const rooms=unique(rows.map(row=>row.room_label)).join(' + '),subjects=unique(rows.map(row=>row.subject_line)).join(' / ')
      result[`${day}-${period}`]={label:rows.map(row=>`${row.room_label}\n${row.subject_line}`).join('\n'),room_line:rooms,subject_line:subjects,
        pdf:{line1:rooms,line2:unique(rows.map(row=>row.subject_name)).join(' / '),line3:unique(rows.map(row=>row.subject_code?`(${row.subject_code})`:row.activity?'(กิจกรรม)':'')).join(' / '),line4:unique(rows.map(row=>row.room_name)).join(' / ')}}
    }
  }
  return result
}
