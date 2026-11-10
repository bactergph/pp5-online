'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { deleteBackupFile, fetchBackupPage, renameBackupFile } from '@/app/(shell)/settings/backup/actions'
import {
  BACKUP_IMPORT_NOTES,
  summarizeBackup,
  type BackupSummary,
} from '@/lib/school-backup/format'

type Year = { id: string; year_be: number; is_active: boolean }
type DriveFile = { id: string; name: string; size: number | null; createdTime: string | null; webViewLink: string | null }
type Phase = { key: string; label: string; state: 'wait' | 'run' | 'done' | 'error'; detail?: string }
const EXPORT_STEPS = [
  { key: 'connect', label: 'ตรวจการเชื่อม Google Drive' },
  { key: 'staff', label: 'อ่านบุคลากรและรายวิชา' },
  { key: 'rooms', label: 'อ่านห้องเรียนและนักเรียน' },
  { key: 'scores', label: 'อ่านคะแนนและเกรด' },
  { key: 'attendance', label: 'อ่านการมาเรียนและเวลาเรียน' },
  { key: 'schedule', label: 'อ่านตารางเรียน เอกสาร และผลประเมิน' },
  { key: 'upload', label: 'อัปโหลดขึ้น Google Drive' },
]
const IMPORT_STEPS = [
  { key: 'check', label: 'ตรวจไฟล์และการยอมรับ' },
  { key: 'accounts', label: 'เตรียมบัญชีบุคลากร' },
  { key: 'catalog', label: 'ข้อมูลโรงเรียน บุคลากร และเวลาคาบ' },
  { key: 'upsert', label: 'รายวิชาและเกณฑ์' },
  { key: 'clear', label: 'ล้างข้อมูลเดิมของปีนี้' },
  { key: 'insert', label: 'นำเข้าข้อมูลใหม่' },
  { key: 'write', label: 'ตรวจผลหลังนำเข้า' },
]
function beginSteps(steps: { key: string; label: string }[]): Phase[] {
  return steps.map((step, index) => ({ ...step, state: index === 0 ? 'run' : 'wait' }))
}
type Preview = { summary: BackupSummary; fileName: string; fileId?: string; raw?: string }

async function readEvents(response: Response, onPhase: (phase: Phase) => void) {
  if (!response.body) throw new Error('ไม่ได้รับสถานะจากระบบ')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done: Record<string, unknown> | null = null
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as { type?: string; message?: string; key?: string; label?: string; state?: Phase['state']; detail?: string }
      if (event.type === 'error') throw new Error(event.message || 'ดำเนินการไม่สำเร็จ')
      if (event.type === 'phase' && event.key && event.label && event.state) {
        onPhase({ key: event.key, label: event.label, state: event.state, detail: event.detail })
      }
      if (event.type === 'done') done = event
    }
  }
  if (!done) throw new Error('ระบบยังทำงานไม่จบ')
  return done
}

function formatWhen(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(date)
}

const PHASE_TEXT = { wait: 'รอ', run: 'กำลังทำ', done: 'เสร็จ', error: 'ไม่สำเร็จ' }

