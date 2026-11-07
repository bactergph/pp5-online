'use client'
import { useEffect, useRef, useState } from 'react'
import type { ContentUnit } from '@/lib/class-subject-offer'

export type ScheduleUnitRow = { name: string; periods: string; useMain: boolean; teacherId: string }
export type ScheduleUnitSource = {
  offeringId: string
  code: string
  title: string
  weekly: number
  teacherId: string
  enabled: boolean
  rows: [ScheduleUnitRow, ScheduleUnitRow]
  names: string[]
}
type Teacher = { id: string; prefix?: string | null; full_name: string }

export function buildScheduleUnitSource(input: {
  offeringId: string
  code: string
  title: string
  teacherId: string | null
  weekly: number
  units: ContentUnit[]
  periods: [number | null, number | null]
  split: boolean
  names: string[]
}): ScheduleUnitSource {
  const blank = (): ScheduleUnitRow => ({ name: '', periods: '', useMain: true, teacherId: '' })
  const row = (index: 0 | 1): ScheduleUnitRow => {
    const unit = input.units[index]
    if (!unit && !input.split) return blank()
    const periods = input.periods[index] || unit?.periods || 0
    return { name: unit?.name || '', periods: periods ? String(periods) : '', useMain: unit ? unit.useMainTeacher : true, teacherId: unit && !unit.useMainTeacher ? unit.teacherId || '' : '' }
  }
  return { offeringId: input.offeringId, code: input.code, title: input.title, weekly: input.weekly, teacherId: input.teacherId || '', enabled: input.units.length > 0 || input.split, rows: [row(0), row(1)], names: input.names }
}

