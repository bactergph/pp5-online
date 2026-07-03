'use client'
import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { login } from '@/lib/actions/auth'
import ScoutAuthLayout from '@/components/auth/ScoutAuthLayout'
import PasswordInput from '@/components/auth/PasswordInput'

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
    <ScoutAuthLayout
      brandTitle="ระบบ ปพ.5"
      brandSubtitle="ออนไลน์"
      brandTagline="หลักสูตรแกนกลาง 2551 · โรงเรียนประถมศึกษา"
      cardTitle="เข้าสู่ระบบ"
      cardSubtitle="กรอกอีเมลและรหัสผ่านของคุณ"
      footer={(
        <p className="auth-scout-footer">
          ยังไม่มีบัญชี? <a href="/register">สมัครใช้งาน</a>
        </p>
      )}
    >
      {(state?.error || quickError) && (
        <div className="auth-scout-error" role="alert">
          {state?.error || quickError}
        </div>
      )}

      <form action={formAction}>
        <div className="auth-scout-field">
          <label className="auth-scout-label" htmlFor="email">อีเมล</label>
          <input
            id="email"
            type="email"
            name="email"
            className="auth-scout-input"
            placeholder="อีเมล"
            required
            autoComplete="email"
          />
        </div>

        <div className="auth-scout-field">
          <label className="auth-scout-label" htmlFor="password">รหัสผ่าน</label>
          <PasswordInput id="password" name="password" placeholder="รหัสผ่าน" />
        </div>

        <div className="auth-scout-links">
          <a href="/">‹ กลับหน้าแรก</a>
          <a href="/register">ลืมรหัสผ่าน ?</a>
        </div>

        <button type="submit" className="auth-scout-submit" disabled={isAnyPending}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {pending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>

      <div className="auth-scout-divider">ล็อกอินด่วนสำหรับทดสอบ</div>
      <div className="auth-scout-demo-grid">
        {QUICK_LOGINS.map(account => (
          <button
            key={account.email}
            type="button"
            className="auth-scout-demo-btn"
            disabled={isAnyPending}
            onClick={() => quickLogin(account.email, account.password, account.label)}
          >
            <span>{quickPending === account.label ? 'กำลังเข้า...' : account.label}</span>
            <span>{account.note}</span>
          </button>
        ))}
      </div>

      <div className="auth-scout-divider">ทางลัดเข้าโรงเรียน</div>
      {loadingSchools ? (
        <p style={{ textAlign: 'center', fontSize: 13, color: '#9A8B72', margin: 0 }}>กำลังโหลดรายชื่อโรงเรียน...</p>
      ) : schoolShortcuts.length === 0 ? (
        <p style={{ textAlign: 'center', fontSize: 13, color: '#9A8B72', margin: 0 }}>ยังไม่มีโรงเรียนที่ตั้งรหัส URL</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
          {schoolShortcuts.map(school => (
            <a key={school.id} href={school.loginUrl} className="auth-scout-school-link">
              <span style={{ minWidth: 0 }}>
                <span className="auth-scout-school-link__name">{school.name}</span>
                <span className="auth-scout-school-link__code">/school/{school.code}/login</span>
              </span>
              <span className="auth-scout-school-link__action">เข้าใช้</span>
            </a>
          ))}
        </div>
      )}
    </ScoutAuthLayout>
  )
}
