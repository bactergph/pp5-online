'use client'
import {useEffect,useState} from 'react'
import {fetchClassroomAdminExportContext,fetchClassroomAdminExportData,fetchClassroomAdminExportSignatures} from '@/app/(shell)/export/classroom-admin/actions'
import SharedReportHtmlPreview from '@/components/reports/SharedReportHtmlPreview'
import type {ClassroomAdminBookMonthData,ClassroomAdminBookPdfInput} from '@/lib/jspdf-classroom-admin-book'
import type {ClassroomAdminPrintLayouts} from '@/lib/classroom-admin-print-layout'
type Props={classroomId:string;yearId:string;monthKey:string;term:1|2;report:ClassroomAdminBookPdfInput['reports'][number];layouts:ClassroomAdminPrintLayouts;draft?:ClassroomAdminBookMonthData;scale?:number;revision?:string}
export default function ClassroomDocumentHtmlPreview({classroomId,yearId,monthKey,term,report,layouts,draft,scale=100,revision}:Props){
 const [input,setInput]=useState<ClassroomAdminBookPdfInput|null>(null),[error,setError]=useState('')
 useEffect(()=>{let active=true;const month=Number(monthKey.split('-')[1]);void Promise.all([fetchClassroomAdminExportContext(),fetchClassroomAdminExportData(classroomId,yearId,monthKey,term),fetchClassroomAdminExportSignatures(classroomId,yearId,term,[month])]).then(([ctx,data,sig])=>{if(!active)return;if(data.error||!data.classroom||!data.academicYear)throw new Error(data.error||'โหลดข้อมูลเอกสารไม่สำเร็จ');const room=data.classroom;setInput({schoolName:ctx.school?.name||'ชื่อโรงเรียน',schoolLogoUrl:ctx.school?.logo_url,yearBe:data.academicYear.year_be,classroomLabel:`${room.level}/${room.room}`,term,monthKeyBase:monthKey,months:[month],reports:[report],dataByMonth:{[month]:data},signaturesByMonth:sig.signaturesByMonth||{},homeroomTeacherName:ctx.teacherNameById?.[room.homeroom_teacher_id||'']||ctx.teacherNameById?.[room.homeroom_teacher2_id||'']||'ยังไม่กำหนด',directorName:ctx.directorName||'ยังไม่กำหนด',actingDirectorPosition:ctx.actingDirectorPosition});setError('')}).catch(e=>{if(active){setInput(null);setError(e instanceof Error?e.message:'โหลดตัวอย่างไม่สำเร็จ')}});return()=>{active=false}
 },[classroomId,yearId,monthKey,term,report,revision])
 if(error)return <div role="alert">{error}</div>
 if(!input)return <div role="status">กำลังโหลดตัวอย่าง…</div>
 const month=input.months[0]
 return <SharedReportHtmlPreview kind="classroom" scale={scale} options={{...input,monthlyLayout:layouts.monthly,standardLayout:layouts.standard,dataByMonth:{[month]:{...input.dataByMonth[month],...draft}}}}/>
}
