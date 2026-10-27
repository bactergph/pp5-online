'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import Swal from 'sweetalert2'
import './score-entry.css'
import { usePathname } from 'next/navigation'
import {
  fetchScoreInit, fetchScoreClassrooms, fetchScoreSubjects, fetchScoreEntryData, saveScores,
} from './actions'
import DocumentSignaturePanel from '@/components/sign/DocumentSignaturePanel'
import LoadingButton from '@/components/LoadingButton'
import AppAlertModal from '@/components/AppAlertModal'
import { calcGrade, gradeLabel, gradeColor, RESULT_OPTIONS } from '@/lib/grade'
import { scoreTransferData, parseScoreTransfer } from '@/lib/score-transfer'

type Year = { id: string; year_be: number; is_active: boolean }
type Subject = { id: string; code: string; name: string }
type Classroom = { id: string; level: string; room: number }
type CS = { id: string; classroom_id: string; subject_id: string; order_number: number }
type Student = { id: string; student_number: number; student_code: string | null; prefix: string | null; first_name: string; last_name: string; status: string }
type Config = { unit_count: number; between_scores: number[]; midterm_max: number; final_max: number; total_max: number }
type Row = { unit_scores: number[]; midterm: number | null; final: number | null; result: string }

function clampScoreInput(raw: string, max: number): number | null {
  if (raw === '') return null
  const val = Number(raw)
  if (!Number.isFinite(val)) return null
  return Math.min(Math.max(0, val), max)
}

