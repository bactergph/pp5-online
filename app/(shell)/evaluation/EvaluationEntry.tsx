'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchEvaluationClassrooms,
  fetchEvaluationData,
  fetchEvaluationInit,
  saveEvaluationRows,
  type EvaluationKind,
} from './actions'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'
import { activeScorableEvaluationSettings, readingCriteriaTopics, type EvaluationSetting } from '@/lib/evaluation-settings'
import {
  READING_GRAND_TOTAL_MAX,
  readingTableColumnMax,
  readingTableColumnValue,
  readingTableFlatColumns,
  readingTableGroupsFromTopics,
  type ReadingTableColumn,
} from '@/lib/reading-table-layout'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = { id: string; level: string; room: number }
type Student = { id: string; student_number: number; student_code: string | null; prefix: string | null; first_name: string; last_name: string; status: string }
type SavedRow = Record<string, string | number | null>
type Column = { key: string; label: string; short: string; type: 'score' | 'result'; maxScore: number; groupLabel?: string | null; standardLabel?: string }

const CHARACTER_COLUMNS: Column[] = [
  'รักชาติ ศาสน์ กษัตริย์',
  'ซื่อสัตย์สุจริต',
  'มีวินัย',
  'ใฝ่เรียนรู้',
  'อยู่อย่างพอเพียง',
  'มุ่งมั่นในการทำงาน',
  'รักความเป็นไทย',
  'มีจิตสาธารณะ',
].map((label, index) => ({ key: `trait${index + 1}_score`, label, short: `${index + 1}`, type: 'score', maxScore: 3 }))

const READING_COLUMNS: Column[] = [
  { key: 'reading_1_1', label: 'อ่านออกเสียงและจับใจความ', short: '1.1', type: 'score', maxScore: 3, groupLabel: 'อ่าน' },
  { key: 'reading_1_2', label: 'สรุปความรู้และข้อคิด', short: '1.2', type: 'score', maxScore: 3, groupLabel: 'อ่าน' },
  { key: 'thinking_2_1', label: 'จำแนกและเชื่อมโยงข้อมูล', short: '2.1', type: 'score', maxScore: 3, groupLabel: 'คิดวิเคราะห์' },
  { key: 'thinking_2_2', label: 'แสดงความคิดเห็นอย่างมีเหตุผล', short: '2.2', type: 'score', maxScore: 3, groupLabel: 'คิดวิเคราะห์' },
  { key: 'writing_3_1', label: 'เขียนสื่อความเหมาะสม', short: '3.1', type: 'score', maxScore: 3, groupLabel: 'เขียน' },
]

const COMPETENCY_COLUMNS: Column[] = [
  'การสื่อสาร',
  'การคิด',
  'การแก้ปัญหา',
  'ทักษะชีวิต',
  'เทคโนโลยี',
].map((label, index) => ({ key: `competency${index + 1}_score`, label, short: label, type: 'score', maxScore: 3 }))

const ACTIVITY_COLUMNS: Column[] = [
  { key: 'guidance_result', label: 'กิจกรรมแนะแนว', short: 'แนะแนว', type: 'result', maxScore: 1 },
  { key: 'scout_result', label: 'ลูกเสือ / เนตรนารี / ยุวกาชาด', short: 'ลูกเสือ', type: 'result', maxScore: 1 },
  { key: 'club_result', label: 'ชุมนุม / ชมรม', short: 'ชุมนุม', type: 'result', maxScore: 1 },
  { key: 'public_service_result', label: 'กิจกรรมเพื่อสังคมและสาธารณประโยชน์', short: 'จิตอาสา', type: 'result', maxScore: 1 },
]

