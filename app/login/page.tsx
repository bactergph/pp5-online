'use client'
import { useActionState } from 'react'
import { FiArrowRight } from 'react-icons/fi'
import { login } from '@/lib/actions/auth'
import AuthScreen from '@/components/auth/AuthScreen'
import Link from 'next/link'
import PasswordInput from '@/components/auth/PasswordInput'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined)
  return (
    <AuthScreen>
      <h2>เข้าสู่ระบบ</h2>
      <p>กรอกอีเมลและรหัสผ่านของคุณ</p>
      <form action={formAction} className="welcome-login-form" aria-busy={pending}>
        {state?.error && <div className="welcome-login-error" role="alert">{state.error}</div>}
        <div><label htmlFor="email">อีเมล</label><input id="email" type="email" name="email" placeholder="teacher@school.ac.th" required autoComplete="email" /></div>
        <div><label htmlFor="password">รหัสผ่าน</label><PasswordInput id="password" name="password" placeholder="กรอกรหัสผ่าน" /><a href="/forgot-password" className="welcome-forgot">ลืมรหัสผ่าน?</a></div>
        <button type="submit" className="welcome-button welcome-button-primary" disabled={pending}>{pending ? <><span className="welcome-spinner" aria-hidden />กำลังเข้าสู่ระบบ...</> : <>เข้าสู่ระบบ<FiArrowRight aria-hidden /></>}</button>
      </form>
      <div className="welcome-login-bottom">ยังไม่มีบัญชี? <Link href="/register">สมัครใช้งาน</Link></div>
    </AuthScreen>
  )
}
