'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import LoadingButton from '@/components/LoadingButton'
import { fetchAdminsAndSchools, updateAdmin, toggleAdminActive, resetAdminPassword, deleteAdmins, setAdminQuota, searchSchoolsForAdminAssign } from './actions'
import { useAppAlert } from '@/lib/use-app-alert'

type School = { id: string; name: string; district?: string | null; province?: string | null }
type Stat = { students: number; principal: number; academic_head: number; homeroom: number; teacher_only: number; totalUsers: number }
type Admin = {
  id: string; email: string; prefix: string; full_name: string
  position: string; is_active: boolean; school_id: string | null; school?: School
  stat?: Stat | null; quota?: number
}
const PREFIXES = ['นาย', 'นาง', 'นางสาว']

export default function DistrictAdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const { notify, AlertModal } = useAppAlert()

  // form modal
  const [showForm, setShowForm] = useState(false)
  const [editAdmin, setEditAdmin] = useState<Partial<Admin> | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [schoolSearch, setSchoolSearch] = useState('')
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [showSchoolDrop, setShowSchoolDrop] = useState(false)
  const [schoolResults, setSchoolResults] = useState<School[]>([])
  const [schoolSearching, setSchoolSearching] = useState(false)
  const schoolSearchSeq = useRef(0)

  // reset password modal
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // quota modal
  const [quotaTarget, setQuotaTarget] = useState<{ id: string; name: string } | null>(null)
  const [quotaVal, setQuotaVal] = useState('')
  const [quotaSaving, setQuotaSaving] = useState(false)

  // bulk delete
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // action dropdown per row
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null)
    }
    function handleScroll() { setOpenMenuId(null) }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleScroll, true)
    return () => { document.removeEventListener('mousedown', handleClick); window.removeEventListener('scroll', handleScroll, true) }
  }, [])

  const openMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right - 4 })
    setOpenMenuId(prev => prev === id ? null : id)
  }, [])

  async function loadData() {
    setLoading(true)
    const { admins: a, schools: s } = await fetchAdminsAndSchools()
    setAdmins(a); setSchools(s); setLoading(false)
  }

  function openAdd() {
    setEditAdmin(null); setSelectedSchoolId(''); setSchoolSearch(''); setSchoolResults([]); setFormError(''); setShowForm(true)
  }
  function openEdit(admin: Admin) {
    setEditAdmin(admin)
    setSelectedSchoolId(admin.school_id || '')
    setSchoolSearch(admin.school?.name || schools.find(s => s.id === admin.school_id)?.name || '')
    setSchoolResults([])
    setFormError(''); setShowForm(true)
  }

  async function onSchoolSearchChange(value: string) {
    setSchoolSearch(value)
    setSelectedSchoolId('')
    setShowSchoolDrop(true)
    const seq = ++schoolSearchSeq.current
    const q = value.trim()
    if (q.length < 1) { setSchoolResults([]); setSchoolSearching(false); return }
    setSchoolSearching(true)
    try {
      const rows = await searchSchoolsForAdminAssign(q)
      if (seq !== schoolSearchSeq.current) return
      setSchoolResults(rows as School[])
    } catch {
      if (seq !== schoolSearchSeq.current) return
      setSchoolResults([])
    }
    setSchoolSearching(false)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedSchoolId) { setFormError('กรุณาเลือกโรงเรียน'); return }
    setSaving(true); setFormError('')
    const fd = new FormData(e.currentTarget)
    if (editAdmin?.id) {
      const { error } = await updateAdmin(editAdmin.id, {
        prefix: fd.get('prefix') as string,
        full_name: fd.get('full_name') as string,
        position: fd.get('position') as string,
        school_id: selectedSchoolId,
      })
      setSaving(false)
      if (error) setFormError(error)
      else { setShowForm(false); notify('success', 'อัปเดตข้อมูลเรียบร้อย'); loadData() }
    } else {
      const password = fd.get('password') as string
      if (!password) { setSaving(false); setFormError('กรุณากรอกรหัสผ่าน'); return }
      const res = await fetch('/api/district/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fd.get('email'), password, full_name: fd.get('full_name'), prefix: fd.get('prefix'), position: fd.get('position'), school_id: selectedSchoolId }),
      })
      const result = await res.json()
      setSaving(false)
      if (!res.ok) setFormError(result.error || 'เกิดข้อผิดพลาด')
      else { setShowForm(false); notify('success', 'เพิ่มผู้ดูแลโรงเรียนเรียบร้อยแล้ว'); loadData() }
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function toggleSelectAll() {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(a => a.id)))
  }

  async function handleDelete() {
    const count = selected.size
    setDeleting(true)
    const { error } = await deleteAdmins([...selected])
    setDeleting(false); setShowDeleteConfirm(false); setSelected(new Set())
    if (error) notify('error', 'เกิดข้อผิดพลาด: ' + error)
    else { notify('success', `ลบผู้ดูแล ${count} คนเรียบร้อย`); loadData() }
  }

  async function handleResetPassword() {
    if (!resetTarget) return
    setResetting(true); setResetMsg(null)
    const { error } = await resetAdminPassword(resetTarget.id, newPassword)
    setResetting(false)
    if (error) setResetMsg({ ok: false, text: error })
    else setResetMsg({ ok: true, text: 'รีเซ็ตรหัสผ่านเรียบร้อยแล้ว' })
  }

  async function handleSetQuota() {
    if (!quotaTarget) return
    setQuotaSaving(true)
    const { error } = await setAdminQuota(quotaTarget.id, Number(quotaVal))
    setQuotaSaving(false)
    if (error) notify('error', error)
    else { notify('success', 'ตั้งโควต้าเรียบร้อย'); loadData() }
    setQuotaTarget(null)
  }

  const schoolMap = Object.fromEntries(schools.map(s => [s.id, s]))
  const filtered = admins.filter(a => {
    const q = search.toLowerCase()
    const matchQ = !q || a.full_name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q) ||
      (a.school_id && schoolMap[a.school_id]?.name?.toLowerCase().includes(q))
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? a.is_active : !a.is_active)
    return matchQ && matchStatus
  })

  const activeCount = admins.filter(a => a.is_active).length
  const schoolsWithAdmin = new Set(admins.filter(a => a.school_id).map(a => a.school_id)).size

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-3)' }}>กำลังโหลด...</div>

  return (
    <div className="page-stack">
      {/* Form Modal */}
      {showForm && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '560px', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>{editAdmin?.id ? 'แก้ไขผู้ดูแลโรงเรียน' : 'เพิ่มผู้ดูแลโรงเรียนใหม่'}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* school search */}
                <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
                  <label className="form-label">โรงเรียน *</label>
                  <input type="hidden" name="school_id" value={selectedSchoolId} />
                  <input type="text" className="form-input" placeholder="พิมพ์ชื่อโรงเรียน / อำเภอ / จังหวัด เพื่อค้นหา..."
                    value={schoolSearch} autoComplete="off"
                    onChange={e => onSchoolSearchChange(e.target.value)}
                    onFocus={() => setShowSchoolDrop(true)}
                    onBlur={() => setTimeout(() => setShowSchoolDrop(false), 180)}
                    style={{ borderColor: selectedSchoolId ? '#059669' : undefined }}
                  />
                  {selectedSchoolId && <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px' }}>✓ เลือกแล้ว</div>}
                  {showSchoolDrop && schoolSearch.trim().length >= 1 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '240px', overflowY: 'auto', marginTop: '4px' }}>
                      {schoolSearching && (
                        <div style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text-3)' }}>กำลังค้นหา...</div>
                      )}
                      {!schoolSearching && schoolResults.map(s => (
                        <div key={s.id} onMouseDown={() => { setSelectedSchoolId(s.id); setSchoolSearch(s.name); setShowSchoolDrop(false) }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border)', background: selectedSchoolId === s.id ? '#F5EDE3' : 'white' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F5')}
                          onMouseLeave={e => (e.currentTarget.style.background = selectedSchoolId === s.id ? '#F5EDE3' : 'white')}>
                          <div style={{ fontWeight: 600 }}>{s.name}</div>
                          {(s.district || s.province) && (
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                              {[s.district, s.province].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      ))}
                      {!schoolSearching && schoolResults.length === 0 && (
                        <div style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text-3)' }}>ไม่พบโรงเรียนในฐานข้อมูล</div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="form-label">คำนำหน้า</label>
                  <select name="prefix" defaultValue={editAdmin?.prefix || 'นาย'} className="form-input">
                    {PREFIXES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">ชื่อ-นามสกุล *</label>
                  <input name="full_name" defaultValue={editAdmin?.full_name} className="form-input" required placeholder="สมชาย ใจดี" />
                </div>
                <div>
                  <label className="form-label">Email *</label>
                  <input name="email" type="email" defaultValue={editAdmin?.email} className="form-input" required
                    readOnly={!!editAdmin?.id} placeholder="admin@school.ac.th"
                    style={editAdmin?.id ? { background: 'var(--bg-2)', color: 'var(--text-3)' } : {}} />
                </div>
                {!editAdmin?.id && (
                  <div>
                    <label className="form-label">รหัสผ่าน *</label>
                    <input name="password" type="password" className="form-input" required minLength={8} placeholder="อย่างน้อย 8 ตัวอักษร" />
                  </div>
                )}
                <div style={{ gridColumn: editAdmin?.id ? '2' : '1 / -1' }}>
                  <label className="form-label">ตำแหน่ง</label>
                  <input name="position" defaultValue={editAdmin?.position} className="form-input" placeholder="ผู้อำนวยการ..." />
                </div>

                {formError && <div className="alert-error" style={{ gridColumn: '1 / -1' }}>{formError}</div>}
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">ยกเลิก</button>
                <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '400px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>รีเซ็ตรหัสผ่าน</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px' }}>{resetTarget.name}</p>
            {resetMsg && <div className={`alert-${resetMsg.ok ? 'success' : 'error'}`} style={{ marginBottom: '16px' }}>{resetMsg.text}</div>}
            {!resetMsg?.ok && (
              <>
                <label className="form-label">รหัสผ่านใหม่ *</label>
                <input type="password" className="form-input" placeholder="อย่างน้อย 8 ตัวอักษร"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ marginBottom: '20px' }} autoFocus />
                <div className="form-actions">
                  <button onClick={() => { setResetTarget(null); setNewPassword(''); setResetMsg(null) }} className="btn btn-ghost">ยกเลิก</button>
                  <LoadingButton loading={resetting} loadingText="กำลังรีเซ็ต..." onClick={handleResetPassword} disabled={newPassword.length < 8}>
                    รีเซ็ตรหัสผ่าน
                  </LoadingButton>
                </div>
              </>
            )}
            {resetMsg?.ok && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => { setResetTarget(null); setNewPassword(''); setResetMsg(null) }} className="btn btn-primary">ปิด</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '380px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px', color: '#991B1B' }}>ยืนยันการลบ</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '20px', lineHeight: 1.7 }}>
              ลบผู้ดูแลโรงเรียน <b>{selected.size} คน</b> ออกจากระบบ<br/>
              <span style={{ color: '#DC2626', fontSize: '12px' }}>ไม่สามารถย้อนกลับได้</span>
            </p>
            <div className="form-actions">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn btn-ghost">ยกเลิก</button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ padding: '8px 18px', borderRadius: '8px', background: '#DC2626', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'กำลังลบ...' : `ลบ ${selected.size} คน`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">Membership admin</span>
          <h1 className="page-title">จัดการผู้ดูแลโรงเรียน</h1>
          <p className="page-subtitle">
            {admins.length} คน · ใช้งาน {activeCount} · รออนุมัติ {admins.length - activeCount} · {schoolsWithAdmin} โรงเรียนมีผู้ดูแล
          </p>
        </div>
        <div className="page-actions">
          {selected.size > 0 && (
            <button onClick={() => setShowDeleteConfirm(true)}
              style={{ padding: '8px 14px', borderRadius: '8px', background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
              ลบที่เลือก ({selected.size})
            </button>
          )}
          <button onClick={openAdd} className="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }}><path d="M12 5v14M5 12h14"/></svg>
            เพิ่มผู้ดูแล
          </button>
        </div>
      </div>

      <AlertModal />

      {/* Filter bar */}
      <div className="filter-bar control-card">
        <input type="text" placeholder="ค้นหาชื่อ, Email, โรงเรียน..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="form-input" style={{ flex: 1, minWidth: '200px', maxWidth: '340px' }} />
        {(['all', 'active', 'inactive'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{
              padding: '7px 14px', borderRadius: '100px', fontSize: '12px', fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: filterStatus === s ? (s === 'inactive' ? '#DC2626' : s === 'active' ? '#059669' : '#8B6B45') : 'var(--bg-2)',
              color: filterStatus === s ? 'white' : 'var(--text-2)',
            }}>
            {s === 'all' ? `ทั้งหมด ${admins.length}` : s === 'active' ? `ใช้งาน ${activeCount}` : `รออนุมัติ ${admins.length - activeCount}`}
          </button>
        ))}
      </div>

      {/* Dropdown menu — fixed position ไม่ถูก clip โดย overflow:hidden */}
      {openMenuId && (
        <div ref={menuRef} style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 200, background: 'white', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: '160px', overflow: 'hidden' }}>
          {(() => {
            const admin = admins.find(a => a.id === openMenuId)
            if (!admin) return null
            return [
              { label: 'แก้ไขข้อมูล', color: 'var(--text)', action: () => { openEdit(admin); setOpenMenuId(null) } },
              { label: 'รีเซ็ตรหัสผ่าน', color: '#C49212', action: () => { setResetTarget({ id: admin.id, name: `${admin.prefix} ${admin.full_name}` }); setNewPassword(''); setResetMsg(null); setOpenMenuId(null) } },
              { label: 'ตั้งโควต้าผู้ใช้', color: '#0891B2', action: () => { setQuotaTarget({ id: admin.id, name: `${admin.prefix} ${admin.full_name}` }); setQuotaVal(String(admin.quota ?? 15)); setOpenMenuId(null) } },
              { label: admin.is_active ? 'ระงับการใช้งาน' : 'เปิดใช้งาน', color: admin.is_active ? '#D97706' : '#059669', action: async () => { await toggleAdminActive(admin.id, !admin.is_active); setOpenMenuId(null); loadData() } },
              { label: 'ลบผู้ดูแล', color: '#DC2626', action: () => { setSelected(new Set([admin.id])); setShowDeleteConfirm(true); setOpenMenuId(null) } },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', fontSize: '13px', color: item.color }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                {item.label}
              </button>
            ))
          })()}
        </div>
      )}

      {/* Quota Modal */}
      {quotaTarget && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '380px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>ตั้งโควต้าผู้ใช้</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px' }}>{quotaTarget.name}</p>
            <label className="form-label">จำนวน user สูงสุดในโรงเรียน</label>
            <input type="number" min={0} className="form-input" value={quotaVal} onChange={e => setQuotaVal(e.target.value)} style={{ marginBottom: '8px' }} autoFocus />
            <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '20px' }}>นับ user ทุกคนในโรงเรียน (ผอ./ครู/วิชาการ ฯลฯ) · ค่าเริ่มต้น 15</p>
            <div className="form-actions">
              <button onClick={() => setQuotaTarget(null)} className="btn btn-ghost">ยกเลิก</button>
              <LoadingButton loading={quotaSaving} onClick={handleSetQuota}>บันทึก</LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="data-card">
        {filtered.length === 0 ? (
          <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-3)' }}>
            {admins.length === 0 ? 'ยังไม่มีผู้ดูแลโรงเรียน กด "+ เพิ่มผู้ดูแล" เพื่อเริ่มต้น' : 'ไม่พบข้อมูลที่ตรงกับตัวกรอง'}
          </div>
        ) : (
          <table className="thai-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleSelectAll}
                    style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: 'pointer' }} />
                </th>
                <th>ชื่อ-นามสกุล</th>
                <th>Email</th>
                <th>โรงเรียน</th>
                <th style={{ width: '60px', textAlign: 'center' }}>นักเรียน</th>
                <th style={{ width: '190px' }}>บุคลากร</th>
                <th style={{ width: '80px', textAlign: 'center' }}>โควต้า</th>
                <th style={{ width: '90px' }}>สถานะ</th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(admin => {
                const school = admin.school || (admin.school_id ? schoolMap[admin.school_id] : null)
                const isSelected = selected.has(admin.id)
                const menuOpen = openMenuId === admin.id
                return ( // menuOpen ใช้ highlight ปุ่ม ⋯ เท่านั้น
                  <tr key={admin.id} style={{ background: isSelected ? '#F5EDE3' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(admin.id)}
                        style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: 'pointer' }} />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{admin.prefix} {admin.full_name}</div>
                      {admin.position && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>{admin.position}</div>}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-2)' }}>{admin.email}</td>
                    <td>
                      {school
                        ? <span style={{ fontSize: '13px', color: 'var(--text)' }}>{school.name}</span>
                        : <span style={{ fontSize: '12px', color: '#D97706', background: '#FEF3C7', padding: '2px 8px', borderRadius: '100px', fontWeight: 600 }}>ยังไม่ได้กำหนด</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-2)' }}>{admin.stat ? admin.stat.students : '-'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                      {admin.stat
                        ? `ผอ.${admin.stat.principal} · สอน ${admin.stat.teacher_only} · ปจ.ชั้น ${admin.stat.homeroom} · วก.${admin.stat.academic_head}`
                        : '-'}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '13px' }}>
                      {admin.stat
                        ? <span style={{ color: admin.stat.totalUsers >= (admin.quota ?? 15) ? '#DC2626' : 'var(--text-2)', fontWeight: 600 }}>{admin.stat.totalUsers}/{admin.quota ?? 15}</span>
                        : <span style={{ color: 'var(--text-3)' }}>–/{admin.quota ?? 15}</span>}
                    </td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, background: admin.is_active ? '#D1FAE5' : '#FEE2E2', color: admin.is_active ? '#065F46' : '#991B1B' }}>
                        {admin.is_active ? 'ใช้งาน' : 'รออนุมัติ'}
                      </span>
                    </td>
                    <td>
                      <button onClick={e => openMenu(e, admin.id)}
                        style={{ background: menuOpen ? 'var(--bg-2)' : 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: '6px', color: 'var(--text-2)', fontSize: '18px', lineHeight: 1 }}>
                        ⋯
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
