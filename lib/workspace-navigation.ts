type SearchNode={label:string;href?:string;children?:readonly SearchNode[]}
type SearchSection={label?:string;items:readonly SearchNode[]}
export type WorkspaceMenuResult={href:string;label:string;trail:string}
const normalized=(text:string)=>text.normalize('NFKC').toLocaleLowerCase('th').replace(/[^\p{L}\p{M}\p{N}]/gu,'')

/** Search only the role/education-filtered menu supplied by the caller. */
export function searchWorkspaceMenu(sections:readonly SearchSection[],query:string):WorkspaceMenuResult[]{
  const terms=query.trim().split(/\s+/).map(normalized).filter(Boolean)
  if(!terms.length)return []
  const results:WorkspaceMenuResult[]=[],seen=new Set<string>()
  function visit(node:SearchNode,parents:string[]){
    if(node.children?.length){for(const child of node.children)visit(child,[...parents,node.label]);return}
    if(!node.href||seen.has(node.href))return
    const haystack=normalized([...parents,node.label,node.href].join(' '))
    if(!terms.every(term=>haystack.includes(term)))return
    seen.add(node.href);results.push({href:node.href,label:node.label,trail:parents.filter(Boolean).join(' / ')})
  }
  for(const section of sections)for(const node of section.items)visit(node,section.label?[section.label]:[])
  return results
}

const routes:Record<string,[string,string]>={
  '/dashboard':['พื้นที่ทำงาน','หน้าหลัก'],
  '/settings/school':['ตั้งค่าโรงเรียน','ข้อมูลโรงเรียน'],
  '/settings/profile':['บัญชีผู้ใช้','ข้อมูลส่วนตัว'],
  '/settings/users':['ตั้งค่าโรงเรียน','บุคลากร'],
  '/settings/subjects':['ตั้งค่าโรงเรียน','รายวิชาและกลุ่มสาระ'],
  '/settings/class-subjects':['ตั้งค่าโรงเรียน','กำหนดวิชาเรียน'],
  '/settings/teacher-assignments':['ตั้งค่าโรงเรียน','มอบหมายครูผู้สอน'],
  '/settings/evaluation-settings':['ตั้งค่าโรงเรียน','รายการประเมิน'],
  '/classrooms':['ข้อมูลโรงเรียน','ชั้นเรียนและห้องเรียน'],
  '/students':['ข้อมูลโรงเรียน','นักเรียน'],
  '/scores':['วัดและประเมินผล','บันทึกคะแนน'],
  '/score-config':['วัดและประเมินผล','สัดส่วนคะแนน'],
  '/attendance':['งานสอนรายวิชา','เช็กเวลาเรียน'],
  '/schedules/class':['ตารางเรียน / ตารางสอน','ตารางเรียน'],
  '/schedules/class/manage':['ตารางเรียน / ตารางสอน','จัดการตารางเรียน'],
  '/schedules/teaching':['ตารางเรียน / ตารางสอน','ตารางสอน'],
  '/schedules/teaching/manage':['ตารางเรียน / ตารางสอน','จัดการตารางสอน'],
  '/schedules/substitute':['ตารางเรียน / ตารางสอน','ตารางสอนแทน'],
  '/schedules/period-times':['ตารางเรียน / ตารางสอน','เวลาคาบเรียน'],
  '/schedules/conflicts':['ตรวจสอบตาราง','ตรวจความขัดแย้ง'],
  '/schedules/workload':['พิมพ์เอกสาร','สรุปภาระสอน'],
  '/schedules/device':['จัดตารางสอนฟรี','ภาพรวมตาราง'],
  '/schedules/device/manage':['จัดตารางสอนฟรี','จัดการตารางเรียน'],
  '/schedules/device/class':['จัดตารางสอนฟรี','ตารางเรียน'],
  '/schedules/device/teaching':['จัดตารางสอนฟรี','ตารางสอน'],
  '/schedules/device/substitute':['จัดตารางสอนฟรี','ตารางสอนแทน'],
  '/schedules/device/period-times':['จัดตารางสอนฟรี','เวลาคาบเรียน'],
  '/schedules/device/conflicts':['จัดตารางสอนฟรี','ตรวจความขัดแย้ง'],
  '/schedules/device/workload':['จัดตารางสอนฟรี','สรุปภาระสอน'],
  '/schedules/device/print':['จัดตารางสอนฟรี','พิมพ์ตาราง'],
  '/export/schedules':['พิมพ์เอกสาร','พิมพ์ตารางเรียน / ตารางสอน'],
  '/export/qr-code':['พิมพ์เอกสาร','QR-Code'],
  '/classroom-admin':['งานประจำชั้น','ธุรการชั้นเรียน'],
  '/classroom-admin/sign':['เอกสารรอลงนาม','ธุรการเสนอเซ็น'],
  '/documents/sign':['เอกสารรอลงนาม','ปพ.5 เสนอเซ็น'],
  '/activity':['ระบบ','ประวัติการใช้งาน'],
  '/district/schools':['Super Admin','จัดการสมาชิก'],
  '/district':['Super Admin','ภาพรวมระบบ'],
}

export function workspacePageContext(pathname:string,schoolCode:string|null,fallback:string){
  const path=schoolCode&&pathname.startsWith(`/${schoolCode}/`)?pathname.slice(schoolCode.length+1):pathname
  const key=Object.keys(routes).sort((a,b)=>b.length-a.length).find(route=>path===route||path.startsWith(route+'/'))
  const match=key?routes[key]:undefined
  return {title:match?.[1]||fallback,section:match?.[0]||''}
}
