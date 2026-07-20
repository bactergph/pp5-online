'use client'

import { useActionState } from 'react'
import { completeForcedPasswordChange } from '@/lib/actions/force-password'
import ScoutAuthLayout from '@/components/auth/ScoutAuthLayout'
import PasswordInput from '@/components/auth/PasswordInput'

type Props = {
  schoolName: string
  logoUrl: string | null
  programName: string
}

export default function ChangePasswordForm({
  schoolName,
  logoUrl,
  programName,
}: Props) {
  const [state, formAction, pending] = useActionState(completeForcedPasswordChange, undefined)

  return (
    <ScoutAuthLayout
      brandTitle={programName?.trim() || 'ระบบ ปพ.5 ออนไลน์'}
      brandSubtitle=""
      brandTagline={schoolName}
      logoUrl={logoUrl}
      cardEyebrow={schoolName}
      cardTitle="ยินดีต้อนรับ"
      cardSubtitle="รหัสถูกรีเซ็ตโดยผู้ดูแลโรงเรียน — กรุณาตั้งรหัสใหม่ก่อนใช้งาน"
    >
      {state?.error && (
        <div className="auth-scout-error" role="alert">
          {state.error}
        </div>
      )}

      <form action={formAction}>
        <div className="auth-scout-field">
          <label className="auth-scout-label" htmlFor="password">รหัสผ่านใหม่</label>
          <PasswordInput
            id="password"
            name="password"
            placeholder="อย่างน้อย 8 ตัวอักษร"
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        <div className="auth-scout-field">
          <label className="auth-scout-label" htmlFor="password2">ยืนยันรหัสผ่าน</label>
          <PasswordInput
            id="password2"
            name="password2"
            placeholder="พิมพ์ซ้ำอีกครั้ง"
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        <button type="submit" className="auth-scout-submit" disabled={pending}>
          {pending ? 'กำลังบันทึก...' : 'บันทึกและเข้าสู่ระบบ'}
        </button>
      </form>
    </ScoutAuthLayout>
  )
}
