'use client'

import {useEffect} from 'react'

const wrappers='.table-scroll,.table-wrap,.table-container,.table-responsive,.thai-table-wrap,.eval-scroll,.eval-table-wrap,.hourly-table-wrap,.member-table-wrap,.period-table-wrap,.prep-scroll,.sub-roster-table-wrap,.sub-history-table-wrap'
const paper='.report-preview,.paper-preview,.pdf-preview,.pp5-paper,.pp6-paper,.classroom-export-sheet,.ca-layout-live-preview,[data-print-document]'

/** Progressive enhancement of existing scroll containers only. No cell/content
 * changes, event interception, resizing, navigation or data mutations. */
export default function WorkspaceTableAccess(){
  useEffect(()=>{
    const root=document.getElementById('workspace-main')
    if(!root)return
    let frame=0,disposed=false
    const managed=new Map<HTMLElement,Map<string,{previous:string|null;written:string}>>()
    const watched=new Map<HTMLElement,HTMLTableElement>()
    const restore=(element:HTMLElement)=>{
      const original=managed.get(element)
      if(!original)return
      for(const [name,value]of original){if(element.getAttribute(name)!==value.written)continue;if(value.previous===null)element.removeAttribute(name);else element.setAttribute(name,value.previous)}
      managed.delete(element)
    }
    const refresh=()=>{
      frame=0;if(disposed)return
      const candidates=new Set(root.querySelectorAll<HTMLElement>(wrappers))
      for(const [element,table]of watched)if(!candidates.has(element)||element.closest(paper)||!element.isConnected||!element.contains(table)||table.closest(wrappers)!==element){restore(element);observer.unobserve(element);observer.unobserve(table);watched.delete(element)}
      for(const element of candidates){
        const table=element.querySelector('table')
        if(!table||element.closest(paper))continue
        // A table belongs to the closest scroll wrapper, not to every ancestor.
        if(table.closest(wrappers)!==element)continue
        if(!watched.has(element)){watched.set(element,table);observer.observe(element);observer.observe(table)}
        const overflow=element.clientWidth>0&&element.scrollWidth>element.clientWidth+2
        if(!overflow){restore(element);continue}
        if(!managed.has(element)){
          const attributes=new Map<string,{previous:string|null;written:string}>()
          const write=(name:string,value:string,onlyIfMissing=true)=>{if(onlyIfMissing&&element.hasAttribute(name))return;attributes.set(name,{previous:element.getAttribute(name),written:value});element.setAttribute(name,value)}
          managed.set(element,attributes)
          write('tabindex','0');write('role','region')
          write('aria-label','ตารางข้อมูล เลื่อนซ้าย–ขวาเพื่อดูคอลัมน์ทั้งหมด')
          write('data-ui-table-scroll','true',false)
        }
      }
    }
    const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(refresh)}
    const observer=new ResizeObserver(schedule)
    const mutations=new MutationObserver(schedule)
    mutations.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','open']})
    window.addEventListener('resize',schedule);schedule()
    return()=>{disposed=true;cancelAnimationFrame(frame);mutations.disconnect();window.removeEventListener('resize',schedule);for(const element of managed.keys())restore(element);observer.disconnect()}
  },[])
  return null
}
