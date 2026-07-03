'use client'
import { useEffect, useMemo, useState } from 'react'
import LoadingButton from '@/components/LoadingButton'
import { addGlobalHoliday, bulkAddGlobalHolidays, deleteGlobalHoliday, fetchGlobalHolidays, type GlobalHoliday } from './actions'
import { formatThaiDate, parseHolidayPasteText } from '@/lib/thaiDate'
import {
  HOLIDAY_GRID_COLS,
  applyHolidayGridPaste,
  blankHolidayRow,
  holidayGridToPasteText,
  type HolidayGridRow,
} from '@/lib/holiday-grid'
import { useAppAlert } from '@/lib/use-app-alert'

export default function DistrictHolidaysPage() {
  const currentYearBe = new Date().getFullYear() + 543
  const [holidays, setHolidays] = useState<GlobalHoliday[]>([])
  const [selectedYear, setSelectedYear] = useState(currentYearBe)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showHolidayPopup, setShowHolidayPopup] = useState(false)
  const [tableYearBe, setTableYearBe] = useState(currentYearBe)
  const [tableDate, setTableDate] = useState('')
  const [tableName, setTableName] = useState('')
  const [grid, setGrid] = useState<HolidayGridRow[]>(() => [blankHolidayRow()])
  const { notify, AlertModal } = useAppAlert()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await fetchGlobalHolidays()
    setHolidays(data as GlobalHoliday[])
    setLoading(false)
  }

  async function handleAddFromTable() {
    if (!tableDate || !tableName.trim()) return
    setSaving(true)
    const { error } = await addGlobalHoliday({
      year_be: Number(tableYearBe),
      date: tableDate,
      name: tableName.trim(),
    })
    setSaving(false)
    if (error) {
      notify('error', error.includes('duplicate') ? 'มีวันหยุดนี้อยู่แล้ว' : error)
      return
    }
    notify('success', 'เพิ่มวันหยุดกลางเรียบร้อยแล้ว')
    setTableDate('')
    setTableName('')
    load()
  }

  async function handleImportRows(rows: { year_be: number; date: string; name: string }[]) {
    if (!rows.length) {
      notify('error', 'ไม่พบรายการที่นำเข้าได้ ตรวจรูปแบบวันที่และชื่อวันหยุด')
      return
    }
    setSaving(true)
    const { error, added, skipped } = await bulkAddGlobalHolidays(rows)
    setSaving(false)
    if (error) {
      notify('error', error)
      return
    }
    notify('success', `นำเข้า ${added} รายการ${skipped ? ` · ข้ามซ้ำ ${skipped}` : ''}`)
    load()
  }

  async function handleImportPaste() {
    await handleImportRows(parseHolidayPasteText(holidayGridToPasteText(grid)))
  }

  function setCell(rowIndex: number, key: keyof HolidayGridRow, value: string) {
    setGrid(prev => {
      const next = [...prev]
      next[rowIndex] = { ...next[rowIndex], [key]: value }
      return next
    })
  }

  function onCellPaste(rowIndex: number, colIndex: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n') && !text.includes('\r')) return
    event.preventDefault()
    setGrid(prev => applyHolidayGridPaste(prev, rowIndex, colIndex, text))
  }

  function clearGrid() {
    setGrid([blankHolidayRow()])
  }

  function openHolidayPopup() {
    setTableYearBe(selectedYear)
    setShowHolidayPopup(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบวันหยุดกลางนี้? โรงเรียนที่ sync ไปแล้วจะไม่ถูกลบ')) return
    const { error } = await deleteGlobalHoliday(id)
    if (error) notify('error', error)
    else {
      notify('success', 'ลบวันหยุดกลางเรียบร้อยแล้ว')
      load()
    }
  }

  const yearOptions = useMemo(() => {
    const years = new Set([currentYearBe - 1, currentYearBe, currentYearBe + 1, ...holidays.map(h => h.year_be)])
    return [...years].sort((a, b) => b - a)
  }, [currentYearBe, holidays])
  const filtered = holidays.filter(h => h.year_be === selectedYear)

  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  return (
    <div className="page-stack">
      <div className="page-hero" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <span className="page-hero-kicker">Central holidays</span>
          <h1 className="page-title">วันหยุดกลาง</h1>
          <p className="page-hero-kicker">กำหนดชุดวันหยุดจาก Super Admin เพื่อให้โรงเรียนกด Sync ไปใช้ได้</p>
        </div>
        <span className="badge badge-primary">{holidays.length} รายการทั้งหมด</span>
      </div>

      <AlertModal />

      <section className="control-card">
        <div className="filter-bar" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>รายการวันหยุดกลาง</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>โรงเรียนจะดึงรายการของปี พ.ศ. ที่ตรงกับปีการศึกษาที่เลือก</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={openHolidayPopup}>
            เพิ่มวันหยุด
          </button>
        </div>
      </section>

      <section className="data-card">
        <div className="filter-bar" style={{ padding: 14, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>รายการวันหยุดกลาง</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>โรงเรียนจะดึงรายการของปี พ.ศ. ที่ตรงกับปีการศึกษาที่เลือก</p>
          </div>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="form-input" style={{ width: 160 }}>
            {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <table className="thai-table">
          <thead>
            <tr>
              <th style={{ width: 64, textAlign: 'center' }}>ที่</th>
              <th style={{ width: 180 }}>วันที่</th>
              <th>ชื่อวันหยุด</th>
              <th style={{ width: 100, textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 36 }}>ยังไม่มีวันหยุดกลางในปีนี้</td></tr>
            ) : filtered.map((holiday, index) => (
              <tr key={holiday.id}>
                <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{index + 1}</td>
                <td>{formatThaiDate(holiday.date)}</td>
                <td style={{ fontWeight: 700 }}>{holiday.name}</td>
                <td style={{ textAlign: 'center' }}>
                  <button type="button" onClick={() => handleDelete(holiday.id)} style={{ color: '#DC2626', background: 'none', border: 0, cursor: 'pointer', fontSize: 13 }}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {showHolidayPopup && (
        <div className="modal-backdrop" onClick={() => !saving && setShowHolidayPopup(false)}>
          <div className="modal-card" style={{ maxWidth: 920, width: '100%', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>ตารางวันหยุดกลาง</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>ตารางมี 2 คอลัมน์: วันที่ และ วันหยุด</p>
              </div>
              <button type="button" onClick={() => setShowHolidayPopup(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                ปิด
              </button>
            </div>

            <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: '#F8FAFC', border: '1px solid var(--border)' }}>
              <label className="form-label">วางรายการวันหยุด (Ctrl+V เหมือน Excel)</label>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-2)' }}>
                      {HOLIDAY_GRID_COLS.map(col => (
                        <th key={col.key} style={{ width: col.width, padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', borderLeft: '1px solid var(--border)' }}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {HOLIDAY_GRID_COLS.map((col, colIndex) => (
                          <td key={col.key} style={{ borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)', padding: 0 }}>
                            <input
                              value={row[col.key]}
                              onChange={e => setCell(rowIndex, col.key, e.target.value)}
                              onPaste={e => onCellPaste(rowIndex, colIndex, e)}
                              style={{ width: '100%', border: 'none', outline: 'none', padding: '6px 8px', fontSize: 13, background: 'transparent', fontFamily: 'inherit' }}
                              placeholder={rowIndex === 0 ? (col.key === 'date' ? '31 พ.ค. 2569' : 'วันวิสาขบูชา') : ''}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setGrid(prev => [...prev, ...Array.from({ length: 5 }, blankHolidayRow)])}>
                  + เพิ่มแถว
                </button>
                <button type="button" className="btn btn-secondary" onClick={clearGrid}>
                  ล้างตาราง
                </button>
                <LoadingButton loading={saving} loadingText="กำลังนำเข้า..." onClick={handleImportPaste}>
                  นำเข้าจากตาราง
                </LoadingButton>
              </div>
            </div>

            <div className="filter-bar" style={{ alignItems: 'end', marginBottom: 12 }}>
              <div style={{ flex: '0 0 130px' }}>
                <label className="form-label">ปี พ.ศ.</label>
                <input
                  type="number"
                  className="form-input"
                  value={tableYearBe}
                  onChange={e => setTableYearBe(Number(e.target.value))}
                />
              </div>
              <div style={{ flex: '0 0 220px' }}>
                <label className="form-label">วันที่</label>
                <input
                  type="date"
                  className="form-input"
                  value={tableDate}
                  onChange={e => setTableDate(e.target.value)}
                />
              </div>
              <div style={{ flex: '1 1 260px' }}>
                <label className="form-label">วันหยุด</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="เช่น วันวิสาขบูชา"
                  value={tableName}
                  onChange={e => setTableName(e.target.value)}
                />
              </div>
              <LoadingButton
                loading={saving}
                loadingText="กำลังเพิ่ม..."
                onClick={handleAddFromTable}
                disabled={!tableDate || !tableName.trim()}
              >
                เพิ่ม
              </LoadingButton>
            </div>

            <div className="data-card" style={{ borderRadius: 12 }}>
              <table className="thai-table">
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>วันที่</th>
                    <th>วันหยุด</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 36 }}>ยังไม่มีวันหยุดกลางในปีนี้</td></tr>
                  ) : filtered.map((holiday) => (
                    <tr key={holiday.id}>
                      <td>{formatThaiDate(holiday.date)}</td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontWeight: 700 }}>{holiday.name}</span>
                          <button type="button" onClick={() => handleDelete(holiday.id)} style={{ color: '#DC2626', background: 'none', border: 0, cursor: 'pointer', fontSize: 13 }}>ลบ</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
