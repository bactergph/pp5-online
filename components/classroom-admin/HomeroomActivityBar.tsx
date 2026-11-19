'use client'

import { useEffect, useRef, useState } from 'react'
import { saveHomeroomActivityNotes } from '@/app/classroom-admin/actions'
import {
  HOMEROOM_TOPIC_PRESETS,
  homeroomCountText,
  normalizeHomeroomTopics,
  thaiHomeroomDate,
  type HomeroomDayCounts,
} from '@/lib/homeroom-activity'
import './homeroom-activity.css'

export type HomeroomReportDay = {
  date: string
  counts: HomeroomDayCounts
}

type DialogProps = {
  date: string | null
  day?: HomeroomReportDay
  classroomId: string
  level: string
  room: number
  canEdit: boolean
  savedTopics: string[]
  onClose: () => void
  onSaved: (date: string, topics: string[]) => void
}

export function HomeroomDayDialog({
  date, day, classroomId, level, room, canEdit, savedTopics, onClose, onSaved,
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const savedRef = useRef(savedTopics)
  const [draft, setDraft] = useState<[string, string]>(['', ''])
  const [active, setActive] = useState<0 | 1>(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  savedRef.current = savedTopics

  useEffect(() => {
    if (!date) return
    const saved = savedRef.current
    setError('')
    setActive(0)
    setDraft([saved[0] || '', saved[1] || ''])
  }, [date])

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (date && !node.open) node.showModal()
    if (!date && node.open) node.close()
  }, [date])

  function setTopic(index: 0 | 1, value: string) {
    setDraft(current => {
      const next: [string, string] = [current[0], current[1]]
      next[index] = value
      return next
    })
  }

  function usePreset(topic: string) {
    if (!canEdit || saving) return
    setDraft(current => {
      const next: [string, string] = [current[0], current[1]]
      const used = next.findIndex(value => value === topic)
      if (used >= 0) {
        next[used] = ''
        return next
      }
      const empty = next.findIndex(value => !value.trim())
      next[empty >= 0 ? empty : active] = topic
      return next
    })
  }

  async function save() {
    if (!canEdit || saving || !date) return
    setSaving(true)
    setError('')
    const topics = normalizeHomeroomTopics(draft)
    try {
      const result = await saveHomeroomActivityNotes(classroomId, [{ date, topics }])
      if (result.error) {
        setError(result.error)
        return
      }
      onSaved(date, topics)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const counts = day?.counts
  return (
    <dialog
      ref={dialog}
      className="homeroom-note-dialog"
      aria-labelledby="homeroom-note-title"
      onClose={onClose}
      onCancel={event => { if (saving) event.preventDefault() }}
    >
      {date && (
        <form onSubmit={event => { event.preventDefault(); void save() }}>
          <header className="homeroom-note-banner">
            <div>
              <p>{level}/{room || '—'}</p>
              <h2 id="homeroom-note-title">{thaiHomeroomDate(date)}</h2>
            </div>
            <button type="button" className="homeroom-note-close" disabled={saving} onClick={onClose} aria-label="ปิด">×</button>
          </header>
          {counts && (
            <ul className="homeroom-note-counts" aria-label="จำนวนนักเรียนวันนี้">
              <li><strong>{counts.total}</strong><span>ทั้งหมด</span></li>
              <li><strong>{counts.present}</strong><span>มา</span></li>
              <li><strong>{homeroomCountText(counts.leave)}</strong><span>ลา</span></li>
              <li><strong>{homeroomCountText(counts.absent)}</strong><span>ขาด</span></li>
              <li><strong>{homeroomCountText(counts.sick)}</strong><span>ป่วย</span></li>
            </ul>
          )}
          <div className="homeroom-note-body">
            <p>เลือกเรื่องที่ใช้บ่อย หรือพิมพ์เองได้ สูงสุด 2 เรื่อง</p>
            <div className="homeroom-topic-chips">
              {HOMEROOM_TOPIC_PRESETS.map(topic => (
                <button
                  key={topic}
                  type="button"
                  className={draft.includes(topic) ? 'is-used' : ''}
                  disabled={!canEdit || saving}
                  onClick={() => usePreset(topic)}
                >
                  {topic}
                </button>
              ))}
            </div>
            {([0, 1] as const).map(index => (
              <label key={index} className={active === index ? 'is-active' : ''}>
                <span>เรื่องที่ {index + 1}{index === 1 ? ' · ไม่บังคับ' : ''}</span>
                <input
                  maxLength={200}
                  disabled={!canEdit || saving}
                  value={draft[index]}
                  placeholder={index === 0 ? 'เรื่องที่อบรม แนะนำ หรือแจ้งข่าวสาร' : 'เพิ่มอีกเรื่องได้'}
                  onFocus={() => setActive(index)}
                  onChange={event => setTopic(index, event.target.value)}
                />
              </label>
            ))}
            {error && <p className="homeroom-report-error" role="alert">{error}</p>}
          </div>
          <footer>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>ยกเลิก</button>
            {canEdit && <button type="submit" className="btn classroom-admin-print-green" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึกวันนี้'}</button>}
          </footer>
        </form>
      )}
    </dialog>
  )
}
