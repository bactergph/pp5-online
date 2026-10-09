'use client'

import { useEffect, useState } from 'react'
import { fetchPeriodTimes, savePeriodTimes } from '@/app/schedules/actions'
import { DEFAULT_PERIOD_TIMES, moveLunchBreak, validatePeriodTimes, type PeriodTimeRow } from '@/lib/schedule-helpers'
import AppAlertModal from '@/components/AppAlertModal'

const STYLES = `
  .period-workspace {max-width:1060px;margin:0 auto;}
  .period-workspace .schedule-head {padding:24px;border-radius:18px;background:#fff;border:1px solid #ddd5c9;}
  .period-workspace .schedule-head h1 {font-size:26px;color:#30271d;}
  .period-workspace .schedule-head p {font-size:14px;line-height:1.7;font-weight:400;}
  .period-workspace .period-summary {display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}
  .period-workspace .period-summary span {background:#f3eee5;border-radius:8px;padding:8px 12px;font-size:13px;color:#57432c;}
  .period-workspace .period-table th {background:#ebe3d6;font-size:14px;color:#111;padding:14px;}
  .period-workspace .period-table td {padding:14px;}
  .period-workspace .period-table input {min-height:44px;font:inherit;font-size:14px;}
  .period-workspace .period-actions {padding:16px 0;justify-content:space-between;}
  .period-workspace .period-btn {min-height:42px;font-size:14px;}
  .period-workspace button:disabled {opacity:.5;cursor:not-allowed;}
  .period-lunch-setting {display:grid;gap:10px;padding:20px;background:#fff;border:1px solid #ddd5c9;border-radius:14px;}
  .period-lunch-setting label {font-size:16px;font-weight:700;color:#30271d;}
  .period-lunch-setting select {font:inherit;padding:12px;border:1px solid #bfb6a7;border-radius:8px;max-width:320px;background:white;}
  .period-lunch-setting p {margin:0;font-size:14px;line-height:1.7;color:#655746;}
  .period-workspace .period-error {color:#a32323;background:#fff1f0;padding:12px;border-radius:8px;font-size:14px;}
  .schedule-page { display: grid; gap: 14px; }
  .schedule-head h1 { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .schedule-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: #64748B; }
  .period-info {
    padding: 12px 14px; border-radius: 12px; border: 1px solid #EFE6D8; background: #F5EDE3;
    color: #5C4330; font-size: 12.5px; font-weight: 700;
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
    border-color: #C49212; background: #C49212; color: #fff;
  }
  .schedule-empty { padding: 28px; text-align: center; color: #64748B; font-size: 13px; font-weight: 700; }
`