const CONFIG: Record<EvaluationKind, { title: string; subtitle: string; accent: string; columns: Column[] }> = {
  activities: {
    title: 'กิจกรรมพัฒนาผู้เรียน',
    subtitle: 'บันทึกผ่าน / ไม่ผ่าน · ใช้กับกิจกรรมแนะแนว ลูกเสือ ชุมนุม และจิตอาสา',
    accent: '#10B981',
    columns: ACTIVITY_COLUMNS,
  },
  character: {
    title: 'คุณลักษณะอันพึงประสงค์',
    subtitle: 'ประเมินคุณลักษณะ 8 ข้อ ระดับคะแนน 0-3',
    accent: '#EC4899',
    columns: CHARACTER_COLUMNS,
  },
  reading: {
    title: 'การอ่าน คิดวิเคราะห์ และเขียน',
    subtitle: 'ประเมินอ่าน คิดวิเคราะห์ และเขียน ระดับคะแนน 0-3',
    accent: '#B8956A',
    columns: READING_COLUMNS,
  },
  competency: {
    title: 'สมรรถนะสำคัญของผู้เรียน',
    subtitle: 'ประเมินสมรรถนะสำคัญ 5 ด้าน ระดับคะแนน 0-3',
    accent: '#14B8A6',
    columns: COMPETENCY_COLUMNS,
  },
}

const SCORE_OPTIONS = ['', '3', '2', '1', '0']
const RESULT_OPTIONS = ['', 'ผ่าน', 'ไม่ผ่าน']
const READING_SHORT_LABELS: Record<string, string> = {
  reading_1_1: '1.1',
  reading_1_2: '1.2',
  thinking_2_1: '2.1',
  thinking_2_2: '2.2',
  writing_3_1: '3.1',
}
function readingTableColumnKey(column: ReadingTableColumn, index: number) {
  if (column.kind === 'score') return column.key
  if (column.kind === 'total') return `total-${index}`
  return `spacer-${index}`
}

function readingTableColumnLabel(column: ReadingTableColumn) {
  if (column.kind === 'score' || column.kind === 'total') return column.label
  return ''
}

const STYLES = `
  .eval-head { display:flex; align-items:center; gap:14px; }
  .eval-mark { width:48px; height:48px; border-radius:14px; display:grid; place-items:center; color:var(--eval-accent); background: color-mix(in srgb, var(--eval-accent) 16%, white); }
  .eval-title { margin:0; font-size:26px; font-weight:900; color:#0f172a; }
  .eval-subtitle { margin:5px 0 0; color:#64748b; font-weight:700; }
  .eval-filter { display:grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap:14px; align-items:end; }
  .eval-tabs { display:flex; gap:16px; border-bottom:1px solid #e5e7eb; overflow:auto; }
  .eval-tab { border:0; background:transparent; padding:12px 4px; color:#64748b; font-weight:900; cursor:pointer; border-bottom:2px solid transparent; }
  .eval-tab.is-active { color:var(--eval-accent); border-bottom-color:var(--eval-accent); }
  .eval-board { border:1px solid #e5e7eb; border-radius:16px; background:#fff; overflow:hidden; box-shadow:0 12px 28px rgba(15,23,42,.06); }
  .eval-board-head { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:14px 18px; border-bottom:1px solid #e5e7eb; }
  .eval-board-title { color:#334155; font-weight:900; }
  .eval-table-wrap { overflow:auto; }
  .eval-table { width:100%; min-width:920px; border-collapse:separate; border-spacing:0; }
  .eval-table th, .eval-table td { border-right:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; padding:10px; font-size:13px; background:#fff; }
  .eval-table th { background:#f8fafc; text-align:center; color:#475569; font-weight:900; }
  .eval-table .sticky-no { position:sticky; left:0; z-index:3; width:54px; text-align:center; }
  .eval-table .sticky-name { position:sticky; left:54px; z-index:3; min-width:220px; }
  .eval-table thead .sticky-no, .eval-table thead .sticky-name { z-index:5; background:#f8fafc; }
  .eval-reading-table { min-width:1160px; }
  .eval-reading-table .sticky-code { position:sticky; left:54px; z-index:3; width:86px; text-align:center; }
  .eval-reading-table .sticky-name { left:140px; min-width:220px; }
  .eval-reading-table thead .sticky-code { z-index:5; background:#f8fafc; }
  .eval-character-table { min-width:1120px; }
  .eval-character-table .sticky-code { position:sticky; left:54px; z-index:3; width:86px; text-align:center; }
  .eval-character-table .sticky-name { left:140px; min-width:240px; }
  .eval-character-table thead .sticky-code { z-index:5; background:#f8fafc; }
  .eval-character-group-head { background:#fdf2f8 !important; color:#be185d !important; border-bottom-color:#fbcfe8 !important; }
  .eval-character-sub-head { background:#f8fafc !important; color:#475569 !important; }
  .eval-character-max-head { background:#fce7f3 !important; color:#be185d !important; }
  .eval-character-score-cell { text-align:center; padding:6px !important; }
  .eval-character-level-cell { text-align:center; color:#be185d; font-weight:950; }
  .eval-character-result-cell { text-align:center; font-weight:950; }
  .eval-character-table .eval-select { min-width:58px; padding:6px 5px; }
  .eval-reading-group-head { background:#F5EDE3 !important; color:#5C4330 !important; border-bottom-color:#E8D9C4 !important; }
  .eval-reading-sub-head { background:#f8fafc !important; color:#475569 !important; }
  .eval-reading-max-head { background:#ede9fe !important; color:#5b21b6 !important; }
  .eval-reading-score-cell { text-align:center; padding:6px !important; }
  .eval-reading-total-cell { text-align:center; background:#f5f3ff !important; color:#5b21b6; font-weight:900; }
  .eval-reading-grand-cell { text-align:center; background:#F5EDE3 !important; color:#5C4330; font-weight:950; }
  .eval-reading-level-cell { text-align:center; color:#8B6B45; font-weight:950; }
  .eval-reading-result-cell { text-align:center; font-weight:950; }
  .eval-select { width:100%; min-width:76px; border:1px solid #dbe3ef; border-radius:8px; padding:7px 8px; font:inherit; font-weight:800; text-align:center; background:#fff; color:#334155; }
  .eval-reading-table .eval-select { min-width:58px; padding:6px 5px; }
  .eval-col-fill { margin-top:6px; width:100%; border:0; border-radius:7px; padding:5px 6px; color:#047857; background:#dcfce7; font-size:11px; font-weight:900; cursor:pointer; }
  .eval-save { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:14px 18px; background:#f8fafc; }
  .eval-empty { padding:42px; border:1px dashed #cbd5e1; border-radius:16px; color:#94a3b8; text-align:center; font-weight:800; }
  @media (max-width: 1000px) { .eval-filter { grid-template-columns:1fr 1fr; } }
  @media (max-width: 640px) { .eval-filter { grid-template-columns:1fr; } .eval-head { align-items:flex-start; } }
`

