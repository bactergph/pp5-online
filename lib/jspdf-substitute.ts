import {levelPeriodTimes,hasPeriodProfiles} from '@/lib/schedule-period-profiles'
import {scheduleSchoolName} from '@/lib/schedule-school-name'
import {jsPDF} from 'jspdf'
import autoTable from 'jspdf-autotable'
import {applyThaiFonts,loadImageDataUrl} from '@/lib/jspdf-thai-font'
import {periodTimeLabel,type PeriodTimeRow} from '@/lib/schedule-helpers'
import type {SubstitutePdfWorkload} from '@/lib/substitute-roster'

export type SubstitutePdfInput={
  schoolName:string;logoUrl?:string|null;date:string;year:number;term:string
  academicHead:string;director:string;times:PeriodTimeRow[]
  teachers:{id:string;prefix:string;full_name:string}[];teacherNames?:Record<string,string>
  entries:{absent_teacher_id:string;period:number;room_label:string|null;subject_label:string|null;substitute_teacher_id:string|null;leave_type:string;note:string|null}[]
  workload:Record<string,SubstitutePdfWorkload>
}

/** A monochrome A4 form. Each absent teacher starts a new page, also allowing
 * a saved record to print individually or in a complete daily packet. */
export async function buildSubstitutePdf(input:SubstitutePdfInput){
  if(!input.entries.length)throw Error('ยังไม่มีรายการสอนแทนที่บันทึกไว้')
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true})
  doc.setLineHeightFactor(1.08)
  await applyThaiFonts(doc)
  const logo=await loadImageDataUrl(input.logoUrl)
  const names=new Map([...input.teachers.map(t=>[t.id,`${t.prefix||''}${t.full_name}`] as const),...Object.entries(input.teacherNames||{})])
  const date=new Intl.DateTimeFormat('th-TH',{dateStyle:'long',timeZone:'Asia/Bangkok'}).format(new Date(input.date+'T12:00:00+07:00'))
  const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight(),margin=14,content=width-margin*2
  const drawnHeaders=new Set<number>()
  const teacherIds=[...new Set(input.entries.map(entry=>entry.absent_teacher_id))].sort((a,b)=>(names.get(a)||'').localeCompare(names.get(b)||'','th'))
  const text=(value:string|string[],x:number,y:number,size=16,bold=false,center=false)=>{
    doc.setFont('THSarabunNew',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(0)
    doc.text(value,x,y,{align:center?'center':'left',lineHeightFactor:1.15})
  }
  for(const [index,teacherId] of teacherIds.entries()){
    if(index)doc.addPage()
    const clockLabel=(entry:SubstitutePdfInput['entries'][number])=>periodTimeLabel(levelPeriodTimes(input.times,entry.room_label||''),entry.period)
    const entries=input.entries.filter(entry=>entry.absent_teacher_id===teacherId).sort((a,b)=>(hasPeriodProfiles(input.times)?clockLabel(a).localeCompare(clockLabel(b)):a.period-b.period)||(a.room_label||'').localeCompare(b.room_label||'','th'))
    const coverIds=[...new Set(entries.flatMap(row=>row.substitute_teacher_id?[row.substitute_teacher_id]:[]))]
    const summary=coverIds.map(id=>{
      const load=input.workload[id]
      return [names.get(id)||'ไม่ระบุชื่อ',String(load.termAssignments),String(load.scheduled??'-'),String(load.substitutes),String(load.scheduled===null?'-':load.scheduled+load.substitutes)]
    })
    if(!summary.length)summary.push(['ยังไม่กำหนดครู','','','',''])
    const detailWidths=[10,23,17,41,42,23,21]
    const summaryX=margin+detailWidths.reduce((sum,value)=>sum+value,0)+5
    const widths=[...detailWidths,5,content-(summaryX-margin)-54,13,14,14,13]
    doc.setFont('THSarabunNew','bold');doc.setFontSize(18)
    const schoolLines=doc.splitTextToSize(scheduleSchoolName(input.schoolName),logo?content-34:content) as string[]
    doc.setFontSize(15)
    const teacherLines=doc.splitTextToSize(`ครูเจ้าของคาบ ${names.get(teacherId)||'ไม่ระบุชื่อ'}     ประเภทการลา ${[...new Set(entries.map(entry=>entry.leave_type))].join(', ')}`,content) as string[]
    const schoolY=16,titleY=schoolY+(schoolLines.length-1)*7+7
    const teacherY=titleY+16,tableTop=teacherY+teacherLines.length*6+4
    doc.setFont('THSarabunNew','normal');doc.setFontSize(15)
    const ownerLines=doc.splitTextToSize(`ลงชื่อครูเจ้าของคาบ ........................................................ (${names.get(teacherId)||'........................................'})`,content-6) as string[]
    doc.setFontSize(14)
    const signerLines=Math.max(...[input.academicHead,input.director].map(name=>(doc.splitTextToSize(`(${name||'........................................................'})`,content*0.45) as string[]).length))
    const signerLineHeight=14*1.15*25.4/72
    const signerOffset=ownerLines.length*6.2+6,signatureHeight=signerOffset+6+signerLines*signerLineHeight+9
    const signatureGap=10,bottomLimit=height-15,bodyBottom=bottomLimit-signatureHeight-signatureGap
    const drawHeader=()=>{
      const page=doc.getCurrentPageInfo().pageNumber
      if(drawnHeaders.has(page))return
      drawnHeaders.add(page)
      if(logo)doc.addImage(logo,'JPEG',margin,9,14,14)
      text(schoolLines,width/2,schoolY,18,true,true)
      text('บันทึกการจัดครูเข้าสอนแทน',width/2,titleY,18,true,true)
      text(`ประจำวันที่ ${date}     ภาคเรียนที่ ${input.term} ปีการศึกษา ${input.year}`,width/2,titleY+7,15,false,true)
      doc.setDrawColor(65);doc.setLineWidth(0.25);doc.line(margin,titleY+11,width-margin,titleY+11)
      text(teacherLines,margin,teacherY,15,true)
      text(`${entries.length} รายการ / ${new Set(entries.map(entry=>hasPeriodProfiles(input.times)?clockLabel(entry)||String(entry.period):String(entry.period))).size} ช่วงคาบ`,margin,tableTop-2,13)
      text('สรุปภาระงานวันนี้และยอดสอนแทนในเทอม',summaryX,tableTop-2,13,true)
    }
    drawHeader()
    autoTable(doc,{
      // Keep the table and its signatures together; continued pages repeat the header.
      startY:tableTop,margin:{top:tableTop,bottom:height-bodyBottom,left:margin,right:margin},
      head:[['คาบ','เวลา','ชั้น / ห้อง','รายวิชา / กิจกรรม','ครูผู้สอนแทน','หมายเหตุ','ลงชื่อ\nหลังสอน','','ครูสอนแทน','เทอมนี้\n(ครั้ง)','ตาม\nตาราง','สอน\nแทน','รวม\n(คาบ)']],
      body:entries.map((entry,i)=>[String(entry.period),clockLabel(entry).replaceAll('–','-'),entry.room_label||'-',entry.subject_label||'-',names.get(entry.substitute_teacher_id||'')||'ยังไม่กำหนดครู',(entry.note?.length||0)>180?`ดูหมายเหตุเพิ่มเติมข้อ ${i+1}`:entry.note||'','','',...(summary[i]??['','','','',''])]),
      theme:'grid',showHead:'everyPage',rowPageBreak:'avoid',
      styles:{font:'THSarabunNew',fontSize:entries.length>=8?13:14,textColor:0,fillColor:255,lineColor:80,lineWidth:0.18,cellPadding:{top:0.6,bottom:0.6,left:1.6,right:1.6},minCellHeight:entries.length>=8?9:10.5,valign:'middle',overflow:'linebreak'},
      headStyles:{fontStyle:'bold',fillColor:242,textColor:0,halign:'center'},alternateRowStyles:{fillColor:255},
      columnStyles:Object.fromEntries(widths.map((cellWidth,i)=>[i,{cellWidth,...i<3||i>=9?{halign:'center' as const}:{}}])),
      didParseCell:({cell,column,row,section})=>{
        if(column.index===7||column.index>=8&&section==='body'&&row.index>=summary.length){
          cell.styles.lineWidth=0
          cell.styles.fillColor=false
        }else if(column.index>=8){
          cell.styles.fontSize=13
          if(column.index===12){
            cell.styles.fontStyle='bold'
            if(section==='body')cell.styles.fillColor=248
          }
        }
      },
      didDrawPage:drawHeader,
    })
    const lastY=(doc as jsPDF&{lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY||tableTop
    let contentY=lastY
    for(const [i,entry] of entries.entries()){
      if((entry.note?.length||0)<=180)continue
      let notesY=contentY+8
      if(notesY+8>bodyBottom){doc.addPage();drawHeader();notesY=tableTop+4}
      text(`หมายเหตุเพิ่มเติมข้อ ${i+1} - คาบ ${entry.period} / ${entry.room_label||'-'}`,margin,notesY,14,true);notesY+=6
      doc.setFont('THSarabunNew','normal');doc.setFontSize(14)
      for(const line of doc.splitTextToSize(entry.note!,content) as string[]){
        if(notesY+2>bodyBottom){doc.addPage();drawHeader();notesY=tableTop+4}
        text(line,margin,notesY,14);contentY=notesY+2;notesY+=6
      }
    }
    let signatureY=contentY+signatureGap
    if(signatureY+signatureHeight>bottomLimit+0.01){doc.addPage();drawHeader();signatureY=tableTop+6}
    const signature=(center:number,y:number,name:string,role:string,maxWidth:number)=>{
      text('ลงชื่อ ........................................................',center,y,15,false,true)
      doc.setFontSize(14)
      const lines=doc.splitTextToSize(`(${name||'........................................................'})`,maxWidth) as string[]
      text(lines,center,y+6,14,false,true)
      const roleY=y+6+lines.length*signerLineHeight+1
      text(role,center,roleY,14,false,true);text(`วันที่ ${date}`,center,roleY+6,14,false,true)
    }
    text(ownerLines,margin+3,signatureY,15)
    signature(margin+content*0.25,signatureY+signerOffset,input.academicHead,'หัวหน้าวิชาการ',content*0.45)
    signature(margin+content*0.75,signatureY+signerOffset,input.director,'ผู้อำนวยการสถานศึกษา',content*0.45)
  }
  for(let page=1;page<=doc.getNumberOfPages();page++){
    doc.setPage(page)
    text('สอนแทน 1 ครั้ง = 1 รายการที่บันทึก    รวมวันนี้ = คาบตามตาราง + คาบสอนแทน',margin,height-10,11)
    text(`หน้า ${page} / ${doc.getNumberOfPages()}`,width-margin-15,height-8,11)
  }
  const teacherLabel=teacherIds.length===1?`-${names.get(teacherIds[0])||'ครูเจ้าของคาบ'}`:'-ทั้งหมด'
  return {blob:doc.output('blob'),fileName:`บันทึกการสอนแทน-${input.date}${teacherLabel}.pdf`.replace(/[\\/:*?"<>|]/g,'-')}
}
