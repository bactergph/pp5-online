type ObjectValue=Record<string,unknown>
const object=(value:unknown):value is ObjectValue=>!!value&&typeof value==='object'&&!Array.isArray(value)
export type DeviceDocumentStore=Record<string,unknown>

/** Separate persisted document records while retaining the existing backup format. */
export function splitDeviceDocuments(data:unknown){
  const documents:DeviceDocumentStore={}
  const workspace=(value:unknown,prefix:string):unknown=>{
    if(!object(value)||!object(value.terms))return value
    return {...value,terms:Object.fromEntries(Object.entries(value.terms).map(([term,plan])=>{
      if(!object(plan))return [term,plan]
      const {substitutes,...schedule}=plan
      const names=new Map(Array.isArray(plan.teachers)?plan.teachers.filter(object).map(teacher=>[teacher.id,teacher.name]):[])
      documents[`${prefix}:${term}`]=object(substitutes)?Object.fromEntries(Object.entries(substitutes).map(([date,rows])=>[date,Array.isArray(rows)?rows.map(row=>object(row)?{...row,absentTeacherName:row.absentTeacherName||names.get(row.absentTeacherId),substituteTeacherName:row.substituteTeacherName||names.get(row.substituteTeacherId)}:row):rows])):{}
      return [term,schedule]
    }))}
  }
  if(!object(data))return {schedule:data,documents}
  const schedule={...workspace(data,'current') as ObjectValue}
  if(object(data.archives))schedule.archives=Object.fromEntries(Object.entries(data.archives).map(([year,value])=>[year,workspace(value,`archive:${year}`)]))
  return {schedule,documents}
}

export function joinDeviceDocuments<T>(data:T,documents:DeviceDocumentStore={}):T{
  const workspace=(value:unknown,prefix:string):unknown=>{
    if(!object(value)||!object(value.terms))return value
    return {...value,terms:Object.fromEntries(Object.entries(value.terms).map(([term,plan])=>[term,object(plan)?{...plan,substitutes:documents[`${prefix}:${term}`]??plan.substitutes??{}}:plan]))}
  }
  if(!object(data))return data
  const combined={...workspace(data,'current') as ObjectValue}
  if(object(data.archives))combined.archives=Object.fromEntries(Object.entries(data.archives).map(([year,value])=>[year,workspace(value,`archive:${year}`)]))
  return combined as T
}