function resultFromScore(total: number, max: number) {
  const percent = max > 0 ? (total / max) * 100 : 0
  if (percent >= 80) return 'ดีเยี่ยม'
  if (percent >= 65) return 'ดี'
  if (percent >= 50) return 'ผ่าน'
  return 'ไม่ผ่าน'
}

function levelFromScore(total: number, max: number) {
  const percent = max > 0 ? (total / max) * 100 : 0
  if (percent >= 80) return 3
  if (percent >= 65) return 2
  if (percent >= 50) return 1
  return 0
}

function columnsFromSettings(settings: EvaluationSetting[], kind: EvaluationKind, fallback: Column[]) {
  const active = activeScorableEvaluationSettings(settings, kind)
  if (active.length === 0) return fallback
  return active.map(setting => ({
    key: setting.field_key,
    label: setting.label,
    short: setting.short_label.includes('.') ? setting.short_label : (READING_SHORT_LABELS[setting.field_key] || setting.short_label),
    type: setting.score_type === 'pass_fail' ? 'result' as const : 'score' as const,
    maxScore: setting.max_score,
    groupLabel: setting.group_label,
    standardLabel: setting.short_label.split('.')[0],
  }))
}

export default function EvaluationEntry({ kind }: { kind: EvaluationKind }) {
  const config = CONFIG[kind]
  const [canEdit, setCanEdit] = useState(false)
  const [years, setYears] = useState<Year[]>([])
  const [yearId, setYearId] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [classroomId, setClassroomId] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)
  const [students, setStudents] = useState<Student[]>([])
  const [rows, setRows] = useState<Record<string, Record<string, string>>>({})
  const [settings, setSettings] = useState<EvaluationSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const skipYearFetch = useRef(true)

  const selectedYear = years.find(year => year.id === yearId)
  const selectedClassroom = classrooms.find(item => item.id === classroomId)
  const columns = useMemo(() => columnsFromSettings(settings, kind, config.columns), [settings, kind, config.columns])
  const maxScore = kind === 'reading'
    ? READING_GRAND_TOTAL_MAX
    : columns.reduce((sum, column) => sum + (column.type === 'score' ? column.maxScore : 0), 0)
  const readingGroups = useMemo(() => {
    if (kind !== 'reading') return []
    return readingTableGroupsFromTopics(readingCriteriaTopics(settings))
  }, [kind, settings])
  const readingColumns = useMemo(
    () => (kind === 'reading' ? readingTableFlatColumns(readingGroups) : []),
    [kind, readingGroups],
  )

  useEffect(() => {
    void fetchEvaluationInit().then(data => {
      const nextYears = data.years as Year[]
      const list = (data.classrooms || []) as Classroom[]
      setCanEdit(data.canEdit)
      setYears(nextYears)
      setClassrooms(list)
      skipYearFetch.current = true
      setYearId(data.activeYearId || '')
      setClassroomId(list[0]?.id || '')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!yearId) return
    if (skipYearFetch.current) {
      skipYearFetch.current = false
      return
    }
    void fetchEvaluationClassrooms(yearId).then(data => {
      const list = data as Classroom[]
      setClassrooms(list)
      setClassroomId(list[0]?.id || '')
    })
  }, [yearId])

  useEffect(() => {
    if (!yearId || !classroomId) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setLoadingRows(true)
        clearAlert()
      }
    })
    void fetchEvaluationData(kind, classroomId, yearId, term).then(data => {
      if (cancelled) return
      const nextStudents = data.students as Student[]
      const saved = data.rows as SavedRow[]
      const nextSettings = (data.settings || []) as EvaluationSetting[]
      const nextColumns = columnsFromSettings(nextSettings, kind, config.columns)
      const savedMap = Object.fromEntries(saved.map(row => [row.student_id as string, row]))
      const nextRows: Record<string, Record<string, string>> = {}

      for (const student of nextStudents) {
        const existing = savedMap[student.id] || {}
        nextRows[student.id] = {}
        for (const column of nextColumns) {
          const value = existing[column.key]
          nextRows[student.id][column.key] = value == null ? '' : String(value)
        }
      }

      setSettings(nextSettings)
      setStudents(nextStudents)
      setRows(nextRows)
      setDirty(false)
      setLoadingRows(false)
      if (data.error) notify('error', data.error)
    })
    return () => { cancelled = true }
  }, [kind, yearId, classroomId, term, config.columns])

  const summary = useMemo(() => {
    if (students.length === 0) return { completed: 0, percent: 0 }
    const completed = students.filter(student => columns.every(column => rows[student.id]?.[column.key])).length
    return { completed, percent: Math.round((completed / students.length) * 100) }
  }, [students, rows, columns])

  function setValue(studentId: string, key: string, value: string) {
    setRows(prev => ({ ...prev, [studentId]: { ...prev[studentId], [key]: value } }))
    setDirty(true)
  }

  function fillColumn(key: string, value: string) {
    setRows(prev => {
      const next = { ...prev }
      for (const student of students) next[student.id] = { ...next[student.id], [key]: value }
      return next
    })
    setDirty(true)
  }

  function fillButtonLabel(column: Column) {
    if (kind === 'character' && column.type === 'score') return `ข้อ${column.short} 3 ทั้งหมด`
    return `ทุกคน ${column.type === 'score' ? '3' : 'ผ่าน'}`
  }

  function clearAll() {
    setRows(prev => {
      const next = { ...prev }
      for (const student of students) {
        next[student.id] = {}
        for (const column of columns) next[student.id][column.key] = ''
      }
      return next
    })
    setDirty(true)
  }

  function rowTotal(studentId: string) {
    return columns.reduce((sum, column) => sum + (column.type === 'score' ? Number(rows[studentId]?.[column.key] || 0) : 0), 0)
  }

  async function handleSave() {
    if (!yearId || !classroomId) return
    setSaving(true)
    const payload = students.map(student => ({
      student_id: student.id,
      values: Object.fromEntries(columns.map(column => {
        const value = rows[student.id]?.[column.key]
        return [column.key, column.type === 'score' ? Number(value || 0) : value || null]
      })),
    }))
    const result = await saveEvaluationRows(kind, classroomId, yearId, term, payload)
    setSaving(false)
    if (result.error) {
      notify('error', result.error)
      return
    }
    setDirty(false)
    notify('success', `บันทึกการประเมิน ${result.count} คนเรียบร้อย`)
  }

  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  return (
    <div className="page-stack" style={{ ['--eval-accent' as string]: config.accent }}>
      <style>{STYLES}</style>
      <div className="eval-head">
        <div className="eval-mark">
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h4l2-7 4 14 2-7h4" />
          </svg>
        </div>
        <div>
          <h1 className="eval-title">ประเมินตามหลักสูตร · {config.title}</h1>
          <p className="eval-subtitle">{selectedClassroom ? `ห้อง ${selectedClassroom.level}/${selectedClassroom.room} · ภาคเรียนที่ ${term}/${selectedYear?.year_be || ''}` : config.subtitle}</p>
        </div>
      </div>

      <div className="control-card eval-filter">
        <div>
          <label className="form-label">ปีการศึกษา</label>
          <select className="form-input" value={yearId} onChange={event => setYearId(event.target.value)}>
            {years.map(year => <option key={year.id} value={year.id}>{year.year_be}{year.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">ระดับชั้น / ห้อง</label>
          <select className="form-input" value={classroomId} onChange={event => setClassroomId(event.target.value)} disabled={classrooms.length === 0}>
            {classrooms.length === 0 ? <option>— ไม่มีห้องเรียน —</option> : classrooms.map(room => <option key={room.id} value={room.id}>{room.level}/{room.room}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">ภาคเรียน</label>
          <select className="form-input" value={term} onChange={event => setTerm(Number(event.target.value) as 1 | 2)}>
            <option value={1}>ภาคเรียนที่ 1</option>
            <option value={2}>ภาคเรียนที่ 2</option>
          </select>
        </div>
        <div>
          <label className="form-label">ความคืบหน้า</label>
          <div className="badge badge-primary" style={{ width: 'fit-content' }}>{summary.completed}/{students.length} คน · {summary.percent}%</div>
        </div>
      </div>

      <div className="eval-tabs">
        {[1, 2].map(item => (
          <button key={item} type="button" className={`eval-tab ${term === item ? 'is-active' : ''}`} onClick={() => setTerm(item as 1 | 2)}>
            ภาคเรียนที่ {item}
          </button>
        ))}
        <button type="button" className="eval-tab" disabled>สรุปผล/ตัดเกรด</button>
      </div>

      <AlertModal />

      {!classroomId ? (
        <div className="eval-empty">เลือกห้องเรียนก่อน</div>
      ) : loadingRows ? (
        <div className="eval-empty">กำลังโหลดข้อมูล...</div>
      ) : students.length === 0 ? (
        <div className="eval-empty">ยังไม่มีนักเรียนในห้องนี้</div>
      ) : (
        <div className="eval-board">
          <div className="eval-board-head">
            <div>
              <div className="eval-board-title">{students.length} คน · {kind === 'activities' ? 'ทั้งปี' : `ภาคเรียนที่ ${term}`}</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{config.subtitle}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => window.print()}>พิมพ์รายงาน</button>
              <button type="button" className="btn btn-secondary" disabled={!canEdit} onClick={clearAll}>ล้าง</button>
            </div>
          </div>

          <div className="eval-table-wrap">
            {kind === 'reading' ? (
              <table className="eval-table eval-reading-table">
                <thead>
                  <tr>
                    <th rowSpan={4} className="sticky-no">เลขที่</th>
                    <th rowSpan={4} className="sticky-code">เลขประจำตัว</th>
                    <th rowSpan={4} className="sticky-name">ชื่อ - สกุล</th>
                    <th colSpan={readingColumns.length} className="eval-reading-group-head">
                      ผลประเมินอ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย
                    </th>
                    <th rowSpan={4} className="eval-reading-grand-cell">รวมทั้งหมด<br />{maxScore}</th>
                    <th colSpan={2} className="eval-reading-group-head">ผลการประเมิน</th>
                  </tr>
                  <tr>
                    {readingGroups.map(group => (
                      <th key={group.key} colSpan={group.columns.length} className="eval-reading-group-head">
                        {group.label}
                      </th>
                    ))}
                    <th rowSpan={3} className="eval-reading-sub-head">ระดับ</th>
                    <th rowSpan={3} className="eval-reading-sub-head">ผล</th>
                  </tr>
                  <tr>
                    {readingColumns.map((column, index) => (
                      <th key={readingTableColumnKey(column, index)} className="eval-reading-sub-head">
                        {readingTableColumnLabel(column)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {readingColumns.map((column, index) => (
                      <th key={`max-${readingTableColumnKey(column, index)}`} className="eval-reading-max-head">
                        {readingTableColumnMax(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => {
                    const studentRow = rows[student.id] || {}
                    const total = rowTotal(student.id)
                    const level = levelFromScore(total, maxScore)
                    const result = resultFromScore(total, maxScore)
                    return (
                      <tr key={student.id} style={student.status === 'ย้ายออก' ? { opacity: 0.55 } : undefined}>
                        <td className="sticky-no">{student.student_number}</td>
                        <td className="sticky-code">{student.student_code || '-'}</td>
                        <td className="sticky-name" style={{ fontWeight: 800 }}>
                          {student.prefix}{student.first_name} {student.last_name}
                          {student.status === 'ย้ายออก' && <span style={{ marginLeft: 6, color: '#dc2626', fontSize: 12 }}>({student.status})</span>}
                        </td>
                        {readingColumns.map((column, index) => {
                          if (column.kind === 'spacer') {
                            return <td key={readingTableColumnKey(column, index)} />
                          }
                          if (column.kind === 'total') {
                            return (
                              <td key={readingTableColumnKey(column, index)} className="eval-reading-total-cell">
                                {readingTableColumnValue(studentRow, column)}
                              </td>
                            )
                          }
                          return (
                            <td key={readingTableColumnKey(column, index)} className="eval-reading-score-cell">
                              <select
                                className="eval-select"
                                disabled={!canEdit}
                                value={studentRow[column.key] || ''}
                                onChange={event => setValue(student.id, column.key, event.target.value)}
                              >
                                {SCORE_OPTIONS.map(option => (
                                  <option key={option || 'empty'} value={option}>{option || '—'}</option>
                                ))}
                              </select>
                            </td>
                          )
                        })}
                        <td className="eval-reading-grand-cell">{total}</td>
                        <td className="eval-reading-level-cell">{level}</td>
                        <td className="eval-reading-result-cell" style={{ color: result === 'ไม่ผ่าน' ? '#dc2626' : '#059669' }}>
                          {result}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : kind === 'character' ? (
              <table className="eval-table eval-character-table">
                <thead>
                  <tr>
                    <th rowSpan={4} className="sticky-no">เลขที่</th>
                    <th rowSpan={4} className="sticky-code">เลขประจำตัว</th>
                    <th rowSpan={4} className="sticky-name">ชื่อ - สกุล</th>
                    <th colSpan={columns.length} className="eval-character-group-head">
                      ผลประเมินคุณลักษณะอันพึงประสงค์
                    </th>
                    <th colSpan={2} className="eval-character-group-head">ผลการประเมิน</th>
                  </tr>
                  <tr>
                    <th colSpan={columns.length} className="eval-character-sub-head">ข้อ / คะแนน</th>
                    <th rowSpan={3} className="eval-character-sub-head">ระดับ</th>
                    <th rowSpan={3} className="eval-character-sub-head">ผล</th>
                  </tr>
                  <tr>
                    {columns.map((column, index) => (
                      <th key={column.key} className="eval-character-sub-head" title={column.label}>
                        {column.short || index + 1}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {columns.map(column => (
                      <th key={`${column.key}-max`} className="eval-character-max-head">{column.maxScore}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => {
                    const total = rowTotal(student.id)
                    const level = levelFromScore(total, maxScore)
                    const result = resultFromScore(total, maxScore)
                    return (
                      <tr key={student.id} style={student.status === 'ย้ายออก' ? { opacity: 0.55 } : undefined}>
                        <td className="sticky-no">{student.student_number}</td>
                        <td className="sticky-code">{student.student_code || '-'}</td>
                        <td className="sticky-name" style={{ fontWeight: 800 }}>
                          {student.prefix}{student.first_name} {student.last_name}
                          {student.status === 'ย้ายออก' && <span style={{ marginLeft: 6, color: '#dc2626', fontSize: 12 }}>({student.status})</span>}
                        </td>
                        {columns.map(column => (
                          <td key={`${student.id}-${column.key}`} className="eval-character-score-cell">
                            <select
                              className="eval-select"
                              disabled={!canEdit}
                              value={rows[student.id]?.[column.key] || ''}
                              onChange={event => setValue(student.id, column.key, event.target.value)}
                            >
                              {SCORE_OPTIONS.map(option => (
                                <option key={option || 'empty'} value={option}>{option || '—'}</option>
                              ))}
                            </select>
                          </td>
                        ))}
                        <td className="eval-character-level-cell">{level}</td>
                        <td className="eval-character-result-cell" style={{ color: result === 'ไม่ผ่าน' ? '#dc2626' : '#059669' }}>
                          {result}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table className="eval-table">
                <thead>
                  <tr>
                    <th className="sticky-no">#</th>
                    <th className="sticky-name">ชื่อ - สกุล</th>
                    {columns.map(column => (
                      <th key={column.key} style={{ minWidth: column.type === 'score' ? 130 : 150 }}>
                        {column.short}
                        <button type="button" className="eval-col-fill" disabled={!canEdit} onClick={() => fillColumn(column.key, column.type === 'score' ? '3' : 'ผ่าน')}>
                          {fillButtonLabel(column)}
                        </button>
                      </th>
                    ))}
                    {kind !== 'activities' && <th style={{ width: 86 }}>รวม</th>}
                    {kind !== 'activities' && <th style={{ width: 92 }}>ผล</th>}
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => {
                    const total = rowTotal(student.id)
                    return (
                      <tr key={student.id} style={student.status === 'ย้ายออก' ? { opacity: 0.55 } : undefined}>
                        <td className="sticky-no">{student.student_number}</td>
                        <td className="sticky-name" style={{ fontWeight: 800 }}>
                          {student.prefix}{student.first_name} {student.last_name}
                          {student.status === 'ย้ายออก' && <span style={{ marginLeft: 6, color: '#dc2626', fontSize: 12 }}>({student.status})</span>}
                        </td>
                        {columns.map(column => (
                          <td key={column.key} style={{ textAlign: 'center' }}>
                            <select
                              className="eval-select"
                              disabled={!canEdit}
                              value={rows[student.id]?.[column.key] || ''}
                              onChange={event => setValue(student.id, column.key, event.target.value)}
                            >
                              {(column.type === 'score' ? SCORE_OPTIONS : RESULT_OPTIONS).map(option => (
                                <option key={option || 'empty'} value={option}>{option || '—'}</option>
                              ))}
                            </select>
                          </td>
                        ))}
                        {kind !== 'activities' && <td style={{ textAlign: 'center', fontWeight: 900 }}>{total}/{maxScore}</td>}
                        {kind !== 'activities' && <td style={{ textAlign: 'center', fontWeight: 900, color: total >= Math.ceil(maxScore * 0.5) ? '#059669' : '#dc2626' }}>{resultFromScore(total, maxScore)}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {canEdit && (
            <div className="eval-save">
              <span style={{ color: dirty ? '#d97706' : '#64748b', fontWeight: 800 }}>{dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกล่าสุดแล้ว'}</span>
              <LoadingButton loading={saving} onClick={handleSave} disabled={!dirty}>
                บันทึกการประเมิน
              </LoadingButton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
