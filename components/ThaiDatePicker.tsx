'use client'
import { useEffect, useState } from 'react'
import { THAI_MONTHS } from '@/lib/thaiDate'

// เก็บค่าเป็น ISO 'YYYY-MM-DD' (ค.ศ.) ผ่าน hidden input ชื่อ {name}
// แสดงให้เลือก วันที่ / เดือน(ไทย) / พ.ศ. — บน iOS จะขึ้น wheel ของระบบ

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
  yearsForward?: number
  yearsBack?: number
}

export default function ThaiDatePicker({
  name, defaultValue = '', required = false, yearsForward = 6, yearsBack = 10,
}: Props) {
  const init = parseISO(defaultValue)
  const [d, setD] = useState(init.d)
  const [m, setM] = useState(init.m)
  const [be, setBe] = useState(init.be)

  useEffect(() => {
    const next = parseISO(defaultValue || '')
    setD(next.d)
    setM(next.m)
    setBe(next.be)
  }, [defaultValue])

  const iso = toISO(d, m, be)

  const nowBE = new Date().getFullYear() + 543
  const years: number[] = []
  for (let y = nowBE + yearsForward; y >= nowBE - yearsBack; y--) years.push(y)
  if (be && !years.includes(Number(be))) {
    years.push(Number(be)); years.sort((a, b) => b - a)
  }
  const daysInMonth = (m && be) ? new Date(Number(be) - 543, Number(m), 0).getDate() : 31

  const sel: React.CSSProperties = {
    padding: '10px 8px',
    minHeight: 44,
    fontSize: 16,
  }

  return (
    <div className="thai-date-picker" style={{ display: 'flex', gap: 6, minWidth: 0 }}>
      <select className="form-input" style={{ ...sel, flex: 1, minWidth: 0 }} value={d} onChange={e => setD(e.target.value)} required={required} aria-label="วันที่">
        <option value="">วันที่</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <select className="form-input" style={{ ...sel, flex: 1.7, minWidth: 0 }} value={m} onChange={e => setM(e.target.value)} required={required} aria-label="เดือน">
        <option value="">เดือน</option>
        {THAI_MONTHS.map((monthName, i) => <option key={i} value={i + 1}>{monthName}</option>)}
      </select>
      <select className="form-input" style={{ ...sel, flex: 1, minWidth: 0 }} value={be} onChange={e => setBe(e.target.value)} required={required} aria-label="พ.ศ.">
        <option value="">พ.ศ.</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <input type="hidden" name={name} value={iso} />
    </div>
  )
}
