import type {PeriodTimeRow} from './schedule-helpers'

export type SubstituteRosterEntry = {
  id:string; absent_teacher_id:string; period:number; class_subject_id:string|null; classroom_id:string|null
  subject_label:string|null; room_label:string|null; substitute_teacher_id:string|null; leave_type:string; note:string|null
  override_conflicts?:boolean; conflict_details?:string[]; conflict_confirmed_at?:string|null
}
export type SubstituteBusy = {teacherId:string;period:number;kind?:'lesson'|'activity'|'block';label?:string;roomLabel?:string}
export const SUBSTITUTE_LEAVE_TYPES=['ลาป่วย','ลากิจ','ลาคลอด','ไปราชการ','อื่นๆ']

export function substituteConflicts(teacherId:string,entry:SubstituteRosterEntry,entries:SubstituteRosterEntry[],busy:SubstituteBusy[],names:Record<string,string>={}) {
  const reasons:string[]=[]
  if(teacherId===entry.absent_teacher_id)reasons.push('เป็นครูเจ้าของคาบ ไม่สามารถสอนแทนตนเอง')
  const leave=[...new Set(entries.filter(row=>row.absent_teacher_id===teacherId).map(row=>row.leave_type))]
  if(leave.length)reasons.push('มีรายการลาในวันนี้: '+leave.join(', '))
  for(const row of busy.filter(row=>row.teacherId===teacherId&&row.period===entry.period)) {
    reasons.push(row.kind==='block'?'ล็อกไม่ว่าง'+(row.label?' · '+row.label:''):
      (row.kind==='activity'?'กิจกรรม':'ติดสอน')+' · '+[row.label||'ตามตารางเรียน',row.roomLabel].filter(Boolean).join(' · '))
  }
  for(const row of entries.filter(row=>row.id!==entry.id&&row.period===entry.period&&row.substitute_teacher_id===teacherId)) {
    reasons.push('สอนแทน'+(names[row.absent_teacher_id]?' '+names[row.absent_teacher_id]:'')+' · '+[row.room_label,row.subject_label].filter(Boolean).join(' · '))
  }
  return [...new Set(reasons)].sort((a,b)=>a.localeCompare(b,'th'))
}

/** A large school's picker must not scan its entire timetable for every option. */
export function indexSubstituteAvailability(entries:SubstituteRosterEntry[],busy:SubstituteBusy[],names:Record<string,string>) {
  const absences=new Map<string,SubstituteRosterEntry[]>(),assigned=new Map<string,SubstituteRosterEntry[]>(),occupied=new Map<string,SubstituteBusy[]>(),cache=new Map<string,string[]>()
  for(const row of entries){absences.set(row.absent_teacher_id,[...absences.get(row.absent_teacher_id)||[],row]);if(row.substitute_teacher_id){const key=row.substitute_teacher_id+':'+row.period;assigned.set(key,[...assigned.get(key)||[],row])}}
  for(const row of busy){const key=row.teacherId+':'+row.period;occupied.set(key,[...occupied.get(key)||[],row])}
  return (teacherId:string,entry:SubstituteRosterEntry)=>{
    const key=teacherId+':'+entry.period,cacheKey=key+':'+entry.id
    if(!cache.has(cacheKey)){const relevant=[...new Map([...(absences.get(teacherId)||[]),...(assigned.get(key)||[])].map(row=>[row.id,row])).values()];cache.set(cacheKey,substituteConflicts(teacherId,entry,relevant,occupied.get(key)||[],names))}
    return cache.get(cacheKey)!
  }
}

/** Only editable values participate in optimistic concurrency, never timestamps. */
export function substituteRosterSnapshot(entries:SubstituteRosterEntry[]) {
  return entries.map(row=>({id:row.id,absent_teacher_id:row.absent_teacher_id,period:row.period,
    class_subject_id:row.class_subject_id||null,classroom_id:row.classroom_id||null,
    subject_label:row.subject_label||null,room_label:row.room_label||null,
    substitute_teacher_id:row.substitute_teacher_id||null,leave_type:row.leave_type,note:row.note||null,
    override_conflicts:row.override_conflicts===true,conflict_details:row.conflict_details||[]}))
    .sort((a,b)=>a.id.localeCompare(b.id))
}

export function validateSubstituteRoster(entries:SubstituteRosterEntry[],teachers:Set<string>,rooms:Set<string>,periods:Set<number>) {
  if(!Array.isArray(entries)||entries.length>2000)throw Error('รายการสอนแทนไม่ถูกต้องหรือมากเกินไป')
  const ids=new Set<string>(),cells=new Set<string>()
  for(const row of entries) {
    if(!row.id||ids.has(row.id))throw Error('รหัสรายการสอนแทนซ้ำ')
    ids.add(row.id)
    if(!teachers.has(row.absent_teacher_id)||row.substitute_teacher_id&&!teachers.has(row.substitute_teacher_id))throw Error('ไม่พบครูในโรงเรียนนี้')
    if(row.substitute_teacher_id===row.absent_teacher_id)throw Error('ครูไม่สามารถสอนแทนตนเอง')
    if(!row.classroom_id||!rooms.has(row.classroom_id))throw Error('กรุณาเลือกห้องเรียนที่ถูกต้อง')
    if(!Number.isInteger(row.period)||!periods.has(row.period))throw Error('คาบสอนแทนไม่ใช่คาบเรียนที่กำหนดไว้')
    if(!row.subject_label?.trim()||row.subject_label.length>300||!row.leave_type?.trim()||row.leave_type.length>100||(row.note?.length||0)>1000)throw Error('กรุณาระบุวิชาและประเภทการลาให้ครบ หมายเหตุไม่เกิน 1,000 ตัวอักษร')
    const cell=[row.absent_teacher_id,row.period,row.classroom_id].join(':')
    if(cells.has(cell))throw Error('ครูที่ลา ห้อง และคาบซ้ำกัน กรุณาแก้หรือลบรายการซ้ำ')
    cells.add(cell)
  }
}

export function validateSubstituteAcknowledgements(entries:SubstituteRosterEntry[],busy:SubstituteBusy[],names:Record<string,string>) {
  return entries.map(row=>{
    const reasons=row.substitute_teacher_id?substituteConflicts(row.substitute_teacher_id,row,entries,busy,names):[]
    if(reasons.length&&(!row.override_conflicts||JSON.stringify([...row.conflict_details||[]].sort())!==JSON.stringify([...reasons].sort()))) {
      throw Error(`ข้อมูลเวลาว่างเปลี่ยนหรือยังไม่ได้ยืนยัน: คาบ ${row.period} · ${row.room_label||''} · ${reasons.join('; ')} กรุณาตรวจข้อมูลล่าสุดและยืนยันอีกครั้ง`)
    }
    return {...row,override_conflicts:reasons.length>0,conflict_details:reasons}
  })
}

export function substituteMinutes(entries:SubstituteRosterEntry[],periods:PeriodTimeRow[]) {
  return [...new Set(entries.map(row=>row.period))].reduce((total,period)=>{
    const time=periods.find(row=>!row.is_break&&row.period===period)
    if(!time)return total
    const minutes=(text:string)=>{const [h,m]=text.split(':').map(Number);return h*60+m}
    const span=minutes(time.end_time)-minutes(time.start_time)
    return total+(Number.isFinite(span)&&span>0?span:0)
  },0)
}
