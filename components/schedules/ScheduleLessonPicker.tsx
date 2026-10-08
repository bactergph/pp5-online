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
  const optionStyle='grid w-full gap-1.5 rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-45'
  return <dialog ref={dialog} className="m-auto max-h-[85dvh] w-[min(600px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 text-stone-800 shadow-2xl backdrop:bg-stone-950/40 backdrop:backdrop-blur-sm" onCancel={onClose} onClose={onClose} aria-labelledby="lesson-picker-title">
    <header className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold" id="lesson-picker-title">{title}</h2><p className="mt-2 text-sm text-stone-500">เลือกวิชาได้ตามจำนวนคาบต่อสัปดาห์</p></div><button className="grid size-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200" type="button" onClick={onClose} aria-label="ปิดหน้าต่าง">✕</button></header>
    <input className="my-5 h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 text-sm outline-amber-600" autoFocus aria-label="ค้นหารายวิชาหรือกิจกรรม" placeholder="ค้นหาวิชา กิจกรรม หรือครู…" value={query} onChange={e=>setQuery(e.target.value)} />
    <div className="grid gap-3">
      <button className={`${optionStyle} border-dashed border-stone-300 bg-stone-50 hover:bg-stone-100`} onClick={()=>onChoose('')}><strong className="text-sm">เว้นคาบว่าง</strong><span className="text-xs text-stone-500">นำรายวิชาหรือกิจกรรมออกจากคาบนี้</span></button>
      {[false,true].map(activity=><section className="grid gap-2" key={String(activity)}><h3 className="mb-1 mt-3 text-xs font-semibold text-stone-500">{activity?'กิจกรรมพัฒนาผู้เรียน · ไม่ต้องระบุครู':'รายวิชาปกติ'}</h3>
        {filtered.filter(o=>o.id.startsWith('activity:')===activity).map(o=><button key={o.id} disabled={o.disabled} className={`${optionStyle} ${selected===o.id?'border-amber-400 bg-amber-50':activity?'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50':'border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50/50'}`} aria-pressed={selected===o.id} onClick={()=>onChoose(o.id)}><strong className="text-sm">{o.label}</strong><span className="text-xs text-stone-500">{activity?'เลือกลงคาบเอง · ไม่รวมจัดอัตโนมัติ':o.teacher_name || 'ยังไม่กำหนดครู'}</span>{o.quotaLabel&&<small className="mt-1 w-fit rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">{o.quotaLabel}</small>}</button>)}
      </section>)}
      {!filtered.length && <p role="status">ไม่พบรายการที่ค้นหา</p>}
    </div>
  </dialog>
}
