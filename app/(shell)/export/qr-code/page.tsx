'use client'

import { useEffect, useMemo, useState } from 'react'
import { zipSync } from 'fflate'
import {
  buildQrExportPack,
  fetchQrExportInit,
  previewQrExportMatches,
  uploadQrExportToDrive,
  type QrExportFilter,
  type QrExportInit,
  type QrExportMatch,
  type QrExportScope,
} from './actions'
import {
  QR_EXPORT_KIND_FOLDER,
  QR_EXPORT_KIND_LABELS,
  QR_EXPORT_ROOT_FOLDER,
  type QrExportDocKind,
} from '@/lib/export-qr-pack'

function base64ToUint8(base64: string) {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export default function QrCodeExportPage() {
  const [init, setInit] = useState<QrExportInit | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<QrExportMatch[]>([])
  const [previewCount, setPreviewCount] = useState(0)
  const [truncated, setTruncated] = useState(false)

  const [yearId, setYearId] = useState('')
  const [docKind, setDocKind] = useState<QrExportDocKind>('pp5_subject')
  const [term, setTerm] = useState<0 | 1 | 2>(0)
  const [scope, setScope] = useState<QrExportScope>('subject_school')
  const [level, setLevel] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [subjectKey, setSubjectKey] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchQrExportInit()
      .then(result => {
        if (!alive) return
        setInit(result)
        const active = result.years.find(y => y.is_active) || result.years[0]
        setYearId(active?.id || '')
        if (result.subjects[0]) setSubjectKey(result.subjects[0].key)
      })
      .catch((err: Error) => {
        if (alive) setError(err.message || 'โหลดข้อมูลไม่สำเร็จ')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const yearClassrooms = useMemo(
    () => (init?.classrooms || []).filter(c => c.academic_year_id === yearId),
    [init, yearId],
  )
  const levels = useMemo(
    () => Array.from(new Set(yearClassrooms.map(c => c.level))).sort((a, b) => a.localeCompare(b, 'th')),
    [yearClassrooms],
  )
  const roomOptions = useMemo(
    () => yearClassrooms.filter(c => !level || c.level === level).sort((a, b) => a.room - b.room),
    [yearClassrooms, level],
  )
  const yearBe = init?.years.find(y => y.id === yearId)?.year_be

  useEffect(() => {
    if (!level && levels[0]) setLevel(levels[0])
    else if (level && levels.length && !levels.includes(level)) setLevel(levels[0] || '')
  }, [levels, level])

  useEffect(() => {
    if (classroomId && !roomOptions.some(c => c.id === classroomId)) setClassroomId('')
  }, [roomOptions, classroomId])

  useEffect(() => {
    // ปรับ scope เริ่มต้นเมื่อเปลี่ยนประเภทเอกสาร
    if (docKind === 'pp5_subject') setScope('subject_school')
    else setScope('school')
  }, [docKind])

  const scopeOptions = useMemo(() => {
    if (docKind === 'pp5_subject') {
      return [
        { value: 'subject_one' as const, label: 'วิชา + ห้องเดียว' },
        { value: 'subject_level' as const, label: 'วิชาเดียวกัน · ทั้งระดับชั้น' },
        { value: 'subject_school' as const, label: 'วิชาเดียวกัน · ทั้งโรงเรียน' },
        { value: 'school' as const, label: 'ทุกวิชา · ทั้งโรงเรียน' },
      ]
    }
    return [
      { value: 'classroom' as const, label: 'ห้องเดียว' },
      { value: 'level' as const, label: 'ทั้งระดับชั้น (ทุกห้อง)' },
      { value: 'school' as const, label: 'ทั้งโรงเรียน' },
    ]
  }, [docKind])

  function buildFilter(): QrExportFilter | null {
    if (!yearId) return null
    const needsSubject = docKind === 'pp5_subject' && scope !== 'school'
    if (needsSubject && !subjectKey) return null
    if ((scope === 'classroom' || scope === 'subject_one') && !classroomId) return null
    if ((scope === 'level' || scope === 'subject_level') && !level) return null
    return {
      academicYearId: yearId,
      docKind,
      scope,
      term,
      classroomId: classroomId || undefined,
      level: level || undefined,
      subjectKey: needsSubject ? (subjectKey || undefined) : undefined,
    }
  }

  async function handlePreview() {
    const filter = buildFilter()
    if (!filter) {
      setError('เลือกเงื่อนไขให้ครบก่อน')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await previewQrExportMatches(filter)
      setPreview(result.matches)
      setPreviewCount(result.count)
      setTruncated(result.truncated)
      setMessage(result.count
        ? `พบ ${result.count} รายการที่อนุมัติแล้ว`
        : 'ไม่พบเอกสารที่อนุมัติแล้วตามเงื่อนไข')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดูตัวอย่างไม่สำเร็จ')
      setPreview([])
      setPreviewCount(0)
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadZip() {
    const filter = buildFilter()
    if (!filter) {
      setError('เลือกเงื่อนไขให้ครบก่อน')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const pack = await buildQrExportPack(filter)
      const files: Record<string, Uint8Array> = {}
      for (const file of pack.files) {
        files[file.path] = base64ToUint8(file.base64)
      }
      const zipped = zipSync(files, { level: 0 })
      downloadBlob(new Blob([zipped], { type: 'application/zip' }), pack.zipName)
      setMessage(`ดาวน์โหลด ZIP แล้ว ${pack.count} QR`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้าง ZIP ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function handleUploadDrive() {
    const filter = buildFilter()
    if (!filter) {
      setError('เลือกเงื่อนไขให้ครบก่อน')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await uploadQrExportToDrive(filter)
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage(`อัปโหลด Drive แล้ว ${result.uploaded} ไฟล์ → ${result.folderHint || QR_EXPORT_ROOT_FOLDER}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="export-page"><p>กำลังโหลด…</p></div>
  }

  return (
    <div className="export-page qr-export-page">
      <header className="qr-export-header">
        <div>
          <h1>สร้าง QR-Code เอกสาร</h1>
          <p>
            สร้าง QR จากเอกสารที่อนุมัติแล้ว (Digital Reference) เก็บตามโครง
            {' '}
            <b>{QR_EXPORT_ROOT_FOLDER}</b>
            {' → ปีการศึกษา → ประเภท → ชั้น → ห้อง'}
          </p>
        </div>
        {!init?.driveConnected && (
          <div className="qr-export-warn">ยังไม่ได้เชื่อม Google Drive — ยังดาวน์โหลด ZIP ได้</div>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {message && !error && <div className="alert alert-ok">{message}</div>}

      <section className="qr-export-card">
        <h2>1. เลือกประเภทเอกสาร</h2>
        <div className="qr-export-kind-row">
          {(Object.keys(QR_EXPORT_KIND_LABELS) as QrExportDocKind[]).map(kind => (
            <button
              key={kind}
              type="button"
              className={`qr-kind-btn${docKind === kind ? ' active' : ''}`}
              onClick={() => setDocKind(kind)}
            >
              {QR_EXPORT_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </section>

      <section className="qr-export-card">
        <h2>2. เงื่อนไข</h2>
        <div className="qr-export-grid">
          <label>
            <span>ปีการศึกษา</span>
            <select value={yearId} onChange={e => setYearId(e.target.value)} className="form-input">
              {(init?.years || []).map(y => (
                <option key={y.id} value={y.id}>{y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>
              ))}
            </select>
          </label>

          <label>
            <span>ภาคเรียน</span>
            <select value={term} onChange={e => setTerm(Number(e.target.value) as 0 | 1 | 2)} className="form-input">
              <option value={0}>ทั้งหมด</option>
              <option value={1}>ภาคเรียนที่ 1</option>
              <option value={2}>ภาคเรียนที่ 2</option>
            </select>
          </label>

          <label>
            <span>ขอบเขต</span>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as QrExportScope)}
              className="form-input"
            >
              {scopeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          {docKind === 'pp5_subject' && scope !== 'school' && (
            <label className="qr-span-2">
              <span>วิชา</span>
              <select value={subjectKey} onChange={e => setSubjectKey(e.target.value)} className="form-input">
                {(init?.subjects || []).map(s => (
                  <option key={s.key} value={s.key}>
                    {s.code ? `${s.code} · ${s.name}` : s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(scope === 'level' || scope === 'subject_level' || scope === 'classroom' || scope === 'subject_one') && (
            <label>
              <span>ระดับชั้น</span>
              <select value={level} onChange={e => setLevel(e.target.value)} className="form-input">
                {levels.map(lv => <option key={lv} value={lv}>{lv}</option>)}
              </select>
            </label>
          )}

          {(scope === 'classroom' || scope === 'subject_one') && (
            <label>
              <span>ห้อง</span>
              <select value={classroomId} onChange={e => setClassroomId(e.target.value)} className="form-input">
                <option value="">— เลือกห้อง —</option>
                {roomOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.level}/{c.room}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="qr-export-path-hint">
          ตัวอย่างโฟลเดอร์:{' '}
          <code>
            {QR_EXPORT_ROOT_FOLDER}/{yearBe || 'ปี'}/{QR_EXPORT_KIND_FOLDER[docKind]}/
            {level || 'ชั้น'}/{(roomOptions.find(c => c.id === classroomId)?.room) || 'ห้อง'}
          </code>
        </div>
      </section>

      <section className="qr-export-actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void handlePreview()}>
          ดูรายการที่จะสร้าง
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleDownloadZip()}>
          ดาวน์โหลด ZIP
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !init?.driveConnected}
          onClick={() => void handleUploadDrive()}
          title={!init?.driveConnected ? 'เชื่อม Google Drive ก่อน' : undefined}
        >
          อัปโหลดขึ้น Google Drive
        </button>
      </section>

      {previewCount > 0 && (
        <section className="qr-export-card">
          <h2>รายการ ({previewCount}{truncated ? ' — แสดงบางส่วน' : ''})</h2>
          <div className="qr-export-table-wrap">
            <table className="qr-export-table">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>เอกสาร</th>
                  <th>ชั้น/ห้อง</th>
                  <th>โฟลเดอร์</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(item => (
                  <tr key={item.exportId}>
                    <td><code>{item.code}</code></td>
                    <td>{item.title}</td>
                    <td>{item.level}/{item.room}</td>
                    <td className="qr-path">{item.folderPath}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <style jsx>{`
        .qr-export-page {
          max-width: 960px;
          margin: 0 auto;
          padding: 20px 16px 48px;
          display: grid;
          gap: 16px;
        }
        .qr-export-header h1 {
          margin: 0 0 6px;
          font-size: 24px;
          font-weight: 900;
        }
        .qr-export-header p {
          margin: 0;
          color: #64748b;
          line-height: 1.45;
        }
        .qr-export-warn {
          margin-top: 10px;
          padding: 8px 12px;
          border-radius: 8px;
          background: #fffbeb;
          color: #92400e;
          font-size: 13px;
          font-weight: 700;
        }
        .qr-export-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px 18px;
        }
        .qr-export-card h2 {
          margin: 0 0 12px;
          font-size: 15px;
          font-weight: 800;
        }
        .qr-export-kind-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .qr-kind-btn {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 999px;
          padding: 8px 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .qr-kind-btn.active {
          border-color: #8B6B45;
          background: #F5EDE3;
          color: #6B4F32;
        }
        .qr-export-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .qr-export-grid label {
          display: grid;
          gap: 4px;
          font-size: 13px;
          font-weight: 700;
          color: #475569;
        }
        .qr-span-2 { grid-column: span 2; }
        .qr-export-path-hint {
          margin-top: 12px;
          font-size: 12px;
          color: #64748b;
        }
        .qr-export-path-hint code {
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .qr-export-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .alert {
          padding: 10px 12px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 14px;
        }
        .alert-error { background: #fef2f2; color: #b91c1c; }
        .alert-ok { background: #ecfdf5; color: #065f46; }
        .qr-export-table-wrap { overflow: auto; }
        .qr-export-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .qr-export-table th,
        .qr-export-table td {
          border-bottom: 1px solid #e2e8f0;
          padding: 8px 6px;
          text-align: left;
          vertical-align: top;
        }
        .qr-export-table th { color: #64748b; font-weight: 800; }
        .qr-path { font-size: 11px; color: #64748b; word-break: break-all; }
        @media (max-width: 720px) {
          .qr-export-grid { grid-template-columns: 1fr; }
          .qr-span-2 { grid-column: auto; }
        }
      `}</style>
    </div>
  )
}
