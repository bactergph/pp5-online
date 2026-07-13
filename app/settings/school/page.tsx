'use client'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { CSSProperties } from 'react'
import LoadingButton from '@/components/LoadingButton'
import StaffPicker, { type StaffOption } from '@/components/StaffPicker'
import { fetchMySchool, saveSchool, searchSchools, setMySchool, createAndSetMySchool, updateSchoolActingDirector, fetchSubjectGroupHeads, saveSubjectGroupHeads, fetchSchoolStaff, saveSchoolLeaders } from '../actions'
import GoogleDriveIntegrationPanel from '@/components/settings/GoogleDriveIntegrationPanel'
import { useAppAlert } from '@/lib/use-app-alert'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'
import { downscaleImageFile } from '@/lib/downscale-image-url'

type School = {
  id: string; name: string; department: string; area_office: string
  district: string; province: string; address: string; phone: string
  document_prefix: string; director_name: string; vice_director_name: string
  acting_director: string; acting_director_position: string
  director_user_id?: string | null
  vice_director_user_id?: string | null
  acting_director_user_id?: string | null
  academic_head_user_id?: string | null
  measurement_head_user_id?: string | null
  academic_head_name: string; measurement_head_name: string
  logo_url: string; stamp_url: string
  google_drive_folder_id?: string | null
  code: string; program_name: string; created_by: string
}

type SchoolSettingsTab = 'general' | 'leaders' | 'login' | 'branding' | 'integrations'
type UploadState = { uploading: boolean; url: string | null; error: string | null }

const SCHOOL_SETTING_TABS: { key: SchoolSettingsTab; label: string; icon: string }[] = [
  { key: 'general', label: 'ข้อมูลทั่วไป', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { key: 'leaders', label: 'ผู้บริหาร/ผู้รับผิดชอบ', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8z M4 22a8 8 0 0116 0' },
  { key: 'login', label: 'หน้าเข้าสู่ระบบ', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { key: 'branding', label: 'โลโก้และตรา', icon: 'M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z M8.5 8.5h.01 M21 15l-5-5L5 21' },
  { key: 'integrations', label: 'เชื่อมต่อ Google Drive', icon: 'M4 4h16v16H4z M8 8h8v8H8z' },
]
const schoolSettingTabs = Array.isArray(SCHOOL_SETTING_TABS) ? SCHOOL_SETTING_TABS : []

const schoolTabCardStyle: CSSProperties = {
  padding: 12,
  border: '1px solid rgba(226, 232, 240, 0.92)',
  borderRadius: 22,
  background: 'rgba(255, 255, 255, 0.96)',
  boxShadow: '0 14px 34px rgba(15, 23, 42, 0.06)',
}

const schoolTabsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  overflowX: 'auto',
  paddingBottom: 2,
}

const schoolTabStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
  minHeight: 44,
  gap: 8,
  padding: '10px 13px',
  border: '1px solid transparent',
  borderRadius: 14,
  background: 'transparent',
  color: '#64748B',
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
}

const activeSchoolTabStyle: CSSProperties = {
  border: '1px solid #BFDBFE',
  background: '#DBEAFE',
  color: '#1D4ED8',
  boxShadow: '0 8px 20px rgba(37, 99, 235, 0.12)',
}

const schoolPanelStyle: CSSProperties = {
  marginTop: 0,
}

function ImageUploadBox({ label, value, type, schoolId, onUploaded }: {
  label: string; value: string | null; type: 'logo' | 'stamp'
  schoolId: string; onUploaded: (url: string) => void
}) {
  const [state, setState] = useState<UploadState>({ uploading: false, url: value, error: null })
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setState(s => ({ ...s, error: 'รองรับเฉพาะ PNG, JPG, WEBP' }))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setState(s => ({ ...s, error: 'ไฟล์ต้องไม่เกิน 2 MB' }))
      return
    }
    setState(s => ({ ...s, uploading: true, error: null }))
    const resized = await downscaleImageFile(file, 512)
    const uploadName = resized === file ? file.name : file.name.replace(/\.[^./\\]+$/, '') + '.png'
    const fd = new FormData()
    fd.append('file', resized, uploadName)
    fd.append('type', type)
    fd.append('school_id', schoolId)
    const res = await fetch('/api/upload/school-file', { method: 'POST', body: fd })
    const json = await res.json()
    if (!res.ok) {
      setState(s => ({ ...s, uploading: false, error: json.error }))
    } else {
      setState({ uploading: false, url: json.url, error: null })
      onUploaded(json.url)
    }
  }

  return (
    <div>
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* preview box */}
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            width: '96px', height: '96px', borderRadius: '12px',
            border: '2px dashed var(--border)', background: 'var(--bg-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          {state.url ? (
            <Image src={state.url} alt={label} width={96} height={96} unoptimized style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={state.uploading}
            className="btn btn-secondary"
            style={{ fontSize: '13px' }}
          >
            {state.uploading ? 'กำลังอัพโหลด...' : state.url ? 'เปลี่ยนรูป' : 'เลือกรูป'}
          </button>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>PNG, JPG, WEBP ≤ 2 MB</p>
          {state.error && <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px' }}>{state.error}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  )
}

function SchoolTabIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

export default function SchoolSettingsPage() {
  const [school, setSchool] = useState<Partial<School>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const formRef = useRef<HTMLFormElement>(null)
  // school picker (กรณี admin ยังไม่ได้เลือกโรงเรียน)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; area_office: string; district: string; province: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [pickerErr, setPickerErr] = useState<string | null>(null)
  const [createMode, setCreateMode] = useState(false)
  const [reselect, setReselect] = useState(false)   // กดเปลี่ยนโรงเรียน
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<SchoolSettingsTab>(() => {
    const tab = searchParams.get('tab')
    if (tab === 'integrations' || tab === 'leaders' || tab === 'login' || tab === 'branding') return tab
    return 'general'
  })
  const [viceDirectorName, setViceDirectorName] = useState('')
  const [actingDirector, setActingDirector] = useState('')
  const [actingDirectorPosition, setActingDirectorPosition] = useState('')
  const [actingToggleBusy, setActingToggleBusy] = useState(false)
  const [subjectGroupHeads, setSubjectGroupHeads] = useState<Record<string, { name: string; userId: string | null }>>({})
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [directorUserId, setDirectorUserId] = useState<string | null>(null)
  const [directorName, setDirectorName] = useState('')
  const [viceDirectorUserId, setViceDirectorUserId] = useState<string | null>(null)
  const [academicHeadUserId, setAcademicHeadUserId] = useState<string | null>(null)
  const [academicHeadName, setAcademicHeadName] = useState('')
  const [measurementHeadUserId, setMeasurementHeadUserId] = useState<string | null>(null)
  const [measurementHeadName, setMeasurementHeadName] = useState('')
  const [actingDirectorUserId, setActingDirectorUserId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchMySchool(), fetchSubjectGroupHeads(), fetchSchoolStaff()]).then(([data, heads, staffList]) => {
      if (data) {
        setSchool(data)
        setViceDirectorName(data.vice_director_name || '')
        setDirectorName(data.director_name || '')
        setActingDirector(data.acting_director || '')
        setActingDirectorPosition(data.acting_director_position || '')
        setDirectorUserId(data.director_user_id || null)
        setViceDirectorUserId(data.vice_director_user_id || null)
        setActingDirectorUserId(data.acting_director_user_id || null)
        setAcademicHeadUserId(data.academic_head_user_id || null)
        setAcademicHeadName(data.academic_head_name || '')
        setMeasurementHeadUserId(data.measurement_head_user_id || null)
        setMeasurementHeadName(data.measurement_head_name || '')
      }
      setStaff(staffList as StaffOption[])
      setSubjectGroupHeads(heads)
      setLoading(false)
    })
  }, [])

  const isViceDirectorActing = Boolean(
    (viceDirectorUserId && actingDirectorUserId && viceDirectorUserId === actingDirectorUserId)
    || (
      viceDirectorName.trim()
      && actingDirector.trim() === viceDirectorName.trim()
      && actingDirectorPosition.trim() === 'รองผู้อำนวยการ'
    ),
  )

  async function doSearch(v: string) {
    setQ(v)
    if (v.trim().length < 2) { setResults([]); return }
    setResults(await searchSchools(v) as typeof results)
  }
  async function pickSchool(id: string) {
    setBusy(true); setPickerErr(null)
    const { error } = await setMySchool(id)
    if (error) { setBusy(false); setPickerErr(error); return }
    window.location.reload()
  }
  async function handleCreateSchool(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setPickerErr(null)
    const fd = new FormData(e.currentTarget)
    const { error } = await createAndSetMySchool({
      name: (fd.get('name') as string).trim(),
      area_office: (fd.get('area_office') as string).trim() || null,
      district: (fd.get('district') as string).trim() || null,
      province: (fd.get('province') as string).trim() || null,
    })
    if (error) { setBusy(false); setPickerErr(error); return }
    window.location.reload()
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true); clearAlert()
    const fd = new FormData(e.currentTarget)
    const updates = Object.fromEntries(
      ['name', 'department', 'area_office', 'district', 'province',
        'address', 'phone', 'document_prefix',
        'code', 'program_name', 'created_by']
        .map(k => [k, fd.get(k) as string | null])
    )
    const { error } = await saveSchool(school.id || null, updates)
    const leadersError = school.id
      ? (await saveSchoolLeaders({
        director_name: directorName,
        director_user_id: directorUserId,
        vice_director_name: viceDirectorName,
        vice_director_user_id: viceDirectorUserId,
        acting_director: actingDirector,
        acting_director_position: actingDirectorPosition,
        acting_director_user_id: actingDirectorUserId,
        academic_head_name: academicHeadName,
        academic_head_user_id: academicHeadUserId,
        measurement_head_name: measurementHeadName,
        measurement_head_user_id: measurementHeadUserId,
      })).error
      : null
    const headsError = school.id
      ? (await saveSubjectGroupHeads(
        Object.fromEntries(SUBJECT_GROUPS.map(group => [group, subjectGroupHeads[group] || { name: '', userId: null }])),
      )).error
      : null
    setSaving(false)
    if (error) notify('error', error)
    else if (leadersError) notify('error', leadersError)
    else if (headsError) notify('error', headsError)
    else notify('success', 'บันทึกข้อมูลเรียบร้อยแล้ว')
  }

  async function toggleViceDirectorAsActing() {
    if (!school.id || actingToggleBusy) return

    if (isViceDirectorActing) {
      setActingToggleBusy(true)
      clearAlert()
      const { error } = await updateSchoolActingDirector({
        acting_director: null,
        acting_director_position: null,
        acting_director_user_id: null,
      })
      setActingToggleBusy(false)
      if (error) {
        notify('error', error)
        return
      }
      setActingDirector('')
      setActingDirectorPosition('')
      setActingDirectorUserId(null)
      setSchool(prev => ({
        ...prev,
        acting_director: '',
        acting_director_position: '',
      }))
      notify('success', 'ยกเลิกผู้รักษาการและบันทึกแล้ว')
      return
    }

    const viceDirector = viceDirectorName.trim()
    if (!viceDirector) {
      notify('error', 'กรุณากรอกชื่อรองผู้อำนวยการก่อน')
      return
    }

    setActingToggleBusy(true)
    clearAlert()
    const { error } = await updateSchoolActingDirector({
      vice_director_name: viceDirector,
      vice_director_user_id: viceDirectorUserId,
      acting_director: viceDirector,
      acting_director_user_id: viceDirectorUserId,
      acting_director_position: 'รองผู้อำนวยการ',
    })
    setActingToggleBusy(false)
    if (error) {
      notify('error', error)
      return
    }
    setActingDirector(viceDirector)
    setActingDirectorPosition('รองผู้อำนวยการ')
    setActingDirectorUserId(viceDirectorUserId)
    setSchool(prev => ({
      ...prev,
      vice_director_name: viceDirector,
      acting_director: viceDirector,
      acting_director_position: 'รองผู้อำนวยการ',
    }))
    notify('success', 'ตั้งรองผู้อำนวยการเป็นผู้รักษาการและบันทึกแล้ว')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--text-3)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        กำลังโหลด...
      </div>
    </div>
  )

  // ── ยังไม่ได้เลือกโรงเรียน หรือกดเปลี่ยนโรงเรียน → เลือก/สร้าง ──
  if (!school.id || reselect) return (
    <div className="page-stack">
      {pickerErr && <div className="alert alert-error" style={{ marginBottom: 16 }}>{pickerErr}</div>}
      <div className="card-padded" style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setCreateMode(false)} className={!createMode ? 'btn btn-primary' : 'btn btn-secondary'}>ค้นหาโรงเรียน</button>
            <button onClick={() => setCreateMode(true)} className={createMode ? 'btn btn-primary' : 'btn btn-secondary'}>สร้างโรงเรียนใหม่</button>
          </div>
          {reselect && school.id && <button onClick={() => setReselect(false)} className="btn btn-secondary">← กลับ</button>}
        </div>
        {!createMode ? (
          <>
            <input className="form-input" placeholder="พิมพ์ชื่อโรงเรียน (อย่างน้อย 2 ตัวอักษร)" value={q} onChange={e => doSearch(e.target.value)} autoFocus />
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map(r => (
                <button key={r.id} onClick={() => pickSchool(r.id)} disabled={busy}
                  style={{ textAlign: 'left', padding: '12px 16px', cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 10, background: 'white' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{[r.area_office, r.district, r.province].filter(Boolean).join(' · ')}</div>
                </button>
              ))}
              {q.trim().length >= 2 && results.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>ไม่พบโรงเรียน — ลองสร้างใหม่ได้</p>}
            </div>
          </>
        ) : (
          <form onSubmit={handleCreateSchool} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}><label className="form-label">ชื่อโรงเรียน *</label><input name="name" className="form-input" required placeholder="บ้าน..." /></div>
            <div><label className="form-label">สำนักงานเขตพื้นที่</label><input name="area_office" className="form-input" placeholder="สพป.บึงกาฬ" /></div>
            <div><label className="form-label">จังหวัด</label><input name="province" className="form-input" /></div>
            <div><label className="form-label">อำเภอ</label><input name="district" className="form-input" /></div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
              <LoadingButton type="submit" loading={busy} loadingText="กำลังสร้าง...">สร้างและใช้โรงเรียนนี้</LoadingButton>
            </div>
          </form>
        )}
      </div>
    </div>
  )

  return (
    <div className="page-stack">
      <AlertModal />

      <form ref={formRef} onSubmit={save} className="school-settings-form">
        <div className="school-settings-tab-card" style={schoolTabCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <nav className="school-settings-tabs" aria-label="ตั้งค่าข้อมูลโรงเรียน" role="tablist" style={schoolTabsStyle}>
              {schoolSettingTabs.map(tab => {
                const isActive = activeTab === tab.key
                const tabStyle = isActive ? { ...schoolTabStyle, ...activeSchoolTabStyle } : schoolTabStyle
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`school-settings-tab ${isActive ? 'is-active' : ''}`}
                    role="tab"
                    aria-selected={isActive}
                    style={tabStyle}
                  >
                    <SchoolTabIcon d={tab.icon} />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </nav>
            <div className="school-settings-header-actions" style={{ flexShrink: 0 }}>
              {school.code && <span className="badge badge-success">/school/{school.code}</span>}
              <button type="button" onClick={() => { setReselect(true); setCreateMode(false); setQ(''); setResults([]) }} className="btn btn-secondary">เปลี่ยนโรงเรียน</button>
            </div>
          </div>
        </div>

        <div className="school-settings-panels" style={schoolPanelStyle}>
          <section
            className="card-padded school-settings-card"
            style={{ display: activeTab === 'general' ? 'block' : 'none' }}
            role="tabpanel"
          >
              <div className="school-card-head">
                <div>
                  <div className="section-title">ข้อมูลทั่วไป</div>
                  <p>ข้อมูลที่ใช้บนเอกสารราชการและรายงานของโรงเรียน</p>
                </div>
              </div>
              <div className="school-form-grid">
                <div className="school-field-wide">
                  <label className="form-label">ชื่อโรงเรียน *</label>
                  <input name="name" defaultValue={school.name || ''} className="form-input" required />
                </div>
                {[
                  { name: 'department', label: 'สังกัด', val: school.department },
                  { name: 'area_office', label: 'สำนักงานเขตพื้นที่การศึกษา', val: school.area_office },
                  { name: 'district', label: 'อำเภอ', val: school.district },
                  { name: 'province', label: 'จังหวัด', val: school.province },
                ].map(f => (
                  <div key={f.name}>
                    <label className="form-label">{f.label}</label>
                    <input name={f.name} defaultValue={f.val || ''} className="form-input" />
                  </div>
                ))}
                <div className="school-field-wide">
                  <label className="form-label">ที่อยู่</label>
                  <textarea name="address" defaultValue={school.address} className="form-input" rows={3} />
                </div>
                <div>
                  <label className="form-label">เบอร์โทรศัพท์</label>
                  <input name="phone" defaultValue={school.phone} className="form-input" placeholder="0X-XXXX-XXXX" />
                </div>
                <div>
                  <label className="form-label">คำนำหน้าเลขหนังสือ</label>
                  <input name="document_prefix" defaultValue={school.document_prefix} className="form-input" placeholder="ศธ 04153/" />
                </div>
              </div>
          </section>

          <section
            className="card-padded school-settings-card"
            style={{ display: activeTab === 'leaders' ? 'block' : 'none' }}
            role="tabpanel"
          >
              <div className="school-card-head">
                <div>
                  <div className="section-title">ผู้บริหารและผู้รับผิดชอบ</div>
                  <p>ชื่อที่ใช้ในเอกสารลงนามและรายงานสรุป</p>
                </div>
              </div>
              <div className="school-form-grid">
                <div>
                  <StaffPicker
                    label="ผู้อำนวยการ"
                    staff={staff}
                    value={directorUserId}
                    manualValue={directorName}
                    allowManual
                    onManualChange={setDirectorName}
                    onChange={(userId, name) => {
                      setDirectorUserId(userId)
                      setDirectorName(name)
                    }}
                  />
                </div>
                <div>
                  <label className="form-label">รองผู้อำนวยการ</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 220px' }}>
                      <StaffPicker
                        staff={staff}
                        value={viceDirectorUserId}
                        manualValue={viceDirectorName}
                        allowManual
                        onManualChange={setViceDirectorName}
                        onChange={(userId, name) => {
                          setViceDirectorUserId(userId)
                          setViceDirectorName(name)
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className={isViceDirectorActing ? 'btn btn-primary' : 'btn btn-secondary'}
                      style={{ whiteSpace: 'nowrap', marginTop: 26 }}
                      onClick={toggleViceDirectorAsActing}
                      disabled={actingToggleBusy}
                      aria-pressed={isViceDirectorActing}
                    >
                      {actingToggleBusy
                        ? 'กำลังบันทึก...'
                        : isViceDirectorActing
                          ? 'ยกเลิกรักษาการ'
                          : 'ตั้งเป็นรักษาการ ผอ.'}
                    </button>
                    {isViceDirectorActing && (
                      <span className="badge badge-success" style={{ whiteSpace: 'nowrap', marginTop: 30 }}>ใช้รอง ผอ. ลงนามแทน</span>
                    )}
                  </div>
                </div>
                <div>
                  <StaffPicker
                    label="ผู้รักษาการ (ถ้ามี)"
                    staff={staff}
                    value={actingDirectorUserId}
                    manualValue={actingDirector}
                    allowManual
                    onManualChange={setActingDirector}
                    onChange={(userId, name) => {
                      setActingDirectorUserId(userId)
                      setActingDirector(name)
                    }}
                  />
                </div>
                <div>
                  <label className="form-label">ตำแหน่งผู้รักษาการ</label>
                  <input
                    name="acting_director_position"
                    value={actingDirectorPosition}
                    onChange={e => setActingDirectorPosition(e.target.value)}
                    className="form-input"
                    placeholder="เช่น ครู, ครูชำนาญการ, รองผู้อำนวยการ"
                  />
                </div>
                <div>
                  <StaffPicker
                    label="หัวหน้าฝ่ายวิชาการ"
                    staff={staff}
                    value={academicHeadUserId}
                    manualValue={academicHeadName}
                    allowManual
                    onManualChange={setAcademicHeadName}
                    onChange={(userId, name) => {
                      setAcademicHeadUserId(userId)
                      setAcademicHeadName(name)
                    }}
                  />
                </div>
                <div>
                  <StaffPicker
                    label="หัวหน้างานวัดผล"
                    staff={staff}
                    value={measurementHeadUserId}
                    manualValue={measurementHeadName}
                    allowManual
                    onManualChange={setMeasurementHeadName}
                    onChange={(userId, name) => {
                      setMeasurementHeadUserId(userId)
                      setMeasurementHeadName(name)
                    }}
                  />
                </div>
              </div>
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <div className="section-title" style={{ marginBottom: 6 }}>หัวหน้ากลุ่มสาระการเรียนรู้</div>
                <p style={{ margin: '0 0 16px', color: 'var(--text-3)', fontSize: 13 }}>
                  ใช้ลงนามหน้าปก ปพ.5 รายวิชา — กำหนดชื่อตามกลุ่มสาระ 8 กลุ่ม
                </p>
                <div className="school-form-grid">
                  {SUBJECT_GROUPS.map(group => (
                    <div key={group}>
                      <StaffPicker
                        label={group}
                        staff={staff}
                        value={subjectGroupHeads[group]?.userId ?? null}
                        manualValue={subjectGroupHeads[group]?.name || ''}
                        allowManual
                        placeholder="ค้นหาชื่อบุคลากร..."
                        onManualChange={name => setSubjectGroupHeads(prev => ({
                          ...prev,
                          [group]: { name, userId: null },
                        }))}
                        onChange={(userId, name) => setSubjectGroupHeads(prev => ({
                          ...prev,
                          [group]: { name, userId },
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
          </section>

          <section
            className="card-padded school-settings-card"
            style={{ display: activeTab === 'login' ? 'block' : 'none' }}
            role="tabpanel"
          >
              <div className="school-card-head">
                <div>
                  <div className="section-title">หน้าเข้าสู่ระบบโรงเรียน</div>
                  <p>ลิงก์สำหรับครูและบุคลากรในโรงเรียน</p>
                </div>
              </div>
              <div className="school-form-grid school-form-grid-side">
                <div>
                  <label className="form-label">รหัสโรงเรียน *</label>
                  <input name="code" defaultValue={school.code || ''} className="form-input" placeholder="เช่น bannong" pattern="[a-z0-9-]+" />
                  <p className="field-hint">ใช้ a-z, 0-9 และ - เท่านั้น</p>
                </div>
                <div>
                  <label className="form-label">ชื่อโปรแกรม</label>
                  <input name="program_name" defaultValue={school.program_name || ''} className="form-input" placeholder="ระบบ ปพ.5 ออนไลน์" />
                </div>
                <div>
                  <label className="form-label">ชื่อผู้สร้าง/ผู้ดูแล</label>
                  <input name="created_by" defaultValue={school.created_by || ''} className="form-input" />
                </div>
              </div>
              {school.code && (
                <div className="school-login-link">
                  <span>ลิงก์เข้าระบบ</span>
                  <code>{typeof window !== 'undefined' ? window.location.origin : ''}/school/{school.code}/login</code>
                </div>
              )}
          </section>

          {school.id && (
            <section
              className="card-padded school-settings-card"
              style={{ display: activeTab === 'branding' ? 'block' : 'none' }}
              role="tabpanel"
            >
                <div className="school-card-head">
                  <div>
                    <div className="section-title">โลโก้และตราโรงเรียน</div>
                    <p>ใช้สำหรับพิมพ์ ปพ.5, ปพ.6 และรายงาน</p>
                  </div>
                </div>
                <div className="school-upload-stack">
                  <ImageUploadBox
                    label="โลโก้โรงเรียน"
                    value={school.logo_url || null}
                    type="logo"
                    schoolId={school.id}
                    onUploaded={url => setSchool(s => ({ ...s, logo_url: url }))}
                  />
                  <ImageUploadBox
                    label="ตราโรงเรียน"
                    value={school.stamp_url || null}
                    type="stamp"
                    schoolId={school.id}
                    onUploaded={url => setSchool(s => ({ ...s, stamp_url: url }))}
                  />
                </div>
            </section>
          )}

          {school.id && (
            <section
              className={`card-padded school-settings-card${activeTab === 'integrations' ? ' school-settings-card--drive' : ''}`}
              style={{ display: activeTab === 'integrations' ? 'block' : 'none' }}
              role="tabpanel"
            >
              <GoogleDriveIntegrationPanel active={activeTab === 'integrations'} />
            </section>
          )}
        </div>

        {activeTab !== 'integrations' ? (
          <div className="school-save-bar">
            <div>
              <strong>{school.name || 'ข้อมูลโรงเรียน'}</strong>
              <span>ตรวจสอบข้อมูลให้ครบก่อนบันทึก</span>
            </div>
            <LoadingButton type="submit" loading={saving} className="btn btn-primary btn-lg">บันทึกข้อมูล</LoadingButton>
          </div>
        ) : (
          <div className="school-save-bar school-save-bar--drive">
            <div>
              <strong>{school.name || 'ข้อมูลโรงเรียน'}</strong>
              <span>การเชื่อมต่อ Google Drive บันทึกทันทีเมื่อกดปุ่มเชื่อมต่อ — ไม่ต้องกดบันทึกฟอร์ม</span>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
