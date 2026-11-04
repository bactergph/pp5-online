'use client'
import {createContext,useContext,useLayoutEffect,type RefObject} from 'react'

export type PendingScheduleEditor={step:number;label:string;dirty:boolean;save:()=>Promise<boolean>}
export const SchedulePendingEdits=createContext<RefObject<Map<string,PendingScheduleEditor>>|null>(null)

/** Keep the latest unsaved form actions available to wizard navigation. */
export function usePendingScheduleEditor(id:string,editor:PendingScheduleEditor){
 const registry=useContext(SchedulePendingEdits)
 useLayoutEffect(()=>{
  if(!registry)return
  registry.current.set(id,editor)
  return()=>{registry.current.delete(id)}
 },[registry,id,editor])
}
