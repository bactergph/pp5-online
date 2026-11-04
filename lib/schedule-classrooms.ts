import 'server-only'
import {createServerClient} from './supabase'
import {getSession} from './session'
import {readMembership} from './member-plan'
import {serverRoomLimit} from './membership'
import {SCHEDULE_EDIT_ROLES,isTimetableClassroom} from './schedules'
import {preparation} from './schedule-preparation'

export function normalizeRoomNames(names:string[]){
 const cleaned=names.map(name=>name.trim())
 if(cleaned.length>30)throw Error('เปิดได้ไม่เกิน 30 ห้องต่อชั้น')
 if(cleaned.some(name=>!name||name.length>20||/[\\/]/.test(name)))throw Error('ชื่อห้องต้องมี 1–20 ตัวอักษร และห้ามมี /')
 if(new Set(cleaned.map(name=>name.toLowerCase())).size!==cleaned.length)throw Error('ชื่อห้องในชั้นเดียวกันซ้ำ')
 return cleaned
}

/** Enable/reopen the original room rows; never delete academic or timetable data. */
export async function saveTimetableRooms(year:string,term:number,levels:{level:string;names:string[]}[]){
 const session=await getSession()
 if(!session?.schoolId||session.mustChangePassword||!SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number]))throw Error('ไม่มีสิทธิ์จัดตารางเรียน')
 if(term!==1&&term!==2)throw Error('ภาคเรียนไม่ถูกต้อง')
 const current=await preparation(year,term)
 const normalized=levels.map(row=>({level:row.level.trim(),names:normalizeRoomNames(row.names||[])}))
 if(!normalized.length||normalized.some(row=>!isTimetableClassroom(row.level))||new Set(normalized.map(row=>row.level)).size!==normalized.length)throw Error('ระดับชั้นไม่ถูกต้อง')
 const result=await createServerClient().rpc('save_timetable_classrooms',{p_school:session.schoolId,p_year:year,p_term:term,p_hash:current.hash,p_levels:normalized,p_limit:serverRoomLimit(await readMembership(session.schoolId))})
 if(result.error)throw Error(['PGRST202','42883'].includes(result.error.code)?'กรุณาติดตั้ง SQL 106 ก่อนเปิดหรือปิดห้อง':result.error.message)
 return result.data as {created:number;deleted:number}
}
