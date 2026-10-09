'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FiArrowRight, FiCheckCircle } from 'react-icons/fi'
import AuthScreen from '@/components/auth/AuthScreen'
import PasswordInput from '@/components/auth/PasswordInput'
const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'อื่นๆ']
export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [prefixChoice, setPrefixChoice] = useState('นาย')
  const [customPrefix, setCustomPrefix] = useState('')
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setError(null)
    const fd = new FormData(e.currentTarget)
    if (fd.get('password') !== fd.get('password2')) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return }
    const prefix = prefixChoice === 'อื่นๆ' ? customPrefix.trim() : prefixChoice
    if (!prefix) { setError('กรุณาระบุคำนำหน้า'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: String(fd.get('email') || '').trim(), password: fd.get('password'), prefix, full_name: String(fd.get('full_name') || '').trim(), position: String(fd.get('position') || '').trim() }) })
      const result = await res.json()
      if (!res.ok) { setError(result.error || 'สมัครไม่สำเร็จ กรุณาลองอีกครั้ง'); return }
      setDone(true)
    } catch { setError('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง') }
    finally { setLoading(false) }
  }
  return <AuthScreen mode="register">
    {done ? <div role="status"><div className="auth-success-icon"><FiCheckCircle aria-hidden /></div><h2>สมัครเรียบร้อยแล้ว</h2><p className="auth-success-copy">บัญชีของคุณอยู่ระหว่างรออนุมัติจากผู้ดูแลระบบ เมื่อได้รับอนุมัติแล้ว สามารถเข้าสู่ระบบเพื่อเลือกโรงเรียนและตั้งค่าเริ่มต้นได้</p><Link href="/login" className="welcome-button welcome-button-primary">ไปหน้าเข้าสู่ระบบ<FiArrowRight aria-hidden /></Link><div className="welcome-login-bottom"><Link href="/">กลับหน้าแนะนำระบบ</Link></div></div> : <>
      <h2>สมัครใช้งาน</h2><p>สร้างบัญชีผู้ดูแลสำหรับโรงเรียนใหม่</p>
      <form onSubmit={handleSubmit} className="welcome-login-form" aria-busy={loading}>
        {error && <div ref={errorRef} tabIndex={-1} className="welcome-login-error" role="alert">{error}</div>}
        <fieldset className="auth-form-section" disabled={loading}><legend>01 · ข้อมูลผู้สมัคร</legend>
          <div className="auth-field-grid auth-field-grid--name"><div><label htmlFor="prefix">คำนำหน้า</label><select id="prefix" value={prefixChoice} onChange={e => setPrefixChoice(e.target.value)}>{PREFIXES.map(p => <option key={p}>{p}</option>)}</select></div><div><label htmlFor="full_name">ชื่อ–นามสกุล *</label><input id="full_name" name="full_name" required placeholder="สมชาย ใจดี" autoComplete="name" /></div></div>
          {prefixChoice === 'อื่นๆ' && <div><label htmlFor="prefix_custom">ระบุคำนำหน้า *</label><input id="prefix_custom" required maxLength={40} value={customPrefix} onChange={e => setCustomPrefix(e.target.value)} placeholder="เช่น ว่าที่ร้อยตรี" autoComplete="honorific-prefix" /></div>}
          <div><label htmlFor="position">ตำแหน่ง <span className="auth-field-hint">(ไม่บังคับ)</span></label><input id="position" name="position" maxLength={80} placeholder="เช่น ครู / หัวหน้าวิชาการ" autoComplete="organization-title" /></div>
        </fieldset>
        <fieldset className="auth-form-section" disabled={loading}><legend>02 · บัญชีเข้าใช้งาน</legend><div><label htmlFor="email">อีเมล *</label><input id="email" name="email" type="email" required placeholder="you@email.com" autoComplete="email" /><p className="auth-field-hint">ใช้อีเมลนี้สำหรับเข้าสู่ระบบ</p></div><div className="auth-field-grid"><div><label htmlFor="password">รหัสผ่าน *</label><PasswordInput id="password" name="password" placeholder="อย่างน้อย 8 ตัวอักษร" autoComplete="new-password" minLength={8} /></div><div><label htmlFor="password2">ยืนยันรหัสผ่าน *</label><PasswordInput id="password2" name="password2" placeholder="กรอกอีกครั้ง" autoComplete="new-password" minLength={8} /></div></div></fieldset>
        <p className="auth-form-notice">บัญชีใหม่ต้องรออนุมัติก่อนใช้งาน จากนั้นจึงเลือกโรงเรียนและตั้งค่าเริ่มต้นได้</p>
        <button type="submit" className="welcome-button welcome-button-primary" disabled={loading}>{loading ? <><span className="welcome-spinner" aria-hidden />กำลังสมัคร...</> : <>สร้างบัญชี<FiArrowRight aria-hidden /></>}</button>
      </form><div className="welcome-login-bottom">มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link></div>
    </>}
  </AuthScreen>
}
