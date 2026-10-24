import 'server-only'
import { activityTeachers, activityWeeklyPeriods, validateActivityTeam, type ActivityTeam } from './schedule-activity-teams'
import { randomUUID } from 'node:crypto'
import { getSession } from './session'
import { createServerClient } from './supabase'
import { SCHEDULE_EDIT_ROLES, classroomShortName, isTimetableClassroom } from './schedules'
import { loadSchedule, loadScheduleConstraints, lessonKey, lessonColumns, type ScheduleSlot } from './schedule-store'
import { DEFAULT_PERIOD_TIMES, normalizePeriodTimes, validatePeriodTimes, type PeriodTimeRow } from './schedule-helpers'
import { emptyPlan, validatePlan, checkPlanning, solvePlannedSchedule, lessonPrefersMorning, type SchedulePlan } from './schedule-planning'
import { verifyCompleteSchedule } from './schedule-verification'
import { applySchedulePlaceChange, type SchedulePlaceChange } from './schedule-places'

async function actor(){const s=await getSession();if(!s?.schoolId||s.mustChangePassword||!SCHEDULE_EDIT_ROLES.includes(s.role as typeof SCHEDULE_EDIT_ROLES[number]))throw Error('ไม่มีสิทธิ์จัดตารางเรียน');return {...s,schoolId:s.schoolId}}
function fail(error:{message:string;code?:string}|null){if(error)throw Error(['42P01','PGRST202','PGRST205'].includes(error.code||'')?'กรุณาติดตั้ง migration 063_schedule_planning_drafts.sql ในสภาพแวดล้อมทดสอบก่อนใช้ขั้นเตรียมและฉบับร่าง':'ดำเนินการไม่สำเร็จ: '+error.message)}
async function snapshot(school:string,year:string,term:number){const r=await createServerClient().rpc('schedule_snapshot',{p_school:school,p_year:year,p_term:term});fail(r.error);return r.data as string}
export async function preparation(year:string,term:number){
 const session=await actor(),db=createServerClient(),hash=await snapshot(session.schoolId,year,term)
 const [data,constraints,config,times,activities,teachers]=await Promise.all([
 loadSchedule(session.schoolId,year,term),loadScheduleConstraints(session.schoolId,year,term),
 db.from('schedule_plans').select('config').eq('school_id',session.schoolId).eq('academic_year_id',year).eq('semester',term).maybeSingle(),
 db.from('school_period_times').select('period,label,start_time,end_time,is_break,sort_order').eq('school_id',session.schoolId).order('sort_order'),
 readActivityCatalog(db,session.schoolId),
 db.from('users').select('id,prefix,full_name,position').eq('school_id',session.schoolId).or('is_active.eq.true,email.like.pending-%').in('role',['teacher','academic_head','deputy_principal','principal','admin']).order('full_name').limit(1000)])
 for(const r of [config,times,teachers])fail(r.error)
 if(hash!==await snapshot(session.schoolId,year,term))throw Error('ข้อมูลเปลี่ยนระหว่างโหลด กรุณาลองใหม่')
 const plan=(config.data?.config||emptyPlan()) as SchedulePlan
 const periods=normalizePeriodTimes((times.data?.length?times.data:DEFAULT_PERIOD_TIMES) as PeriodTimeRow[])
 const classrooms=data.classrooms.filter(c=>isTimetableClassroom(c.level)).map(c=>({...c,name:classroomShortName(c,plan.roomLabels)}))
 const roomTitle=new Map(classrooms.map(c=>[c.id,`${c.level}/${c.name}`]))
 const lessons=data.lessons.map(l=>{
  const title=roomTitle.get(l.classroomId)
  const label=title&&l.label.includes(' · ')?`${title} · ${l.label.split(' · ').slice(1).join(' · ')}`:l.label
  return {...l,label,...plan.rules[l.id],spread:plan.rules[l.id]?.spread??true,roomName:plan.rules[l.id]?(plan.rooms.find(r=>r.id===plan.rules[l.id].roomId)?.name||''):l.roomName,source:plan.rules[l.id]?'กำหนดภาระสอนสำหรับภาคเรียนนี้':`${l.sourceHours||0} ชั่วโมงเทียบรายปี ÷ 40 สัปดาห์`}
 })
 // Keep all existing slots/lessons for outside-scope teacher and venue conflicts,
 // but only offer non-kindergarten classrooms for import, activities and generation.
 return {hash,plan,periods,timesConfigured:!!times.data?.length,classrooms,lessons,slots:data.slots,blocks:constraints.blocks,blocksSupported:constraints.blocksSupported!==false,activities,teachers:teachers.data||[]}
}
export type Preparation = Awaited<ReturnType<typeof preparation>>
/** Labels and grid configuration from the exact snapshot used to calculate a draft. */
export type DraftPreview = {
 lessons:Pick<Preparation['lessons'][number],'id'|'name'|'code'|'teacherName'|'roomName'|'subjectId'>[]
 classrooms:Preparation['classrooms']; periods:Preparation['periods']; days:number[]
}
export type ActivityName={id:string;label:string;short_label:string;weeklyPeriods:number}
async function readActivityCatalog(db:ReturnType<typeof createServerClient>,schoolId:string):Promise<ActivityName[]>{
 const query=(columns:string)=>db.from('evaluation_settings').select(columns).eq('school_id',schoolId).eq('kind','activities').eq('is_active',true).order('sort_order')
 let result=await query('id,label,short_label,schedule_weekly_periods')
 if(result.error&&/schedule_weekly_periods/.test(result.error.message))result=await query('id,label,short_label')
 if(result.error)throw Error('โหลดรายการกิจกรรมไม่สำเร็จ กรุณาลองใหม่')
 const rows=(result.data||[]) as unknown as {id:string;label:string;short_label:string|null;schedule_weekly_periods?:number}[]
 return rows.map(row=>({id:row.id,label:row.label,short_label:row.short_label||'',weeklyPeriods:activityWeeklyPeriods(row.schedule_weekly_periods??1)}))
}
export async function activityCatalog(){
 const session=await actor()
 return readActivityCatalog(createServerClient(),session.schoolId)
}
export async function saveActivityName(id:string|null,label:string,shortLabel:string,weeklyPeriods=1){
 const session=await actor(),name=label.trim(),shortName=(shortLabel.trim()||name).slice(0,40)
 if(!name)throw Error('กรอกชื่อกิจกรรม')
 if(!shortName)throw Error('กรอกชื่อย่อกิจกรรม')
 const weekly=activityWeeklyPeriods(weeklyPeriods)
 const db=createServerClient()
 const dup=await db.from('evaluation_settings').select('id').eq('school_id',session.schoolId).eq('kind','activities').eq('is_active',true).eq('label',name)
 fail(dup.error)
 if((dup.data||[]).some(row=>row.id!==id))throw Error('มีกิจกรรมชื่อนี้อยู่แล้ว')
 if(id){
  const existing=await db.from('evaluation_settings').select('id').eq('id',id).eq('school_id',session.schoolId).eq('kind','activities').maybeSingle()
  fail(existing.error)
  if(!existing.data)throw Error('ไม่พบกิจกรรมนี้')
  const updated=await db.from('evaluation_settings').update({label:name,short_label:shortName,schedule_weekly_periods:weekly,updated_at:new Date().toISOString()}).eq('id',id).eq('school_id',session.schoolId)
  if(updated.error&&/schedule_weekly_periods/.test(updated.error.message))throw Error('กรุณาติดตั้ง migration 080_schedule_flexible_activities.sql ก่อนบันทึกชั่วโมงกิจกรรม')
  fail(updated.error)
 }else{
  const latest=await db.from('evaluation_settings').select('sort_order').eq('school_id',session.schoolId).eq('kind','activities').order('sort_order',{ascending:false}).limit(1)
  fail(latest.error)
  const inserted=await db.from('evaluation_settings').insert({school_id:session.schoolId,kind:'activities',field_key:`custom_activities_${randomUUID().replace(/-/g,'').slice(0,12)}`,label:name,short_label:shortName,group_label:'กิจกรรมพัฒนาผู้เรียน',sort_order:((latest.data?.[0]?.sort_order as number)||0)+1,is_active:true,score_type:'pass_fail',max_score:1,is_required:false,hours_per_year:0,schedule_weekly_periods:weekly})
  if(inserted.error&&/schedule_weekly_periods/.test(inserted.error.message))throw Error('กรุณาติดตั้ง migration 080_schedule_flexible_activities.sql ก่อนบันทึกชั่วโมงกิจกรรม')
  fail(inserted.error)
 }
 return activityCatalog()
}
export async function removeActivityName(id:string){
 const session=await actor(),db=createServerClient()
 const existing=await db.from('evaluation_settings').select('id').eq('id',id).eq('school_id',session.schoolId).eq('kind','activities').maybeSingle()
 fail(existing.error)
 if(!existing.data)throw Error('ไม่พบกิจกรรมนี้')
 const offerings=await db.from('class_schedule_activities').select('id').eq('evaluation_setting_id',id)
 fail(offerings.error)
 const ids=(offerings.data||[]).map(row=>row.id)
 if(ids.length){
  const placed=await db.from('class_schedule_slots').select('id',{count:'exact',head:true}).in('activity_id',ids)
  fail(placed.error)
  if((placed.count||0)>0)throw Error('ลบไม่ได้ เพราะกิจกรรมนี้ถูกจัดลงตารางแล้ว')
 }
 const plans=await db.from('schedule_plans').select('config').eq('school_id',session.schoolId)
 fail(plans.error)
 const assigned=(plans.data||[]).some(row=>(((row.config as {activityGroups?:{settingId?:string}[]}|null)?.activityGroups)||[]).some(group=>group.settingId===id))
 if(assigned)throw Error('ลบไม่ได้ เพราะกิจกรรมนี้ถูกกำหนดให้ห้องแล้ว นำออกจากห้องก่อน')
 if(ids.length){const cleared=await db.from('class_schedule_activities').delete().in('id',ids);fail(cleared.error)}
 const removed=await db.from('evaluation_settings').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',id).eq('school_id',session.schoolId).eq('kind','activities')
 fail(removed.error)
 return activityCatalog()
}
export async function savePlaces(year:string,term:number,hash:string,change:SchedulePlaceChange){
 const s=await actor(),current=await preparation(year,term)
 if(current.hash!==hash)throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
 const plan=applySchedulePlaceChange(current,change)
 const r=await createServerClient().rpc('save_schedule_plan',{p_school:s.schoolId,p_year:year,p_term:term,p_hash:hash,p_config:plan});fail(r.error)
 return preparation(year,term)
}
export async function savePlan(year:string,term:number,hash:string,plan:SchedulePlan){
 const s=await actor(),current=await preparation(year,term);validatePlan(plan,current.lessons.filter(l=>!l.activity).map(l=>l.id))
 if(JSON.stringify(plan.activityGroups||[])!==JSON.stringify(current.plan.activityGroups||[]))throw Error('แก้ทีมครูผ่านเมนูกิจกรรมและครูผู้รับผิดชอบ')
 if(plan.teacherIds?.some(id=>!current.teachers.some(t=>t.id===id)))throw Error('ครูที่เลือกไม่ได้อยู่ในโรงเรียนนี้')
 const lessons=current.lessons.map(l=>({...l,...plan.rules[l.id],count:l.activity?current.slots.filter(r=>lessonKey(r)===l.id).length:(plan.rules[l.id]?.count??l.count)}))
 // Saving preparation may be incremental. Only conflicts with existing timetable
 // cells block it; subject names (e.g. “ชุมชน”) must never classify an issue.
 const issues=checkPlanning(lessons,current.slots.map(toPlanned),plan.days,current.periods,current.blocks).filter(i=>i.code?.startsWith('fixed_'))
 if(issues.length)throw Error(issues.map(i=>i.message).join('\n'))
 const r=await createServerClient().rpc('save_schedule_plan',{p_school:s.schoolId,p_year:year,p_term:term,p_hash:hash,p_config:plan});fail(r.error)
 return preparation(year,term)
}
const toPlanned=(s:ScheduleSlot)=>({classroomId:s.classroom_id,lessonId:lessonKey(s),day:s.day_of_week,period:s.period})
function activityPlacement(data:Preparation,year:string){
 const offerings:{id:string;classroom_id:string;evaluation_setting_id:string}[]=[],slots:ScheduleSlot[]=[],extra:Preparation['lessons']=[],unlock:ScheduleSlot[]=[],seen=new Set<string>()
 const patch=new Map<string,{teacherIds:string[];teacherId:null;activityGroupId?:string;name:string;teacherName:string}>()
 const flexible=new Map<string,{count:number;group:ActivityTeam}>()
 for(const group of data.plan.activityGroups||[]){
  const label=data.activities.find(a=>a.id===group.settingId)?.label||'กิจกรรม'
  for(const roomId of group.roomIds){
   if(!data.classrooms.some(c=>c.id===roomId))continue
   const teachers=activityTeachers(group,roomId)
   const teacherName=teachers.map(id=>{const t=data.teachers.find(t=>t.id===id);return t?`${t.prefix||''} ${t.full_name}`.trim():''}).filter(Boolean).join(', ')
   let lesson=data.lessons.find(l=>l.activity&&l.classroomId===roomId&&l.subjectId===group.settingId)
   if(!lesson){
    const id=randomUUID(),room=data.classrooms.find(c=>c.id===roomId)
    offerings.push({id,classroom_id:roomId,evaluation_setting_id:group.settingId})
    lesson={id:'activity:'+id,classroomId:roomId,teacherId:null,teacherIds:teachers,count:group.weeklyPeriods,label:`${room?.level}/${room?.room} · ${label}`,subjectId:group.settingId,code:'',name:label,fullName:label,teacherName,activity:true,teacherOptional:true,selectable:false,activityGroupId:group.mode==='joint'?group.id:undefined,sourceHours:0,roomName:'',spread:true,source:'กิจกรรมที่กำหนดไว้'} as Preparation['lessons'][number]
    extra.push(lesson)
   }else patch.set(lesson.id,{teacherIds:teachers,teacherId:null,activityGroupId:group.mode==='joint'?group.id:undefined,name:lesson.name||label,teacherName:teacherName||lesson.teacherName})
   if(!group.cells.length)flexible.set(lesson.id,{count:activityWeeklyPeriods(group.weeklyPeriods),group})
   for(const cell of group.cells){
    const key=`${roomId}:${cell.day}:${cell.period}`
    if(seen.has(key))throw Error('มีกิจกรรมมากกว่าหนึ่งรายการในคาบเดียวกัน กรุณาแก้ที่ขั้นกิจกรรม')
    seen.add(key)
    const previous=data.slots.find(s=>s.classroom_id===roomId&&s.day_of_week===cell.day&&s.period===cell.period)
    if(previous?.locked&&lessonKey(previous)!==lesson.id)unlock.push(previous)
    slots.push({classroom_id:roomId,academic_year_id:year,day_of_week:cell.day,period:cell.period,...lessonColumns(lesson.id),note:null,locked:!!(previous&&lessonKey(previous)===lesson.id&&previous.locked)})
   }
  }
 }
 return {slots,offerings,extra,patch,unlock,flexible}
}
function input(data:Preparation,scope:string[],clear:boolean,year:string){
 if(!Array.isArray(scope)||!scope.length||new Set(scope).size!==scope.length||scope.some(id=>!data.classrooms.some(c=>c.id===id))||typeof clear!=='boolean')throw Error('กรุณาเลือกห้องประถมหรือมัธยมในปีการศึกษานี้ การจัดตารางนี้ไม่รวมอนุบาล และห้ามเลือกห้องซ้ำ')
 const placed=activityPlacement(data,year),cellKey=(s:{classroom_id:string;day_of_week:number;period:number})=>`${s.classroom_id}:${s.day_of_week}:${s.period}`,pinned=new Set(placed.slots.map(cellKey))
 const allLessons=[...data.lessons,...placed.extra],byId=new Map(allLessons.map(l=>[l.id,l]))
 const autoIds=new Set<string>()
 for(const [id,item] of placed.flexible){
  const lesson=byId.get(id)
  if(lesson&&(scope.includes(lesson.classroomId)||item.group.mode==='joint'&&item.group.roomIds.some(roomId=>scope.includes(roomId))))autoIds.add(id)
 }
 const retained=[...data.slots.filter(s=>!pinned.has(cellKey(s))&&(s.locked||!clear||s.activity_id&&!autoIds.has(lessonKey(s)||'')||!scope.includes(s.classroom_id)&&!autoIds.has(lessonKey(s)||''))),...placed.slots]
 const lessons=allLessons.map(l=>{const active=scope.includes(l.classroomId)&&!l.activity||autoIds.has(l.id);const count=active?(placed.flexible.get(l.id)?.count??l.count):retained.filter(s=>lessonKey(s)===l.id).length;return {...l,...placed.patch.get(l.id),count,fixedOnly:!active,pattern:active?(l.activity?Array(count).fill(1):l.pattern):undefined,teacherOptional:!active||l.teacherOptional,preferMorning:active&&!l.activity&&lessonPrefersMorning(l)}})
 return {retained,lessons,offerings:placed.offerings,unlock:placed.unlock}
}
function shiftManageStep<T extends {step:number}>(issue:T){return {...issue,step:({1:1,2:3,3:4,4:6,5:6,6:7} as Record<number,number>)[issue.step]||7}}
export async function preflight(year:string,term:number,scope:string[],clear:boolean){
 const data=await preparation(year,term),activityIssues:ReturnType<typeof checkPlanning>=[],groupIds=new Set<string>(),roomActivities=new Set<string>()
 // Commit validates every activity team, including pinned teams outside the chosen scope.
 // Validate before placement so deleted settings/rooms and invalid quotas cannot become a seemingly ready draft.
 for(const group of data.plan.activityGroups||[]){
  const name=data.activities.find(activity=>activity.id===group.settingId)?.label||'กิจกรรม'
  try{validateActivityTeam(group,data.classrooms.map(room=>room.id),data.teachers.map(teacher=>teacher.id),data.activities.map(activity=>activity.id),data.plan.days,data.periods)}
  catch(error){activityIssues.push({severity:'error',message:`${name}: ${error instanceof Error?error.message:String(error)}`,step:5});continue}
  if(groupIds.has(group.id)||group.roomIds.some(room=>roomActivities.has(`${group.settingId}:${room}`)))activityIssues.push({severity:'error',message:`${name}: กำหนดทีมกิจกรรมซ้ำในห้องเดียวกัน กรุณารวมเป็นทีมเดียว`,step:5})
  groupIds.add(group.id);for(const room of group.roomIds)roomActivities.add(`${group.settingId}:${room}`)
 }
 if(activityIssues.length)return {data,issues:activityIssues,retained:data.slots,lessons:data.lessons,offerings:[] as {id:string;classroom_id:string;evaluation_setting_id:string}[],unlock:[] as ScheduleSlot[]}
 const {retained,lessons,offerings,unlock}=input(data,scope,clear,year);const issues=checkPlanning(lessons,retained.map(toPlanned),data.plan.days,data.periods,data.blocks)
 const poolIssues:typeof issues=[]
 for(const l of lessons.filter(l=>l.count>0&&(!l.fixedOnly||l.activity&&(data.plan.activityGroups||[]).some(group=>group.settingId===l.subjectId&&group.roomIds.includes(l.classroomId))))){
  const teachers=l.teacherIds??(l.teacherId?[l.teacherId]:[])
  for(const teacherId of teachers){
   if(!data.teachers.some(t=>t.id===teacherId))poolIssues.push({severity:'error',message:`${l.label} ครูผู้สอนไม่อยู่ในรายชื่อบุคลากรที่ใช้งานได้`,step:l.activity?5:6})
   else if(data.plan.teacherIds&&!data.plan.teacherIds.includes(teacherId))poolIssues.push({severity:'error',message:`${l.label} ครูผู้สอนไม่ได้อยู่ในรายการครูที่เลือกจัดตาราง`,step:3})
  }
 }
 for(const id of scope)if(!lessons.some(l=>l.classroomId===id&&!l.activity)){const room=data.classrooms.find(c=>c.id===id);issues.push({severity:'error',message:`${room?`${room.level}/${room.name}`:'ห้องนี้'} ยังไม่มีรายวิชา`,step:3})}
 if(!data.timesConfigured)issues.push({severity:'error',message:'ยังไม่บันทึกเวลาคาบของโรงเรียน กรุณาตรวจและบันทึกเวลาเริ่ม–จบก่อนจัด',step:1})
 if(!data.blocksSupported)issues.push({severity:'error',message:'ยังไม่มีตารางครูไม่ว่าง กรุณาติดตั้ง migration 062 ก่อนตรวจและจัดตาราง',step:5})
 for(const l of lessons.filter(l=>scope.includes(l.classroomId)&&!l.activity&&l.roomName&&!data.plan.rules[l.id]?.roomId))issues.push({severity:'warning',message:`${l.label} ระบุชื่อสถานที่ แต่ยังไม่ได้เชื่อมรหัสห้องร่วม จึงยังไม่ตรวจสถานที่นี้ชน`,step:5})
 const timeError=validatePeriodTimes(data.periods);if(timeError)issues.push({severity:'error',message:timeError,step:1})
 if(!Array.isArray(data.plan.days)||!data.plan.days.length)issues.push({severity:'error',message:'ยังไม่ได้เลือกวันเรียน',step:1})
 if(!clear&&retained.some(s=>scope.includes(s.classroom_id)&&s.class_subject_id&&!s.locked))issues.push({severity:'warning',message:'กำลังเติมเฉพาะช่องว่าง คาบวิชาเดิมจะอยู่ที่เดิม หากต้องการจัดใหม่ให้เลือก “จัดวิชาที่ไม่ล็อกใหม่”',step:6})
 return {data,issues:[...issues.map(shiftManageStep),...poolIssues],retained,lessons,offerings,unlock}}
