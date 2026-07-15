'use client'
import { useState } from 'react'
import { login } from '@/lib/actions/auth'
import { resolveSchoolLoginEmail } from '@/lib/schoolAuth'
import ScoutAuthLayout from '@/components/auth/ScoutAuthLayout'
import PasswordInput from '@/components/auth/PasswordInput'

const PREFIXES = ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นาง', 'นางสาว']

type Props = {
  schoolId: string
  schoolName: string
  logoUrl: string | null
  programName: string
  createdBy: string | null
}

export default function SchoolLoginForm({ schoolId, schoolName, logoUrl, programName, createdBy }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)

  async function doLogin(identifier: string, password: string) {
    setLoading(true); setError(null)
    const data = new FormData()
    data.set('email', resolveSchoolLoginEmail(identifier, schoolId))
    data.set('schoolId', schoolId)
    data.set('password', password)
    const result = await login(undefined, data)
    setLoading(false)
    if (result?.error) setError(result.error)
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await doLogin(String(fd.get('username') || ''), String(fd.get('password') || ''))
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError(null)
    const fd = new FormData(e.currentTarget)
    const password = String(fd.get('password') || '')
    const password2 = String(fd.get('password2') || '')
    if (password.length < 6) { setLoading(false); setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัว'); return }
    if (password !== password2) { setLoading(false); setError('รหัสผ่านไม่ตรงกัน'); return }

    const res = await fetch('/api/school-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolId,
        prefix: fd.get('prefix'),
        full_name: fd.get('full_name'),
        username: fd.get('username'),
        password,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(json.error || 'สมัครไม่สำเร็จ'); return }
    setRegistered(true)
    setMode('login')
  }

  return (
    <ScoutAuthLayout
      brandTitle={programName || 'ระบบ ปพ.5'}
      brandSubtitle="ออนไลน์"
      brandTagline={schoolName}
      logoUrl={logoUrl}
      cardTitle={mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
      cardSubtitle={createdBy ? `ผู้ดูแล: ${createdBy}` : 'กรอกชื่อผู้ใช้ หรืออีเมล และรหัสผ่าน'}
      footer={(
        <p className="auth-scout-footer">
          {mode === 'login' ? (
            <>ยังไม่มีบัญชี? <button type="button" onClick={() => { setMode('register'); setError(null) }} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>สมัครใช้งาน</button></>
          ) : (
            <>มีบัญชีแล้ว? <button type="button" onClick={() => { setMode('login'); setError(null) }} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>เข้าสู่ระบบ</button></>
          )}
        </p>
      )}
    >
      {error && <div className="auth-scout-error" role="alert">{error}</div>}
      {registered && mode === 'login' && (
        <div className="alert alert-success" style={{ marginBottom: 14, fontSize: 13 }}>สมัครสำเร็จ — รอผู้ดูแลโรงเรียนอนุมัติก่อนเข้าใช้งาน</div>
      )}

      {mode === 'login' ? (
        <form onSubmit={handleLogin}>
          <div className="auth-scout-field">
            <label className="auth-scout-label" htmlFor="username">ชื่อผู้ใช้ หรืออีเมล</label>
            <input
              id="username"
              name="username"
              className="auth-scout-input"
              placeholder="username หรือ email"
              required
              autoComplete="username"
              inputMode="email"
            />
          </div>
          <div className="auth-scout-field">
            <label className="auth-scout-label" htmlFor="school-password">รหัสผ่าน</label>
            <PasswordInput id="school-password" name="password" placeholder="รหัสผ่าน" />
          </div>
          <div className="auth-scout-links" style={{ justifyContent: 'flex-end' }}>
            <span style={{ color: '#B8A88A', fontSize: 13 }}>ลืมรหัสผ่าน ?</span>
          </div>
          <button type="submit" className="auth-scout-submit" disabled={loading}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister}>
          <div className="auth-scout-register-grid">
            <div className="auth-scout-field" style={{ marginBottom: 0 }}>
              <label className="auth-scout-label">คำนำหน้า</label>
              <select name="prefix" className="auth-scout-select" defaultValue="นาย">
                {PREFIXES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="auth-scout-field" style={{ marginBottom: 0 }}>
              <label className="auth-scout-label">ชื่อ-นามสกุล *</label>
              <input name="full_name" required className="auth-scout-input" placeholder="สมชาย ใจดี" />
            </div>
          </div>
          <div className="auth-scout-field">
            <label className="auth-scout-label">ชื่อผู้ใช้ (username) *</label>
            <input name="username" required className="auth-scout-input" placeholder="username" pattern="[A-Za-z0-9._]+" />
          </div>
          <div className="auth-scout-password-grid">
            <div className="auth-scout-field" style={{ marginBottom: 0 }}>
              <label className="auth-scout-label">รหัสผ่าน *</label>
              <PasswordInput name="password" placeholder="≥ 6 ตัว" autoComplete="new-password" />
            </div>
            <div className="auth-scout-field" style={{ marginBottom: 0 }}>
              <label className="auth-scout-label">ยืนยันรหัสผ่าน *</label>
              <PasswordInput name="password2" placeholder="ยืนยันรหัสผ่าน" autoComplete="new-password" />
            </div>
          </div>
          <button type="submit" className="auth-scout-submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
          </button>
          <p style={{ fontSize: 12, color: '#9A8B72', textAlign: 'center', marginTop: 12 }}>
            สมัครแล้วต้องรอผู้ดูแลโรงเรียนอนุมัติก่อนเข้าใช้งาน
          </p>
        </form>
      )}
    </ScoutAuthLayout>
  )
}
