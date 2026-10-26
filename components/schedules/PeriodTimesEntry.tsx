'use client'
import { useScheduleOperations } from './ScheduleServices'

import { useEffect, useState } from 'react'
import { DEFAULT_PERIOD_TIMES, moveLunchBreak, validatePeriodTimes, type PeriodTimeRow } from '@/lib/schedule-helpers'
import AppAlertModal from '@/components/AppAlertModal'

const STYLES = `
  .period-workspace { width:100%;max-width:1060px;min-width:0;margin:0 auto;display:grid;gap:18px;color:#1b2d4b; }
  .period-workspace .period-hero { display:block;padding:24px;border:1px solid #dce6f5;border-radius:22px;background:radial-gradient(circle at 100% 0,#dceaff88,transparent 55%),linear-gradient(120deg,#fff,#f3f7ff);box-shadow:0 4px 20px #18365b08; }
  .period-hero-heading { display:flex;align-items:center;gap:14px; }
  .period-hero-icon { display:grid;place-items:center;flex:none;width:48px;height:48px;border:1px solid #d2e1f8;border-radius:15px;background:#edf4ff;color:#235bc8; }
  .period-workspace .period-hero h1 { margin:0;font-size:24px;font-weight:700;line-height:1.5;color:#1b2d4b; }
  .period-workspace .period-hero p { margin:6px 0 0;font-size:14px;line-height:1.7;color:#60728c; }
  .period-summary { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:20px; }
  .period-summary>div { padding:12px 14px;border:1px solid #dce6f5;border-radius:13px;background:#ffffffd9; }
  .period-summary dt { margin:0;color:#60728c;font-size:12px; }
  .period-summary dd { margin:4px 0 0;font-size:19px;font-weight:700;color:#235bc8; }
  .period-summary dd small { font-size:12px;font-weight:400;color:#60728c; }
  .period-workspace .period-info { display:flex;align-items:flex-start;gap:9px;margin:0;padding:12px 15px;border:1px solid #dce6f5;border-radius:13px;background:#f1f6ff;color:#465b78;font-size:13px;line-height:1.7; }
  .period-workspace .period-info.is-saved { border-color:#bde5d4;background:#f0fbf6;color:#176b4c; }
  .period-lunch-setting { display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,240px);gap:14px 24px;align-items:center;padding:20px;border:1px solid #dce4ef;border-radius:18px;background:#fff;box-shadow:0 3px 12px #18365b05; }
  .period-lunch-setting label { display:block;font-size:16px;font-weight:700;color:#1b2d4b; }
  .period-lunch-setting p { margin:5px 0 0;font-size:13px;line-height:1.7;color:#60728c; }
  .period-lunch-setting select { width:100%;min-width:0;min-height:46px;padding:10px 12px;border:1px solid #cad8ec;border-radius:11px;background:#f8faff;color:#244264;font:inherit;font-size:14px; }
  .period-table-section { min-width:0; }
  .period-table-heading { display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px; }
  .period-table-heading h2 { margin:0;font-size:17px;font-weight:700; }
  .period-table-heading span { font-size:12px;color:#60728c; }
  .period-table-wrap { overflow:auto;border:1px solid #dce4ef;border-radius:18px;background:#fff;box-shadow:0 3px 14px #18365b05; }
  .period-table { width:100%;min-width:660px;border-collapse:collapse;font-size:14px; }
  .period-table th,.period-table td { padding:14px 16px;border-bottom:1px solid #e8eef7;text-align:left; }
  .period-table th { background:#edf4ff;color:#465b78;font-size:12px;font-weight:700;white-space:nowrap; }
  .period-table th:first-child { width:135px; }
  .period-table th:nth-child(3),.period-table th:nth-child(4) { width:145px; }
  .period-table th:last-child { width:86px; }
  .period-table tbody tr:last-child td { border-bottom:0; }
  .period-row-heading { white-space:nowrap; }
  .period-number { display:inline-grid;place-items:center;min-width:30px;height:30px;margin-right:8px;border-radius:9px;background:#edf4ff;color:#235bc8;font-weight:700; }
  .period-kind { font-size:12px;color:#60728c; }
  .period-table input { box-sizing:border-box;width:100%;min-width:0;min-height:46px;padding:10px 12px;border:1px solid #cad8ec;border-radius:11px;background:#fff;color:#1b2d4b;font:inherit;font-size:16px;line-height:1.5; }
  .period-table .period-time { min-width:96px;font-variant-numeric:tabular-nums;letter-spacing:.02em; }
  .period-workspace :is(input,select,button):focus-visible { outline:3px solid #a9c8ff;outline-offset:2px; }
  .period-table tr.is-break td { background:#fffbf1; }
  .period-table tr.is-break .period-number { background:#fff0ce;color:#946316; }
  .period-table tr.is-break .period-kind { color:#946316; }
  .period-mobile-label { display:none; }
  .period-workspace .period-actions { position:sticky;bottom:12px;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:1px solid #dce4ef;border-radius:17px;background:#fffffff5;box-shadow:0 4px 24px #18365b14; }
  .period-secondary-actions { display:flex;flex-wrap:wrap;gap:8px; }
  .period-workspace .period-btn { display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:10px 14px;border:1px solid #cad8ec;border-radius:11px;background:#fff;color:#244264;font:inherit;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer; }
  .period-workspace .period-btn.primary { border-color:#235bc8;background:linear-gradient(120deg,#2e70da,#235bc8);color:#fff;box-shadow:0 3px 8px #235bc826; }
  .period-workspace .period-btn.danger { border-color:#f2d3d8;color:#b32940; }
  .period-workspace button:disabled,.period-workspace input:disabled,.period-workspace select:disabled { opacity:.55;cursor:not-allowed; }
  .period-workspace .period-error { padding:12px 15px;border:1px solid #f2cbd2;border-radius:12px;background:#fff3f4;color:#a3233a;font-size:14px;line-height:1.7; }
  .period-empty { padding:28px;border:1px solid #dce4ef;border-radius:18px;background:#fff;color:#60728c;text-align:center; }
  .period-table-caption { position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap; }
  @media(max-width:767px) {
    .period-workspace { gap:14px; }
    .period-workspace .period-hero { padding:18px;border-radius:18px; }
    .period-workspace .period-hero h1 { font-size:20px; }
    .period-hero-icon { width:40px;height:40px;border-radius:12px; }
    .period-hero-heading { align-items:flex-start;gap:10px; }
    .period-summary { gap:7px;margin-top:16px; }
    .period-summary>div { padding:10px; }
    .period-summary dd { font-size:18px; }
    .period-summary dt,.period-summary dd small { font-size:11px; }
    .period-lunch-setting { grid-template-columns:minmax(0,1fr);gap:12px;padding:16px; }
    .period-table-heading { align-items:flex-start; }
    .period-table-heading span { max-width:140px;text-align:right; }
    .period-table-wrap { overflow:visible;border:0;border-radius:0;background:transparent;box-shadow:none; }
    .period-table,.period-table tbody { display:block;min-width:0;width:100%; }
    .period-table thead { position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%); }
    .period-table tbody { display:grid;gap:12px; }
    .period-table tr { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:16px;border:1px solid #dce4ef;border-radius:16px;background:#fff;box-shadow:0 3px 12px #18365b05; }
    .period-table td,.period-table tbody tr:last-child td { display:block;min-width:0;padding:0;border:0;background:transparent; }
    .period-table .period-row-heading { grid-column:1/-1;display:flex;align-items:center;gap:0;padding-bottom:11px;border-bottom:1px solid #e8eef7; }
    .period-number { margin-right:9px; }
    .period-kind { font-size:13px;font-weight:600; }
    .period-name-cell { grid-column:1/-1; }
    .period-mobile-label { display:block;margin-bottom:6px;color:#60728c;font-size:12px;font-weight:600; }
    .period-table .period-time { min-width:0; }
    .period-table tr.is-break { border-color:#efd9a9;background:#fffdf7; }
    .period-table tr.is-break td { background:transparent; }
    .period-table .period-manage-cell { grid-column:1/-1;text-align:right; }
    .period-manage-cell:empty { display:none; }
    .period-workspace .period-actions { bottom:8px;flex-wrap:wrap;padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom)); }
    .period-secondary-actions { width:100%; }
    .period-secondary-actions>.period-btn { flex:1;padding:10px 8px;font-size:12px; }
    .period-workspace .period-actions>.primary { width:100%; }
  }
  @media print { .period-workspace .period-actions { position:static;box-shadow:none; } }
`

