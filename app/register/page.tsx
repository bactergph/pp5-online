'use client'
import { useState } from 'react'
import Link from 'next/link'

const PREFIXES = ['นาย', 'นาง', 'นางสาว']

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError(null)
    const fd = new FormData(e.currentTarget)
    if ((fd.get('password') as string) !== (fd.get('password2') as string)) {
      setLoading(false); setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return
    }
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fd.get('email'), password: fd.get('password'),
        prefix: fd.get('prefix'), full_name: fd.get('full_name'), position: fd.get('position'),
      }),
    })
    const j = await res.json()
    setLoading(false)
    if (!res.ok) { setError(j.error || 'สมัครไม่สำเร็จ'); return }
    setDone(true)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F8', padding: 24, fontFamily: 'Sarabun, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1F36' }}>สมัครใช้งานระบบ ปพ.5 ออนไลน์</h1>
          <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 4 }}>สำหรับครู/ผู้ดูแลโรงเรียนที่ต้องการใช้ระบบ</p>
        </div>

        <div style={{ background: 'white', borderRadius: 20, padding: 32, boxShadow: '0 10px 40px rgba(92,107,192,0.12)', border: '1px solid #E8EAFF' }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>✓</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#065F46', marginBottom: 8 }}>สมัครเรียบร้อย — รออนุมัติ</h2>
              <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.7 }}>
                บัญชีของคุณถูกสร้างแล้ว กำลังรอผู้ดูแลระบบอนุมัติ<br />
                เมื่ออนุมัติแล้วจะเข้าสู่ระบบได้ และเลือกโรงเรียนของคุณ
              </p>
              <Link href="/login" className="btn btn-primary" style={{ marginTop: 20, display: 'inline-block' }}>ไปหน้าเข้าสู่ระบบ</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <div className="alert alert-error">{error}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">คำนำหน้า</label>
                  <select name="prefix" className="form-input" defaultValue="นาย">{PREFIXES.map(p => <option key={p}>{p}</option>)}</select>
                </div>
                <div>
                  <label className="form-label">ชื่อ-นามสกุล *</label>
                  <input name="full_name" className="form-input" required placeholder="สมชาย ใจดี" />
                </div>
              </div>
              <div>
                <label className="form-label">ตำแหน่ง</label>
                <input name="position" className="form-input" placeholder="ครู / ผู้อำนวยการ ..." />
              </div>
              <div>
                <label className="form-label">อีเมล *</label>
                <input name="email" type="email" className="form-input" required placeholder="you@email.com" autoComplete="email" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">รหัสผ่าน *</label>
                  <input name="password" type="password" className="form-input" required minLength={8} placeholder="≥ 8 ตัวอักษร" />
                </div>
                <div>
                  <label className="form-label">ยืนยันรหัสผ่าน *</label>
                  <input name="password2" type="password" className="form-input" required minLength={8} />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary btn-lg" style={{ marginTop: 6 }}>
                {loading ? 'กำลังสมัคร...' : 'สมัครใช้งาน'}
              </button>
              <p style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                มีบัญชีแล้ว? <Link href="/login" style={{ color: '#4F46E5', fontWeight: 600 }}>เข้าสู่ระบบ</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
