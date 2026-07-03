'use client'
import { useState } from 'react'
import { login } from '@/lib/actions/auth'
import { schoolMemberEmail } from '@/lib/schoolAuth'

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

type Props = { schoolId: string; schoolName: string; logoUrl: string | null; programName: string; createdBy: string | null; showDemo?: boolean }

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

  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 14px', border: '1.5px solid #C5CAE0', borderRadius: 10, fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', background: '#FAFBFF' }

  return (
    <div className="auth-school-shell">
      <div className="school-login-frame" style={{ width: '100%', maxWidth: 460, margin: '0 auto' }}>
        <div className="school-login-header" style={{ textAlign: 'center', marginBottom: 22 }}>
          <div className="school-login-logo" style={{ width: 76, height: 76, borderRadius: 18, background: 'white', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 4px 16px rgba(92,107,192,0.18)' }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : <span style={{ fontSize: 30 }}>🏫</span>}
          </div>
          <div className="school-login-program" style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{programName}</div>
          <h1 className="school-login-title" style={{ fontSize: 20, fontWeight: 800, color: '#1A1F36', marginTop: 2, lineHeight: 1.35 }}>{schoolName}</h1>
        </div>

        <div className="auth-card school-login-card" style={{ padding: 'clamp(20px, 4vw, 30px)' }}>
          <div className="school-login-tabs" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button onClick={() => { setMode('login'); setError(null) }} className={mode === 'login' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ flex: 1 }}>เข้าสู่ระบบ</button>
            <button onClick={() => { setMode('register'); setError(null) }} className={mode === 'register' ? 'btn btn-primary' : 'btn btn-secondary'} style={{ flex: 1 }}>สมัครสมาชิก</button>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          {registered ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 26 }}>✓</div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#065F46', marginBottom: 6 }}>สมัครเรียบร้อย — รออนุมัติ</h2>
              <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.7 }}>รอผู้ดูแลโรงเรียนอนุมัติ แล้วจึงเข้าสู่ระบบด้วย username ได้</p>
              <button onClick={() => { setRegistered(false); setMode('login') }} className="btn btn-primary" style={{ marginTop: 18 }}>ไปหน้าเข้าสู่ระบบ</button>
            </div>
          ) : mode === 'login' ? (
            <>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ชื่อผู้ใช้ (username)</label>
                <input name="username" required autoComplete="username" style={inputStyle} placeholder="username" />
              </div>
              <div>
                <label className="form-label">รหัสผ่าน</label>
                <input name="password" type="password" required autoComplete="current-password" style={inputStyle} placeholder="••••••••" />
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary btn-lg" style={{ marginTop: 4 }}>{loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
            </form>
            {showDemo && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                  <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, letterSpacing: '.05em' }}>ทดสอบระบบ</span>
                  <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                </div>
                <div className="school-login-demo-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 8 }}>
                  {SCHOOL_DEMO_ACCOUNTS.map(account => (
                    <button
                      key={'username' in account ? account.username : account.email}
                      type="button"
                      disabled={loading}
                      onClick={() => 'username' in account
                        ? doLogin(account.username, DEMO_PASSWORD)
                        : doEmailLogin(account.email, DEMO_PASSWORD)}
                      className="btn btn-secondary"
                      style={{ minHeight: 58, flexDirection: 'column', gap: 3, fontSize: 13, whiteSpace: 'normal', lineHeight: 1.25 }}
                    >
                      <span style={{ fontWeight: 800 }}>{account.label}</span>
                      <span style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>
                        {'username' in account ? account.username : account.email}
                      </span>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 10 }}>
                  รหัสผ่านทดสอบทุกบัญชี: {DEMO_PASSWORD}
                </p>
              </div>
            )}
            </>
          ) : (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="school-login-register-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <div><label className="form-label">คำนำหน้า</label><select name="prefix" className="form-input" defaultValue="นาย">{PREFIXES.map(p => <option key={p}>{p}</option>)}</select></div>
                <div><label className="form-label">ชื่อ-นามสกุล *</label><input name="full_name" required style={inputStyle} placeholder="สมชาย ใจดี" /></div>
              </div>
              <div>
                <label className="form-label">ชื่อผู้ใช้ (username) *</label>
                <input name="username" required style={inputStyle} placeholder="a-z 0-9 . _" pattern="[A-Za-z0-9._]+" />
              </div>
              <div className="school-login-password-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <div><label className="form-label">รหัสผ่าน *</label><input name="password" type="password" required minLength={6} style={inputStyle} placeholder="≥ 6 ตัว" /></div>
                <div><label className="form-label">ยืนยันรหัสผ่าน *</label><input name="password2" type="password" required minLength={6} style={inputStyle} /></div>
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary btn-lg" style={{ marginTop: 4 }}>{loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}</button>
              <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>สมัครแล้วต้องรอผู้ดูแลโรงเรียนอนุมัติก่อนเข้าใช้งาน</p>
            </form>
          )}
        </div>
        {createdBy && <p style={{ textAlign: 'center', fontSize: 12, color: '#C4C9D4', marginTop: 14 }}>ผู้ดูแล: {createdBy}</p>}
      </div>
    </div>
  )
}
