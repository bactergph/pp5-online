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

const SETUP_STEPS = [
  { title: 'กดปุ่มเชื่อมต่อ', desc: 'เปิดหน้าล็อกอิน Google ในหน้าต่างใหม่' },
  { title: 'เลือกบัญชีโรงเรียน', desc: 'ใช้ Gmail ของโรงเรียนที่ต้องการเก็บไฟล์' },
  { title: 'อนุญาตสิทธิ์', desc: 'ระบบสร้างโฟลเดอร์ให้อัตโนมัติ ไม่ต้อง copy Folder ID' },
] as const

const BENEFITS = [
  'อัปโหลด PDF อัตโนมัติหลังอนุมัติครบ',
  'เก็บใน Google Drive ของโรงเรียน',
  'เปิดดูเอกสารได้ทันทีจากลิงก์โฟลเดอร์',
] as const

function DriveIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
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

function DrivePanelSkeleton() {
  return (
    <div className="drive-panel-skeleton" aria-hidden="true">
      <div className="drive-panel-skeleton-line is-wide" />
      <div className="drive-panel-skeleton-line" />
      <div className="drive-panel-skeleton-block" />
    </div>
  )
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

  const statusLabel = loading
    ? 'กำลังตรวจสอบ...'
    : status.connected
      ? 'เชื่อมต่อแล้ว'
      : 'ยังไม่เชื่อมต่อ'

  return (
    <div className="drive-panel">
      <div className={`drive-panel-banner${status.connected ? ' is-connected' : ''}${loading ? ' is-loading' : ''}`}>
        <div className="drive-panel-banner-icon">
          <DriveIcon size={28} />
        </div>
        <div className="drive-panel-banner-body">
          <div className="drive-panel-banner-top">
            <strong>Google Drive</strong>
            <span className={`drive-panel-badge${status.connected ? ' is-on' : ''}`}>
              <span className="drive-panel-badge-dot" />
              {statusLabel}
            </span>
          </div>
          <p>
            {status.connected
              ? 'ระบบพร้อมอัปโหลดเอกสาร PDF ที่อนุมัติแล้วไปยังโฟลเดอร์ของโรงเรียน'
              : 'เชื่อมต่อบัญชี Google ของโรงเรียนเพื่อเก็บเอกสารอัตโนมัติ'}
          </p>
        </div>
      </div>

      {!status.oauthConfigured && !loading && (
        <div className="drive-panel-alert" role="alert">
          <strong>ยังเชื่อมต่อไม่ได้</strong>
          <span>ผู้ดูแลระบบต้องตั้งค่า Google OAuth (CLIENT_ID / CLIENT_SECRET) บนเซิร์ฟเวอร์ก่อน</span>
        </div>
      )}

      {loading ? (
        <DrivePanelSkeleton />
      ) : status.connected ? (
        <div className="drive-panel-connected">
          <div className="drive-panel-account">
            <div className="drive-panel-avatar">{emailInitial(status.email)}</div>
            <div className="drive-panel-account-text">
              <span className="drive-panel-account-label">บัญชีที่เชื่อมต่อ</span>
              <strong>{status.email || 'Google Account'}</strong>
            </div>
          </div>

          {status.folderId && (
            <a
              className="drive-panel-folder"
              href={`https://drive.google.com/drive/folders/${status.folderId}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="drive-panel-folder-icon" aria-hidden="true">📁</span>
              <span className="drive-panel-folder-text">
                <strong>เปิดโฟลเดอร์เอกสารโรงเรียน</strong>
                <span>ดูไฟล์ PDF ที่อัปโหลดแล้วใน Google Drive</span>
              </span>
              <span className="drive-panel-folder-arrow" aria-hidden="true">↗</span>
            </a>
          )}

          <div className="drive-panel-actions">
            {status.folderId && (
              <a
                href={`https://drive.google.com/drive/folders/${status.folderId}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
              >
                เปิด Google Drive
              </a>
            )}
            <LoadingButton
              className="drive-panel-disconnect"
              loading={disconnecting}
              loadingText="กำลังยกเลิก..."
              type="button"
              onClick={handleDisconnect}
            >
              ยกเลิกการเชื่อมต่อ
            </LoadingButton>
          </div>
        </div>
      ) : status.oauthConfigured ? (
        <div className="drive-panel-setup">
          <ul className="drive-panel-benefits">
            {BENEFITS.map(item => (
              <li key={item}>
                <span className="drive-panel-benefit-check" aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>

          <div className="drive-panel-cta">
            <div className="drive-panel-steps">
              <p className="drive-panel-steps-title">ขั้นตอนการเชื่อมต่อ</p>
              <ol>
                {SETUP_STEPS.map((step, index) => (
                  <li key={step.title}>
                    <span className="drive-panel-step-num">{index + 1}</span>
                    <span className="drive-panel-step-body">
                      <strong>{step.title}</strong>
                      <span>{step.desc}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="drive-panel-cta-action">
              <GoogleDriveConnectButton
                className="drive-panel-connect-btn"
                onConnected={handleConnected}
                onFinished={() => { void reloadStatus() }}
                onError={message => notify('error', `เชื่อมต่อ Google Drive ไม่สำเร็จ: ${message}`)}
              />
              <p className="drive-panel-cta-hint">เชื่อมต่อครั้งเดียว ใช้งานได้ทันที · ไม่ต้องบันทึกฟอร์มด้านล่าง</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
