'use client'
/** ฐานข้อมูลโรงเรียน — เลือก/เพิ่มโรงเรียนในระบบ (ไม่พึ่งตั้งค่าสำนักงานเขต) */
import { useState, useEffect, useRef } from 'react'
import {
  fetchSchoolCatalog,
  fetchSchoolCatalogStats,
  createSchool,
  updateSchool,
  bulkInsertSchools,
  setSchoolLayoutTuner,
  setAllSchoolsLayoutTuner,
} from './actions'
import type { ImportSchool } from '@/app/api/district/schools/import/route'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'

type School = {
  id: string; name: string; department: string; area_office: string
  district: string; province: string; address: string; phone: string
  document_prefix: string; director_name: string; admin_name: string | null
  layout_tuner_enabled: boolean
}

function schoolKey(s: { name: string; district?: string; province?: string }) {
  return `${s.name}|${s.district || ''}|${s.province || ''}`
}

export default function DistrictSchoolsPage() {
  const [schools, setSchools] = useState<School[]>([])
  const [listTotal, setListTotal] = useState(0)
  const [stats, setStats] = useState({ total: 0, withAdmin: 0, withoutAdmin: 0 })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<Partial<School> | null>(null)
  const [saving, setSaving] = useState(false)
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterAdmin, setFilterAdmin] = useState<'all' | 'has' | 'none'>('all')
  const [page, setPage] = useState(1)
  const pageSize = 50

  // import from file
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importList, setImportList] = useState<ImportSchool[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // MOE import
  const [moeBusy, setMoeBusy] = useState(false)

  const [tunerBusyId, setTunerBusyId] = useState<string | null>(null)
  const [tunerBulkBusy, setTunerBulkBusy] = useState(false)

  async function loadStats() {
    const s = await fetchSchoolCatalogStats()
    setStats(s)
  }

  async function load(opts?: { q?: string; filterAdmin?: typeof filterAdmin; page?: number }) {
    setLoading(true)
    const q = opts?.q ?? search
    const fa = opts?.filterAdmin ?? filterAdmin
    const p = opts?.page ?? page
    try {
      const [cat] = await Promise.all([
        fetchSchoolCatalog({ q, filterAdmin: fa, page: p, pageSize }),
        loadStats(),
      ])
      setSchools(cat.rows as School[])
      setListTotal(cat.total)
      setPage(cat.page)
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'โหลดไม่สำเร็จ')
    }
    setLoading(false)
  }

  useEffect(() => { load({ page: 1 }) }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim()
      if (next === search) return
      setSearch(next)
      setPage(1)
      load({ q: next, page: 1 })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  async function handleToggleTuner(school: School) {
    const next = !school.layout_tuner_enabled
    setTunerBusyId(school.id)
    setSchools(prev => prev.map(s => s.id === school.id ? { ...s, layout_tuner_enabled: next } : s))
    const { error } = await setSchoolLayoutTuner(school.id, next)
    setTunerBusyId(null)
    if (error) {
      setSchools(prev => prev.map(s => s.id === school.id ? { ...s, layout_tuner_enabled: !next } : s))
      notify('error', error)
    }
  }

  async function handleToggleTunerAll(enabled: boolean) {
    setTunerBulkBusy(true)
    const { error } = await setAllSchoolsLayoutTuner(enabled)
    setTunerBulkBusy(false)
    if (error) notify('error', error)
    else {
      notify('success', enabled ? 'เปิดเมนูปรับ layout ทุกโรงเรียนแล้ว' : 'ปิดเมนูปรับ layout ทุกโรงเรียนแล้ว')
      load()
    }
  }

  function openAdd() {
    setEdit({ department: '', area_office: '', province: '', document_prefix: '' })
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
    else {
      notify('success', edit?.id ? 'อัปเดตเรียบร้อย' : 'เพิ่มโรงเรียนเรียบร้อย')
      setShowForm(false)
      load()
    }
  }

  async function handleMoeImport() {
    if (!confirm('นำเข้าโรงเรียนจากกระทรวง?\nระบบจะดึงจากเซิร์ฟเวอร์กระทรวงแล้วเพิ่มเฉพาะที่ยังไม่มี — อาจใช้เวลา 1–3 นาที')) {
      return
    }
    setMoeBusy(true)
    try {
      const res = await fetch('/api/district/schools/import-moe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearBe: 2568, period: 2 }),
      })
      const json = await res.json()
      if (!res.ok) {
        notify('error', json.error || 'นำเข้าไม่สำเร็จ')
      } else {
        notify(
          'success',
          `นำเข้า ${Number(json.inserted || 0).toLocaleString()} โรงเรียน (ข้ามที่มีแล้ว ${Number(json.skipped || 0).toLocaleString()} จากทั้งหมด ${Number(json.total || 0).toLocaleString()})`,
        )
        setPage(1)
        await load({ page: 1 })
      }
    } catch {
      notify('error', 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    }
    setMoeBusy(false)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportError(''); setImportList([]); setSelected(new Set())
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/district/schools/import', { method: 'POST', body: form })
    const json = await res.json()
    setImporting(false)
    if (!res.ok) {
      setImportError((json.error || 'นำเข้าไม่สำเร็จ') + (json.hint ? `\n${json.hint}` : ''))
      return
    }
    const all = json.schools as ImportSchool[]
    // กรองซ้ำกับ DB (โหลด key เป็นหน้า ๆ ถ้ายังไม่ใหญ่เกินไป)
    const keys = new Set<string>()
    if (stats.total > 0 && stats.total <= 8000) {
      const pages = Math.ceil(stats.total / 100)
      for (let p = 1; p <= pages; p++) {
        const batch = await fetchSchoolCatalog({ page: p, pageSize: 100 })
        for (const s of batch.rows) keys.add(schoolKey(s))
      }
    }
    const fresh = keys.size ? all.filter(s => !keys.has(schoolKey(s))) : all
    if (fresh.length === 0) {
      setImportError(`อ่านได้ ${all.length} โรงเรียน แต่มีในฐานข้อมูลครบแล้ว`)
      return
    }
    setImportList(fresh)
    setSelected(new Set(fresh.map(schoolKey)))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function openImport() {
    setShowImport(true)
    setImportError('')
    setImportList([])
    setSelected(new Set())
  }

  function toggleSelect(key: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  async function importSelected() {
    if (selected.size === 0) return
    setBulkSaving(true)
    const rows = importList.filter(s => selected.has(schoolKey(s))).map(s => ({
      name: s.name,
      area_office: s.area_office || null,
      province: s.province || null,
      district: s.district || null,
      phone: s.phone || null,
      address: s.address || null,
    }))
    const CHUNK = 1000
    let error: string | undefined
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: err } = await bulkInsertSchools(rows.slice(i, i + CHUNK))
      if (err) { error = err; break }
    }
    setBulkSaving(false)
    if (error) setImportError('เกิดข้อผิดพลาด: ' + error)
    else {
      setShowImport(false)
      notify('success', `นำเข้า ${rows.length} โรงเรียนเรียบร้อย`)
      load({ page: 1 })
    }
  }

  function changeFilterAdmin(next: typeof filterAdmin) {
    setFilterAdmin(next)
    setPage(1)
    load({ filterAdmin: next, page: 1 })
  }

  function goPage(next: number) {
    const maxPage = Math.max(1, Math.ceil(listTotal / pageSize))
    const p = Math.min(maxPage, Math.max(1, next))
    setPage(p)
    load({ page: p })
  }

  const maxPage = Math.max(1, Math.ceil(listTotal / pageSize))
  const pageStart = listTotal === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(listTotal, page * pageSize)

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">School database</span>
          <h1 className="page-title">จัดการโรงเรียน</h1>
          <p className="page-subtitle">
            ฐานข้อมูลโรงเรียน {stats.total.toLocaleString()} แห่ง — ค้นหาแล้วแสดงทีละหน้า
          </p>
        </div>
        <div className="page-actions" style={{ flexWrap: 'wrap' }}>
          <LoadingButton
            className="btn btn-secondary"
            loading={moeBusy}
            loadingText="กำลังดึงจากกระทรวง..."
            onClick={handleMoeImport}
          >
            นำเข้าจากกระทรวง
          </LoadingButton>
          <button onClick={openImport} className="btn btn-ghost">นำเข้าจากไฟล์</button>
          <button onClick={openAdd} className="btn btn-primary">+ เพิ่มโรงเรียน</button>
        </div>
      </div>

      <AlertModal />

      <div className="classroom-admin-page-legend">
        {[
          { key: 'all', label: `ทั้งหมด ${stats.total.toLocaleString()}`, color: '#8B6B45', bg: '#F5EDE3' },
          { key: 'has', label: `มีผู้ดูแลแล้ว ${stats.withAdmin.toLocaleString()}`, color: '#059669', bg: '#ECFDF5' },
          { key: 'none', label: `ยังไม่มีผู้ดูแล ${stats.withoutAdmin.toLocaleString()}`, color: '#D97706', bg: '#FFFBEB' },
        ].map(c => (
          <button
            key={c.key}
            onClick={() => changeFilterAdmin(c.key as typeof filterAdmin)}
            style={{
              padding: '5px 14px', borderRadius: '100px', fontSize: '12px', fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: filterAdmin === c.key ? c.color : c.bg,
              color: filterAdmin === c.key ? 'white' : c.color,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="control-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>เมนู “ปรับ layout”</div>
          <p style={{ margin: '2px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
            เปิด/ปิดทั้งฐานข้อมูล หรือสลับรายโรงเรียนในตาราง
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <LoadingButton className="btn btn-secondary" loading={tunerBulkBusy} onClick={() => handleToggleTunerAll(true)}>เปิดทั้งหมด</LoadingButton>
          <LoadingButton className="btn btn-ghost" loading={tunerBulkBusy} onClick={() => handleToggleTunerAll(false)}>ปิดทั้งหมด</LoadingButton>
        </div>
      </div>

      <div className="filter-bar control-card">
        <input
          type="text"
          placeholder="ค้นหาชื่อโรงเรียน, อำเภอ, จังหวัด..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="form-input"
          style={{ flex: '1', minWidth: '220px', maxWidth: '420px' }}
        />
        {(search || filterAdmin !== 'all') && (
          <button
            onClick={() => {
              setSearchInput('')
              setSearch('')
              setFilterAdmin('all')
              setPage(1)
              load({ q: '', filterAdmin: 'all', page: 1 })
            }}
            style={{ fontSize: '12px', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
          >
            ล้างตัวกรอง ✕
          </button>
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-card" style={{ maxWidth: 820, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>{edit?.id ? 'แก้ไขข้อมูลโรงเรียน' : 'เพิ่มโรงเรียนใหม่'}</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กรอกข้อมูลโรงเรียนสำหรับฐานข้อมูลระบบ</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>ปิด</button>
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

      <div className="data-card">
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-3)' }}>กำลังโหลด...</div>
        ) : listTotal === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-3)' }}>
            {stats.total === 0
              ? 'ยังไม่มีโรงเรียน — กด "นำเข้าจากกระทรวง" หรือ "นำเข้าจากไฟล์"'
              : 'ไม่พบโรงเรียนที่ตรงกับตัวกรอง'}
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span>แสดง {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} จาก {listTotal.toLocaleString()} โรงเรียน</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-ghost" disabled={page <= 1} onClick={() => goPage(page - 1)} style={{ padding: '4px 10px' }}>ก่อนหน้า</button>
                <span>หน้า {page}/{maxPage}</span>
                <button className="btn btn-ghost" disabled={page >= maxPage} onClick={() => goPage(page + 1)} style={{ padding: '4px 10px' }}>ถัดไป</button>
              </span>
            </div>
            <table className="thai-table">
              <thead>
                <tr>
                  <th style={{ width: '48px' }}>ที่</th>
                  <th>ชื่อโรงเรียน</th>
                  <th style={{ width: '120px' }}>อำเภอ</th>
                  <th style={{ width: '120px' }}>จังหวัด</th>
                  <th style={{ width: '150px' }}>ผู้ดูแลระบบ</th>
                  <th style={{ width: '110px' }}>ปรับ layout</th>
                  <th style={{ width: '70px' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((s, i) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '12px' }}>{pageStart + i}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{s.name}</div>
                      {s.phone && <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>{s.phone}</div>}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-2)' }}>{s.district || '-'}</td>
                    <td style={{ fontSize: '13px', color: 'var(--text-2)' }}>{s.province || '-'}</td>
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
                      <button
                        type="button"
                        onClick={() => handleToggleTuner(s)}
                        disabled={tunerBusyId === s.id}
                        aria-pressed={s.layout_tuner_enabled}
                        style={{
                          position: 'relative', width: 40, height: 22, borderRadius: 100, border: 'none',
                          cursor: tunerBusyId === s.id ? 'wait' : 'pointer', padding: 0,
                          background: s.layout_tuner_enabled ? '#8B6B45' : '#CBD5E1',
                          transition: 'background 0.15s', opacity: tunerBusyId === s.id ? 0.6 : 1,
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 2, left: s.layout_tuner_enabled ? 20 : 2,
                          width: 18, height: 18, borderRadius: '50%', background: 'white',
                          transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }} />
                      </button>
                    </td>
                    <td>
                      <button
                        onClick={() => { setEdit(s); setShowForm(true); clearAlert() }}
                        style={{ fontSize: '13px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      >
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

      {showImport && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ width: '100%', maxWidth: '720px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>นำเข้าโรงเรียนจากไฟล์</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  อ่านเฉพาะ ชื่อโรงเรียน, อำเภอ, จังหวัด, เขต, หมู่, หมู่บ้าน, ตำบล, ไปรษณีย์, โทรศัพท์
                </div>
              </div>
              <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {!importing && importList.length === 0 && !importError && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ padding: '20px', borderRadius: '12px', border: '2px dashed #8B6B45', background: '#F5EDE3', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '14px' }}
                  >
                    <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#8B6B45', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3"/></svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#5C4330' }}>เลือกไฟล์ Excel</div>
                      <div style={{ fontSize: '12px', color: '#B8956A', marginTop: '4px', lineHeight: 1.45 }}>
                        แนะนำใช้ปุ่ม「นำเข้าจากกระทรวง」ถ้าต้องการฐานทั้งประเทศ
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {importing && <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-3)', fontSize: '14px' }}>กำลังอ่านไฟล์...</div>}
              {importError && (
                <div>
                  <div className="alert-error" style={{ whiteSpace: 'pre-line', marginBottom: '12px' }}>{importError}</div>
                  <button onClick={() => { setImportError(''); setImportList([]); setSelected(new Set()) }}
                    style={{ fontSize: '13px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← ลองใหม่</button>
                </div>
              )}
              {!importing && importList.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>พบ <b>{importList.length}</b> โรงเรียนใหม่</span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setSelected(new Set(importList.map(schoolKey)))} style={{ fontSize: '12px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>เลือกทั้งหมด</button>
                      <button onClick={() => setSelected(new Set())} style={{ fontSize: '12px', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>ยกเลิกทั้งหมด</button>
                    </div>
                  </div>
                  {importList.length > 400 ? (
                    <div style={{ padding: '16px', borderRadius: 10, background: 'var(--bg-2)', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      รายการเยอะ ({importList.length.toLocaleString()} แห่ง) — จะนำเข้าทั้งที่เลือก
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {importList.map(s => {
                        const key = schoolKey(s)
                        return (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${selected.has(key) ? 'var(--primary)' : 'var(--border)'}`, background: selected.has(key) ? 'var(--primary-bg)' : 'white', cursor: 'pointer' }}>
                            <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                                {[s.area_office, s.district, s.province].filter(Boolean).join(' · ') || 'ไม่มีข้อมูลพื้นที่'}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            {importList.length > 0 && (
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>เลือก {selected.size.toLocaleString()} โรงเรียน</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setShowImport(false)} className="btn btn-ghost">ยกเลิก</button>
                  <LoadingButton loading={bulkSaving} loadingText="กำลังนำเข้า..." onClick={importSelected} disabled={selected.size === 0}>
                    นำเข้า {selected.size.toLocaleString()} โรงเรียน
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
