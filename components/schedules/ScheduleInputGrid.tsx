'use client'
import { useId, useState, type ReactNode } from 'react'
import { parseSchedulePaste } from '@/lib/schedule-input'

export type InputColumn = { label: string; hint?: string; options?: string[]; readOnly?: boolean }
export default function ScheduleInputGrid({ columns, rows, onChange, statuses = {}, label, renderCell, maxRows = 500 }: {
  columns: InputColumn[]; rows: string[][]; onChange: (rows: string[][]) => void
  statuses?: Record<number, string>; label: string; maxRows?: number
  renderCell?: (row: string[], column: number, rowIndex: number, update: (value: string) => void) => ReactNode
}) {
  const id = useId()
  const [pasteError, setPasteError] = useState('')
  const empty = () => columns.map(() => '')
  function update(row: number, col: number, value: string) {
    onChange(rows.map((r, i) => i === row ? r.map((v, j) => j === col ? value : v) : r))
  }
  return <div className="prep-sheet">
    <div className="prep-sheet-guide"><span>วางจาก Excel ได้หลายแถว</span><small>คลิกช่องเริ่มต้นแล้วกด Ctrl+V / ⌘V · ใช้ Tab และปุ่มลูกศรเปลี่ยนช่อง · ตรวจข้อมูลก่อนบันทึก</small></div>
    {pasteError && <p role="alert">{pasteError}</p>}
    <div className="prep-scroll"><table aria-label={label}><thead><tr><th scope="col">#</th>{columns.map(c => <th scope="col" key={c.label}>{c.label}{c.hint && <small>{c.hint}</small>}</th>)}<th scope="col">สถานะ / จัดการ</th></tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}><th scope="row">{i + 1}</th>{columns.map((c, j) => <td key={c.label}
onPaste={e => {
            const values = parseSchedulePaste(e.clipboardData.getData('text/plain'))
            if (!values.length) return
            e.preventDefault()
            if (i + values.length > maxRows) { setPasteError(`วางได้สูงสุด ${maxRows} แถว`); return }
            const next = rows.map(r => [...r])
            while (next.length < i + values.length) next.push(empty())
            values.forEach((r, ri) => r.forEach((v, ci) => { if (j + ci < columns.length && !columns[j + ci].readOnly) next[i + ri][j + ci] = v }))
            setPasteError(''); onChange(next)
          }} >
        {renderCell?.(row, j, i, value => update(i, j, value)) ?? <input aria-label={`${c.label} แถว ${i + 1}`} data-row={i} data-col={j} value={row[j] || ''} readOnly={c.readOnly}
          list={c.options ? `${id}-${j}` : undefined} placeholder={c.hint} onChange={e => update(i, j, e.target.value)}
          onKeyDown={e => {
            if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
            const input = e.currentTarget
            if (e.key === 'ArrowLeft' && input.selectionStart !== 0 || e.key === 'ArrowRight' && input.selectionStart !== input.value.length) return
            const ri = i + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0)
            const ci = j + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)
            const target = input.closest('table')?.querySelector<HTMLInputElement | HTMLSelectElement>(`tbody tr:nth-child(${ri + 1}) td:nth-of-type(${ci + 1}) input, tbody tr:nth-child(${ri + 1}) td:nth-of-type(${ci + 1}) select`)
            if (target) { e.preventDefault(); target.focus(); if (target instanceof HTMLInputElement) target.select() }
          }} />}
      </td>)}<td><small role="status">{statuses[i] || (row.some(Boolean) ? 'พร้อมตรวจ' : 'แถวว่าง')}</small><button type="button" aria-label={`นำแถว ${i + 1} ออกจากรายการนำเข้า`} onClick={() => onChange(rows.filter((_, n) => n !== i))}>เอาแถวออก</button></td></tr>)}</tbody>
    </table></div>
    {columns.map((c, j) => c.options && <datalist key={j} id={`${id}-${j}`}>{c.options.map(o => <option key={o} value={o} />)}</datalist>)}
    <button type="button" disabled={rows.length >= maxRows} onClick={() => onChange([...rows, ...Array.from({ length: Math.min(5, maxRows - rows.length) }, empty)])}>+ เพิ่ม 5 แถว</button>
  </div>
}