function StatusPopup({ title, phases, busy, notice, error, onClose }: { title: string; phases: Phase[]; busy: boolean; notice?: string; error?: string; onClose: () => void }) {
  if (!phases.length) return null
  const current = phases.find(phase => phase.state === 'run')
  const done = phases.filter(phase => phase.state === 'done').length
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-live="polite" style={{ width: 'min(560px, 100%)', minWidth: 0, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '22px 22px 12px', overflow: 'auto' }}>
          <div className="section-title" style={{ marginBottom: 6 }}>{title}</div>
          <p style={{ margin: '0 0 14px', color: 'var(--text-3)', fontSize: 13, overflowWrap: 'anywhere' }}>
            {current
              ? `${current.label}${current.detail ? ` · ${current.detail}` : ''}`
              : done === phases.length ? 'ทำครบทุกขั้นแล้ว' : `เสร็จ ${done} จาก ${phases.length} ขั้น`}
          </p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {phases.map((phase, index) => (
              <div key={phase.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 14px', borderTop: index ? '1px solid #F1F5F9' : undefined, background: phase.state === 'run' ? '#F8FBFF' : 'white' }}>
                <span style={{ width: 22, color: 'var(--text-3)', flex: 'none' }}>{index + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: phase.state === 'run' ? 700 : 500 }}>{phase.label}</span>
                  <span style={{ display: 'block', marginTop: 2, color: 'var(--text-3)', fontSize: 13, overflowWrap: 'anywhere' }}>{phase.detail || '—'}</span>
                </span>
                <span className={phase.state === 'done' ? 'badge badge-success' : 'badge'} style={{ flex: 'none', ...(phase.state === 'error' ? { background: '#FEE2E2', color: '#991B1B' } : phase.state === 'run' ? { background: '#DBEAFE', color: '#1E40AF' } : undefined) }}>
                  {PHASE_TEXT[phase.state]}
                </span>
              </div>
            ))}
          </div>
          {notice ? <div className="alert alert-success" style={{ marginTop: 14 }}>{notice}</div> : null}
          {error ? <div className="alert alert-error" style={{ marginTop: 14, overflowWrap: 'anywhere' }}>{error}</div> : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 22px 22px', borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{busy ? 'กำลังทำ...' : 'ปิด'}</button>
        </div>
      </div>
    </div>
  )
}

