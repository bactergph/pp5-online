import Link from 'next/link'
import type { CSSProperties } from 'react'
import { lookupDocumentReferenceByCode } from '@/lib/document-reference'

export const dynamic = 'force-dynamic'

function formatThaiDateTime(value: string | null) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function statusLabel(status: string) {
  if (status === 'ready') return { text: 'อนุมัติแล้ว · ไฟล์พร้อมตรวจสอบ', tone: 'ok' as const }
  if (status === 'pending') return { text: 'อนุมัติแล้ว · กำลังจัดเก็บไฟล์', tone: 'warn' as const }
  if (status === 'failed') return { text: 'อนุมัติแล้ว · จัดเก็บไฟล์ไม่สำเร็จ', tone: 'warn' as const }
  return { text: status || 'ไม่ทราบสถานะ', tone: 'muted' as const }
}

export default async function DocumentVerifyPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code: raw } = await params
  const ref = await lookupDocumentReferenceByCode(decodeURIComponent(raw || ''))

  if (!ref) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Digital Reference</p>
          <h1 style={titleStyle}>ไม่พบเอกสาร</h1>
          <p style={bodyStyle}>
            รหัสอ้างอิง <b>{raw?.toUpperCase() || '—'}</b> ไม่มีในระบบ หรืออาจถูกยกเลิกแล้ว
          </p>
          <p style={{ ...bodyStyle, marginTop: 12, color: '#64748b' }}>
            หากสแกนจากกระดาษปพ.5 ให้ตรวจว่ารหัสใต้ QR ตรงกับที่พิมพ์ หรือติดต่อโรงเรียนผู้ออกเอกสาร
          </p>
        </div>
      </main>
    )
  }

  const status = statusLabel(ref.status)

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>ตรวจสอบเอกสาร · Digital Reference</p>
        <h1 style={titleStyle}>{ref.docKindLabel}</h1>
        <p style={{ ...bodyStyle, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{ref.title}</p>

        <div style={{
          marginTop: 18,
          padding: '12px 14px',
          borderRadius: 12,
          background: status.tone === 'ok' ? '#ecfdf5' : status.tone === 'warn' ? '#fffbeb' : '#f8fafc',
          border: `1px solid ${status.tone === 'ok' ? '#a7f3d0' : status.tone === 'warn' ? '#fde68a' : '#e2e8f0'}`,
          color: status.tone === 'ok' ? '#065f46' : status.tone === 'warn' ? '#92400e' : '#475569',
          fontWeight: 700,
        }}>
          {status.text}
        </div>

        <dl style={dlStyle}>
          <div style={rowStyle}>
            <dt style={dtStyle}>รหัสอ้างอิง</dt>
            <dd style={ddStyle}>{ref.code}</dd>
          </div>
          <div style={rowStyle}>
            <dt style={dtStyle}>โรงเรียน</dt>
            <dd style={ddStyle}>{ref.schoolName || '—'}</dd>
          </div>
          <div style={rowStyle}>
            <dt style={dtStyle}>ปีการศึกษา</dt>
            <dd style={ddStyle}>{ref.yearBe ?? '—'}</dd>
          </div>
          <div style={rowStyle}>
            <dt style={dtStyle}>ภาคเรียน</dt>
            <dd style={ddStyle}>{ref.term ?? '—'}</dd>
          </div>
          <div style={rowStyle}>
            <dt style={dtStyle}>วันอนุมัติ</dt>
            <dd style={ddStyle}>{formatThaiDateTime(ref.approvedAt)}</dd>
          </div>
        </dl>

        {ref.pdfUrl ? (
          <a
            href={ref.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={primaryBtnStyle}
          >
            เปิดไฟล์ PDF ที่อนุมัติแล้ว
          </a>
        ) : (
          <p style={{ ...bodyStyle, marginTop: 20, color: '#64748b' }}>
            ยังไม่มีลิงก์ไฟล์ PDF ในระบบ — ลองใหม่อีกครั้งในอีกสักครู่
          </p>
        )}

        <p style={{ marginTop: 28, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
          หน้านี้เป็นข้อมูลสาธารณะสำหรับตรวจสอบความถูกต้องของเอกสาร ·{' '}
          <Link href="/" style={{ color: '#64748b' }}>จารย์เสก</Link>
        </p>
      </div>
    </main>
  )
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  margin: 0,
  padding: '32px 16px',
  background: 'linear-gradient(165deg, #f8fafc 0%, #e2e8f0 45%, #f1f5f9 100%)',
  fontFamily: '"TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif',
  display: 'grid',
  placeItems: 'start center',
}

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: '#fff',
  borderRadius: 20,
  border: '1px solid #e2e8f0',
  boxShadow: '0 18px 50px rgba(15, 23, 42, 0.08)',
  padding: '28px 24px 24px',
}

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#8B6B45',
}

const titleStyle: CSSProperties = {
  margin: '8px 0 6px',
  fontSize: 28,
  fontWeight: 900,
  color: '#0f172a',
  lineHeight: 1.25,
}

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.45,
  color: '#334155',
}

const dlStyle: CSSProperties = {
  margin: '22px 0 0',
  display: 'grid',
  gap: 10,
}

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  gap: 8,
  paddingBottom: 8,
  borderBottom: '1px solid #f1f5f9',
}

const dtStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: '#64748b',
  fontWeight: 600,
}

const ddStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: '#0f172a',
  wordBreak: 'break-word',
}

const primaryBtnStyle: CSSProperties = {
  display: 'block',
  marginTop: 22,
  textAlign: 'center',
  padding: '12px 16px',
  borderRadius: 12,
  background: '#8B6B45',
  color: '#fff',
  fontWeight: 800,
  fontSize: 16,
  textDecoration: 'none',
}
