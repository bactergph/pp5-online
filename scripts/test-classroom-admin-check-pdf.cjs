const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const assert = require('node:assert/strict')
const cache = {}
function load(file) {
  file = path.resolve(file)
  if (cache[file]) return cache[file].exports
  const module = { exports: {} }
  cache[file] = module
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', source)(name => name.startsWith('@/') ? load(name.slice(2) + '.ts') : name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name), module, module.exports)
  return module.exports
}

const { jsPDF } = require('jspdf')
const { createPp5HtmlDrawing } = load('lib/pp5-html-drawing.ts')
const { buildDailyAttendancePdfBlob } = load('lib/jspdf-daily-attendance.ts')

function doc() {
  const pdf = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'landscape' })
  for (const [file, font, weight] of [['regular-pdf.ttf', 'THSarabunNew.ttf', 'normal'], ['bold.ttf', 'THSarabunNew-Bold.ttf', 'bold']]) {
    pdf.addFileToVFS(font, fs.readFileSync('public/fonts/th-sarabun-new/' + file).toString('base64'))
    pdf.addFont(font, 'THSarabunNew', weight)
  }
  pdf.setFont('THSarabunNew')
  return pdf
}

const student = { id: 's1', student_number: 1, first_name: 'สมชาย', last_name: 'ใจดี' }
const base = {
  schoolName: 'โรงเรียนทดสอบ', yearBe: 2569, classroomLabel: 'ป.4/1', term: 1, monthKey: '2026-05', days: 31,
  schoolDays: [18], holidays: [], weekendSchoolDays: [], students: [student], homeroomTeacherName: 'ครูทดสอบ', directorName: 'ผอ.ทดสอบ',
}

async function page(extra) {
  const pdf = doc()
  const drawing = createPp5HtmlDrawing(pdf)
  await buildDailyAttendancePdfBlob({ ...base, ...extra }, { doc: drawing.doc, loadImage: async () => null, logoData: null })
  return drawing.pages().join('\n')
}

function tickSpan(svg) {
  const lines = [...svg.matchAll(/<line [^>]*x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)]
  assert.equal(lines.length, 2)
  const xs = lines.flatMap(line => [Number(line[1]), Number(line[3])])
  const ys = lines.flatMap(line => [Number(line[2]), Number(line[4])])
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

;(async () => {
  const present = await page({ attendance: { s1: { 18: 'ม' } } })
  assert.equal((present.match(/<line /g) || []).length, 2)
  assert.equal(present.includes('✓'), false)
  const small = tickSpan(await page({ attendance: { s1: { 18: 'ม' } }, layout: { fontTablePx: 6 } }))
  const large = tickSpan(await page({ attendance: { s1: { 18: 'ม' } }, layout: { fontTablePx: 16 } }))
  const cramped = tickSpan(await page({ attendance: { s1: { 18: 'ม' } }, layout: { fontTablePx: 16, rowHeightPx: 8 } }))
  assert.ok(large.w > small.w * 1.4 && large.h > small.h * 1.4, 'table font size changes the check mark')
  assert.ok(cramped.h < large.h, 'a short row keeps the check mark inside the cell')
  const markedSvg = await page({ attendance: { s1: { 18: 'ม' } }, layout: { fontTablePx: 12 } })
  const routineSvg = await page({ reportType: 'brushing', activities: { s1: { 18: 1 } }, layout: { fontTablePx: 12 } })
  const marked = tickSpan(markedSvg)
  const routine = tickSpan(routineSvg)
  assert.equal(Math.round(marked.w * 100), Math.round(routine.w * 100))
  assert.equal(Math.round(marked.h * 100), Math.round(routine.h * 100))
  assert.equal(routineSvg.includes('>/</text>'), false)
  assert.equal(/>(?:✓|✔)<\/text>/.test(routineSvg), false)
  console.log('PASS: attendance and routine checks share one mark sized by the table font')
})().catch(error => {
  console.error(error)
  process.exit(1)
})
