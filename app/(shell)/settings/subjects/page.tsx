'use client'
import { useState, useEffect } from 'react'
import {
  fetchSubjects,
  saveSubject,
  deleteSubject,
  bulkUpsertSubjects,
  syncSubjectsFromGlobal,
  fetchEvaluationSettings,
  createEvaluationSetting,
  saveEvaluationSetting,
  resetEvaluationSettings,
  fetchClubSettingsInit,
  saveClub,
  deleteClub,
  fetchClubAssignments,
  saveClubAssignments,
  fetchClassSubjectInit,
  fetchClassroomsLite,
  fetchClassSubjects,
  addClassSubjects,
  removeClassSubject,
  removeAllClassSubjects,
  reorderClassSubjects,
} from '../actions'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'
import { type EvaluationKind, type EvaluationSetting } from '@/lib/evaluation-settings'

type Subject = {
  id: string
  code: string
  name: string
  short_name: string | null
  subject_group: string
  type: string
  hours_per_year: number
  credits: number
  max_score: number
}

type SubjectSettingsTab = 'subjects' | 'class-subjects' | 'clubs' | 'activities'
type SubjectSettingsTabItem = { id: SubjectSettingsTab | 'score-config'; label: string; desc: string }
type Club = {
  id: string
  code: string
  name: string
  short_name: string | null
  description: string | null
  advisor_name: string | null
  max_students: number | null
  is_active: boolean
}
type ClubYear = { id: string; year_be: number; is_active: boolean }
type ClubClassroom = { id: string; level: string; room: number; academic_year_id: string }
type ClubStudent = { id: string; student_number: number; prefix: string | null; first_name: string; last_name: string; status: string }
type ClassSubjectItem = { id: string; subject_id: string; teacher_id: string | null; order_number: number }

// ⚠️ ต้องตรงกับ CHECK constraint subjects_group_check ใน 001_initial_schema.sql (8 กลุ่ม)
const SUBJECT_GROUPS = [
  'ภาษาไทย',
  'คณิตศาสตร์',
  'วิทยาศาสตร์และเทคโนโลยี',
  'สังคมศึกษา ศาสนา และวัฒนธรรม',
  'สุขศึกษาและพลศึกษา',
  'ศิลปะ',
  'การงานอาชีพ',
  'ภาษาต่างประเทศ',
]

const GROUP_COLOR: Record<string, string> = {
  'ภาษาไทย': '#DB2777',
  'คณิตศาสตร์': '#8B6B45',
  'วิทยาศาสตร์และเทคโนโลยี': '#059669',
  'สังคมศึกษา ศาสนา และวัฒนธรรม': '#D97706',
  'สุขศึกษาและพลศึกษา': '#DC2626',
  'ศิลปะ': '#C49212',
  'การงานอาชีพ': '#0891B2',
  'ภาษาต่างประเทศ': '#8B6B45',
}

const empty = {
  id: '', code: '', name: '', short_name: '', subject_group: SUBJECT_GROUPS[0],
  type: 'พื้นฐาน', hours_per_year: 0, credits: 0, max_score: 100,
}

const SETTINGS_TABS: SubjectSettingsTabItem[] = [
  { id: 'subjects', label: 'ข้อมูลรายวิชา', desc: 'แม่แบบรายวิชาทั้งหมดของสถานศึกษา' },
  { id: 'class-subjects', label: 'กำหนดวิชาเรียน', desc: 'เลือกวิชาที่เปิดสอนให้แต่ละห้อง' },
  { id: 'score-config', label: 'สัดส่วนคะแนน', desc: 'กำหนดสัดส่วนคะแนนแต่ละรายวิชา' },
  { id: 'clubs', label: 'ชุมนุม', desc: 'รายการชุมนุมและเลือกให้นักเรียน' },
  { id: 'activities', label: 'กิจกรรมพัฒนาผู้เรียน', desc: 'แนะแนว ลูกเสือ ชุมนุม จิตอาสา' },
]

// อักษรนำหน้ารหัสวิชา → กลุ่มสาระ (ประวัติศาสตร์ 'ส' จัดเข้ากลุ่มสังคม)
const CODE_GROUP: Record<string, string> = {
  'ท': 'ภาษาไทย', 'ค': 'คณิตศาสตร์', 'ว': 'วิทยาศาสตร์และเทคโนโลยี',
  'ส': 'สังคมศึกษา ศาสนา และวัฒนธรรม', 'พ': 'สุขศึกษาและพลศึกษา',
  'ศ': 'ศิลปะ', 'ง': 'การงานอาชีพ', 'อ': 'ภาษาต่างประเทศ',
}
function deriveGroup(code: string): string {
  return CODE_GROUP[code.trim()[0]] || 'ภาษาไทย'
}

/**
 * รหัสวิชา สพฐ. แบบ ท11101 = อักษร + 5 หลัก
 * - หลักที่ 1 หลังอักษร: ระดับ (1=ประถม, 2=ม.ต้น, 3=ม.ปลาย)
 * - หลักที่ 2: ชั้นในระดับนั้น (ป.1–6 หรือ ม.1–3)
 * ตัวอย่าง: ท11101 → ป.1 · ท12101 → ป.2 · ค21101 → ม.1
 */
function gradeFromSubjectCode(code: string): number | null {
  const digits = String(code || '').replace(/\D/g, '')
  if (digits.length < 2) return null
  const n = Number(digits[1])
  return n >= 1 && n <= 6 ? n : null
}

function bandFromSubjectCode(code: string): 'ประถม' | 'ม.ต้น' | 'ม.ปลาย' | null {
  const digits = String(code || '').replace(/\D/g, '')
  if (!digits.length) return null
  if (digits[0] === '1') return 'ประถม'
  if (digits[0] === '2') return 'ม.ต้น'
  if (digits[0] === '3') return 'ม.ปลาย'
  return null
}

function gradeLabelFromCode(code: string): string {
  const band = bandFromSubjectCode(code)
  const grade = gradeFromSubjectCode(code)
  if (!band || !grade) return '—'
  if (band === 'ประถม') return `ป.${grade}`
  if (band === 'ม.ต้น') return `ม.${grade}`
  return `ม.${grade + 3}`
}

function gradeLabelFromSubject(s: { code: string; name?: string }): string {
  const fromCode = gradeLabelFromCode(s.code)
  if (fromCode && fromCode !== '—') return fromCode
  const m = String(s.name || '').match(/(\d+)\s*$/)
  return m ? `ป.${m[1]}` : '—'
}

// ───────── โหมดวางแบบตาราง (Excel-like) ─────────
type GridRow = { code: string; name: string; type: string; hours: string }
const GRID_COLS = [
  { key: 'code' as const,  label: 'รหัสวิชา', w: 110 },
  { key: 'name' as const,  label: 'ชื่อวิชา', w: 260 },
  { key: 'type' as const,  label: 'ประเภท', w: 100 },
  { key: 'hours' as const, label: 'ชม./ปี', w: 80 },
]
const blankRow = (): GridRow => ({ code: '', name: '', type: '', hours: '' })
const emptyClub = {
  id: '',
  code: '',
  name: '',
  short_name: '',
  description: '',
  advisor_name: '',
  max_students: '',
  is_active: true,
}

type ParsedRow = {
  code: string; name: string; short_name: string | null; subject_group: string
  type: string; hours_per_year: number; credits: number; max_score: number
}

