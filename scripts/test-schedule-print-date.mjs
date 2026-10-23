// Regression: the selected month/year must reach both signer rows on every PDF page.
import fs from 'node:fs'
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
assert.equal(dates.formatThaiMonthYear('2026-10-26'), 'ตุลาคม 2569')
assert.equal(dates.formatThaiMonthYear('2027-01-01'), 'มกราคม 2570')
const result = await pdf.buildSchedulePdfBlob({
  schoolName: 'โรงเรียนข้อมูลสมมติ', title: 'ตารางสอน', printDate: '2026-10-26',
  periodTimes: [], gridData: {}, pages: [{ title: 'ครูตัวอย่าง 1', gridData: {} }, { title: 'ครูตัวอย่าง 2', gridData: {} }],
})
assert.ok(result.blob.size > 0)
for (const page of [1, 2]) {
  assert.equal(drawn.filter(row => row.page === page && row.value === 'ตุลาคม 2569').length, 2)
  assert.equal(drawn.filter(row => row.page === page && row.value === 'พิมพ์: ตุลาคม 2569').length, 1)
  assert.ok(!drawn.some(row => row.page === page && String(row.value).includes('......../......../........')))
}
drawn.length = 0
await pdf.buildSchedulePdfBlob({ schoolName: 'โรงเรียนข้อมูลสมมติ', title: 'ตารางเรียนเดิม', periodTimes: [], gridData: {} })
assert.equal(drawn.filter(row => row.value === 'วันที่ ......../......../........').length, 2, 'Legacy callers retain blank signer dates')
console.log('PASS: Thai month/year, selected date on both signer rows of every PDF page, legacy exports unchanged')
