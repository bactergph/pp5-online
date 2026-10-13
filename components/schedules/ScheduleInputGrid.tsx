'use client'
import { useId } from 'react'
import { parseSchedulePaste } from '@/lib/schedule-input'

export type InputColumn = { label: string; hint?: string; options?: string[]; readOnly?: boolean }
export default function ScheduleInputGrid({ columns, rows, onChange, statuses = {}, label }: {
  columns: InputColumn[]; rows: string[][]; onChange: (rows: string[][]) => void
  statuses?: Record<number, string>; label: string
}) {
  const id = useId()
  const empty = () => columns.map(() => '')
  function update(row: number, col: number, value: string) {
    onChange(rows.map((r, i) => i === row ? r.map((v, j) => j === col ? value : v) : r))
  }
  return <div className="prep-sheet">
    <div className="prep-sheet-guide"><span>วางจาก Excel ได้หลายแถว</span><small>คลิกช่องเริ่มต้นแล้วกด Ctrl+V / ⌘V · ใช้ Tab และปุ่มลูกศรเปลี่ยนช่อง · ตรวจข้อมูลก่อนบันทึก</small></div>
    <div className="prep-scroll"><table aria-label={label}><thead><tr><th scope="col">#</th>{columns.map(c => <th scope="col" key={c.label}>{c.label}{c.hint && <small>{c.hint}</small>}</th>)}<th scope="col">สถานะ / จัดการ</th></tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}><th scope="row">{i + 1}</th>{columns.map((c, j) => <td key={c.label}>
        <input aria-label={`${c.label} แถว ${i + 1}`} data-row={i} data-col={j} value={row[j] || ''} readOnly={c.readOnly}
          list={c.options ? `${id}-${j}` : undefined} placeholder={c.hint} onChange={e => update(i, j, e.target.value)}
          onPaste={e => {
            const values = parseSchedulePaste(e.clipboardData.getData('text/plain'))
            if (!values.length) return
            e.preventDefault()
            if (i + values.length > 500) { e.currentTarget.setCustomValidity('วางได้สูงสุด 500 แถว'); e.currentTarget.reportValidity(); return }
            const next = rows.map(r => [...r])
            while (next.length < i + values.length) next.push(empty())
            values.forEach((r, ri) => r.forEach((v, ci) => { if (j + ci < columns.length && !columns[j + ci].readOnly) next[i + ri][j + ci] = v }))
            e.currentTarget.setCustomValidity(''); onChange(next)
          }}
          onKeyDown={e => {
            if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
            const input = e.currentTarget
            if (e.key === 'ArrowLeft' && input.selectionStart !== 0 || e.key === 'ArrowRight' && input.selectionStart !== input.value.length) return
            const ri = i + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0)
            const ci = j + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)
            const target = input.closest('table')?.querySelector<HTMLInputElement>(`input[data-row="${ri}"][data-col="${ci}"]`)
            if (target) { e.preventDefault(); target.focus(); target.select() }
          }} />
      </td>)}<td><small role="status">{statuses[i] || (row.some(Boolean) ? 'พร้อมตรวจ' : 'แถวว่าง')}</small><button type="button" aria-label={`นำแถว ${i + 1} ออกจากรายการนำเข้า`} onClick={() => onChange(rows.filter((_, n) => n !== i))}>เอาแถวออก</button></td></tr>)}</tbody>
    </table></div>
    {columns.map((c, j) => c.options && <datalist key={j} id={`${id}-${j}`}>{c.options.map(o => <option key={o} value={o} />)}</datalist>)}
    <button type="button" disabled={rows.length >= 500} onClick={() => onChange([...rows, ...Array.from({ length: Math.min(5, 500 - rows.length) }, empty)])}>+ เพิ่ม 5 แถว</button>
  </div>
}
