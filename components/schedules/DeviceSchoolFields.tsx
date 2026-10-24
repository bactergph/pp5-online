'use client'
/* eslint-disable @next/next/no-img-element -- Local data URLs never use image optimization. */
import { useId, useRef, useState } from 'react'
import { FiImage, FiUpload, FiX } from 'react-icons/fi'
import type { DeviceSchoolBasics } from '@/lib/schedule-device-school'
import './device-school.css'

async function logoFromFile(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('เลือกไฟล์ PNG, JPG หรือ WebP ขนาดไม่เกิน 5 MB')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(Error('อ่านรูปไม่ได้ กรุณาเลือกรูปใหม่')); image.src = url })
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw Error('รูปมีขนาดใหญ่เกินไป กรุณาใช้รูปที่เล็กลง')
    const scale = Math.min(1, 384 / image.naturalWidth, 384 / image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d'); if (!context) throw Error('อุปกรณ์นี้อ่านรูปไม่ได้')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}

export default function DeviceSchoolFields({ value, onChange, onBusyChange, disabled = false }: { value: DeviceSchoolBasics; onChange: (patch: Partial<DeviceSchoolBasics>) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean }) {
  const id = useId(), sequence = useRef(0)
  const [processing, setProcessing] = useState(false), [error, setError] = useState('')
  async function upload(file: File) {
    const current = ++sequence.current
    setProcessing(true); onBusyChange?.(true); setError('')
    try { const logoDataUrl = await logoFromFile(file); if (current === sequence.current) onChange({ logoDataUrl }) }
    catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : 'อ่านรูปไม่สำเร็จ') }
    finally { if (current === sequence.current) { setProcessing(false); onBusyChange?.(false) } }
  }
  return <fieldset className="device-school-fields" disabled={disabled || processing}>
    <legend className="sr-only">ข้อมูลโรงเรียนและบุคลากร</legend>
    <div className="device-school-logo-field">
      <div className="device-school-logo-preview">{value.logoDataUrl ? <img src={value.logoDataUrl} alt="ตราโรงเรียนที่เลือก" /> : <FiImage aria-hidden="true" />}</div>
      <div><strong>ตราโรงเรียน</strong><p>PNG, JPG หรือ WebP ไม่เกิน 5 MB</p><div className="device-school-logo-actions"><label className="device-school-upload" htmlFor={id + '-logo'}><FiUpload aria-hidden="true" />{processing ? 'กำลังเตรียมรูป…' : 'เลือกรูป'}<input id={id + '-logo'} name="schoolLogo" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} /></label>{value.logoDataUrl && <button type="button" onClick={() => onChange({ logoDataUrl: '' })}><FiX aria-hidden="true" />นำรูปออก</button>}</div></div>
    </div>
    {error && <p className="device-school-error" role="alert">{error}</p>}
    <div className="device-school-grid">
      <label className="device-school-wide" htmlFor={id + '-name'}>ชื่อโรงเรียน *<input id={id + '-name'} name="schoolName" value={value.schoolName} onChange={event => onChange({ schoolName: event.target.value })} maxLength={200} required placeholder="โรงเรียนบ้านตัวอย่าง" autoComplete="organization" /></label>
      <label htmlFor={id + '-director'}>ผู้อำนวยการ<input id={id + '-director'} name="directorName" value={value.directorName} onChange={event => onChange({ directorName: event.target.value })} maxLength={200} placeholder="คำนำหน้า ชื่อ–นามสกุล" /></label>
      <label htmlFor={id + '-academic'}>หัวหน้าวิชาการ<input id={id + '-academic'} name="academicHeadName" value={value.academicHeadName} onChange={event => onChange({ academicHeadName: event.target.value })} maxLength={200} placeholder="คำนำหน้า ชื่อ–นามสกุล" /></label>
      <label htmlFor={id + '-year'}>ปีการศึกษา (พ.ศ.) *<input id={id + '-year'} name="academicYear" value={value.academicYear} onChange={event => onChange({ academicYear: event.target.value })} inputMode="numeric" pattern="2[0-9]{3}" maxLength={4} required placeholder="2569" /></label>
    </div>
  </fieldset>
}
