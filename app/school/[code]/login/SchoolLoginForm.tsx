'use client'
import { useState } from 'react'
import { login } from '@/lib/actions/auth'
import { resolveSchoolLoginEmail } from '@/lib/schoolAuth'
import AuthScreen from '@/components/auth/AuthScreen'
import { FiArrowRight } from 'react-icons/fi'
import PasswordInput from '@/components/auth/PasswordInput'

const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'อื่นๆ'] as const

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
    <AuthScreen mode={mode} school={{ name: schoolName, logoUrl, programName }}>
      <h2>{mode === 'login' ? 'เข้าสู่ระบบโรงเรียน' : 'สมัครบัญชีบุคลากร'}</h2>
      <p>{schoolName}</p>
      {createdBy && <p className="auth-field-hint">ผู้ดูแล: {createdBy}</p>}
      {error && <div className="welcome-login-error auth-school-message" role="alert">{error}</div>}
      {registered && mode === 'login' && (
        <div className="auth-school-success" role="status">สมัครสำเร็จ — รอผู้ดูแลโรงเรียนอนุมัติก่อนเข้าใช้งาน</div>
      )}

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="welcome-login-form" aria-busy={loading}>
          <div className="auth-school-field">
            <label className="auth-school-label" htmlFor="username">ชื่อผู้ใช้ หรืออีเมล</label>
            <input
              id="username"
              name="username"
              className="auth-scout-input"
              placeholder="username หรือ email"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div className="auth-school-field">
            <label className="auth-school-label" htmlFor="school-password">รหัสผ่าน</label>
            <PasswordInput id="school-password" name="password" placeholder="รหัสผ่าน" />
          </div>
          <div>
            <a href="/forgot-password" className="welcome-forgot">ผู้ดูแลโรงเรียนลืมรหัส?</a>
          </div>
          <button type="submit" className="welcome-button welcome-button-primary" disabled={loading}>

            {loading ? <><span className="welcome-spinner" aria-hidden />กำลังเข้าสู่ระบบ...</> : <>เข้าสู่ระบบ<FiArrowRight aria-hidden /></>}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="welcome-login-form" aria-busy={loading}>
          <div className="auth-field-grid auth-field-grid--name">
            <div className="auth-school-field" style={{ marginBottom: 0 }}>
              <label className="auth-school-label" htmlFor="reg-prefix">คำนำหน้า</label>
              <select
                id="reg-prefix"
                name="prefix"
                className="auth-school-select"
                value={prefixChoice}
                onChange={e => setPrefixChoice(e.target.value)}
              >
                {PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="auth-school-field" style={{ marginBottom: 0 }}>
              <label className="auth-school-label" htmlFor="reg-full-name">ชื่อ-นามสกุล *</label>
              <input id="reg-full-name" name="full_name" required className="auth-scout-input" placeholder="สมชาย ใจดี" autoComplete="name" />
            </div>
          </div>
          {prefixChoice === 'อื่นๆ' && (
            <div className="auth-school-field">
              <label className="auth-school-label" htmlFor="reg-prefix-custom">ระบุคำนำหน้า *</label>
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
          <div className="auth-school-field">
            <label className="auth-school-label" htmlFor="reg-position">ตำแหน่ง</label>
            <input
              id="reg-position"
              name="position"
              className="auth-scout-input"
              placeholder="เช่น ครู, ครูชำนาญการ, ผู้อำนวยการ"
              maxLength={80}
              autoComplete="organization-title"
            />
          </div>
          <div className="auth-school-field">
            <label className="auth-school-label" htmlFor="reg-username">ชื่อผู้ใช้ (username) *</label>
            <input id="reg-username" name="username" required className="auth-scout-input" placeholder="username" pattern="[A-Za-z0-9._]+" title="ใช้ตัวอักษรภาษาอังกฤษ ตัวเลข จุด หรือขีดล่าง" autoCapitalize="none" spellCheck={false} autoComplete="username" />
          </div>
          <div className="auth-field-grid">
            <div className="auth-school-field" style={{ marginBottom: 0 }}>
              <label className="auth-school-label" htmlFor="reg-password">รหัสผ่าน *</label>
              <PasswordInput id="reg-password" name="password" placeholder="≥ 6 ตัว" autoComplete="new-password" />
            </div>
            <div className="auth-school-field" style={{ marginBottom: 0 }}>
              <label className="auth-school-label" htmlFor="reg-password2">ยืนยันรหัสผ่าน *</label>
              <PasswordInput id="reg-password2" name="password2" placeholder="ยืนยันรหัสผ่าน" autoComplete="new-password" />
            </div>
          </div>
          <button type="submit" className="welcome-button welcome-button-primary" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
          </button>
          <p className="auth-form-notice">
            สมัครแล้วต้องรอผู้ดูแลโรงเรียนอนุมัติก่อนเข้าใช้งาน
          </p>
        </form>
      )}
          <div className="welcome-login-bottom">{mode === 'login' ? <>ยังไม่มีบัญชี? <button type="button" disabled={loading} onClick={() => { setMode('register'); setError(null) }}>สมัครบัญชีบุคลากร</button></> : <>มีบัญชีแล้ว? <button type="button" disabled={loading} onClick={() => { setMode('login'); setError(null) }}>เข้าสู่ระบบ</button></>}</div>
    </AuthScreen>
  )
}
