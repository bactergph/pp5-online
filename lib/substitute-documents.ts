import 'server-only'
import {randomUUID} from 'node:crypto'
import {getSession} from './session'
import {createServerClient} from './supabase'
import {SCHEDULE_EDIT_ROLES,SCHEDULE_DAYS} from './schedules'
import {loadSchedule} from './schedule-store'
import {substituteWeekday,substituteTimetableForDay} from './schedule-substitute'
import {substituteRosterSnapshot,type SubstituteRosterEntry,type SubstituteBusy} from './substitute-roster'
import {substituteDocumentNames,prepareSubstituteDocument,type SubstituteDocumentEntry} from './substitute-document-model'
import {pageSubstituteHistory,validateSubstituteHistoryScope,SUBSTITUTE_HISTORY_PAGE_DAYS,type SubstituteHistoryDay} from './substitute-history'

type Document={id:string;school_id:string;academic_year_id:string;semester:number;date:string;day_of_week:number;note:string|null;entries:SubstituteDocumentEntry[]}
async function actor(){const session=await getSession();if(!session?.schoolId||session.mustChangePassword||!SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number]))throw Error('ไม่มีสิทธิ์จัดการเอกสารสอนแทน');return {...session,schoolId:session.schoolId}}
function fail(error:{message:string}|null){if(error)throw Error(error.message)}
async function documentFor(id:string){const session=await actor(),db=createServerClient(),result=await db.from('substitute_documents').select('*').eq('id',id).eq('school_id',session.schoolId).maybeSingle();fail(result.error);if(!result.data)throw Error('ไม่พบเอกสารสอนแทนของโรงเรียนนี้');return {session,db,document:result.data as unknown as Document}}
export async function documentHistory(year:string,term=1,before?:string){
  const session=await actor(),db=createServerClient();validateSubstituteHistoryScope(year,term,before)
  const owner=await db.from('academic_years').select('id').eq('id',year).eq('school_id',session.schoolId).maybeSingle();fail(owner.error);if(!owner.data)throw Error('ไม่พบปีการศึกษาของโรงเรียนนี้')
  let query=db.from('substitute_documents').select('id,date,entries').eq('school_id',session.schoolId).eq('academic_year_id',year).eq('semester',term).neq('entries','[]').order('date',{ascending:false}).limit(SUBSTITUTE_HISTORY_PAGE_DAYS+1)
  if(before)query=query.lt('date',before)
  const result=await query;fail(result.error)
  const page=pageSubstituteHistory((result.data||[]) as unknown as SubstituteHistoryDay[],before)
  return {...page,teacher_names:substituteDocumentNames(page.days.flatMap(day=>day.entries))}
}
export async function documentDay(date:string,year:string,term=1){
  const session=await actor(),db=createServerClient(),day=substituteWeekday(date);validateSubstituteHistoryScope(year,term)
  const owner=await db.from('academic_years').select('id').eq('id',year).eq('school_id',session.schoolId).maybeSingle();fail(owner.error);if(!owner.data)throw Error('ไม่พบปีการศึกษาของโรงเรียนนี้')
  let result=await db.from('substitute_documents').select('*').eq('school_id',session.schoolId).eq('academic_year_id',year).eq('semester',term).eq('date',date).maybeSingle();fail(result.error)
  if(!result.data){const created=await db.from('substitute_documents').upsert({school_id:session.schoolId,academic_year_id:year,semester:term,date,day_of_week:day},{onConflict:'school_id,academic_year_id,semester,date',ignoreDuplicates:true});fail(created.error);result=await db.from('substitute_documents').select('*').eq('school_id',session.schoolId).eq('academic_year_id',year).eq('semester',term).eq('date',date).maybeSingle();fail(result.error)}
  const document=result.data as unknown as Document;if(!document)throw Error('เปิดเอกสารสอนแทนไม่สำเร็จ')
  const [users,rooms,blocks,schedule]=await Promise.all([
    db.from('users').select('id,prefix,full_name').eq('school_id',session.schoolId),
    db.from('classrooms').select('id,level,room').eq('school_id',session.schoolId).eq('academic_year_id',year),
    db.from('schedule_teacher_blocks').select('teacher_id,period').eq('school_id',session.schoolId).eq('academic_year_id',year).eq('semester',term).eq('day_of_week',day),
    loadSchedule(session.schoolId,year,term).then(data=>({data,error:''})).catch(()=>({data:null,error:'ตรวจตารางปกติไม่สำเร็จ ยังสามารถบันทึกเอกสารได้'})),
  ]);fail(users.error);fail(rooms.error)
  const names=substituteDocumentNames(document.entries,Object.fromEntries((users.data||[]).map(user=>[user.id,`${user.prefix||''}${user.full_name}`])))
  return {day:{id:document.id,date:document.date,day_of_week:day,note:document.note},day_label:SCHEDULE_DAYS.find(item=>item.value===day)?.label||'',teacher_names:names,classrooms:(rooms.data||[]).map(room=>({id:room.id,label:`${room.level}/${room.room}`})),entries:document.entries,
    busy:[...(blocks.data||[]).map(row=>({teacherId:row.teacher_id,period:row.period,kind:'block' as const})),...schedule.data?substituteTimetableForDay(schedule.data,day).flatMap(slot=>slot.teacherIds.map(teacherId=>({teacherId,period:slot.period,kind:slot.activity?'activity' as const:'lesson' as const,label:slot.subject_label,roomLabel:slot.room_label}))):[]] as SubstituteBusy[],availability_warning:schedule.error||(blocks.error?'ตรวจคาบว่างที่ล็อกไว้ไม่สำเร็จ':'')}
}
export async function saveDocument(id:string,expected:SubstituteRosterEntry[],rows:SubstituteRosterEntry[]){
  const {session,db,document}=await documentFor(id)
  if(!Array.isArray(rows)||rows.length>2000)throw Error('รายการเอกสารไม่ถูกต้อง')
  const users=await db.from('users').select('id,prefix,full_name').eq('school_id',session.schoolId);fail(users.error)
  if(rows.some(row=>typeof row.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)))throw Error('รหัสรายการเอกสารไม่ถูกต้อง')
  const names=Object.fromEntries((users.data||[]).map(user=>[user.id,`${user.prefix||''}${user.full_name}`]))
  const entries=prepareSubstituteDocument(rows,document.entries,names)
  const saved=await db.rpc('save_substitute_document',{p_school:session.schoolId,p_document:id,p_actor:session.userId,p_expected:substituteRosterSnapshot(expected),p_rows:entries});fail(saved.error);return {ok:true}
}
export async function deleteDocumentEntries(id:string,expected:SubstituteRosterEntry[],ids:string[]){
  const {session,db}=await documentFor(id)
  const result=await db.rpc('delete_substitute_document_entries',{p_school:session.schoolId,p_document:id,p_actor:session.userId,p_expected:substituteRosterSnapshot(expected),p_ids:ids});fail(result.error);return {deleted:ids.length}
}
type Change={id:string;substitute_teacher_id:string|null;leave_type:string;note:string|null}
export async function changeDocumentEntries(id:string,expected:Change[],changes:Change[],removeIds?:string[]){
  const {document}=await documentFor(id),actual=document.entries.map(({id,substitute_teacher_id,leave_type,note})=>({id,substitute_teacher_id,leave_type,note}))
  const sorted=(rows:Change[])=>JSON.stringify([...rows].sort((a,b)=>a.id.localeCompare(b.id)))
  if(sorted(actual)!==sorted(expected))throw Error('เอกสารถูกแก้ไขแล้ว กรุณาโหลดล่าสุด')
  if(removeIds)return deleteDocumentEntries(id,document.entries,removeIds)
  if(changes.length!==actual.length||new Set(changes.map(row=>row.id)).size!==actual.length||changes.some(row=>!actual.some(old=>old.id===row.id)))throw Error('รายการเอกสารไม่ตรงกัน')
  return saveDocument(id,document.entries,document.entries.map(row=>({...row,...changes.find(change=>change.id===row.id)})))
}
export async function changeDocumentTeacher(id:string,entryId:string|null,payload:Pick<SubstituteRosterEntry,'substitute_teacher_id'|'leave_type'|'note'>){const {document}=await documentFor(id);if(!entryId||!document.entries.some(row=>row.id===entryId))throw Error('ไม่พบรายการในเอกสาร');return saveDocument(id,document.entries,document.entries.map(row=>row.id===entryId?{...row,substitute_teacher_id:payload.substitute_teacher_id,leave_type:payload.leave_type,note:payload.note}:row))}
export async function importDocumentSlots(id:string,date:string,year:string,teacher:string,leaveType:string,term:number){
  const {session,document}=await documentFor(id);if(document.date!==date||document.academic_year_id!==year||document.semester!==term)throw Error('วันหรือภาคเรียนของเอกสารไม่ตรงกัน')
  const schedule=await loadSchedule(session.schoolId,year,term),slots=substituteTimetableForDay(schedule,substituteWeekday(date)).filter(slot=>slot.teacherIds.includes(teacher))
  const rows=slots.map(slot=>({id:randomUUID(),absent_teacher_id:teacher,period:slot.period,class_subject_id:slot.class_subject_id,classroom_id:slot.classroom_id,subject_label:slot.subject_label,room_label:slot.room_label,substitute_teacher_id:null,leave_type:leaveType,note:null}))
  await saveDocument(id,document.entries,[...document.entries.filter(row=>row.absent_teacher_id!==teacher),...rows]);return {ok:true,count:rows.length}
}
