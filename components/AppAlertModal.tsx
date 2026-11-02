'use client'

import { useEffect, useId, useRef, useSyncExternalStore, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

type AlertType = 'success' | 'error' | 'confirm'
const subscribeToHydration=()=>()=>{}
const clientReady=()=>true
const serverReady=()=>false

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
  dialog.app-alert-backdrop { width:100vw; max-width:none; height:100dvh; max-height:none; margin:0; border:0; background:transparent; color:#203956; box-sizing:border-box; }
  dialog.app-alert-backdrop:not([open]) { display:none; }
  dialog.app-alert-backdrop::backdrop { background:rgba(16,35,61,.32); backdrop-filter:blur(3px); }
  .app-alert-backdrop.is-closing {
    animation: app-alert-backdrop-out 0.2s ease forwards;
  }
  .app-alert-card {
    width: min(100%, 320px);
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
  .app-alert-icon-confirm {
    color: #FFFFFF;
    background:
      linear-gradient(180deg, rgba(251, 191, 36, 0.98), rgba(245, 158, 11, 0.95));
    box-shadow:
      0 10px 28px rgba(245, 158, 11, 0.28),
      0 1px 0 rgba(255, 255, 255, 0.45) inset;
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
    white-space: pre-line;
  }
  .app-alert-actions {
    display: grid;
    gap: 8px;
    margin-top: 18px;
  }
  .app-alert-actions--confirm {
    grid-template-columns: 1fr 1fr;
  }
  .app-alert-btn {
    width: 100%;
    min-height: 42px;
    padding: 10px 16px;
    border: 0;
    border-radius: 14px;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 0.12s ease, filter 0.12s ease;
  }
  .app-alert-btn:active {
    transform: scale(0.98);
  }
  .app-alert-btn--success {
    color: #FFFFFF;
    background: linear-gradient(180deg, #34D399, #10B981);
  }
  .app-alert-btn--error {
    color: #FFFFFF;
    background: linear-gradient(180deg, #F87171, #EF4444);
  }
  .app-alert-btn--confirm {
    color: #FFFFFF;
    background: linear-gradient(180deg, #F87171, #EF4444);
  }
  .app-alert-btn--confirm-primary {
    color: #FFFFFF;
    background: linear-gradient(180deg, #60A5FA, #2563EB);
  }
  .app-alert-btn--ghost {
    color: rgba(51, 65, 85, 0.95);
    background: rgba(241, 245, 249, 0.96);
    border: 1px solid rgba(226, 232, 240, 0.95);
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
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes app-alert-card-out {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(4px); }
  }
  @keyframes app-alert-icon-pop {
    from { opacity: 0; transform: scale(0.55); }
    to { opacity: 1; transform: scale(1); }
  }
  .app-alert-card { width:min(100%,480px); max-height:calc(100dvh - 48px); overflow:auto; overscroll-behavior:contain; padding:26px; text-align:left; border-radius:20px; border-top:4px solid #b9cbe5; box-shadow:0 8px 24px #112c5124,0 28px 80px #112c5126; }
  .app-alert-card[data-alert-type=error] { border-top-color:#b42339; }
  .app-alert-card[data-alert-type=success] { border-top-color:#17804f; }
  .app-alert-card[data-alert-type=confirm] { border-top-color:#ad741f; }
  .app-alert-icon { margin:0 0 16px; width:48px; height:48px; border-radius:14px; animation:none; box-shadow:none; }
  .app-alert-icon-success { background:#edf8f1; color:#146744; }
  .app-alert-icon-error { background:#fff0f3; color:#a72135; }
  .app-alert-icon-confirm { background:#fff5df; color:#805014; }
  .app-alert-kind { margin:0 0 6px; font-size:12px; font-weight:600; color:#526984; }
  .app-alert-title { text-align:left; color:#203956; font-size:21px; line-height:1.6; overflow-wrap:anywhere; }
  .app-alert-message { text-align:left; color:#4c627d; font-size:15px; line-height:1.85; overflow-wrap:anywhere; }
  .app-alert-actions { justify-content:flex-end; gap:10px; margin-top:24px; }
  .app-alert-btn { min-height:44px; min-width:88px; border-radius:10px; font-size:15px; }
  .app-alert-btn--success { background:#146744; }
  .app-alert-btn--error,.app-alert-btn--confirm { background:#a72135; }
  .app-alert-btn--confirm-primary { background:#245ed4; }
  .app-alert-btn:focus-visible { outline:3px solid #245ed4; outline-offset:3px; }
  @media(max-width:480px) { dialog.app-alert-backdrop { padding:16px; } .app-alert-card { padding:20px; max-height:calc(100dvh - 32px); } .app-alert-actions--confirm { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); } .app-alert-actions--confirm .app-alert-btn { min-width:0; width:100%; white-space:normal; } }
  @media(prefers-reduced-motion:reduce) { .app-alert-backdrop,.app-alert-card,.app-alert-icon { animation:none!important; transition:none!important; } }
  @media print { dialog.app-alert-backdrop { display:none!important; } }
`

export default function AppAlertModal({
  open,
  type,
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  confirmTone = 'danger',
  autoCloseMs,
}: {
  open: boolean
  type: AlertType
  title: string
  message?: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  cancelLabel?: string
  confirmTone?: 'danger' | 'primary'
  autoCloseMs?: number
}) {
  const mounted=useSyncExternalStore(subscribeToHydration,clientReady,serverReady)
  const closing=useRef(false)
  const dialog=useRef<HTMLDialogElement>(null),actionTimer=useRef<number|null>(null)
  const titleId=useId(),messageId=useId()
  const isConfirm = type === 'confirm'
  // error/confirm ค้างไว้ให้อ่าน — ปิดด้วยปุ่ม; success ปิดอัตโนมัติ
  const duration = autoCloseMs ?? (type === 'success' ? 1200 : 0)

  useEffect(()=>{
    if(!mounted||!open)return
    const element=dialog.current
    if(!element)return
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null
    closing.current=false
    element.classList.remove('is-closing')
    element.showModal()
    return()=>{element.close();if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true})}
  },[mounted,open])
  useEffect(()=>()=>{if(actionTimer.current)window.clearTimeout(actionTimer.current)},[])

  useEffect(() => {
    if (!mounted || !open || duration <= 0) return
    const fadeMs = 200
    const closeDelay = Math.max(0, duration - fadeMs)
    const fadeTimer = window.setTimeout(() => {closing.current=true;dialog.current?.classList.add('is-closing')}, closeDelay)
    const closeTimer = window.setTimeout(onClose, duration)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(closeTimer)
    }
  }, [mounted, open, duration, onClose])

  function handleClose() {
    if (closing.current) return
    closing.current=true;dialog.current?.classList.add('is-closing')
    actionTimer.current=window.setTimeout(onClose, 200)
  }

  function handleConfirm() {
    if (closing.current) return
    closing.current=true;dialog.current?.classList.add('is-closing')
    actionTimer.current=window.setTimeout(() => {
      onConfirm?.()
    }, 180)
  }

  function keepFocus(event:KeyboardEvent<HTMLDialogElement>){
    if(event.key!=='Tab')return
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(element=>element.getClientRects().length)
    const first=items[0],last=items[items.length-1],active=document.activeElement
    if(event.shiftKey&&(active===first||active===event.currentTarget)){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&active===last){event.preventDefault();first?.focus()}
  }

  if (!open || !mounted) return null

  return createPortal(
    <>
      <style>{APP_ALERT_STYLES}</style>
      <dialog ref={dialog} className="app-alert-backdrop" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={message?messageId:undefined} onKeyDown={keepFocus} onCancel={event=>{event.preventDefault();handleClose()}} onClick={event=>{if(event.target===event.currentTarget)handleClose()}}>
        <div
          className="app-alert-card"
          data-alert-type={type}
          onClick={event => event.stopPropagation()}
        >
          <div className={`app-alert-icon app-alert-icon-${type}`} aria-hidden="true">
            {type === 'success' ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : type === 'confirm' ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            )}
          </div>
          <p className="app-alert-kind">{type==='success'?'ทำรายการสำเร็จ':type==='confirm'?'ยืนยันการทำรายการ':'ตรวจสอบรายการ'}</p>
          <h3 id={titleId} className="app-alert-title">{title}</h3>
          {message ? <p id={messageId} className="app-alert-message">{message}</p> : null}
          {isConfirm ? (
            <div className="app-alert-actions app-alert-actions--confirm">
              <button type="button" className="app-alert-btn app-alert-btn--ghost" onClick={handleClose}>
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`app-alert-btn ${confirmTone === 'primary' ? 'app-alert-btn--confirm-primary' : 'app-alert-btn--confirm'}`}
                onClick={handleConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          ) : (
            <div className="app-alert-actions">
              <button
                type="button"
                className={`app-alert-btn app-alert-btn--${type}`}
                onClick={handleClose}
              >
                ปิด
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>,
    document.body,
  )
}
