'use client'
import { useEffect, useMemo, useState } from 'react'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'
import {
  bulkUpsertGlobalSubjects,
  deleteGlobalSubject,
  fetchGlobalSubjects,
  saveGlobalSubject,
  type GlobalSubject,
} from './actions'

const empty = {
  id: '',
  code: '',
  name: '',
  short_name: '',
  subject_group: SUBJECT_GROUPS[0] as string,
  type: 'พื้นฐาน',
  hours_per_year: 40,
  credits: 1,
  max_score: 100,
  sort_order: 0,
}

type Draft = typeof empty

const CODE_GROUP: Record<string, string> = {
  ท: 'ภาษาไทย', ค: 'คณิตศาสตร์', ว: 'วิทยาศาสตร์และเทคโนโลยี',
  ส: 'สังคมศึกษา ศาสนา และวัฒนธรรม', พ: 'สุขศึกษาและพลศึกษา',
  ศ: 'ศิลปะ', ง: 'การงานอาชีพ', อ: 'ภาษาต่างประเทศ',
}

const GROUP_COLOR: Record<string, string> = {
  'ภาษาไทย': '#DB2777',
  'คณิตศาสตร์': '#8B6B45',
  'วิทยาศาสตร์และเทคโนโลยี': '#059669',
  'สังคมศึกษา ศาสนา และวัฒนธรรม': '#D97706',
  'สุขศึกษาและพลศึกษา': '#DC2626',
  'ศิลปะ': '#C49212',
  'การงานอาชีพ': '#0891B2',
  'ภาษาต่างประเทศ': '#8B6B45',
}

/**
 * รหัสวิชา สพฐ. แบบ ท11101 = อักษร + 5 หลัก
 * - หลักที่ 1 หลังอักษร: ระดับ (1=ประถม, 2=ม.ต้น, 3=ม.ปลาย)
 * - หลักที่ 2: ชั้นในระดับนั้น (ป.1–6 หรือ ม.1–3)
 * ตัวอย่าง: ท11101 → ป.1 · ท12101 → ป.2 · ค21101 → ม.1
 */
function gradeFromSubjectCode(code: string): number | null {
  const digits = String(code || '').replace(/\D/g, '')
  if (digits.length < 2) return null
  const n = Number(digits[1])
  return n >= 1 && n <= 6 ? n : null
}

function bandFromSubjectCode(code: string): 'ประถม' | 'ม.ต้น' | 'ม.ปลาย' | null {
  const digits = String(code || '').replace(/\D/g, '')
  if (!digits.length) return null
  if (digits[0] === '1') return 'ประถม'
  if (digits[0] === '2') return 'ม.ต้น'
  if (digits[0] === '3') return 'ม.ปลาย'
  return null
}

function gradeLabelFromCode(code: string): string {
  const band = bandFromSubjectCode(code)
  const grade = gradeFromSubjectCode(code)
  if (!band || !grade) {
    const nameTail = String(code || '')
    return nameTail ? '—' : ''
  }
  if (band === 'ประถม') return `ป.${grade}`
  if (band === 'ม.ต้น') return `ม.${grade}`
  return `ม.${grade + 3}` // ม.ปลาย เกรด 1–3 → ม.4–6
}

function gradeLabelFromSubject(s: { code: string; name?: string }): string {
  const fromCode = gradeLabelFromCode(s.code)
  if (fromCode && fromCode !== '—') return fromCode
  const m = String(s.name || '').match(/(\d+)\s*$/)
  return m ? `ป.${m[1]}` : '—'
}

function deriveGroup(code: string) {
  return CODE_GROUP[code.trim().charAt(0)] || SUBJECT_GROUPS[0]
}

type GridRow = { code: string; name: string; type: string; hours: string }
const GRID_COLS = [
  { key: 'code' as const, label: 'รหัสวิชา', w: 110 },
  { key: 'name' as const, label: 'ชื่อวิชา', w: 260 },
  { key: 'type' as const, label: 'ประเภท', w: 100 },
  { key: 'hours' as const, label: 'ชม./ปี', w: 80 },
]
const blankRow = (): GridRow => ({ code: '', name: '', type: '', hours: '' })

type ParsedRow = {
  code: string
  name: string
  short_name: string | null
  subject_group: string
  type: string
  hours_per_year: number
  credits: number
  max_score: number
  sort_order: number
}

