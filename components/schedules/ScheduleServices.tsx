'use client'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
type Actions = typeof import('@/app/schedules/actions') & typeof import('@/app/schedules/planning-actions')
export type ScheduleOperations = Omit<Pick<Actions,
  'checkPreparation' |
  'clearScheduleScope' |
  'clearTeacherSchedule' |
  'confirmScheduleDraft' |
  'copyClassSchedule' |
  'createScheduleDraft' |
  'discardScheduleDraft' |
  'deleteSubstituteEntries' |
  'deleteSubstituteRosterEntries' |
  'editTeacherScheduleCell' |
  'fetchActivityLevelOptions' |
  'fetchClassScheduleBundle' |
  'fetchClassScheduleGrid' |
  'fetchClassScheduleSubjects' |
  'fetchPeriodTimes' |
  'fetchPreparation' |
  'fetchScheduleActivities' |
  'fetchScheduleClassrooms' |
  'fetchScheduleConflicts' |
  'fetchScheduleDays' |
  'fetchScheduleExportContext' |
  'fetchScheduleInit' |
  'fetchSchedulePdfGrids' |
  'fetchScheduleQuotas' |
  'fetchScheduleWorkload' |
  'fetchSubstituteDay' |
  'fetchSubstituteHistory' |
  'fetchSubstitutePdfContext' |
  'fetchTeacherAvailability' |
  'fetchTeachingScheduleGrid' |
  'getTeacherConflictAt' |
  'importSubstituteFromSchedule' |
  'loadSubstituteSlotsForTeacher' |
  'loadSubstituteRosterSlots' |
  'moveClassScheduleCell' |
  'previewScheduleActivityTeam' |
  'removeScheduleActivityName' |
  'removeScheduleInputSubjects' |
  'removeScheduleSubjectCell' |
  'saveActivityLevelSchedule' |
  'saveClassScheduleCell' |
  'savePeriodTimes' |
  'savePreparation' |
  'setJointTeachingScheduleCell' |
  'saveSchedulePlaces' |
  'saveScheduleActivity' |
  'saveScheduleActivityName' |
  'saveScheduleActivityTeam' |
  'saveScheduleInputSubjects' |
  'saveScheduleSubjectDetails' |
  'saveScheduleInputTeachers' |
  'saveScheduleTeachingAssignments' |
  'saveSubstituteDay' |
  'saveSubstituteRoster' |
  'saveTimetableClassrooms' |
  'setTeacherAvailabilityBlock' |
  'toggleScheduleCellLock'
>, 'createScheduleDraft'> & {
  createScheduleDraft:(...args:Parameters<Actions['createScheduleDraft']>)=>Promise<{data:import('./ScheduleReviewStep').ScheduleDraftView|null;error:string|null}>
  localTeachers?: {
    readonly limit:number
    save:(id:string,prefix:string,name:string,position:string)=>Promise<{error:string|null}>
    remove:(ids:string[])=>Promise<{error:string|null}>
  }
}
type Services = { operations: ScheduleOperations; local?: boolean; onGuard?:(state:{dirty:boolean;busy:boolean})=>void }
const ScheduleServices = createContext<Services | null>(null)
export function ScheduleServicesProvider({ operations, local = false, onGuard, children }: Services & { children: ReactNode }) {
  return <ScheduleServices.Provider value={{ operations, local, onGuard }}>{children}</ScheduleServices.Provider>
}
export function useScheduleServices() {
  const services = useContext(ScheduleServices)
  if (!services) throw Error('ไม่พบแหล่งข้อมูลจัดตาราง')
  return services
}
export function useScheduleOperations() { return useScheduleServices().operations }
export function useScheduleGuard(dirty:boolean,busy:boolean) {
  const {onGuard}=useScheduleServices()
  useEffect(()=>{onGuard?.({dirty,busy});return()=>onGuard?.({dirty:false,busy:false})},[onGuard,dirty,busy])
}