function gridToRows(grid: GridRow[]): ParsedRow[] {
  const out: ParsedRow[] = []
  const seen = new Set<string>()
  for (const row of grid) {
    const code = row.code.trim()
    const name = row.name.trim()
    if (!code || !name || !/\d/.test(code)) continue   // ข้ามแถวว่าง/หัวตาราง
    const hours = parseInt((row.hours || '').replace(/[^0-9]/g, '')) || 0
    const r: ParsedRow = {
      code, name, short_name: null,
      subject_group: deriveGroup(code),
      type: row.type.includes('เพิ่ม') ? 'เพิ่มเติม' : 'พื้นฐาน',
      hours_per_year: hours,
      credits: Math.round((hours / 40) * 2) / 2,
      max_score: 100,
    }
    if (seen.has(code)) { out[out.findIndex(x => x.code === code)] = r }  // รหัสซ้ำ = เอาอันหลัง
    else { seen.add(code); out.push(r) }
  }
  return out
}

function levelNumberFromLabel(level: string) {
  const match = level.match(/\d+/)
  return match ? Number(match[0]) : null
}

function subjectLevelNumber(subject: Subject) {
  const fromCode = gradeFromSubjectCode(subject.code)
  if (fromCode != null) return fromCode
  const nameMatch = subject.name.match(/(\d+)\s*$/)
  return nameMatch ? Number(nameMatch[1]) : null
}

const CURRICULUM_GROUP_ORDER: Record<string, number> = {
  'ภาษาไทย': 10,
  'คณิตศาสตร์': 20,
  'วิทยาศาสตร์และเทคโนโลยี': 30,
  'สังคมศึกษา ศาสนา และวัฒนธรรม': 40,
  'สุขศึกษาและพลศึกษา': 60,
  'ศิลปะ': 70,
  'การงานอาชีพ': 80,
  'ภาษาต่างประเทศ': 90,
}

function curriculumSubjectRank(subject: Subject) {
  const levelRank = subjectLevelNumber(subject) ?? 99
  const groupRank = CURRICULUM_GROUP_ORDER[subject.subject_group] ?? 900
  const historyOffset = subject.code.startsWith('ส') && (subject.code.endsWith('102') || subject.name.includes('ประวัติ')) ? 10 : 0
  const antiCorruptionOffset = subject.name.includes('ต้านทุจริต') ? 80 : 0
  const typeOffset = subject.type.includes('เพิ่ม') ? 500 : 0
  return (levelRank * 1000) + typeOffset + groupRank + historyOffset + antiCorruptionOffset
}

function sortSubjectsByCurriculum(subjects: Subject[]) {
  return subjects.slice().sort((a, b) => {
    const rankDiff = curriculumSubjectRank(a) - curriculumSubjectRank(b)
    if (rankDiff !== 0) return rankDiff
    return a.code.localeCompare(b.code, 'th')
  })
}

