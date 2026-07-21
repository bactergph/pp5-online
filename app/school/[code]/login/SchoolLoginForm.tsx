'use client'
import { useState } from 'react'
import { login } from '@/lib/actions/auth'
import { resolveSchoolLoginEmail } from '@/lib/schoolAuth'
import ScoutAuthLayout from '@/components/auth/ScoutAuthLayout'
import PasswordInput from '@/components/auth/PasswordInput'

const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'อื่นๆ'] as const

type Props = {
  schoolId: string
  logoUrl: string | null
  programName: string
  createdBy: string | null
}

export default function SchoolLoginForm({ schoolId, logoUrl, programName, createdBy }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)
  const [prefixChoice, setPrefixChoice] = useState<string>('นาย')
  const [customPrefix, setCustomPrefix] = useState('')

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

    const resolvedPrefix = prefixChoice === 'อื่นๆ'
      ? customPrefix.trim()
      : prefixChoice
    if (!resolvedPrefix) {
      setLoading(false)
      setError(prefixChoice === 'อื่นๆ' ? 'กรุณาระบุคำนำหน้า' : 'กรุณาเลือกคำนำหน้า')
      return
    }

    const res = await fetch('/api/school-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolId,
        prefix: resolvedPrefix,
        full_name: fd.get('full_name'),
        position: String(fd.get('position') || '').trim(),
        username: fd.get('username'),
        password,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(json.error || 'สมัครไม่สำเร็จ'); return }
    setRegistered(true)
    setMode('login')
    setPrefixChoice('นาย')
    setCustomPrefix('')
  }

  return (
    <ScoutAuthLayout
      variant="school"
      brandTitle={programName?.trim() || 'ระบบ ปพ.5 ออนไลน์'}
      brandSubtitle=""
      logoUrl={logoUrl}
      cardTitle={mode === 'login' ? '' : 'สมัครสมาชิก'}
      cardSubtitle={
        mode === 'login'
          ? (createdBy ? `ผู้ดูแล: ${createdBy}` : 'กรอกชื่อผู้ใช้ หรืออีเมล และรหัสผ่าน')
          : (createdBy ? `ผู้ดูแล: ${createdBy}` : 'กรอกข้อมูลเพื่อสมัครใช้งาน')
      }
      footer={(
        <p className="auth-scout-footer auth-scout-footer--school">
          {mode === 'login' ? (
            <>ยังไม่มีบัญชี? <button type="button" onClick={() => { setMode('register'); setError(null) }} className="auth-scout-footer__btn">สมัครใช้งาน</button></>
          ) : (
            <>มีบัญชีแล้ว? <button type="button" onClick={() => { setMode('login'); setError(null) }} className="auth-scout-footer__btn">เข้าสู่ระบบ</button></>
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
            <a href="/forgot-password">ผู้ดูแลโรงเรียนลืมรหัส?</a>
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
              <label className="auth-scout-label" htmlFor="reg-prefix">คำนำหน้า</label>
              <select
                id="reg-prefix"
                name="prefix"
                className="auth-scout-select"
                value={prefixChoice}
                onChange={e => setPrefixChoice(e.target.value)}
              >
                {PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="auth-scout-field" style={{ marginBottom: 0 }}>
              <label className="auth-scout-label" htmlFor="reg-full-name">ชื่อ-นามสกุล *</label>
              <input id="reg-full-name" name="full_name" required className="auth-scout-input" placeholder="สมชาย ใจดี" autoComplete="name" />
            </div>
          </div>
          {prefixChoice === 'อื่นๆ' && (
            <div className="auth-scout-field">
              <label className="auth-scout-label" htmlFor="reg-prefix-custom">ระบุคำนำหน้า *</label>
              <input
                id="reg-prefix-custom"
                className="auth-scout-input"
                value={customPrefix}
                onChange={e => setCustomPrefix(e.target.value)}
                placeholder="เช่น ว่าที่ร้อยตรี, พันจ่าเอก"
                required
                maxLength={40}
                autoComplete="honorific-prefix"
              />
            </div>
          )}
          <div className="auth-scout-field">
            <label className="auth-scout-label" htmlFor="reg-position">ตำแหน่ง</label>
            <input
              id="reg-position"
              name="position"
              className="auth-scout-input"
              placeholder="เช่น ครู, ครูชำนาญการ, ผู้อำนวยการ"
              maxLength={80}
              autoComplete="organization-title"
            />
          </div>
          <div className="auth-scout-field">
            <label className="auth-scout-label" htmlFor="reg-username">ชื่อผู้ใช้ (username) *</label>
            <input id="reg-username" name="username" required className="auth-scout-input" placeholder="username" pattern="[A-Za-z0-9._]+" autoComplete="username" />
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
