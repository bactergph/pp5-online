export type StudentValueKind = 'saving' | 'merit'
export type LedgerStudent = { id:string; student_number:number; prefix:string|null; first_name:string; last_name:string }
export type LedgerRecord = { student_id:string; date:string; value:number|string|null }
export type LedgerSummaryRow = { studentId:string; number:number|null; name:string; total:number; days:number; rank:number|null; former:boolean }
export type LedgerSummary = { rows:LedgerSummaryRow[]; total:number; participantCount:number; studentCount:number; months:{month:string;total:number}[] }
export const isStudentValueKind = (value:unknown):value is StudentValueKind => value==='saving'||value==='merit'
export function validLedgerValue(kind:StudentValueKind,value:unknown):value is number {
  return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=99999999&&(kind==='merit'?Number.isInteger(value):Math.abs(value*100-Math.round(value*100))<0.000001)
}
export function ledgerDateRange(yearBe:number,scope:'month'|'year',monthKey:string) {
  if(!Number.isInteger(yearBe)||yearBe<2400||yearBe>2800)throw Error('ปีการศึกษาไม่ถูกต้อง')
  const year=yearBe-543,start=`${year}-05-01`,end=`${year+1}-04-30`
  if(scope==='year')return {start,end}
  if(scope!=='month'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey))throw Error('เดือนที่เลือกไม่ถูกต้อง')
  const first=monthKey+'-01'
  if(first<start||first>end)throw Error('เดือนที่เลือกไม่อยู่ในปีการศึกษานี้')
  const [y,m]=monthKey.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate()
  return {start:first,end:`${monthKey}-${String(last).padStart(2,'0')}`}
}
/** Sum persisted values (including closed dates), using integer satang for money. */
export function summarizeStudentValues(students:readonly LedgerStudent[],records:readonly LedgerRecord[],kind:StudentValueKind):LedgerSummary {
  const scale=kind==='saving'?100:1,amounts=new Map<string,number>(),dates=new Map<string,Set<string>>(),months=new Map<string,number>()
  const unique=new Map(records.map(row=>[row.student_id+'|'+row.date,row]))
  for(const row of unique.values()){
    const value=Number(row.value??0)
    if(!Number.isFinite(value))throw Error('พบยอดที่ไม่ใช่ตัวเลข กรุณาตรวจสอบข้อมูลที่บันทึก')
    const amount=Math.round(value*scale)
    amounts.set(row.student_id,(amounts.get(row.student_id)||0)+amount)
    const month=row.date.slice(0,7);months.set(month,(months.get(month)||0)+amount)
    if(amount!==0){const set=dates.get(row.student_id)||new Set<string>();set.add(row.date);dates.set(row.student_id,set)}
  }
  const roster=new Map(students.map(student=>[student.id,student]))
  const ids=new Set([...roster.keys(),...amounts.keys()])
  const rows:LedgerSummaryRow[]=[...ids].map(id=>{const student=roster.get(id);return {studentId:id,number:student?.student_number??null,name:student?`${student.prefix?.trim()||''}${student.first_name} ${student.last_name}`.trim():'นักเรียนเดิมที่ไม่อยู่ในรายชื่อห้องปัจจุบัน',total:(amounts.get(id)||0)/scale,days:dates.get(id)?.size||0,rank:null,former:!student}})
  rows.sort((a,b)=>b.total-a.total||(a.number??Infinity)-(b.number??Infinity)||a.name.localeCompare(b.name,'th')||a.studentId.localeCompare(b.studentId))
  let rank=0,last:number|undefined
  rows.forEach((row,i)=>{if(row.total>0){if(row.total!==last)rank=i+1;row.rank=rank;last=row.total}})
  return {rows,total:[...amounts.values()].reduce((sum,value)=>sum+value,0)/scale,participantCount:rows.filter(row=>row.total>0).length,studentCount:students.length,months:[...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,total])=>({month,total:total/scale}))}
}
