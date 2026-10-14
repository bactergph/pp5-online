import 'server-only'
import { validateActivityTeam, type ActivityTeam } from './schedule-activity-teams'
import { randomUUID } from 'node:crypto'
import { getSession } from './session'
import { createServerClient } from './supabase'
import { SCHEDULE_EDIT_ROLES, isTimetableClassroom } from './schedules'
import { loadSchedule, loadScheduleConstraints, lessonKey, lessonColumns, type ScheduleSlot } from './schedule-store'
import { DEFAULT_PERIOD_TIMES, normalizePeriodTimes, validatePeriodTimes, type PeriodTimeRow } from './schedule-helpers'
import { emptyPlan, validatePlan, checkPlanning, solvePlannedSchedule, type SchedulePlan } from './schedule-planning'

async function actor(){const s=await getSession();if(!s?.schoolId||s.mustChangePassword||!SCHEDULE_EDIT_ROLES.includes(s.role as typeof SCHEDULE_EDIT_ROLES[number]))throw Error('ไม่มีสิทธิ์จัดตารางเรียน');return {...s,schoolId:s.schoolId}}
function fail(error:{message:string;code?:string}|null){if(error)throw Error(['42P01','PGRST202','PGRST205'].includes(error.code||'')?'กรุณาติดตั้ง migration 063_schedule_planning_drafts.sql ในสภาพแวดล้อมทดสอบก่อนใช้ขั้นเตรียมและฉบับร่าง':'ดำเนินการไม่สำเร็จ: '+error.message)}
async function snapshot(school:string,year:string,term:number){const r=await createServerClient().rpc('schedule_snapshot',{p_school:school,p_year:year,p_term:term});fail(r.error);return r.data as string}
export async function preparation(year:string,term:number){
 const session=await actor(),db=createServerClient(),hash=await snapshot(session.schoolId,year,term)
 const [data,constraints,config,times,activities,teachers]=await Promise.all([
 loadSchedule(session.schoolId,year,term),loadScheduleConstraints(session.schoolId,year,term),
 db.from('schedule_plans').select('config').eq('school_id',session.schoolId).eq('academic_year_id',year).eq('semester',term).maybeSingle(),
 db.from('school_period_times').select('period,label,start_time,end_time,is_break,sort_order').eq('school_id',session.schoolId).order('sort_order'),
 db.from('evaluation_settings').select('id,label').eq('school_id',session.schoolId).eq('kind','activities').eq('is_active',true).order('sort_order'),
 db.from('users').select('id,prefix,full_name,position').eq('school_id',session.schoolId).or('is_active.eq.true,email.like.pending-%').in('role',['teacher','academic_head','deputy_principal','principal','admin']).order('full_name').limit(1000)])
 for(const r of [config,times,activities,teachers])fail(r.error)
 if(hash!==await snapshot(session.schoolId,year,term))throw Error('ข้อมูลเปลี่ยนระหว่างโหลด กรุณาลองใหม่')
 const plan=(config.data?.config||emptyPlan()) as SchedulePlan
 const periods=normalizePeriodTimes((times.data?.length?times.data:DEFAULT_PERIOD_TIMES) as PeriodTimeRow[])
 const lessons=data.lessons.map(l=>({...l,...plan.rules[l.id],spread:plan.rules[l.id]?.spread??true,roomName:plan.rooms.find(r=>r.id===plan.rules[l.id]?.roomId)?.name||l.roomName,source:plan.rules[l.id]?'กำหนดภาระสอนสำหรับภาคเรียนนี้':`${l.sourceHours||0} ชั่วโมงเทียบรายปี ÷ 40 สัปดาห์`}))
 // Keep all existing slots/lessons for outside-scope teacher and venue conflicts,
 // but only offer non-kindergarten classrooms for import, activities and generation.
 return {hash,plan,periods,timesConfigured:!!times.data?.length,classrooms:data.classrooms.filter(c=>isTimetableClassroom(c.level)),lessons,slots:data.slots,blocks:constraints.blocks,activities:activities.data||[],teachers:teachers.data||[]}
}
export type Preparation = Awaited<ReturnType<typeof preparation>>
export async function activityCatalog(){
 const session=await actor(),result=await createServerClient().from('evaluation_settings').select('id,label').eq('school_id',session.schoolId).eq('kind','activities').eq('is_active',true).order('sort_order')
 if(result.error)throw Error('โหลดรายการกิจกรรมไม่สำเร็จ กรุณาลองใหม่')
 return result.data||[]
}
export async function savePlan(year:string,term:number,hash:string,plan:SchedulePlan){
 const s=await actor(),current=await preparation(year,term);validatePlan(plan,current.lessons.filter(l=>!l.activity).map(l=>l.id))
 if(JSON.stringify(plan.activityGroups||[])!==JSON.stringify(current.plan.activityGroups||[]))throw Error('แก้ทีมครูผ่านเมนูกิจกรรมและครูผู้รับผิดชอบ')
 if(plan.teacherIds?.some(id=>!current.teachers.some(t=>t.id===id)))throw Error('ครูที่เลือกไม่ได้อยู่ในโรงเรียนนี้')
 const lessons=current.lessons.map(l=>({...l,...plan.rules[l.id],count:l.activity?current.slots.filter(r=>lessonKey(r)===l.id).length:(plan.rules[l.id]?.count??l.count)}))
 const issues=checkPlanning(lessons,current.slots.map(toPlanned),plan.days,current.periods,current.blocks).filter(i=>/คาบเดิม|ชน|นอกวัน/.test(i.message))
 if(issues.length)throw Error(issues.map(i=>i.message).join('\n'))
 const r=await createServerClient().rpc('save_schedule_plan',{p_school:s.schoolId,p_year:year,p_term:term,p_hash:hash,p_config:plan});fail(r.error)
 return preparation(year,term)
}
const toPlanned=(s:ScheduleSlot)=>({classroomId:s.classroom_id,lessonId:lessonKey(s),day:s.day_of_week,period:s.period})
function input(data:Preparation,scope:string[],clear:boolean){
 if(!scope.length||scope.some(id=>!data.classrooms.some(c=>c.id===id)))throw Error('กรุณาเลือกห้องประถมหรือมัธยมในปีการศึกษานี้ การจัดตารางนี้ไม่รวมอนุบาล')
 const retained=data.slots.filter(s=>!scope.includes(s.classroom_id)||s.locked||!!s.activity_id||!clear)
 const lessons=data.lessons.map(l=>{const active=scope.includes(l.classroomId)&&!l.activity;const count=active?l.count:retained.filter(s=>lessonKey(s)===l.id).length;return {...l,count,fixedOnly:!active,activity:l.activity||!active,pattern:active?l.pattern:undefined,teacherOptional:!active||l.teacherOptional}})
 return {retained,lessons}
}
export async function preflight(year:string,term:number,scope:string[],clear:boolean){const data=await preparation(year,term),{retained,lessons}=input(data,scope,clear);const issues=checkPlanning(lessons,retained.map(toPlanned),data.plan.days,data.periods,data.blocks)
 for(const l of lessons.filter(l=>!l.activity&&l.count>0))if(data.plan.teacherIds&&!data.plan.teacherIds.includes(l.teacherId||''))issues.push({severity:'error',message:`${l.label} ครูผู้สอนไม่ได้อยู่ในรายการครูที่เลือกจัดตาราง`,step:2})
 for(const id of scope)if(!lessons.some(l=>l.classroomId===id&&!l.activity))issues.push({severity:'error',message:`${data.classrooms.find(c=>c.id===id)?.level}/${data.classrooms.find(c=>c.id===id)?.room} ยังไม่มีรายวิชา`,step:3})
 if(!data.timesConfigured)issues.push({severity:'error',message:'ยังไม่บันทึกเวลาคาบของโรงเรียน กรุณาตรวจและบันทึกเวลาเริ่ม–จบก่อนจัด',step:1})
 for(const l of lessons.filter(l=>scope.includes(l.classroomId)&&!l.activity&&l.roomName&&!data.plan.rules[l.id]?.roomId))issues.push({severity:'warning',message:`${l.label} ระบุชื่อสถานที่ แต่ยังไม่ได้เชื่อมรหัสห้องร่วม จึงยังไม่ตรวจสถานที่นี้ชน`,step:5})
 const timeError=validatePeriodTimes(data.periods);if(timeError)issues.push({severity:'error',message:timeError,step:1})
 return {data,issues,retained,lessons}}
