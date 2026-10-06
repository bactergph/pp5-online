/* eslint-disable @typescript-eslint/no-require-imports -- Standalone regression runner. */
const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict');
const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',src)(name=>name.startsWith('@/')?load(name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name)+'.ts'):require(name),m,m.exports);return m.exports}
(async()=>{
 const {jsPDF}=require('jspdf');const {buildPp5ClassPdfBlob}=load('lib/jspdf-pp5-class.ts');
 const data=(()=>{const students = Array.from({ length: 12 }, (_, i) => ({
  id: 's'+(i+1), student_number: i+1, student_code: '6700'+String(i+1).padStart(2,'0'),
  national_id: null, prefix: 'เด็กชาย', first_name: 'สมชาย'+(i+1), last_name: 'ใจดี', status: 'active',
}))
const classSubjectId = 'cs1'
const data = {
  school: { id:'sch1', name:'โรงเรียนบ้านโพธิ์น้อยหนองสิม', logo_url:null, stamp_url:null, department:'สพฐ.', area_office:'สพป.ขอนแก่น เขต 5', district:'บ้านไผ่', province:'ขอนแก่น', director_name:'นายทดสอบ', vice_director_name:null, acting_director:null, acting_director_position:null, phone:null, document_prefix:null, code:'phonoi', program_name:null },
  academicYear: { id:'y1', year_be:2568, term1_start_date:'2025-05-16', term1_end_date:'2025-10-10', term2_start_date:'2025-11-01', term2_end_date:'2026-03-31' },
  classroom: { id:'c1', level:'ป.4', room:'1', academic_year_id:'y1', school_id:'sch1', homeroom_teacher_name:'ครูประจำชั้น ทดสอบ' },
  students,
  subjects: [],
  scores: students.map(s => ({ student_id:s.id, class_subject_id:classSubjectId, term:1, unit_scores:{1:4,2:5,3:4,4:5,5:4}, between_total:22, midterm_score:18, final_score:25, term_total:65, year_total:65, grade:3, result:'เรียน' })),
  scoreConfigs: [{ class_subject_id:classSubjectId, term:1, unit_count:5, between_scores:[5,5,5,5,5], midterm_max:20, final_max:30, total_max:100 }],
  evaluations: {
    character: students.map(s => ({ student_id:s.id, term:1, trait1_score:3, trait2_score:2, trait3_score:3, trait4_score:2, trait5_score:3, trait6_score:2, trait7_score:3, trait8_score:2, result_level:'ดี' })),
    reading: students.map(s => ({ student_id:s.id, term:1, reading_1_1:3, reading_1_2:2, thinking_2_1:3, thinking_2_2:2, writing_3_1:3, total_score:13, result_level:'ดีเยี่ยม' })),
    competency: students.map(s => ({ student_id:s.id, term:1, competency1_score:3, competency2_score:2, competency3_score:3, competency4_score:2, competency5_score:3, result_level:'ดี' })),
    activities: [],
  },
  characterSettings: [], readingSettings: [], activitySettings: [],
  holidays: [], openWeekends: [], dailyAttendanceRecords: [], hourlyAttendanceRecords: [],
  documentSignatures: {}, digitalReference: null,
}
const subject = {
  class_subject_id: classSubjectId, order_number:1, teacher_name:'ครูผู้สอน ทดสอบ',
  subject: { id:'sub1', code:'ท14101', name:'ภาษาไทย', short_name:'ไทย', subject_group:'ภาษาไทย', type:'พื้นฐาน', hours_per_year:160, credits:1.5, max_score:100 },
}

;data.subjects=[subject];return data})();
 const doc=new jsPDF({format:'a4',unit:'mm'});for(const [file,font,weight] of [['regular-pdf.ttf','THSarabunNew.ttf','normal'],['bold.ttf','THSarabunNew-Bold.ttf','bold']]){doc.addFileToVFS(font,fs.readFileSync('public/fonts/th-sarabun-new/'+file).toString('base64'));doc.addFont(font,'THSarabunNew',weight)}doc.setFont('THSarabunNew');
 const sections=['cover','criteria','attendance','scores','achievement','character','reading','competency','activities'];const result=await buildPp5ClassPdfBlob({data,term:1,sections},{doc,skipApplyFonts:true});
 for(let i=1;i<=doc.getNumberOfPages();i++){doc.setPage(i);assert.ok(Math.abs(doc.internal.pageSize.getWidth()-210)<.01);assert.ok(Math.abs(doc.internal.pageSize.getHeight()-297)<.01)}
 fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync('tmp/pdfs/pp5-class-a4-test.pdf',Buffer.from(await result.blob.arrayBuffer()));console.log('All sections A4:',doc.getNumberOfPages(),'pages');
 let index=0;const m={exports:{}};const source=ts.transpileModule(fs.readFileSync('components/reports/Pp5ClassJsPdfLivePreview.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',source)(name=>name==='react'?{useEffect:()=>{},useRef:()=>({current:null}),useState:initial=>[index++===0?'blob:test':initial,()=>{}]}:name==='react/jsx-runtime'?require(name):{},m,m.exports);
 const html=require('react-dom/server').renderToStaticMarkup(m.exports.default({open:true,inline:true,data,term:1,sections,layouts:{}}));assert.match(html,/blob:test#view=FitH/);assert.match(html,/210 × 297/);assert.doesNotMatch(html,/pp6-jspdf-overlay/);fs.writeFileSync('tmp/pdfs/pp5-class-a4-preview.html',html);console.log('Inline preview displays actual PDF, no separate HTML layout');
})().catch(e=>{console.error(e);process.exitCode=1});
