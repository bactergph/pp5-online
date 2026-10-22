'use server'
import * as planning from '@/lib/schedule-preparation'
import { scheduleResult } from '@/lib/schedule-action-result'
import type { SchedulePlan } from '@/lib/schedule-planning'
import { importScheduleTeachers, importScheduleSubjects, removeScheduleSubjects, saveTeachingAssignments } from '@/lib/schedule-input-server'
import { saveTimetableRooms } from '@/lib/schedule-classrooms'
import type { SubjectInputRow } from '@/lib/schedule-input'
export async function saveScheduleInputTeachers(year:string,term:number,rows:{key:string;prefix:string;name:string;position:string}[]){return scheduleResult(()=>importScheduleTeachers(year,term,rows))}
export async function saveScheduleInputSubjects(year:string,term:number,hash:string,rows:SubjectInputRow[]){return scheduleResult(()=>importScheduleSubjects(year,term,hash,rows))}
export async function removeScheduleInputSubjects(year:string,term:number,hash:string,lessonIds:string[]){return scheduleResult(()=>removeScheduleSubjects(year,term,hash,lessonIds))}
export async function saveScheduleTeachingAssignments(year:string,term:number,hash:string,rows:{lessonId:string;teacherId:string}[]){return scheduleResult(()=>saveTeachingAssignments(year,term,hash,rows))}
export async function saveTimetableClassrooms(year:string,term:number,levels:{level:string;names:string[]}[]){return scheduleResult(()=>saveTimetableRooms(year,term,levels))}
export async function fetchPreparation(year:string,term:number){return scheduleResult(()=>planning.preparation(year,term))}
export async function fetchScheduleActivityCatalog(){return scheduleResult(()=>planning.activityCatalog())}
export async function saveScheduleActivityName(id:string|null,label:string,shortLabel:string){return scheduleResult(()=>planning.saveActivityName(id,label,shortLabel))}
export async function removeScheduleActivityName(id:string){return scheduleResult(()=>planning.removeActivityName(id))}
export async function savePreparation(year:string,term:number,hash:string,plan:SchedulePlan){return scheduleResult(()=>planning.savePlan(year,term,hash,plan))}
export async function checkPreparation(year:string,term:number,rooms:string[],clear:boolean){return scheduleResult(()=>planning.preflight(year,term,rooms,clear).then(r=>r.issues))}
export async function createScheduleDraft(year:string,term:number,rooms:string[],clear:boolean){return scheduleResult(()=>planning.generate(year,term,rooms,clear))}
export async function createActivityDraft(year:string,term:number,setting:string,rooms:string[],cells:{day:number;period:number}[],remove:boolean){return scheduleResult(()=>planning.activityDraft(year,term,setting,rooms,cells,remove))}
export async function confirmScheduleDraft(id:string,unlock=false){return scheduleResult(()=>planning.confirmDraft(id,unlock))}
export async function discardScheduleDraft(id:string){return scheduleResult(()=>planning.cancelDraft(id))}

import type { ActivityTeam } from '@/lib/schedule-activity-teams'
export async function previewScheduleActivityTeam(year:string,term:number,hash:string,group:ActivityTeam,remove=false){return scheduleResult(()=>planning.previewActivityTeam(year,term,hash,group,remove))}
export async function saveScheduleActivityTeam(year:string,term:number,hash:string,group:ActivityTeam,remove=false,unlock=false,overwrite=false){return scheduleResult(()=>planning.saveActivityTeam(year,term,hash,group,remove,unlock,overwrite))}