async function storeDraft(year:string,term:number,data:Preparation,rows:ScheduleSlot[],offerings:{id:string;classroom_id:string;evaluation_setting_id:string}[]=[],unlock:ScheduleSlot[]=[]){const s=await actor();const r=await createServerClient().from('schedule_drafts').insert({school_id:s.schoolId,academic_year_id:year,semester:term,actor_id:s.userId,base_hash:data.hash,before_rows:data.slots,after_rows:rows,offerings,unlock_cells:unlock}).select('id').single();fail(r.error);return r.data!.id as string}
export async function generate(year:string,term:number,scope:string[],clear:boolean){
 const {data,issues,retained,lessons}=await preflight(year,term,scope,clear)
 if(issues.some(i=>i.severity==='error'))return {status:'invalid' as const,issues,id:null,rows:[] as ScheduleSlot[],assigned:0}
 const result=solvePlannedSchedule(lessons,retained.map(toPlanned),data.plan,data.periods,data.blocks)
 if(result.status!=='complete')return {...result,id:null,rows:[] as ScheduleSlot[],assigned:0}
 const rows=[...retained,...result.assignments.map(a=>({classroom_id:a.classroomId,academic_year_id:year,day_of_week:a.day,period:a.period,...lessonColumns(a.lessonId),note:null,locked:false}))]
 const id=await storeDraft(year,term,data,rows);return {status:'complete' as const,issues:result.issues,id,rows,assigned:result.assignments.length}
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
 const conflicts=checkPlanning(activityLessons,rows.map(toPlanned),data.plan.days,data.periods,data.blocks).filter(i=>/ครูชน|สถานที่ชน|นอกวัน|คาบนักเรียนซ้ำ/.test(i.message))
 if(conflicts.length)throw Error(conflicts.map(i=>i.message).join('\n'))
 const id=await storeDraft(year,term,data,rows,offerings,unlock)
 return {id,affected:affected.length,locked:unlock.length,rooms:rooms.length,cells:cells.length,remove}
}
export async function confirmDraft(id:string,unlock=false){const s=await actor();const r=await createServerClient().rpc('commit_schedule_draft',{p_id:id,p_school:s.schoolId,p_actor:s.userId,p_unlock:unlock});fail(r.error);return {committed:!!r.data}}
export async function cancelDraft(id:string){const s=await actor();const r=await createServerClient().from('schedule_drafts').update({cancelled_at:new Date().toISOString()}).eq('id',id).eq('school_id',s.schoolId).eq('actor_id',s.userId).is('committed_at',null);fail(r.error);return {ok:true}}