export default function PeriodTimesEntry() {
  const { fetchPeriodTimes, savePeriodTimes } = useScheduleOperations()

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
  },[fetchPeriodTimes])

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

  if (loading) return <div className="period-empty" role="status">กำลังโหลดเวลาคาบเรียน…</div>

  return (
    <>
      <style>{STYLES}</style>
      <div className="schedule-page period-workspace">
        <div className="period-hero">
          <div className="period-hero-heading">
            <span className="period-hero-icon" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
            <div><h1>เวลาเรียนและพักเที่ยง</h1><p>ตั้งเวลาเรียนแต่ละคาบและช่วงพัก ใช้ร่วมกันทั้งตารางเรียนและตารางสอน</p></div>
          </div>
          <dl className="period-summary">
            <div><dt>คาบเรียนต่อวัน</dt><dd>{teachingCount} <small>/ 8 คาบ</small></dd></div>
            <div><dt>ช่วงเช้า</dt><dd>{morningCount} <small>คาบ</small></dd></div>
            <div><dt>ช่วงบ่าย</dt><dd>{teachingCount-morningCount} <small>คาบ</small></dd></div>
          </dl>
        </div>

        <div className={`period-info${isDefault ? '' : ' is-saved'}`}>
          {isDefault
            ? 'กำลังใช้ค่าเริ่มต้นประถม (6 คาบ) — บันทึกเพื่อกำหนดเวลาสำหรับโรงเรียน'
            : 'ใช้เวลาที่กำหนดสำหรับโรงเรียนแล้ว'}
        </div>

        <div className="period-lunch-setting">
          <div><label htmlFor="lunch-after-period">พักเที่ยงหลังคาบ</label><p>ระบบจะเรียงเวลาใหม่ โดยคงระยะเวลาของคาบเรียนและช่วงพักไว้</p></div>
          <select id="lunch-after-period" value={morningCount} disabled={saving} onChange={e=>changeLunch(Number(e.target.value))}>
            {times.map((t,index)=>!t.is_break && <option key={t.period} value={t.period}>หลังคาบที่ {index+1}</option>)}
          </select>
        </div>
        <section className="period-table-section" aria-labelledby="period-table-title">
        <div className="period-table-heading"><h2 id="period-table-title">เวลาของแต่ละคาบ</h2><span>รูปแบบ 24 ชั่วโมง เช่น 08:30</span></div>
        <div className="period-table-wrap">
          <table className="period-table" role="table">
            <caption className="period-table-caption">แก้ไขชื่อคาบ เวลาเริ่ม และเวลาสิ้นสุดของแต่ละคาบเรียนและช่วงพักเที่ยง</caption>
            <thead>
              <tr>
                <th scope="col">คาบ / ประเภท</th>
                <th scope="col">ชื่อคาบ</th>
                <th scope="col">เวลาเริ่ม</th>
                <th scope="col">เวลาสิ้นสุด</th>
                <th scope="col">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {times.map((row, index) => (
                <tr key={`${row.period}-${row.sort_order}-${index}`} className={row.is_break ? 'is-break' : ''}>
                  <td className="period-row-heading"><span className="period-number">{index + 1}</span><span className="period-kind">{row.is_break ? 'พักเที่ยง' : 'คาบเรียน'}</span></td>
                  <td className="period-name-cell">
                    <span className="period-mobile-label" aria-hidden="true">ชื่อคาบ</span>
                    <input
                      value={!row.is_break && /^คาบ(?:ที่)?\s*\d+$/.test(row.label) ? `คาบที่ ${index + 1}` : row.label}
                      disabled={saving}
                      aria-label={`ชื่อ ${row.is_break ? 'พักเที่ยง' : `คาบ ${row.period}`}`}
                      onChange={e => updateRow(index, 'label', e.target.value)}
                    />
                  </td>
                  <td>
                    <span className="period-mobile-label" aria-hidden="true">เวลาเริ่ม</span>
                    <input
                      className="period-time"
                      value={row.start_time}
                      type="text" inputMode="numeric" maxLength={5} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" disabled={saving} aria-label={`เวลาเริ่ม ${row.label} แบบ 24 ชั่วโมง`}
                      onChange={e => updateRow(index, 'start_time', e.target.value)}
                      placeholder="08:30"
                    />
                  </td>
                  <td>
                    <span className="period-mobile-label" aria-hidden="true">เวลาสิ้นสุด</span>
                    <input
                      className="period-time"
                      value={row.end_time}
                      type="text" inputMode="numeric" maxLength={5} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" disabled={saving} aria-label={`เวลาสิ้นสุด ${row.label} แบบ 24 ชั่วโมง`}
                      onChange={e => updateRow(index, 'end_time', e.target.value)}
                      placeholder="09:20"
                    />
                  </td>
                  <td className="period-manage-cell">{!row.is_break && row.period===teachingCount && teachingCount>1 && <button type="button" className="period-btn danger" disabled={saving} onClick={()=>setTimes(times.filter((_,i)=>i!==index))} aria-label={`ลบคาบ ${row.period}`}>ลบคาบ</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </section>

        <p className="period-info">ใช้เวลาแบบ 24 ชั่วโมง เช่น 08:30 และ 13:30 · พักเที่ยงนับเป็นหนึ่งคาบในลำดับที่แสดง และไม่ใช้จัดวิชาเรียน</p>

        {invalid && <div className="period-error" role="alert">{invalid}</div>}
        <div className="period-actions">
          <div className="period-secondary-actions">
          <button type="button" className="period-btn" disabled={saving || teachingCount>=8} onClick={addPeriod}>+ เพิ่มคาบเรียน ({teachingCount}/8)</button>
          <button type="button" className="period-btn" disabled={saving} onClick={resetDefault}>คืนค่าเริ่มต้น 6 คาบ</button>
          </div>
          <button type="button" className="period-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกเวลาคาบ'}
          </button>
        </div>
      </div>

      {alert && (
        <AppAlertModal open type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
    </>
  )
}
