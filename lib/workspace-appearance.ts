/** Shared visual identity only. Route access and menu visibility stay with the
 * membership/role modules; colours never decide what a user may open. */
import {isSchoolCodeSegment} from './school-path'
export type WorkspaceTone = 'blue' | 'teal' | 'violet' | 'amber' | 'slate' | 'navy'
const within=(path:string,prefix:string)=>path===prefix||path.startsWith(prefix+'/')

export function workspaceAppearance(pathname:string,schoolCode:string|null=null):{tone:WorkspaceTone;label:string} {
  let path=pathname.split(/[?#]/)[0].replace(/\/+$/,'')||'/'
  if(schoolCode&&path.startsWith('/'+schoolCode+'/'))path=path.slice(schoolCode.length+1)
  else if(!schoolCode){const parts=path.split('/');if(parts.length>2&&isSchoolCodeSegment(parts[1]))path='/'+parts.slice(2).join('/')}
  if(within(path,'/district'))return {tone:'navy',label:'ดูแลระบบ'}
  if(['/classroom-admin','/export/classroom-admin','/sign/classroom-admin'].some(prefix=>within(path,prefix)))return {tone:'amber',label:'ธุรการชั้นเรียน'}
  if(['/homeroom/pp6','/reports/pp6','/export/pp6','/sign/pp6','/reports/individual'].some(prefix=>within(path,prefix)))return {tone:'violet',label:'รายงาน ปพ.6'}
  if(['/schedules','/export/schedules'].some(prefix=>within(path,prefix)))return {tone:'blue',label:'ตารางเรียน / ตารางสอน'}
  if(['/scores','/score-config','/attendance','/evaluation','/homeroom/pp5','/reports/pp5','/reports/pp5-class','/reports/status','/reports/summary','/export/pp5-all','/export/pp5-subject','/export/grade-matrix','/export/sgs','/export/schoolmis','/documents/sign','/sign/pp5','/settings/subjects','/settings/class-subjects','/settings/teacher-assignments','/settings/score-config','/settings/evaluation-criteria','/settings/activities'].some(prefix=>within(path,prefix)))return {tone:'teal',label:'คะแนนและ ปพ.5'}
  if(within(path,'/export')||within(path,'/reports')||within(path,'/sign')||within(path,'/homeroom'))return {tone:'violet',label:'เอกสารและรายงาน'}
  if(within(path,'/dashboard'))return {tone:'blue',label:'พื้นที่ทำงาน'}
  return {tone:'slate',label:'ข้อมูลและตั้งค่า'}
}