export default function SchoolBackupPanel() {
  const [years, setYears] = useState<Year[]>([])
  const [yearId, setYearId] = useState('')
  const [driveEmail, setDriveEmail] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [files, setFiles] = useState<DriveFile[]>([])
  const [pageError, setPageError] = useState('')
  const [exportPhases, setExportPhases] = useState<Phase[]>([])
  const [exportError, setExportError] = useState('')
  const [exportLink, setExportLink] = useState<{ name: string; href: string | null } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [importPhases, setImportPhases] = useState<Phase[]>([])
  const [importError, setImportError] = useState('')
  const [importDone, setImportDone] = useState('')
  const [importing, setImporting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshAt, setRefreshAt] = useState(0)
  const [fileAction, setFileAction] = useState<{ kind: 'rename' | 'delete'; file: DriveFile } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [fileBusy, setFileBusy] = useState(false)
  const [fileNotice, setFileNotice] = useState('')

  async function reload() {
    const page = await fetchBackupPage()
    setYears(page.years)
    setYearId(current => current || page.years.find(year => year.is_active)?.id || page.years[0]?.id || '')
    setConnected(page.drive.connected)
    setDriveEmail(page.drive.email)
    setFiles(page.files)
    setPageError(page.error || '')
  }

  useEffect(() => {
    reload().catch(error => setPageError(error instanceof Error ? error.message : 'โหลดหน้าสำรองข้อมูลไม่สำเร็จ')).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!refreshAt) return
    const timer = window.setTimeout(() => window.location.reload(), 2500)
    return () => window.clearTimeout(timer)
  }, [refreshAt])

  function rememberPhase(setPhases: (value: Phase[] | ((current: Phase[]) => Phase[])) => void) {
    return (phase: Phase) => setPhases(current => {
      if (!current.some(item => item.key === phase.key)) return [...current, phase]
      return current.map(item => item.key === phase.key ? { ...item, ...phase } : item)
    })
  }

  async function exportBackup() {
    if (!yearId || exporting) return
    setExporting(true)
    setExportError('')
    setExportLink(null)
    setExportPhases(beginSteps(EXPORT_STEPS))
    try {
      const response = await fetch('/api/settings/school-backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearId }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'สำรองข้อมูลไม่สำเร็จ')
      }
      const result = await readEvents(response, rememberPhase(setExportPhases))
      const fileName = String(result.fileName || '')
      setExportLink({ name: fileName, href: typeof result.webViewLink === 'string' ? result.webViewLink : null })
      setRefreshAt(Date.now())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'สำรองข้อมูลไม่สำเร็จ'
      setExportError(message)
      setExportPhases(current => current.map(phase => phase.state === 'run' ? { ...phase, state: 'error', detail: message } : phase))
    } finally {
      setExporting(false)
    }
  }

  function clearPreview() {
    setPreview(null)
    setAccepted(false)
    setImportError('')
    setImportDone('')
    setImportPhases([])
  }

  async function previewDrive(file: DriveFile) {
    clearPreview()
    setImporting(true)
    try {
      const response = await fetch('/api/settings/school-backup/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'อ่านไฟล์ไม่สำเร็จ')
      setPreview({ summary: body.summary, fileName: body.fileName || file.name, fileId: file.id })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ')
    } finally {
      setImporting(false)
    }
  }

  async function downloadDriveFile(file: DriveFile) {
    setFileBusy(true)
    setPageError('')
    setFileNotice('')
    try {
      const response = await fetch('/api/settings/school-backup/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'ดาวน์โหลดไม่สำเร็จ')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'ดาวน์โหลดไม่สำเร็จ')
    } finally {
      setFileBusy(false)
    }
  }

  async function previewLocal(file: File | undefined) {
    if (!file) return
    clearPreview()
    try {
      const raw = await file.text()
      const summary = summarizeBackup(JSON.parse(raw))
      setPreview({ summary, fileName: file.name, raw })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'ไฟล์นี้ไม่ใช่ข้อมูลสำรองของจารย์เสก')
    }
  }

  async function importBackup() {
    if (!preview || !accepted || importing) return
    setImporting(true)
    setImportError('')
    setImportDone('')
    setPreview(null)
    setImportPhases(beginSteps(IMPORT_STEPS))
    try {
      const response = preview.fileId
        ? await fetch('/api/settings/school-backup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: preview.fileId, accept: true }),
        })
        : await fetch('/api/settings/school-backup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-backup-accept': 'yes' },
          body: preview.raw,
        })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'นำเข้าข้อมูลไม่สำเร็จ')
      }
      const result = await readEvents(response, rememberPhase(setImportPhases))
      const warnings = Array.isArray(result.warnings) ? result.warnings.length : 0
      setImportDone(warnings ? `นำเข้าแล้ว มี ${warnings} บัญชีที่อัปเดตอีเมลเข้าสู่ระบบไม่สำเร็จ` : 'นำเข้าข้อมูลแล้ว')
      setAccepted(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'นำเข้าข้อมูลไม่สำเร็จ'
      setImportError(message)
      setImportPhases(current => current.map(phase => phase.state === 'run' ? { ...phase, state: 'error', detail: message } : phase))
    } finally {
      setImporting(false)
    }
  }

  function openRename(file: DriveFile) {
    setFileNotice('')
    setPageError('')
    setRenameValue(file.name)
    setFileAction({ kind: 'rename', file })
  }

  async function saveRename() {
    if (!fileAction || fileAction.kind !== 'rename' || fileBusy) return
    setFileBusy(true)
    setPageError('')
    const result = await renameBackupFile(fileAction.file.id, renameValue)
    setFileBusy(false)
    if ('error' in result && result.error) {
      setPageError(result.error)
      return
    }
    setFileAction(null)
    setFileNotice(`แก้ชื่อเป็น ${'name' in result ? result.name : renameValue} แล้ว`)
    await reload()
  }

  async function confirmDelete() {
    if (!fileAction || fileAction.kind !== 'delete' || fileBusy) return
    setFileBusy(true)
    setPageError('')
    const result = await deleteBackupFile(fileAction.file.id)
    setFileBusy(false)
    if ('error' in result && result.error) {
      setPageError(result.error)
      return
    }
    const name = fileAction.file.name
    setFileAction(null)
    setFileNotice(`ลบ ${name} ออกจาก Google Drive แล้ว`)
    await reload()
  }

  const localYear = years.find(year => year.year_be === preview?.summary.academicYear.yearBe)
  const yearClash = Boolean(preview && localYear && localYear.id !== preview.summary.academicYear.id)
  const canImport = Boolean(preview && accepted && !yearClash && !importing)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: 'var(--text-3)' }}>
        กำลังโหลด...
      </div>
    )
  }

  const yearLabel = years.find(year => year.id === yearId)

  return (
    <div className="page-stack">
      <section className="control-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>สำรองข้อมูล</div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
            {connected ? `เชื่อม Google Drive แล้ว${driveEmail ? ` · ${driveEmail}` : ''}` : 'ยังไม่ได้เชื่อม Google Drive'}
            {yearLabel ? ` · ปีการศึกษา ${yearLabel.year_be}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180 }}>
            <label className="form-label">ปีการศึกษา</label>
            <select className="form-input" style={{ width: '100%' }} value={yearId} onChange={event => setYearId(event.target.value)} disabled={exporting}>
              {years.map(year => <option key={year.id} value={year.id}>{year.year_be}{year.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
            </select>
          </div>
          {connected ? (
            <button type="button" className="btn btn-primary" onClick={exportBackup} disabled={!yearId || exporting}>
              {exporting ? 'กำลังสำรอง...' : 'สำรองขึ้น Drive'}
            </button>
          ) : (
            <Link className="btn btn-secondary" href="/settings/school?tab=integrations">เชื่อม Google Drive</Link>
          )}
        </div>
      </section>

      {pageError ? <div className="alert alert-error">{pageError}</div> : null}
      {exportError ? <div className="alert alert-error">{exportError}</div> : null}
      {exportLink ? (
        <div className="alert alert-success">
          สำรองแล้ว: {exportLink.name}
          {exportLink.href ? <> · <a href={exportLink.href} target="_blank" rel="noreferrer">เปิดบน Google Drive</a></> : null}
          <div>รายการไฟล์จะรีเฟรชในอีกสักครู่</div>
        </div>
      ) : null}

      <section className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>ไฟล์สำรอง</div>
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
              เลือกไฟล์เพื่อดูรายละเอียดก่อน ปุ่มนำเข้าจะใช้ได้หลังติ๊กยอมรับ · {files.length} ไฟล์บน Drive
            </p>
          </div>
          <label className="btn btn-secondary">
            เลือกไฟล์จากเครื่อง
            <input type="file" accept="application/json,.json" hidden disabled={importing} onChange={event => { void previewLocal(event.target.files?.[0]); event.target.value = '' }} />
          </label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="thai-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 56, textAlign: 'center' }}>#</th>
                <th>ชื่อไฟล์</th>
                <th style={{ width: 180 }}>เวลา</th>
                <th style={{ width: 90, textAlign: 'right' }}>ขนาด</th>
                <th style={{ width: 280, textAlign: 'right' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 36 }}>
                    ยังไม่มีไฟล์สำรองบน Google Drive
                  </td>
                </tr>
              ) : files.map((file, index) => (
                <tr key={file.id}>
                  <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{index + 1}</td>
                  <td style={{ fontWeight: 700 }}>{file.name}</td>
                  <td>{formatWhen(file.createdTime) || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => previewDrive(file)} disabled={importing || fileBusy}>ดูรายละเอียด</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadDriveFile(file)} disabled={importing || fileBusy}>ดาวน์โหลด</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openRename(file)} disabled={importing || fileBusy}>แก้ชื่อ</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => { setFileNotice(''); setFileAction({ kind: 'delete', file }) }} disabled={importing || fileBusy}>ลบ</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {fileNotice ? <div className="alert alert-success">{fileNotice}</div> : null}
      {importPhases.length ? (
        <StatusPopup title="สถานะการนำเข้า" phases={importPhases} busy={importing} notice={importDone} error={importError} onClose={() => setImportPhases([])} />
      ) : exportPhases.length ? (
        <StatusPopup title="สถานะการสำรอง" phases={exportPhases} busy={exporting} notice={exportLink ? `สำรองแล้ว: ${exportLink.name} · รายการไฟล์จะรีเฟรชในอีกสักครู่` : ''} error={exportError} onClose={() => setExportPhases([])} />
      ) : null}

      {fileAction?.kind === 'rename' ? (
        <div className="modal-backdrop" onClick={() => { if (!fileBusy) setFileAction(null) }}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={event => event.stopPropagation()}>
            <div className="section-title" style={{ marginBottom: 6 }}>แก้ไขชื่อไฟล์</div>
            <p style={{ margin: '0 0 14px', color: 'var(--text-3)', fontSize: 13 }}>ชื่อต้องขึ้นต้นด้วย Database_ และลงท้าย .json ไฟล์ยังอยู่โฟลเดอร์เดิม</p>
            <input className="form-input" style={{ width: '100%' }} value={renameValue} onChange={event => setRenameValue(event.target.value)} disabled={fileBusy} />
            {pageError ? <div className="alert alert-error" style={{ marginTop: 12 }}>{pageError}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setFileAction(null)} disabled={fileBusy}>ยกเลิก</button>
              <button type="button" className="btn btn-primary" onClick={saveRename} disabled={fileBusy || !renameValue.trim()}>{fileBusy ? 'กำลังบันทึก...' : 'บันทึกชื่อ'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {fileAction?.kind === 'delete' ? (
        <div className="modal-backdrop" onClick={() => { if (!fileBusy) setFileAction(null) }}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={event => event.stopPropagation()}>
            <div className="section-title" style={{ marginBottom: 6 }}>ลบไฟล์สำรอง</div>
            <p style={{ margin: '0 0 14px', color: 'var(--text-2)', lineHeight: 1.6 }}>
              ลบ {fileAction.file.name} ออกจาก Google Drive ข้อมูลในโรงเรียนไม่เปลี่ยน
            </p>
            {pageError ? <div className="alert alert-error" style={{ marginBottom: 12 }}>{pageError}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setFileAction(null)} disabled={fileBusy}>ยกเลิก</button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={fileBusy}>{fileBusy ? 'กำลังลบ...' : 'ลบไฟล์'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="modal-backdrop" onClick={() => { if (!importing) clearPreview() }}>
          <div className="modal-card" style={{ width: 'min(560px, 100%)', minWidth: 0, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }} onClick={event => event.stopPropagation()}>
            <div style={{ padding: '22px 22px 12px', overflow: 'auto' }}>
              <div className="section-title" style={{ marginBottom: 6 }}>รายละเอียดก่อนนำเข้า</div>
              <p style={{ margin: '0 0 14px', color: 'var(--text-3)', fontSize: 13, overflowWrap: 'anywhere' }}>
                {preview.fileName} · {preview.summary.school.name} ({preview.summary.school.code}) · ปีการศึกษา {preview.summary.academicYear.yearBe} · สำรองเมื่อ {formatWhen(preview.summary.exportedAt)}
              </p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 14px', background: 'var(--bg-2)', color: 'var(--text-3)', fontSize: 12, fontWeight: 700 }}>
                  <span>กลุ่มข้อมูล</span>
                  <span>จำนวน</span>
                </div>
                {preview.summary.sections.map(section => (
                  <div key={section.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '11px 14px', borderTop: '1px solid #F1F5F9' }}>
                    <span style={{ minWidth: 0 }}>{section.label}</span>
                    <strong>{section.count.toLocaleString('th-TH')}</strong>
                  </div>
                ))}
              </div>
              <ul style={{ margin: '14px 0 0', paddingLeft: 18, color: 'var(--text-2)', lineHeight: 1.7 }}>
                {BACKUP_IMPORT_NOTES.map(note => <li key={note}>{note}</li>)}
                {!localYear ? <li>ยังไม่มีปีการศึกษานี้ในโรงเรียน จะสร้างให้โดยไม่สลับปีที่กำลังใช้งาน</li> : null}
              </ul>
            </div>
            <div style={{ padding: '14px 22px 22px', borderTop: '1px solid var(--border)', background: 'white' }}>
              {yearClash ? <div className="alert alert-error">ปีการศึกษานี้มีอยู่แล้วแต่เป็นคนละชุดข้อมูล นำเข้าไฟล์นี้ไม่ได้</div> : (
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 14px', fontWeight: 700 }}>
                  <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={importing} />
                  <span>ฉันตรวจรายละเอียดแล้ว และยอมรับให้นำเข้าข้อมูลนี้แทนที่ข้อมูลปีการศึกษา {preview.summary.academicYear.yearBe}</span>
                </label>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={clearPreview} disabled={importing}>ปิด</button>
                <button type="button" className="btn btn-primary" disabled={!canImport} onClick={importBackup}>
                  {importing ? 'กำลังนำเข้า...' : 'นำเข้าข้อมูล'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {importError ? <div className="alert alert-error">{importError}</div> : null}
      {importDone ? <div className="alert alert-success">{importDone}</div> : null}
    </div>
  )
}
