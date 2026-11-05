'use client'

import { useEffect, useRef, useState } from 'react'
import { deleteAllStudents, fetchStudentDeleteSummary } from '@/app/students/actions'
import LoadingButton from '@/components/LoadingButton'

export default function DeleteAllStudentsDialog({ yearId, yearBe, onClose, onDeleted }: {
  yearId: string; yearBe: number; onClose: () => void; onDeleted: (count: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const [confirmation, setConfirmation] = useState('')
  const [summary, setSummary] = useState<{ count: number; classrooms: number } | null>(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    let active = true
    void fetchStudentDeleteSummary(yearId).then(result => {
      if (!active) return
      if (result.error) setError(result.error)
      else setSummary({ count: result.count, classrooms: result.classrooms })
    }).catch(() => { if (active) setError('ตรวจสอบจำนวนนักเรียนไม่สำเร็จ กรุณาปิดแล้วลองใหม่') })
    return () => { active = false }
  }, [yearId])

  async function remove(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current || confirmation !== 'ลบทั้งหมด' || !summary?.count) return
    submitting.current = true
    setDeleting(true); setError('')
    try {
      const result = await deleteAllStudents(yearId, confirmation)
      if (result.error) { setError(result.error); return }
      onDeleted(result.deleted)
    } catch { setError('ยังยืนยันผลการลบไม่ได้ กรุณาตรวจรายชื่อนักเรียนก่อนลองใหม่') }
    finally { submitting.current = false; setDeleting(false) }
  }

  return <dialog ref={dialog} className="student-delete-dialog" aria-labelledby="student-delete-title"
    onCancel={event => { event.preventDefault(); if (!deleting) onClose() }}
    onClick={event => { if (event.target === event.currentTarget && !deleting) onClose() }}>
    <form onSubmit={remove} className="student-delete-dialog__body">
      <div className="student-delete-dialog__heading"><h2 id="student-delete-title">ลบนักเรียนทั้งหมด</h2>
        <button type="button" className="btn btn-ghost" disabled={deleting} onClick={onClose} aria-label="ปิด">ปิด</button></div>
      <p>นักเรียน<strong>ทุกห้องในปีการศึกษา {yearBe}</strong> ของโรงเรียนนี้</p>
      <div className="student-delete-dialog__scope" role="status">
        {summary ? <><strong>{summary.count.toLocaleString()} คน</strong><span>จาก {summary.classrooms.toLocaleString()} ห้อง · คงข้อมูลห้องเรียนไว้</span></> : error ? 'ยังตรวจสอบจำนวนไม่ได้' : 'กำลังตรวจสอบจำนวนนักเรียนทั้งหมด...'}
      </div>
      <p className="student-delete-dialog__warning">คะแนน การเช็กชื่อ เงินออม และข้อมูลอื่นที่ผูกกับนักเรียนเหล่านี้จะถูกลบด้วย การลบนี้กู้คืนจากหน้านี้ไม่ได้</p>
      {summary?.count === 0 && <p>ไม่มีนักเรียนในปีการศึกษานี้ให้ลบ</p>}
      <label className="form-label" htmlFor="student-delete-confirmation">พิมพ์ <strong>ลบทั้งหมด</strong> เพื่อยืนยัน</label>
      <input id="student-delete-confirmation" className="form-input" value={confirmation} onChange={event => setConfirmation(event.target.value)}
        autoComplete="off" spellCheck={false} disabled={deleting || !summary?.count} aria-describedby="student-delete-confirmation-hint" />
      <p id="student-delete-confirmation-hint" className="field-hint">ต้องพิมพ์ให้ตรงทุกตัวอักษร ปุ่มยืนยันจึงจะใช้งานได้</p>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={deleting} onClick={onClose}>ยกเลิก</button>
        <LoadingButton type="submit" className="btn btn-danger" loading={deleting} loadingText="กำลังลบนักเรียน..."
          disabled={!summary?.count || confirmation !== 'ลบทั้งหมด'}>ยืนยันลบนักเรียนทั้งหมด</LoadingButton></div>
    </form>
  </dialog>
}
