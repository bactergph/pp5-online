import type {SchedulePlan} from './schedule-planning'

type Data={plan:Pick<SchedulePlan,'days'|'rules'|'activityGroups'>;periods:{is_break:boolean;period:number}[];classrooms:{id:string;level:string;room:number;name?:string}[];lessons:{id:string;classroomId:string;count:number;activity?:boolean;subjectId?:string}[];slots:{classroom_id:string;class_subject_id:string|null;activity_id:string|null;locked:boolean;day_of_week:number;period:number}[]}
/** Weekly classroom capacity, not teacher load: a joint subject still occupies
 * its full quota in every classroom. Configured activity teams are counted once. */
export function schedulePeriodBudget(data:Data,roomIds=data.classrooms.map(room=>room.id)){
  const teaching=new Set(data.periods.filter(time=>!time.is_break).map(time=>time.period)),capacity=data.plan.days.length*teaching.size
  const quota=(value:number)=>Number.isFinite(value)&&value>0?value:0
  return data.classrooms.filter(room=>roomIds.includes(room.id)).map(room=>{
    const subjects=data.lessons.filter(lesson=>!lesson.activity&&lesson.classroomId===room.id).reduce((sum,lesson)=>sum+quota(data.plan.rules[lesson.id]?.count??lesson.count),0)
    const groups=(data.plan.activityGroups||[]).filter(group=>group.roomIds.includes(room.id))
    const activities=groups.reduce((sum,group)=>sum+quota(group.weeklyPeriods),0)+data.lessons.filter(lesson=>lesson.activity&&lesson.classroomId===room.id&&!groups.some(group=>group.settingId===lesson.subjectId)).reduce((sum,lesson)=>sum+quota(lesson.count),0)
    const reserved=new Set(data.slots.filter(row=>row.classroom_id===room.id&&row.locked&&!row.class_subject_id&&!row.activity_id&&data.plan.days.includes(row.day_of_week)&&teaching.has(row.period)&&!groups.some(group=>group.cells.some(cell=>cell.day===row.day_of_week&&cell.period===row.period))).map(row=>`${row.day_of_week}:${row.period}`)).size
    const target=capacity-reserved,total=subjects+activities
    return {roomId:room.id,label:room.level.includes('/')?room.level:`${room.level}/${room.name||room.room}`,subjects,activities,capacity,reserved,target,total,missing:Math.max(0,target-total),excess:Math.max(0,total-target)}
  })
}