async function storeDraft(year:string,term:number,data:Preparation,rows:ScheduleSlot[],offerings:{id:string;classroom_id:string;evaluation_setting_id:string}[]=[],unlock:ScheduleSlot[]=[]){const s=await actor();const r=await createServerClient().from('schedule_drafts').insert({school_id:s.schoolId,academic_year_id:year,semester:term,actor_id:s.userId,base_hash:data.hash,before_rows:data.slots,after_rows:rows,offerings,unlock_cells:unlock}).select('id').single();fail(r.error);return r.data!.id as string}
export async function generate(year:string,term:number,scope:string[],clear:boolean){
 const {data,issues,retained,lessons,offerings,unlock}=await preflight(year,term,scope,clear)
 if(issues.some(i=>i.severity==='error'))return {status:'invalid' as const,issues,id:null,rows:[] as ScheduleSlot[],assigned:0,locked:0}
 const result=solvePlannedSchedule(lessons,retained.map(toPlanned),data.plan,data.periods,data.blocks)
 if(result.status!=='complete')return {...result,issues:[...issues,...result.issues.map(shiftManageStep)],id:null,rows:[] as ScheduleSlot[],assigned:0,locked:0}
 const covered=new Set(retained.map(s=>`${s.classroom_id}:${s.day_of_week}:${s.period}`))
 const rows=[...retained,...result.assignments.filter(a=>!covered.has(`${a.classroomId}:${a.day}:${a.period}`)).map(a=>({classroom_id:a.classroomId,academic_year_id:year,day_of_week:a.day,period:a.period,...lessonColumns(a.lessonId),note:null,locked:false}))]
 const verified=verifyCompleteSchedule(lessons,rows.map(toPlanned),data.plan.days,data.periods,data.blocks).map(shiftManageStep)
 if(verified.some(issue=>issue.severity==='error'))return {status:'invalid' as const,issues:[...issues,...verified],id:null,rows:[] as ScheduleSlot[],assigned:0,locked:0}
 const selected=new Set(scope),same=(a:ScheduleSlot,b:ScheduleSlot)=>a.classroom_id===b.classroom_id&&a.day_of_week===b.day_of_week&&a.period===b.period&&lessonKey(a)===lessonKey(b)&&a.note===b.note&&a.locked===b.locked
 const affectedRooms=[...new Set([...rows.filter(row=>!selected.has(row.classroom_id)&&!data.slots.some(previous=>same(previous,row))),...data.slots.filter(row=>!selected.has(row.classroom_id)&&!rows.some(next=>same(next,row)))].map(row=>row.classroom_id))]
 const usedLessons=new Set(rows.map(lessonKey))
 const preview:DraftPreview={lessons:lessons.filter(lesson=>usedLessons.has(lesson.id)).map(({id,name,code,teacherName,roomName,subjectId})=>({id,name,code,teacherName,roomName,subjectId})),classrooms:data.classrooms,periods:data.periods,days:data.plan.days}
 const id=await storeDraft(year,term,data,rows,offerings,unlock);return {status:'complete' as const,issues,id,rows,assigned:result.assignments.length,locked:unlock.length,affectedRooms,preview,summary:scope.map(roomId=>({roomId,target:lessons.filter(l=>l.classroomId===roomId).reduce((sum,l)=>sum+l.count,0),scheduled:rows.filter(row=>row.classroom_id===roomId&&lessonKey(row)).length})),activityLessons:lessons.filter(l=>l.activity).map(l=>({id:l.id,name:l.name,teacherName:l.teacherName,classroomId:l.classroomId,subjectId:l.subjectId}))}
}
export async function activityDraft(year:string,term:number,setting:string,rooms:string[],cells:{day:number;period:number}[],remove:boolean){
 const data=await preparation(year,term)
 if(!data.activities.some(a=>a.id===setting)||!rooms.length||rooms.some(id=>!data.classrooms.some(c=>c.id===id))||!cells.length)throw Error('กรุณาเลือกกิจกรรม ห้อง และคาบให้ครบ')
 if(new Set(rooms).size!==rooms.length||new Set(cells.map(c=>c.day+':'+c.period)).size!==cells.length)throw Error('พบห้องหรือคาบซ้ำ')
 if(cells.some(c=>!data.plan.days.includes(c.day)||!data.periods.some(t=>!t.is_break&&t.period===c.period)))throw Error('วันหรือคาบอยู่นอกเวลาเรียน')
 const offerings:{id:string;classroom_id:string;evaluation_setting_id:string}[]=[];const rows=[...data.slots],affected:ScheduleSlot[]=[],unlock:ScheduleSlot[]=[]
 for(const room of rooms){let lesson: {id:string;teacherId:string|null}|undefined=data.lessons.find(l=>l.activity&&l.classroomId===room&&l.subjectId===setting)
 if(!lesson&&!remove){const id=randomUUID();offerings.push({id,classroom_id:room,evaluation_setting_id:setting});lesson={id:'activity:'+id,teacherId:null}}

 for(const c of cells){const old=rows.find(s=>s.classroom_id===room&&s.day_of_week===c.day&&s.period===c.period)
 if(remove&&(!old||lessonKey(old)!==lesson?.id))continue
 if(!remove&&old&&lessonKey(old)===lesson?.id)continue
 if(old){affected.push(old);if(old.locked)unlock.push(old);rows.splice(rows.indexOf(old),1)}
 if(!remove&&lesson)rows.push({classroom_id:room,academic_year_id:year,day_of_week:c.day,period:c.period,...lessonColumns(lesson.id),note:null,locked:false})
 }}
 const activityLessons=[...data.lessons,...offerings.map(o=>({id:'activity:'+o.id,classroomId:o.classroom_id,teacherId:null,count:0,label:data.activities.find(a=>a.id===setting)?.label||'กิจกรรม',activity:true,teacherOptional:true}))].map(l=>({...l,count:l.activity?rows.filter(s=>lessonKey(s)===l.id).length:l.count}))
 const conflicts=checkPlanning(activityLessons,rows.map(toPlanned),data.plan.days,data.periods,data.blocks).filter(i=>['fixed_teacher_conflict','fixed_venue_conflict','fixed_outside','fixed_classroom_collision'].includes(i.code||''))
 if(conflicts.length)throw Error(conflicts.map(i=>i.message).join('\n'))
 const id=await storeDraft(year,term,data,rows,offerings,unlock)
 return {id,affected:affected.length,locked:unlock.length,rooms:rooms.length,cells:cells.length,remove}
}
export async function previewActivityTeam(year:string,term:number,hash:string,group:ActivityTeam,remove=false){
 const data=await preparation(year,term)
 if(data.hash!==hash)throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด')
 const old=data.plan.activityGroups?.find(g=>g.id===group.id)
 if(remove&&!old)throw Error('ไม่พบทีมกิจกรรม')
 if(!remove)validateActivityTeam(group,data.classrooms.map(c=>c.id),data.plan.teacherIds??data.teachers.map(t=>t.id),data.activities.map(a=>a.id),data.plan.days,data.periods)
 const target=remove?old!:group
 const overwrites=remove?[]:(data.plan.activityGroups||[]).filter(g=>g.id!==group.id&&g.settingId===group.settingId&&g.roomIds.some(id=>group.roomIds.includes(id))).map(g=>({rooms:g.roomIds.filter(id=>group.roomIds.includes(id)).map(roomId=>({roomId,previous:activityTeachers(g,roomId),next:activityTeachers(group,roomId),duplicates:activityTeachers(g,roomId).filter(id=>activityTeachers(group,roomId).includes(id))}))}))
 const overwriteRooms=new Set(overwrites.flatMap(g=>g.rooms.map(r=>r.roomId)))
 const affected=data.slots.filter(s=>{const l=data.lessons.find(l=>l.id===lessonKey(s));return !!old&&old.roomIds.includes(s.classroom_id)&&l?.activity&&l.subjectId===old.settingId||!remove&&target.roomIds.includes(s.classroom_id)&&(target.cells.some(c=>c.day===s.day_of_week&&c.period===s.period)||l?.activity&&l.subjectId===target.settingId)||!remove&&overwriteRooms.has(s.classroom_id)&&l?.activity&&l.subjectId===target.settingId})
 return {affected:affected.length,locked:affected.filter(s=>s.locked).length,overwrites,hash:data.hash}
}
export async function saveActivityTeam(year:string,term:number,hash:string,group:ActivityTeam,remove=false,unlock=false,overwrite=false){
 const impact=await previewActivityTeam(year,term,hash,group,remove)
 if(impact.locked&&!unlock)throw Error('ต้องยืนยันแทนที่คาบล็อกโดยเฉพาะ')
 if(impact.overwrites.length&&!overwrite)throw Error('มีกิจกรรมนี้จัดไว้ในห้องแล้ว กรุณายืนยันบันทึกทับก่อน')
 const session=await actor(),db=createServerClient()
 if(!remove&&!group.cells.length){
  const support=await db.from('evaluation_settings').select('schedule_weekly_periods').eq('id',group.settingId).eq('school_id',session.schoolId).maybeSingle()
  if(support.error&&/schedule_weekly_periods/.test(support.error.message))throw Error('กรุณาติดตั้ง migration 080_schedule_flexible_activities.sql ก่อนใช้กิจกรรมแบบจัดอัตโนมัติ')
  fail(support.error)
 }
 const r=await db.rpc('save_schedule_activity_team',{p_school:session.schoolId,p_year:year,p_term:term,p_hash:hash,p_group:group,p_remove:remove,p_unlock:unlock,p_overwrite:overwrite})
 if(r.error){console.error('[activity-team]',r.error);const message=r.error.message;throw Error(r.error.code==='PGRST202'?'ต้องติดตั้ง migration 067_schedule_activity_team_overwrite.sql ก่อนบันทึกทับทีมครูกิจกรรม':/^[\u0E00-\u0E7F]/.test(message)?message:`ระบบบันทึกกิจกรรมพบข้อผิดพลาด (${r.error.code||'ไม่ทราบรหัส'}) กรุณาแจ้งผู้ดูแลระบบ`)}
 return preparation(year,term)
}
export async function confirmDraft(id:string,unlock=false){const s=await actor();const r=await createServerClient().rpc('commit_schedule_draft',{p_id:id,p_school:s.schoolId,p_actor:s.userId,p_unlock:unlock});fail(r.error);return {committed:!!r.data}}
export async function cancelDraft(id:string){const s=await actor();const r=await createServerClient().from('schedule_drafts').update({cancelled_at:new Date().toISOString()}).eq('id',id).eq('school_id',s.schoolId).eq('actor_id',s.userId).is('committed_at',null).select('id').maybeSingle();fail(r.error);if(!r.data)throw Error('ฉบับร่างนี้ถูกบันทึกใช้แล้ว หรือไม่ใช่ฉบับร่างของคุณ กรุณาโหลดข้อมูลล่าสุด');return {ok:true}}
