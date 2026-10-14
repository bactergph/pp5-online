'use client'
import { moveLunchBreak, validatePeriodTimes, type PeriodTimeRow } from '@/lib/schedule-helpers'

export default function WizardPeriodEditor({ rows, onChange, configured, dirty, onSave }: {
  rows: PeriodTimeRow[]; onChange: (rows: PeriodTimeRow[]) => void; configured: boolean; dirty: boolean; onSave: () => void
}) {
  const lessons = rows.filter(r => !r.is_break)
  const lunchIndex = rows.findIndex(r => r.is_break)
  const beforeLunch = rows.slice(0, lunchIndex).filter(r => !r.is_break).length
  const invalid = validatePeriodTimes(rows)
  function update(index: number, field: 'start_time' | 'end_time', value: string) {
    onChange(rows.map((r, i) => i === index ? {...r, [field]:value} : r))
  }
  function add() {
    const last = rows.at(-1)!
    const [h,m] = last.end_time.split(':').map(Number)
    const end = Math.min(1439, h * 60 + m + 50)
    onChange([...rows, {period: lessons.length + 1, label:`คาบที่ ${lessons.length+1}`, start_time:last.end_time, end_time:`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`, is_break:false, sort_order:rows.length+1}])
  }
  return <div className="prep-period-editor">
    <div className="prep-checks"><label>พักกลางวันหลังคาบเรียน<select aria-label="พักกลางวันหลังคาบเรียน" value={beforeLunch} disabled={!!invalid} onChange={e=>onChange(moveLunchBreak(rows,Number(e.target.value)))}>{lessons.map(r=><option key={r.period} value={r.period}>คาบเรียนที่ {r.period}</option>)}</select></label><span>{lessons.length} คาบเรียน + 1 ช่วงพัก</span></div>
    <p>ใช้เวลา 24 ชั่วโมง เช่น 08:30 และ 13:30 · เมื่อย้ายพัก ระบบคงระยะเวลาแต่ละคาบไว้</p>
    <div className="prep-scroll"><table><thead><tr><th>ช่อง</th><th>คาบ</th><th>เริ่ม</th><th>สิ้นสุด</th><th>จัดการ</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.period} className={r.is_break?'prep-lunch-row':''}><td>{i+1}</td><th>{r.is_break?'พักกลางวัน':`คาบเรียนที่ ${r.period}`}</th><td><input aria-label={`เริ่ม ${r.is_break?'พักกลางวัน':`คาบ ${r.period}`} แบบ 24 ชั่วโมง`} type="text" inputMode="numeric" maxLength={5} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" placeholder="08:30" value={r.start_time} onChange={e=>update(i,'start_time',e.target.value)}/></td><td><input aria-label={`สิ้นสุด ${r.is_break?'พักกลางวัน':`คาบ ${r.period}`} แบบ 24 ชั่วโมง`} type="text" inputMode="numeric" maxLength={5} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" placeholder="09:30" value={r.end_time} onChange={e=>update(i,'end_time',e.target.value)}/></td><td>{!r.is_break&&r.period===lessons.length&&lessons.length>1&&<button type="button" onClick={()=>onChange(rows.filter(v=>v!==r).map((v,n)=>({...v,sort_order:n+1})))}>ลบคาบสุดท้าย</button>}</td></tr>)}</tbody></table></div>
    {invalid&&<p className="prep-error" role="alert">{invalid}</p>}
    <div className="prep-checks"><button type="button" disabled={lessons.length>=8||!!invalid} onClick={add}>+ เพิ่มคาบเรียน</button><button type="button" className="prep-primary" disabled={!!invalid||configured&&!dirty} onClick={onSave}>{configured&&!dirty?'บันทึกเวลาแล้ว':'บันทึกวันและเวลา'}</button></div>
    <small>เวลาคาบใช้ร่วมกันทั้งโรงเรียน การลดคาบจะตรวจผลกระทบต่อตารางเดิมก่อนบันทึก</small>
  </div>
}
