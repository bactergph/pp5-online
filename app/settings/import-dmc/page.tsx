'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'
import { fetchClassroomsForImport, importStudents, importStudentsWholeSchool } from '../actions'

type Classroom = {
  id: string
  level: string
  room: number
  academic_year_id: string
  academic_years?: { year_be: number; is_active: boolean } | { year_be: number; is_active: boolean }[] | null
}
type Grid = (string | number)[][]
type ColMap = { prefix: number; first: number; last: number; gender: number; birth: number; code: number; national: number; level: number; room: number }
type ImportMode = 'classroom' | 'school'

function parseBirthDate(raw: string | number | null): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  const m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (!m) return null
  let year = parseInt(m[3])
  if (year > 2400) year -= 543      // พ.ศ. → ค.ศ.
  else if (year < 100) year += 2000
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function findCol(headers: string[], matchers: ((h: string) => boolean)[]): number {
  for (const match of matchers) {
    const idx = headers.findIndex(match)
    if (idx >= 0) return idx
  }
  return -1
}

// หาแถวหัวตาราง (ไฟล์ DMC แถว 1 = วันเวลา, แถว 2 = หัว)
function detectHeaderRow(grid: Grid): number {
  let bestRow = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(8, grid.length); i++) {
    const row = grid[i].map(c => normalizeHeader(c))
    const score =
      (row.some(c => c.includes('คำนำหน้า')) ? 3 : 0) +
      (row.some(c => c === 'ชื่อ' || (c.startsWith('ชื่อ') && !c.includes('นามสกุล'))) ? 3 : 0) +
      (row.some(c => c.includes('นามสกุล')) ? 2 : 0) +
      (row.some(c => c.includes('เลขประจำตัวนักเรียน') || c.includes('รหัสนักเรียน')) ? 2 : 0) +
      (row.some(c => c.includes('ชั้น')) ? 1 : 0) +
      (row.some(c => c === 'ห้อง' || c.includes('ห้องเรียน')) ? 1 : 0)
    if (score > bestScore) {
      bestScore = score
      bestRow = i
    }
  }
  return bestScore > 0 ? bestRow : 0
}

function sampleRows(grid: Grid, headerRow: number, count = 8): (string | number)[][] {
  return grid.slice(headerRow + 1, headerRow + 1 + count).filter(r => r.some(c => String(c).trim() !== ''))
}

// จับคู่คอลัมน์อัตโนมัติ (รองรับกับดัก C3 = เลขบัตร 13 หลัก แม้ป้ายว่า "เลขประจำตัวนักเรียน")
function autoMap(headers: string[], samples: (string | number)[][]): ColMap {
  const hs = headers.map(normalizeHeader)
  const cellAt = (row: (string | number)[], col: number) => String(row[col] ?? '').trim()

  const idCols = hs.map((h, i) => ({ h, i })).filter(x =>
    x.h.includes('เลขประจำตัวนักเรียน') || x.h.includes('รหัสนักเรียน') || x.h.includes('รหัสประจำตัว'))
  const is13 = (v: unknown) => /^\d{13}$/.test(String(v ?? '').trim())
  let national = -1
  for (const col of idCols) {
    if (samples.some(row => is13(cellAt(row, col.i)))) {
      national = col.i
      break
    }
  }
  if (national === -1) {
    national = findCol(hs, [
      h => h.includes('บัตรประชาชน') || h.includes('ประชาชน') || h.includes('เลขบัตร'),
    ])
  }
  const code = idCols.find(x => x.i !== national)?.i
    ?? findCol(hs, [h => h.includes('รหัสนักเรียน') && !h.includes('บัตร')])

  return {
    prefix: findCol(hs, [
      h => h.includes('คำนำหน้า') && !h.includes('ปกครอง') && !h.includes('บิดา') && !h.includes('มารดา'),
      h => h === 'คำนำหน้าชื่อ',
    ]),
    first: findCol(hs, [
      h => h === 'ชื่อ',
      h => h.startsWith('ชื่อ') && !h.includes('นามสกุล') && !h.includes('บิดา') && !h.includes('มารดา') && !h.includes('ปกครอง'),
    ]),
    last: findCol(hs, [
      h => h === 'นามสกุล',
      h => h.includes('นามสกุล') && !h.includes('บิดา') && !h.includes('มารดา') && !h.includes('ปกครอง'),
    ]),
    gender: findCol(hs, [
      h => h === 'เพศ',
      h => h.includes('เพศ'),
    ]),
    birth: findCol(hs, [
      h => h.includes('วันเกิด'),
      h => h.includes('วันเดือนปีเกิด'),
    ]),
    level: findCol(hs, [
      h => h === 'ชั้น',
      h => h.includes('ระดับชั้น'),
      h => h.includes('ชั้นเรียน') && !h.includes('ห้อง'),
      h => h === 'ชั้นชั้น',
    ]),
    room: findCol(hs, [
      h => h === 'ห้อง',
      h => h === 'ห้องเรียน',
      h => h.includes('ห้อง') && !h.includes('โทร') && !h.includes('ปกครอง'),
    ]),
    code,
    national,
  }
}

