/* Jarnsek SGS transfer protocol and preflight. Independently implemented. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.JarnsekSGSCore = factory()
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict'
  const FORMAT = 'jarnsek-sgs-scores'
  const fail = message => { throw new Error(message) }
  function text(value, label, max = 200) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label}ไม่ถูกต้อง`)
    return value.trim()
  }
  function studentCode(value) {
    const code = String(value ?? '').normalize('NFKC').trim().replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 3664))
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(code)) fail('เลขประจำตัวนักเรียนไม่ถูกต้อง')
    return code
  }
  function score(value, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail(`คะแนนต้องอยู่ระหว่าง 0–${max}`)
    return value
  }
  function parsePacket(input) {
    if (typeof input === 'string') {
      if (input.length > 1000000) fail('ไฟล์คะแนนใหญ่เกิน 1 MB')
      try { input = JSON.parse(input) } catch { fail('ไฟล์คะแนนไม่ใช่ JSON ที่ถูกต้อง') }
    }
    if (!input || input.format !== FORMAT || input.version !== 1) fail('กรุณาใช้ไฟล์ส่งคะแนน SGS จากจารย์เสก')
    const context = input.context || {}
    if (!Number.isInteger(context.yearBe) || context.yearBe < 2500 || context.yearBe > 3000 || ![1, 2].includes(context.term)) fail('ปีหรือภาคเรียนไม่ถูกต้อง')
    if (!Array.isArray(input.columns) || !input.columns.length || input.columns.length > 24) fail('จำนวนคอลัมน์คะแนนไม่ถูกต้อง')
    const keys = new Set()
    const columns = input.columns.map(column => {
      const key = text(column?.key, 'รหัสช่องคะแนน', 40)
      if (keys.has(key)) fail('คอลัมน์คะแนนซ้ำ')
      keys.add(key)
      if (typeof column.max !== 'number' || !Number.isFinite(column.max) || column.max <= 0 || column.max > 1000) fail('คะแนนเต็มไม่ถูกต้อง')
      return { key, label: text(column.label, 'ชื่อช่องคะแนน', 100), max: column.max }
    })
    if (!Array.isArray(input.students) || !input.students.length || input.students.length > 300) fail('รองรับนักเรียน 1–300 คนต่อห้อง')
    const codes = new Set()
    const students = input.students.map(row => {
      const code = studentCode(row?.studentCode)
      if (codes.has(code)) fail(`เลขประจำตัวนักเรียน ${code} ซ้ำ`)
      codes.add(code)
      if (!Array.isArray(row.values) || row.values.length !== columns.length) fail(`จำนวนคะแนนของ ${code} ไม่ตรงกับคอลัมน์`)
      return { studentCode: code, name: text(row.name, 'ชื่อนักเรียน'), values: row.values.map((value, index) => value === null ? null : score(value, columns[index].max)) }
    })
    return { format: FORMAT, version: 1, context: { yearBe: context.yearBe, term: context.term, classroom: text(context.classroom, 'ชั้น/ห้อง', 100), subjectCode: text(context.subjectCode, 'รหัสวิชา', 80), subjectName: text(context.subjectName, 'ชื่อวิชา') }, columns, students }
  }
  function parseGrid(input) {
    if (typeof input !== 'string' || input.length > 1000000) fail('ข้อมูลคะแนนใหญ่เกิน 1 MB')
    const lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    if (!lines.length || lines.length > 300) fail('กรุณาวางคะแนนนักเรียน 1–300 แถว')
    const grid = lines.map((line, row) => line.split('\t').map(cell => {
      const raw = cell.trim()
      if (!raw) return null
      if (!/^\d+(?:\.\d+)?$/.test(raw)) fail(`แถว ${row + 1}: ใช้คะแนนตัวเลข คั่นคอลัมน์ด้วย Tab จาก Excel`)
      return score(Number(raw), 1000)
    }))
    const width = grid[0].length
    if (!width || width > 24 || grid.some(row => row.length !== width)) fail('จำนวนคอลัมน์แต่ละแถวไม่เท่ากัน (สูงสุด 24 ช่อง)')
    return grid
  }
  const sameScore = (a, b) => String(a).trim() !== '' && Number.isFinite(Number(a)) && Math.abs(Number(a) - Number(b)) < 1e-9
  function validateTargets(targets) {
    if (!Array.isArray(targets) || !targets.length || targets.length > 300) fail('กรุณาเปิดรายชื่อนักเรียนให้ครบในตาราง SGS เดียว (สูงสุด 300 คน)')
    const codes = new Map()
    targets.forEach((row, index) => {
      const code = studentCode(row.studentCode)
      if (codes.has(code)) fail(`SGS มีเลขประจำตัว ${code} ซ้ำ กรุณาเลือกคอลัมน์เลขประจำตัวให้ถูกต้อง`)
      if (!Array.isArray(row.cells) || row.cells.length > 64) fail('โครงสร้างช่องคะแนน SGS ไม่รองรับ')
      codes.set(code, index)
    })
    return codes
  }
  function addChange(changes, row, column, value, targets, overwrite, issues) {
    if (value === null) return
    const target = targets[row], cell = target.cells[column]
    const label = `${target.studentCode} · ${cell?.label || `ช่อง ${column + 1}`}`
    if (!cell) { issues.push(`${label}: ไม่พบช่องคะแนน`); return }
    if (sameScore(cell.value, value)) return
    if (!cell.editable) { issues.push(`${label}: ช่องคะแนนยังไม่เปิดให้แก้ไข`); return }
    if (cell.max != null && value > cell.max) { issues.push(`${label}: เกินคะแนนเต็ม ${cell.max}`); return }
    if (String(cell.value ?? '').trim() && !overwrite) { issues.push(`${label}: มีคะแนนเดิม ต้องอนุญาตให้แทนที่ก่อน`); return }
    changes.push({ row, column, studentCode: studentCode(target.studentCode), label: cell.label, before: String(cell.value ?? ''), value })
  }
  function planPacket(input, targets, mapping, overwrite = false) {
    const packet = parsePacket(input), codes = validateTargets(targets), changes = [], issues = []
    if (!Array.isArray(mapping) || mapping.length !== packet.columns.length || !mapping.some(index => Number.isInteger(index) && index >= 0)) fail('เลือกช่องคะแนนปลายทางอย่างน้อย 1 ช่อง')
    const used = new Set()
    mapping.forEach(index => {
      if (!Number.isInteger(index) || index < -1 || index > 63) fail('คอลัมน์ปลายทางไม่ถูกต้อง')
      if (index >= 0 && used.has(index)) fail('ห้ามส่งสองคอลัมน์ไปยังช่อง SGS เดียวกัน')
      if (index >= 0) used.add(index)
    })
    packet.students.forEach(student => {
      const row = codes.get(student.studentCode)
      if (row === undefined) {
        if (student.values.some((value, index) => mapping[index] >= 0 && value !== null)) issues.push(`ไม่พบเลขประจำตัว ${student.studentCode} ใน SGS กรุณาแสดงนักเรียนให้ครบ`)
        return
      }
      mapping.forEach((column, index) => {
        if (column < 0 || student.values[index] === null) return
        const max = targets[row].cells[column]?.max
        if (max != null && Math.abs(max - packet.columns[index].max) > 1e-9) { issues.push(`${student.studentCode} · ${packet.columns[index].label}: คะแนนเต็มต้นทาง ${packet.columns[index].max} ไม่ตรงกับ SGS ${max}`); return }
        addChange(changes, row, column, student.values[index], targets, overwrite, issues)
      })
    })
    return { changes, issues: issues.slice(0, 60), issueCount: issues.length, studentCount: new Set(changes.map(change => change.studentCode)).size }
  }
  function planGrid(grid, targets, startRow, startColumn, overwrite = false) {
    validateTargets(targets)
    if (!Number.isInteger(startRow) || startRow < 0 || startRow >= targets.length || !Number.isInteger(startColumn) || startColumn < 0) fail('คลิกช่องคะแนนเริ่มต้นใน SGS ก่อนวางคะแนน')
    if (!Array.isArray(grid) || !grid.length || grid.length !== targets.length - startRow) fail('จำนวนแถว Excel ต้องตรงกับนักเรียนตั้งแต่ช่องเริ่มต้นถึงคนสุดท้ายในหน้า SGS')
    const changes = [], issues = []
    grid.forEach((values, offset) => {
      const row = startRow + offset, columns = targets[row].cells.map((cell, index) => cell.editable && index >= startColumn ? index : -1).filter(index => index >= 0)
      if (values.length !== columns.length) { issues.push(`${targets[row].studentCode}: Excel มี ${values.length} ช่อง แต่ SGS เปิดไว้ ${columns.length} ช่อง`); return }
      values.forEach((value, index) => { if (value !== null) score(value, 1000); addChange(changes, row, columns[index], value, targets, overwrite, issues) })
    })
    return { changes, issues: issues.slice(0, 60), issueCount: issues.length, studentCount: new Set(changes.map(change => change.studentCode)).size }
  }
  function verifyReceipt(receipt, targets) {
    const codes = validateTargets(targets), mismatches = []
    for (const change of receipt.changes || []) {
      const row = codes.get(change.studentCode), cell = row === undefined ? null : targets[row].cells[change.column]
      if (!cell || cell.label !== change.label || !sameScore(cell.value, change.value)) mismatches.push({ ...change, actual: cell?.value ?? null })
    }
    return { checked: receipt.changes?.length || 0, mismatches }
  }
  return { FORMAT, studentCode, parsePacket, parseGrid, planPacket, planGrid, verifyReceipt }
})
