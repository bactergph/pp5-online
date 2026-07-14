'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import LoadingButton from '@/components/LoadingButton'
import AppAlertModal from '@/components/AppAlertModal'
import {
  fetchClassroomInit,
  fetchClassrooms,
  saveClassroom,
  deleteClassroom,
  setupClassroomsForYear,
} from '@/app/classrooms/actions'

type Teacher = { id: string; prefix: string; full_name: string; is_homeroom: boolean }
type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = {
  id: string; level: string; room: number
  homeroom_teacher_id: string | null; homeroom_teacher2_id: string | null
  academic_year_id: string; student_count: number
}

type Mode = 'levels' | 'homeroom'

const LEVEL_GROUPS: { title: string; levels: string[] }[] = [
  { title: 'อนุบาล', levels: ['อ.2', 'อ.3'] },
  { title: 'ประถมศึกษา', levels: ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'] },
  { title: 'มัธยมศึกษา', levels: ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'] },
]
const ALL_LEVELS = LEVEL_GROUPS.flatMap(g => g.levels)
const empty = { id: '', level: 'อ.2', room: 1, homeroom_teacher_id: '', homeroom_teacher2_id: '' }

function defaultYearBe() {
  return String(new Date().getFullYear() + 543)
}

export default function ClassroomManager({ embedded = false, mode = 'levels' }: { embedded?: boolean; mode?: Mode }) {
  const isHomeroom = mode === 'homeroom'
  const [years, setYears] = useState<Year[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [canManage, setCanManage] = useState(false)
  const [selectedYear, setSelectedYear] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<typeof empty>(empty)
  const [alertModal, setAlertModal] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)
  const skipYearFetch = useRef(true)

  const [yearBeInput, setYearBeInput] = useState(defaultYearBe())
  const [levelRooms, setLevelRooms] = useState<Record<string, number>>({})
  const [savingSetup, setSavingSetup] = useState(false)

  function notify(type: 'success' | 'error', text: string) {
    setAlertModal({
      type,
      title: type === 'success' ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ',
      message: text,
    })
  }

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (!selectedYear) return
    if (skipYearFetch.current) {
      skipYearFetch.current = false
      return
    }
    void loadClassrooms(selectedYear)
  }, [selectedYear])

  // sync ปีเมื่อเปลี่ยนปีที่เลือก / โหลดครั้งแรก
  useEffect(() => {
    if (isHomeroom) return
    const y = years.find(x => x.id === selectedYear)
    if (y) setYearBeInput(String(y.year_be))
    else if (years.length === 0) setYearBeInput(defaultYearBe())
  }, [isHomeroom, selectedYear, years])

  // sync กริดชั้นจากห้องที่มีจริงของปีที่เลือก
  useEffect(() => {
    if (isHomeroom) return
    const map: Record<string, number> = {}
    for (const c of classrooms) map[c.level] = Math.max(map[c.level] || 0, c.room)
    setLevelRooms(map)
  }, [isHomeroom, selectedYear, classrooms])

  async function init() {
    const data = await fetchClassroomInit()
    setYears(data.years as Year[])
    setTeachers(data.teachers as Teacher[])
    setCanManage(data.canManage)
    setClassrooms((data.classrooms || []) as Classroom[])
    skipYearFetch.current = true
    setSelectedYear(data.activeYearId || '')
    setLoading(false)
  }

  async function loadClassrooms(yearId: string) {
    setClassrooms(await fetchClassrooms(yearId) as Classroom[])
    setLoading(false)
  }

  const teacherName = (id: string | null) => {
    if (!id) return '—'
    const t = teachers.find(t => t.id === id)
    return t ? `${t.prefix}${t.full_name}` : '—'
  }

  const setupSummary = useMemo(() => {
    const active = ALL_LEVELS.filter(l => (levelRooms[l] || 0) > 0)
    const rooms = active.reduce((s, l) => s + (levelRooms[l] || 0), 0)
    return { levels: active.length, rooms }
  }, [levelRooms])

  async function saveSetup() {
    if (!canManage) return
    setSavingSetup(true)
    setAlertModal(null)
    const yearBe = Number(yearBeInput)
    const payload = ALL_LEVELS.map(level => ({ level, rooms: levelRooms[level] || 0 }))
    const res = await setupClassroomsForYear(yearBe, payload, selectedYear || null)
    setSavingSetup(false)
    if (res.error) { notify('error', res.error); return }

    let msg = `บันทึกปี ${res.yearBe ?? yearBe} แล้ว — ${setupSummary.levels} ชั้น · ${setupSummary.rooms} ห้อง`
    if ((res.created ?? 0) > 0 || (res.deleted ?? 0) > 0) {
      msg += ` (เพิ่ม ${res.created ?? 0}, ลบ ${res.deleted ?? 0})`
    }
    if (res.blocked && res.blocked.length) {
      msg += ` · ข้ามการลบ ${res.blocked.join(', ')} เพราะยังมีนักเรียน`
    }
    notify('success', msg)

    await init()
    if (res.academicYearId) {
      setSelectedYear(res.academicYearId)
      await loadClassrooms(res.academicYearId)
    }
  }

  function openEdit(c: Classroom) {
    setEditing({
      id: c.id, level: c.level, room: c.room,
      homeroom_teacher_id: c.homeroom_teacher_id || '',
      homeroom_teacher2_id: c.homeroom_teacher2_id || '',
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setAlertModal(null)
    const fd = new FormData(e.currentTarget)
    const { error } = await saveClassroom(editing.id || null, {
      level: fd.get('level') as string,
      room: Number(fd.get('room') || 1),
      academic_year_id: selectedYear,
      homeroom_teacher_id: (fd.get('homeroom_teacher_id') as string) || null,
      homeroom_teacher2_id: (fd.get('homeroom_teacher2_id') as string) || null,
    })
    setSaving(false)
    if (error) { notify('error', error); return }
    notify('success', 'บันทึกครูประจำชั้นเรียบร้อย')
    setShowForm(false)
    loadClassrooms(selectedYear)
  }

  async function handleDelete(c: Classroom) {
    if (!confirm(`ลบชั้น ${c.level}/${c.room} ?`)) return
    const { error } = await deleteClassroom(c.id)
    if (error) { notify('error', error); return }
    loadClassrooms(selectedYear)
  }

  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  const title = isHomeroom ? 'ครูประจำชั้น' : 'ชั้นเรียน'
  const subtitle = isHomeroom
    ? `กำหนดครูประจำชั้นให้แต่ละห้อง (${classrooms.length} ห้อง)`
    : 'กำหนดปีการศึกษาและชั้นที่เปิดสอนในจอเดียว'

  const colCount = isHomeroom ? (canManage ? 6 : 5) : (canManage ? 4 : 3)

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
        {embedded ? (
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>{subtitle}</p>
        ) : (
          <div className="page-hero">
            <div>
              <span className="page-hero-kicker">Classroom setup</span>
              <h1 className="page-title">{title}</h1>
              <p className="page-subtitle">{subtitle}</p>
            </div>
          </div>
        )}

        {/* ── โหมดชั้นเรียน: จอเดียว ปี + ติ๊กชั้น ── */}
        {!isHomeroom && canManage && (
          <div className="control-card classroom-setup-panel">
            <div style={{ marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 4 }}>ตั้งค่าชั้นเรียน</div>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13, lineHeight: 1.55 }}>
                กรอกปีการศึกษา แล้วติ๊กชั้นที่เปิดสอนพร้อมจำนวนห้อง กดบันทึกครั้งเดียว — ระบบจะสร้างปีและห้องให้อัตโนมัติ
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
              <div>
                <label className="form-label">ปีการศึกษา (พ.ศ.) *</label>
                <input
                  value={yearBeInput}
                  onChange={e => setYearBeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="form-input"
                  style={{ width: 140 }}
                  placeholder="เช่น 2569"
                  inputMode="numeric"
                />
              </div>
              {years.length > 0 && (
                <div>
                  <label className="form-label">หรือเลือกปีที่มีอยู่</label>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(e.target.value)}
                    className="form-input"
                    style={{ minWidth: 180 }}
                  >
                    {years.map(y => (
                      <option key={y.id} value={y.id}>
                        {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {LEVEL_GROUPS.map(group => (
              <div key={group.title} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 8, textTransform: 'uppercase' }}>
                  {group.title}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 10 }}>
                  {group.levels.map(level => {
                    const rooms = levelRooms[level] || 0
                    const on = rooms > 0
                    return (
                      <div
                        key={level}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 10,
                          border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                          background: on ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--surface)',
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={e => setLevelRooms(prev => ({
                              ...prev,
                              [level]: e.target.checked ? (prev[level] > 0 ? prev[level] : 1) : 0,
                            }))}
                          />
                          <span style={{ fontWeight: 600 }}>{level}</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={on ? rooms : ''}
                          disabled={!on}
                          onChange={e => setLevelRooms(prev => ({
                            ...prev,
                            [level]: Math.max(1, Number((e.target.value || '').replace(/\D/g, '')) || 1),
                          }))}
                          className="form-input"
                          style={{ width: 56, textAlign: 'center', opacity: on ? 1 : 0.4 }}
                          aria-label={`จำนวนห้อง ${level}`}
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>ห้อง</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                marginTop: 4, paddingTop: 14, borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                สรุป: <b>{setupSummary.levels}</b> ชั้น · <b>{setupSummary.rooms}</b> ห้อง
                {setupSummary.rooms === 0 && (
                  <span style={{ color: 'var(--text-3)' }}> — ติ๊กอย่างน้อย 1 ชั้นเพื่อสร้างห้อง</span>
                )}
              </div>
              <LoadingButton
                loading={savingSetup}
                loadingText="กำลังบันทึก..."
                onClick={saveSetup}
                disabled={!yearBeInput || yearBeInput.length < 4}
              >
                บันทึกชั้นเรียน
              </LoadingButton>
            </div>
          </div>
        )}

        {!isHomeroom && !canManage && (
          <div className="alert alert-error">ไม่มีสิทธิ์แก้ไขชั้นเรียน — ดูได้อย่างเดียว</div>
        )}

        {/* ── โหมดครูประจำชั้น ── */}
        {isHomeroom && (
          years.length === 0 ? (
            <div className="alert alert-error">ยังไม่มีปีการศึกษา — ไปตั้งค่าที่เมนู “ชั้นเรียน” ก่อน</div>
          ) : (
            <>
              <div className="filter-bar control-card">
                <label className="form-label" style={{ margin: 0 }}>ปีการศึกษา:</label>
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="form-input" style={{ width: 'auto' }}>
                  {years.map(y => <option key={y.id} value={y.id}>{y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
                </select>
              </div>

              {showForm && (
                <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
                  <div className="modal-card" style={{ maxWidth: 720, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
                      <div>
                        <div className="section-title" style={{ marginBottom: 4 }}>ครูประจำชั้น {editing.level}/{editing.room}</div>
                        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กำหนดครูประจำชั้นสำหรับห้องนี้</p>
                      </div>
                      <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                        ปิด
                      </button>
                    </div>
                    <form onSubmit={handleSave}>
                      <input type="hidden" name="level" value={editing.level} />
                      <input type="hidden" name="room" value={editing.room} />
                      <div className="form-grid">
                        <div>
                          <label className="form-label">ครูประจำชั้น</label>
                          <select name="homeroom_teacher_id" defaultValue={editing.homeroom_teacher_id} className="form-input">
                            <option value="">— ไม่ระบุ —</option>
                            {teachers.map(t => <option key={t.id} value={t.id}>{t.prefix}{t.full_name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="form-label">ครูประจำชั้น (คนที่ 2)</label>
                          <select name="homeroom_teacher2_id" defaultValue={editing.homeroom_teacher2_id} className="form-input">
                            <option value="">— ไม่ระบุ —</option>
                            {teachers.map(t => <option key={t.id} value={t.id}>{t.prefix}{t.full_name}</option>)}
                          </select>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
                        * ครูที่ถูกกำหนดเป็นครูประจำชั้น จะได้สิทธิ์เห็นเมนู &quot;ธุรการชั้นเรียน&quot; อัตโนมัติ
                      </p>
                      <div className="form-actions" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                        <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-secondary">ยกเลิก</button>
                        <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          )
        )}

        {/* ตารางผลลัพธ์ห้อง / ครูประจำชั้น */}
        {(isHomeroom ? years.length > 0 : true) && (
          <div className="table-card data-card">
            {!isHomeroom && (
              <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-2)', fontSize: 14 }}>
                  ห้องที่สร้างแล้ว {yearBeInput ? `ปี ${yearBeInput}` : ''} ({classrooms.length} ห้อง)
                </div>
              </div>
            )}
            <table className="thai-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>ชั้น/ห้อง</th>
                  {isHomeroom && <th>ครูประจำชั้น</th>}
                  {isHomeroom && <th>ครูประจำชั้น (คนที่ 2)</th>}
                  <th style={{ width: 110, textAlign: 'right' }}>จำนวนนักเรียน</th>
                  {canManage && <th style={{ width: 100 }}>จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {classrooms.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                      {isHomeroom
                        ? 'ยังไม่มีชั้นเรียน — ไปตั้งค่าที่เมนู “ชั้นเรียน” ก่อน'
                        : 'ยังไม่มีห้อง — ติ๊กชั้นด้านบนแล้วกด “บันทึกชั้นเรียน”'}
                    </td>
                  </tr>
                ) : classrooms.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{c.level}/{c.room}</td>
                    {isHomeroom && <td>{teacherName(c.homeroom_teacher_id)}</td>}
                    {isHomeroom && <td>{teacherName(c.homeroom_teacher2_id)}</td>}
                    <td style={{ textAlign: 'right' }}>{c.student_count}</td>
                    {canManage && (
                      <td>
                        {isHomeroom ? (
                          <button onClick={() => openEdit(c)} style={{ color: 'var(--primary)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>แก้ไข</button>
                        ) : (
                          <button onClick={() => handleDelete(c)} style={{ color: '#DC2626', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>ลบ</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
