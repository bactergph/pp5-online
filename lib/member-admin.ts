import { membershipFromRow, membershipPackage, membershipToday, validMembershipDate, type MemberPackage } from './membership'

export type MemberSchool = {
  id:string; name:string; member_code?:string|null; district?:string|null; province?:string|null;
  membership_kind?:string|null; member_plan?:string|null; membership_started_on?:string|null;
  membership_expires_on?:string|null; membership_version?:number; free_schedule_teacher_limit?:number;
}
export type ManagedMember = {
  id:string; email:string; prefix:string; full_name:string; position:string|null;
  is_active:boolean; school_id:string|null; created_at:string|null; school?:MemberSchool|null;
}
export type MemberFilter = {query:string; account:'all'|'active'|'inactive'; package:'all'|MemberPackage; term:'all'|'expiring'|'expired'|'scheduled'; sort:'newest'|'oldest'|'name'|'expiry'}
export const MEMBER_PACKAGES = {free:'Free',pro:'Pro',school:'School'} as const
export function subscribedPackage(school?:MemberSchool|null):MemberPackage {
  return school?.membership_kind==='individual' ? school.member_plan==='pro'?'pro':'free' : 'school'
}
export function memberTerm(school?:MemberSchool|null, today=membershipToday()) {
  if(!school)return 'unassigned'
  const member=membershipFromRow(school,today)
  if(member.expired)return 'expired'
  if(member.scheduled)return 'scheduled'
  if(membershipPackage(member)==='free')return 'free'
  const end=school.membership_expires_on
  if(end&&validMembershipDate(end)&&(Date.parse(end)-Date.parse(today))/86400000<=30)return 'expiring'
  return 'active'
}
export function memberDate(value?:string|null, time=false) {
  if(!value||Number.isNaN(Date.parse(value)))return 'ไม่ระบุวันที่'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(value.length===10?value+'T12:00:00+07:00':value))
}
export function filterManagedMembers(members:ManagedMember[],filter:MemberFilter,today=membershipToday()) {
  const query=filter.query.trim().toLocaleLowerCase('th')
  return members.filter(member=>{
    const school=member.school
    return (!query||[member.prefix,member.full_name,member.email,school?.name,school?.member_code,school?.province].filter(Boolean).join(' ').toLocaleLowerCase('th').includes(query))
      &&(filter.account==='all'||member.is_active===(filter.account==='active'))
      &&(filter.package==='all'||!!school&&subscribedPackage(school)===filter.package)
      &&(filter.term==='all'||memberTerm(school,today)===filter.term)
  }).sort((a,b)=>{
    if(filter.sort==='name')return a.full_name.localeCompare(b.full_name,'th')||a.id.localeCompare(b.id)
    if(filter.sort==='expiry')return (a.school?.membership_expires_on||'9999').localeCompare(b.school?.membership_expires_on||'9999')||a.id.localeCompare(b.id)
    const aDate=Date.parse(a.created_at||'')||0,bDate=Date.parse(b.created_at||'')||0
    return (filter.sort==='newest'?bDate-aDate:aDate-bDate)||a.id.localeCompare(b.id)
  })
}
