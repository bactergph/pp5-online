import type {ActivityTeam} from './schedule-activity-teams'
type Plan={teacherIds?:string[];activityGroups?:ActivityTeam[]}
export function activityTeacherReferences(plan:Plan){
 return [...new Set([...(plan.teacherIds||[]),...(plan.activityGroups||[]).flatMap(group=>[...group.teacherIds,...Object.values(group.roomTeachers).flat()])])]
}
/** Explicit repair removes unavailable references, never people or placements. */
export function repairActivityTeacherPlan<T extends Plan>(plan:T,available:readonly string[]){
 const allowed=new Set(available),removedTeacherIds=activityTeacherReferences(plan).filter(id=>!allowed.has(id)),removed=new Set(removedTeacherIds)
 let affectedGroups=0
 const activityGroups=plan.activityGroups?.map(group=>{
  const teacherIds=group.teacherIds.filter(id=>!removed.has(id)),roomTeachers=Object.fromEntries(Object.entries(group.roomTeachers).map(([room,ids])=>[room,ids.filter(id=>!removed.has(id))]))
  if(teacherIds.length!==group.teacherIds.length||Object.keys(roomTeachers).some(room=>roomTeachers[room].length!==group.roomTeachers[room].length))affectedGroups++
  return {...group,teacherIds,roomTeachers}
 })
 const next={...plan,...(plan.teacherIds?{teacherIds:plan.teacherIds.filter(id=>!removed.has(id))}:{}),...(activityGroups?{activityGroups}:{})}
 // An old selection containing only deleted IDs must not hide every current teacher.
 // Removing the obsolete selection restores the normal available-personnel picker.
 if(plan.teacherIds?.length&&next.teacherIds?.length===0)Reflect.deleteProperty(next,'teacherIds')
 return {plan:next,removedTeacherIds,affectedGroups}
}
