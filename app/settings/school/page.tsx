'use client'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { CSSProperties } from 'react'
import LoadingButton from '@/components/LoadingButton'
import StaffPicker, { type StaffOption } from '@/components/StaffPicker'
import { fetchMySchool, saveSchool, searchSchools, setMySchool, updateSchoolActingDirector, fetchSubjectGroupHeads, saveSubjectGroupHeads, fetchSchoolStaff, saveSchoolLeaders } from '../actions'
import GoogleDriveIntegrationPanel from '@/components/settings/GoogleDriveIntegrationPanel'
import DmcImportTool, { type DmcImportAction } from '@/components/settings/DmcImportTool'
import ClassroomManager from '@/components/settings/ClassroomManager'
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
  { key: 'login', label: 'สร้างหน้า login', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { key: 'branding', label: 'โลโก้และตรา', icon: 'M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z M8.5 8.5h.01 M21 15l-5-5L5 21' },
  { key: 'integrations', label: 'เชื่อมต่อ Google Drive', icon: 'M4 4h16v16H4z M8 8h8v8H8z' },
]
const schoolSettingTabs = Array.isArray(SCHOOL_SETTING_TABS) ? SCHOOL_SETTING_TABS : []

// ── ขั้นตอน onboarding (wizard เต็มจอสำหรับผู้ใช้ใหม่) ──
const ONBOARDING_STEPS: { key: string; label: string; title: string; desc: string; icon: string }[] = [
  { key: 'school', label: 'เลือกโรงเรียน', title: 'เลือกโรงเรียนของคุณ', desc: 'ค้นหาและเลือกโรงเรียนจากฐานข้อมูลที่สำนักงานเขตเตรียมไว้', icon: 'M3 21h18 M5 21V7l7-4 7 4v14 M9 21v-6h6v6' },
  { key: 'general', label: 'ข้อมูลทั่วไป', title: 'ข้อมูลทั่วไป', desc: 'ข้อมูลที่ใช้บนเอกสารราชการและรายงานของโรงเรียน', icon: 'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5' },
  { key: 'leaders', label: 'ผู้บริหาร/ผู้รับผิดชอบ', title: 'ผู้บริหารและผู้รับผิดชอบ', desc: 'ชื่อที่ใช้ลงนามในเอกสารและรายงานสรุป', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8z M4 22a8 8 0 0116 0' },
  { key: 'login', label: 'สร้างหน้า login', title: 'สร้างหน้า login โรงเรียน', desc: 'ตั้ง URL โรงเรียนสำหรับลิงก์เข้าระบบของครูและบุคลากร', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { key: 'branding', label: 'โลโก้และตรา', title: 'โลโก้และตราโรงเรียน', desc: 'อัปโหลดโลโก้และตราสำหรับพิมพ์ ปพ.5, ปพ.6 และรายงาน', icon: 'M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z M8.5 8.5h.01 M21 15l-5-5L5 21' },
  { key: 'classrooms', label: 'ชั้นเรียน', title: 'ชั้นเรียน', desc: 'ตั้งปีการศึกษาและชั้นที่เปิดสอนในจอเดียว (ทำภายหลังได้)', icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z' },
  { key: 'import', label: 'นำเข้านักเรียน', title: 'นำเข้ารายชื่อนักเรียน', desc: 'นำเข้ารายชื่อนักเรียนจากไฟล์ DMC (ทำภายหลังได้)', icon: 'M17 8l-5-5-5 5 M12 3v12 M5 21h14' },
  { key: 'drive', label: 'เชื่อมต่อ Google Drive', title: 'เชื่อมต่อ Google Drive', desc: 'สำรองและจัดเก็บไฟล์รายงานอัตโนมัติ (ไม่บังคับ)', icon: 'M4 4h16v16H4z M8 8h8v8H8z' },
]

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
  background: '#F5EDE3',
  color: '#6B4F32',
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
  // onboarding wizard
  const [step, setStep] = useState<number>(() => {
    const n = Number(searchParams.get('step'))
    return Number.isFinite(n) && n > 0 ? Math.min(n, ONBOARDING_STEPS.length - 1) : 0
  })
  const [stepSaving, setStepSaving] = useState(false)
  const [dmcImportAction, setDmcImportAction] = useState<DmcImportAction | null>(null)
  const generalFormRef = useRef<HTMLFormElement>(null)
  const loginFormRef = useRef<HTMLFormElement>(null)

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

  // ยังไม่มีโรงเรียน → บังคับกลับขั้นแรก (เลือกโรงเรียน) เสมอ
  useEffect(() => {
    if (!loading && !school.id && step !== 0) setStep(0)
  }, [loading, school.id, step])

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
  const inOnboarding = searchParams.get('onboarding') === '1'
  function afterSchoolChosen() {
    // ผู้ใช้ใหม่ (onboarding) → ไปต่อขั้นตอนที่ 2 พร้อมโหลดข้อมูลโรงเรียนใหม่
    // ผู้ใช้เดิม (กดเปลี่ยนโรงเรียน) → reload ตามปกติ
    if (!school.id || inOnboarding) window.location.assign('/settings/school?onboarding=1&step=1')
    else window.location.reload()
  }
  async function pickSchool(id: string) {
    setBusy(true); setPickerErr(null)
    const { error } = await setMySchool(id)
    if (error) { setBusy(false); setPickerErr(error); return }
    afterSchoolChosen()
  }
  // ข้ามการตั้งค่าครั้งแรก → ใช้ระบบได้ในรอบนี้ (cookie session)
  // ครั้งถัดไปที่ login ถ้าตั้งค่ายังไม่ครบ (ไม่รวมโลโก้/Drive) จะเข้า onboarding อีก
  function skipOnboarding() {
    document.cookie = 'onboarding_skipped=1; path=/; samesite=lax'
    window.location.href = '/dashboard'
  }
  // นำทางระหว่างขั้นตอน (client-side ไม่ reload) — โรงเรียนถูกเลือกแล้วจึงข้ามได้อิสระ
  function goStep(n: number) {
    const clamped = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, n))
    setStep(clamped)
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      u.searchParams.set('onboarding', '1')
      u.searchParams.set('step', String(clamped))
      window.history.replaceState(null, '', u.toString())
      window.scrollTo({ top: 0 })
    }
  }
  function finishOnboarding() {
    window.location.href = '/dashboard'
  }
  // บันทึกข้อมูลทั่วไปในขั้น onboarding แล้วไปต่อ
  async function saveGeneralStep() {
    if (!generalFormRef.current) { goStep(step + 1); return }
    setStepSaving(true); clearAlert()
    const fd = new FormData(generalFormRef.current)
    const updates = Object.fromEntries(
      ['name', 'department', 'area_office', 'district', 'province', 'address', 'phone', 'document_prefix']
        .map(k => [k, fd.get(k) as string | null]),
    )
    const { error } = await saveSchool(school.id || null, updates)
    setStepSaving(false)
    if (error) { notify('error', error); return }
    setSchool(s => ({ ...s, ...updates } as School))
    goStep(step + 1)
  }
  // บันทึกหน้าเข้าสู่ระบบ (รหัสโรงเรียน ฯลฯ) แล้วไปต่อ
  async function saveLoginStep() {
    if (!loginFormRef.current) { goStep(step + 1); return }
    setStepSaving(true); clearAlert()
    const fd = new FormData(loginFormRef.current)
    const updates = Object.fromEntries(
      ['code', 'program_name', 'created_by'].map(k => [k, fd.get(k) as string | null]),
    )
    const { error } = await saveSchool(school.id || null, updates)
    setStepSaving(false)
    if (error) { notify('error', error); return }
    setSchool(s => ({ ...s, ...updates } as School))
    goStep(step + 1)
  }
  // บันทึกผู้บริหาร + หัวหน้ากลุ่มสาระ แล้วไปต่อ
  async function saveLeadersStep() {
    setStepSaving(true); clearAlert()
    const leadersError = (await saveSchoolLeaders({
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
    const headsError = leadersError ? null : (await saveSubjectGroupHeads(
      Object.fromEntries(SUBJECT_GROUPS.map(group => [group, subjectGroupHeads[group] || { name: '', userId: null }])),
    )).error
    setStepSaving(false)
    if (leadersError) { notify('error', leadersError); return }
    if (headsError) { notify('error', headsError); return }
    goStep(step + 1)
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

  if (loading) {
    // ระหว่างโหลดหลังเลือกโรงเรียน ให้ค้างบน onboarding เต็มจอ ไม่เด้งไปเมนูตั้งค่า
    if (inOnboarding) {
      return (
        <div className="onboarding-wrap onboarding-wrap--full onboarding-wrap--wizard">
          <div className="onboarding-orbs" aria-hidden />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', color: 'var(--text-3)', position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>กำลังโหลดการตั้งค่า</div>
              <div style={{ fontSize: 13 }}>เตรียมขั้นตอนตั้งค่าโรงเรียน...</div>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--text-3)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          กำลังโหลด...
        </div>
      </div>
    )
  }

  // ── การ์ดเลือกโรงเรียนจากฐานข้อมูล (onboarding และเปลี่ยนโรงเรียน) ──
  const firstTime = !school.id
  const onboardingMode = firstTime || inOnboarding

  const schoolPickerCard = (
    <>
      {pickerErr && <div className="alert alert-error" style={{ marginBottom: 16 }}>{pickerErr}</div>}
      <div className="onboarding-card">
        <div className="onboarding-body">
          <p style={{ margin: '0 0 14px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55 }}>
            ค้นหาโรงเรียนจากฐานข้อมูล แล้วกดเลือก — ระบบจะผูกบัญชีของคุณกับโรงเรียนนั้นโดยตรง
          </p>
          <div className="onboarding-search">
            <svg className="onboarding-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input className="form-input onboarding-search-input" placeholder="พิมพ์ชื่อโรงเรียน (อย่างน้อย 2 ตัวอักษร)" value={q} onChange={e => doSearch(e.target.value)} autoFocus />
          </div>
          <div className="onboarding-results">
            {results.map(r => (
              <button key={r.id} onClick={() => pickSchool(r.id)} disabled={busy} className="onboarding-result">
                <span className="onboarding-result-avatar" aria-hidden>{r.name?.trim().charAt(0) || '?'}</span>
                <span className="onboarding-result-text">
                  <span className="onboarding-result-name">{r.name}</span>
                  <span className="onboarding-result-meta">{[r.area_office, r.district, r.province].filter(Boolean).join(' · ') || 'ไม่มีข้อมูลพื้นที่'}</span>
                </span>
                <svg className="onboarding-result-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            ))}
            {q.trim().length < 2 && results.length === 0 && (
              <div className="onboarding-empty">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <p>เริ่มพิมพ์ชื่อโรงเรียนเพื่อค้นหาจากฐานข้อมูล</p>
              </div>
            )}
            {q.trim().length >= 2 && results.length === 0 && (
              <div className="onboarding-empty">
                <p style={{ fontWeight: 600, color: 'var(--text-2)' }}>ไม่พบ “{q.trim()}”</p>
                <p style={{ marginTop: 6, fontSize: 13, color: 'var(--text-3)' }}>
                  ให้สำนักงานเขตเพิ่มโรงเรียนในเมนู 「ฐานข้อมูลโรงเรียน」 ก่อน
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )

  // ── Onboarding wizard เต็มจอ (ไม่มี sidebar) ──
  if (onboardingMode) {
    const meta = ONBOARDING_STEPS[step]
    const lastIndex = ONBOARDING_STEPS.length - 1
    const isLast = step === lastIndex
    const canNavigate = Boolean(school.id)
    const progressPct = (step / lastIndex) * 100

    let primaryBtn: React.ReactNode = null
    if (step === 1) primaryBtn = <LoadingButton type="button" loading={stepSaving} onClick={saveGeneralStep} className="btn btn-primary btn-lg">บันทึกและไปต่อ</LoadingButton>
    else if (step === 2) primaryBtn = <LoadingButton type="button" loading={stepSaving} onClick={saveLeadersStep} className="btn btn-primary btn-lg">บันทึกและไปต่อ</LoadingButton>
    else if (step === 3) primaryBtn = <LoadingButton type="button" loading={stepSaving} onClick={saveLoginStep} className="btn btn-primary btn-lg">บันทึกและไปต่อ</LoadingButton>
    else if (step === 4 || step === 5) primaryBtn = <button type="button" onClick={() => goStep(step + 1)} className="btn btn-primary btn-lg">ไปต่อ</button>
    else if (step === 6) {
      if (dmcImportAction?.canImport) {
        primaryBtn = (
          <LoadingButton
            type="button"
            loading={dmcImportAction.importing}
            loadingText="กำลังนำเข้า..."
            className="btn btn-primary btn-lg"
            onClick={async () => {
              const ok = await dmcImportAction.run()
              if (ok) goStep(step + 1)
            }}
          >
            {dmcImportAction.label}
          </LoadingButton>
        )
      } else {
        primaryBtn = (
          <button type="button" className="btn btn-primary btn-lg" disabled title="เลือกและอ่านไฟล์ Excel ก่อน">
            เลือกไฟล์ก่อนนำเข้า
          </button>
        )
      }
    }
    else if (isLast) primaryBtn = <button type="button" onClick={finishOnboarding} className="btn btn-primary btn-lg">เสร็จสิ้น · เข้าสู่ระบบ</button>

    return (
      <div className="onboarding-wrap onboarding-wrap--full onboarding-wrap--wizard">
        <div className="onboarding-orbs" aria-hidden />
        <div className="onboarding-wizard">
          <aside className="wizard-rail">
            <div className="onboarding-brand"><span className="onboarding-brand-dot" />จารย์เสก · Jarn-Sek</div>
            <p className="wizard-rail-title">ตั้งค่าเริ่มต้น</p>
            <ol className="wizard-steps">
              {ONBOARDING_STEPS.map((s, i) => {
                const state = i === step ? 'current' : i < step ? 'done' : 'todo'
                const clickable = canNavigate && i !== step
                return (
                  <li key={s.key} className={`wizard-step is-${state}`}>
                    <button type="button" disabled={!clickable} onClick={() => clickable && goStep(i)} className="wizard-step-btn">
                      <span className="wizard-step-index">
                        {i < step
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                          : i + 1}
                      </span>
                      <span className="wizard-step-label">{s.label}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
            <button
              type="button"
              onClick={skipOnboarding}
              className="wizard-skip-all"
              title="ใช้งานได้ตอนนี้ แต่ถ้ายังตั้งค่าไม่ครบ ครั้งถัดไปที่เข้าสู่ระบบจะกลับมาหน้านี้"
            >
              ตั้งค่าภายหลัง
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
            <p style={{ margin: '6px 4px 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.45 }}>
              ใช้ระบบได้ตอนนี้ · login ครั้งหน้าถ้ายังไม่ครบจะกลับมาตั้งค่าต่อ
            </p>
          </aside>

          <div className="wizard-main">
            <div className="wizard-progress"><div className="wizard-progress-bar" style={{ width: `${progressPct}%` }} /></div>
            <div className="wizard-head">
              <span className="wizard-head-badge">ขั้นตอนที่ {step + 1} จาก {ONBOARDING_STEPS.length}</span>
              <div className="wizard-head-row">
                <span className="wizard-head-icon" aria-hidden>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    {meta.icon.split(' M').map((d, i) => <path key={i} d={i === 0 ? d : `M${d}`} />)}
                  </svg>
                </span>
                <div>
                  <h1 className="wizard-title">{meta.title}</h1>
                  <p className="wizard-desc">{meta.desc}</p>
                </div>
              </div>
            </div>

            <div className="wizard-content">
              {step === 0 && schoolPickerCard}

              {step === 1 && (
                <form ref={generalFormRef} onSubmit={e => { e.preventDefault(); saveGeneralStep() }} className="card-padded school-settings-card">
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
                </form>
              )}

              {step === 2 && (
                <div className="card-padded school-settings-card">
                  <div className="school-form-grid">
                    <div>
                      <StaffPicker label="ผู้อำนวยการ" staff={staff} value={directorUserId} manualValue={directorName} allowManual onManualChange={setDirectorName} onChange={(userId, name) => { setDirectorUserId(userId); setDirectorName(name) }} />
                    </div>
                    <div>
                      <label className="form-label">รองผู้อำนวยการ</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 220px' }}>
                          <StaffPicker staff={staff} value={viceDirectorUserId} manualValue={viceDirectorName} allowManual onManualChange={setViceDirectorName} onChange={(userId, name) => { setViceDirectorUserId(userId); setViceDirectorName(name) }} />
                        </div>
                        <button type="button" className={isViceDirectorActing ? 'btn btn-primary' : 'btn btn-secondary'} style={{ whiteSpace: 'nowrap', marginTop: 26 }} onClick={toggleViceDirectorAsActing} disabled={actingToggleBusy} aria-pressed={isViceDirectorActing}>
                          {actingToggleBusy ? 'กำลังบันทึก...' : isViceDirectorActing ? 'ยกเลิกรักษาการ' : 'ตั้งเป็นรักษาการ ผอ.'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <StaffPicker label="ผู้รักษาการ (ถ้ามี)" staff={staff} value={actingDirectorUserId} manualValue={actingDirector} allowManual onManualChange={setActingDirector} onChange={(userId, name) => { setActingDirectorUserId(userId); setActingDirector(name) }} />
                    </div>
                    <div>
                      <label className="form-label">ตำแหน่งผู้รักษาการ</label>
                      <input value={actingDirectorPosition} onChange={e => setActingDirectorPosition(e.target.value)} className="form-input" placeholder="เช่น ครู, ครูชำนาญการ, รองผู้อำนวยการ" />
                    </div>
                    <div>
                      <StaffPicker label="หัวหน้าฝ่ายวิชาการ" staff={staff} value={academicHeadUserId} manualValue={academicHeadName} allowManual onManualChange={setAcademicHeadName} onChange={(userId, name) => { setAcademicHeadUserId(userId); setAcademicHeadName(name) }} />
                    </div>
                    <div>
                      <StaffPicker label="หัวหน้างานวัดผล" staff={staff} value={measurementHeadUserId} manualValue={measurementHeadName} allowManual onManualChange={setMeasurementHeadName} onChange={(userId, name) => { setMeasurementHeadUserId(userId); setMeasurementHeadName(name) }} />
                    </div>
                  </div>
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    <div className="section-title" style={{ marginBottom: 6 }}>หัวหน้ากลุ่มสาระการเรียนรู้</div>
                    <p style={{ margin: '0 0 16px', color: 'var(--text-3)', fontSize: 13 }}>ใช้ลงนามหน้าปก ปพ.5 รายวิชา — กำหนดชื่อตามกลุ่มสาระ 8 กลุ่ม</p>
                    <div className="school-form-grid">
                      {SUBJECT_GROUPS.map(group => (
                        <div key={group}>
                          <StaffPicker label={group} staff={staff} value={subjectGroupHeads[group]?.userId ?? null} manualValue={subjectGroupHeads[group]?.name || ''} allowManual placeholder="ค้นหาชื่อบุคลากร..." onManualChange={name => setSubjectGroupHeads(prev => ({ ...prev, [group]: { name, userId: null } }))} onChange={(userId, name) => setSubjectGroupHeads(prev => ({ ...prev, [group]: { name, userId } }))} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <form ref={loginFormRef} onSubmit={e => { e.preventDefault(); saveLoginStep() }} className="card-padded school-settings-card">
                  <div className="school-form-grid school-form-grid-side">
                    <div>
                      <label className="form-label">URL โรงเรียน *</label>
                      <input name="code" defaultValue={school.code || ''} className="form-input" placeholder="เช่น bannong" pattern="[a-z0-9-]+" />
                      <p className="field-hint">ใช้ a-z, 0-9 และ - เท่านั้น · เป็นส่วนท้ายของลิงก์ /school/.../login</p>
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
                </form>
              )}

              {step === 4 && (
                <div className="card-padded school-settings-card">
                  <div className="school-upload-stack">
                    <ImageUploadBox label="โลโก้โรงเรียน" value={school.logo_url || null} type="logo" schoolId={school.id} onUploaded={url => setSchool(s => ({ ...s, logo_url: url }))} />
                    <ImageUploadBox label="ตราโรงเรียน" value={school.stamp_url || null} type="stamp" schoolId={school.id} onUploaded={url => setSchool(s => ({ ...s, stamp_url: url }))} />
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="wizard-import">
                  <p className="wizard-guide-note" style={{ margin: '0 0 8px' }}>
                    กรอกปีการศึกษา ติ๊กชั้นที่เปิดสอนและจำนวนห้อง แล้วกดบันทึกครั้งเดียว — หรือข้ามไปก่อน แล้วให้ขั้น “นำเข้านักเรียน” สร้างห้องจากไฟล์ก็ได้
                  </p>
                  <ClassroomManager embedded />
                </div>
              )}

              {step === 6 && (
                <div className="wizard-import">
                  <p className="wizard-guide-note" style={{ margin: '0 0 8px' }}>
                    นำเข้ารายชื่อนักเรียนจากไฟล์ DMC ได้เลย — โหมด “ทั้งโรงเรียน” จะสร้างห้องเรียนที่ขาดให้อัตโนมัติ · ขั้นตอนนี้ไม่บังคับ ทำภายหลังได้
                  </p>
                  <DmcImportTool
                    hideImportButton
                    onActionChange={setDmcImportAction}
                  />
                </div>
              )}

              {step === 7 && (
                <div className="card-padded school-settings-card school-settings-card--drive">
                  <GoogleDriveIntegrationPanel active={step === 7} />
                </div>
              )}
            </div>

            <div className="wizard-footer">
              {step > 0
                ? <button type="button" onClick={() => goStep(step - 1)} className="btn btn-secondary">← ย้อนกลับ</button>
                : <span />}
              <div className="wizard-footer-right">
                {step > 0 && !isLast && (
                  <button type="button" onClick={() => goStep(step + 1)} className="onboarding-later">ข้ามขั้นตอนนี้</button>
                )}
                {primaryBtn}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── กดเปลี่ยนโรงเรียน (มีโรงเรียนอยู่แล้ว) → ตัวเลือกแบบเรียบง่าย ไม่เต็มจอ ──
  if (reselect) return (
    <div className="onboarding-wrap">
      <div className="onboarding-inner">
        <div className="onboarding-hero">
          <div className="onboarding-badge" aria-hidden>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /><path d="M9 9h.01M15 9h.01M9 12h.01M15 12h.01" />
            </svg>
          </div>
          <h1 className="onboarding-title">เปลี่ยนโรงเรียน</h1>
          <p className="onboarding-subtitle">ค้นหาและเลือกโรงเรียนจากฐานข้อมูลที่ต้องการใช้งาน</p>
        </div>
        {schoolPickerCard}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button onClick={() => setReselect(false)} className="onboarding-back">← กลับไปหน้าตั้งค่าโรงเรียน</button>
        </div>
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
                  <div className="section-title">สร้างหน้า login โรงเรียน</div>
                  <p>ลิงก์สำหรับครูและบุคลากรในโรงเรียน</p>
                </div>
              </div>
              <div className="school-form-grid school-form-grid-side">
                <div>
                  <label className="form-label">URL โรงเรียน *</label>
                  <input name="code" defaultValue={school.code || ''} className="form-input" placeholder="เช่น bannong" pattern="[a-z0-9-]+" />
                  <p className="field-hint">ใช้ a-z, 0-9 และ - เท่านั้น · เป็นส่วนท้ายของลิงก์ /school/.../login</p>
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
