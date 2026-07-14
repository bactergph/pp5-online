'use client'
import { useState, useEffect } from 'react'
import LoadingButton from '@/components/LoadingButton'
import {
  fetchAcademicYearsForHolidays,
  fetchGlobalHolidaysForYear,
  fetchHolidays,
  fetchWeekendSchoolDays,
  bulkAddHolidays,
  addWeekendSchoolDay,
  deleteHoliday,
  deleteWeekendSchoolDay,
  syncHolidaysFromGlobal,
} from '../actions'
import { formatThaiDate, parseHolidayPasteText } from '@/lib/thaiDate'
import {
  HOLIDAY_GRID_COLS,
  applyHolidayGridPaste,
  blankHolidayRow,
  holidayGridToPasteText,
  type HolidayGridRow,
} from '@/lib/holiday-grid'
import { useAppAlert } from '@/lib/use-app-alert'

type Holiday = { id: string; academic_year_id: string; date: string; name: string }
type WeekendSchoolDay = { id: string; academic_year_id: string; date: string; name: string }
type GlobalHoliday = { id: string; year_be: number; date: string; name: string }
type AcademicYear = { id: string; year_be: number; is_active: boolean }

const selectedYearLabel = (years: AcademicYear[], yearId: string) => {
  const year = years.find(item => item.id === yearId)
  if (!year) return ''
  return `${year.year_be}${year.is_active ? ' (ปัจจุบัน)' : ''}`
}

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [weekendSchoolDays, setWeekendSchoolDays] = useState<WeekendSchoolDay[]>([])
  const [globalHolidays, setGlobalHolidays] = useState<GlobalHoliday[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showHolidayTablePopup, setShowHolidayTablePopup] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [grid, setGrid] = useState<HolidayGridRow[]>(() => [blankHolidayRow()])
  const { notify, AlertModal } = useAppAlert()

  useEffect(() => { loadAcademicYears() }, [])

  useEffect(() => {
    if (selectedYear) loadHolidaysForYear(selectedYear)
  }, [selectedYear])

  async function loadAcademicYears() {
    const years = await fetchAcademicYearsForHolidays()
    setAcademicYears(years)
    const active = years.find((y: AcademicYear) => y.is_active)
    if (active) setSelectedYear(active.id)
    else if (years.length > 0) setSelectedYear(years[0].id)
    setLoading(false)
  }

  async function loadHolidaysForYear(yearId: string) {
    const [data, globalData, weekendData] = await Promise.all([
      fetchHolidays(yearId),
      fetchGlobalHolidaysForYear(yearId),
      fetchWeekendSchoolDays(yearId),
    ])
    setHolidays(data)
    setGlobalHolidays(globalData as GlobalHoliday[])
    setWeekendSchoolDays(weekendData as WeekendSchoolDay[])
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบวันหยุดนี้?')) return
    await deleteHoliday(id)
    loadHolidaysForYear(selectedYear)
  }

  async function handleImportRows(rows: { date: string; name: string }[]) {
    if (!selectedYear || !rows.length) {
      notify('error', 'ไม่พบรายการที่นำเข้าได้ ตรวจรูปแบบวันที่และชื่อวันหยุด')
      return
    }
    setSaving(true)
    const { error, added, skipped } = await bulkAddHolidays(selectedYear, rows)
    setSaving(false)
    if (error) {
      notify('error', error)
      return
    }
    notify('success', `นำเข้า ${added} รายการ${skipped ? ` · ข้ามซ้ำ ${skipped}` : ''}`)
    setShowHolidayTablePopup(false)
    clearGrid()
    loadHolidaysForYear(selectedYear)
  }

  async function handleImportPaste() {
    const parsed = parseHolidayPasteText(holidayGridToPasteText(grid)).map(row => ({ date: row.date, name: row.name }))
    await handleImportRows(parsed)
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
    clearGrid()
    setShowHolidayTablePopup(true)
  }

  async function handleAddWeekendSchoolDay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const formData = new FormData(e.currentTarget)
    const { error } = await addWeekendSchoolDay(
      selectedYear,
      formData.get('weekendDate') as string,
      formData.get('weekendName') as string,
    )
    setSaving(false)
    if (error) {
      notify('error', 'เพิ่มวันเปิดสอนไม่สำเร็จ: ' + error)
    } else {
      notify('success', 'เพิ่มวันเปิดสอนเสาร์-อาทิตย์เรียบร้อย')
      ;(e.target as HTMLFormElement).reset()
      loadHolidaysForYear(selectedYear)
    }
  }

  async function handleDeleteWeekendSchoolDay(id: string) {
    if (!confirm('ลบวันเปิดสอนนี้?')) return
    const { error } = await deleteWeekendSchoolDay(id)
    if (error) notify('error', 'ลบไม่สำเร็จ: ' + error)
    else loadHolidaysForYear(selectedYear)
  }

  async function handleSync() {
    if (!selectedYear) return
    setSyncing(true)
    const { error, added, skipped } = await syncHolidaysFromGlobal(selectedYear)
    setSyncing(false)
    if (error) {
      notify('error', 'ดึงข้อมูลจากส่วนกลางไม่สำเร็จ: ' + error)
      return
    }
    notify('success', `ดึงข้อมูลสำเร็จ เพิ่ม ${added} รายการ${skipped ? ` · ข้ามรายการซ้ำ ${skipped}` : ''}`)
    loadHolidaysForYear(selectedYear)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: 'var(--text-3)' }}>
        กำลังโหลด...
      </div>
    )
  }

  const yearLabel = selectedYearLabel(academicYears, selectedYear)

  return (
    <div className="page-stack">
      <AlertModal />

      <section className="control-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>ปฏิทินวันหยุด</div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
            จัดการวันหยุดและวันเปิดสอนพิเศษตามปีการศึกษา
          </p>
        </div>
        <div style={{ minWidth: 200 }}>
          <label className="form-label">ปีการศึกษา</label>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
          >
            {academicYears.map(y => (
              <option key={y.id} value={y.id}>
                {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div className="section-title" style={{ marginBottom: 6 }}>วันหยุดโรงเรียน</div>
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
              รายการวันหยุดของโรงเรียน ปี {yearLabel || '—'} · {holidays.length} รายการ
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <LoadingButton
              loading={syncing}
              loadingText="กำลังดึงข้อมูล..."
              onClick={handleSync}
              disabled={!selectedYear || globalHolidays.length === 0}
              className="btn btn-secondary"
            >
              ใช้จากข้อมูลกลาง
            </LoadingButton>
            <button type="button" onClick={openHolidayPopup} className="btn btn-primary">
              + เพิ่มวันหยุด
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="thai-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 56, textAlign: 'center' }}>#</th>
                <th style={{ width: 220 }}>วันที่</th>
                <th>ชื่อวันหยุด</th>
                <th style={{ width: 88, textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {holidays.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 36 }}>
                    ยังไม่มีวันหยุดในปีนี้ — กด &quot;ใช้จากข้อมูลกลาง&quot; หรือ &quot;เพิ่มวันหยุด&quot;
                  </td>
                </tr>
              ) : holidays.map((holiday, index) => (
                <tr key={holiday.id}>
                  <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{index + 1}</td>
                  <td>{formatThaiDate(holiday.date)}</td>
                  <td style={{ fontWeight: 700 }}>{holiday.name}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleDelete(holiday.id)}
                      style={{ color: '#DC2626', background: 'none', border: 0, cursor: 'pointer', fontSize: 13 }}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>เปิดสอน เสาร์-อาทิตย์</div>
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
              วันที่เพิ่มตรงนี้จะไม่ถูกล็อกในหน้าธุรการชั้นเรียน และบันทึกเวลาเรียนได้เหมือนวันปกติ
            </p>
          </div>
          <span className="badge badge-success">{weekendSchoolDays.length} วัน</span>
        </div>

        <form onSubmit={handleAddWeekendSchoolDay} className="filter-bar" style={{ alignItems: 'end', marginBottom: 16 }}>
          <div style={{ flex: '0 0 200px' }}>
            <label className="form-label">วันที่เปิดสอน</label>
            <input type="date" name="weekendDate" className="form-input" required />
          </div>
          <div style={{ flex: '1 1 280px' }}>
            <label className="form-label">หมายเหตุ</label>
            <input type="text" name="weekendName" className="form-input" placeholder="เช่น เรียนชดเชย" />
          </div>
          <LoadingButton type="submit" loading={saving} loadingText="กำลังเพิ่ม..." disabled={!selectedYear}>
            + เพิ่มวันเปิดสอน
          </LoadingButton>
        </form>

        <div style={{ overflowX: 'auto' }}>
          <table className="thai-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 56, textAlign: 'center' }}>#</th>
                <th style={{ width: 220 }}>วันที่</th>
                <th>หมายเหตุ</th>
                <th style={{ width: 88, textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {weekendSchoolDays.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                    ยังไม่มีวันเสาร์-อาทิตย์ที่เปิดสอน
                  </td>
                </tr>
              ) : weekendSchoolDays.map((day, index) => (
                <tr key={day.id}>
                  <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{index + 1}</td>
                  <td>{formatThaiDate(day.date)}</td>
                  <td style={{ fontWeight: 700 }}>{day.name || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleDeleteWeekendSchoolDay(day.id)}
                      style={{ color: '#DC2626', background: 'none', border: 0, cursor: 'pointer', fontSize: 13 }}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showHolidayTablePopup && (
        <div className="modal-backdrop" onClick={() => !saving && setShowHolidayTablePopup(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 920, width: '100%', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
            onClick={event => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>เพิ่มวันหยุดจากตาราง</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                  คัดลอกจาก Excel แล้วคลิกช่องแรก · Ctrl+V · ตารางมี 2 คอลัมน์: วันที่ และ วันหยุด
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHolidayTablePopup(false)}
                disabled={saving}
                className="btn btn-ghost"
                style={{ padding: '7px 10px' }}
              >
                ปิด
              </button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)' }}>
                    {HOLIDAY_GRID_COLS.map(col => (
                      <th
                        key={col.key}
                        style={{
                          width: col.width,
                          padding: '6px 8px',
                          textAlign: 'left',
                          fontWeight: 600,
                          color: 'var(--text-2)',
                          borderLeft: '1px solid var(--border)',
                        }}
                      >
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
                            style={{
                              width: '100%',
                              border: 'none',
                              outline: 'none',
                              padding: '6px 8px',
                              fontSize: 13,
                              background: 'transparent',
                              fontFamily: 'inherit',
                            }}
                            placeholder={rowIndex === 0 ? (col.key === 'date' ? '31 พ.ค. 2569' : 'วันวิสาขบูชา') : ''}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setGrid(prev => [...prev, ...Array.from({ length: 5 }, blankHolidayRow)])}
              >
                + เพิ่มแถว
              </button>
              <button type="button" className="btn btn-secondary" onClick={clearGrid}>
                ล้างตาราง
              </button>
              <span style={{ fontSize: 13, color: 'var(--text-3)', marginLeft: 'auto', alignSelf: 'center' }}>
                วางข้อมูลแล้วกดนำเข้า
              </span>
              <button type="button" onClick={() => setShowHolidayTablePopup(false)} disabled={saving} className="btn btn-secondary">
                ยกเลิก
              </button>
              <LoadingButton loading={saving} loadingText="กำลังนำเข้า..." onClick={handleImportPaste}>
                นำเข้าจากตาราง
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
