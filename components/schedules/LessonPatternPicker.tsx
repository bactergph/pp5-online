'use client'
import { useId } from 'react'

function describe(pattern: number[]) {
  const groups = new Map<number, number>()
  pattern.forEach(n => groups.set(n, (groups.get(n) || 0) + 1))
  return [...groups].map(([size, times]) => `${size === 1 ? 'คาบเดี่ยว' : size === 2 ? 'คาบคู่' : `ติดกัน ${size} คาบ`} ${times} ครั้ง`).join(' + ')
}

export default function LessonPatternPicker({ count, value, onChange, label }: {
  count: number; value: string; onChange: (value: string) => void; label: string
}) {
  const id = useId()
  const validCount = Number.isInteger(count) && count >= 1 && count <= 40
  const single = Array(validCount ? count : 0).fill(1) as number[]
  const pattern = value ? value.split('+').map(Number) : single
  const presets = [single]
  if (validCount) {
    for (let pairs = 1; pairs <= Math.floor(count / 2); pairs++) presets.push([...Array(pairs).fill(2), ...Array(count - pairs * 2).fill(1)])
  }
  const key = pattern.join('+')
  const custom = !presets.some(p => p.join('+') === key)
  const total = pattern.reduce((a, b) => a + b, 0)
  const valid = validCount && total === count && pattern.length > 0 && pattern.every(n => Number.isInteger(n) && n >= 1 && n <= 8)
  return <div className="prep-pattern-picker">
    <select aria-label={`การแบ่งคาบเรียน ${label}`} aria-describedby={`${id}-help`} disabled={!validCount} value={validCount ? key : ''} onChange={e => onChange(e.target.value)}>
      {!validCount && <option value="">กรอกคาบต่อสัปดาห์ก่อน</option>}
      {validCount && presets.map(p => <option key={p.join('+')} value={p.join('+')}>{describe(p)}</option>)}
      {validCount && custom && <option value={key}>{valid ? describe(pattern) : 'การแบ่งคาบเดิมไม่ตรงกับจำนวนคาบ'}</option>}
    </select>
    <small id={`${id}-help`}>{valid ? `รวม ${count} คาบ/สัปดาห์ · เรียน ${pattern.length} ครั้ง` : validCount ? `กรุณาแบ่งให้ครบ ${count} คาบ/สัปดาห์` : 'เริ่มจากจำนวนคาบที่เรียนในหนึ่งสัปดาห์'}</small>
    {validCount && <details><summary>กำหนดแต่ละครั้งเอง</summary><div className="prep-pattern-groups">{pattern.map((n, i) => <label key={i}>ครั้งที่ {i + 1}<select aria-label={`จำนวนคาบครั้งที่ ${i + 1} ${label}`} value={Number.isInteger(n) && n >= 1 && n <= 8 ? n : ''} onChange={e => onChange(pattern.map((v, j) => j === i ? Number(e.target.value) : v).join('+'))}><option value="" disabled>เลือกคาบ</option>{Array.from({length:8},(_,j)=><option key={j+1} value={j+1}>{j+1} คาบ{j>0?'ติดกัน':''}</option>)}</select><button type="button" aria-label={`เอาครั้งที่ ${i + 1} ออก ${label}`} disabled={pattern.length <= 1} onClick={()=>onChange(pattern.filter((_,j)=>j!==i).join('+'))}>เอาออก</button></label>)}</div><button type="button" disabled={pattern.length>=40} onClick={()=>onChange([...pattern,1].join('+'))}>+ เพิ่มครั้งเรียน</button></details>}
  </div>
}
