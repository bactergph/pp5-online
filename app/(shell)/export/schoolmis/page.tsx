'use client'

import { useEffect, useMemo, useState } from 'react'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { schoolMisSubjectHeader } from '@/lib/schoolmis-csv'
import { exportSchoolMisGradesCsv, fetchSchoolMisExportInit } from './actions'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = {
  id: string
  level: string
  room: number
  academic_year_id: string
}

export default function SchoolMisExportPage() {
  const [years, setYears] = useState<Year[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [yearId, setYearId] = useState('')
  const [level, setLevel] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [loading, setLoading] = useState(true)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastQueue, setLastQueue] = useState<{
    label: string
    level: string
    room: number
  } | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchSchoolMisExportInit()
      .then(result => {
        if (!alive) return
        const nextYears = (result.years || []) as Year[]
        const nextClassrooms = (result.classrooms || []) as Classroom[]
        setYears(nextYears)
        setClassrooms(nextClassrooms)
        const active = nextYears.find(y => y.is_active) || nextYears[0]
        setYearId(active?.id || '')
      })
      .catch((err: Error) => {
        if (alive) setError(err.message || 'โหลดข้อมูลไม่สำเร็จ')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const yearClassrooms = useMemo(
    () => classrooms.filter(c => c.academic_year_id === yearId),
    [classrooms, yearId],
  )
  const levels = useMemo(
    () => Array.from(new Set(yearClassrooms.map(c => c.level))).sort((a, b) => a.localeCompare(b, 'th')),
    [yearClassrooms],
  )
  const roomOptions = useMemo(
    () => yearClassrooms.filter(c => !level || c.level === level).sort((a, b) => a.room - b.room),
    [yearClassrooms, level],
  )
  const selectedClassroom = roomOptions.find(c => c.id === classroomId) || null

  useEffect(() => {
    if (!yearId) return
    if (level && !levels.includes(level)) setLevel(levels[0] || '')
    else if (!level && levels[0]) setLevel(levels[0])
  }, [yearId, levels, level])

  useEffect(() => {
    if (!classroomId) return
    if (!roomOptions.some(c => c.id === classroomId)) setClassroomId('')
  }, [roomOptions, classroomId])

  useEffect(() => {
    setError(null)
  }, [yearId, classroomId])

  function handleExport() {
    if (!yearId || !classroomId || !selectedClassroom) {
      setError('เลือกปีการศึกษาและห้องเรียนก่อน')
      return
    }

    const label = `SchoolMIS ${selectedClassroom.level}/${selectedClassroom.room}`
    const placeholderName = `คะแนน_${selectedClassroom.level}_ห้อง_${selectedClassroom.room}.csv`

    setError(null)
    setQueued(true)
    setLastQueue({
      label,
      level: selectedClassroom.level,
      room: selectedClassroom.room,
    })

    enqueueFileExport({
      fileName: placeholderName,
      label,
      run: async () => {
        const result = await exportSchoolMisGradesCsv({
          academicYearId: yearId,
          classroomId,
        })
        if (result.error || !result.csv || !result.fileName) {
          throw new Error(result.error || 'ส่งออกไม่สำเร็จ')
        }
        return {
          blob: new Blob([result.csv], { type: 'text/csv;charset=utf-8' }),
          fileName: result.fileName,
        }
      },
    })

    // ปลดปุ่มเร็ว ๆ ให้สลับหน้าได้ทันที — คิวทำงานที่กล่องมุมขวาล่าง
    window.setTimeout(() => setQueued(false), 400)
  }

  return (
    <div className="page-stack">
      <div className="hero-panel page-hero" style={{
        background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 48%, #5EEAD4 100%)',
      }}>
        <p className="page-hero-kicker" style={{ color: 'rgba(255,255,255,0.88)' }}>Export</p>
        <h1 style={{ margin: '0 0 6px', color: '#fff', fontSize: 22, fontWeight: 800 }}>SchoolMIS — ส่งออกเกรด</h1>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontSize: 14, maxWidth: 560 }}>
          ส่งออกเกรดรายวิชาของห้องที่เลือกเป็น CSV ตามรหัสวิชา — ติดตามที่กล่องมุมขวาล่างได้แม้เปลี่ยนหน้า
        </p>
      </div>

      <section className="card-padded">
        <div className="section-title" style={{ marginBottom: 4 }}>เลือกห้องเรียน</div>
        <p style={{ margin: '0 0 16px', color: 'var(--text-3)', fontSize: 13 }}>
          กดส่งออกแล้วสลับไปหน้าอื่นได้เลย เหมือนพิมพ์เล่มธุรการชั้นเรียน
        </p>

        {loading ? (
          <p style={{ color: 'var(--text-3)', margin: 0 }}>กำลังโหลด...</p>
        ) : (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="form-label">ปีการศึกษา</span>
              <select
                className="form-input"
                value={yearId}
                onChange={e => { setYearId(e.target.value); setLevel(''); setClassroomId('') }}
              >
                {years.map(y => (
                  <option key={y.id} value={y.id}>
                    {y.year_be}{y.is_active ? ' (ปีปัจจุบัน)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="form-label">ชั้น</span>
              <select
                className="form-input"
                value={level}
                onChange={e => { setLevel(e.target.value); setClassroomId('') }}
                disabled={!levels.length}
              >
                {!levels.length && <option value="">ไม่มีห้องเรียน</option>}
                {levels.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="form-label">ห้อง</span>
              <select
                className="form-input"
                value={classroomId}
                onChange={e => setClassroomId(e.target.value)}
                disabled={!roomOptions.length}
              >
                <option value="">เลือกห้อง</option>
                {roomOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.level}/{c.room}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginTop: 16 }} role="alert">{error}</div>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || queued || !yearId || !classroomId}
            onClick={handleExport}
          >
            {queued ? 'ใส่คิวแล้ว...' : 'ส่งออก CSV'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
            ส่งออกเฉพาะเกรด (0–4) ตามรหัสวิชาของชั้นที่เลือก
          </span>
        </div>
      </section>

      {lastQueue && (
        <section className="card-padded">
          <div className="section-title" style={{ marginBottom: 8 }}>คิวล่าสุด</div>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{lastQueue.label}</strong>
            {' — '}ดูสถานะที่กล่องมุมขวาล่าง แล้วกดดาวน์โหลดเมื่อพร้อม
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            หัวคอลัมน์ตัวอย่าง: <code>#,รหัสนักเรียน,ชื่อ-สกุล,{schoolMisSubjectHeader('ท14101', 'ภาษาไทย 4')},...</code>
          </p>
        </section>
      )}
    </div>
  )
}
