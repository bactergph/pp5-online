'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'
import {
  deleteApprovedDocument,
  fetchApprovedDocuments,
  getApprovedDocumentDownloadPath,
  retryApprovedDocumentFile,
  type ApprovedDocumentRow,
} from '@/app/approved-documents/actions'
import type { ApprovedDocKind } from '@/lib/approved-documents/archive'
import { openDocumentPreviewPopup } from '@/lib/document-preview-popup'
import { buildDocumentPreviewShellUrlFromSrc } from '@/lib/sign-document-preview'

type Props = {
  docKind?: ApprovedDocKind
  docKinds?: ApprovedDocKind[]
  pageTitle?: string
  pageSubtitle?: string
  embedded?: boolean
}

function formatThaiDate(value: string) {
  try {
    return new Date(value).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

export default function ApprovedDocumentsClient({
  docKind,
  docKinds,
  pageTitle,
  pageSubtitle = 'เอกสารที่อนุมัติแล้ว',
  embedded = false,
}: Props) {
  const kinds = useMemo(
    () => (docKinds?.length ? docKinds : docKind ? [docKind] : []),
    [docKind, docKinds],
  )
  const { notify, AlertModal } = useAppAlert('สำเร็จ', 'ไม่สำเร็จ')
  const [items, setItems] = useState<ApprovedDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const lists = await Promise.all(kinds.map(kind => fetchApprovedDocuments(kind)))
      const merged = lists.flat().sort((a, b) => b.approved_at.localeCompare(a.approved_at))
      setItems(merged)
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'โหลดรายการไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [kinds, notify])

  useEffect(() => { void reload() }, [reload])

  async function handlePreview(item: ApprovedDocumentRow) {
    if (item.preview_url) {
      openDocumentPreviewPopup(buildDocumentPreviewShellUrlFromSrc(item.preview_url, { title: item.title, readonly: true }))
      return
    }
    setBusyId(item.id)
    const result = await getApprovedDocumentDownloadPath(item.id)
    setBusyId(null)
    if (result.error || !result.url) {
      notify('error', result.error || 'เปิดพรีวิวไม่สำเร็จ')
      return
    }
    window.open(result.url, 'pp5-document-preview', 'popup=yes,width=1180,height=860,scrollbars=yes,resizable=yes')
  }

  async function handleDownload(item: ApprovedDocumentRow) {
    setBusyId(item.id)
    const result = await getApprovedDocumentDownloadPath(item.id)
    setBusyId(null)
    if (result.error || !result.url) {
      notify('error', result.error || 'ดาวน์โหลดไม่สำเร็จ')
      return
    }
    const link = document.createElement('a')
    link.href = result.url
    link.download = result.fileName || item.file_name
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function handleDelete(item: ApprovedDocumentRow) {
    if (!confirm(`ลบเอกสาร "${item.title}" ?`)) return
    setBusyId(item.id)
    const result = await deleteApprovedDocument(item.id)
    setBusyId(null)
    if (result.error) notify('error', result.error)
    else {
      notify('success', 'ลบเอกสารแล้ว')
      await reload()
    }
  }

  async function handleRetry(item: ApprovedDocumentRow) {
    setBusyId(item.id)
    const result = await retryApprovedDocumentFile(item.id)
    setBusyId(null)
    if (result.error) notify('error', result.error)
    else {
      notify('success', 'สั่งสร้างไฟล์ใหม่แล้ว')
      await reload()
    }
  }

  const listBody = embedded ? (
    <>
      {loading ? (
        <p style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
      ) : items.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 12px' }}>
          <div style={{ color: 'var(--text-3)' }}>ยังไม่มีเอกสารที่อนุมัติแล้ว</div>
        </div>
      ) : (
        <div className="document-sign-cards">
          {items.map(item => (
            <article key={item.id} className="document-sign-card document-sign-card--success">
              <div className="document-sign-card__top">
                <span className="document-sign-card__status document-sign-card__status--success">อนุมัติแล้ว</span>
                <span className="document-sign-card__term">เทอม {item.term}</span>
              </div>
              <h3 className="document-sign-card__title">{item.title}</h3>
              <p className="document-sign-card__subtitle">{item.doc_kind_label}</p>
              <p className="document-sign-card__detail">อนุมัติเมื่อ {formatThaiDate(item.approved_at)}</p>
              {(item.status === 'pending' || item.status === 'failed') && (
                <p className={`document-sign-card__detail${item.status === 'failed' ? ' document-sign-card__detail--danger' : ''}`}>
                  {item.status === 'failed'
                    ? (item.error_message || 'สร้างไฟล์ไม่สำเร็จ')
                    : 'กำลังสร้างไฟล์เก็บใน Google Drive...'}
                </p>
              )}
              <div className="document-sign-card__actions">
                {(item.has_file || item.preview_url) && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm document-sign-card__view"
                    onClick={() => void handlePreview(item)}
                  >
                    ดูเอกสาร
                  </button>
                )}
                {(item.status === 'pending' || item.status === 'failed') && !item.id.startsWith('workflow:') && (
                  <LoadingButton
                    className="btn btn-primary btn-sm"
                    loading={busyId === item.id}
                    onClick={() => void handleRetry(item)}
                  >
                    {item.status === 'failed' ? 'ลองสร้างไฟล์ใหม่' : 'สร้างไฟล์อีกครั้ง'}
                  </LoadingButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <AlertModal />
    </>
  ) : (
    <>
      {loading ? (
        <p style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
      ) : items.length === 0 ? (
        <div className="empty-state" style={{ padding: embedded ? '24px 12px' : '32px 16px' }}>
          <div style={{ color: 'var(--text-3)' }}>ยังไม่มีเอกสารที่อนุมัติแล้ว</div>
        </div>
      ) : (
        <div className="data-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>เอกสาร</th>
                <th>เทอม</th>
                <th>อนุมัติเมื่อ</th>
                <th>สถานะไฟล์</th>
                <th style={{ width: 260 }} />
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.doc_kind_label} · {item.file_name}</div>
                    {item.drive_folder_path && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                        Drive: {item.drive_folder_path}
                      </div>
                    )}
                  </td>
                  <td>{item.term}</td>
                  <td style={{ fontSize: 13 }}>{formatThaiDate(item.approved_at)}</td>
                  <td>
                    <span className={`badge ${
                      item.status === 'ready' ? 'badge-success'
                        : item.status === 'failed' ? 'badge-danger'
                          : 'badge-secondary'
                    }`}>
                      {item.status === 'ready' ? 'พร้อมใช้งาน' : item.status === 'failed' ? 'สร้างไฟล์ไม่สำเร็จ' : 'กำลังสร้าง'}
                    </span>
                    {item.error_message && (
                      <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{item.error_message}</div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {(item.has_file || item.preview_url) && (
                        <LoadingButton className="btn btn-secondary btn-sm" loading={busyId === item.id} onClick={() => handlePreview(item)}>
                          พรีวิว
                        </LoadingButton>
                      )}
                      {item.has_file && (
                        <LoadingButton className="btn btn-primary btn-sm" loading={busyId === item.id} onClick={() => handleDownload(item)}>
                          ดาวน์โหลด
                        </LoadingButton>
                      )}
                      {(item.status === 'pending' || item.status === 'failed') && !item.id.startsWith('workflow:') && (
                        <LoadingButton className="btn btn-primary btn-sm" loading={busyId === item.id} onClick={() => void handleRetry(item)}>
                          {item.status === 'failed' ? 'ลองสร้างใหม่' : 'สร้างไฟล์อีกครั้ง'}
                        </LoadingButton>
                      )}
                      {item.drive_web_view_link && (
                        <a href={item.drive_web_view_link} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                          Google Drive
                        </a>
                      )}
                      {item.can_delete && (
                        <LoadingButton className="btn btn-danger btn-sm" loading={busyId === item.id} onClick={() => handleDelete(item)}>
                          ลบ
                        </LoadingButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertModal />
    </>
  )
  if (embedded) {
    return <div className="approved-docs-embedded">{listBody}</div>
  }

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">เอกสารที่อนุมัติแล้ว</span>
          <h1 className="page-title">{pageTitle || 'เอกสารที่อนุมัติแล้ว'}</h1>
          <p className="page-subtitle">{pageSubtitle}</p>
        </div>
      </div>

      <div className="approved-docs-layout">
        <div className="card-padded">
          {listBody}
        </div>
      </div>
    </div>
  )
}
