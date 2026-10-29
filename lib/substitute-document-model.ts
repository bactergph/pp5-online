import type {SubstituteRosterEntry} from './substitute-roster'
import {substituteRosterSnapshot} from './substitute-roster'

export type SubstituteDocumentEntry=SubstituteRosterEntry&{absent_teacher_name?:string;substitute_teacher_name?:string}
export function substituteDocumentNames(entries:SubstituteDocumentEntry[],current:Record<string,string>={}){
  const names={...current}
  for(const row of entries){if(row.absent_teacher_name)names[row.absent_teacher_id]=row.absent_teacher_name;if(row.substitute_teacher_id&&row.substitute_teacher_name)names[row.substitute_teacher_id]=row.substitute_teacher_name}
  return names
}
export function prepareSubstituteDocument(rows:SubstituteRosterEntry[],previous:SubstituteDocumentEntry[],names:Record<string,string>):SubstituteDocumentEntry[]{
  if(!Array.isArray(rows)||rows.length>2000)throw Error('รายการเอกสารไม่ถูกต้อง')
  const ids=new Set<string>(),cells=new Set<string>()
  return rows.map(row=>{
    const old=previous.find(item=>item.id===row.id),allowed=(id:string|null,was?:string|null)=>!id||!!names[id]||id===was
    if(typeof row.id!=='string'||!row.id||row.id.length>100||ids.has(row.id)||!row.absent_teacher_id||!allowed(row.absent_teacher_id,old?.absent_teacher_id)||!allowed(row.substitute_teacher_id,old?.substitute_teacher_id)||row.substitute_teacher_id===row.absent_teacher_id)throw Error('กรุณาตรวจครูและรหัสรายการในเอกสาร')
    if(!Number.isInteger(row.period)||row.period<1||row.period>8||!row.subject_label?.trim()||row.subject_label.length>300||!row.leave_type?.trim()||row.leave_type.length>100||(row.note?.length||0)>1000||(row.room_label?.length||0)>300||row.conflict_details!==undefined&&(!Array.isArray(row.conflict_details)||row.conflict_details.some(value=>typeof value!=='string'||value.length>1000)||row.conflict_details.length>100))throw Error('กรุณาตรวจคาบ วิชา ประเภทการลา และหมายเหตุ')
    const key=[row.absent_teacher_id,row.period,row.classroom_id||row.room_label].join(':');if(cells.has(key))throw Error('มีรายการครู ห้อง และคาบซ้ำกัน');cells.add(key);ids.add(row.id)
    return {...substituteRosterSnapshot([row])[0],subject_label:row.subject_label.trim(),note:row.note?.trim()||null,absent_teacher_name:old?.absent_teacher_id===row.absent_teacher_id&&old.absent_teacher_name?old.absent_teacher_name:names[row.absent_teacher_id]||row.absent_teacher_id,substitute_teacher_name:row.substitute_teacher_id?(old?.substitute_teacher_id===row.substitute_teacher_id&&old.substitute_teacher_name?old.substitute_teacher_name:names[row.substitute_teacher_id]||row.substitute_teacher_id):undefined}
  })
}
