'use client'
import { useState } from 'react'
import { THAI_MONTHS } from '@/lib/thaiDate'

// เก็บค่าเป็น ISO 'YYYY-MM-DD' (ค.ศ.) ผ่าน hidden input ชื่อ {name}
// แสดงให้เลือก วันที่ / เดือน(ไทย) / พ.ศ. แบบ dropdown 3 ช่อง

function parseISO(iso: string) {
  if (!iso) return { d: '', m: '', be: '' }
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return { d: '', m: '', be: '' }
  return { d: String(Number(d)), m: String(Number(m)), be: String(Number(y) + 543) }
}
function toISO(d: string, m: string, be: string) {
  if (!d || !m || !be) return ''
  const y = Number(be) - 543
  return `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`
}

type Props = {
  name: string
  defaultValue?: string
  required?: boolean
  yearsForward?: number   // จำนวนปีล่วงหน้าที่ให้เลือก (เลื่อนตามปีปัจจุบันอัตโนมัติ)
  yearsBack?: number      // จำนวนปีย้อนหลังที่ให้เลือก (วันเกิดให้ตั้งมากๆ เช่น 20)
}

export default function ThaiDatePicker({
  name, defaultValue = '', required = false, yearsForward = 6, yearsBack = 10,
}: Props) {
  const init = parseISO(defaultValue)
  const [d, setD] = useState(init.d)
  const [m, setM] = useState(init.m)
  const [be, setBe] = useState(init.be)

  const iso = toISO(d, m, be)

  const nowBE = new Date().getFullYear() + 543
  const years: number[] = []
  for (let y = nowBE + yearsForward; y >= nowBE - yearsBack; y--) years.push(y)
  // กันค่าเดิม (ตอนแก้ไขข้อมูลเก่า) หลุดออกนอกช่วง → ไม่ให้ค่าหาย
  if (be && !years.includes(Number(be))) {
    years.push(Number(be)); years.sort((a, b) => b - a)
  }
  const daysInMonth = (m && be) ? new Date(Number(be) - 543, Number(m), 0).getDate() : 31

  const sel: React.CSSProperties = { padding: '9px 8px' }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select className="form-input" style={{ ...sel, flex: 1 }} value={d} onChange={e => setD(e.target.value)} required={required} aria-label="วันที่">
        <option value="">วันที่</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <select className="form-input" style={{ ...sel, flex: 1.7 }} value={m} onChange={e => setM(e.target.value)} required={required} aria-label="เดือน">
        <option value="">เดือน</option>
        {THAI_MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
      </select>
      <select className="form-input" style={{ ...sel, flex: 1 }} value={be} onChange={e => setBe(e.target.value)} required={required} aria-label="พ.ศ.">
        <option value="">พ.ศ.</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <input type="hidden" name={name} value={iso} />
    </div>
  )
}