function gridToRows(grid: GridRow[]): ParsedRow[] {
  const out: ParsedRow[] = []
  const seen = new Set<string>()
  for (const row of grid) {
    const code = row.code.trim()
    const name = row.name.trim()
    if (!code || !name || !/\d/.test(code)) continue
    const hours = parseInt((row.hours || '').replace(/[^0-9]/g, ''), 10) || 0
    const grade = gradeFromSubjectCode(code) ?? 99
    const r: ParsedRow = {
      code,
      name,
      short_name: null,
      subject_group: deriveGroup(code),
      type: row.type.includes('เพิ่ม') ? 'เพิ่มเติม' : 'พื้นฐาน',
      hours_per_year: hours,
      credits: Math.round((hours / 40) * 2) / 2,
      max_score: 100,
      sort_order: grade * 100,
    }
    if (seen.has(code)) {
      out[out.findIndex(x => x.code === code)] = r
    } else {
      seen.add(code)
      out.push(r)
    }
  }
  return out
}

export default function DistrictSubjectsPage() {
  const [subjects, setSubjects] = useState<GlobalSubject[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<Draft>(empty)
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [pasteSaving, setPasteSaving] = useState(false)
  const [grid, setGrid] = useState<GridRow[]>(() => Array.from({ length: 12 }, blankRow))
  const { notify, AlertModal } = useAppAlert()

  const validRows = useMemo(() => gridToRows(grid), [grid])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setSubjects(await fetchGlobalSubjects())
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'โหลดไม่สำเร็จ')
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return subjects.filter(s => {
      const matchQ = !q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      const matchG = !filterGroup || s.subject_group === filterGroup
      const label = gradeLabelFromSubject(s)
      const matchGrade = !filterGrade || label === filterGrade
      return matchQ && matchG && matchGrade
    })
  }, [subjects, search, filterGroup, filterGrade])

  function openAdd() {
    setDraft({ ...empty })
    setShowForm(true)
  }

  function openEdit(s: GlobalSubject) {
    setDraft({
      id: s.id,
      code: s.code,
      name: s.name,
      short_name: s.short_name || '',
      subject_group: s.subject_group,
      type: s.type || 'พื้นฐาน',
      hours_per_year: s.hours_per_year || 0,
      credits: Number(s.credits) || 0,
      max_score: s.max_score || 100,
      sort_order: s.sort_order || 0,
    })
    setShowForm(true)
  }

  function openPaste() {
    setGrid(Array.from({ length: 12 }, blankRow))
    setShowPaste(true)
  }

  function clearGrid() {
    setGrid(Array.from({ length: 12 }, blankRow))
  }

  function setCell(rowIndex: number, key: keyof GridRow, value: string) {
    setGrid(prev => {
      const next = [...prev]
      next[rowIndex] = { ...next[rowIndex], [key]: value }
      return next
    })
  }

  function onCellPaste(rowIndex: number, colIndex: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const lines = text.replace(/\r/g, '').split('\n').filter((l, i, arr) => l.length > 0 || i < arr.length - 1)
    setGrid(prev => {
      const next = [...prev]
      lines.forEach((line, li) => {
        const rowIdx = rowIndex + li
        while (next.length <= rowIdx) next.push(blankRow())
        const cells = line.split('\t')
        cells.forEach((val, ci) => {
          const colIdx = colIndex + ci
          if (colIdx < GRID_COLS.length) {
            next[rowIdx] = { ...next[rowIdx], [GRID_COLS[colIdx].key]: val.trim() }
          }
        })
      })
      return next
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const grade = gradeFromSubjectCode(draft.code)
    const { error } = await saveGlobalSubject(draft.id || null, {
      code: draft.code,
      name: draft.name,
      short_name: draft.short_name,
      subject_group: draft.subject_group,
      type: draft.type,
      hours_per_year: draft.hours_per_year,
      credits: draft.credits,
      max_score: draft.max_score,
      sort_order: draft.sort_order || (grade ? grade * 100 : 0),
    })
    setSaving(false)
    if (error) { notify('error', error); return }
    notify('success', draft.id ? 'อัปเดตรายวิชากลางแล้ว' : 'เพิ่มรายวิชากลางแล้ว')
    setShowForm(false)
    load()
  }

  async function handleDelete(s: GlobalSubject) {
    if (!confirm(`ลบรายวิชา ${s.code} ${s.name}?`)) return
    const { error } = await deleteGlobalSubject(s.id)
    if (error) notify('error', error)
    else { notify('success', 'ลบแล้ว'); load() }
  }

  async function handleBulkSave() {
    if (!validRows.length) {
      notify('error', 'ยังไม่มีแถวที่พร้อมบันทึก — กรอกรหัสและชื่อวิชา หรือวางจาก Excel')
      return
    }
    setPasteSaving(true)
    const { error, count } = await bulkUpsertGlobalSubjects(validRows)
    setPasteSaving(false)
    if (error) { notify('error', error); return }
    notify('success', `บันทึก ${count} รายวิชาเรียบร้อย`)
    setShowPaste(false)
    clearGrid()
    load()
  }

  const gradeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of subjects) {
      const label = gradeLabelFromSubject(s)
      if (label !== '—') set.add(label)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'th'))
  }, [subjects])

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">Central curriculum</span>
          <h1 className="page-title">โครงสร้างรายวิชากลาง</h1>
          <p className="page-subtitle">
            แม่แบบรายวิชาของระบบ — โรงเรียนสามารถนำเข้าไปใช้ได้ {subjects.length.toLocaleString()} รายการ
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={openPaste}>วางจากตาราง</button>
          <button type="button" className="btn btn-primary" onClick={openAdd}>+ เพิ่มรายวิชา</button>
        </div>
      </div>

      <AlertModal />

      <div className="filter-bar control-card">
        <input
          className="form-input"
          placeholder="ค้นหารหัสหรือชื่อวิชา..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, maxWidth: 320 }}
        />
        <select className="form-input" value={filterGrade} onChange={e => setFilterGrade(e.target.value)} style={{ width: 120 }}>
          <option value="">ทุกชั้น</option>
          {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="form-input" value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={{ width: 220 }}>
          <option value="">กลุ่มสาระทั้งหมด</option>
          {SUBJECT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="data-card">
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>
            {subjects.length === 0 ? 'ยังไม่มีรายวิชากลาง — กดวางจากตารางหรือเพิ่มรายวิชา' : 'ไม่พบรายวิชาที่ค้นหา'}
          </div>
        ) : (
          <table className="thai-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>รหัส</th>
                <th>ชื่อวิชา</th>
                <th style={{ width: 70 }}>ชั้น</th>
                <th style={{ width: 170 }}>กลุ่มสาระ</th>
                <th style={{ width: 90 }}>ประเภท</th>
                <th style={{ width: 70 }}>ชม./ปี</th>
                <th style={{ width: 70 }}>นก.</th>
                <th style={{ width: 110 }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 700 }}>{s.code}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    {s.short_name && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.short_name}</div>}
                  </td>
                  <td style={{ fontWeight: 700, color: '#8B6B45' }}>{gradeLabelFromSubject(s)}</td>
                  <td style={{ fontSize: 13 }}>{s.subject_group}</td>
                  <td style={{ fontSize: 13 }}>{s.type}</td>
                  <td style={{ textAlign: 'center' }}>{s.hours_per_year}</td>
                  <td style={{ textAlign: 'center' }}>{s.credits}</td>
                  <td>
                    <button type="button" onClick={() => openEdit(s)} style={{ fontSize: 13, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginRight: 8 }}>แก้ไข</button>
                    <button type="button" onClick={() => handleDelete(s)} style={{ fontSize: 13, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer' }}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="section-title" style={{ marginBottom: 14 }}>{draft.id ? 'แก้ไขรายวิชากลาง' : 'เพิ่มรายวิชากลาง'}</div>
            <form onSubmit={handleSave} className="form-grid">
              <div>
                <label className="form-label">รหัสวิชา *</label>
                <input className="form-input" required value={draft.code}
                  onChange={e => {
                    const code = e.target.value
                    setDraft(d => ({
                      ...d,
                      code,
                      subject_group: d.id ? d.subject_group : deriveGroup(code),
                    }))
                  }}
                  placeholder="ท11101" />
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                  ชั้นจากรหัส: <b style={{ color: '#8B6B45' }}>{gradeLabelFromCode(draft.code) || '—'}</b>
                  {' '}· เช่น ท11101 = ป.1, ท12101 = ป.2
                </div>
              </div>
              <div>
                <label className="form-label">ชื่อย่อ</label>
                <input className="form-input" value={draft.short_name} onChange={e => setDraft(d => ({ ...d, short_name: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">ชื่อวิชา *</label>
                <input className="form-input" required value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">กลุ่มสาระ *</label>
                <select className="form-input" value={draft.subject_group} onChange={e => setDraft(d => ({ ...d, subject_group: e.target.value }))}>
                  {SUBJECT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">ประเภท</label>
                <select className="form-input" value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}>
                  <option value="พื้นฐาน">พื้นฐาน</option>
                  <option value="เพิ่มเติม">เพิ่มเติม</option>
                </select>
              </div>
              <div>
                <label className="form-label">ชั่วโมง/ปี</label>
                <input className="form-input" type="number" value={draft.hours_per_year} onChange={e => setDraft(d => ({ ...d, hours_per_year: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="form-label">หน่วยกิต</label>
                <input className="form-input" type="number" step="0.5" value={draft.credits} onChange={e => setDraft(d => ({ ...d, credits: Number(e.target.value) }))} />
              </div>
              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setShowForm(false)}>ยกเลิก</button>
                <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaste && (
        <div className="modal-backdrop" onClick={() => !pasteSaving && setShowPaste(false)}>
          <div className="modal-card" style={{ maxWidth: 1100, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}>วางจากตาราง</div>
                <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.55 }}>
                  คัดลอกจาก Excel แล้ว <b>คลิกช่องมุมซ้ายบน → Ctrl+V</b> · คอลัมน์: รหัส · ชื่อ · ประเภท · ชม./ปี
                  <br />
                  ชั้นอ่านจากรหัสอัตโนมัติ เช่น <code>ท11101</code> = ป.1 · <code>ท12101</code> = ป.2 · กลุ่มสาระจากตัวอักษรนำ
                </p>
              </div>
              <button type="button" onClick={() => { setShowPaste(false); clearGrid() }} disabled={pasteSaving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                ปิด
              </button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)' }}>
                    <th style={{ width: 36, padding: '8px 6px', color: 'var(--text-3)', fontWeight: 500, fontSize: 12 }}>#</th>
                    {GRID_COLS.map(c => (
                      <th key={c.key} style={{ width: c.w, padding: '8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', borderLeft: '1px solid var(--border)' }}>{c.label}</th>
                    ))}
                    <th style={{ width: 72, padding: '8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', borderLeft: '1px solid var(--border)' }}>ชั้น</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', borderLeft: '1px solid var(--border)' }}>กลุ่มสาระ</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, r) => {
                    const grp = row.code.trim() ? deriveGroup(row.code) : ''
                    const grade = row.code.trim() ? gradeLabelFromCode(row.code) : ''
                    return (
                      <tr key={r}>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, borderTop: '1px solid var(--border)' }}>{r + 1}</td>
                        {GRID_COLS.map((c, ci) => (
                          <td key={c.key} style={{ borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)', padding: 0 }}>
                            <input
                              value={row[c.key]}
                              onChange={e => setCell(r, c.key, e.target.value)}
                              onPaste={e => onCellPaste(r, ci, e)}
                              placeholder={c.key === 'code' ? 'ท11101' : c.key === 'name' ? 'ภาษาไทย1' : c.key === 'type' ? 'พื้นฐาน' : '200'}
                              style={{
                                width: '100%', border: 'none', outline: 'none', padding: '8px', fontSize: 13,
                                background: 'transparent', fontFamily: 'inherit', boxSizing: 'border-box',
                              }}
                            />
                          </td>
                        ))}
                        <td style={{
                          borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
                          padding: '8px', fontSize: 13, fontWeight: 700, color: grade && grade !== '—' ? '#8B6B45' : 'var(--text-3)',
                        }}>
                          {grade || '—'}
                        </td>
                        <td style={{
                          borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
                          padding: '8px', fontSize: 12, color: grp ? (GROUP_COLOR[grp] || '#374151') : 'var(--text-3)',
                        }}>
                          {grp || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setGrid(g => [...g, ...Array.from({ length: 5 }, blankRow)])} className="btn btn-secondary" style={{ fontSize: 13 }}>+ เพิ่มแถว</button>
              <button type="button" onClick={clearGrid} className="btn btn-secondary" style={{ fontSize: 13 }}>ล้างตาราง</button>
              <span style={{ fontSize: 13, color: 'var(--text-3)', marginLeft: 'auto' }}>
                พร้อมบันทึก <b style={{ color: 'var(--primary)' }}>{validRows.length}</b> วิชา
              </span>
              <button type="button" onClick={() => { setShowPaste(false); clearGrid() }} disabled={pasteSaving} className="btn btn-secondary">ยกเลิก</button>
              <LoadingButton loading={pasteSaving} onClick={handleBulkSave} disabled={validRows.length === 0}>
                บันทึก {validRows.length} วิชา
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
