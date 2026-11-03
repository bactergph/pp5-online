import {jsPDF} from 'jspdf'
import autoTable from 'jspdf-autotable'
import {applyThaiFonts} from '@/lib/jspdf-thai-font'
import type {LedgerSummary} from '@/lib/student-value-ledger'

export async function buildStudentLedgerPdf(input:{title:string;schoolName:string;classLabel:string;period:string;unit:string;summary:LedgerSummary}) {
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true});await applyThaiFonts(doc)
  const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight(),format=(value:number)=>value.toLocaleString('th-TH',{minimumFractionDigits:input.unit==='บาท'?2:0,maximumFractionDigits:input.unit==='บาท'?2:0})
  const text=(value:string,x:number,y:number,size=15,bold=false,align:'left'|'center'|'right'='left')=>{doc.setFont('THSarabunNew',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(0);doc.text(value,x,y,{align})}
  doc.setFont('THSarabunNew','bold');doc.setFontSize(17)
  const schoolLines=doc.splitTextToSize(input.schoolName,width-28) as string[],schoolHeight=schoolLines.length*6
  const top=schoolHeight+37
  const header=()=>{schoolLines.forEach((line,i)=>text(line,width/2,16+i*6,17,true,'center'));text(input.title,width/2,schoolHeight+19,18,true,'center');text(`ห้อง ${input.classLabel} · ${input.period}`,14,schoolHeight+28,13)}
  autoTable(doc,{startY:top,margin:{top,bottom:30,left:14,right:14},theme:'grid',head:[['อันดับ','เลขที่','ชื่อ-นามสกุล','วันที่บันทึก',`รวม (${input.unit})`]],body:input.summary.rows.map(row=>[row.rank??'-',row.number??'-',row.name,`${row.days} วัน`,format(row.total)]),styles:{font:'THSarabunNew',fontSize:14,cellPadding:2.1,lineColor:120,lineWidth:.15,textColor:0},headStyles:{fontStyle:'bold',fillColor:240,textColor:0},columnStyles:{0:{cellWidth:14,halign:'center'},1:{cellWidth:14,halign:'center'},2:{cellWidth:86},3:{cellWidth:27,halign:'center'},4:{cellWidth:41,halign:'right'}},rowPageBreak:'avoid',didDrawPage:header})
  const lastY=(doc as jsPDF&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY
  text(`รวมทั้งห้อง ${format(input.summary.total)} ${input.unit}`,width-14,lastY+10,16,true,'right')
  for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);text(`หน้า ${page} / ${doc.getNumberOfPages()}`,width-14,height-9,11,false,'right')}
  return {blob:doc.output('blob'),fileName:`${input.title}-${input.classLabel}-${input.period}.pdf`.replace(/[\\/:*?"<>|]/g,'-')}
}