export default function ScheduleUnitDialog({ source, teachers, onClose, onSave }: {
  source: ScheduleUnitSource | null
  teachers: Teacher[]
  onClose: () => void
  onSave: (value: { teacherId: string; units: ContentUnit[]; weekly: number }) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [enabled, setEnabled] = useState(false)
  const [teacherId, setTeacherId] = useState('')
  const [rows, setRows] = useState<[ScheduleUnitRow, ScheduleUnitRow]>([{ name: '', periods: '', useMain: true, teacherId: '' }, { name: '', periods: '', useMain: true, teacherId: '' }])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (source && !node.open) node.showModal()
    if (!source && node.open) node.close()
  }, [source])
  useEffect(() => {
    if (!source) return
    setEnabled(source.enabled)
    setTeacherId(source.teacherId)
    setRows(source.rows)
    setError('')
    setBusy(false)
  }, [source])
  function update(index: 0 | 1, patch: Partial<ScheduleUnitRow>) {
    setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) as [ScheduleUnitRow, ScheduleUnitRow])
  }
  async function save() {
    if (!source || busy) return
    if (!teacherId) { setError('เลือกครูประจำวิชา'); return }
    const units = enabled ? rows.flatMap(row => {
      if (!row.name.trim() && !row.periods.trim()) return []
      return [{ name: row.name.trim(), periods: Number(row.periods), teacherId: row.useMain ? null : row.teacherId || null, useMainTeacher: row.useMain }]
    }) : []
    if (enabled) {
      if (!units.length) { setError('ใส่ชื่อวิชาย่อยอย่างน้อย 1 ชื่อ'); return }
      if (units.some(unit => !unit.name || !Number.isInteger(unit.periods) || unit.periods < 1)) { setError('วิชาย่อยต้องมีชื่อและจำนวนคาบ'); return }
      if (units.some(unit => !unit.useMainTeacher && !unit.teacherId)) { setError('เลือกผู้สอนของวิชาย่อย หรือใช้ครูประจำวิชา'); return }
      if (new Set(units.map(unit => unit.name)).size !== units.length) { setError('ชื่อวิชาย่อยต้องไม่ซ้ำกัน'); return }
      if (units.reduce((sum, unit) => sum + unit.periods, 0) !== source.weekly) { setError(`จำนวนคาบวิชาย่อยต้องรวมกันได้ ${source.weekly} คาบต่อสัปดาห์`); return }
    }
    setBusy(true)
    setError('')
    try { await onSave({ teacherId, units, weekly: source.weekly }); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'บันทึกวิชาย่อยไม่สำเร็จ'); setBusy(false) }
  }
  const teacherLabel = (teacher: Teacher) => `${teacher.prefix || ''} ${teacher.full_name}`.trim()
  return <dialog ref={dialog} className="w-[min(680px,calc(100vw-2rem))] rounded-2xl border border-stone-200 p-0 text-stone-900 backdrop:bg-stone-900/40" aria-labelledby="schedule-unit-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    {source && <>
      <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
        <div><h2 id="schedule-unit-title" className="text-lg font-semibold">วิชาย่อย</h2><p className="mt-1 text-sm text-stone-500">{source.code} · {source.title} · {source.weekly || '—'} คาบ/สัปดาห์</p></div>
        <button type="button" disabled={busy} onClick={onClose} aria-label="ปิด">ปิด</button>
      </header>
      <div className="grid gap-4 px-5 py-4">
        <p className="text-sm leading-6 text-stone-600">ครูประจำวิชาเป็นชื่อหลัก ถ้ามีวิชาย่อย ตารางเรียนและตารางสอนจะแบ่งคาบตามชื่อและผู้สอน ส่วนคะแนนยังใช้รหัสวิชานี้รหัสเดียว คาบที่ลงไว้แล้วจะเรียงตามวันจนกว่าจะย้ายช่องใหม่</p>
        <label className="grid gap-1 text-sm font-semibold">ครูประจำวิชา
          <select className="h-11 rounded-xl border border-stone-300 px-3 font-normal" value={teacherId} disabled={busy} onChange={event => setTeacherId(event.target.value)}>
            <option value="">เลือกครู</option>
            {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacherLabel(teacher)}</option>)}
          </select>
        </label>
        <div className="class-subject-unit-switch" role="group" aria-label="วิชาย่อย">
          <button type="button" aria-pressed={!enabled} disabled={busy} onClick={() => setEnabled(false)}>ไม่มี</button>
          <button type="button" aria-pressed={enabled} disabled={busy} onClick={() => setEnabled(true)}>มีวิชาย่อย</button>
        </div>
        {enabled && <div className="class-subject-unit-table">
          <datalist id="schedule-unit-names">{source.names.map(name => <option key={name} value={name} />)}</datalist>
          {rows.map((row, index) => <div className="class-subject-unit-row" key={index}>
            <input className="form-input" list="schedule-unit-names" maxLength={80} disabled={busy} aria-label={`ชื่อวิชาย่อย ${index + 1}`} placeholder={`วิชาย่อย ${index + 1}`} value={row.name} onChange={event => update(index as 0 | 1, { name: event.target.value })} />
            <input className="form-input" inputMode="numeric" disabled={busy} aria-label={`จำนวนคาบวิชาย่อย ${index + 1}`} placeholder="คาบ" value={row.periods} onChange={event => update(index as 0 | 1, { periods: event.target.value.replace(/\D/g, '').slice(0, 2) })} />
            <label><input type="checkbox" checked={row.useMain} disabled={busy} onChange={event => update(index as 0 | 1, { useMain: event.target.checked })} /> ใช้ครูประจำวิชา</label>
            {!row.useMain && <select className="form-input" disabled={busy} aria-label={`ผู้สอนวิชาย่อย ${index + 1}`} value={row.teacherId} onChange={event => update(index as 0 | 1, { teacherId: event.target.value })}>
              <option value="">เลือกผู้สอน</option>
              {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacherLabel(teacher)}</option>)}
            </select>}
          </div>)}
        </div>}
        {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
        <button type="button" disabled={busy} onClick={onClose}>ยกเลิก</button>
        <button type="button" className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || source.weekly < 1} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกวิชาย่อย'}</button>
      </footer>
    </>}
  </dialog>
}
