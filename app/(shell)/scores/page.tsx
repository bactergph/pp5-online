'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  fetchScoreInit, fetchScoreClassrooms, fetchScoreSubjects, fetchScoreEntryData, saveScores,
} from './actions'
import DocumentSignaturePanel from '@/components/sign/DocumentSignaturePanel'
import LoadingButton from '@/components/LoadingButton'
import AppAlertModal from '@/components/AppAlertModal'
import { calcGrade, gradeLabel, gradeColor, RESULT_OPTIONS } from '@/lib/grade'

type Year = { id: string; year_be: number; is_active: boolean }
type Subject = { id: string; code: string; name: string }
type Classroom = { id: string; level: string; room: number }
type CS = { id: string; subject_id: string; order_number: number }
type Student = { id: string; student_number: number; prefix: string | null; first_name: string; last_name: string; status: string }
type Config = { unit_count: number; between_scores: number[]; midterm_max: number; final_max: number; total_max: number }
type Row = { unit_scores: number[]; midterm: number | null; final: number | null; result: string }

function clampScoreInput(raw: string, max: number): number | null {
  if (raw === '') return null
  const val = Number(raw)
  if (!Number.isFinite(val)) return null
  return Math.min(Math.max(0, val), max)
}

const SCORE_ENTRY_STYLES = `
  .score-entry-page { gap: 14px; }
  .score-entry-head {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .score-entry-title { display: flex; align-items: center; gap: 12px; }
  .score-entry-title-mark {
    display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px;
    color: #C49212; background: #F3E8FF;
  }
  .score-entry-title h1 { margin: 0; color: #111827; font-size: 22px; font-weight: 900; line-height: 1.1; }
  .score-entry-title p { margin: 4px 0 0; color: #64748B; font-size: 12.5px; font-weight: 700; }
  .score-entry-filter-card {
    display: grid; grid-template-columns: 140px 160px minmax(280px, 1fr);
    gap: 12px; align-items: end; padding: 14px;
    border: 1px solid #E5E7EB; border-radius: 14px; background: #FFFFFF;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
  }
  .score-entry-field { display: grid; gap: 5px; }
  .score-entry-field label { color: #475569; font-size: 11px; font-weight: 900; }
  .score-entry-field select {
    min-height: 36px; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0 10px;
    background: #FFFFFF; color: #0F172A; font-size: 13px; font-weight: 800;
  }
  .score-entry-tabs {
    display: flex; align-items: center; gap: 18px; padding: 6px 0 0; border-bottom: 1px solid #E5E7EB;
  }
  .score-entry-tab {
    border: 0; background: transparent; padding: 10px 4px; color: #64748B;
    font-size: 13px; font-weight: 900; cursor: pointer; border-bottom: 2px solid transparent;
  }
  .score-entry-tab.is-active { color: #6D28D9; border-bottom-color: #C49212; }
  .score-summary-pills { display: flex; gap: 8px; flex-wrap: wrap; }
  .score-summary-pills span {
    display: inline-flex; align-items: center; gap: 4px; padding: 7px 10px;
    border-radius: 999px; background: #F8FAFC; color: #475569;
    font-size: 12px; font-weight: 800; border: 1px solid #E2E8F0;
  }
  .score-grid-card {
    overflow: hidden; border: 1px solid #E5E7EB; border-radius: 14px;
    background: #FFFFFF; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
  }
  .score-grid-top {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 12px 14px; border-bottom: 1px solid #E5E7EB; background: #FFFFFF;
  }
  .score-grid-top strong { color: #334155; font-size: 13px; font-weight: 900; }
  .score-grid-top span { color: #64748B; font-size: 12px; font-weight: 700; }
  .score-hint {
    margin: 0; padding: 10px 14px; border-bottom: 1px solid #FDE68A;
    background: #FEFCE8; color: #92400E; font-size: 12px; font-weight: 800;
  }
  .score-table-wrap { overflow: auto; max-width: 100%; }
  .score-entry-table { width: 100%; min-width: 980px; border-collapse: separate; border-spacing: 0; white-space: nowrap; }
  .score-entry-table th, .score-entry-table td {
    border-right: 1px solid #E5E7EB; border-bottom: 1px solid #E5E7EB;
    padding: 8px 8px; font-size: 12px; color: #334155; background: #FFFFFF;
  }
  .score-entry-table th { text-align: center; font-weight: 900; background: #F8FAFC; }
  .score-entry-table .score-sticky-no { position: sticky; left: 0; z-index: 3; width: 46px; min-width: 46px; text-align: center; background: #FFFFFF; box-shadow: 1px 0 0 #E2E8F0; }
  .score-entry-table .score-sticky-name {
    position: sticky; left: 46px; z-index: 3; min-width: 148px; max-width: 190px;
    text-align: left; background: #FFFFFF; box-shadow: 1px 0 0 #E2E8F0, 10px 0 18px rgba(15,23,42,0.03);
  }
  .score-entry-table thead .score-sticky-no,
  .score-entry-table thead .score-sticky-name { z-index: 5; background: #F8FAFC; }
  .score-max-label { color: #C49212 !important; font-weight: 900; }
  .score-unit-head { background: #ECFDF5 !important; color: #047857 !important; }
  .score-mid-head { background: #FEF3C7 !important; color: #92400E !important; }
  .score-final-head { background: #F5EDE3 !important; color: #6B4F32 !important; }
  .score-total-head { background: #EDE9FE !important; color: #5B21B6 !important; }
  .score-year-head { background: #FCE7F3 !important; color: #BE185D !important; }
  .score-input {
    width: 50px; border: 1px solid #E5E7EB; border-radius: 6px; padding: 5px 3px;
    text-align: center; color: #581C87; background: #FFFFFF; font: inherit; font-size: 12px;
  }
  .score-input.is-error { border-color: #DC2626; background: #FEF2F2; }
  .score-result-select {
    border: 1px solid #E5E7EB; border-radius: 6px; padding: 5px; color: #334155; background: #FFFFFF; font: inherit; font-size: 12px;
  }
  .score-save-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 12px 14px; border-top: 1px solid #E5E7EB; background: #F8FAFC;
  }
  .score-config-cta {
    display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
  }
  .score-config-cta-text { flex: 1; min-width: 220px; }
  @media (max-width: 900px) {
    .score-entry-filter-card { grid-template-columns: 1fr; }
    .score-entry-head { align-items: flex-start; flex-direction: column; }
  }
  /* มือถือ: คอลัมน์เลขที่/ชื่อ ให้เท่ากับเวลาเรียนธุรการชั้น (36px / 88px) */
  @media (max-width: 760px) {
    .score-entry-table { min-width: 720px; }
    .score-entry-table th, .score-entry-table td { padding: 6px 4px; font-size: 11px; }
    .score-entry-table .score-sticky-no {
      left: 0;
      width: 36px;
      min-width: 36px;
      max-width: 36px;
      padding-left: 4px !important;
      padding-right: 4px !important;
    }
    .score-entry-table .score-sticky-name {
      left: 36px;
      width: 88px;
      min-width: 88px;
      max-width: 88px;
      padding-left: 6px !important;
      padding-right: 6px !important;
      font-size: 11px;
      white-space: normal;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .score-input { width: 42px; min-height: 34px; font-size: 12px; padding: 4px 2px; }
  }
`

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
    })
  }, [])

  useEffect(() => {
    if (!selectedYear) return
    if (skipYearFetch.current) {
      skipYearFetch.current = false
      return
    }
    void fetchScoreClassrooms(selectedYear).then(cs => {
      const list = cs as Classroom[]
      skipClassFetch.current = true
      setClassrooms(list)
      setSelectedClass(list[0]?.id || '')
      setItems([])
      setSelectedCS('')
      if (list.length === 0) {
        setStudents([])
        setConfig(null)
        setRows({})
      }
    })
  }, [selectedYear])

  useEffect(() => {
    if (!selectedClass) return
    if (skipClassFetch.current) {
      skipClassFetch.current = false
      return
    }
    void fetchScoreSubjects(selectedClass).then(data => {
      const list = data as CS[]
      setItems(list)
      setSelectedCS(list[0]?.id || '')
      if (list.length === 0) {
        setStudents([])
        setConfig(null)
        setRows({})
      }
    })
  }, [selectedClass])

  function notify(type: 'success' | 'error', text: string) {
    setAlertModal({
      type,
      title: type === 'success' ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ',
      message: text,
    })
  }

  useEffect(() => {
    if (!selectedClass || !selectedCS) return
    let cancelled = false

    void fetchScoreEntryData(selectedClass, selectedCS, term).then(d => {
      if (cancelled) return
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

    void Promise.resolve().then(() => {
      if (!cancelled) setLoadingGrid(true)
    })
    return () => { cancelled = true }
  }, [selectedClass, selectedCS, term])

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
      setDirty(true)
      return
    }
    const val = clampScoreInput(raw, max)
    if (val === null) return
    setRows(prev => { const r = prev[sid]; const u = [...r.unit_scores]; u[idx] = val; return { ...prev, [sid]: { ...r, unit_scores: u } } })
    setDirty(true)
  }
  function setMid(sid: string, raw: string) {
    const max = config?.midterm_max ?? 0
    if (raw === '') {
      setRows(prev => ({ ...prev, [sid]: { ...prev[sid], midterm: null } }))
      setDirty(true)
      return
    }
    const val = clampScoreInput(raw, max)
    if (val === null) return
    setRows(prev => ({ ...prev, [sid]: { ...prev[sid], midterm: val } }))
    setDirty(true)
  }
  function setFin(sid: string, raw: string) {
    const max = config?.final_max ?? 0
    if (raw === '') {
      setRows(prev => ({ ...prev, [sid]: { ...prev[sid], final: null } }))
      setDirty(true)
      return
    }
    const val = clampScoreInput(raw, max)
    if (val === null) return
    setRows(prev => ({ ...prev, [sid]: { ...prev[sid], final: val } }))
    setDirty(true)
  }
  function setResult(sid: string, val: string) {
    setRows(prev => ({ ...prev, [sid]: { ...prev[sid], result: val } })); setDirty(true)
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

  async function handleSave() {
    if (!config || !canEdit) return
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
    const { error } = await saveScores(selectedCS, term, payload)
    setSaving(false)
    if (error) { notify('error', error); return }
    setDirty(false)
    notify('success', `บันทึกคะแนน ${payload.length} คน · ภาคเรียนที่ ${term} เรียบร้อยแล้ว`)
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
    <div className="page-stack score-entry-page">
      <style>{SCORE_ENTRY_STYLES}</style>
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
            <p>ตั้งคะแนนเต็มจากสัดส่วนคะแนนที่ตั้งไว้ · ปีปัจจุบัน {years.find(y => y.id === selectedYear)?.year_be || ''}</p>
          </div>
        </div>
      </div>

      {years.length === 0 ? (
        <div className="alert alert-error">ยังไม่มีปีการศึกษา — ไปเพิ่มที่ ตั้งค่าระบบ → ปีการศึกษา ก่อน</div>
      ) : (
        <>
          <div className="score-entry-filter-card">
            <div className="score-entry-field">
              <label>ปีการศึกษา</label>
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                {years.map(y => <option key={y.id} value={y.id}>{y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
              </select>
            </div>
            <div className="score-entry-field">
              <label>ห้องเรียน</label>
              <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} disabled={classrooms.length === 0}>
                <option value="">{classrooms.length === 0 ? '— ไม่มีห้องที่บันทึกได้ —' : '— เลือกห้อง —'}</option>
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.level}/{c.room}</option>)}
              </select>
            </div>
            <div className="score-entry-field">
              <label>รายวิชา</label>
              <select value={selectedCS} onChange={e => setSelectedCS(e.target.value)} disabled={items.length === 0}>
                {items.length === 0 ? <option>— ไม่มีวิชา —</option> : items.map(it => {
                  const s = subjectMap[it.subject_id]
                  return <option key={it.id} value={it.id}>[{s?.code}] {s?.name}</option>
                })}
              </select>
            </div>
          </div>

          <div className="score-entry-tabs">
            {([1, 2] as const).map(t => (
              <button key={t} onClick={() => setTerm(t)} className={`score-entry-tab ${term === t ? 'is-active' : ''}`}>
                ภาคเรียนที่ {t}
              </button>
            ))}
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
                <div className="score-table-wrap">
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
                                <input type="number" min={0} max={max} disabled={!canEdit} value={Number.isFinite(u) ? u : ''}
                                  onChange={e => setUnit(st.id, i, e.target.value)} className={`score-input ${overMax(u, max) ? 'is-error' : ''}`} />
                              </td>
                            )
                          })}
                          <td style={{ textAlign: 'center', background: '#ECFDF5', fontWeight: 900, color: '#047857' }}>{rowCalc(r).between}</td>
                          {showMidterm && (
                            <td style={{ textAlign: 'center', background: '#EFF6FF' }}>
                              <input type="number" min={0} max={config.midterm_max} disabled={!canEdit} value={r.midterm ?? ''}
                                onChange={e => setMid(st.id, e.target.value)} className={`score-input ${overMax(r.midterm ?? NaN, config.midterm_max) ? 'is-error' : ''}`} />
                            </td>
                          )}
                          <td style={{ textAlign: 'center', background: '#EFF6FF' }}>
                            <input type="number" min={0} max={config.final_max} disabled={!canEdit} value={r.final ?? ''}
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
                              <select value={r.result} disabled={!canEdit} onChange={e => setResult(st.id, e.target.value)}
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
                    <span style={{ fontSize: 13, color: dirty ? '#D97706' : '#64748B', fontWeight: 800 }}>
                      {dirty ? '● มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกล่าสุดแล้ว'}
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
