'use client'
import { useEffect, useRef, useState } from 'react'

type Option = { id: string; label: string; teacher_name: string; disabled?: boolean; quotaLabel?: string }
export default function ScheduleLessonPicker({ title, options, selected, onChoose, onClose }: {
  title: string; options: Option[]; selected: string | null; onChoose: (id: string) => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close() }, [])
  const filtered = options.filter(o => `${o.label} ${o.teacher_name}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <dialog ref={dialog} className="lesson-picker" onCancel={onClose} onClose={onClose} aria-labelledby="lesson-picker-title">
    <header><div><h2 id="lesson-picker-title">{title}</h2><p>เลือกวิชาเพื่อบันทึกลงคาบนี้</p></div><button type="button" onClick={onClose} aria-label="ปิดหน้าต่าง">✕</button></header>
    <input autoFocus aria-label="ค้นหารายวิชาหรือกิจกรรม" placeholder="ค้นหาวิชา กิจกรรม หรือครู…" value={query} onChange={e=>setQuery(e.target.value)} />
    <div className="lesson-options">
      <button className="lesson-option" onClick={()=>onChoose('')}><strong>เว้นคาบว่าง</strong><span>นำรายวิชาหรือกิจกรรมออกจากคาบนี้</span></button>
      {[false,true].map(activity=><section key={String(activity)}><h3>{activity?'กิจกรรมพัฒนาผู้เรียน · ไม่ต้องระบุครู':'รายวิชาปกติ'}</h3>
        {filtered.filter(o=>o.id.startsWith('activity:')===activity).map(o=><button key={o.id} disabled={o.disabled} className={`lesson-option${selected===o.id?' selected':''}`} aria-pressed={selected===o.id} onClick={()=>onChoose(o.id)}><strong>{o.label}</strong><span>{activity?'เลือกลงคาบเอง · ไม่รวมจัดอัตโนมัติ':o.teacher_name || 'ยังไม่กำหนดครู'}</span>{o.quotaLabel&&<small>{o.quotaLabel}</small>}</button>)}
      </section>)}
      {!filtered.length && <p role="status">ไม่พบรายการที่ค้นหา</p>}
    </div>
  </dialog>
}
