'use client'

import { useEffect, useState } from 'react'
import LoadingButton from '@/components/LoadingButton'
import SignatureUploadBox from '@/components/SignatureUploadBox'
import { useAppAlert } from '@/lib/use-app-alert'
import { ROLE_LABELS } from '@/lib/roles'
import { changeOwnPassword, fetchOwnProfile, updateOwnProfile } from './actions'

const PREFIXES = ['นาย', 'นาง', 'นางสาว']

type Profile = NonNullable<Awaited<ReturnType<typeof fetchOwnProfile>>>

export default function ProfileSettingsPage() {
  const { notify, AlertModal } = useAppAlert()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [prefix, setPrefix] = useState('นาย')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    void fetchOwnProfile().then(data => {
      if (data) {
        setProfile(data)
        setPrefix(data.prefix || 'นาย')
        setFirstName(data.first_name || '')
        setLastName(data.last_name || '')
        setSignatureUrl(data.signature_url || null)
      }
      setLoading(false)
    })
  }, [])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    const result = await updateOwnProfile({
      prefix,
      first_name: firstName,
      last_name: lastName,
      signature_url: signatureUrl,
    })
    setSavingProfile(false)
    if (result.error) notify('error', result.error)
    else {
      notify('success', 'บันทึกข้อมูลเรียบร้อยแล้ว')
      const data = await fetchOwnProfile()
      if (data) setProfile(data)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setSavingPassword(true)
    const result = await changeOwnPassword(newPassword, confirmPassword)
    setSavingPassword(false)
    if (result.error) notify('error', result.error)
    else {
      notify('success', 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <span style={{ color: 'var(--text-3)', fontSize: 14 }}>กำลังโหลด...</span>
      </div>
    )
  }

  if (!profile) {
    return <div className="alert alert-error">ไม่พบข้อมูลผู้ใช้</div>
  }

  return (
    <div className="page-stack" style={{ maxWidth: 720 }}>
      <div className="page-hero" style={{ marginBottom: 4 }}>
        <div>
          <span className="page-hero-kicker">ตั้งค่า</span>
          <h1 className="page-title">ข้อมูลตัวเอง</h1>
          <p className="page-subtitle">แก้ไขชื่อ-นามสกุล ลายเซ็น และรหัสผ่านของคุณ</p>
        </div>
      </div>

      <form onSubmit={handleSaveProfile} className="card-section" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>ข้อมูลส่วนตัว</div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
            บทบาท: <strong>{ROLE_LABELS[profile.role] || profile.role}</strong>
            {profile.username ? <> · ชื่อผู้ใช้: <strong>{profile.username}</strong></> : null}
          </p>
        </div>

        <div className="form-grid">
          <div>
            <label className="form-label">คำนำหน้า</label>
            <select className="form-input" value={prefix} onChange={e => setPrefix(e.target.value)}>
              {PREFIXES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">ชื่อ *</label>
            <input
              className="form-input"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
              placeholder="ชื่อ"
            />
          </div>
          <div>
            <label className="form-label">นามสกุล *</label>
            <input
              className="form-input"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required
              placeholder="นามสกุล"
            />
          </div>
        </div>

        <SignatureUploadBox
          userId={profile.id}
          value={signatureUrl}
          onUploaded={url => setSignatureUrl(url || null)}
        />

        <div className="form-actions" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <LoadingButton type="submit" loading={savingProfile}>บันทึกข้อมูล</LoadingButton>
        </div>
      </form>

      <form onSubmit={handleChangePassword} className="card-section" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>เปลี่ยนรหัสผ่าน</div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร</p>
        </div>
        <div className="form-grid">
          <div>
            <label className="form-label">รหัสผ่านใหม่</label>
            <input
              type="password"
              className="form-input"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              placeholder="อย่างน้อย 8 ตัวอักษร"
            />
          </div>
          <div>
            <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              placeholder="พิมพ์ซ้ำอีกครั้ง"
            />
          </div>
        </div>
        <div className="form-actions" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <LoadingButton type="submit" loading={savingPassword} className="btn btn-secondary">
            เปลี่ยนรหัสผ่าน
          </LoadingButton>
        </div>
      </form>

      <AlertModal />
    </div>
  )
}
