'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchBackupPage } from '@/app/(shell)/settings/backup/actions'
import {
  BACKUP_IMPORT_NOTES,
  summarizeBackup,
  type BackupSummary,
} from '@/lib/school-backup/format'

type Year = { id: string; year_be: number; is_active: boolean }
type DriveFile = { id: string; name: string; size: number | null; createdTime: string | null; webViewLink: string | null }
type Phase = { key: string; label: string; state: 'run' | 'done' | 'error'; detail?: string }
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

function StatusList({ phases }: { phases: Phase[] }) {
  if (!phases.length) return null
  return (
    <ol className="backup-status" aria-live="polite">
      {phases.map(phase => (
        <li key={phase.key} data-state={phase.state}>
          <span>{phase.state === 'done' ? 'เสร็จ' : phase.state === 'error' ? 'ไม่สำเร็จ' : 'กำลังทำ'}</span>
          <strong>{phase.label}</strong>
          {phase.detail ? <small>{phase.detail}</small> : null}
        </li>
      ))}
    </ol>
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

  function rememberPhase(setPhases: (value: Phase[] | ((current: Phase[]) => Phase[])) => void) {
    return (phase: Phase) => setPhases(current => [...current.filter(item => item.key !== phase.key), phase])
  }

  async function exportBackup() {
    if (!yearId || exporting) return
    setExporting(true)
    setExportError('')
    setExportLink(null)
    setExportPhases([])
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
      await reload()
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'สำรองข้อมูลไม่สำเร็จ')
      setExportPhases(current => current.map(phase => phase.state === 'run' ? { ...phase, state: 'error' } : phase))
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
    setImportPhases([{ key: 'read', label: 'อ่านรายละเอียดไฟล์จาก Google Drive', state: 'run' }])
    try {
      const response = await fetch('/api/settings/school-backup/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'อ่านไฟล์ไม่สำเร็จ')
      setPreview({ summary: body.summary, fileName: body.fileName || file.name, fileId: file.id })
      setImportPhases([{ key: 'read', label: 'อ่านรายละเอียดไฟล์จาก Google Drive', state: 'done', detail: body.fileName || file.name }])
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ')
      setImportPhases([])
    } finally {
      setImporting(false)
    }
  }

  async function previewLocal(file: File | undefined) {
    if (!file) return
    clearPreview()
    setImportPhases([{ key: 'read', label: 'อ่านรายละเอียดไฟล์จากเครื่อง', state: 'run' }])
    try {
      const raw = await file.text()
      const summary = summarizeBackup(JSON.parse(raw))
      setPreview({ summary, fileName: file.name, raw })
      setImportPhases([{ key: 'read', label: 'อ่านรายละเอียดไฟล์จากเครื่อง', state: 'done', detail: file.name }])
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'ไฟล์นี้ไม่ใช่ข้อมูลสำรองของจารย์เสก')
      setImportPhases([])
    }
  }

  async function importBackup() {
    if (!preview || !accepted || importing) return
    setImporting(true)
    setImportError('')
    setImportDone('')
    setImportPhases([])
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
      setImportError(error instanceof Error ? error.message : 'นำเข้าข้อมูลไม่สำเร็จ')
      setImportPhases(current => current.map(phase => phase.state === 'run' ? { ...phase, state: 'error' } : phase))
    } finally {
      setImporting(false)
    }
  }

  const localYear = years.find(year => year.year_be === preview?.summary.academicYear.yearBe)
  const yearClash = Boolean(preview && localYear && localYear.id !== preview.summary.academicYear.id)
  const canImport = Boolean(preview && accepted && !yearClash && !importing)

  return (
    <div className="page-stack school-backup">
      <div className="control-card school-settings-head">
        <div>
          <h1 className="section-title">สำรองข้อมูล</h1>
          <p className="backup-note">สำรองคะแนน เกรด การมาเรียน บุคลากร รายวิชา ตารางเรียน และข้อมูลทั้งปีขึ้น Google Drive</p>
        </div>
        <div className="school-settings-head-actions">
          {connected ? <span className="badge badge-success">{driveEmail || 'เชื่อม Google Drive แล้ว'}</span> : <Link className="btn btn-ghost" href="/settings/school?tab=integrations">เชื่อม Google Drive</Link>}
        </div>
      </div>

      {pageError ? <div className="alert alert-error">{pageError}</div> : null}

      <section className="data-card card-padded">
        <h2 className="section-title">สำรองขึ้น Google Drive</h2>
        <div className="form-grid">
          <label>
            <span className="form-label">ปีการศึกษา</span>
            <select className="form-input" value={yearId} onChange={event => setYearId(event.target.value)} disabled={loading || exporting}>
              {years.map(year => <option key={year.id} value={year.id}>{year.year_be}{year.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
            </select>
          </label>
        </div>
        <p className="backup-note">ไฟล์จะชื่อ Database_โรงเรียน … ปีการศึกษา … และอยู่ในโฟลเดอร์สำรองข้อมูล</p>
        <button type="button" className="btn btn-primary" onClick={exportBackup} disabled={!connected || !yearId || exporting || loading}>
          {exporting ? 'กำลังสำรองข้อมูล...' : 'สำรองข้อมูล'}
        </button>
        <StatusList phases={exportPhases} />
        {exportError ? <div className="alert alert-error">{exportError}</div> : null}
        {exportLink ? (
          <div className="alert alert-success">
            สำรองแล้ว: {exportLink.name}
            {exportLink.href ? <> · <a href={exportLink.href} target="_blank" rel="noreferrer">เปิดบน Google Drive</a></> : null}
          </div>
        ) : null}
      </section>

      <section className="data-card card-padded">
        <h2 className="section-title">นำเข้าข้อมูล</h2>
        <p className="backup-note">เลือกไฟล์สำรองเพื่อดูรายละเอียดก่อน ปุ่มนำเข้าจะใช้ได้หลังติ๊กยอมรับ</p>
        <div className="backup-file-list">
          {files.length ? files.map(file => (
            <button key={file.id} type="button" className="backup-file" onClick={() => previewDrive(file)} disabled={importing}>
              <strong>{file.name}</strong>
              <small>{formatWhen(file.createdTime)}{file.size ? ` · ${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}</small>
            </button>
          )) : <p className="backup-note">ยังไม่มีไฟล์สำรองบน Google Drive</p>}
        </div>
        <label className="btn btn-ghost">
          เลือกไฟล์จากเครื่อง
          <input type="file" accept="application/json,.json" hidden onChange={event => { void previewLocal(event.target.files?.[0]); event.target.value = '' }} />
        </label>
        <StatusList phases={importPhases} />
        {preview ? (
          <div className="backup-preview">
            <h3>{preview.fileName}</h3>
            <p>{preview.summary.school.name} ({preview.summary.school.code}) · ปีการศึกษา {preview.summary.academicYear.yearBe} · สำรองเมื่อ {formatWhen(preview.summary.exportedAt)}</p>
            <ul className="backup-counts">
              {preview.summary.sections.map(section => (
                <li key={section.key}><span>{section.label}</span><strong>{section.count.toLocaleString('th-TH')}</strong></li>
              ))}
            </ul>
            <ul className="backup-notes">
              {BACKUP_IMPORT_NOTES.map(note => <li key={note}>{note}</li>)}
              {!localYear ? <li>ยังไม่มีปีการศึกษานี้ในโรงเรียน จะสร้างให้โดยไม่สลับปีที่กำลังใช้งาน</li> : null}
            </ul>
            {yearClash ? <div className="alert alert-error">ปีการศึกษานี้มีอยู่แล้วแต่เป็นคนละชุดข้อมูล นำเข้าไฟล์นี้ไม่ได้</div> : (
              <label className="backup-accept">
                <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={importing} />
                <span>ฉันตรวจรายละเอียดแล้ว และยอมรับให้นำเข้าข้อมูลนี้แทนที่ข้อมูลปีการศึกษา {preview.summary.academicYear.yearBe}</span>
              </label>
            )}
            <button type="button" className="btn btn-primary" disabled={!canImport} onClick={importBackup}>
              {importing ? 'กำลังนำเข้าข้อมูล...' : 'นำเข้าข้อมูล'}
            </button>
          </div>
        ) : null}
        {importError ? <div className="alert alert-error">{importError}</div> : null}
        {importDone ? <div className="alert alert-success">{importDone}</div> : null}
      </section>
    </div>
  )
}
