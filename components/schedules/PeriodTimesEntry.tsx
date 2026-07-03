'use client'

import { useEffect, useState } from 'react'
import { fetchPeriodTimes, savePeriodTimes } from '@/app/schedules/actions'
import { DEFAULT_PERIOD_TIMES, type PeriodTimeRow } from '@/lib/schedule-helpers'
import AppAlertModal from '@/components/AppAlertModal'

const STYLES = `
  .schedule-page { display: grid; gap: 14px; }
  .schedule-head h1 { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .schedule-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: #64748B; }
  .period-info {
    padding: 12px 14px; border-radius: 12px; border: 1px solid #E0E7FF; background: #EEF2FF;
    color: #3730A3; font-size: 12.5px; font-weight: 700;
  }
  .period-table-wrap {
    overflow: auto; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .period-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .period-table th, .period-table td {
    padding: 10px 12px; border-bottom: 1px solid #F1F5F9; text-align: left;
  }
  .period-table th {
    background: #F8FAFC; font-size: 10px; font-weight: 900; color: #64748B;
  }
  .period-table input {
    width: 100%; min-height: 34px; border: 1px solid #CBD5E1; border-radius: 8px;
    padding: 0 10px; font-size: 12px; font-weight: 700;
  }
  .period-table tr.is-break td { background: #FFFBEB; }
  .period-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .period-btn {
    min-height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid #CBD5E1;
    background: #fff; color: #334155; font-size: 12px; font-weight: 800; cursor: pointer;
  }
  .period-btn.primary {
    border-color: #7C3AED; background: #7C3AED; color: #fff;
  }
  .schedule-empty { padding: 28px; text-align: center; color: #64748B; font-size: 13px; font-weight: 700; }
`

export default function PeriodTimesEntry() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [times, setTimes] = useState<PeriodTimeRow[]>([])
  const [isDefault, setIsDefault] = useState(true)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const data = await fetchPeriodTimes()
      setTimes(data.times as PeriodTimeRow[])
      setIsDefault(data.isDefault)
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setLoading(false)
    }
  }

  function updateRow(index: number, field: keyof PeriodTimeRow, value: string | number | boolean) {
    setTimes(current => current.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await savePeriodTimes(times)
      setIsDefault(false)
      setAlert({ type: 'success', title: 'บันทึกสำเร็จ', message: 'เวลาคาบเรียนถูกบันทึกแล้ว' })
    } catch (e) {
      setAlert({ type: 'error', title: 'บันทึกไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setSaving(false)
    }
  }

  function resetDefault() {
    if (!window.confirm('คืนค่าเวลาคาบเรียนเป็นค่าเริ่มต้น?')) return
    setTimes([...DEFAULT_PERIOD_TIMES])
  }

  if (loading) return <div className="schedule-empty">กำลังโหลด...</div>

  return (
    <>
      <style>{STYLES}</style>
      <div className="schedule-page">
        <div className="schedule-head">
          <h1>ตั้งค่าเวลาคาบเรียน</h1>
          <p>กำหนดเวลาเริ่ม–สิ้นสุดของแต่ละคาบ (แสดงในหัวตารางเรียน)</p>
        </div>

        <div className="period-info">
          {isDefault
            ? 'กำลังใช้ค่าเริ่มต้นของระบบ — บันทึกเพื่อกำหนดเวลาสำหรับโรงเรียน'
            : 'ใช้เวลาที่กำหนดสำหรับโรงเรียนแล้ว'}
        </div>

        <div className="period-table-wrap">
          <table className="period-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>คาบ</th>
                <th>ชื่อ</th>
                <th style={{ width: 120 }}>เริ่ม</th>
                <th style={{ width: 120 }}>สิ้นสุด</th>
                <th style={{ width: 80 }}>พัก</th>
              </tr>
            </thead>
            <tbody>
              {times.map((row, index) => (
                <tr key={`${row.period}-${row.sort_order}-${index}`} className={row.is_break ? 'is-break' : ''}>
                  <td>{row.is_break ? '—' : row.period}</td>
                  <td>
                    <input
                      value={row.label}
                      onChange={e => updateRow(index, 'label', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={row.start_time}
                      onChange={e => updateRow(index, 'start_time', e.target.value)}
                      placeholder="08:30"
                    />
                  </td>
                  <td>
                    <input
                      value={row.end_time}
                      onChange={e => updateRow(index, 'end_time', e.target.value)}
                      placeholder="09:20"
                    />
                  </td>
                  <td>{row.is_break ? 'พัก' : 'เรียน'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="period-actions">
          <button type="button" className="period-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกเวลาคาบ'}
          </button>
          <button type="button" className="period-btn" onClick={resetDefault}>คืนค่าเริ่มต้น</button>
        </div>
      </div>

      {alert && (
        <AppAlertModal open type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
    </>
  )
}
