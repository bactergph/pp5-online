'use client'
import { useEffect, useRef, useState } from 'react'
import { FiSettings, FiX } from 'react-icons/fi'
import { validateDeviceSchoolBasics, type DeviceSchoolBasics } from '@/lib/schedule-device-school'
import DeviceSchoolFields from './DeviceSchoolFields'

export default function DeviceSchoolSettings({ initial, onSave, onClose }: { initial: DeviceSchoolBasics; onSave: (value: DeviceSchoolBasics) => Promise<void>; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(initial), [saving, setSaving] = useState(false), [imageBusy, setImageBusy] = useState(false), [error, setError] = useState('')
  const busy = saving || imageBusy
  useEffect(() => { ref.current?.showModal() }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return
    setError(''); setSaving(true)
    try { await onSave(validateDeviceSchoolBasics(draft)); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }
  return <dialog ref={ref} className="device-school-dialog" aria-labelledby="device-school-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <form onSubmit={submit} aria-busy={busy}>
      <header><div><span><FiSettings aria-hidden="true" />ตั้งค่าพื้นฐาน</span><h2 id="device-school-title">ข้อมูลโรงเรียนและบุคลากร</h2><p>ใช้ในตารางเรียน ตารางสอน และเอกสารที่พิมพ์</p></div><button type="button" aria-label="ปิดตั้งค่าเบื้องต้น" disabled={busy} onClick={onClose}><FiX /></button></header>
      <div className="device-school-dialog-body"><DeviceSchoolFields value={draft} onChange={patch => setDraft(previous => ({ ...previous, ...patch }))} onBusyChange={setImageBusy} disabled={saving} /><p className="device-school-note">เมื่อเปิดปีใหม่ ระบบจะแยกตารางตามปี และเก็บข้อมูลปีเดิมไว้</p><p className="device-school-note">รายชื่อครูและตำแหน่ง แก้ไขได้ในขั้นกำหนดครู ข้อมูลทั้งหมดเก็บบนอุปกรณ์นี้และรวมในไฟล์สำรอง</p>{error && <p className="device-school-error" role="alert">{error}</p>}</div>
      <footer><button type="button" disabled={busy} onClick={onClose}>ยกเลิก</button><button type="submit" disabled={busy}>{saving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</button></footer>
    </form>
  </dialog>
}
