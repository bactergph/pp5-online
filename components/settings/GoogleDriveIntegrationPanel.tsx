'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import LoadingButton from '@/components/LoadingButton'
import GoogleDriveConnectButton from '@/components/settings/GoogleDriveConnectButton'
import {
  disconnectGoogleDrive,
  fetchGoogleDriveConnection,
  type GoogleDriveConnectionStatus,
} from '@/app/settings/google-drive-actions'
import { useAppAlert } from '@/lib/use-app-alert'

type Props = {
  active?: boolean
}

const EMPTY_STATUS: GoogleDriveConnectionStatus = {
  connected: false,
  email: null,
  folderId: null,
  oauthConfigured: false,
}

function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M8.4 15.6 5.2 9.8 12 9.8z" />
      <path fill="#0F9D58" d="M15.6 15.6 12 9.8h6.8z" />
      <path fill="#FFBA00" d="M5.2 9.8 2 15.6h6.4z" />
      <path fill="#EA4335" d="M12 9.8 8.4 3.4h7.2z" />
      <path fill="#34A853" d="M8.4 15.6 2 15.6l3.2-5.8z" />
      <path fill="#188038" d="M15.6 15.6 18.8 9.8H12z" />
    </svg>
  )
}

function emailInitial(email: string | null) {
  if (!email) return 'G'
  return email.trim().charAt(0).toUpperCase()
}

