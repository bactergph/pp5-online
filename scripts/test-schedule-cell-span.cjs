const assert = require('node:assert/strict')
const load = require('./helpers/load-pure-ts.cjs')
const { periodColSpans, spanPeriods, pdfCellIdentity, stripPeriodLabel } = load('lib/schedule-cell-span.ts')

const slots = [{ period: 1 }, { period: 2 }, { period: 0, break: true }, { period: 3 }, { period: 4 }]
const spans = periodColSpans(slots, period => ({ 1: 'math', 2: 'math', 3: 'math', 4: 'thai' })[period] || '')
assert.equal(spans.get(1), 2, 'A double before lunch is one cell')
assert.equal(spans.get(2), 0)
assert.equal(spans.get(3), 1, 'The same subject after lunch stays separate')
assert.equal(JSON.stringify([...spanPeriods(slots, spans, 1)]), '[1,2]')
assert.equal(JSON.stringify([...spanPeriods(slots, spans, 2)]), '[]')

const blanks = periodColSpans([{ period: 1 }, { period: 2 }], () => '')
assert.equal(blanks.get(1), 1)
assert.equal(blanks.get(2), 1, 'Empty periods stay separate')

const triple = periodColSpans([{ period: 1 }, { period: 2 }, { period: 3 }], () => 'sci')
assert.equal(triple.get(1), 3)
assert.equal(stripPeriodLabel('ห้องวิทย์ · คาบที่ 1'), 'ห้องวิทย์')
const first = { line1: 'ภาษาไทย', line2: '(ท21102)', line3: 'ครูตัวอย่าง', line4: 'ห้องวิทย์ · คาบที่ 1' }
const second = { ...first, line4: 'ห้องวิทย์ · คาบที่ 2' }
assert.equal(pdfCellIdentity(first), pdfCellIdentity(second))
assert.notEqual(pdfCellIdentity(first), pdfCellIdentity({ ...first, line4: 'ห้องคอม · คาบที่ 2' }))
assert.equal(pdfCellIdentity({ line1: '—' }), '')

console.log('PASS: double periods merge, lunch splits the run, empty cells stay apart')
