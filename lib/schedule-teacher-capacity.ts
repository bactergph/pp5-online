/** Match the local importer's name reuse rule; the quota counts stored records. */
export function teacherImportCapacity(existingNames:string[],rows:string[][],limit:number) {
  const names=new Set(existingNames),current=existingNames.length
  let added=0,reused=0
  for(const row of rows){
    if(!row[1]?.trim())continue
    const name=`${row[0]?.trim()||''} ${row[1].trim()}`.trim()
    if(names.has(name))reused++
    else{names.add(name);added++}
  }
  const total=current+added
  return {limit,current,added,reused,total,remaining:Math.max(0,limit-current),over:Math.max(0,total-limit)}
}
