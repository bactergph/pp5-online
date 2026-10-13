import 'server-only'
import { createServerClient } from './supabase'
import { loadSchedule,loadScheduleConstraints,lessonKey,type ScheduleSlot } from './schedule-store'
import { solvePlannedSchedule,type SchedulePlan } from './schedule-planning'
import { DEFAULT_PERIOD_TIMES,type PeriodTimeRow } from './schedule-helpers'
/** Verify that edited partial double/triple blocks can still be completed; other rooms stay fixed. */
export async function validateManualPlan(school:string,year:string,term:number,before:ScheduleSlot[],after:ScheduleSlot[]){
 const db=createServerClient(),result=await db.from('schedule_plans').select('config').eq('school_id',school).eq('academic_year_id',year).eq('semester',term).maybeSingle()
 if(result.error){if(['42P01','PGRST205'].includes(result.error.code))return;throw Error('ตรวจเงื่อนไขตารางไม่สำเร็จ: '+result.error.message)}
 const plan=result.data?.config as SchedulePlan|undefined;if(!plan)return
 const affected=Object.keys(plan.rules).filter(id=>plan.rules[id].pattern.some(n=>n>1)&&JSON.stringify(before.filter(s=>s.class_subject_id===id))!==JSON.stringify(after.filter(s=>s.class_subject_id===id)))
 if(!affected.length)return
 const [data,constraints,times]=await Promise.all([loadSchedule(school,year,term),loadScheduleConstraints(school,year,term),db.from('school_period_times').select('period,label,start_time,end_time,is_break,sort_order').eq('school_id',school).order('sort_order')]);if(times.error)throw Error('ตรวจเวลาคาบไม่สำเร็จ')
 for(const id of affected){const lessons=data.lessons.map(l=>{const rule=plan.rules[l.id],active=l.id===id,count=active?rule.count:after.filter(s=>lessonKey(s)===l.id).length;return {...l,roomId:rule?.roomId,count,pattern:active?rule.pattern:undefined,activity:!active||l.activity,fixedOnly:!active,teacherOptional:!active||l.teacherOptional}})
 const r=solvePlannedSchedule(lessons,after.map(s=>({classroomId:s.classroom_id,lessonId:lessonKey(s),day:s.day_of_week,period:s.period})),plan,(times.data?.length?times.data:DEFAULT_PERIOD_TIMES) as PeriodTimeRow[],constraints.blocks,30000,1500)
 if(r.status!=='complete')throw Error(r.status==='timeout'?'ตรวจรูปแบบคาบยังไม่เสร็จ กรุณาลองตำแหน่งอื่น':'คาบนี้ทำให้รูปแบบคาบที่กำหนดจัดต่อไม่ได้ กรุณาตรวจคาบคู่และช่วงพัก')
 }
}
