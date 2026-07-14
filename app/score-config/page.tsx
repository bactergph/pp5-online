'use client'
import { useState, useEffect } from 'react'
import {
  fetchClassSubjectInit, fetchScoreClassroomsLite, fetchScoreClassSubjects,
  fetchScoreConfigs, saveScoreConfigs,
} from '../settings/actions'
import LoadingButton from '@/components/LoadingButton'
import AppAlertModal from '@/components/AppAlertModal'

type Year = { id: string; year_be: number; is_active: boolean }
type Subject = { id: string; code: string; name: string }
type Classroom = { id: string; level: string; room: number }
type CS = { id: string; subject_id: string; order_number: number }
type Cfg = { units: number[]; midterm: number; final: number }

export default function ScoreConfigPage() {
  const [canManage, setCanManage] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [years, setYears] = useState<Year[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)
  const [items, setItems] = useState<CS[]>([])
  const [cfg, setCfg] = useState<Record<string, Cfg>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [alertModal, setAlertModal] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)
  // template quick-fill
  const [tplUnitCount, setTplUnitCount] = useState(7)
  const [tplPerUnit, setTplPerUnit] = useState(5)
  const [tplMid, setTplMid] = useState(0)
  const [tplFinal, setTplFinal] = useState(15)

  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]))
  const classroomScopeNote = userRole === 'teacher'
    ? 'แสดงเฉพาะห้องที่คุณได้รับมอบหมายสอน'
    : userRole === 'academic_head' || userRole === 'deputy_principal'
      ? 'แสดงทุกห้อง · ปรับอัตราส่วนได้ทุกวิชา'
      : userRole === 'admin'
        ? 'แสดงทุกห้อง · ปรับอัตราส่วนได้ทุกวิชา'
        : userRole === 'district'
          ? 'แสดงทุกห้อง · ปรับอัตราส่วนได้ทุกวิชา'
          : ''
  const subjectScopeNote = userRole === 'teacher'
    ? 'ปรับได้เฉพาะวิชาที่คุณสอนในห้องนี้'
    : ''

  async function loadClassrooms(yearId: string, preferClassroomId?: string | null) {
    const cs = await fetchScoreClassroomsLite(yearId) as Classroom[]
    setClassrooms(cs)
    const preferred = preferClassroomId && cs.some(c => c.id === preferClassroomId) ? preferClassroomId : ''
    setSelectedClass(preferred || cs[0]?.id || '')
  }

  async function init() {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
    const queryYear = params.get('year')
    const queryClassroom = params.get('classroom')
    const queryTerm = params.get('term')

    const d = await fetchClassSubjectInit()
    setCanManage(['admin', 'district', 'academic_head', 'deputy_principal', 'teacher'].includes(d.role))
    setUserRole(String(d.role || ''))
    const yearList = d.years as Year[]
    setYears(yearList)
    setSubjects(d.subjects as Subject[])

    if (queryTerm === '1' || queryTerm === '2') setTerm(Number(queryTerm) as 1 | 2)

    const active = yearList.find(y => y.is_active) || yearList[0]
    const yearId = (queryYear && yearList.some(y => y.id === queryYear)) ? queryYear : active?.id || ''
    if (yearId) {
      setSelectedYear(yearId)
      await loadClassrooms(yearId, queryClassroom)
    }
    setLoading(false)
  }

  async function loadConfig() {
    const list = await fetchScoreClassSubjects(selectedClass) as CS[]
    setItems(list)
    const existing = await fetchScoreConfigs(list.map(i => i.id), term) as {
      class_subject_id: string; unit_count: number; between_scores: number[]; midterm_max: number; final_max: number
    }[]
    const exMap = Object.fromEntries(existing.map(e => [e.class_subject_id, e]))
    const next: Record<string, Cfg> = {}
    for (const it of list) {
      const e = exMap[it.id]
      if (e && Array.isArray(e.between_scores) && e.between_scores.length) {
        next[it.id] = {
          units: e.between_scores.map(n => Number(n) || 0),
          midterm: e.midterm_max || 0,
          final: e.final_max || 0,
        }
      } else {
        next[it.id] = { units: Array(7).fill(0), midterm: 0, final: 0 }
      }
    }
    setCfg(next)
  }

  useEffect(() => { void Promise.resolve().then(init) }, [])
  useEffect(() => {
    if (selectedClass) void Promise.resolve().then(loadConfig)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, term])

  function notify(type: 'success' | 'error', text: string) {
    setAlertModal({
      type,
      title: type === 'success' ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ',
      message: text,
    })
  }

  const maxUnits = Math.max(1, ...Object.values(cfg).map(c => c.units.length), 7)

  function changeSubjectUnitCount(csId: string, n: number) {
    const uc = Math.max(0, Math.min(20, n))
    setCfg(prev => {
      const c = prev[csId]
      if (!c) return prev
      const units = Array.from({ length: uc }, (_, i) => c.units[i] ?? 0)
      return { ...prev, [csId]: { ...c, units } }
    })
  }
  function applyUnitCountToAll(n: number) {
    const uc = Math.max(0, Math.min(20, n))
    setCfg(prev => {
      const next: Record<string, Cfg> = {}
      for (const [id, c] of Object.entries(prev)) {
        const units = Array.from({ length: uc }, (_, i) => c.units[i] ?? 0)
        next[id] = { ...c, units }
      }
      return next
    })
  }
  function setUnit(csId: string, idx: number, val: number) {
    setCfg(prev => { const c = prev[csId]; const units = [...c.units]; units[idx] = val; return { ...prev, [csId]: { ...c, units } } })
  }
  function setField(csId: string, key: 'midterm' | 'final', val: number) {
    setCfg(prev => ({ ...prev, [csId]: { ...prev[csId], [key]: val } }))
  }
  function applyTemplate() {
    setCfg(prev => {
      const next: Record<string, Cfg> = {}
      for (const [id, c] of Object.entries(prev)) {
        next[id] = {
          units: Array(c.units.length).fill(tplPerUnit),
          midterm: tplMid,
          final: tplFinal,
        }
      }
      return next
    })
    notify('success', 'ใส่ค่าให้ทุกวิชาแล้ว (คงจำนวนหน่วยเดิมของแต่ละวิชา) — กด "บันทึก" เพื่อยืนยัน')
  }
  const rowTotal = (c: Cfg) => (c.units.reduce((a, b) => a + (Number(b) || 0), 0) + (Number(c.midterm) || 0) + (Number(c.final) || 0))

  async function handleSave() {
    setSaving(true)
    setAlertModal(null)
    const rows = items.map(it => {
      const c = cfg[it.id]
      const between = c.units.map(n => Number(n) || 0)
      const total = between.reduce((a, b) => a + b, 0) + (Number(c.midterm) || 0) + (Number(c.final) || 0)
      return {
        class_subject_id: it.id, term, unit_count: c.units.length,
        between_scores: between, midterm_max: Number(c.midterm) || 0,
        final_max: Number(c.final) || 0, total_max: total,
      }
    })
    const { error } = await saveScoreConfigs(rows)
    setSaving(false)
    if (error) { notify('error', error); return }
    notify('success', `บันทึกอัตราส่วนคะแนน ภาคเรียนที่ ${term} (${rows.length} วิชา) เรียบร้อย`)
  }

  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  return (
    <>
      <AppAlertModal
        open={alertModal !== null}
        type={alertModal?.type || 'success'}
        title={alertModal?.title || ''}
        message={alertModal?.message}
        onClose={() => setAlertModal(null)}
      />
      <div className="page-stack">
      {years.length === 0 ? (
        <div className="alert alert-error">ยังไม่มีปีการศึกษา — ไปเพิ่มที่ ตั้งค่าระบบ → ปีการศึกษา ก่อน</div>
      ) : (
        <>
          <div className="filter-bar control-card">
            <div className="field-inline">
              <label className="form-label" style={{ margin: 0 }}>ปี:</label>
              <select
                value={selectedYear}
                onChange={e => {
                  const yearId = e.target.value
                  setSelectedYear(yearId)
                  void loadClassrooms(yearId)
                }}
                className="form-input"
                style={{ width: 'auto' }}
              >
                {years.map(y => <option key={y.id} value={y.id}>{y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
              </select>
            </div>
            <div className="field-inline" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>ชั้น:</label>
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="form-input" style={{ width: 'auto' }} disabled={classrooms.length === 0}>
                  <option value="">{classrooms.length === 0 ? '— ไม่มีห้องที่ปรับได้ —' : '— เลือกห้อง —'}</option>
                  {classrooms.map(c => <option key={c.id} value={c.id}>{c.level}/{c.room}</option>)}
                </select>
              </div>
              {classroomScopeNote && (
                <span style={{ fontSize: 11.5, color: '#64748B', fontWeight: 700 }}>{classroomScopeNote}</span>
              )}
            </div>
            <div className="field-inline">
              {([1, 2] as const).map(t => (
                <button key={t} onClick={() => setTerm(t)} className={term === t ? 'btn btn-primary' : 'btn btn-secondary'} style={{ fontSize: 13 }}>
                  ภาคเรียนที่ {t}
                </button>
              ))}
            </div>
          </div>

          {classrooms.length === 0 ? (
            <div className="alert alert-error">
              {userRole === 'teacher'
                ? 'ยังไม่มีห้องที่คุณได้รับมอบหมายสอนในปีนี้ — ตรวจสอบที่เมนู "จัดครูเข้าสอน"'
                : 'ยังไม่มีชั้นเรียนในปีนี้ — ไปเพิ่มที่เมนู "ชั้นเรียน" ก่อน'}
            </div>
          ) : items.length === 0 ? (
            <div className="alert alert-error">
              {userRole === 'teacher'
                ? 'ไม่มีวิชาที่คุณสอนในห้องนี้ — ตรวจสอบการมอบหมายที่เมนู "จัดครูเข้าสอน"'
                : 'ไม่มีวิชาให้ตั้งอัตราส่วนในห้องนี้ (ยังไม่เปิดสอน)'}
            </div>
          ) : (
            <>
              {subjectScopeNote && (
                <p style={{ margin: 0, fontSize: 12.5, color: '#64748B', fontWeight: 700 }}>{subjectScopeNote}</p>
              )}
              {canManage && (
                <div className="control-card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div>
                      <label className="form-label">ตั้งจำนวนหน่วยทุกวิชา</label>
                      <input type="number" min={0} max={20} value={tplUnitCount} onChange={e => setTplUnitCount(Number(e.target.value))} className="form-input" style={{ width: 90 }} />
                    </div>
                    <button type="button" onClick={() => applyUnitCountToAll(tplUnitCount)} className="btn btn-secondary" style={{ marginBottom: 1 }}>
                      ใช้กับทุกวิชา
                    </button>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div><label className="form-label">คะแนน/หน่วย</label><input type="number" value={tplPerUnit} onChange={e => setTplPerUnit(Number(e.target.value))} className="form-input" style={{ width: 80 }} /></div>
                    <div><label className="form-label">กลางภาค</label><input type="number" value={tplMid} onChange={e => setTplMid(Number(e.target.value))} className="form-input" style={{ width: 80 }} /></div>
                    <div><label className="form-label">ปลายภาค</label><input type="number" value={tplFinal} onChange={e => setTplFinal(Number(e.target.value))} className="form-input" style={{ width: 80 }} /></div>
                    <button type="button" onClick={applyTemplate} className="btn btn-secondary">ใส่คะแนนให้ทุกวิชา</button>
                  </div>
                </div>
              )}

              <p style={{ margin: 0, fontSize: 12.5, color: '#64748B', fontWeight: 700 }}>
                แต่ละวิชาตั้งจำนวนหน่วยระหว่างเรียนได้ไม่เท่ากัน (เช่น วิชาหลัก 7 หน่วย · วิชาเพิ่มเติม 6 หน่วย)
              </p>

              <div className="data-card dense-grid-card">
                <table className="thai-table" style={{ width: '100%', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: 'var(--bg-2)', zIndex: 2 }}>วิชา</th>
                      <th style={{ textAlign: 'center', width: 56, background: 'var(--bg-2)' }}>หน่วย</th>
                      {Array.from({ length: maxUnits }, (_, i) => <th key={i} style={{ textAlign: 'center', width: 48 }}>{term === 1 ? i + 1 : maxUnits + i + 1}</th>)}
                      <th style={{ textAlign: 'center', width: 64, background: '#FEF3C7' }}>กลางภาค</th>
                      <th style={{ textAlign: 'center', width: 64, background: '#F5EDE3' }}>ปลายภาค</th>
                      <th style={{ textAlign: 'center', width: 60 }}>รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => {
                      const c = cfg[it.id]; if (!c) return null
                      const s = subjectMap[it.subject_id]
                      const total = rowTotal(c)
                      const cell: React.CSSProperties = { width: 44, border: '1px solid var(--border)', borderRadius: 5, padding: '4px 2px', textAlign: 'center', fontSize: 13 }
                      const unitCell: React.CSSProperties = { ...cell, width: 48, fontWeight: 800 }
                      return (
                        <tr key={it.id}>
                          <td style={{ position: 'sticky', left: 0, background: 'white', fontWeight: 500, zIndex: 1 }}>
                            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{s?.code} </span>{s?.name}
                          </td>
                          <td style={{ textAlign: 'center', background: '#F8FAFC' }}>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={c.units.length}
                              disabled={!canManage}
                              onChange={e => changeSubjectUnitCount(it.id, Number(e.target.value))}
                              style={unitCell}
                              title="จำนวนหน่วยระหว่างเรียนของวิชานี้"
                            />
                          </td>
                          {Array.from({ length: maxUnits }, (_, i) => (
                            <td key={i} style={{ textAlign: 'center', background: i < c.units.length ? undefined : '#F8FAFC' }}>
                              {i < c.units.length ? (
                                <input type="number" value={c.units[i]} disabled={!canManage} onChange={e => setUnit(it.id, i, Number(e.target.value))} style={cell} />
                              ) : null}
                            </td>
                          ))}
                          <td style={{ textAlign: 'center', background: '#FFFBEB' }}>
                            <input type="number" value={c.midterm} disabled={!canManage} onChange={e => setField(it.id, 'midterm', Number(e.target.value))} style={cell} />
                          </td>
                          <td style={{ textAlign: 'center', background: '#EFF6FF' }}>
                            <input type="number" value={c.final} disabled={!canManage} onChange={e => setField(it.id, 'final', Number(e.target.value))} style={cell} />
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: total === 100 || total === 50 ? '#059669' : 'var(--text)' }}>{total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {canManage && (
                <div className="action-bar" style={{ marginTop: 16 }}>
                  <LoadingButton loading={saving} onClick={handleSave} className="btn btn-primary btn-lg">
                    บันทึกอัตราส่วน ภาคเรียนที่ {term}
                  </LoadingButton>
                </div>
              )}
            </>
          )}
        </>
      )}
      </div>
    </>
  )
}
