import type {SchedulePlan} from './schedule-planning'
export type ScheduleRoomState={id:string;schedule_enabled?:boolean;enabled?:boolean}
export const scheduleRoomEnabled=(room:ScheduleRoomState)=>room.schedule_enabled!==false&&room.enabled!==false
/** Closed rooms stay in storage; only this projection participates in scheduling. */
export function effectiveSchedulePlan<T extends SchedulePlan>(plan:T,rooms:ScheduleRoomState[],lessons:{id:string;classroomId:string}[]):T{
 const hidden=new Set(rooms.filter(room=>!scheduleRoomEnabled(room)).map(room=>room.id)),hiddenLessons=new Set(lessons.filter(l=>hidden.has(l.classroomId)).map(l=>l.id))
 return {...plan,rules:Object.fromEntries(Object.entries(plan.rules||{}).filter(([id])=>!hiddenLessons.has(id))),
  activityGroups:plan.activityGroups?.map(group=>({...group,roomIds:group.roomIds.filter(id=>!hidden.has(id)),roomTeachers:Object.fromEntries(Object.entries(group.roomTeachers).filter(([id])=>!hidden.has(id)))})).filter(group=>group.roomIds.length),
  teachingGroups:plan.teachingGroups?.map(group=>({...group,lessonIds:group.lessonIds.filter(id=>!hiddenLessons.has(id))})).filter(group=>group.lessonIds.length>=2)}
}
/** Merge visible edits into the stored plan without erasing closed-room metadata. */
export function mergeStoredSchedulePlan(stored:SchedulePlan,next:SchedulePlan,rooms:ScheduleRoomState[],lessons:{id:string;classroomId:string}[]):SchedulePlan{
 const hidden=new Set(rooms.filter(room=>!scheduleRoomEnabled(room)).map(room=>room.id)),hiddenLessons=new Set(lessons.filter(l=>hidden.has(l.classroomId)).map(l=>l.id))
 for(const [id,rule] of Object.entries(stored.rules||{}))if(hiddenLessons.has(id)&&rule.roomId&&stored.rooms.some(place=>place.id===rule.roomId)&&!next.rooms.some(place=>place.id===rule.roomId))throw Error('สถานที่นี้ยังใช้กับห้องที่ปิดอยู่ เปิดห้องแล้วเปลี่ยนสถานที่ก่อนลบ')
 const groups=[...(next.activityGroups||[])].map(group=>({...group,roomIds:[...group.roomIds],roomTeachers:{...group.roomTeachers}}))
 for(const old of stored.activityGroups||[]){const archived=old.roomIds.filter(id=>hidden.has(id));if(!archived.length)continue;const current=groups.find(g=>g.id===old.id)
  if(current){if(['settingId','mode','weeklyPeriods','cells',...(old.mode==='joint'?['teacherIds']:[])].some(key=>JSON.stringify(old[key as keyof typeof old])!==JSON.stringify(current[key as keyof typeof current])))throw Error('กิจกรรมนี้มีห้องที่ปิดเก็บข้อมูลอยู่ เปิดห้องในกลุ่มให้ครบก่อนเปลี่ยนเวลา รูปแบบ หรือทีมครูร่วม')
   current.roomIds=[...new Set([...current.roomIds,...archived])];for(const id of archived)if(old.roomTeachers[id])current.roomTeachers[id]=old.roomTeachers[id]
  }else groups.push({...old,roomIds:archived,roomTeachers:Object.fromEntries(Object.entries(old.roomTeachers).filter(([id])=>hidden.has(id)))})
 }
 const teaching=[...(next.teachingGroups||[])].map(group=>({...group,lessonIds:[...group.lessonIds]}))
 for(const old of stored.teachingGroups||[]){const archived=old.lessonIds.filter(id=>hiddenLessons.has(id));if(!archived.length)continue;const current=teaching.find(g=>g.id===old.id),active=old.lessonIds.filter(id=>!hiddenLessons.has(id))
  if(current){if(JSON.stringify(old.cells)!==JSON.stringify(current.cells))throw Error('กลุ่มสอนรวมนี้มีห้องที่ปิดเก็บข้อมูลอยู่ เปิดห้องในกลุ่มให้ครบก่อนเปลี่ยนคาบสอนรวม');current.lessonIds=[...new Set([...current.lessonIds,...archived])]}
  else teaching.push({...old,lessonIds:active.length<2?[...old.lessonIds]:archived})
 }
 return {...next,roomLabels:{...stored.roomLabels,...next.roomLabels},rules:{...Object.fromEntries(Object.entries(stored.rules||{}).filter(([id])=>hiddenLessons.has(id))),...next.rules},activityGroups:groups,teachingGroups:teaching}
}
