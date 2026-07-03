'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { removeLightBackgroundToPng } from '@/lib/remove-image-background'

type Props = {
  label?: string
  value: string | null
  userId: string
  disabled?: boolean
  onUploaded: (url: string) => void
}

export default function SignatureUploadBox({
  label = 'ลายเซ็น (PNG)',
  value,
  userId,
  disabled,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setError('รองรับ PNG, JPG, WEBP')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('ไฟล์ต้องไม่เกิน 2 MB')
      return
    }

    setUploading(true)
    setError(null)
    try {
      let uploadFile: Blob = file
      if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
        uploadFile = await removeLightBackgroundToPng(file)
      }

      const fd = new FormData()
      fd.append('file', uploadFile, file.type.includes('jpeg') || file.type.includes('jpg') ? 'signature.png' : file.name)
      fd.append('user_id', userId)

      const res = await fetch('/api/upload/user-signature', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'อัปโหลดไม่สำเร็จ')
      onUploaded(json.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <label className="form-label">{label}</label>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-3)' }}>
        แนะนำ PNG พื้นโปร่งใส — ถ้าเป็น JPEG ระบบจะลบพื้นหลังสีขาวให้อัตโนมัติ
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          onClick={() => !disabled && inputRef.current?.click()}
          style={{
            width: 180,
            height: 72,
            borderRadius: 10,
            border: '2px dashed var(--border)',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {value ? (
            <Image src={value} alt="ลายเซ็น" fill unoptimized style={{ objectFit: 'contain', padding: 6 }} />
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>
              {uploading ? 'กำลังอัปโหลด...' : 'คลิกเพื่อเลือกไฟล์'}
            </span>
          )}
        </div>
        {value && !disabled && (
          <button type="button" className="btn btn-secondary" onClick={() => onUploaded('')}>
            ลบลายเซ็น
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" hidden onChange={handleFile} />
      {error && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#DC2626' }}>{error}</p>}
    </div>
  )
}
