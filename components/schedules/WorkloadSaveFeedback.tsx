'use client'
import { useEffect, useRef } from 'react'

/** Non-blocking feedback above native dialogs. The inline status remains the live announcement. */
export default function WorkloadSaveFeedback({ status }: { status: { kind: 'saving' | 'saved' | 'error' } | null }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = panel.current
    if (!element || !status || status.kind === 'error') return
    element.hidden = false
    element.showPopover?.()
    const hide = () => { if (element.isConnected) element.hidePopover?.(); element.hidden = true }
    const timer = status.kind === 'saved' ? window.setTimeout(hide, 3000) : undefined
    return () => { window.clearTimeout(timer); hide() }
  }, [status])
  if (!status || status.kind === 'error') return null
  return <div ref={panel} popover="manual" className={`prep-save-feedback is-${status.kind}`} aria-hidden="true">
    <span className="prep-save-feedback-icon">
      {status.kind === 'saving' ? <span className="prep-save-spinner" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 12 4 4 8-8" /></svg>}
    </span>
    <div><strong>{status.kind === 'saving' ? 'กำลังบันทึกภาระสอน…' : 'บันทึกภาระสอนแล้ว'}</strong><p>{status.kind === 'saving' ? 'กรุณารอสักครู่' : 'ทำรายการถัดไปได้เลย'}</p></div>
  </div>
}