export default function SubjectsPage() {
  const [activeTab, setActiveTab] = useState<SubjectSettingsTab>('subjects')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<typeof empty>(empty)
  const [search, setSearch] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [formCode, setFormCode] = useState('')
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const [evaluationSettings, setEvaluationSettings] = useState<Record<EvaluationKind, EvaluationSetting[]>>({
    activities: [],
    character: [],
    reading: [],
    competency: [],
  })
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [editingSetting, setEditingSetting] = useState<EvaluationSetting | null>(null)
  const [settingFormMode, setSettingFormMode] = useState<'add' | 'edit'>('edit')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [clubs, setClubs] = useState<Club[]>([])
  const [clubYears, setClubYears] = useState<ClubYear[]>([])
  const [clubClassrooms, setClubClassrooms] = useState<ClubClassroom[]>([])
  const [clubYearId, setClubYearId] = useState('')
  const [clubClassroomId, setClubClassroomId] = useState('')
  const [clubStudents, setClubStudents] = useState<ClubStudent[]>([])
  const [clubAssignments, setClubAssignments] = useState<Record<string, string>>({})
  const [loadingClubs, setLoadingClubs] = useState(false)
  const [clubSaving, setClubSaving] = useState(false)
  const [bulkClubId, setBulkClubId] = useState('')
  const [showClubForm, setShowClubForm] = useState(false)
  const [editingClub, setEditingClub] = useState(emptyClub)
  const [classSubjectYears, setClassSubjectYears] = useState<ClubYear[]>([])
  const [classSubjectClassrooms, setClassSubjectClassrooms] = useState<ClubClassroom[]>([])
  const [classSubjectYearId, setClassSubjectYearId] = useState('')
  const [classSubjectClassroomId, setClassSubjectClassroomId] = useState('')
  const [classSubjectItems, setClassSubjectItems] = useState<ClassSubjectItem[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [loadingClassSubjects, setLoadingClassSubjects] = useState(false)
  const [classSubjectSaving, setClassSubjectSaving] = useState(false)
  const [classSubjectAction, setClassSubjectAction] = useState<'add' | 'auto' | 'remove' | 'remove-all' | null>(null)
  const [canManageClassSubjects, setCanManageClassSubjects] = useState(false)

  const [showPaste, setShowPaste] = useState(false)
  const [grid, setGrid] = useState<GridRow[]>(() => Array.from({ length: 12 }, blankRow))
  const [pasteSaving, setPasteSaving] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const validRows = gridToRows(grid)
  const evaluationKind = activeTab === 'activities' ? 'activities' as const : null
  const currentSettings = evaluationKind ? evaluationSettings[evaluationKind] : []
  const displayedSettings = currentSettings
  const filteredClubClassrooms = clubClassrooms.filter(classroom => !clubYearId || classroom.academic_year_id === clubYearId)
  const activeClubs = clubs.filter(club => club.is_active)
  const classSubjectMap = Object.fromEntries(subjects.map(subject => [subject.id, subject]))
  const assignedSubjectIds = new Set(classSubjectItems.map(item => item.subject_id))
  const selectedClassSubjectClassroom = classSubjectClassrooms.find(classroom => classroom.id === classSubjectClassroomId)
  const selectedClassLevelNumber = selectedClassSubjectClassroom ? levelNumberFromLabel(selectedClassSubjectClassroom.level) : null
  const availableClassSubjects = sortSubjectsByCurriculum(subjects.filter(subject => !assignedSubjectIds.has(subject.id)))
  const autoClassSubjects = selectedClassLevelNumber === null
    ? []
    : availableClassSubjects.filter(subject => subjectLevelNumber(subject) === selectedClassLevelNumber)
  const clubCounts = clubStudents.reduce((acc: Record<string, number>, student) => {
    const clubId = clubAssignments[student.id]
    if (clubId) acc[clubId] = (acc[clubId] || 0) + 1
    return acc
  }, {})

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!evaluationKind) return
    void loadEvaluationSettings(evaluationKind)
  }, [evaluationKind])

  useEffect(() => {
    if (activeTab !== 'clubs') return
    void loadClubInit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'class-subjects') return
    void loadClassSubjectInit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'class-subjects' || !classSubjectYearId) return
    void loadClassSubjectClassrooms(classSubjectYearId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, classSubjectYearId])

  useEffect(() => {
    if (activeTab !== 'class-subjects' || !classSubjectClassroomId) return
    void loadClassSubjectItems(classSubjectClassroomId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, classSubjectClassroomId])

  useEffect(() => {
    if (activeTab !== 'clubs' || !clubYearId || !clubClassroomId) return
    void loadClubAssignments(clubClassroomId, clubYearId)
  }, [activeTab, clubYearId, clubClassroomId])

  async function load() {
    const data = await fetchSubjects()
    setSubjects(data as Subject[])
    setLoading(false)
  }

  async function loadEvaluationSettings(kind: EvaluationKind) {
    setLoadingSettings(true)
    const result = await fetchEvaluationSettings(kind)
    setEvaluationSettings(prev => ({ ...prev, [kind]: result.settings }))
    setLoadingSettings(false)
    if (result.error) notify('error', result.error)
  }

  function openAdd() {
    setEditing(empty)
    setFormCode('')
    setShowForm(true)
    setShowPaste(false)
  }
  function openEdit(s: Subject) {
    setEditing({ ...s, short_name: s.short_name || '' })
    setFormCode(s.code)
    setShowForm(true)
    setShowPaste(false)
  }
  function openAddClub() { setEditingClub(emptyClub); setShowClubForm(true) }
  function openEditClub(club: Club) {
    setEditingClub({
      id: club.id,
      code: club.code,
      name: club.name,
      short_name: club.short_name || '',
      description: club.description || '',
      advisor_name: club.advisor_name || '',
      max_students: club.max_students == null ? '' : String(club.max_students),
      is_active: club.is_active,
    })
    setShowClubForm(true)
  }
  function openAddEvaluationSetting() {
    if (!evaluationKind) return
    const nextOrder = currentSettings.length ? Math.max(...currentSettings.map(setting => setting.sort_order)) + 1 : 1
    setSettingFormMode('add')
    setEditingSetting({
      kind: evaluationKind,
      field_key: '',
      label: '',
      short_label: `${nextOrder}`,
      description: null,
      group_label: SETTINGS_TABS.find(tab => tab.id === evaluationKind)?.label || '',
      sort_order: nextOrder,
      is_active: true,
      score_type: 'pass_fail',
      max_score: 1,
      is_required: false,
      hours_per_year: 0,
    })
  }

  function openEditEvaluationSetting(setting: EvaluationSetting) {
    setSettingFormMode('edit')
    setEditingSetting(setting)
  }

  async function loadClubInit() {
    setLoadingClubs(true); clearAlert()
    const result = await fetchClubSettingsInit()
    const years = result.years as ClubYear[]
    const classrooms = result.classrooms as ClubClassroom[]
    setClubYears(years)
    setClubClassrooms(classrooms)
    setClubs(result.clubs as Club[])
    const activeYear = years.find(year => year.is_active) || years[0]
    const nextYearId = clubYearId || activeYear?.id || ''
    const firstClassroom = classrooms.find(classroom => classroom.academic_year_id === nextYearId) || classrooms[0]
    setClubYearId(nextYearId)
    setClubClassroomId(prev => prev || firstClassroom?.id || '')
    setLoadingClubs(false)
    if (result.error) notify('error', result.error)
  }

  async function loadClubAssignments(classroomId: string, yearId: string) {
    const result = await fetchClubAssignments(classroomId, yearId)
    setClubStudents(result.students as ClubStudent[])
    setClubAssignments(result.assignments as Record<string, string>)
    if (result.error) notify('error', result.error)
  }

  async function loadClassSubjectInit() {
    setLoadingClassSubjects(true); clearAlert()
    const result = await fetchClassSubjectInit()
    const years = result.years as ClubYear[]
    setCanManageClassSubjects(Boolean(result.canManage))
    setClassSubjectYears(years)
    setSubjects(result.subjects as Subject[])
    const activeYear = years.find(year => year.is_active) || years[0]
    setClassSubjectYearId(prev => prev || activeYear?.id || '')
    setLoadingClassSubjects(false)
  }

  async function loadClassSubjectClassrooms(yearId: string) {
    setLoadingClassSubjects(true)
    const classrooms = await fetchClassroomsLite(yearId) as ClubClassroom[]
    setClassSubjectClassrooms(classrooms)
    setClassSubjectClassroomId(prev => classrooms.some(classroom => classroom.id === prev) ? prev : classrooms[0]?.id || '')
    setLoadingClassSubjects(false)
  }

  async function loadClassSubjectItems(classroomId: string) {
    setLoadingClassSubjects(true)
    setSelectedSubjectId('')
    let items = await fetchClassSubjects(classroomId) as ClassSubjectItem[]
    if (items.length > 0) {
      const { error } = await reorderClassSubjects(classroomId)
      if (!error) items = await fetchClassSubjects(classroomId) as ClassSubjectItem[]
    }
    setClassSubjectItems(items)
    setLoadingClassSubjects(false)
  }

  async function handleAddClassSubject(subjectIds: string[], successText: (added: number) => string) {
    if (!classSubjectClassroomId || !classSubjectYearId) return
    setClassSubjectSaving(true); clearAlert()
    try {
      const { error, added } = await addClassSubjects(classSubjectClassroomId, classSubjectYearId, subjectIds)
      if (error) { notify('error', error); return }
      notify('success', successText(added))
      await loadClassSubjectItems(classSubjectClassroomId)
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'เพิ่มรายวิชาไม่สำเร็จ')
    } finally {
      setClassSubjectSaving(false)
      setClassSubjectAction(null)
    }
  }

  async function handleAddSelectedClassSubject() {
    if (!selectedSubjectId) return
    setClassSubjectAction('add')
    await handleAddClassSubject([selectedSubjectId], added => added ? 'เพิ่มรายวิชาให้ห้องเรียนเรียบร้อย' : 'รายวิชานี้มีอยู่ในห้องแล้ว')
  }

  async function handleAutoAddClassSubjects() {
    setClassSubjectAction('auto')
    await handleAddClassSubject(autoClassSubjects.map(subject => subject.id), added => `เพิ่มอัตโนมัติ ${added} วิชาเรียบร้อย`)
  }

  async function handleRemoveClassSubject(item: ClassSubjectItem) {
    const subject = classSubjectMap[item.subject_id]
    if (!confirm(`ลบ "${subject ? `${subject.code} ${subject.name}` : 'รายวิชา'}" ออกจากห้องนี้?`)) return
    setClassSubjectSaving(true); setClassSubjectAction('remove'); clearAlert()
    try {
      const { error } = await removeClassSubject(item.id)
      if (error) { notify('error', error); return }
      notify('success', 'ลบรายวิชาออกจากห้องเรียบร้อย')
      await loadClassSubjectItems(classSubjectClassroomId)
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'ลบรายวิชาไม่สำเร็จ')
    } finally {
      setClassSubjectSaving(false)
      setClassSubjectAction(null)
    }
  }

  async function handleRemoveAllClassSubjects() {
    if (!classSubjectClassroomId || classSubjectItems.length === 0) return
    if (!confirm(`ลบรายวิชาทั้งหมด ${classSubjectItems.length} วิชาออกจากห้องนี้?`)) return
    setClassSubjectSaving(true); setClassSubjectAction('remove-all'); clearAlert()
    try {
      const { error, deleted } = await removeAllClassSubjects(classSubjectClassroomId)
      if (error) { notify('error', error); return }
      notify('success', `ลบรายวิชาออกจากห้อง ${deleted} วิชาเรียบร้อย`)
      await loadClassSubjectItems(classSubjectClassroomId)
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'ลบทั้งหมดไม่สำเร็จ')
    } finally {
      setClassSubjectSaving(false)
      setClassSubjectAction(null)
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true); clearAlert()
    const fd = new FormData(e.currentTarget)
    const payload = {
      code: (fd.get('code') as string).trim(),
      name: (fd.get('name') as string).trim(),
      short_name: (fd.get('short_name') as string).trim() || null,
      subject_group: fd.get('subject_group') as string,
      type: fd.get('type') as string,
      hours_per_year: Number(fd.get('hours_per_year') || 0),
      credits: Number(fd.get('credits') || 0),
      max_score: Number(fd.get('max_score') || 100),
    }
    const { error } = await saveSubject(editing.id || null, payload)
    setSaving(false)
    if (error) { notify('error', error); return }
    notify('success', editing.id ? 'แก้ไขรายวิชาเรียบร้อย' : 'เพิ่มรายวิชาเรียบร้อย')
    setShowForm(false); load()
  }

  async function handleDelete(s: Subject) {
    if (!confirm(`ลบรายวิชา "${s.code} ${s.name}" ?`)) return
    const { error } = await deleteSubject(s.id)
    if (error) { notify('error', error); return }
    load()
  }

  // ── grid helpers ──
  function setCell(r: number, key: keyof GridRow, val: string) {
    setGrid(g => { const n = [...g]; n[r] = { ...n[r], [key]: val }; return n })
  }
  function onCellPaste(r: number, c: number, e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return  // ค่าเดียว → วางปกติ
    e.preventDefault()
    const lines = text.replace(/\r/g, '').split('\n')
    while (lines.length && lines[lines.length - 1] === '') lines.pop()
    setGrid(g => {
      const n = [...g]
      lines.forEach((line, ri) => {
        const cells = line.split('\t')
        const rowIdx = r + ri
        while (n.length <= rowIdx) n.push(blankRow())
        cells.forEach((val, ci) => {
          const colIdx = c + ci
          if (colIdx < GRID_COLS.length) n[rowIdx] = { ...n[rowIdx], [GRID_COLS[colIdx].key]: val.trim() }
        })
      })
      return n
    })
  }
  function clearGrid() { setGrid(Array.from({ length: 12 }, blankRow)) }

  async function handleBulkSave() {
    setPasteSaving(true); clearAlert()
    const { error, count } = await bulkUpsertSubjects(validRows)
    setPasteSaving(false)
    if (error) { notify('error', error); return }
    notify('success', `เพิ่ม/อัปเดต ${count} วิชาเรียบร้อย`)
    setShowPaste(false); clearGrid(); load()
  }

  async function handleSyncGlobal() {
    if (!confirm('ใช้โครงสร้างรายวิชากลางเข้าโรงเรียนนี้?\nวิชาที่มีรหัสซ้ำจะถูกอัปเดต')) return
    setSyncBusy(true); clearAlert()
    const { error, count } = await syncSubjectsFromGlobal()
    setSyncBusy(false)
    if (error) { notify('error', error); return }
    notify('success', `ใช้จากข้อมูลกลางแล้ว ${count} รายวิชา`)
    load()
  }

  async function handleClubSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setClubSaving(true); clearAlert()
    const fd = new FormData(e.currentTarget)
    const { error } = await saveClub(editingClub.id || null, {
      code: String(fd.get('code') || ''),
      name: String(fd.get('name') || ''),
      short_name: String(fd.get('short_name') || ''),
      description: String(fd.get('description') || ''),
      advisor_name: String(fd.get('advisor_name') || ''),
      max_students: String(fd.get('max_students') || ''),
      is_active: fd.get('is_active') === 'on',
    })
    setClubSaving(false)
    if (error) { notify('error', error); return }
    notify('success', editingClub.id ? 'แก้ไขชุมนุมเรียบร้อย' : 'เพิ่มชุมนุมเรียบร้อย')
    setShowClubForm(false)
    await loadClubInit()
  }

  async function handleClubDelete(club: Club) {
    if (!confirm(`ลบชุมนุม "${club.code} ${club.name}" ?`)) return
    const { error } = await deleteClub(club.id)
    if (error) { notify('error', error); return }
    notify('success', 'ลบชุมนุมเรียบร้อย')
    await loadClubInit()
  }

  function setStudentClub(studentId: string, clubId: string) {
    setClubAssignments(prev => ({ ...prev, [studentId]: clubId }))
  }

  function applyClubToClassroom() {
    setClubAssignments(prev => ({
      ...prev,
      ...Object.fromEntries(clubStudents.map(student => [student.id, bulkClubId])),
    }))
    const club = clubs.find(item => item.id === bulkClubId)
    notify('success', bulkClubId ? `เลือก ${club?.name || 'ชุมนุม'} ให้ทั้งห้องแล้ว สามารถแก้รายคนต่อได้` : 'ล้างชุมนุมทั้งห้องแล้ว สามารถแก้รายคนต่อได้')
  }

  async function handleClubAssignmentsSave() {
    if (!clubYearId) return
    setClubSaving(true); clearAlert()
    const payload = clubStudents.map(student => ({
      student_id: student.id,
      club_id: clubAssignments[student.id] || null,
    }))
    const { error, count } = await saveClubAssignments(clubYearId, payload)
    setClubSaving(false)
    if (error) { notify('error', error); return }
    notify('success', `บันทึกชุมนุมนักเรียน ${count} คนเรียบร้อย`)
  }

  async function handleSettingSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingSetting || !evaluationKind) return
    setSettingsSaving(true); clearAlert()
    const fd = new FormData(e.currentTarget)

    const payload = {
      label: String(fd.get('label') || ''),
      short_label: String(fd.get('short_label') || ''),
      description: String(fd.get('description') || ''),
      group_label: String(fd.get('group_label') || ''),
      sort_order: Number(fd.get('sort_order') || editingSetting.sort_order),
      is_active: fd.get('is_active') === 'on',
      ...(evaluationKind === 'activities'
        ? { hours_per_year: Math.max(0, Number(fd.get('hours_per_year') || 0)) }
        : {}),
    }
    const { error } = editingSetting.id
      ? await saveEvaluationSetting(editingSetting.id, payload)
      : await createEvaluationSetting(evaluationKind, payload)
    setSettingsSaving(false)
    if (error) { notify('error', error); return }
    notify('success', editingSetting.id ? 'บันทึกการตั้งค่าเรียบร้อย' : 'เพิ่มข้อประเมินเรียบร้อย')
    setEditingSetting(null)
    await loadEvaluationSettings(evaluationKind)
  }

  async function toggleSetting(setting: EvaluationSetting) {
    if (!setting.id || !evaluationKind) return
    const { error } = await saveEvaluationSetting(setting.id, { ...setting, is_active: !setting.is_active })
    if (error) { notify('error', error); return }
    await loadEvaluationSettings(evaluationKind)
  }

  async function moveSetting(setting: EvaluationSetting, direction: -1 | 1) {
    if (!evaluationKind || !setting.id) return
    const index = currentSettings.findIndex(item => item.id === setting.id)
    const swapWith = currentSettings[index + direction]
    if (!swapWith?.id) return
    setSettingsSaving(true); clearAlert()
    const [first, second] = await Promise.all([
      saveEvaluationSetting(setting.id, { ...setting, sort_order: swapWith.sort_order }),
      saveEvaluationSetting(swapWith.id, { ...swapWith, sort_order: setting.sort_order }),
    ])
    setSettingsSaving(false)
    const error = first.error || second.error
    if (error) { notify('error', error); return }
    await loadEvaluationSettings(evaluationKind)
  }

  async function handleResetSettings() {
    if (!evaluationKind || !confirm('คืนค่าการตั้งค่าประเมินแท็บนี้กลับเป็นค่าเริ่มต้น?')) return
    setSettingsSaving(true); clearAlert()
    const { error } = await resetEvaluationSettings(evaluationKind)
    setSettingsSaving(false)
    if (error) { notify('error', error); return }
    notify('success', 'คืนค่าเริ่มต้นเรียบร้อย')
    setEditingSetting(null)
    await loadEvaluationSettings(evaluationKind)
  }

  const gradeOptions = (() => {
    const set = new Set<string>()
    for (const s of subjects) {
      const label = gradeLabelFromSubject(s)
      if (label !== '—') set.add(label)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'th'))
  })()

  const filtered = sortSubjectsByCurriculum(subjects.filter(s => {
    const q = search.trim().toLowerCase()
    const matchQ = !q ||
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.subject_group.includes(search)
    const matchGrade = !filterGrade || gradeLabelFromSubject(s) === filterGrade
    return matchQ && matchGrade
  }))

  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  return (
    <div className="page-stack">
      <AlertModal />

      <div className="school-settings-tab-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="school-settings-tabs" role="tablist" aria-label="ตั้งค่าข้อมูลรายวิชาและการประเมิน">
            {SETTINGS_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => {
                  if (tab.id === 'score-config') {
                    window.location.href = '/score-config'
                    return
                  }
                  setActiveTab(tab.id)
                }}
                className={`school-settings-tab ${activeTab === tab.id ? 'is-active' : ''}`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── โหมดวางแบบตาราง ── */}
      {activeTab === 'subjects' && showPaste && (
        <div className="modal-backdrop" onClick={() => !pasteSaving && setShowPaste(false)}>
          <div className="modal-card" style={{ maxWidth: 1100, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}>วางจากตาราง</div>
                <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.55 }}>
                  คัดลอกจาก Excel แล้ว <b>คลิกช่องมุมซ้ายบน → Ctrl+V</b> · คอลัมน์: รหัส · ชื่อ · ประเภท · ชม./ปี
                  <br />
                  ชั้นอ่านจากรหัสอัตโนมัติ เช่น <code>ท11101</code> = ป.1 · <code>ท12101</code> = ป.2 · กลุ่มสาระจากตัวอักษรนำ
                </p>
              </div>
              <button type="button" onClick={() => { setShowPaste(false); clearGrid() }} disabled={pasteSaving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                ปิด
              </button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)' }}>
                    <th style={{ width: 36, padding: '8px 6px', color: 'var(--text-3)', fontWeight: 500, fontSize: 12 }}>#</th>
                    {GRID_COLS.map(c => (
                      <th key={c.key} style={{ width: c.w, padding: '8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', borderLeft: '1px solid var(--border)' }}>{c.label}</th>
                    ))}
                    <th style={{ width: 72, padding: '8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', borderLeft: '1px solid var(--border)' }}>ชั้น</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', borderLeft: '1px solid var(--border)' }}>กลุ่มสาระ</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, r) => {
                    const grp = row.code.trim() ? deriveGroup(row.code) : ''
                    const grade = row.code.trim() ? gradeLabelFromCode(row.code) : ''
                    return (
                      <tr key={r}>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, borderTop: '1px solid var(--border)' }}>{r + 1}</td>
                        {GRID_COLS.map((c, ci) => (
                          <td key={c.key} style={{ borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)', padding: 0 }}>
                            <input
                              value={row[c.key]}
                              onChange={e => setCell(r, c.key, e.target.value)}
                              onPaste={e => onCellPaste(r, ci, e)}
                              placeholder={c.key === 'code' ? 'ท11101' : c.key === 'name' ? 'ภาษาไทย1' : c.key === 'type' ? 'พื้นฐาน' : '200'}
                              style={{
                                width: '100%', border: 'none', outline: 'none', padding: '8px', fontSize: 13,
                                background: 'transparent', fontFamily: 'inherit', boxSizing: 'border-box',
                              }}
                            />
                          </td>
                        ))}
                        <td style={{
                          borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
                          padding: '8px', fontSize: 13, fontWeight: 700, color: grade && grade !== '—' ? '#8B6B45' : 'var(--text-3)',
                        }}>
                          {grade || '—'}
                        </td>
                        <td style={{
                          borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
                          padding: '8px', fontSize: 12, color: grp ? (GROUP_COLOR[grp] || '#374151') : 'var(--text-3)',
                        }}>
                          {grp || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setGrid(g => [...g, ...Array.from({ length: 5 }, blankRow)])} className="btn btn-secondary" style={{ fontSize: 13 }}>+ เพิ่มแถว</button>
              <button type="button" onClick={clearGrid} className="btn btn-secondary" style={{ fontSize: 13 }}>ล้างตาราง</button>
              <span style={{ fontSize: 13, color: 'var(--text-3)', marginLeft: 'auto' }}>พร้อมบันทึก <b style={{ color: 'var(--primary)' }}>{validRows.length}</b> วิชา</span>
              <button type="button" onClick={() => { setShowPaste(false); clearGrid() }} disabled={pasteSaving} className="btn btn-secondary">ยกเลิก</button>
              <LoadingButton loading={pasteSaving} onClick={handleBulkSave} disabled={validRows.length === 0}>
                บันทึก {validRows.length} วิชา
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* ── ฟอร์มเพิ่ม/แก้ไขทีละวิชา ── */}
      {activeTab === 'subjects' && showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-card" style={{ maxWidth: 760, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>{editing.id ? 'แก้ไขรายวิชา' : 'เพิ่มรายวิชา'}</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กรอกข้อมูลรายวิชาให้ครบ แล้วกดบันทึกเพื่อใช้งานในระบบ</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                ปิด
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div>
                  <label className="form-label">รหัสวิชา *</label>
                  <input
                    name="code"
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    className="form-input"
                    placeholder="ท11101"
                    required
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                    ชั้นจากรหัส: <b style={{ color: '#8B6B45' }}>{gradeLabelFromCode(formCode) || '—'}</b>
                    {' '}· เช่น ท11101 = ป.1, ท12101 = ป.2
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">ชื่อวิชา *</label>
                  <input name="name" defaultValue={editing.name} className="form-input" placeholder="ภาษาไทย 2" required />
                </div>
                <div>
                  <label className="form-label">ชื่อย่อ</label>
                  <input name="short_name" defaultValue={editing.short_name} className="form-input" placeholder="ท2" />
                </div>
                <div>
                  <label className="form-label">กลุ่มสาระ *</label>
                  <select name="subject_group" defaultValue={editing.subject_group} className="form-input" required>
                    {SUBJECT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">ประเภท *</label>
                  <select name="type" defaultValue={editing.type} className="form-input" required>
                    <option value="พื้นฐาน">พื้นฐาน</option>
                    <option value="เพิ่มเติม">เพิ่มเติม</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">ชั่วโมง/ปี</label>
                  <input name="hours_per_year" type="number" defaultValue={editing.hours_per_year} className="form-input" min={0} />
                </div>
                <div>
                  <label className="form-label">หน่วยกิต</label>
                  <input name="credits" type="number" step="0.5" defaultValue={editing.credits} className="form-input" min={0} />
                </div>
                <div>
                  <label className="form-label">คะแนนเต็ม</label>
                  <input name="max_score" type="number" defaultValue={editing.max_score} className="form-input" min={0} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-secondary">ยกเลิก</button>
                <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'subjects' && (
        <>
          <div className="filter-bar control-card" style={{ marginBottom: 12 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input"
              placeholder="ค้นหา รหัส / ชื่อวิชา / กลุ่มสาระ..."
              style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
            />
            <select className="form-input" value={filterGrade} onChange={e => setFilterGrade(e.target.value)} style={{ width: 120 }}>
              <option value="">ทุกชั้น</option>
              {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div className="section-title" style={{ marginBottom: 6 }}>ข้อมูลรายวิชา</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                  รายวิชาพื้นฐาน/เพิ่มเติมทั้งหมด {subjects.length} รายการ
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <LoadingButton className="btn btn-secondary" loading={syncBusy} loadingText="กำลังนำเข้า..." onClick={handleSyncGlobal}>
                  ใช้จากข้อมูลกลาง
                </LoadingButton>
                <button type="button" onClick={() => { setGrid(Array.from({ length: 12 }, blankRow)); setShowPaste(true); setShowForm(false) }} className="btn btn-secondary">วางจากตาราง</button>
                <button type="button" onClick={openAdd} className="btn btn-primary">+ เพิ่มรายวิชา</button>
              </div>
            </div>
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <table className="thai-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>รหัส</th>
                    <th>ชื่อวิชา</th>
                    <th style={{ width: 70 }}>ชั้น</th>
                    <th>กลุ่มสาระ</th>
                    <th style={{ width: 80 }}>ประเภท</th>
                    <th style={{ width: 70, textAlign: 'right' }}>ชม./ปี</th>
                    <th style={{ width: 70, textAlign: 'right' }}>นก.</th>
                    <th style={{ width: 70, textAlign: 'right' }}>เต็ม</th>
                    <th style={{ width: 100 }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                      {subjects.length === 0 ? (
                        <div>
                          <div style={{ marginBottom: 12 }}>ยังไม่มีรายวิชา</div>
                          <LoadingButton className="btn btn-primary" loading={syncBusy} loadingText="กำลังนำเข้า..." onClick={handleSyncGlobal}>
                            ใช้จากข้อมูลกลาง
                          </LoadingButton>
                          <div style={{ marginTop: 10, fontSize: 13 }}>หรือกด「วางจากตาราง」/「เพิ่มรายวิชา」</div>
                        </div>
                      ) : 'ไม่พบวิชาที่ค้นหา'}
                    </td></tr>
                  ) : filtered.map((s, i) => (
                    <tr key={s.id}>
                      <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{s.code}</td>
                      <td>{s.name}</td>
                      <td style={{ fontWeight: 700, color: '#8B6B45' }}>{gradeLabelFromSubject(s)}</td>
                      <td>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                          color: GROUP_COLOR[s.subject_group] || '#374151',
                          background: (GROUP_COLOR[s.subject_group] || '#374151') + '18',
                        }}>{s.subject_group}</span>
                      </td>
                      <td>{s.type}</td>
                      <td style={{ textAlign: 'right' }}>{s.hours_per_year}</td>
                      <td style={{ textAlign: 'right' }}>{s.credits}</td>
                      <td style={{ textAlign: 'right' }}>{s.max_score}</td>
                      <td>
                        <button onClick={() => openEdit(s)} style={{ color: 'var(--primary)', fontSize: 13, marginRight: 12, background: 'none', border: 'none', cursor: 'pointer' }}>แก้ไข</button>
                        <button onClick={() => handleDelete(s)} style={{ color: '#DC2626', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'class-subjects' && (
        <>
          <div className="data-card" style={{ padding: 20, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div className="section-title" style={{ marginBottom: 6 }}>กำหนดวิชาเรียน</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                  เลือกปีการศึกษาและห้องเรียน แล้วเพิ่มรายวิชาจากแม่แบบรายวิชาของสถานศึกษา
                </p>
              </div>
              <div className="badge badge-info">
                {selectedClassSubjectClassroom ? `${selectedClassSubjectClassroom.level}/${selectedClassSubjectClassroom.room}` : 'ยังไม่ได้เลือกห้อง'} · {classSubjectItems.length} วิชา
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <label className="form-label">ปีการศึกษา</label>
                <select
                  className="form-input"
                  value={classSubjectYearId}
                  onChange={event => {
                    setClassSubjectYearId(event.target.value)
                    setClassSubjectItems([])
                    setClassSubjectClassroomId('')
                  }}
                  disabled={loadingClassSubjects || classSubjectYears.length === 0}
                >
                  {classSubjectYears.length === 0 ? <option value="">— ไม่มีปีการศึกษา —</option> : classSubjectYears.map(year => (
                    <option key={year.id} value={year.id}>{year.year_be}{year.is_active ? ' (ปัจจุบัน)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">ชั้น/ห้อง</label>
                <select
                  className="form-input"
                  value={classSubjectClassroomId}
                  onChange={event => setClassSubjectClassroomId(event.target.value)}
                  disabled={loadingClassSubjects || classSubjectClassrooms.length === 0}
                >
                  {classSubjectClassrooms.length === 0 ? <option value="">— ไม่มีห้องเรียน —</option> : classSubjectClassrooms.map(classroom => (
                    <option key={classroom.id} value={classroom.id}>{classroom.level}/{classroom.room}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="data-card" style={{ padding: 20, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 360px' }}>
                <label className="form-label">เพิ่มรายวิชาทีละวิชา</label>
                <select
                  className="form-input"
                  value={selectedSubjectId}
                  onChange={event => setSelectedSubjectId(event.target.value)}
                  disabled={!canManageClassSubjects || classSubjectSaving || availableClassSubjects.length === 0}
                >
                  <option value="">{availableClassSubjects.length ? '— เลือกรายวิชา —' : 'ทุกวิชาถูกเพิ่มในห้องนี้แล้ว'}</option>
                  {availableClassSubjects.map(subject => (
                    <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <LoadingButton
                  loading={classSubjectAction === 'add'}
                  onClick={handleAddSelectedClassSubject}
                  disabled={!canManageClassSubjects || !selectedSubjectId || classSubjectSaving}
                  className="btn btn-primary"
                >
                  + เพิ่มรายวิชา
                </LoadingButton>
                <LoadingButton
                  loading={classSubjectAction === 'auto'}
                  onClick={handleAutoAddClassSubjects}
                  disabled={!canManageClassSubjects || autoClassSubjects.length === 0 || classSubjectSaving}
                  className="btn btn-secondary"
                >
                  เพิ่มอัตโนมัติ ({autoClassSubjects.length})
                </LoadingButton>
              </div>
            </div>
            <p style={{ margin: '10px 0 0', color: 'var(--text-3)', fontSize: 13 }}>
              ปุ่มเพิ่มอัตโนมัติจะดึงรายวิชาที่รหัส/ชื่อบ่งบอกระดับชั้นเดียวกับห้องนี้ เช่น ป.1 ใช้รหัสกลุ่ม `x1xxxx` หรือชื่อที่ลงท้าย `1`
            </p>
          </div>

          <div className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}>รายวิชาที่ห้องนี้เรียน</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                  เพิ่ม/ลบได้จากหน้านี้ ระบบจะเรียงรายวิชาตามชั้นและลำดับหลักสูตรอัตโนมัติหลังเพิ่มรายวิชา
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {loadingClassSubjects && <span className="badge badge-gray">กำลังโหลด...</span>}
                <LoadingButton
                  loading={classSubjectAction === 'remove-all'}
                  onClick={handleRemoveAllClassSubjects}
                  disabled={!canManageClassSubjects || classSubjectItems.length === 0 || classSubjectSaving}
                  className="btn btn-secondary"
                  style={{ color: '#DC2626', borderColor: 'rgba(220, 38, 38, 0.25)' }}
                >
                  ลบทั้งหมด
                </LoadingButton>
              </div>
            </div>
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <table className="thai-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th style={{ width: 110 }}>รหัส</th>
                    <th>ชื่อวิชา</th>
                    <th style={{ width: 180 }}>กลุ่มสาระ</th>
                    <th style={{ width: 90 }}>ประเภท</th>
                    <th style={{ width: 90, textAlign: 'right' }}>ชม./ปี</th>
                    <th style={{ width: 90 }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {classSubjectItems.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                      {classSubjectClassroomId ? 'ยังไม่มีรายวิชาในห้องนี้ — เลือกเพิ่มทีละวิชาหรือกดเพิ่มอัตโนมัติ' : 'เลือกปีและห้องเรียนก่อน'}
                    </td></tr>
                  ) : classSubjectItems.map((item, index) => {
                    const subject = classSubjectMap[item.subject_id]
                    return (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{index + 1}</td>
                        <td style={{ fontWeight: 800 }}>{subject?.code || '-'}</td>
                        <td>
                          <div style={{ fontWeight: 800 }}>{subject?.name || '(ไม่พบรายวิชา)'}</div>
                          {subject?.short_name && <div style={{ color: 'var(--text-3)', fontSize: 12 }}>ชื่อย่อ: {subject.short_name}</div>}
                        </td>
                        <td>{subject?.subject_group || '-'}</td>
                        <td>{subject?.type || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{subject?.hours_per_year ?? '-'}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleRemoveClassSubject(item)}
                            disabled={!canManageClassSubjects || classSubjectSaving}
                            style={{ color: '#DC2626', fontSize: 13, background: 'none', border: 'none', cursor: canManageClassSubjects ? 'pointer' : 'not-allowed', opacity: canManageClassSubjects ? 1 : 0.5 }}
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'clubs' && (
        <>
          {showClubForm && (
            <div className="modal-backdrop" onClick={() => !clubSaving && setShowClubForm(false)}>
              <div className="modal-card" style={{ maxWidth: 760, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
                  <div>
                    <div className="section-title" style={{ marginBottom: 4 }}>{editingClub.id ? 'แก้ไขชุมนุม' : 'เพิ่มชุมนุม'}</div>
                    <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กำหนดรายละเอียดชุมนุมและสถานะเปิดรับเลือก</p>
                  </div>
                  <button type="button" onClick={() => setShowClubForm(false)} disabled={clubSaving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                    ปิด
                  </button>
                </div>
                <form onSubmit={handleClubSave}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
                    <div>
                      <label className="form-label">รหัสชุมนุม *</label>
                      <input name="code" defaultValue={editingClub.code} className="form-input" placeholder="CLB001" required />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">ชื่อชุมนุม *</label>
                      <input name="name" defaultValue={editingClub.name} className="form-input" placeholder="ชุมนุมคอมพิวเตอร์" required />
                    </div>
                    <div>
                      <label className="form-label">ชื่อย่อ</label>
                      <input name="short_name" defaultValue={editingClub.short_name} className="form-input" placeholder="คอมฯ" />
                    </div>
                    <div>
                      <label className="form-label">ครูที่ปรึกษา</label>
                      <input name="advisor_name" defaultValue={editingClub.advisor_name} className="form-input" placeholder="ครู..." />
                    </div>
                    <div>
                      <label className="form-label">รับได้สูงสุด</label>
                      <input name="max_students" type="number" defaultValue={editingClub.max_students} className="form-input" min={0} placeholder="ไม่จำกัด" />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">คำอธิบาย</label>
                      <input name="description" defaultValue={editingClub.description} className="form-input" placeholder="รายละเอียดกิจกรรมของชุมนุม" />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--text-2)' }}>
                      <input name="is_active" type="checkbox" defaultChecked={editingClub.is_active} />
                      เปิดรับเลือกชุมนุม
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <button type="button" onClick={() => setShowClubForm(false)} disabled={clubSaving} className="btn btn-secondary">ยกเลิก</button>
                    <LoadingButton type="submit" loading={clubSaving}>บันทึก</LoadingButton>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div className="section-title" style={{ marginBottom: 6 }}>รายการชุมนุม</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                  กำหนดชุมนุมที่โรงเรียนเปิดให้นักเรียนเลือก ใช้รหัสชุมนุมแยกจากรหัสรายวิชาและเปิด/ปิดรับสมัครได้
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" onClick={openAddClub} className="btn btn-primary">+ เพิ่มชุมนุม</button>
              </div>
            </div>
            {loadingClubs ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>กำลังโหลดชุมนุม...</div>
            ) : (
              <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                <table className="thai-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>#</th>
                      <th style={{ width: 110 }}>รหัส</th>
                      <th>ชื่อชุมนุม</th>
                      <th style={{ width: 150 }}>ครูที่ปรึกษา</th>
                      <th style={{ width: 110 }}>จำนวนที่เลือก</th>
                      <th style={{ width: 90 }}>สถานะ</th>
                      <th style={{ width: 120 }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubs.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>ยังไม่มีชุมนุม — กด “เพิ่มชุมนุม” เพื่อเริ่ม</td></tr>
                    ) : clubs.map((club, index) => (
                      <tr key={club.id}>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{index + 1}</td>
                        <td style={{ fontWeight: 800 }}>{club.code}</td>
                        <td>
                          <div style={{ fontWeight: 800 }}>{club.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {club.short_name || '-'}{club.description ? ` · ${club.description}` : ''}
                          </div>
                        </td>
                        <td>{club.advisor_name || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {(clubCounts[club.id] || 0).toLocaleString('th-TH')}{club.max_students ? `/${club.max_students}` : ''}
                        </td>
                        <td><span className={`badge ${club.is_active ? 'badge-success' : 'badge-gray'}`}>{club.is_active ? 'เปิด' : 'ปิด'}</span></td>
                        <td>
                          <button type="button" onClick={() => openEditClub(club)} style={{ color: 'var(--primary)', fontSize: 13, marginRight: 10, background: 'none', border: 'none', cursor: 'pointer' }}>แก้ไข</button>
                          <button type="button" onClick={() => handleClubDelete(club)} style={{ color: '#DC2626', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>ลบ</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
            <div style={{ marginBottom: 14 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}>เลือกชุมนุมให้นักเรียน</div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                  เลือกปีการศึกษาและห้องเรียน จากนั้นกำหนดชุมนุมรายคน ระบบบันทึกตามปีการศึกษา
                </p>
              </div>
            </div>
            <div className="control-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end', marginBottom: 14, maxWidth: '100%', overflow: 'hidden' }}>
              <div style={{ minWidth: 0 }}>
                <label className="form-label">ปีการศึกษา</label>
                <select className="form-input" value={clubYearId} onChange={event => {
                  const nextYear = event.target.value
                  const firstClassroom = clubClassrooms.find(classroom => classroom.academic_year_id === nextYear)
                  setClubYearId(nextYear)
                  setClubClassroomId(firstClassroom?.id || '')
                }}>
                  {clubYears.map(year => <option key={year.id} value={year.id}>{year.year_be}{year.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 0 }}>
                <label className="form-label">ห้องเรียน</label>
                <select className="form-input" value={clubClassroomId} onChange={event => setClubClassroomId(event.target.value)}>
                  {filteredClubClassrooms.length === 0 ? <option value="">ไม่มีห้องเรียน</option> : filteredClubClassrooms.map(classroom => (
                    <option key={classroom.id} value={classroom.id}>{classroom.level}/{classroom.room}</option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 0 }}>
                <label className="form-label">เลือกชุมนุมนี้ทั้งห้อง</label>
                <select className="form-input" value={bulkClubId} onChange={event => setBulkClubId(event.target.value)}>
                  <option value="">ล้าง / ยังไม่เลือกชุมนุม</option>
                  {activeClubs.map(club => (
                    <option key={club.id} value={club.id}>{club.code} · {club.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={applyClubToClassroom}
                disabled={clubStudents.length === 0}
              >
                ใช้กับทั้งห้อง
              </button>
              <div style={{ gridColumn: '1 / -1', color: 'var(--text-3)', fontSize: 13, fontWeight: 700 }}>
                ชุมนุมที่เปิดรับ {activeClubs.length} รายการ · นักเรียน {clubStudents.length} คน
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <table className="thai-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 54 }}>เลขที่</th>
                    <th>นักเรียน</th>
                    <th style={{ width: 280 }}>ชุมนุม</th>
                    <th style={{ width: 140 }}>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {clubStudents.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>เลือกปีการศึกษาและห้องเรียนเพื่อแสดงนักเรียน</td></tr>
                  ) : clubStudents.map(student => {
                    const selectedClub = clubs.find(club => club.id === clubAssignments[student.id])
                    return (
                      <tr key={student.id}>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{student.student_number}</td>
                        <td style={{ fontWeight: 800 }}>{student.prefix}{student.first_name} {student.last_name}</td>
                        <td>
                          <select className="form-input" value={clubAssignments[student.id] || ''} onChange={event => setStudentClub(student.id, event.target.value)}>
                            <option value="">ยังไม่เลือกชุมนุม</option>
                            {activeClubs.map(club => (
                              <option key={club.id} value={club.id}>{club.code} · {club.name}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <span className={`badge ${selectedClub ? 'badge-success' : 'badge-gray'}`}>
                            {selectedClub ? selectedClub.short_name || selectedClub.name : 'ยังไม่เลือก'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-3)', fontSize: 13, fontWeight: 700 }}>
                เลือกทั้งห้องได้จากตัวกรองด้านบน แล้วแก้เฉพาะรายคนในตารางก่อนกดบันทึก
              </div>
              <LoadingButton loading={clubSaving} onClick={handleClubAssignmentsSave} disabled={clubStudents.length === 0}>
                บันทึกการเลือกชุมนุม
              </LoadingButton>
            </div>
          </div>
        </>
      )}

      {evaluationKind && (
        <>
          {editingSetting && (
            <div className="modal-backdrop" onClick={() => !settingsSaving && setEditingSetting(null)}>
              <div className="modal-card" style={{ maxWidth: 720, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
                  <div>
                    <div className="section-title" style={{ marginBottom: 4 }}>{settingFormMode === 'add' ? 'เพิ่มข้อประเมิน' : 'แก้ไขรายการประเมิน'}</div>
                    <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                      {SETTINGS_TABS.find(tab => tab.id === evaluationKind)?.label || 'รายการประเมิน'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setEditingSetting(null)} disabled={settingsSaving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                    ปิด
                  </button>
                </div>
                <form onSubmit={handleSettingSave}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">ชื่อรายการ *</label>
                      <input name="label" defaultValue={editingSetting.label} className="form-input" required />
                    </div>
                    <div>
                      <label className="form-label">ชื่อย่อ *</label>
                      <input name="short_label" defaultValue={editingSetting.short_label} className="form-input" required />
                    </div>
                    <div>
                      <label className="form-label">ด้าน/กลุ่ม</label>
                      <input name="group_label" defaultValue={editingSetting.group_label || ''} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">ลำดับ</label>
                      <input name="sort_order" type="number" defaultValue={editingSetting.sort_order} className="form-input" min={1} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">คำอธิบาย</label>
                      <input name="description" defaultValue={editingSetting.description || ''} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">ชั่วโมง/ปี</label>
                      <input
                        name="hours_per_year"
                        type="number"
                        min={0}
                        defaultValue={editingSetting.hours_per_year ?? 0}
                        className="form-input"
                      />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--text-2)' }}>
                      <input name="is_active" type="checkbox" defaultChecked={editingSetting.is_active} />
                      เปิดใช้งานในหน้าบันทึกผล
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <button type="button" onClick={() => setEditingSetting(null)} disabled={settingsSaving} className="btn btn-secondary">ยกเลิก</button>
                    <LoadingButton type="submit" loading={settingsSaving}>บันทึก</LoadingButton>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div className="section-title" style={{ marginBottom: 6 }}>
                  ตั้งค่า{SETTINGS_TABS.find(tab => tab.id === evaluationKind)?.label}
                </div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                  แก้ไขชื่อที่แสดง ลำดับ ชั่วโมงต่อปี เปิด/ปิดรายการ และเพิ่มข้อประเมินของโรงเรียนได้
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" onClick={openAddEvaluationSetting} disabled={settingsSaving} className="btn btn-primary">+ เพิ่มข้อ</button>
                <button type="button" onClick={handleResetSettings} disabled={settingsSaving} className="btn btn-secondary">คืนค่าเริ่มต้น</button>
              </div>
            </div>
            {loadingSettings ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>กำลังโหลดการตั้งค่า...</div>
            ) : (
              <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                <table className="thai-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 54 }}>ลำดับ</th>
                      <th>รายการประเมิน</th>
                      <th style={{ width: 90 }}>ชม./ปี</th>
                      <th style={{ width: 90 }}>สถานะ</th>
                      <th style={{ width: 180 }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSettings.map((setting, index) => (
                      <tr key={setting.id || setting.field_key}>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{setting.sort_order}</td>
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--text)' }}>{setting.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {setting.short_label}{setting.description ? ` · ${setting.description}` : ''}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{setting.hours_per_year ?? 0}</td>
                        <td>
                          <span className={`badge ${setting.is_active ? 'badge-success' : 'badge-gray'}`}>
                            {setting.is_active ? 'เปิดใช้' : 'ปิด'}
                          </span>
                        </td>
                        <td>
                          <button type="button" onClick={() => moveSetting(setting, -1)} disabled={index === 0 || settingsSaving} style={{ color: 'var(--text-3)', fontSize: 13, marginRight: 8, background: 'none', border: 'none', cursor: 'pointer' }}>ขึ้น</button>
                          <button type="button" onClick={() => moveSetting(setting, 1)} disabled={index === displayedSettings.length - 1 || settingsSaving} style={{ color: 'var(--text-3)', fontSize: 13, marginRight: 8, background: 'none', border: 'none', cursor: 'pointer' }}>ลง</button>
                          <button type="button" onClick={() => openEditEvaluationSetting(setting)} style={{ color: 'var(--primary)', fontSize: 13, marginRight: 8, background: 'none', border: 'none', cursor: 'pointer' }}>แก้ไข</button>
                          <button type="button" onClick={() => toggleSetting(setting)} disabled={settingsSaving} style={{ color: setting.is_active ? '#DC2626' : '#059669', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
                            {setting.is_active ? 'ปิด' : 'เปิด'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
