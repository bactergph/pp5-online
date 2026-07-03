'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type AlertType = 'success' | 'error'

const APP_ALERT_STYLES = `
  .app-alert-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(8, 12, 24, 0.14);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    animation: app-alert-backdrop-in 0.22s ease;
  }
  .app-alert-backdrop.is-closing {
    animation: app-alert-backdrop-out 0.2s ease forwards;
  }
  .app-alert-card {
    width: min(100%, 300px);
    padding: 28px 22px 24px;
    border-radius: 30px;
    border: 1px solid rgba(226, 232, 240, 0.95);
    background: #FFFFFF;
    box-shadow:
      0 20px 48px rgba(15, 23, 42, 0.14),
      0 1px 0 rgba(255, 255, 255, 0.9) inset;
    text-align: center;
    animation: app-alert-card-in 0.34s cubic-bezier(0.22, 1.12, 0.36, 1);
  }
  .app-alert-backdrop.is-closing .app-alert-card {
    animation: app-alert-card-out 0.2s ease forwards;
  }
  .app-alert-icon {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.72);
    animation: app-alert-icon-pop 0.38s cubic-bezier(0.22, 1.12, 0.36, 1) 0.04s both;
  }
  .app-alert-icon-success {
    color: #FFFFFF;
    background:
      linear-gradient(180deg, rgba(52, 211, 153, 0.95), rgba(16, 185, 129, 0.92));
    box-shadow:
      0 10px 28px rgba(16, 185, 129, 0.28),
      0 1px 0 rgba(255, 255, 255, 0.45) inset;
  }
  .app-alert-icon-error {
    color: #FFFFFF;
    background:
      linear-gradient(180deg, rgba(248, 113, 113, 0.96), rgba(239, 68, 68, 0.92));
    box-shadow:
      0 10px 28px rgba(239, 68, 68, 0.24),
      0 1px 0 rgba(255, 255, 255, 0.42) inset;
  }
  .app-alert-title {
    margin: 0;
    color: rgba(15, 23, 42, 0.92);
    font-size: 20px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }
  .app-alert-message {
    margin: 8px 0 0;
    color: rgba(71, 85, 105, 0.92);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
  }
  @keyframes app-alert-backdrop-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes app-alert-backdrop-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes app-alert-card-in {
    from { opacity: 0; transform: scale(0.88); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes app-alert-card-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(0.94); }
  }
  @keyframes app-alert-icon-pop {
    from { opacity: 0; transform: scale(0.55); }
    to { opacity: 1; transform: scale(1); }
  }
`

export default function AppAlertModal({
  open,
  type,
  title,
  message,
  onClose,
  autoCloseMs,
}: {
  open: boolean
  type: AlertType
  title: string
  message?: string
  onClose: () => void
  autoCloseMs?: number
}) {
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const duration = autoCloseMs ?? (type === 'success' ? 1200 : 1800)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      setClosing(false)
      return
    }
    setClosing(false)
    const fadeMs = 200
    const closeDelay = Math.max(0, duration - fadeMs)
    const fadeTimer = window.setTimeout(() => setClosing(true), closeDelay)
    const closeTimer = window.setTimeout(onClose, duration)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(closeTimer)
    }
  }, [open, duration, onClose])

  if (!open || !mounted) return null

  return createPortal(
    <>
      <style>{APP_ALERT_STYLES}</style>
      <div className={`app-alert-backdrop ${closing ? 'is-closing' : ''}`} onClick={onClose}>
        <div
          className="app-alert-card"
          onClick={event => event.stopPropagation()}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="app-alert-title"
          aria-describedby={message ? 'app-alert-message' : undefined}
        >
          <div className={`app-alert-icon app-alert-icon-${type}`} aria-hidden="true">
            {type === 'success' ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            )}
          </div>
          <h3 id="app-alert-title" className="app-alert-title">{title}</h3>
          {message ? <p id="app-alert-message" className="app-alert-message">{message}</p> : null}
        </div>
      </div>
    </>,
    document.body,
  )
}
