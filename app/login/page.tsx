'use client'
import { useActionState } from 'react'
import { login } from '@/lib/actions/auth'
import GlassLoginShell from '@/components/auth/GlassLoginShell'
import PasswordInput from '@/components/auth/PasswordInput'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined)

  return (
    <GlassLoginShell
      formTitle="เข้าสู่ระบบ"
      formSubtitle="กรอกอีเมลและรหัสผ่านของท่าน"
      footer={(
        <p>
          ยังไม่มีบัญชี? <a href="/register">สมัครใช้งาน</a>
        </p>
      )}
    >
      {state?.error && (
        <div className="auth-scout-error" role="alert">
          {state.error}
        </div>
      )}

      <form action={formAction} className="jarnsek-login__form">
        <div className="jarnsek-login__field">
          <label className="jarnsek-login__label" htmlFor="email">อีเมล</label>
          <div className="jarnsek-login__control">
            <span className="jarnsek-login__ico" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16v12H4V6z" stroke="currentColor" strokeWidth="1.8" />
                <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              id="email"
              type="email"
              name="email"
              className="jarnsek-login__input"
              placeholder="teacher@school.ac.th"
              required
              autoComplete="email"
              autoFocus
            />
          </div>
        </div>

        <div className="jarnsek-login__field">
          <label className="jarnsek-login__label" htmlFor="password">รหัสผ่าน</label>
          <div className="jarnsek-login__control jarnsek-login__control--password">
            <span className="jarnsek-login__ico" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <PasswordInput id="password" name="password" placeholder="กรอกรหัสผ่าน" />
          </div>
          <a href="/register" className="jarnsek-login__forgot">ลืมรหัสผ่าน?</a>
        </div>

        <button type="submit" className="jarnsek-login__submit" disabled={pending}>
          {pending ? (
            <>
              <span className="auth-signin-spinner" aria-hidden />
              กำลังเข้าสู่ระบบ...
            </>
          ) : (
            <>
              เข้าสู่ระบบ
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>
      </form>
    </GlassLoginShell>
  )
}
