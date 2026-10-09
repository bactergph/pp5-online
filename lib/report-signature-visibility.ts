import type { ReportPayload } from '@/app/(shell)/reports/actions'
export function reportWithSignatureVisibility(data:ReportPayload|null,visible:boolean):ReportPayload|null {
  if(!data || visible || !data.documentSignatures) return data
  return {...data,documentSignatures:{...data.documentSignatures,director_decision:data.documentSignatures.director_decision || (data.documentSignatures.director?'อนุมัติ':null),homeroom:null,teacher:null,subject_head:null,academic_head:null,measurement_head:null,vice_director:null,director:null}}
}