export default function PeriodTimesEntry() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [times, setTimes] = useState<PeriodTimeRow[]>([])
  const [isDefault, setIsDefault] = useState(true)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)

  useEffect(() => {
    let active=true
    async function load() {
    try {
      const data = await fetchPeriodTimes()
      if (!active) return
      setTimes(data.times as PeriodTimeRow[])
      setIsDefault(data.isDefault)
    } catch (e) {
      if (!active) return
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      if(active) setLoading(false)
    }
    }
    void load()
    return ()=>{active=false}
  },[])

  function updateRow(index: number, field: keyof PeriodTimeRow, value: string | number | boolean) {
    setTimes(current => current.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  const teachingCount = times.filter(t => !t.is_break).length
  const invalid = validatePeriodTimes(times)
  const lunchIndex = times.findIndex(t=>t.is_break)
  const morningCount = times.slice(0,lunchIndex).filter(t=>!t.is_break).length
  function changeLunch(afterPeriod:number) {
    try {setTimes(moveLunchBreak(times,afterPeriod))}
    catch(e) {setAlert({type:'error',title:'ย้ายช่วงพักไม่สำเร็จ',message:e instanceof Error?e.message:'กรุณาตรวจสอบเวลา'})}
  }
  function addPeriod() {
    if (teachingCount >= 8) return
    const last = times[times.length - 1]
    const [h,m] = last.end_time.split(':').map(Number)
    const end = Math.min(1439, h * 60 + m + 50)
    setTimes([...times, {period:teachingCount+1,label:`คาบที่ ${teachingCount+1}`,start_time:last.end_time,end_time:`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`,is_break:false,sort_order:times.length+1}])
  }

  async function handleSave() {
    if (invalid) { setAlert({type:'error',title:'ตรวจสอบเวลาคาบ',message:invalid}); return }
    setSaving(true)
    try {
      await savePeriodTimes(times.map((row, index) => ({ ...row, label: !row.is_break && /^คาบ(?:ที่)?\s*\d+$/.test(row.label) ? `คาบที่ ${index + 1}` : row.label })))
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
      <div className="schedule-page period-workspace">
        <div className="schedule-head">
          <h1>เวลาเรียนและพักเที่ยง</h1>
          <p>กำหนดเวลาแบบ 24 ชั่วโมง เพิ่มคาบเรียนได้สูงสุด 8 คาบต่อวัน พร้อมคาบพักเที่ยง</p>
          <div className="period-summary"><span>{times.length} คาบรวมพักเที่ยง</span><span>เรียน {teachingCount} คาบ · พัก {times.length-teachingCount} คาบ</span><span>ช่วงเช้า {morningCount} คาบ · ช่วงบ่าย {teachingCount-morningCount} คาบ</span></div>
        </div>

        <div className="period-info">
          {isDefault
            ? 'กำลังใช้ค่าเริ่มต้นประถม (6 คาบ) — บันทึกเพื่อกำหนดเวลาสำหรับโรงเรียน'
            : 'ใช้เวลาที่กำหนดสำหรับโรงเรียนแล้ว'}
        </div>

        <div className="period-lunch-setting">
          <label htmlFor="lunch-after-period">พักเที่ยงหลังคาบ</label>
          <select id="lunch-after-period" value={morningCount} disabled={saving} onChange={e=>changeLunch(Number(e.target.value))}>
            {times.map((t,index)=>!t.is_break && <option key={t.period} value={t.period}>หลังคาบที่ {index+1}</option>)}
          </select>
          <p>เมื่อเปลี่ยนคาบก่อนพัก ระบบจะเรียงเวลาใหม่โดยคงระยะเวลาแต่ละคาบและช่วงพักไว้ สามารถปรับเวลาเริ่มและสิ้นสุดในตารางด้านล่างได้ก่อนบันทึก</p>
        </div>
        <div className="period-table-wrap">
          <table className="period-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>คาบ</th>
                <th>ชื่อ</th>
                <th style={{ width: 120 }}>เริ่ม (24 ชม.)</th>
                <th style={{ width: 120 }}>สิ้นสุด (24 ชม.)</th>
                <th style={{ width: 80 }}>พัก</th>
                <th style={{width:90}}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {times.map((row, index) => (
                <tr key={`${row.period}-${row.sort_order}-${index}`} className={row.is_break ? 'is-break' : ''}>
                  <td>{index + 1}{row.is_break && <span style={{display:'block',fontSize:11}}>พักเที่ยง</span>}</td>
                  <td>
                    <input
                      value={!row.is_break && /^คาบ(?:ที่)?\s*\d+$/.test(row.label) ? `คาบที่ ${index + 1}` : row.label}
                      disabled={saving}
                      aria-label={`ชื่อ ${row.is_break ? 'พักเที่ยง' : `คาบ ${row.period}`}`}
                      onChange={e => updateRow(index, 'label', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={row.start_time}
                      type="text" inputMode="numeric" maxLength={5} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" disabled={saving} aria-label={`เวลาเริ่ม ${row.label} แบบ 24 ชั่วโมง`}
                      onChange={e => updateRow(index, 'start_time', e.target.value)}
                      placeholder="08:30"
                    />
                  </td>
                  <td>
                    <input
                      value={row.end_time}
                      type="text" inputMode="numeric" maxLength={5} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" disabled={saving} aria-label={`เวลาสิ้นสุด ${row.label} แบบ 24 ชั่วโมง`}
                      onChange={e => updateRow(index, 'end_time', e.target.value)}
                      placeholder="09:20"
                    />
                  </td>
                  <td>{row.is_break ? 'พัก' : 'เรียน'}</td>
                  <td>{!row.is_break && row.period===teachingCount && teachingCount>1 && <button type="button" className="period-btn" disabled={saving} onClick={()=>setTimes(times.filter((_,i)=>i!==index))} aria-label={`ลบคาบ ${row.period}`}>ลบ</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="period-info">ใช้เวลาแบบ 24 ชั่วโมง เช่น 08:30 และ 13:30 · พักเที่ยงนับเป็นหนึ่งคาบในลำดับที่แสดง และไม่ใช้จัดวิชาเรียน</p>

        {invalid && <div className="period-error" role="alert">{invalid}</div>}
        <div className="period-actions">
          <button type="button" className="period-btn" disabled={saving || teachingCount>=8} onClick={addPeriod}>+ เพิ่มคาบเรียน ({teachingCount}/8)</button>
          <button type="button" className="period-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกเวลาคาบ'}
          </button>
          <button type="button" className="period-btn" disabled={saving} onClick={resetDefault}>คืนค่าเริ่มต้น 6 คาบ</button>
        </div>
      </div>

      {alert && (
        <AppAlertModal open type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
    </>
  )
}
