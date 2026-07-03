'use client'
import { useState } from 'react'
import { login } from '@/lib/actions/auth'
import { schoolMemberEmail } from '@/lib/schoolAuth'
import ScoutAuthLayout from '@/components/auth/ScoutAuthLayout'
import PasswordInput from '@/components/auth/PasswordInput'

const PREFIXES = ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นาง', 'นางสาว']
const DEMO_PASSWORD = 'test1234'
const SCHOOL_DEMO_ACCOUNTS = [
  { label: 'Admin โรงเรียน', email: 'laghaim03@gmail.com', description: 'จัดการข้อมูลโรงเรียน' },
  { label: 'ผู้อำนวยการ', username: 'principal_demo', description: 'อนุมัติขั้นสุดท้าย' },
  { label: 'รองผู้อำนวยการ', username: 'rongporo', description: 'ลงนามรองผอ.' },
  { label: 'หัวหน้าวิชาการ', username: 'acad', description: 'ลงนามหัวหน้าวิชาการ' },
  { label: 'หัวหน้างานวัดผล', username: 'measurement_demo', description: 'ลงนามหัวหน้างานวัดผล' },
  { label: 'หัวหน้ากลุ่มสาระ', username: 'subject_head_demo', description: 'ลงนามหัวหน้ากลุ่มสาระ' },
  { label: 'ครูประจำชั้น', username: 'homeroom_demo', description: 'ปพ.5 รวมชั้น / ปพ.6' },
  { label: 'ครูผู้สอน 1', username: 'teacher_demo_1', description: 'เสนอเซ็น ปพ.5 รายวิชา' },
  { label: 'ครูผู้สอน 2', username: 'teacher_demo_2', description: 'ทดสอบครูหลายคน' },
  { label: 'ครูผู้สอน 3', username: 'teacher_demo_3', description: 'ทดสอบสิทธิ์รายวิชา' },
  { label: 'ครูสอน+ประจำชั้น', username: 'teacher_homeroom_demo', description: 'สอนและประจำชั้น' },
]

type Props = {
  schoolId: string
  schoolName: string
  logoUrl: string | null
  programName: string
  createdBy: string | null
  showDemo?: boolean
}

export default function SchoolLoginForm({ schoolId, schoolName, logoUrl, programName, createdBy, showDemo }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)

  async function doLogin(username: string, password: string) {
    setLoading(true); setError(null)
    const data = new FormData()
    data.set('email', schoolMemberEmail(username.trim(), schoolId))
    data.set('schoolId', schoolId)
    data.set('password', password)
    const result = await login(undefined, data)
    setLoading(false)
    if (result?.error) setError(result.error)
  }

  async function doEmailLogin(email: string, password: string) {
    setLoading(true); setError(null)
    const data = new FormData()
    data.set('email', email.trim())
    data.set('schoolId', schoolId)
    data.set('password', password)
    const result = await login(undefined, data)
    setLoading(false)
    if (result?.error) setError(result.error)
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await doLogin(fd.get('username') as string, fd.get('password') as string)
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError(null)
    const fd = new FormData(e.currentTarget)
    if ((fd.get('password') as string) !== (fd.get('password2') as string)) {
      setLoading(false); setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return
    }
    const res = await fetch('/api/school-register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolId, username: fd.get('username'), prefix: fd.get('prefix'),
        full_name: fd.get('full_name'), password: fd.get('password'),
      }),
    })
    const j = await res.json()
    setLoading(false)
    if (!res.ok) { setError(j.error || 'สมัครไม่สำเร็จ'); return }
    setRegistered(true)
  }

  return (
    <ScoutAuthLayout
      brandTitle={schoolName}
      brandSubtitle={programName}
      brandTagline="หลักสูตรแกนกลาง 2551"
      cardTitle="เข้าสู่ระบบ"
      cardSubtitle={programName}
      logoUrl={logoUrl}
      footer={createdBy ? (
        <p className="auth-scout-footer" style={{ fontSize: 12, color: '#B8A88A' }}>
          ผู้ดูแล: {createdBy}
        </p>
      ) : undefined}
    >
      <div className="auth-scout-tabs">
        <button
          type="button"
          className={`auth-scout-tab${mode === 'login' ? ' auth-scout-tab--active' : ''}`}
          onClick={() => { setMode('login'); setError(null) }}
        >
          เข้าสู่ระบบ
        </button>
        <button
          type="button"
          className={`auth-scout-tab${mode === 'register' ? ' auth-scout-tab--active' : ''}`}
          onClick={() => { setMode('register'); setError(null) }}
        >
          สมัครสมาชิก
        </button>
      </div>

      {error && <div className="auth-scout-error" role="alert">{error}</div>}

      {registered ? (
        <div className="auth-scout-success">
          <div className="auth-scout-success__icon">✓</div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#065F46', marginBottom: 6 }}>สมัครเรียบร้อย — รออนุมัติ</h2>
          <p style={{ fontSize: 14, color: '#6B5D45', lineHeight: 1.7, margin: 0 }}>
            รอผู้ดูแลโรงเรียนอนุมัติ แล้วจึงเข้าสู่ระบบด้วย username ได้
          </p>
          <button
            type="button"
            className="auth-scout-submit"
            style={{ marginTop: 18 }}
            onClick={() => { setRegistered(false); setMode('login') }}
          >
            ไปหน้าเข้าสู่ระบบ
          </button>
        </div>
      ) : mode === 'login' ? (
        <>
          <form onSubmit={handleLogin}>
            <div className="auth-scout-field">
              <label className="auth-scout-label" htmlFor="username">ชื่อผู้ใช้</label>
              <input
                id="username"
                name="username"
                className="auth-scout-input"
                placeholder="ชื่อผู้ใช้"
                required
                autoComplete="username"
              />
            </div>
            <div className="auth-scout-field">
              <label className="auth-scout-label" htmlFor="school-password">รหัสผ่าน</label>
              <PasswordInput id="school-password" name="password" placeholder="รหัสผ่าน" />
            </div>
            <div className="auth-scout-links">
              <a href="/">‹ กลับหน้าแรก</a>
              <span style={{ color: '#B8A88A', fontSize: 13 }}>ลืมรหัสผ่าน ?</span>
            </div>
            <button type="submit" className="auth-scout-submit" disabled={loading}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {showDemo && (
            <>
              <div className="auth-scout-divider">ทดสอบระบบ</div>
              <div className="auth-scout-demo-grid">
                {SCHOOL_DEMO_ACCOUNTS.map(account => (
                  <button
                    key={'username' in account ? account.username : account.email}
                    type="button"
                    className="auth-scout-demo-btn"
                    disabled={loading}
                    onClick={() => 'username' in account
                      ? doLogin(account.username, DEMO_PASSWORD)
                      : doEmailLogin(account.email, DEMO_PASSWORD)}
                  >
                    <span>{account.label}</span>
                    <span>{'username' in account ? account.username : account.email}</span>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: '#9A8B72', textAlign: 'center', marginTop: 10 }}>
                รหัสผ่านทดสอบทุกบัญชี: {DEMO_PASSWORD}
              </p>
            </>
          )}
        </>
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
