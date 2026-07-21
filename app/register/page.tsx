'use client'
import { useState } from 'react'
import Link from 'next/link'
import GlassLoginShell from '@/components/auth/GlassLoginShell'
import PasswordInput from '@/components/auth/PasswordInput'

const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'อื่นๆ'] as const

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [prefixChoice, setPrefixChoice] = useState<string>('นาย')
  const [customPrefix, setCustomPrefix] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    if ((fd.get('password') as string) !== (fd.get('password2') as string)) {
      setLoading(false)
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }
    const resolvedPrefix = prefixChoice === 'อื่นๆ' ? customPrefix.trim() : prefixChoice
    if (!resolvedPrefix) {
      setLoading(false)
      setError(prefixChoice === 'อื่นๆ' ? 'กรุณาระบุคำนำหน้า' : 'กรุณาเลือกคำนำหน้า')
      return
    }
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fd.get('email'),
        password: fd.get('password'),
        prefix: resolvedPrefix,
        full_name: fd.get('full_name'),
        position: fd.get('position'),
      }),
    })
    const j = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(j.error || 'สมัครไม่สำเร็จ')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <GlassLoginShell
        wide
        formTitle="สมัครเรียบร้อย"
        formSubtitle="บัญชีถูกสร้างแล้ว — รอผู้ดูแลระบบอนุมัติก่อนเข้าใช้งาน"
        footer={(
          <p>
            พร้อมแล้ว? <Link href="/login">ไปหน้าเข้าสู่ระบบ</Link>
          </p>
        )}
      >
        <div className="jarnsek-login__success">
          <div className="jarnsek-login__success-icon" aria-hidden>✓</div>
          <p>
            บัญชีของคุณกำลังรอผู้ดูแลระบบอนุมัติ
            <br />
            เมื่ออนุมัติแล้วจะเข้าสู่ระบบได้ และเลือกโรงเรียนของคุณ
          </p>
          <Link href="/login" className="jarnsek-login__submit jarnsek-login__submit--link">
            ไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </GlassLoginShell>
    )
  }

  return (
    <GlassLoginShell
      wide
      formTitle="สมัครใช้งาน"
      formSubtitle="สำหรับครูและผู้ดูแลโรงเรียนที่ต้องการใช้จารย์เสก"
      footer={(
        <p>
          มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link>
        </p>
      )}
    >
      <form onSubmit={handleSubmit} className="jarnsek-login__form">
        {error && (
          <div className="auth-scout-error" role="alert">
            {error}
          </div>
        )}

        <div className="jarnsek-login__grid jarnsek-login__grid--name">
          <div className="jarnsek-login__field">
            <label className="jarnsek-login__label" htmlFor="prefix">คำนำหน้า</label>
            <select
              id="prefix"
              name="prefix"
              className="jarnsek-login__input jarnsek-login__input--plain"
              value={prefixChoice}
              onChange={e => setPrefixChoice(e.target.value)}
            >
              {PREFIXES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="jarnsek-login__field">
            <label className="jarnsek-login__label" htmlFor="full_name">ชื่อ-นามสกุล *</label>
            <input
              id="full_name"
              name="full_name"
              className="jarnsek-login__input jarnsek-login__input--plain"
              required
              placeholder="สมชาย ใจดี"
              autoComplete="name"
            />
          </div>
        </div>

        {prefixChoice === 'อื่นๆ' && (
          <div className="jarnsek-login__field">
            <label className="jarnsek-login__label" htmlFor="prefix_custom">ระบุคำนำหน้า *</label>
            <input
              id="prefix_custom"
              className="jarnsek-login__input jarnsek-login__input--plain"
              value={customPrefix}
              onChange={e => setCustomPrefix(e.target.value)}
              placeholder="เช่น ว่าที่ร้อยตรี, พันจ่าเอก"
              required
              maxLength={40}
              autoComplete="honorific-prefix"
            />
          </div>
        )}

        <div className="jarnsek-login__field">
          <label className="jarnsek-login__label" htmlFor="position">ตำแหน่ง</label>
          <input
            id="position"
            name="position"
            className="jarnsek-login__input jarnsek-login__input--plain"
            placeholder="ครู / ผู้อำนวยการ ..."
            maxLength={80}
            autoComplete="organization-title"
          />
        </div>

        <div className="jarnsek-login__field">
          <label className="jarnsek-login__label" htmlFor="email">อีเมล *</label>
          <div className="jarnsek-login__control">
            <span className="jarnsek-login__ico" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16v12H4V6z" stroke="currentColor" strokeWidth="1.8" />
                <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              id="email"
              name="email"
              type="email"
              className="jarnsek-login__input"
              required
              placeholder="you@email.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div className="jarnsek-login__grid">
          <div className="jarnsek-login__field">
            <label className="jarnsek-login__label" htmlFor="password">รหัสผ่าน *</label>
            <div className="jarnsek-login__control jarnsek-login__control--password">
              <span className="jarnsek-login__ico" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <PasswordInput id="password" name="password" placeholder="≥ 8 ตัวอักษร" autoComplete="new-password" minLength={8} />
            </div>
          </div>
          <div className="jarnsek-login__field">
            <label className="jarnsek-login__label" htmlFor="password2">ยืนยันรหัสผ่าน *</label>
            <div className="jarnsek-login__control jarnsek-login__control--password">
              <span className="jarnsek-login__ico" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <PasswordInput id="password2" name="password2" placeholder="ยืนยันอีกครั้ง" autoComplete="new-password" minLength={8} />
            </div>
          </div>
        </div>

        <button type="submit" className="jarnsek-login__submit" disabled={loading}>
          {loading ? (
            <>
              <span className="auth-signin-spinner" aria-hidden />
              กำลังสมัคร...
            </>
          ) : (
            <>
              สมัครใช้งาน
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
