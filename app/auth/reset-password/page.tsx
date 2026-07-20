'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import GlassLoginShell from '@/components/auth/GlassLoginShell'
import PasswordInput from '@/components/auth/PasswordInput'

function browserSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } },
  )
}

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const client = browserSupabase()
    let cancelled = false

    async function prepare() {
      // รองรับทั้ง ?code= (PKCE) และ #access_token= (implicit recovery)
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (exchangeError) {
          setLinkError('ลิงก์หมดอายุหรือใช้ไปแล้ว — ขอรีเซ็ตใหม่จากหน้าลืมรหัสผ่าน')
          setReady(true)
          return
        }
        url.searchParams.delete('code')
        window.history.replaceState({}, '', url.pathname)
      }

      const { data: { session } } = await client.auth.getSession()
      if (cancelled) return
      if (!session) {
        setLinkError('เปิดจากลิงก์ในอีเมลเท่านั้น หรือลิงก์หมดอายุแล้ว — ขอรีเซ็ตใหม่ได้ที่หน้าลืมรหัสผ่าน')
      }
      setReady(true)
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    void prepare()
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const password = String(fd.get('password') || '')
    const password2 = String(fd.get('password2') || '')
    if (password.length < 8) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }
    if (password !== password2) {
      setError('รหัสผ่านไม่ตรงกัน')
      return
    }

    setPending(true)
    const client = browserSupabase()
    const { error: updateError } = await client.auth.updateUser({ password })
    setPending(false)
    if (updateError) {
      setError(updateError.message || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ')
      return
    }
    await client.auth.signOut()
    setDone(true)
  }

  return (
    <GlassLoginShell
      formTitle="ตั้งรหัสผ่านใหม่"
      formSubtitle="สำหรับผู้ดูแลโรงเรียนที่ขอรีเซ็ตทางอีเมล"
      footer={(
        <p>
          <Link href="/login">ไปหน้าเข้าสู่ระบบ</Link>
        </p>
      )}
    >
      {!ready && (
        <p style={{ fontSize: 14, color: 'var(--text-3)', textAlign: 'center' }}>กำลังตรวจสอบลิงก์...</p>
      )}

      {ready && linkError && (
        <div className="auth-scout-error" role="alert">
          {linkError}
          <div style={{ marginTop: 10 }}>
            <Link href="/forgot-password">ขอลิงก์รีเซ็ตใหม่</Link>
          </div>
        </div>
      )}

      {ready && !linkError && done && (
        <div className="alert alert-success" style={{ fontSize: 13 }} role="status">
          ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว —{' '}
          <Link href="/login">เข้าสู่ระบบ</Link>
        </div>
      )}

      {ready && !linkError && !done && (
        <form onSubmit={handleSubmit} className="jarnsek-login__form">
          {error && (
            <div className="auth-scout-error" role="alert">
              {error}
            </div>
          )}
          <div className="jarnsek-login__field">
            <label className="jarnsek-login__label" htmlFor="password">รหัสผ่านใหม่</label>
            <div className="jarnsek-login__control jarnsek-login__control--password">
              <PasswordInput
                id="password"
                name="password"
                placeholder="อย่างน้อย 8 ตัวอักษร"
                autoComplete="new-password"
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
              />
            </div>
          </div>
          <button type="submit" className="jarnsek-login__submit" disabled={pending}>
            {pending ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
          </button>
        </form>
      )}
    </GlassLoginShell>
  )
}
