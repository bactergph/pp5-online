'use client'

import { useEffect, useMemo, useState } from 'react'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { buildStudentNameListPdfBlob } from '@/lib/jspdf-name-list'
import { fetchNameListExportInit, fetchNameListStudents } from './actions'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = {
  id: string
  level: string
  room: number
  academic_year_id: string
}

export default function NameListExportPage() {
  const [years, setYears] = useState<Year[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [yearId, setYearId] = useState('')
  const [level, setLevel] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [loading, setLoading] = useState(true)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLabel, setLastLabel] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchNameListExportInit()
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

  function handleExport() {
    if (!classroomId || !selectedClassroom) {
      setError('เลือกห้องเรียนก่อน')
      return
    }

    const roomId = classroomId
    const label = `รายชื่อ ${selectedClassroom.level}/${selectedClassroom.room}`
    const placeholderName = `รายชื่อ_${selectedClassroom.level}-${selectedClassroom.room}.pdf`

    setError(null)
    setQueued(true)
    setLastLabel(label)

    // สร้างด้วย jsPDF บนเครื่องผู้ใช้ แล้วใส่คิวมุมขวาล่าง (สลับหน้าได้)
    enqueueFileExport({
      fileName: placeholderName,
      label,
      run: async () => {
        const data = await fetchNameListStudents(roomId)
        if (!data.students.length) {
          throw new Error('ห้องนี้ยังไม่มีรายชื่อนักเรียน')
        }
        return buildStudentNameListPdfBlob({
          schoolName: data.schoolName,
          yearBe: data.yearBe,
          classroomLabel: data.classroomLabel,
          students: data.students,
        })
      },
    })

    window.setTimeout(() => setQueued(false), 400)
  }

  return (
    <div className="page-stack">
      <div className="hero-panel page-hero" style={{
        background: 'linear-gradient(135deg, #1E3A5F 0%, #3B6FA0 50%, #7DB3D9 100%)',
      }}>
        <p className="page-hero-kicker" style={{ color: 'rgba(255,255,255,0.88)' }}>jsPDF + คิวส่งออก</p>
        <h1 style={{ margin: '0 0 6px', color: '#fff', fontSize: 22, fontWeight: 800 }}>รายชื่อนักเรียน (PDF)</h1>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontSize: 14, maxWidth: 580 }}>
          สร้างบนเครื่องคุณด้วย jsPDF แล้วเข้าคิวมุมขวาล่าง — สลับหน้าได้เหมือน export อื่น ไม่กิน Puppeteer บนเซิร์ฟเวอร์
        </p>
      </div>

      <section className="card-padded">
        <div className="section-title" style={{ marginBottom: 4 }}>เลือกห้อง</div>
        <p style={{ margin: '0 0 16px', color: 'var(--text-3)', fontSize: 13 }}>
          กดส่งออกแล้วดูสถานะที่กล่องมุมขวาล่าง กดดาวน์โหลดเมื่อพร้อม
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
            disabled={loading || queued || !classroomId}
            onClick={handleExport}
          >
            {queued ? 'ใส่คิวแล้ว...' : 'ส่งออก PDF (jsPDF)'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
            ประมวลผลที่เครื่องคุณ · ใช้คิวดาวน์โหลดร่วมกับระบบ
          </span>
        </div>

        {lastLabel && (
          <p style={{ margin: '14px 0 0', fontSize: 14 }}>
            คิวล่าสุด: <strong>{lastLabel}</strong> — ดูที่กล่องมุมขวาล่าง
          </p>
        )}
      </section>
    </div>
  )
}
