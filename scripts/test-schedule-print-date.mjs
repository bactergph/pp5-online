// Regression: the selected full date must reach both signer rows on every PDF page.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import dayjs from 'dayjs'
import { jsPDF } from 'jspdf'

function load(file, dependencies = {}) {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(source, { exports, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  } })
  return exports
}
const dates = load('lib/thaiDate.ts', { dayjs, 'dayjs/locale/th': {} })
const schedules = load('lib/schedules.ts')
const helpers = load('lib/schedule-helpers.ts', { '@/lib/schedules': schedules })
const drawn = []
class ObservedPdf extends jsPDF {
  constructor(...args) {
    super(...args)
    const text = this.text
    this.text = (value, ...options) => {
      drawn.push({ page: this.internal.getCurrentPageInfo().pageNumber, value })
      return text.call(this, value, ...options)
    }
  }
}
const pdf = load('lib/jspdf-schedules.ts', {
  '@/lib/schedule-school-name': load('lib/schedule-school-name.ts'),
  jspdf: { jsPDF: ObservedPdf },
  '@/lib/jspdf-thai-font': {
    async applyThaiFonts(doc) {
      for (const [file, style] of [['regular-pdf.ttf', 'normal'], ['bold.ttf', 'bold']]) {
        doc.addFileToVFS(file, fs.readFileSync(`public/fonts/th-sarabun-new/${file}`).toString('base64'))
        doc.addFont(file, 'THSarabunNew', style)
      }
      doc.setFont('THSarabunNew', 'normal')
    },
    loadImageDataUrl: async () => null,
  },
  '@/lib/schedules': schedules,
  '@/lib/schedule-helpers': helpers,
  '@/lib/thaiDate': dates,
})
assert.equal(dates.formatThaiDate('2026-10-29'), '29 ตุลาคม 2569')
assert.equal(dates.formatThaiDate('2027-01-01'), '1 มกราคม 2570')
const result = await pdf.buildSchedulePdfBlob({
  schoolName: 'โรงเรียนข้อมูลสมมติ', title: 'ตารางสอน', printDate: '2026-10-29',
  periodTimes: helpers.DEFAULT_PERIOD_TIMES, gridData: {}, pages: [1, 2].map(room => ({ title: `ตารางเรียน ภาคเรียนที่ 2 ปีการศึกษา 2569 ชั้นมัธยมศึกษาปีที่ 1/${room}`, gridData: Object.fromEntries([1, 2, 3, 4, 5].flatMap(day => [1, 2, 3, 4, 5, 6].map(period => [`${day}-${period}`, { line1: period === 6 ? 'ลูกเสือ / เนตรนารี' : ['ภาษาไทย 2', 'คณิตศาสตร์ 2', 'วิทยาศาสตร์ 2'][period % 3], line2: period === 6 ? '(กิจกรรม)' : '(ท21102)', line3: period === 6 ? helpers.activityTimetableTeacherLabel('นาย สมชาย ใจดี, นางสาว สมหญิง รักเรียน') : helpers.teacherTimetableName('ครู ตัวอย่าง ใจดี'), line4: `ห้อง ม.1/${room}` }])))})),
})
assert.ok(result.blob.size > 0)
for (const page of [1, 2]) {
  assert.equal(drawn.filter(row => row.page === page && row.value === '29 ตุลาคม 2569').length, 2)
  assert.equal(drawn.filter(row => row.page === page && String(row.value).includes('พิมพ์:')).length, 0, 'Header must not repeat the signature date')
  assert.ok(!drawn.some(row => row.page === page && String(row.value).includes('......../......../........')))
  assert.ok(drawn.some(row => row.page === page && row.value === 'ครูตัวอย่าง'))
}
drawn.length = 0
await pdf.buildSchedulePdfBlob({ schoolName: 'โรงเรียนข้อมูลสมมติ', title: 'ตารางเรียนเดิม', periodTimes: [], gridData: {} })
assert.equal(drawn.filter(row => row.value === 'วันที่ ......../......../........').length, 2, 'Legacy callers retain blank signer dates')
console.log('PASS: full Thai date only on both signer rows of every PDF page; no header date; legacy exports unchanged')

drawn.length = 0
const workload = await pdf.buildWorkloadPdfBlob({ schoolName: 'โรงเรียนข้อมูลสมมติ', title: 'สรุปภาระงานสอน ภาคเรียนที่ 2 ปีการศึกษา 2569', fileName: 'workload.pdf', rows: Array.from({ length: 45 }, (_, index) => ({ name: `ครูตัวอย่าง${index + 1} ใจดี`, position: 'ครูชำนาญการ', hours: 19, scheduled_hours: 12, remaining: 7 })) })
assert.ok(workload.blob.size > 0)
assert.ok(drawn.some(row => row.value === 'จัดแล้ว'))
assert.ok(drawn.some(row => row.value === 'คงเหลือ'))
assert.ok(drawn.some(row => row.value === 'ครูตัวอย่าง45 ใจดี'))
assert.ok(!drawn.some(row => row.value === 'หมายเหตุ'))
console.log('PASS: multi-page workload PDF includes assigned, scheduled and remaining periods')
if (process.argv.includes('--write-samples')) {
  const out = path.resolve('tmp/pdfs/schedule-workload-review'); fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'schedule.pdf'), Buffer.from(await result.blob.arrayBuffer()))
  fs.writeFileSync(path.join(out, 'workload.pdf'), Buffer.from(await workload.blob.arrayBuffer()))
}