function parseGender(raw: unknown, prefix: string): string {
  const r = String(raw ?? '').trim()
  if (r === 'ช' || r.includes('ชาย') || r.toLowerCase() === 'm') return 'M'
  if (r === 'ญ' || r.includes('หญิง') || r.toLowerCase() === 'f') return 'F'
  return prefix === 'เด็กหญิง' || prefix === 'นางสาว' || prefix === 'นาง' ? 'F' : 'M'
}

function normalizeClassLevel(level: string) {
  return String(level || '').trim().replace(/\s+/g, '')
    .replace(/^อนุบาล/, 'อ.')
    .replace(/^อ(\d)/, 'อ.$1')
    .replace(/^ประถมศึกษาปีที่/, 'ป.')
    .replace(/^ประถม/, 'ป.')
    .replace(/^ป(\d)/, 'ป.$1')
}

const FIELD_LABELS: { key: keyof ColMap; label: string }[] = [
  { key: 'prefix', label: 'คำนำหน้า' }, { key: 'first', label: 'ชื่อ' }, { key: 'last', label: 'นามสกุล' },
  { key: 'gender', label: 'เพศ' }, { key: 'birth', label: 'วันเกิด' }, { key: 'code', label: 'เลขประจำตัวนักเรียน' },
  { key: 'national', label: 'เลขบัตรประชาชน' }, { key: 'level', label: 'ชั้น (กรองห้อง)' }, { key: 'room', label: 'ห้อง (กรองห้อง)' },
]

