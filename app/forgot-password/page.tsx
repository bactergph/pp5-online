'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { requestAdminPasswordReset } from '@/lib/actions/password-reset'
import GlassLoginShell from '@/components/auth/GlassLoginShell'

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestAdminPasswordReset, undefined)

  return (
    <GlassLoginShell
      formTitle="ลืมรหัสผ่าน"
      formSubtitle="ส่งลิงก์ตั้งรหัสใหม่ไปที่อีเมลผู้ดูแลโรงเรียน"
      footer={(
        <p>
          <Link href="/login">กลับไปเข้าสู่ระบบ</Link>
        </p>
      )}
    >
      {state?.error && (
        <div className="auth-scout-error" role="alert">
          {state.error}
        </div>
      )}
      {state?.ok && state.message && (
        <div className="alert alert-success" style={{ marginBottom: 14, fontSize: 13 }} role="status">
          {state.message}
        </div>
      )}

      <form action={formAction} className="jarnsek-login__form">
        <div className="jarnsek-login__field">
          <label className="jarnsek-login__label" htmlFor="email">อีเมลผู้ดูแลโรงเรียน</label>
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
              placeholder="admin@school.ac.th"
              required
              autoComplete="email"
              autoFocus
              disabled={pending || state?.ok}
            />
          </div>
        </div>

        <button type="submit" className="jarnsek-login__submit" disabled={pending || state?.ok}>
          {pending ? (
            <>
              <span className="auth-signin-spinner" aria-hidden />
              กำลังส่งลิงก์...
            </>
          ) : state?.ok ? (
            'ส่งลิงก์แล้ว'
          ) : (
            'ส่งลิงก์รีเซ็ตรหัสผ่าน'
          )}
        </button>
      </form>
    </GlassLoginShell>
  )
}