export default function GoogleDriveIntegrationPanel({ active = true }: Props) {
  const { notify } = useAppAlert()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [status, setStatus] = useState<GoogleDriveConnectionStatus>(EMPTY_STATUS)

  const reloadStatus = useCallback(async (): Promise<GoogleDriveConnectionStatus | null> => {
    setLoading(true)
    try {
      const next = await fetchGoogleDriveConnection()
      setStatus(next)
      return next
    } catch (err) {
      const message = err instanceof Error ? err.message : 'โหลดสถานะ Google Drive ไม่สำเร็จ'
      notify('error', message)
      return null
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    if (active) void reloadStatus()
  }, [active, reloadStatus])

  useEffect(() => {
    if (!active) return
    const drive = searchParams.get('drive')
    const driveError = searchParams.get('drive_error')
    if (drive === 'connected') {
      void reloadStatus().then(next => {
        if (next?.connected) {
          notify('success', `เชื่อมต่อ Google Drive เรียบร้อย${next.email ? ` (${next.email})` : ''}`)
        } else {
          notify('error', 'เชื่อมต่อไม่สมบูรณ์ — รัน migration 035 และ 036 บน Supabase แล้วลองใหม่')
        }
      })
    } else if (driveError) {
      notify('error', `เชื่อมต่อ Google Drive ไม่สำเร็จ: ${decodeURIComponent(driveError)}`)
    }
  }, [active, searchParams, notify, reloadStatus])

  const handleDisconnect = async () => {
    if (!confirm('ยกเลิกการเชื่อมต่อ Google Drive ของโรงเรียนนี้?\n\nเอกสารที่อัปโหลดไปแล้วยังอยู่ใน Drive แต่ระบบจะไม่อัปโหลดใหม่จนกว่าจะเชื่อมต่ออีกครั้ง')) return
    setDisconnecting(true)
    const result = await disconnectGoogleDrive()
    setDisconnecting(false)
    if (result.error) {
      notify('error', result.error)
      return
    }
    notify('success', 'ยกเลิกการเชื่อมต่อแล้ว')
    setStatus(prev => ({
      ...prev,
      connected: false,
      email: null,
      folderId: null,
    }))
    void reloadStatus()
  }

  const handleConnected = async (result: { email: string | null; folderId: string | null }) => {
    const next = await reloadStatus()
    if (next?.connected) {
      notify('success', `เชื่อมต่อ Google Drive เรียบร้อย${next.email ? ` (${next.email})` : ''}`)
      return
    }
    if (result.email || result.folderId) {
      setStatus(prev => ({
        ...prev,
        connected: true,
        email: result.email,
        folderId: result.folderId,
        oauthConfigured: true,
      }))
      notify('success', `เชื่อมต่อ Google Drive เรียบร้อย${result.email ? ` (${result.email})` : ''}`)
      return
    }
    notify('error', 'เชื่อมต่อไม่สมบูรณ์ — รัน migration 035 และ 036 บน Supabase แล้วลองใหม่')
  }

  return (
    <div className="drive-integration">
      <div className={`drive-integration-hero${status.connected ? ' is-connected' : ''}`}>
        <div className="drive-integration-icon">
          <DriveIcon />
        </div>
        <div className="drive-integration-hero-body">
          <div className="drive-integration-hero-top">
            <div className="drive-integration-title">Google Drive</div>
            {loading ? (
              <span className="drive-integration-status is-disconnected">
                <span className="drive-integration-status-dot" />
                กำลังตรวจสอบ...
              </span>
            ) : (
              <span className={`drive-integration-status${status.connected ? ' is-connected' : ' is-disconnected'}`}>
                <span className="drive-integration-status-dot" />
                {status.connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
              </span>
            )}
          </div>
          <p className="drive-integration-subtitle">
            {status.connected
              ? 'ระบบอัปโหลด PDF อัตโนมัติหลังเอกสารได้รับการอนุมัติครบ'
              : 'เชื่อมต่อบัญชี Google ของโรงเรียนเพื่อเก็บเอกสารที่อนุมัติแล้ว'}
          </p>
        </div>
      </div>

      {!status.oauthConfigured ? (
        <div className="alert alert-error">
          ผู้ดูแลระบบยังไม่ได้ตั้งค่า Google OAuth (CLIENT_ID / CLIENT_SECRET) บนเซิร์ฟเวอร์
        </div>
      ) : loading ? (
        <p className="drive-integration-subtitle">กำลังโหลดสถานะการเชื่อมต่อ...</p>
      ) : status.connected ? (
        <>
          <div className="drive-integration-account">
            <div className="drive-integration-avatar">{emailInitial(status.email)}</div>
            <div>
              <div className="drive-integration-account-label">บัญชีที่เชื่อมต่อ</div>
              <div className="drive-integration-account-email">{status.email || 'Google Account'}</div>
            </div>
          </div>

          <div className="drive-integration-actions">
            {status.folderId && (
              <a
                href={`https://drive.google.com/drive/folders/${status.folderId}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
              >
                เปิดโฟลเดอร์ใน Google Drive
              </a>
            )}
            <LoadingButton
              className="drive-integration-disconnect"
              loading={disconnecting}
              type="button"
              onClick={handleDisconnect}
            >
              ยกเลิกการเชื่อมต่อ
            </LoadingButton>
          </div>
        </>
      ) : (
        <>
          <div className="drive-integration-steps">
            <div className="drive-integration-step">
              <div className="drive-integration-step-num">1</div>
              <div className="drive-integration-step-text">กดปุ่มเชื่อมต่อ Google Drive</div>
            </div>
            <div className="drive-integration-step">
              <div className="drive-integration-step-num">2</div>
              <div className="drive-integration-step-text">ล็อกอินด้วยบัญชีโรงเรียน</div>
            </div>
            <div className="drive-integration-step">
              <div className="drive-integration-step-num">3</div>
              <div className="drive-integration-step-text">กดอนุญาตให้ระบบสร้างโฟลเดอร์</div>
            </div>
          </div>

          <div className="drive-integration-connect-wrap">
            <GoogleDriveConnectButton
              className="drive-connect-btn"
              onConnected={handleConnected}
              onFinished={() => { void reloadStatus() }}
              onError={message => notify('error', `เชื่อมต่อ Google Drive ไม่สำเร็จ: ${message}`)}
            />
            <span className="drive-integration-subtitle">ไม่ต้อง copy Folder ID เอง</span>
          </div>
        </>
      )}
    </div>
  )
}
