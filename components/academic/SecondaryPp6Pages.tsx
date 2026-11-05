import type { CSSProperties } from 'react'
import type { ReportPayload } from '@/lib/report-data-server'
import { secondaryTermSummary, secondaryEvaluationSummary, secondaryTermRanks, type AcademicTerm } from '@/lib/secondary-academic'
import './secondary-academic.css'

export default function SecondaryPp6Pages({ data, term, individual, selectedStudentId, showGrade, ranked, pageStyle }: {
  data: ReportPayload; term: 0 | 1 | 2; individual: boolean; selectedStudentId: string; showGrade: boolean; ranked: boolean; pageStyle: CSSProperties
}) {
  const terms: AcademicTerm[] = term === 0 ? [1, 2] : [term]
  const students = individual && selectedStudentId ? data.students.filter(student => student.id === selectedStudentId) : data.students
  return <>{students.flatMap(student => terms.flatMap(activeTerm => {
    const summary = secondaryTermSummary(data, student.id, activeTerm)
    const chunks = Array.from({ length: Math.max(1, Math.ceil(summary.rows.length / 20)) }, (_, i) => summary.rows.slice(i * 20, (i + 1) * 20))
    return chunks.map((rows, pageIndex) => <section className="report-page secondary-pp6" key={`${student.id}-${activeTerm}-${pageIndex}`} style={pageStyle}>
      <header><h1>รายงานผลการพัฒนาคุณภาพผู้เรียน (ปพ.6)</h1><p>โรงเรียน{data.school?.name} · ระดับมัธยมศึกษา</p><p>ภาคเรียนที่ {activeTerm} ปีการศึกษา {data.academicYear?.year_be}</p></header>
      <p className="mb-3">{student.prefix}{student.first_name} {student.last_name} · เลขประจำตัว {student.student_code || '-'} · ชั้น {data.classroom?.level}/{data.classroom?.room} · เลขที่ {student.student_number}</p>
      <table><colgroup><col style={{ width: '18%' }} /><col style={{ width: '40%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /></colgroup><thead><tr><th>รหัสวิชา</th><th>รายวิชา</th><th>หน่วยกิต</th><th>คะแนน</th><th>ผลการเรียน</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.subject.class_subject_id}><td>{row.subject.subject.code}</td><td>{row.subject.subject.name}<small style={{ display: 'block', color: '#596476' }}>{row.subject.subject.type}</small></td><td>{row.subject.subject.credits ?? '-'}</td><td>{row.total ?? '-'}</td><td>{showGrade ? row.label : '-'}</td></tr>)}
        {!rows.length && <tr><td colSpan={5}>ยังไม่มีรายวิชาในภาคเรียนนี้</td></tr>}
      </tbody></table>
      {pageIndex === chunks.length - 1 && <><div className="secondary-pp6-summary"><p>หน่วยกิตลงทะเบียน {summary.registeredCredits} · หน่วยกิตที่ได้ {showGrade ? summary.earnedCredits : '-'} · GPA ภาคเรียนที่ {activeTerm}: <b>{showGrade && summary.gpa !== null ? summary.gpa.toFixed(2) : 'รอสรุป'}</b></p>
        {ranked && showGrade && summary.gpa !== null && <p>อันดับที่ {secondaryTermRanks(data, activeTerm).get(student.id) || '-'} ของห้อง</p>}
        {summary.pendingCount > 0 && <p>มีผลการเรียนรอสรุป {summary.pendingCount} รายวิชา (ยังไม่สรุป GPA)</p>}
        {summary.missingCreditCount > 0 && <p>ยังไม่ได้กำหนดหน่วยกิต {summary.missingCreditCount} รายวิชา กรุณาตรวจข้อมูลรายวิชา</p>}
      </div><table><tbody>{secondaryEvaluationSummary(data, student.id, activeTerm).map(([label, result]) => <tr key={label}><td colSpan={4} style={{ textAlign: 'left' }}>{label}</td><td>{result}</td></tr>)}</tbody></table><div className="secondary-pp6-sign"><div>ลงชื่อ ........................................<br />({data.classroom?.homeroom_teacher_name || '........................................'})<br />ครูประจำชั้น</div><div>ลงชื่อ ........................................<br />({data.school?.director_name || '........................................'})<br />ผู้อำนวยการโรงเรียน</div></div></>}
      <p style={{ marginTop: 16, fontSize: 11, textAlign: 'right' }}>ภาคเรียนที่ {activeTerm} · หน้า {pageIndex + 1}/{chunks.length}</p>
    </section>)
  }))}</>
}
