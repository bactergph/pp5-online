'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  GOOGLE_DRIVE_OAUTH_CHANNEL,
  GOOGLE_DRIVE_OAUTH_MESSAGE_TYPE,
} from '@/lib/google-drive/oauth-popup'

function GoogleDriveDoneContent() {
  const searchParams = useSearchParams()
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    const payload = {
      type: GOOGLE_DRIVE_OAUTH_MESSAGE_TYPE,
      drive: searchParams.get('drive') === 'connected' ? 'connected' as const : undefined,
      drive_error: searchParams.get('drive_error') || undefined,
      email: searchParams.get('email'),
      folderId: searchParams.get('folderId'),
    }

    try {
      const channel = new BroadcastChannel(GOOGLE_DRIVE_OAUTH_CHANNEL)
      channel.postMessage(payload)
      channel.close()
    } catch {
      // BroadcastChannel not supported
    }

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin)
    }

    window.close()
    const timer = window.setTimeout(() => {
      setClosed(true)
      window.close()
    }, 400)
    return () => window.clearTimeout(timer)
  }, [searchParams])

  const success = searchParams.get('drive') === 'connected'
  const error = searchParams.get('drive_error')

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        color: '#334155',
        textAlign: 'center',
      }}
    >
      <div>
        <p style={{ fontSize: 16, marginBottom: 8 }}>
          {success ? 'เชื่อมต่อ Google Drive สำเร็จ' : 'ดำเนินการเสร็จแล้ว'}
        </p>
        {error && (
          <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 8 }}>
            {decodeURIComponent(error)}
          </p>
        )}
        <p style={{ fontSize: 13, color: '#64748b' }}>
          {closed ? 'ปิดหน้าต่างนี้ได้เลย' : 'กำลังกลับไปหน้าตั้งค่า...'}
        </p>
      </div>
    </div>
  )
}

export default function GoogleDriveDonePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>กำลังโหลด...</div>}>
      <GoogleDriveDoneContent />
    </Suspense>
  )
}
