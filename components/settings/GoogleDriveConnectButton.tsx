'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import LoadingButton from '@/components/LoadingButton'
import {
  GOOGLE_DRIVE_OAUTH_CHANNEL,
  GOOGLE_DRIVE_OAUTH_MESSAGE_TYPE,
} from '@/lib/google-drive/oauth-popup'

const POPUP_WIDTH = 520
const POPUP_HEIGHT = 640

type OAuthMessage = {
  type: string
  drive?: 'connected'
  drive_error?: string
  email?: string | null
  folderId?: string | null
}

type Props = {
  onConnected: (result: { email: string | null; folderId: string | null }) => void | Promise<void>
  onError: (message: string) => void
  onFinished?: () => void
  className?: string
}

const DRIVE_ERROR_LABELS: Record<string, string> = {
  login: 'กรุณาเข้าสู่ระบบก่อน',
  no_school: 'ยังไม่ได้เลือกโรงเรียน',
  forbidden: 'เฉพาะผู้ดูแลหรือผู้อำนวยการเชื่อมต่อได้',
  not_configured: 'ยังไม่ได้ตั้งค่า Google OAuth บนเซิร์ฟเวอร์',
  access_denied: 'ยกเลิกการอนุญาตหรือไม่มีสิทธิ์เข้าถึงแอป',
  no_refresh_token: 'เชื่อมต่อไม่สำเร็จ — ลองยกเลิกการเชื่อมต่อใน Google แล้วเชื่อมต่อใหม่',
  missing_code: 'การยืนยันตัวตนไม่สมบูรณ์',
  db_save_failed: 'บันทึกการเชื่อมต่อไม่สำเร็จ — ตรวจสอบว่ารัน migration 035 และ 036 บน Supabase แล้ว',
}

function formatDriveError(code: string) {
  try {
    return DRIVE_ERROR_LABELS[code] || decodeURIComponent(code)
  } catch {
    return DRIVE_ERROR_LABELS[code] || code
  }
}

export default function GoogleDriveConnectButton({ onConnected, onError, onFinished, className }: Props) {
  const [connecting, setConnecting] = useState(false)
  const popupRef = useRef<Window | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const handledRef = useRef(false)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setConnecting(false)
  }, [])

  const handleOAuthMessage = useCallback((data: OAuthMessage) => {
    if (!data || data.type !== GOOGLE_DRIVE_OAUTH_MESSAGE_TYPE) return
    if (handledRef.current) return
    handledRef.current = true

    cleanup()
    popupRef.current?.close()
    popupRef.current = null

    if (data.drive === 'connected') {
      void onConnected({
        email: typeof data.email === 'string' ? data.email : null,
        folderId: typeof data.folderId === 'string' ? data.folderId : null,
      })
    } else if (data.drive_error) {
      onError(formatDriveError(String(data.drive_error)))
    } else {
      onError('เชื่อมต่อ Google Drive ไม่สำเร็จ')
    }
    onFinished?.()
  }, [cleanup, onConnected, onError, onFinished])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      handleOAuthMessage(event.data as OAuthMessage)
    }

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(GOOGLE_DRIVE_OAUTH_CHANNEL)
      channel.onmessage = event => handleOAuthMessage(event.data as OAuthMessage)
    } catch {
      // BroadcastChannel not supported
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      channel?.close()
    }
  }, [handleOAuthMessage])

  useEffect(() => () => cleanup(), [cleanup])

  const openConnectPopup = () => {
    handledRef.current = false
    const left = window.screenX + Math.max(0, (window.outerWidth - POPUP_WIDTH) / 2)
    const top = window.screenY + Math.max(0, (window.outerHeight - POPUP_HEIGHT) / 2)
    const popup = window.open(
      '/api/integrations/google-drive/connect?popup=1',
      'pp5-google-drive-oauth',
      `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},scrollbars=yes,resizable=yes`,
    )

    if (!popup) {
      onError('เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองใหม่')
      return
    }

    popupRef.current = popup
    setConnecting(true)
    timerRef.current = setInterval(() => {
      if (popup.closed) {
        cleanup()
        popupRef.current = null
        if (!handledRef.current) onFinished?.()
      }
    }, 400)
  }

  return (
    <LoadingButton
      className={className || 'btn btn-primary'}
      loading={connecting}
      type="button"
      onClick={openConnectPopup}
      style={{ width: 'fit-content' }}
    >
      <DriveIcon />
      เชื่อมต่อ Google Drive
    </LoadingButton>
  )
}

function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M8.4 15.6 5.2 9.8 12 9.8z" />
      <path fill="#0F9D58" d="M15.6 15.6 12 9.8h6.8z" />
      <path fill="#FFBA00" d="M5.2 9.8 2 15.6h6.4z" />
      <path fill="#EA4335" d="M12 9.8 8.4 3.4h7.2z" />
    </svg>
  )
}
