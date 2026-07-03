'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { loadDistrictDefaults } from '../settings/page'
import { fetchSchools, createSchool, updateSchool, bulkInsertSchools } from './actions'
import type { OBECSchool } from '@/app/api/district/schools/import/route'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'

type School = {
  id: string; name: string; department: string; area_office: string
  district: string; province: string; address: string; phone: string
  document_prefix: string; director_name: string; admin_name: string | null
}

export default function DistrictSchoolsPage() {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<Partial<School> | null>(null)
  const [saving, setSaving] = useState(false)
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const [search, setSearch] = useState('')
  const [filterDistrict, setFilterDistrict] = useState('')
  const [filterAdmin, setFilterAdmin] = useState<'all' | 'has' | 'none'>('all')

  // OBEC import state
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [obecList, setObecList] = useState<OBECSchool[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await fetchSchools()
    setSchools(data as School[])
    setLoading(false)
  }

  function openAdd() {
    const d = loadDistrictDefaults()
    setEdit({ department: d.department, area_office: d.area_office, province: d.province, document_prefix: d.document_prefix })
    setShowForm(true)
    clearAlert()
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const payload = {
      name: fd.get('name') as string,
      department: fd.get('department') as string,
      area_office: fd.get('area_office') as string,
      district: fd.get('district') as string,
      province: fd.get('province') as string,
      address: fd.get('address') as string,
      phone: fd.get('phone') as string,
      document_prefix: fd.get('document_prefix') as string,
    }
    const result = edit?.id ? await updateSchool(edit.id, payload) : await createSchool(payload)
    setSaving(false)
    if (result.error) notify('error', result.error)
    else { notify('success', edit?.id ? 'อัปเดตเรียบร้อย' : 'เพิ่มโรงเรียนเรียบร้อย'); setShowForm(false); load() }
  }

  async function fetchOBEC() {
    const d = loadDistrictDefaults()
    if (!d.area_code) { setImportError('กรุณากำหนดรหัสเขตพื้นที่ใน ตั้งค่าเขต ก่อน'); return }
    setImporting(true); setImportError(''); setObecList([]); setSelected(new Set())
    const res = await fetch(`/api/district/schools/import?area_code=${d.area_code}`)
    const json = await res.json()
    setImporting(false)
    if (!res.ok) { setImportError(json.error + (json.hint ? `\n${json.hint}` : '')); return }
    const existing = new Set(schools.map(s => s.name))
    setObecList(json.schools.filter((s: OBECSchool) => !existing.has(s.name)))
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const d = loadDistrictDefaults()
    if (!d.area_code) { setImportError('กรุณากำหนดรหัสเขตพื้นที่ใน ตั้งค่าเขต ก่อน'); return }
    setImporting(true); setImportError(''); setObecList([]); setSelected(new Set())
    const form = new FormData()
    form.append('file', file)
    form.append('area_code', d.area_code)
    const res = await fetch('/api/district/schools/import', { method: 'POST', body: form })
    const json = await res.json()
    setImporting(false)
    if (!res.ok) { setImportError(json.error + (json.hint ? `\n${json.hint}` : '')); return }
    const existing = new Set(schools.map(s => s.name))
    setObecList(json.schools.filter((s: OBECSchool) => !existing.has(s.name)))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function openImport() { setShowImport(true) }
  function toggleSelect(name: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })
  }

  async function importSelected() {
    if (selected.size === 0) return
    setBulkSaving(true)
    const d = loadDistrictDefaults()
    const rows = obecList.filter(s => selected.has(s.name)).map(s => ({
      name: s.name, department: d.department, area_office: d.area_office,
      province: s.province || d.province, district: s.district, phone: s.phone,
      document_prefix: d.document_prefix,
    }))
    const { error } = await bulkInsertSchools(rows)
    setBulkSaving(false)
    if (error) setImportError('เกิดข้อผิดพลาด: ' + error)
    else { setShowImport(false); notify('success', `นำเข้า ${rows.length} โรงเรียนเรียบร้อย`); load() }
  }

  // unique districts for filter
  const districtOptions = useMemo(() =>
    [...new Set(schools.map(s => s.district).filter(Boolean))].sort()
  , [schools])

  const filtered = useMemo(() => schools.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.name?.toLowerCase().includes(q) || s.district?.includes(q) || s.director_name?.toLowerCase().includes(q)
    const matchDistrict = !filterDistrict || s.district === filterDistrict
    const matchAdmin = filterAdmin === 'all' || (filterAdmin === 'has' ? !!s.admin_name : !s.admin_name)
    return matchSearch && matchDistrict && matchAdmin
  }), [schools, search, filterDistrict, filterAdmin])

  const hasAdmin = schools.filter(s => s.admin_name).length
  const noAdmin = schools.length - hasAdmin

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-3)' }}>กำลังโหลด...</div>

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">School database</span>
          <h1 className="page-title">จัดการโรงเรียน</h1>
          <p className="page-subtitle">โรงเรียนในสังกัดทั้งหมด {schools.length} โรงเรียน</p>
        </div>
        <div className="page-actions">
          <button onClick={openImport} className="btn btn-ghost">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            นำเข้าจาก สพฐ.
          </button>
          <button onClick={openAdd} className="btn btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}><path d="M12 5v14M5 12h14"/></svg>
            เพิ่มโรงเรียน
          </button>
        </div>
      </div>

      <AlertModal />

      {/* Summary chips */}
      <div className="classroom-admin-page-legend">
        {[
          { key: 'all',  label: `ทั้งหมด ${schools.length}`,       color: '#4F46E5', bg: '#EEF2FF' },
          { key: 'has',  label: `มีผู้ดูแลแล้ว ${hasAdmin}`,        color: '#059669', bg: '#ECFDF5' },
          { key: 'none', label: `ยังไม่มีผู้ดูแล ${noAdmin}`,       color: '#D97706', bg: '#FFFBEB' },
        ].map(c => (
          <button key={c.key} onClick={() => setFilterAdmin(c.key as typeof filterAdmin)}
            style={{
              padding: '5px 14px', borderRadius: '100px', fontSize: '12px', fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: filterAdmin === c.key ? c.color : c.bg,
              color: filterAdmin === c.key ? 'white' : c.color,
            }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar control-card">
        <input
          type="text" placeholder="ค้นหาชื่อโรงเรียน, ผู้อำนวยการ..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="form-input" style={{ flex: '1', minWidth: '220px', maxWidth: '360px' }}
        />
        <select
          value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)}
          className="form-input" style={{ width: '180px' }}>
          <option value="">อำเภอทั้งหมด</option>
          {districtOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {(search || filterDistrict || filterAdmin !== 'all') && (
          <button onClick={() => { setSearch(''); setFilterDistrict(''); setFilterAdmin('all') }}
            style={{ fontSize: '12px', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>
            ล้างตัวกรอง ✕
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-card" style={{ maxWidth: 820, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>{edit?.id ? 'แก้ไขข้อมูลโรงเรียน' : 'เพิ่มโรงเรียนใหม่'}</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กรอกข้อมูลโรงเรียนในสังกัด ใช้ค่าตั้งต้นจากเขตพื้นที่เมื่อเพิ่มใหม่</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                ปิด
              </button>
            </div>
            <form onSubmit={handleSave} className="form-grid">
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">ชื่อโรงเรียน *</label>
                <input name="name" defaultValue={edit?.name} className="form-input" required placeholder="โรงเรียน..." />
              </div>
              <div>
                <label className="form-label">สังกัด</label>
                <input name="department" defaultValue={edit?.department} className="form-input" placeholder="สพฐ., อปท., สช." />
              </div>
              <div>
                <label className="form-label">สำนักงานเขตพื้นที่</label>
                <input name="area_office" defaultValue={edit?.area_office} className="form-input" />
              </div>
              <div>
                <label className="form-label">อำเภอ</label>
                <input name="district" defaultValue={edit?.district} className="form-input" />
              </div>
              <div>
                <label className="form-label">จังหวัด</label>
                <input name="province" defaultValue={edit?.province} className="form-input" />
              </div>
              <div>
                <label className="form-label">เบอร์โทรศัพท์</label>
                <input name="phone" defaultValue={edit?.phone} className="form-input" />
              </div>
              <div>
                <label className="form-label">คำนำหน้าเลขหนังสือ</label>
                <input name="document_prefix" defaultValue={edit?.document_prefix} className="form-input" placeholder="ศธ 04153/" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">ที่อยู่</label>
                <input name="address" defaultValue={edit?.address} className="form-input" />
              </div>
              <div className="form-actions" style={{ gridColumn: '1 / -1', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-secondary">ยกเลิก</button>
                <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="data-card">
        {filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-3)' }}>
            {schools.length === 0
              ? 'ยังไม่มีโรงเรียน — กด "นำเข้าจาก สพฐ." เพื่อเพิ่มทีเดียว'
              : 'ไม่พบโรงเรียนที่ตรงกับตัวกรอง'}
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-3)' }}>
              แสดง {filtered.length} จาก {schools.length} โรงเรียน
            </div>
            <table className="thai-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>ที่</th>
                  <th>ชื่อโรงเรียน</th>
                  <th style={{ width: '120px' }}>อำเภอ</th>
                  <th style={{ width: '160px' }}>ผู้อำนวยการ</th>
                  <th style={{ width: '150px' }}>ผู้ดูแลระบบ</th>
                  <th style={{ width: '70px' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '12px' }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{s.name}</div>
                      {s.phone && <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>{s.phone}</div>}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-2)' }}>{s.district || '-'}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-2)' }}>{s.director_name || <span style={{ color: 'var(--text-3)' }}>-</span>}</td>
                    <td>
                      {s.admin_name ? (
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#065F46', background: '#D1FAE5', padding: '3px 10px', borderRadius: '100px', whiteSpace: 'nowrap' }}>
                          ✓ {s.admin_name}
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#92400E', background: '#FEF3C7', padding: '3px 10px', borderRadius: '100px' }}>
                          ยังไม่มี
                        </span>
                      )}
                    </td>
                    <td>
                      <button onClick={() => { setEdit(s); setShowForm(true); clearAlert() }}
                        style={{ fontSize: '13px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* OBEC Import Modal */}
      {showImport && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ width: '100%', maxWidth: '720px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>นำเข้าโรงเรียน</div>
              <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

              {/* วิธีนำเข้า */}
              {!importing && obecList.length === 0 && !importError && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                  {/* อัปโหลด Excel */}
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
                  <button onClick={() => fileInputRef.current?.click()}
                    style={{ padding: '16px 20px', borderRadius: '12px', border: '2px dashed #4F46E5', background: '#EEF2FF', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3"/></svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#3730A3' }}>อัปโหลดไฟล์ Excel</div>
                      <div style={{ fontSize: '12px', color: '#6366F1', marginTop: '2px' }}>เลือกไฟล์ .xlsx จากเครื่องของคุณ (DMC682_edit.xlsx หรือไฟล์ข้อมูลโรงเรียน)</div>
                    </div>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}/>
                    <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>หรือ</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}/>
                  </div>

                  <button onClick={fetchOBEC}
                    style={{ padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-2)' }}>ดึงจาก API สพฐ.</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>data.bopp-obec.info (อาจไม่เสถียร)</div>
                    </div>
                  </button>
                </div>
              )}

              {importing && <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-3)', fontSize: '14px' }}>กำลังประมวลผล...</div>}
              {importError && (
                <div>
                  <div className="alert-error" style={{ whiteSpace: 'pre-line', marginBottom: '12px' }}>{importError}</div>
                  <button onClick={() => { setImportError(''); setObecList([]); setSelected(new Set()) }}
                    style={{ fontSize: '13px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← ลองใหม่</button>
                </div>
              )}
              {!importing && obecList.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>พบ <b>{obecList.length}</b> โรงเรียน (กรองที่มีอยู่แล้วออก)</span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setSelected(new Set(obecList.map(s => s.name)))} style={{ fontSize: '12px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>เลือกทั้งหมด</button>
                      <button onClick={() => setSelected(new Set())} style={{ fontSize: '12px', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>ยกเลิกทั้งหมด</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {obecList.map(s => (
                      <label key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${selected.has(s.name) ? 'var(--primary)' : 'var(--border)'}`, background: selected.has(s.name) ? 'var(--primary-bg)' : 'white', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selected.has(s.name)} onChange={() => toggleSelect(s.name)} style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</div>
                          {(s.district || s.province) && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>{[s.district, s.province].filter(Boolean).join(', ')}</div>}
                        </div>
                        {s.phone && <div style={{ fontSize: '11px', color: 'var(--text-3)', flexShrink: 0 }}>{s.phone}</div>}
                      </label>
                    ))}
                  </div>
                </>
              )}
              {!importing && obecList.length === 0 && !importError && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>ไม่มีโรงเรียนใหม่ให้นำเข้า</div>
              )}
            </div>
            {obecList.length > 0 && (
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>เลือก {selected.size} โรงเรียน</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setShowImport(false)} className="btn btn-ghost">ยกเลิก</button>
                  <LoadingButton loading={bulkSaving} loadingText="กำลังนำเข้า..." onClick={importSelected} disabled={selected.size === 0}>
                    นำเข้า {selected.size} โรงเรียน
                  </LoadingButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