export async function previewActivityTeam(year:string,term:number,hash:string,group:ActivityTeam,remove=false){
 const data=await preparation(year,term)
 if(data.hash!==hash)throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด')
 const old=data.plan.activityGroups?.find(g=>g.id===group.id)
 if(remove&&!old)throw Error('ไม่พบทีมกิจกรรม')
 if(!remove)validateActivityTeam(group,data.classrooms.map(c=>c.id),data.plan.teacherIds??data.teachers.map(t=>t.id),data.activities.map(a=>a.id),data.plan.days,data.periods)
 const target=remove?old!:group
 const affected=data.slots.filter(s=>{const l=data.lessons.find(l=>l.id===lessonKey(s));return !!old&&old.roomIds.includes(s.classroom_id)&&l?.activity&&l.subjectId===old.settingId||!remove&&target.roomIds.includes(s.classroom_id)&&(target.cells.some(c=>c.day===s.day_of_week&&c.period===s.period)||l?.activity&&l.subjectId===target.settingId)})
 return {affected:affected.length,locked:affected.filter(s=>s.locked).length,hash:data.hash}
}
export async function saveActivityTeam(year:string,term:number,hash:string,group:ActivityTeam,remove=false,unlock=false){
 const impact=await previewActivityTeam(year,term,hash,group,remove)
 if(impact.locked&&!unlock)throw Error('ต้องยืนยันแทนที่คาบล็อกโดยเฉพาะ')
 const session=await actor(),r=await createServerClient().rpc('save_schedule_activity_team',{p_school:session.schoolId,p_year:year,p_term:term,p_hash:hash,p_group:group,p_remove:remove,p_unlock:unlock})
 if(r.error){console.error('[activity-team]',r.error);const message=r.error.message;throw Error(r.error.code==='PGRST202'?'ต้องติดตั้ง migration 065_schedule_activity_teams.sql ก่อนบันทึกทีมครูกิจกรรม':/^[\u0E00-\u0E7F]/.test(message)?message:`ระบบบันทึกกิจกรรมพบข้อผิดพลาด (${r.error.code||'ไม่ทราบรหัส'}) กรุณาแจ้งผู้ดูแลระบบ`)}
 return preparation(year,term)
}
