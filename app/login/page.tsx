'use client'
import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { login } from '@/lib/actions/auth'

const QUICK_LOGINS = [
  { label: 'Super Admin', email: 'laghaim02@gmail.com', password: 'tuktuktuk1', note: 'ผู้ดูแลระบบส่วนกลาง' },
  { label: 'Admin โรงเรียน', email: 'laghaim03@gmail.com', password: 'test1234', note: 'ผู้ดูแลโรงเรียนที่มีอยู่แล้ว' },
]

type SchoolShortcut = {
  id: string
  name: string
  code: string
  programName: string
  loginUrl: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  border: '1.5px solid #C5CAE0',
  borderRadius: '10px',
  fontSize: '15px',
  fontFamily: 'Sarabun, Noto Sans Thai, sans-serif',
  color: '#1A1F36',
  background: '#FAFBFF',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontWeight: 700,
  fontSize: '13px',
  color: '#4B5563',
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined)
  const [quickPending, setQuickPending] = useState<string | null>(null)
  const [quickError, setQuickError] = useState<string | null>(null)
  const [schoolShortcuts, setSchoolShortcuts] = useState<SchoolShortcut[]>([])
  const [loadingSchools, setLoadingSchools] = useState(true)

  const isAnyPending = pending || Boolean(quickPending)

  useEffect(() => {
    let active = true
    fetch('/api/school-shortcuts')
      .then(res => res.ok ? res.json() : { schools: [] })
      .then(data => {
        if (!active) return
        setSchoolShortcuts(Array.isArray(data.schools) ? data.schools : [])
        setLoadingSchools(false)
      })
      .catch(() => {
        if (!active) return
        setSchoolShortcuts([])
        setLoadingSchools(false)
      })
    return () => { active = false }
  }, [])

  async function quickLogin(email: string, password: string, label: string) {
    setQuickPending(label)
    setQuickError(null)
    const data = new FormData()
    data.set('email', email)
    data.set('password', password)
    const result = await login(undefined, data)
    setQuickPending(null)
    if (result?.error) setQuickError(result.error)
  }

  return (
    <div className="auth-shell" style={{ display: 'flex' }}>

      {/* Left brand panel */}
      <div
        style={{
          width: '420px',
          flexShrink: 0,
          background: 'linear-gradient(160deg, #3949AB 0%, #5C6BC0 55%, #7986CB 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px',
        }}
        className="hidden lg:flex auth-brand-panel"
      >
        <div>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '48px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 2L26 8V14C26 20.6 20.8 26 14 28C7.2 26 2 20.6 2 14V8L14 2Z" fill="white" fillOpacity="0.95"/>
                <path d="M9 13H19M9 17H15M11 9H17" stroke="#3949AB" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '17px', lineHeight: '1.3' }}>ระบบ ปพ.5</div>
              <div style={{ color: 'rgba(199,210,254,0.8)', fontSize: '13px' }}>ออนไลน์</div>
            </div>
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'white', lineHeight: '1.35', marginBottom: '16px' }}>
            บันทึกผลการเรียน<br />ออนไลน์ ง่ายขึ้น
          </h1>
          <p style={{ color: 'rgba(199,210,254,0.85)', lineHeight: '1.8', fontSize: '15px' }}>
            ระบบธุรการชั้นเรียนและบันทึก ปพ.5<br />
            สำหรับโรงเรียนประถมศึกษา<br />
            หลักสูตรแกนกลาง 2551
          </p>
        </div>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { icon: '📝', text: 'บันทึกคะแนนและผลการเรียน' },
            { icon: '📋', text: 'เช็คเวลาเรียนรายวิชา ปพ.5' },
            { icon: '📊', text: 'รายงานและ Export อัตโนมัติ' },
          ].map(f => (
            <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                {f.icon}
              </div>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>

          {/* Mobile logo */}
          <div className="flex lg:hidden" style={{ alignItems: 'center', gap: '10px', marginBottom: '32px', justifyContent: 'center' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #3949AB, #5C6BC0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                <path d="M14 2L26 8V14C26 20.6 20.8 26 14 28C7.2 26 2 20.6 2 14V8L14 2Z" fill="white"/>
                <path d="M9 13H19M9 17H15M11 9H17" stroke="#3949AB" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: '17px', color: '#1A1F36' }}>ระบบ ปพ.5 ออนไลน์</span>
          </div>

          {/* Card */}
          <div className="auth-card" style={{
            background: 'white',
            borderRadius: '20px',
            padding: '36px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 10px 40px rgba(92,107,192,0.12)',
            border: '1px solid #E8EAFF',
          }}>
            <div style={{ marginBottom: '28px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#1A1F36', marginBottom: '6px' }}>เข้าสู่ระบบ</h2>
              <p style={{ fontSize: '14px', color: '#9CA3AF' }}>กรอกอีเมลและรหัสผ่านของคุณ</p>
            </div>

            {(state?.error || quickError) && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#B91C1C',
                borderRadius: '10px',
                padding: '12px 16px',
                fontSize: '14px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="8" cy="8" r="7" stroke="#EF4444" strokeWidth="1.5"/>
                  <path d="M8 5v4M8 11v.5" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {state?.error || quickError}
              </div>
            )}

            <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={labelStyle}>อีเมล</label>
                <input
                  type="email"
                  name="email"
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                  style={inputStyle}
                  onFocus={e => {
                    e.target.style.borderColor = '#5C6BC0'
                    e.target.style.boxShadow = '0 0 0 3px rgba(92,107,192,0.15)'
                    e.target.style.background = 'white'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#C5CAE0'
                    e.target.style.boxShadow = 'none'
                    e.target.style.background = '#FAFBFF'
                  }}
                />
              </div>

              <div>
                <label style={labelStyle}>รหัสผ่าน</label>
                <input
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  style={inputStyle}
                  onFocus={e => {
                    e.target.style.borderColor = '#5C6BC0'
                    e.target.style.boxShadow = '0 0 0 3px rgba(92,107,192,0.15)'
                    e.target.style.background = 'white'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#C5CAE0'
                    e.target.style.boxShadow = 'none'
                    e.target.style.background = '#FAFBFF'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isAnyPending}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: isAnyPending ? 'not-allowed' : 'pointer',
                  fontFamily: 'Sarabun, sans-serif',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'white',
                  background: isAnyPending ? '#9CA3AF' : 'linear-gradient(135deg, #3949AB, #5C6BC0)',
                  boxShadow: isAnyPending ? 'none' : '0 4px 16px rgba(92,107,192,0.45)',
                  marginTop: '4px',
                  transition: 'opacity 0.15s',
                }}
              >
                {pending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>

            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, letterSpacing: '.05em' }}>ล็อกอินด่วนสำหรับทดสอบ</span>
                <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {QUICK_LOGINS.map(account => (
                  <button
                    key={account.email}
                    type="button"
                    disabled={isAnyPending}
                    onClick={() => quickLogin(account.email, account.password, account.label)}
                    className="btn btn-secondary"
                    style={{ minHeight: 54, flexDirection: 'column', gap: 3, fontSize: 13 }}
                  >
                    <span style={{ fontWeight: 800 }}>{quickPending === account.label ? 'กำลังเข้า...' : account.label}</span>
                    <span style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>{account.note}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, letterSpacing: '.05em' }}>ทางลัดเข้าโรงเรียน</span>
                <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
              </div>

              {loadingSchools ? (
                <div style={{ border: '1px dashed #CBD5E1', borderRadius: 14, padding: 14, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                  กำลังโหลดรายชื่อโรงเรียน...
                </div>
              ) : schoolShortcuts.length === 0 ? (
                <div style={{ border: '1px dashed #CBD5E1', borderRadius: 14, padding: 14, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                  ยังไม่มีโรงเรียนที่ตั้งรหัส URL
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
                  {schoolShortcuts.map(school => (
                    <a
                      key={school.id}
                      href={school.loginUrl}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        padding: '11px 12px',
                        borderRadius: 14,
                        border: '1px solid #E2E8F0',
                        background: '#F8FAFC',
                        color: '#1E293B',
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {school.name}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          /school/{school.code}/login
                        </span>
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: '#4338CA' }}>เข้าใช้</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p style={{ textAlign: 'center', fontSize: '13px', color: '#6B7280', marginTop: '16px' }}>
            ยังไม่มีบัญชี? <a href="/register" style={{ color: '#4F46E5', fontWeight: 700 }}>สมัครใช้งาน</a>
          </p>
          <p style={{ textAlign: 'center', fontSize: '12px', color: '#C4C9D4', marginTop: '8px' }}>
            หลักสูตรแกนกลาง 2551 · โรงเรียนประถมศึกษา
          </p>
        </div>
      </div>
    </div>
  )
}
