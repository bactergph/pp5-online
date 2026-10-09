export type TermCalendar = {term1_start_date:string|null;term1_end_date:string|null;term2_start_date:string|null;term2_end_date:string|null}
export function isWithinTeachingTerm(date:string,year:TermCalendar|null) {
  if (!year) return false
  return [[year.term1_start_date,year.term1_end_date],[year.term2_start_date,year.term2_end_date]].some(([start,end])=>Boolean(start&&end&&start<=end&&date>=start&&date<=end))
}
export function termClosedDays(start:string,end:string,year:TermCalendar|null) {
  const days:{date:string;name:string}[]=[]
  const cursor=new Date(`${start}T00:00:00Z`)
  while (Number.isFinite(cursor.getTime())) {
    const date=cursor.toISOString().slice(0,10)
    if(date>end) break
    if(!isWithinTeachingTerm(date,year)) days.push({date,name:'นอกช่วงเปิดภาคเรียน'})
    cursor.setUTCDate(cursor.getUTCDate()+1)
  }
  return days
}
