'use client'

import { useActionState } from 'react'
import { completeForcedPasswordChange } from '@/lib/actions/force-password'
import GlassLoginShell from '@/components/auth/GlassLoginShell'
import PasswordInput from '@/components/auth/PasswordInput'

export default function ForceChangePasswordPage() {
  const [state, formAction, pending] = useActionState(completeForcedPasswordChange, undefined)

  return (
    <GlassLoginShell
      formTitle="ตั้งรหัสผ่านใหม่"
      formSubtitle="รหัสถูกรีเซ็ตโดยผู้ดูแลโรงเรียน — กรุณาตั้งรหัสใหม่ก่อนใช้งาน"
    >
      {state?.error && (
        <div className="auth-scout-error" role="alert">
          {state.error}
        </div>
      )}

      <form action={formAction} className="jarnsek-login__form">
        <div className="jarnsek-login__field">
          <label className="jarnsek-login__label" htmlFor="password">รหัสผ่านใหม่</label>
          <div className="jarnsek-login__control jarnsek-login__control--password">
            <PasswordInput
              id="password"
              name="password"
              placeholder="อย่างน้อย 8 ตัวอักษร"
              autoComplete="new-password"
              minLength={8}
            />
          </div>
        </div>
        <div className="jarnsek-login__field">
          <label className="jarnsek-login__label" htmlFor="password2">ยืนยันรหัสผ่าน</label>
          <div className="jarnsek-login__control jarnsek-login__control--password">
            <PasswordInput
              id="password2"
              name="password2"
              placeholder="พิมพ์ซ้ำอีกครั้ง"
              autoComplete="new-password"
              minLength={8}
            />
          </div>
        </div>
        <button type="submit" className="jarnsek-login__submit" disabled={pending}>
          {pending ? 'กำลังบันทึก...' : 'บันทึกและเข้าสู่ระบบ'}
        </button>
      </form>
    </GlassLoginShell>
  )
}
