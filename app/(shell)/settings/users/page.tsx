'use client'
import { useState, useEffect } from 'react'
import LoadingButton from '@/components/LoadingButton'
import SignatureUploadBox from '@/components/SignatureUploadBox'
import { fetchSchoolUsers, updateUser, toggleUserActive, resetTeacherPassword } from '../actions'
import { useAppAlert } from '@/lib/use-app-alert'
import { ROLE_LABELS } from '@/lib/roles'

type User = {
  id: string
  email: string
  username: string | null
  prefix: string
  full_name: string
  position: string
  role: string
  is_homeroom: boolean
  is_active: boolean
  signature_url?: string | null
}

const ROLES = [
  { value: 'teacher',           label: 'ครูผู้สอน' },
  { value: 'academic_head',     label: 'หัวหน้าวิชาการ' },
  { value: 'deputy_principal',  label: 'รองผู้อำนวยการ' },
  { value: 'principal',         label: 'ผู้อำนวยการ' },
  { value: 'admin',             label: 'ผู้ดูแลโรงเรียน' },
]

const PREFIXES = ['นาย', 'นาง', 'นางสาว']

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  district:      { bg: '#EDE9FE', color: '#6D28D9' },
  admin:         { bg: '#F5EDE3', color: '#6B4F32' },
  principal:     { bg: '#FEF3C7', color: '#92400E' },
  deputy_principal: { bg: '#FFEDD5', color: '#9A3412' },
  academic_head: { bg: '#D1FAE5', color: '#065F46' },
  teacher:       { bg: '#F0FDF4', color: '#166534' },
}

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<Partial<User> | null>(null)
  const [saving, setSaving] = useState(false)
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const [search, setSearch] = useState('')
  const [isHomeroom, setIsHomeroom] = useState(false)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [schoolCode, setSchoolCode] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [copied, setCopied] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState('teacher')
  const [position, setPosition] = useState('')

  // reset password state
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    const { schoolId: sid, code, users: data, canManage: manage } = await fetchSchoolUsers()
    setSchoolId(sid)
    setSchoolCode(code)
    setCanManage(manage)
    setUsers(data)
    setLoading(false)
  }

  function openAdd() {
    setEditUser(null)
    setIsHomeroom(false)
    setSignatureUrl(null)
    setSelectedRole('teacher')
    setPosition('')
    setShowForm(true)
  }

  function openEdit(user: User) {
    setEditUser(user)
    setIsHomeroom(user.is_homeroom)
    setSignatureUrl(user.signature_url || null)
    setSelectedRole(user.role)
    setPosition(user.position || '')
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    clearAlert()
    const formData = new FormData(e.currentTarget)
    const username = formData.get('username') as string
    const password = formData.get('password') as string

    const profileData: Record<string, string | boolean | null> = {
      prefix: formData.get('prefix') as string,
      full_name: formData.get('full_name') as string,
      position: position,
      role: selectedRole,
      is_homeroom: isHomeroom,
    }
    if (editUser?.id && signatureUrl !== undefined) {
      profileData.signature_url = signatureUrl || null
    }

    if (editUser?.id) {
      const { error } = await updateUser(editUser.id, profileData)
      setSaving(false)
      if (error) {
        notify('error', 'เกิดข้อผิดพลาด: ' + error)
      } else {
        notify('success', 'อัปเดตข้อมูลเรียบร้อย')
        setShowForm(false)
        loadUsers()
      }
    } else {
      if (!password) {
        setSaving(false)
        notify('error', 'กรุณากรอกรหัสผ่านสำหรับผู้ใช้ใหม่')
        return
      }
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, ...profileData, role: selectedRole, position }),
      })
      const result = await res.json()
      setSaving(false)
      if (!res.ok) {
        notify('error', result.error || 'เกิดข้อผิดพลาด')
      } else {
        notify('success', 'เพิ่มบุคลากรเรียบร้อยแล้ว')
        setShowForm(false)
        loadUsers()
      }
    }
  }

  async function handleToggleActive(user: User) {
    await toggleUserActive(user.id, !user.is_active)
    loadUsers()
  }

  async function handleResetPassword() {
    if (!resetTarget) return
    setResetting(true)
    setResetMsg(null)
    const { error, tempPassword } = await resetTeacherPassword(resetTarget.id)
    setResetting(false)
    if (error) setResetMsg({ ok: false, text: error })
    else {
      setResetMsg({
        ok: true,
        text: `รีเซ็ตแล้ว รหัสชั่วคราวคือ ${tempPassword || '123456'} — แจ้งครูให้เข้าสู่ระบบแล้วตั้งรหัสใหม่`,
      })
    }
  }

  const filtered = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
      <div style={{ color: 'var(--text-3)', fontSize: '14px' }}>กำลังโหลด...</div>
    </div>
  )

  return (
    <div className="page-stack">
      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>รีเซ็ตรหัสผ่าน</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '12px' }}>{resetTarget.name}</p>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '20px', lineHeight: 1.6 }}>
              รหัสจะถูกตั้งเป็น <b>123456</b> ชั่วคราว เมื่อครูเข้าสู่ระบบครั้งแรก ระบบจะบังคับให้ตั้งรหัสใหม่
            </p>

            {resetMsg && (
              <div className={`alert-${resetMsg.ok ? 'success' : 'error'}`} style={{ marginBottom: '16px' }}>{resetMsg.text}</div>
            )}

            {!resetMsg?.ok && (
              <div className="form-actions">
                <button onClick={() => { setResetTarget(null); setResetMsg(null) }} className="btn btn-ghost">ยกเลิก</button>
                <LoadingButton loading={resetting} loadingText="กำลังรีเซ็ต..." onClick={handleResetPassword}>
                  รีเซ็ตเป็น 123456
                </LoadingButton>
              </div>
            )}

            {resetMsg?.ok && (
              <div className="form-actions">
                <button onClick={() => { setResetTarget(null); setResetMsg(null) }} className="btn btn-primary">ปิด</button>
              </div>
            )}
          </div>
        </div>
      )}

      {schoolId && (
        <div className="control-card action-bar" style={{ justifyContent: 'flex-start' }}>
          {schoolCode ? (
            <>
              <span style={{ fontSize: '13px', color: 'var(--text-2)', fontWeight: 600 }}>🔗 ลิงก์เข้าระบบ/สมัครของโรงเรียน (ส่งให้ครู):</span>
              <code style={{ fontSize: '13px', background: 'var(--bg-2)', padding: '4px 10px', borderRadius: '6px' }}>
                {typeof window !== 'undefined' ? window.location.origin : ''}/school/{schoolCode}/login
              </code>
              <button
                onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/school/${schoolCode}/login`); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="btn btn-secondary" style={{ fontSize: '13px' }}>
                {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
              </button>
            </>
          ) : (
            <span style={{ fontSize: '13px', color: '#92400E' }}>⚠️ ยังไม่ได้ตั้ง &quot;รหัสโรงเรียน&quot; — ไปตั้งที่เมนู <b>ตั้งค่าระบบ → ข้อมูลโรงเรียน</b> เพื่อสร้างลิงก์ให้ครูเข้า/สมัคร</span>
          )}
        </div>
      )}

      <AlertModal />

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-card" style={{ maxWidth: 760, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>
                  {editUser?.id ? 'แก้ไขข้อมูลบุคลากร' : 'เพิ่มบุคลากรใหม่'}
                </div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กำหนดข้อมูลบุคลากร บทบาท ลายเซ็น และสิทธิ์ครูประจำชั้น — รอง ผอ. ใช้บทบาท &quot;รองผู้อำนวยการ&quot; (สิทธิ์เท่าหัวหน้าวิชาการ)</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                ปิด
              </button>
            </div>
            <form onSubmit={handleSave} className="form-grid">
              <div>
                <label className="form-label">คำนำหน้า</label>
                <select name="prefix" defaultValue={editUser?.prefix || 'นาย'} className="form-input">
                  {PREFIXES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">ชื่อ-นามสกุล *</label>
                <input name="full_name" defaultValue={editUser?.full_name} className="form-input" required placeholder="สมชาย ใจดี" />
              </div>
              {!editUser?.id && (
                <div>
                  <label className="form-label">ชื่อผู้ใช้ (username) *</label>
                  <input name="username" className="form-input" required placeholder="a-z 0-9 . _" pattern="[A-Za-z0-9._]+" />
                </div>
              )}
              {!editUser?.id && (
                <div>
                  <label className="form-label">รหัสผ่าน *</label>
                  <input name="password" type="password" className="form-input" required minLength={6} placeholder="อย่างน้อย 6 ตัวอักษร" />
                </div>
              )}
              <div>
                <label className="form-label">ตำแหน่ง</label>
                <input
                  name="position"
                  value={position}
                  onChange={e => setPosition(e.target.value)}
                  className="form-input"
                  placeholder="ครู คศ.1, รองผู้อำนวยการ..."
                />
              </div>
              <div>
                <label className="form-label">บทบาทในระบบ</label>
                <select
                  name="role"
                  value={selectedRole}
                  onChange={e => {
                    const role = e.target.value
                    setSelectedRole(role)
                    if (role === 'deputy_principal' && !position.trim()) setPosition('รองผู้อำนวยการ')
                  }}
                  className="form-input"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {editUser?.id && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <SignatureUploadBox
                    userId={editUser.id}
                    value={signatureUrl}
                    onUploaded={url => setSignatureUrl(url || null)}
                  />
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => setIsHomeroom(v => !v)}
                    style={{
                      width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                      border: `2px solid ${isHomeroom ? 'var(--primary)' : 'var(--border-dk)'}`,
                      background: isHomeroom ? 'var(--primary)' : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isHomeroom && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>ครูประจำชั้น</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-3)', marginLeft: '8px' }}>สามารถจัดการธุรการชั้นเรียนได้</span>
                  </div>
                </label>
              </div>
              <div className="form-actions" style={{ gridColumn: '1 / -1', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-secondary">ยกเลิก</button>
                <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="filter-bar control-card" style={{ justifyContent: 'space-between' }}>
        <input
          type="text"
          placeholder="ค้นหาชื่อหรือชื่อผู้ใช้..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ maxWidth: '320px' }}
        />
        {canManage && <button onClick={openAdd} className="btn btn-primary" style={{ flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}><path d="M12 5v14M5 12h14"/></svg>
          เพิ่มบุคลากร
        </button>}
      </div>

      <div className="table-card data-card">
        <table className="thai-table">
          <thead>
            <tr>
              <th>ที่</th>
              <th>ชื่อ-นามสกุล</th>
              <th>ชื่อผู้ใช้</th>
              <th>ตำแหน่ง</th>
              <th>บทบาท</th>
              <th>สถานะ</th>
              {canManage && <th>จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={canManage ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '40px 0' }}>ยังไม่มีข้อมูลบุคลากร</td></tr>
            ) : filtered.map((user, i) => {
              const badge = ROLE_BADGE[user.role] || { bg: '#F3F4F6', color: '#6B7280' }
              return (
                <tr key={user.id}>
                  <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{user.prefix} {user.full_name}</div>
                    {user.is_homeroom && (
                      <span style={{ fontSize: '11px', color: '#DB2777', fontWeight: 600 }}>● ครูประจำชั้น</span>
                    )}
                  </td>
                  <td style={{ fontSize: '13px', color: 'var(--text-2)' }}>{user.username || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td style={{ fontSize: '13px', color: 'var(--text-2)' }}>{user.position || '-'}</td>
                  <td>
                    <span style={{ padding: '3px 10px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, background: badge.bg, color: badge.color }}>
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      padding: '3px 10px', borderRadius: '100px', fontSize: '12px', fontWeight: 600,
                      background: user.is_active ? '#D1FAE5' : '#FEE2E2',
                      color: user.is_active ? '#065F46' : '#991B1B',
                    }}>
                      {user.is_active ? 'ใช้งาน' : 'รออนุมัติ'}
                    </span>
                  </td>
                  {canManage && <td>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button onClick={() => openEdit(user)} style={{ fontSize: '13px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>แก้ไข</button>
                      <button onClick={() => { setResetTarget({ id: user.id, name: `${user.prefix} ${user.full_name}` }); setResetMsg(null) }}
                        style={{ fontSize: '13px', color: '#C49212', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        รีเซ็ตรหัสผ่าน
                      </button>
                      <button onClick={() => handleToggleActive(user)} style={{ fontSize: '13px', color: user.is_active ? '#D97706' : '#059669', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {user.is_active ? 'ระงับ' : 'อนุมัติ'}
                      </button>
                    </div>
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
