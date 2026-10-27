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
  '/settings':['ตั้งค่าโรงเรียน','ตั้งค่า'],
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
  '/export/sgs':['Export เอกสาร','ส่งคะแนนเข้า SGS'],
  '/export/qr-code':['พิมพ์เอกสาร','QR-Code'],
  '/classroom-admin':['งานประจำชั้น','ธุรการชั้นเรียน'],
  '/classroom-admin/sign':['เอกสารรอลงนาม','ธุรการเสนอเซ็น'],
  '/documents/sign':['เอกสารรอลงนาม','ปพ.5 เสนอเซ็น'],
  '/activity':['ระบบ','ประวัติการใช้งาน'],
  '/district/schools':['Super Admin','จัดการสมาชิก'],
  '/district':['Super Admin','ภาพรวมระบบ'],
  '/classrooms/homeroom':['ข้อมูลโรงเรียน','กำหนดครูประจำชั้น'],
  '/settings/academic-year':['ตั้งค่าโรงเรียน','ปีการศึกษาและภาคเรียน'],
  '/settings/holidays':['ตั้งค่าโรงเรียน','วันหยุดและปฏิทินเรียน'],
  '/settings/import-dmc':['ข้อมูลโรงเรียน','นำเข้านักเรียนจาก DMC'],
  '/settings/periods':['ตั้งค่าโรงเรียน','กำหนดคาบเรียน'],
  '/settings/score-config':['วัดและประเมินผล','สัดส่วนคะแนน'],
  '/settings/evaluation-criteria':['ตั้งค่าโรงเรียน','เกณฑ์การประเมิน'],
  '/settings/activities':['ตั้งค่าโรงเรียน','กิจกรรมพัฒนาผู้เรียน'],
  '/evaluation/activities':['วัดและประเมินผล','ประเมินกิจกรรมพัฒนาผู้เรียน'],
  '/evaluation/character':['วัดและประเมินผล','คุณลักษณะอันพึงประสงค์'],
  '/evaluation/competency':['วัดและประเมินผล','สมรรถนะสำคัญ'],
  '/evaluation/reading':['วัดและประเมินผล','อ่าน คิดวิเคราะห์ และเขียน'],
  '/evaluation/summary/activities':['สรุปผลการประเมิน','สรุปกิจกรรมพัฒนาผู้เรียน'],
  '/evaluation/summary/reading':['สรุปผลการประเมิน','สรุปอ่าน คิดวิเคราะห์ และเขียน'],
  '/homeroom/pp5':['งานประจำชั้น','ปพ.5 ห้องประจำชั้น'],
  '/homeroom/pp6':['งานประจำชั้น','ปพ.6 ห้องประจำชั้น'],
  '/reports/pp5':['รายงาน ปพ.5','ปพ.5 รายวิชา'],
  '/reports/pp5/approved':['รายงาน ปพ.5','ปพ.5 รายวิชาที่ลงนามแล้ว'],
  '/reports/pp5-class':['รายงาน ปพ.5','ปพ.5 รวมชั้นเรียน'],
  '/reports/pp5-class/approved':['รายงาน ปพ.5','ปพ.5 รวมชั้นเรียนที่ลงนามแล้ว'],
  '/reports/pp6':['รายงาน ปพ.6','ปพ.6 นักเรียน'],
  '/reports/pp6/approved':['รายงาน ปพ.6','ปพ.6 ที่ลงนามแล้ว'],
  '/reports/individual':['รายงาน','รายงานรายบุคคล'],
  '/reports/summary':['รายงาน','สรุปผลการเรียน'],
  '/reports/status':['รายงาน','สถานะการบันทึกข้อมูล'],
  '/classroom-admin/daily-attendance':['ธุรการชั้นเรียน','เวลาเรียนรายวัน'],
  '/classroom-admin/milk':['ธุรการชั้นเรียน','บันทึกการดื่มนม'],
  '/classroom-admin/lunch':['ธุรการชั้นเรียน','อาหารกลางวัน'],
  '/classroom-admin/saving':['ธุรการชั้นเรียน','เงินออมนักเรียน'],
  '/classroom-admin/health':['ธุรการชั้นเรียน','ตรวจสุขภาพ'],
  '/classroom-admin/weight-height':['ธุรการชั้นเรียน','น้ำหนักและส่วนสูง'],
  '/classroom-admin/brushing':['ธุรการชั้นเรียน','บันทึกการแปรงฟัน'],
  '/classroom-admin/cleaning':['ธุรการชั้นเรียน','ตรวจความสะอาด'],
  '/classroom-admin/approved':['ธุรการชั้นเรียน','เอกสารธุรการที่ลงนามแล้ว'],
  '/sign/pp5':['เอกสารรอลงนาม','ลงนาม ปพ.5'],
  '/sign/pp6':['เอกสารรอลงนาม','ลงนาม ปพ.6'],
  '/sign/classroom-admin':['เอกสารรอลงนาม','ลงนามธุรการชั้นเรียน'],
  '/export/grade-matrix':['Export เอกสาร','ส่งออกเมตริกซ์เกรด'],
  '/export/name-list':['Export เอกสาร','พิมพ์รายชื่อนักเรียน'],
  '/export/pp5-all':['Export เอกสาร','ส่งออก ปพ.5 รวมชั้นเรียน'],
  '/export/pp5-subject':['Export เอกสาร','ส่งออก ปพ.5 รายวิชา'],
  '/export/pp6':['Export เอกสาร','ส่งออก ปพ.6'],
  '/export/classroom-admin':['Export เอกสาร','พิมพ์ธุรการชั้นเรียน'],
  '/export/schoolmis':['Export เอกสาร','ส่งออก SchoolMIS'],
  '/district/admins':['Super Admin','ผู้ดูแลโรงเรียน'],
  '/district/free-ad':['Super Admin','โฆษณาจัดตารางฟรี'],
  '/district/holidays':['Super Admin','วันหยุดกลาง'],
  '/district/overview':['Super Admin','ภาพรวมระบบ'],
  '/district/settings':['Super Admin','ตั้งค่าระบบ'],
  '/district/subjects':['Super Admin','รายวิชากลาง'],
  '/district/term-calendars':['Super Admin','ปฏิทินภาคเรียน'],
  '/district/school-cleanup':['Super Admin','จัดการข้อมูลโรงเรียน'],
  '/district/results':['Super Admin','ผลการเรียนของโรงเรียน'],
  '/district/results/attendance':['Super Admin','สรุปเวลาเรียน'],
  '/district/results/scores':['Super Admin','สรุปคะแนน'],
  '/district/reports/export':['Super Admin','ส่งออกรายงานเขต'],
}

export function workspacePageContext(pathname:string,schoolCode:string|null,fallback:string){
  const path=schoolCode&&pathname.startsWith(`/${schoolCode}/`)?pathname.slice(schoolCode.length+1):pathname
  const key=Object.keys(routes).sort((a,b)=>b.length-a.length).find(route=>path===route||path.startsWith(route+'/'))
  const match=key?routes[key]:undefined
  return {title:match?.[1]||fallback,section:match?.[0]||''}
}
