'use client'
import { useActionState } from 'react'
import { FiArrowRight, FiLogIn, FiMail, FiLock } from 'react-icons/fi'
import { login } from '@/lib/actions/auth'
import AuthScreen from '@/components/auth/AuthScreen'
import Link from 'next/link'
import PasswordInput from '@/components/auth/PasswordInput'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined)
  return (
    <AuthScreen>
      <div className="login-form-heading"><span><FiLogIn aria-hidden="true"/></span><div><h2>เข้าสู่ระบบ</h2><p>ยินดีต้อนรับกลับ มาเริ่มทำงานต่อกันครับ</p></div></div>
      <form action={formAction} className="welcome-login-form" aria-busy={pending}>
        {state?.error && <div className="welcome-login-error" role="alert">{state.error}</div>}
        <div><label htmlFor="email">อีเมล</label><div className="login-field-shell"><FiMail aria-hidden="true"/><input id="email" type="email" name="email" placeholder="teacher@school.ac.th" required autoComplete="email" autoCapitalize="none" spellCheck={false}/></div></div>
        <div><div className="login-label-row"><label htmlFor="password">รหัสผ่าน</label><Link href="/forgot-password" className="welcome-forgot">ลืมรหัสผ่าน?</Link></div><div className="login-field-shell"><FiLock aria-hidden="true"/><PasswordInput id="password" name="password" placeholder="กรอกรหัสผ่าน" /></div></div>
        <button type="submit" className="welcome-button welcome-button-primary" disabled={pending}>{pending ? <><span className="welcome-spinner" aria-hidden />กำลังเข้าสู่ระบบ...</> : <>เข้าสู่ระบบ<FiArrowRight aria-hidden /></>}</button>
      </form>
      <div className="welcome-login-bottom">ยังไม่มีบัญชี? <Link href="/register">สมัครสมาชิกฟรี<FiArrowRight aria-hidden="true"/></Link></div>
    </AuthScreen>
  )
}