export default function ScoreEntryPage() {
  const pathname = usePathname()
  const [roleCanEdit, setCanEdit] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  const [entryMessage, setEntryMessage] = useState<string | undefined>()
  const [loadedEntry, setLoadedEntry] = useState('')
  const [userRole, setUserRole] = useState('')
  const [years, setYears] = useState<Year[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [items, setItems] = useState<CS[]>([])
  const [selectedCS, setSelectedCS] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)

  const [students, setStudents] = useState<Student[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [loading, setLoading] = useState(true)
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)
  const [importPreview, setImportPreview] = useState<{ rows: Record<string, Row>; context: string; filename: string } | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const transferContext = JSON.stringify([selectedYear, selectedClass, selectedCS, term, config?.between_scores, config?.midterm_max, config?.final_max])
  const liveTransferContext = useRef(transferContext)
  useEffect(() => { liveTransferContext.current = transferContext }, [transferContext])
  const canEdit = roleCanEdit && entryOpen && !loadingGrid && loadedEntry === `${selectedClass}:${selectedCS}:${term}`
  const [term1TermTotals, setTerm1TermTotals] = useState<Record<string, number>>({})
  const [yearTotalMax, setYearTotalMax] = useState(0)

  const [alertModal, setAlertModal] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)
  const skipYearFetch = useRef(true)
  const skipClassFetch = useRef(true)

  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]))

  useEffect(() => {
    void fetchScoreInit().then(d => {
      setCanEdit(d.canEdit)
      setUserRole(String(d.role || ''))
      setYears(d.years as Year[])
      setSubjects(d.subjects as Subject[])
      const list = (d.classrooms || []) as Classroom[]
      const csList = (d.classSubjects || []) as CS[]
      setClassrooms(list)
      setItems(csList)
      skipYearFetch.current = true
      skipClassFetch.current = true
      setSelectedYear(d.activeYearId || '')
      setSelectedClass(list[0]?.id || '')
      setSelectedCS(csList[0]?.id || '')
      if (csList.length === 0) {
        setStudents([])
        setConfig(null)
        setRows({})
      }
      setLoading(false)
    }).catch(() => { setLoading(false); setAlertModal({ type: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', message: 'กรุณาโหลดหน้าใหม่เพื่อลองอีกครั้ง' }) })
  }, [])

  useEffect(() => {
    if (!selectedYear) return
    if (skipYearFetch.current) {
      skipYearFetch.current = false
      return
    }
    let cancelled = false
    void fetchScoreClassrooms(selectedYear).then(cs => {
      if (cancelled) return
      const list = cs as Classroom[]
      skipClassFetch.current = false
      setClassrooms(list)
      setSelectedClass(list[0]?.id || '')
      setItems([])
      setSelectedCS('')
      if (list.length === 0) {
        setStudents([])
        setConfig(null)
        setRows({})
      }
    }).catch(() => { if (!cancelled) setEntryMessage('โหลดห้องเรียนไม่สำเร็จ กรุณาลองใหม่') })
    return () => { cancelled = true }
  }, [selectedYear])

  useEffect(() => {
    if (!selectedClass) return
    if (skipClassFetch.current) {
      skipClassFetch.current = false
      return
    }
    let cancelled = false
    void fetchScoreSubjects(selectedClass, term).then(data => {
      if (cancelled) return
      const list = data as CS[]
      setItems(list)
      setSelectedCS(current => list.some(item => item.id === current) ? current : (list[0]?.id || ''))
      if (list.length === 0) {
        setStudents([])
        setConfig(null)
        setRows({})
      }
    }).catch(() => { if (!cancelled) setEntryMessage('โหลดรายวิชาไม่สำเร็จ กรุณาลองใหม่') })
    return () => { cancelled = true }
  }, [selectedClass, term])

  async function changeSelection(update: () => void) {
    if (saving || transferBusy) return
    if (dirty) {
      const result = await Swal.fire({ title: 'ยังมีคะแนนที่ไม่ได้บันทึก', text: 'เปลี่ยนรายการจะทิ้งคะแนนที่แก้ไขในหน้านี้ ต้องการเปลี่ยนหรือไม่?', icon: 'warning', showCancelButton: true, confirmButtonText: 'เปลี่ยนและทิ้งการแก้ไข', cancelButtonText: 'กลับไปบันทึก', confirmButtonColor: '#b91c1c', reverseButtons: true })
      if (!result.isConfirmed) return
    }
    setSaveStatus('')
    update()
  }

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function notify(type: 'success' | 'error', text: string) {
    setAlertModal({
      type,
      title: type === 'success' ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ',
      message: text,
    })
  }

  useEffect(() => {
    if (!selectedClass || !selectedCS || !items.some(item => item.id === selectedCS && item.classroom_id === selectedClass)) return
    let cancelled = false

    void Promise.resolve().then(() => {
      if (cancelled) return null
      setLoadingGrid(true)
      return fetchScoreEntryData(selectedClass, selectedCS, term)
    }).then(d => {
      if (cancelled || !d) return
      setEntryOpen(d.entryOpen)
      setEntryMessage(d.entryMessage)
      setLoadedEntry(`${selectedClass}:${selectedCS}:${term}`)
      const cfg = d.config as Config | null
      setConfig(cfg && Array.isArray(cfg.between_scores) ? cfg : null)
      setStudents(d.students as Student[])
      const uc = cfg?.between_scores?.length || 0
      const scoreMap = Object.fromEntries((d.scores as Record<string, unknown>[]).map(s => [s.student_id as string, s]))
      const next: Record<string, Row> = {}
      for (const st of d.students as Student[]) {
        const s = scoreMap[st.id]
        const us = (s?.unit_scores || {}) as Record<string, number>
        next[st.id] = {
          unit_scores: Array.from({ length: uc }, (_, i) => (us[String(i + 1)] != null ? Number(us[String(i + 1)]) : NaN)),
          midterm: s?.midterm_score != null ? Number(s.midterm_score) : null,
          final: s?.final_score != null ? Number(s.final_score) : null,
          result: (s?.result as string) || 'เรียน',
        }
      }
      setRows(next)
      setDirty(false)
      if (term === 2) {
        const term1Map = Object.fromEntries(
          ((d.term1Scores || []) as Array<{ student_id: string; term_total: number | null }>)
            .map(item => [item.student_id, Number(item.term_total) || 0]),
        )
        const term1Max = Number((d.term1Config as { total_max?: number } | null)?.total_max) || 0
        setTerm1TermTotals(term1Map)
        setYearTotalMax(term1Max + (cfg?.total_max ?? 0))
      } else {
        setTerm1TermTotals({})
        setYearTotalMax(0)
      }
      setLoadingGrid(false)
    }).catch(() => {
      if (cancelled) return
      setEntryOpen(false)
      setEntryMessage('โหลดสถานะการบันทึกคะแนนไม่สำเร็จ กรุณาลองใหม่')
      setLoadingGrid(false)
    })

    return () => { cancelled = true }
  }, [selectedClass, selectedCS, term, items])

  const scoreConfigHref = useMemo(() => {
    const base = /\/scores\/?$/.test(pathname)
      ? pathname.replace(/\/scores\/?$/, '/score-config')
      : '/score-config'
    const params = new URLSearchParams()
    if (selectedYear) params.set('year', selectedYear)
    if (selectedClass) params.set('classroom', selectedClass)
    params.set('term', String(term))
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }, [pathname, selectedYear, selectedClass, term])

  function setUnit(sid: string, idx: number, raw: string) {
    const max = config?.between_scores[idx] ?? 0
    if (raw === '') {
      setRows(prev => { const r = prev[sid]; const u = [...r.unit_scores]; u[idx] = NaN; return { ...prev, [sid]: { ...r, unit_scores: u } } })
      setDirty(true); setSaveStatus('')
      return
    }
    const val = clampScoreInput(raw, max)
    if (val === null) return
    setRows(prev => { const r = prev[sid]; const u = [...r.unit_scores]; u[idx] = val; return { ...prev, [sid]: { ...r, unit_scores: u } } })
    setDirty(true); setSaveStatus('')
  }
  function setMid(sid: string, raw: string) {
    const max = config?.midterm_max ?? 0
    if (raw === '') {
      setRows(prev => ({ ...prev, [sid]: { ...prev[sid], midterm: null } }))
      setDirty(true); setSaveStatus('')
      return
    }
    const val = clampScoreInput(raw, max)
    if (val === null) return
    setRows(prev => ({ ...prev, [sid]: { ...prev[sid], midterm: val } }))
    setDirty(true); setSaveStatus('')
  }
  function setFin(sid: string, raw: string) {
    const max = config?.final_max ?? 0
    if (raw === '') {
      setRows(prev => ({ ...prev, [sid]: { ...prev[sid], final: null } }))
      setDirty(true); setSaveStatus('')
      return
    }
    const val = clampScoreInput(raw, max)
    if (val === null) return
    setRows(prev => ({ ...prev, [sid]: { ...prev[sid], final: val } }))
    setDirty(true); setSaveStatus('')
  }
  function setResult(sid: string, val: string) {
    setRows(prev => ({ ...prev, [sid]: { ...prev[sid], result: val } })); setDirty(true); setSaveStatus('')
  }

  function rowCalc(r: Row) {
    const between = r.unit_scores.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
    const midtermPart = (config?.midterm_max ?? 0) > 0 ? (r.midterm || 0) : 0
    const total = between + midtermPart + (r.final || 0)
    const grade = term !== 1 && r.result === 'เรียน' ? calcGrade(total, config?.total_max || 100) : null
    return { between, total, grade }
  }

  function yearTotalFor(studentId: string, termTotal: number) {
    return (term1TermTotals[studentId] ?? 0) + termTotal
  }

  async function exportScores() {
    if (!config || loadingGrid || loadedEntry !== `${selectedClass}:${selectedCS}:${term}`) return
    setTransferBusy(true)
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet(scoreTransferData(students, rows, config, term))
      sheet['!cols'] = [{ wch: 38 }, { wch: 8 }, { wch: 32 }, ...Array.from({ length: config.between_scores.length + 3 }, () => ({ wch: 24 }))]
      XLSX.utils.book_append_sheet(workbook, sheet, 'คะแนน')
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['รูปแบบ', 'pp5-scores-v1'], ['อ้างอิง (ห้ามแก้)', transferContext],
        ['วิธีใช้', 'กรอกคะแนนในแผ่นคะแนน แล้วนำเข้าในปี ห้อง วิชา และภาคเรียนเดิม ห้ามแก้รหัสนักเรียนหรือหัวคอลัมน์'],
        ['ช่องว่าง', 'ช่องคะแนนที่เว้นว่างจะล้างคะแนนเดิมของนักเรียนแถวนั้น'],
        ['ผลการเรียน', RESULT_OPTIONS.join(', ')], ['สถานะข้อมูล', dirty ? 'รวมคะแนนที่แก้ไขในหน้านี้และยังไม่ได้บันทึก' : 'คะแนนในหน้าที่เลือก'],
      ]), 'ข้อมูลอ้างอิง')
      const subject = subjectMap[items.find(item => item.id === selectedCS)?.subject_id || '']
      XLSX.writeFile(workbook, `คะแนน_${years.find(year => year.id === selectedYear)?.year_be}_เทอม${term}_${subject?.code || 'วิชา'}.xlsx`)
    } catch {
      setAlertModal({ type: 'error', title: 'ส่งออกไม่สำเร็จ', message: 'กรุณาลองดาวน์โหลดอีกครั้ง' })
    } finally { setTransferBusy(false) }
  }

  async function importScores(file: File) {
    if (!config || !canEdit || saving) return
    const context = transferContext
    setTransferBusy(true)
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error('เลือกไฟล์ Excel .xlsx ขนาดไม่เกิน 5 MB ที่ดาวน์โหลดจากหน้านี้')
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true })
      const metadata = workbook.Sheets['ข้อมูลอ้างอิง']
      const sheet = workbook.Sheets['คะแนน']
      if (!metadata || !sheet || metadata.A1?.v !== 'รูปแบบ' || metadata.B1?.v !== 'pp5-scores-v1' || metadata.B2?.v !== context) throw new Error('ไฟล์ไม่ตรงกับปี ห้อง วิชา ภาคเรียน หรือคะแนนเต็มที่เลือก กรุณาดาวน์โหลดไฟล์ใหม่')
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
      if (range.e.r > 5000 || range.e.c > config.between_scores.length + 10) throw new Error('จำนวนแถวหรือคอลัมน์เกินแบบฟอร์ม กรุณาใช้ไฟล์ที่ดาวน์โหลดจากหน้านี้')
      if (Object.values(sheet).some(cell => cell && typeof cell === 'object' && 'f' in cell)) throw new Error('กรุณาใช้ค่าคะแนนตัวเลขแทนสูตร Excel ก่อนนำเข้า')
      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
      const imported = parseScoreTransfer(data, students, config, term, [...RESULT_OPTIONS])
      if (liveTransferContext.current !== context) throw new Error('รายการที่เลือกเปลี่ยนแล้ว กรุณานำเข้าใหม่ในรายการที่ต้องการ')
      setImportPreview({ rows: imported, context, filename: file.name })
    } catch (error) {
      setAlertModal({ type: 'error', title: 'นำเข้าไม่สำเร็จ', message: error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ' })
    } finally { setTransferBusy(false) }
  }

  function applyImportedScores() {
    if (!importPreview || !canEdit || saving || importPreview.context !== transferContext) return
    setRows(previous => ({ ...previous, ...importPreview.rows }))
    setDirty(true); setSaveStatus('')
    setImportPreview(null)
  }

  async function handleSave() {
    if (!config || !canEdit || saving) return
    const showMidtermOnSave = (config.midterm_max ?? 0) > 0
    for (const st of students) {
      const r = rows[st.id]
      if (!r) continue
      for (let i = 0; i < r.unit_scores.length; i++) {
        const val = r.unit_scores[i]
        const max = config.between_scores[i] ?? 0
        if (overMax(val, max)) {
          notify('error', `คะแนนระหว่างเรียนครั้งที่ ${i + 1} ของ ${st.first_name} เกินคะแนนเต็ม (${max})`)
          return
        }
      }
      if (showMidtermOnSave && r.midterm != null && overMax(r.midterm, config.midterm_max)) {
        notify('error', `คะแนนกลางภาคของ ${st.first_name} เกินคะแนนเต็ม (${config.midterm_max})`)
        return
      }
      if (r.final != null && overMax(r.final, config.final_max)) {
        notify('error', `คะแนนปลายภาคของ ${st.first_name} เกินคะแนนเต็ม (${config.final_max})`)
        return
      }
    }
    setSaving(true)
    setAlertModal(null)
    const payload = students.map(st => {
      const r = rows[st.id]
      const { between, total, grade } = rowCalc(r)
      const unitObj: Record<string, number> = {}
      r.unit_scores.forEach((v, i) => { if (Number.isFinite(v)) unitObj[String(i + 1)] = v })
      return {
        student_id: st.id,
        unit_scores: unitObj,
        between_total: between,
        midterm_score: (config.midterm_max ?? 0) > 0 ? r.midterm : null,
        final_score: r.final,
        term_total: total,
        year_total: term === 2 ? yearTotalFor(st.id, total) : null,
        grade: term === 1 ? null : grade,
        result: term === 1 ? 'เรียน' : r.result,
      }
    })
    try {
      const { error } = await saveScores(selectedCS, term, payload)
      if (error) { setSaveStatus('บันทึกไม่สำเร็จ คะแนนที่แก้ไขยังอยู่ กรุณาลองอีกครั้ง'); notify('error', error); return }
      setDirty(false)
      setSaveStatus('บันทึกแล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }))
    } catch {
      setSaveStatus('บันทึกไม่สำเร็จ คะแนนที่แก้ไขยังอยู่ กรุณาลองอีกครั้ง')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  const uc = config?.between_scores?.length || 0
  const overMax = (val: number, max: number) => Number.isFinite(val) && val > max
  const selectedSubject = selectedCS ? subjectMap[items.find(item => item.id === selectedCS)?.subject_id || ''] : null
  const selectedClassroom = classrooms.find(item => item.id === selectedClass)
  const betweenMax = config?.between_scores.reduce((a, b) => a + b, 0) || 0
  const showMidterm = (config?.midterm_max ?? 0) > 0
  const showGradeResult = term !== 1
  const showYearTotal = term === 2

  return (
    <>
      <AppAlertModal
        open={alertModal !== null}
        type={alertModal?.type || 'success'}
        title={alertModal?.title || ''}
        message={alertModal?.message}
        onClose={() => setAlertModal(null)}
      />
      {importPreview && (
        <div className="modal-backdrop">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="score-import-title" style={{ maxWidth: 600, maxHeight: '85vh', overflow: 'auto' }}>
            <h2 id="score-import-title" style={{ fontSize: 20, fontWeight: 700 }}>ตรวจสอบก่อนนำเข้าคะแนน</h2>
            <p style={{ overflowWrap: 'anywhere' }}>{importPreview.filename}</p>
            <p>ปี {years.find(year => year.id === selectedYear)?.year_be} · ห้อง {selectedClassroom?.level}/{selectedClassroom?.room} · {selectedSubject?.name} · ภาคเรียนที่ {term}</p>
            <p>นักเรียน {Object.keys(importPreview.rows).length} คน · แสดงตัวอย่างไม่เกิน 8 คน</p>
            <p>คะแนนของนักเรียนในไฟล์จะถูกแทนที่ รวมถึงช่องว่างที่จะล้างคะแนนเดิม นักเรียนที่ไม่อยู่ในไฟล์จะคงคะแนนเดิม</p>
            <div style={{ overflowX: 'auto', margin: '16px 0' }}>
              <table className="thai-table"><thead><tr><th>นักเรียน</th><th>ระหว่างเรียน</th>{showMidterm && <th>กลางภาค</th>}<th>ปลายภาค</th>{term === 2 && <th>ผลการเรียน</th>}</tr></thead><tbody>
                {students.filter(student => importPreview.rows[student.id]).slice(0, 8).map(student => {
                  const row = importPreview.rows[student.id]
                  return <tr key={student.id}><td>{student.first_name} {student.last_name}</td><td>{row.unit_scores.map(value => Number.isFinite(value) ? value : 'ว่าง').join(' / ')}</td>{showMidterm && <td>{row.midterm ?? 'ว่าง'}</td>}<td>{row.final ?? 'ว่าง'}</td>{term === 2 && <td>{row.result}</td>}</tr>
                })}
              </tbody></table>
            </div>
            <p style={{ color: '#92400e' }}>ยืนยันแล้วคะแนนจะแสดงในตาราง กรุณาตรวจสอบและกด “บันทึกคะแนน” เพื่อบันทึกเข้าระบบ</p>
            {importPreview.context !== transferContext && <p role="alert">รายการที่เลือกเปลี่ยนแล้ว กรุณายกเลิกและนำเข้าใหม่</p>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setImportPreview(null)}>ยกเลิก</button>
              <button className="btn btn-primary" disabled={!canEdit || saving || importPreview.context !== transferContext} onClick={applyImportedScores}>นำคะแนนลงตาราง</button>
            </div>
          </section>
        </div>
      )}
    <div className="page-stack score-entry-page">

      {entryMessage && !loadingGrid && (
        <div className="control-card" role="status" style={{ color: '#92400E', background: '#FFFBEB' }}>
          {entryMessage} · ดูคะแนนเดิมได้ แต่ไม่สามารถแก้ไขหรือบันทึกคะแนน
        </div>
      )}
      <div className="score-entry-head">
        <div className="score-entry-title">
          <div className="score-entry-title-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11h6M9 15h6M9 7h6M5 3h14v18H5z" />
            </svg>
          </div>
          <div>
            <h1>บันทึกคะแนน</h1>
            <p>กรอกคะแนนตามสัดส่วนที่กำหนด · ปีการศึกษา {years.find(y => y.id === selectedYear)?.year_be || ''}</p>
          </div>
        </div>
      </div>

      {years.length === 0 ? (
        <div className="alert alert-error">ยังไม่มีปีการศึกษา — ไปเพิ่มที่ ตั้งค่าระบบ → ปีการศึกษา ก่อน</div>
      ) : (
        <>
          <div className="score-entry-filter-card">
            <div className="score-entry-field">
              <label htmlFor="score-year">ปีการศึกษา</label>
              <select id="score-year" disabled={saving || transferBusy} value={selectedYear} onChange={e => { const value = e.target.value; void changeSelection(() => { setSelectedYear(value); setSelectedClass(''); setSelectedCS(''); setClassrooms([]); setItems([]); setStudents([]); setConfig(null); setRows({}); setDirty(false); }); }}>
                {years.map(y => <option key={y.id} value={y.id}>{y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
              </select>
            </div>
            <div className="score-entry-field"><label htmlFor="score-term">ภาคเรียน</label><select id="score-term" value={term} disabled={saving || transferBusy} onChange={e => { const value = Number(e.target.value) as 1 | 2; void changeSelection(() => setTerm(value)) }}><option value={1}>ภาคเรียนที่ 1</option><option value={2}>ภาคเรียนที่ 2</option></select></div>
            <div className="score-entry-field">
              <label htmlFor="score-class">ห้องเรียน</label>
              <select id="score-class" value={selectedClass} onChange={e => { const value = e.target.value; void changeSelection(() => { setSelectedClass(value); setSelectedCS(''); setItems([]); setStudents([]); setConfig(null); setRows({}); setDirty(false); }); }} disabled={saving || transferBusy || classrooms.length === 0}>
                <option value="">{classrooms.length === 0 ? '— ไม่มีห้องที่บันทึกได้ —' : '— เลือกห้อง —'}</option>
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.level}/{c.room}</option>)}
              </select>
            </div>
            <div className="score-entry-field">
              <label htmlFor="score-subject">รายวิชา</label>
              <select id="score-subject" value={selectedCS} onChange={e => { const value = e.target.value; void changeSelection(() => setSelectedCS(value)) }} disabled={saving || transferBusy || items.length === 0}>
                {items.length === 0 ? <option>— ไม่มีวิชา —</option> : items.map(it => {
                  const s = subjectMap[it.subject_id]
                  return <option key={it.id} value={it.id}>[{s?.code}] {s?.name}</option>
                })}
              </select>
            </div>
          </div>

          {classrooms.length === 0 ? (
            <div className="alert alert-error">
              {userRole === 'teacher'
                ? 'ยังไม่มีห้องที่คุณได้รับมอบหมายสอนในปีนี้ — ตรวจสอบที่เมนู "จัดครูเข้าสอน"'
                : 'ยังไม่มีชั้นเรียนในปีนี้ — ไปเพิ่มที่เมนู "ชั้นเรียน" ก่อน'}
            </div>
          ) : items.length === 0 ? (
            <div className="alert alert-error">ไม่มีวิชาให้บันทึกในห้องนี้ (ยังไม่เปิดสอน หรือคุณไม่ได้สอนวิชาในห้องนี้)</div>
          ) : loadingGrid ? (
            <div className="text-center py-10 text-gray-500">กำลังโหลดคะแนน...</div>
          ) : !config ? (
            <div className="alert alert-error score-config-cta">
              <div className="score-config-cta-text">
                ยังไม่ได้ตั้ง <b>อัตราส่วนคะแนน</b>
                {selectedSubject ? <> ของวิชา <b>[{selectedSubject.code}] {selectedSubject.name}</b></> : ' ของวิชานี้'}
                {' '}(ภาคเรียนที่ {term}) — กำหนดอัตราส่วนก่อนจึงจะกรอกคะแนนได้
              </div>
              {canEdit && selectedClass && (
                <Link href={scoreConfigHref} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                  กำหนดอัตราส่วนทุกวิชาในห้องนี้
                </Link>
              )}
            </div>
          ) : students.length === 0 ? (
            <div className="alert alert-error">ยังไม่มีนักเรียนในห้องนี้</div>
          ) : (
            <>
              <div className="score-summary-pills">
                <span>เต็มระหว่างเรียน <b>{betweenMax}</b></span>
                {showMidterm && <span>กลางภาค <b>{config.midterm_max}</b></span>}
                <span>ปลายภาค <b>{config.final_max}</b></span>
                <span>รวมทั้งหมด <b>{config.total_max}</b></span>
                {showYearTotal && yearTotalMax > 0 && <span>รวมทั้งปีการศึกษา <b>{yearTotalMax}</b></span>}
              </div>

              <div className="control-card score-transfer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div><strong>นำเข้า / ส่งออกคะแนน</strong><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>ดาวน์โหลด Excel ของห้อง วิชา และภาคเรียนที่เลือก กรอกคะแนนแล้วนำกลับเข้า</p></div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" disabled={transferBusy || saving || loadedEntry !== `${selectedClass}:${selectedCS}:${term}`} onClick={() => void exportScores()}>ส่งออก Excel</button>
                  <button className="btn btn-secondary" disabled={!canEdit || transferBusy || saving} onClick={() => importInput.current?.click()}>{transferBusy ? 'กำลังจัดการไฟล์…' : 'นำเข้าคะแนน'}</button>
                  <input ref={importInput} type="file" accept=".xlsx" hidden aria-label="เลือกไฟล์คะแนน Excel" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importScores(file) }} />
                </div>
              </div>

              {selectedCS && (
                <DocumentSignaturePanel
                  variant="pp5_subject"
                  classSubjectId={selectedCS}
                  reportTerm={term}
                  disabled={dirty}
                  compact
                />
              )}

              <div className="score-grid-card">
                <div className="score-grid-top">
                  <div>
                    <strong>รายวิชา: {selectedSubject ? `${selectedSubject.code} ${selectedSubject.name}` : '-'}</strong>
                    <span> · ห้อง {selectedClassroom ? `${selectedClassroom.level}/${selectedClassroom.room}` : '-'}</span>
                  </div>
                </div>
                <p className="score-keyboard-hint" id="score-grid-help">คลิกช่องเพื่อกรอกคะแนน · กด Tab ไปช่องถัดไป · เลื่อนตารางเพื่อดูคอลัมน์เพิ่มเติม</p>
                <div className="score-table-wrap" tabIndex={0} role="region" aria-label="ตารางคะแนนนักเรียน" aria-describedby="score-grid-help">
                <table className="score-entry-table">
                  <thead>
                    <tr>
                      <th className="score-sticky-no">#</th>
                      <th className="score-sticky-name">ชื่อ-สกุล</th>
                      <th colSpan={uc} className="score-unit-head">คะแนนระหว่างเรียน</th>
                      <th className="score-unit-head">รวมระหว่างเรียน</th>
                      {showMidterm && <th className="score-mid-head">กลางภาค</th>}
                      <th className="score-final-head">ปลายภาค</th>
                      <th className="score-total-head">รวมทั้งหมด</th>
                      {showYearTotal && <th className="score-year-head">รวมทั้งปีการศึกษา</th>}
                      {showGradeResult && <th>เกรด</th>}
                      {showGradeResult && <th>ผล</th>}
                    </tr>
                    <tr>
                      <th className="score-sticky-no">ที่</th>
                      <th className="score-sticky-name">ชื่อ-สกุล</th>
                      {Array.from({ length: uc }, (_, i) => (
                        <th key={i} style={{ textAlign: 'center', width: 58 }}>
                          {i + 1}<br /><span className="score-max-label" style={{ fontSize: 10 }}>({config.between_scores[i]})</span>
                        </th>
                      ))}
                      <th className="score-unit-head"><span className="score-max-label">({betweenMax})</span></th>
                      {showMidterm && <th className="score-mid-head"><span className="score-max-label">({config.midterm_max})</span></th>}
                      <th className="score-final-head"><span className="score-max-label">({config.final_max})</span></th>
                      <th className="score-total-head"><span className="score-max-label">({config.total_max})</span></th>
                      {showYearTotal && <th className="score-year-head"><span className="score-max-label">({yearTotalMax || '-'})</span></th>}
                      {showGradeResult && <th>-</th>}
                      {showGradeResult && <th>-</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(st => {
                      const r = rows[st.id]; if (!r) return null
                      const { total, grade } = rowCalc(r)
                      const inactive = st.status === 'ย้ายออก'
                      return (
                        <tr key={st.id} style={inactive ? { opacity: 0.5 } : undefined}>
                          <td className="score-sticky-no">{st.student_number}</td>
                          <td className="score-sticky-name" style={{ fontWeight: 700 }}>
                            {st.prefix}{st.first_name} {st.last_name}
                            {inactive && <span style={{ fontSize: 11, color: '#DC2626', marginLeft: 6 }}>({st.status})</span>}
                          </td>
                          {r.unit_scores.map((u, i) => {
                            const max = config.between_scores[i]
                            return (
                              <td key={i} style={{ textAlign: 'center' }}>
                                <input aria-label={`${st.first_name} ${st.last_name} หน่วยที่ ${i + 1} เต็ม ${max}`} type="number" min={0} max={max} disabled={!canEdit || saving} value={Number.isFinite(u) ? u : ''}
                                  onChange={e => setUnit(st.id, i, e.target.value)} className={`score-input ${overMax(u, max) ? 'is-error' : ''}`} />
                              </td>
                            )
                          })}
                          <td style={{ textAlign: 'center', background: '#ECFDF5', fontWeight: 900, color: '#047857' }}>{rowCalc(r).between}</td>
                          {showMidterm && (
                            <td style={{ textAlign: 'center', background: '#EFF6FF' }}>
                              <input aria-label={`${st.first_name} ${st.last_name} กลางภาค`} type="number" min={0} max={config.midterm_max} disabled={!canEdit || saving} value={r.midterm ?? ''}
                                onChange={e => setMid(st.id, e.target.value)} className={`score-input ${overMax(r.midterm ?? NaN, config.midterm_max) ? 'is-error' : ''}`} />
                            </td>
                          )}
                          <td style={{ textAlign: 'center', background: '#EFF6FF' }}>
                            <input aria-label={`${st.first_name} ${st.last_name} ปลายภาค`} type="number" min={0} max={config.final_max} disabled={!canEdit || saving} value={r.final ?? ''}
                              onChange={e => setFin(st.id, e.target.value)} className={`score-input ${overMax(r.final ?? NaN, config.final_max) ? 'is-error' : ''}`} />
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 900 }}>{total}</td>
                          {showYearTotal && (
                            <td style={{ textAlign: 'center', background: '#FDF2F8', fontWeight: 900, color: '#BE185D' }}>
                              {yearTotalFor(st.id, total)}
                            </td>
                          )}
                          {showGradeResult && (
                            <td style={{ textAlign: 'center', fontWeight: 800, color: grade != null ? gradeColor(grade) : 'var(--text-3)' }}>
                              {r.result === 'เรียน' ? (grade != null ? gradeLabel(grade) : '-') : r.result}
                            </td>
                          )}
                          {showGradeResult && (
                            <td style={{ textAlign: 'center' }}>
                              <select aria-label={`${st.first_name} ${st.last_name} ผลการเรียน`} value={r.result} disabled={!canEdit || saving} onChange={e => setResult(st.id, e.target.value)}
                                className="score-result-select">
                                {RESULT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
                {canEdit && (
                  <div className="score-save-bar">
                    <span role="status" aria-live="polite" style={{ fontSize: 14, color: dirty ? '#D97706' : '#64748B', fontWeight: 800 }}>
                      {saving ? 'กำลังบันทึกคะแนน…' : saveStatus || (dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'ข้อมูลพร้อมแก้ไข')}
                    </span>
                    <LoadingButton loading={saving} onClick={handleSave} disabled={!dirty}>
                      บันทึกคะแนน ภาคเรียนที่ {term}
                    </LoadingButton>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
    </>
  )
}