export default function ImportDmcPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [target, setTarget] = useState('')
  const [targetYear, setTargetYear] = useState('')
  const [mode, setMode] = useState<ImportMode>('school')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const [error, setError] = useState<string | null>(null)

  const [grid, setGrid] = useState<Grid>([])
  const [headerRow, setHeaderRow] = useState(0)
  const [colMap, setColMap] = useState<ColMap | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileLoadPct, setFileLoadPct] = useState(0)
  const [fileLoadStatus, setFileLoadStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchClassroomsForImport().then(data => {
      const list = data as Classroom[]
      setClassrooms(list)
      const activeClassroom = list.find(c => {
        const y = Array.isArray(c.academic_years) ? c.academic_years[0] : c.academic_years
        return y?.is_active
      }) || list[0]
      if (activeClassroom) {
        setTarget(activeClassroom.id)
        setTargetYear(activeClassroom.academic_year_id)
      }
      setLoading(false)
    })
  }, [])

  const headers = useMemo(() => (grid[headerRow] || []).map(c => normalizeHeader(c)), [grid, headerRow])
  const dataRows = useMemo(() => grid.slice(headerRow + 1).filter(r => r.some(c => String(c).trim() !== '')), [grid, headerRow])
  const targetClass = classrooms.find(c => c.id === target)
  const yearOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string; isActive: boolean; count: number }>()
    classrooms.forEach(c => {
      const y = Array.isArray(c.academic_years) ? c.academic_years[0] : c.academic_years
      const existing = map.get(c.academic_year_id)
      if (existing) existing.count += 1
      else map.set(c.academic_year_id, {
        id: c.academic_year_id,
        label: y?.year_be ? `${y.year_be}${y.is_active ? ' (ปัจจุบัน)' : ''}` : c.academic_year_id,
        isActive: Boolean(y?.is_active),
        count: 1,
      })
    })
    return [...map.values()].sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.label.localeCompare(a.label))
  }, [classrooms])
  const classroomsInYear = useMemo(() => classrooms.filter(c => c.academic_year_id === targetYear), [classrooms, targetYear])

  // กรองเฉพาะแถวที่ตรงกับชั้น/ห้องปลายทาง (ถ้าไฟล์มีคอลัมน์ชั้น+ห้อง)
  const matchedRows = useMemo(() => {
    if (!colMap || !targetClass) return dataRows
    if (colMap.level < 0 || colMap.room < 0) return dataRows
    return dataRows.filter(r =>
      String(r[colMap.level]).trim() === targetClass.level &&
      String(r[colMap.room]).trim() === String(targetClass.room))
  }, [dataRows, colMap, targetClass])

  const parsed = useMemo(() => {
    if (!colMap) return []
    return matchedRows.map(r => {
      const prefix = String(r[colMap.prefix] ?? '').trim() || 'เด็กชาย'
      return {
        student_code: String(r[colMap.code] ?? '').trim() || null,
        national_id: String(r[colMap.national] ?? '').trim() || null,
        prefix,
        first_name: String(r[colMap.first] ?? '').trim(),
        last_name: String(r[colMap.last] ?? '').trim(),
        gender: parseGender(r[colMap.gender], prefix),
        birth_date: parseBirthDate(r[colMap.birth] as string | number),
        status: 'เรียน',
      }
    }).filter(s => s.first_name)
  }, [matchedRows, colMap])

  const parsedSchool = useMemo(() => {
    if (!colMap || colMap.level < 0 || colMap.room < 0) return []
    return dataRows.map(r => {
      const prefix = String(r[colMap.prefix] ?? '').trim() || 'เด็กชาย'
      return {
        student_code: String(r[colMap.code] ?? '').trim() || null,
        national_id: String(r[colMap.national] ?? '').trim() || null,
        prefix,
        first_name: String(r[colMap.first] ?? '').trim(),
        last_name: String(r[colMap.last] ?? '').trim(),
        gender: parseGender(r[colMap.gender], prefix),
        birth_date: parseBirthDate(r[colMap.birth] as string | number),
        status: 'เรียน',
        level: normalizeClassLevel(String(r[colMap.level] ?? '')),
        room: String(r[colMap.room] ?? '').trim(),
      }
    }).filter(s => s.first_name && s.level && s.room)
  }, [dataRows, colMap])

  const schoolSummary = useMemo(() => {
    const map = new Map<string, number>()
    parsedSchool.forEach(row => {
      const key = `${row.level}/${row.room}`
      map.set(key, (map.get(key) || 0) + 1)
    })
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'th'))
  }, [parsedSchool])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    clearAlert()
    setFileLoading(true)
    setFileLoadPct(8)
    setFileLoadStatus(`กำลังอ่านไฟล์ ${file.name}...`)
    let doneOk = false
    try {
      const buffer = await file.arrayBuffer()
      setFileLoadPct(28)
      setFileLoadStatus('กำลังโหลดตัวอ่าน Excel...')
      const XLSX = await import('xlsx')
      setFileLoadPct(48)
      setFileLoadStatus('กำลังแปลงข้อมูล...')
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: Grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (data.length < 2) {
        setError('ไฟล์ไม่มีข้อมูล')
        return
      }
      setFileLoadPct(72)
      setFileLoadStatus('กำลังจับคู่คอลัมน์อัตโนมัติ...')
      const hr = detectHeaderRow(data)
      const hdrs = data[hr].map(c => normalizeHeader(c))
      const rows = sampleRows(data, hr)
      setGrid(data)
      setHeaderRow(hr)
      setColMap(autoMap(hdrs, rows))
      const rowCount = data.slice(hr + 1).filter(r => r.some(c => String(c).trim() !== '')).length
      setFileLoadPct(100)
      setFileLoadStatus(`อ่านไฟล์สำเร็จ · ${rowCount} แถว · ${hdrs.filter(Boolean).length} คอลัมน์`)
      doneOk = true
      await new Promise(resolve => window.setTimeout(resolve, 700))
    } catch {
      setError('อ่านไฟล์ไม่สำเร็จ กรุณาตรวจสอบรูปแบบไฟล์')
    } finally {
      setFileLoading(false)
      window.setTimeout(() => {
        setFileLoadPct(0)
        setFileLoadStatus('')
      }, doneOk ? 1200 : 0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function setCol(key: keyof ColMap, idx: number) { setColMap(m => m ? { ...m, [key]: idx } : m) }

  async function handleImport() {
    const total = mode === 'school' ? parsedSchool.length : parsed.length
    if (total === 0) return
    setImporting(true); setError(null)
    const res = mode === 'school'
      ? await importStudentsWholeSchool(targetYear, parsedSchool)
      : await importStudents(target, parsed)
    setImporting(false)
    if (res.error) { setError(res.error); return }
    notify('success', `นำเข้าสำเร็จ: เพิ่มใหม่ ${res.inserted} คน · ซ้ำ/ข้าม ${res.skipped} คน${'missingClass' in res && res.missingClass ? ` · ไม่พบห้อง ${res.missingClass} คน` : ''}`)
    setGrid([]); setColMap(null)
  }

  if (loading) return <div className="empty-state">กำลังโหลด...</div>

  return (
    <div className="page-stack">
      <AlertModal />
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="control-card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'end' }}>
          <div>
            <label className="form-label">รูปแบบนำเข้า</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" onClick={() => setMode('school')} className={mode === 'school' ? 'btn btn-primary' : 'btn btn-secondary'}>ทั้งโรงเรียน</button>
              <button type="button" onClick={() => setMode('classroom')} className={mode === 'classroom' ? 'btn btn-primary' : 'btn btn-secondary'}>เฉพาะห้อง</button>
            </div>
          </div>
          {mode === 'school' ? (
            <div>
              <label className="form-label">ปีการศึกษาปลายทาง</label>
              <select value={targetYear} onChange={e => setTargetYear(e.target.value)} className="form-input" disabled={yearOptions.length === 0}>
                {yearOptions.length === 0 ? <option>ยังไม่มีปี/ชั้นเรียน</option> : yearOptions.map(y => <option key={y.id} value={y.id}>{y.label} · {y.count} ห้อง</option>)}
              </select>
            </div>
          ) : (
            <div>
            <label className="form-label">ชั้นเรียนปลายทาง</label>
            <select value={target} onChange={e => setTarget(e.target.value)} className="form-input" disabled={classrooms.length === 0}>
              {classrooms.length === 0 ? <option>ยังไม่มีชั้นเรียน</option> : classrooms.map(c => <option key={c.id} value={c.id}>{c.level}/{c.room}</option>)}
            </select>
            </div>
          )}
          <div>
            <label className="form-label">ไฟล์ Excel จาก DMC (.xlsx)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              disabled={fileLoading}
              className="form-input"
              style={{ paddingTop: 8, opacity: fileLoading ? 0.65 : 1 }}
            />
            {(fileLoading || fileLoadStatus) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{fileLoadStatus}</span>
                  {fileLoading && <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>{fileLoadPct}%</span>}
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${fileLoadPct}%`,
                      borderRadius: 999,
                      background: fileLoadPct >= 100 ? 'linear-gradient(90deg, #16a34a, #22c55e)' : 'linear-gradient(90deg, #2563eb, #3b82f6)',
                      transition: 'width 0.28s ease, background 0.2s ease',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {grid.length > 0 && colMap && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <label className="form-label" style={{ margin: 0 }}>แถวหัวตาราง:</label>
              <select value={headerRow} onChange={e => { const hr = Number(e.target.value); setHeaderRow(hr); setColMap(autoMap(grid[hr].map(c => normalizeHeader(c)), sampleRows(grid, hr))) }} className="form-input" style={{ width: 'auto' }}>
                {grid.slice(0, 6).map((_, i) => <option key={i} value={i}>แถวที่ {i + 1}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>(ไฟล์ DMC หัวตารางอยู่แถวที่ 2)</span>
            </div>

            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10 }}>
              จับคู่คอลัมน์อัตโนมัติแล้ว (ตรวจสอบ/แก้ไขได้)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
              {FIELD_LABELS.map(f => (
                <div key={f.key}>
                  <label className="form-label" style={{ fontSize: 12 }}>{f.label}</label>
                  <select value={colMap[f.key]} onChange={e => setCol(f.key, Number(e.target.value))} className="form-input" style={{ fontSize: 13 }}>
                    <option value={-1}>— ไม่มี —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{i + 1}. {h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {grid.length > 0 && colMap && (
        <div className="data-card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontWeight: 600 }}>
              ตัวอย่าง: <b style={{ color: 'var(--primary)' }}>{mode === 'school' ? parsedSchool.length : parsed.length}</b> คน
              {mode === 'school'
                ? <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 400 }}> (ทั้งโรงเรียน · ปีปลายทางมี {classroomsInYear.length} ห้อง)</span>
                : colMap.level >= 0 && colMap.room >= 0 && targetClass && <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 400 }}> (กรองเฉพาะ {targetClass.level}/{targetClass.room} จากไฟล์ {dataRows.length} แถว)</span>}
            </span>
            <LoadingButton
              loading={importing}
              loadingText="กำลังนำเข้า..."
              onClick={handleImport}
              disabled={mode === 'school' ? parsedSchool.length === 0 || !targetYear : parsed.length === 0}
            >
              {mode === 'school' ? `นำเข้าทั้งโรงเรียน ${parsedSchool.length} คน` : `นำเข้า ${parsed.length} คน → ${targetClass?.level}/${targetClass?.room}`}
            </LoadingButton>
          </div>
          {mode === 'school' && schoolSummary.length > 0 && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {schoolSummary.slice(0, 18).map(([classLabel, count]) => <span key={classLabel} className="badge badge-gray">{classLabel}: {count} คน</span>)}
              {schoolSummary.length > 18 && <span className="badge badge-primary">+{schoolSummary.length - 18} ห้อง</span>}
            </div>
          )}
          <div style={{ overflowX: 'auto', maxHeight: 400 }}>
            <table className="thai-table" style={{ width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr>{[...(mode === 'school' ? ['ชั้น/ห้อง'] : []), 'รหัส', 'เลขบัตร', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เพศ', 'วันเกิด'].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(mode === 'school' ? parsedSchool : parsed).slice(0, 30).map((r, i) => (
                  <tr key={i}>
                    {mode === 'school' && 'level' in r && <td style={{ fontWeight: 700 }}>{r.level}/{r.room}</td>}
                    <td style={{ color: 'var(--text-3)' }}>{r.student_code || '-'}</td>
                    <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{r.national_id || '-'}</td>
                    <td>{r.prefix}</td>
                    <td style={{ fontWeight: 500 }}>{r.first_name}</td>
                    <td>{r.last_name}</td>
                    <td style={{ textAlign: 'center' }}><span style={{ fontWeight: 700, fontSize: 12, color: r.gender === 'M' ? '#1D4ED8' : '#DB2777' }}>{r.gender === 'M' ? 'ช' : 'ญ'}</span></td>
                    <td style={{ fontSize: 12 }}>{r.birth_date || '-'}</td>
                  </tr>
                ))}
                {(mode === 'school' ? parsedSchool : parsed).length > 30 && <tr><td colSpan={mode === 'school' ? 8 : 7} style={{ textAlign: 'center', color: 'var(--text-3)', fontStyle: 'italic', padding: 8 }}>... และอีก {(mode === 'school' ? parsedSchool : parsed).length - 30} คน</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {grid.length === 0 && (
        <div className="card-padded">
          <p style={{ fontWeight: 600, marginBottom: 10, color: 'var(--text-2)' }}>วิธีใช้</p>
          <ul style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 2, paddingLeft: 20 }}>
            <li>Export รายชื่อนักเรียนจากระบบ DMC เป็นไฟล์ Excel (.xlsx)</li>
            <li>เลือก “ทั้งโรงเรียน” เพื่อให้ระบบอ่านคอลัมน์ชั้น/ห้องแล้วกระจายเข้าห้องให้อัตโนมัติ</li>
            <li>หรือเลือก “เฉพาะห้อง” หากต้องการนำเข้าไฟล์เดียวเข้าห้องปลายทางห้องเดียว</li>
            <li>วันเกิดรองรับ วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ.) · เพศ ช/ญ · กันซ้ำด้วยเลขบัตรประชาชน</li>
            <li>เลขที่ในห้องจะไล่ต่อจากที่มีอยู่อัตโนมัติ (ปรับภายหลังได้ที่เมนูนักเรียน)</li>
          </ul>
        </div>
      )}
    </div>
  )
}
