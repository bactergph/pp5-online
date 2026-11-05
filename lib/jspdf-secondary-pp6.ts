import type { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ReportPayload, ReportStudent } from '@/lib/report-data-server'
import { secondaryTermSummary, secondaryEvaluationSummary, secondaryTermRanks, type AcademicTerm } from '@/lib/secondary-academic'
import { directorDisplayName, directorActingPositionLine } from '@/lib/school-director'

/** Deliberately separate from the primary annual report layout. Fonts are installed by the caller. */
export function drawSecondaryPp6(doc: jsPDF, data: ReportPayload, students: ReportStudent[], term: 0 | 1 | 2, showGrade: boolean, ranked = false, images: { logo: string | null; homeroom: string | null; director: string | null } = { logo: null, homeroom: null, director: null }) {
  const terms: AcademicTerm[] = term === 0 ? [1, 2] : [term]
  let pageCount = 0
  for (const student of students) for (const activeTerm of terms) {
    const summary = secondaryTermSummary(data, student.id, activeTerm)
    const chunks = Array.from({ length: Math.max(1, Math.ceil(summary.rows.length / 20)) }, (_, i) => summary.rows.slice(i * 20, (i + 1) * 20))
    for (let pageIndex = 0; pageIndex < chunks.length; pageIndex++) {
      if (pageCount++) doc.addPage()
      doc.setFont('THSarabunNew', 'bold').setFontSize(20).setTextColor(17, 24, 39)
      doc.text('รายงานผลการพัฒนาคุณภาพผู้เรียน (ปพ.6)', 105, 18, { align: 'center' })
      doc.setFont('THSarabunNew', 'normal').setFontSize(15)
      doc.text(`โรงเรียน${data.school?.name || '-'} · ระดับมัธยมศึกษา`, 105, 26, { align: 'center' })
      doc.text(`ภาคเรียนที่ ${activeTerm} ปีการศึกษา ${data.academicYear?.year_be || '-'}`, 105, 33, { align: 'center' })
      if (images.logo) doc.addImage(images.logo, 'JPEG', 15, 15, 14, 14)
      doc.text(`${student.prefix || ''}${student.first_name} ${student.last_name} · เลขประจำตัว ${student.student_code || '-'}`, 14, 43)
      doc.text(`ชั้น ${data.classroom?.level || '-'}/${data.classroom?.room || '-'} · เลขที่ ${student.student_number}`, 14, 50)
      autoTable(doc, {
        startY: 55, margin: { left: 14, right: 14 }, theme: 'grid',
        head: [['รหัสวิชา', 'รายวิชา', 'หน่วยกิต', 'คะแนน', 'ผลการเรียน']],
        body: chunks[pageIndex].length ? chunks[pageIndex].map(row => [row.subject.subject.code, row.subject.subject.name, row.subject.subject.credits ?? '-', row.total ?? '-', showGrade ? row.label : '-']) : [['-', 'ยังไม่มีรายวิชาในภาคเรียนนี้', '-', '-', '-']],
        styles: { font: 'THSarabunNew', fontSize: 13, cellPadding: 0.4, lineColor: [137, 150, 167], lineWidth: 0.15, textColor: [17, 24, 39], minCellHeight: 5.3 },
        headStyles: { fontStyle: 'bold', fillColor: [241, 244, 248], textColor: [17, 24, 39], halign: 'center' },
        columnStyles: { 0: { cellWidth: 29 }, 1: { cellWidth: 75 }, 2: { cellWidth: 26, halign: 'center' }, 3: { cellWidth: 26, halign: 'center' }, 4: { cellWidth: 26, halign: 'center' } },
      })
      const tableEnd = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
      if (pageIndex === chunks.length - 1) {
        let y = tableEnd + 9
        // Long subject names may grow the table. Never push the signature outside A4.
        if (y > 195) { doc.addPage(); y = 20 }
        doc.setFontSize(14)
        doc.text(`หน่วยกิตลงทะเบียน ${summary.registeredCredits}`, 14, y)
        doc.text(`หน่วยกิตที่ได้ ${showGrade ? summary.earnedCredits : '-'}`, 14, y + 7)
        doc.text(`GPA ภาคเรียนที่ ${activeTerm}: ${showGrade && summary.gpa !== null ? summary.gpa.toFixed(2) : 'รอสรุป'}`, 14, y + 14)
        doc.setFontSize(12)
        if (ranked && showGrade && summary.gpa !== null) doc.text(`อันดับที่ ${secondaryTermRanks(data, activeTerm).get(student.id) || '-'} ของห้อง`, 14, y + 21)
        if (summary.pendingCount || summary.missingCreditCount) doc.text([`รอผลการเรียน ${summary.pendingCount} วิชา`, `ยังไม่กำหนดหน่วยกิต ${summary.missingCreditCount} วิชา`], 14, y + 22)
        autoTable(doc, { startY: y - 5, margin: { left: 99, right: 14 }, tableWidth: 97, theme: 'grid', body: secondaryEvaluationSummary(data, student.id, activeTerm), styles: { font: 'THSarabunNew', fontSize: 12, cellPadding: 0.8, lineWidth: 0.15, lineColor: [137, 150, 167], textColor: [17, 24, 39] }, columnStyles: { 0: { cellWidth: 73 }, 1: { cellWidth: 24, halign: 'center' } } })
        const sigY = Math.max(y + 34, (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15)
        doc.setFontSize(14)
        for (const [x, name, role, signature] of [[58, data.classroom?.homeroom_teacher_name, 'ครูประจำชั้น', images.homeroom], [152, directorDisplayName(data.school), directorActingPositionLine(data.school) || 'ผู้อำนวยการโรงเรียน', images.director]] as const) {
          if (signature) doc.addImage(signature, 'PNG', x - 13, sigY - 9, 26, 8)
          doc.text('ลงชื่อ ........................................', x, sigY, { align: 'center' })
          doc.text(`(${name || '........................................'})`, x, sigY + 7, { align: 'center' })
          doc.text(role, x, sigY + 14, { align: 'center' })
        }
      }
      doc.setFontSize(11).text(`ภาคเรียนที่ ${activeTerm} · หน้า ${pageIndex + 1}/${chunks.length}`, 196, 286, { align: 'right' })
    }
  }
}
