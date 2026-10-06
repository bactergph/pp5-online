'use client'

import { useEffect, useMemo, useState } from 'react'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { fetchSchoolMisCsvBlob } from '@/lib/schoolmis-client'
import { schoolMisSubjectHeader, canExportSchoolMisSchool } from '@/lib/schoolmis-csv'
import { fetchSchoolMisExportInit } from './actions'

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
  const [canExportSchool, setCanExportSchool] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastQueue, setLastQueue] = useState<{
    label: string
    level?: string
    room?: number
  } | null>(null)

  useEffect(() => {
    let alive = true
    fetchSchoolMisExportInit()
      .then(result => {
        if (!alive) return
        const nextYears = (result.years || []) as Year[]
        const nextClassrooms = (result.classrooms || []) as Classroom[]
        setCanExportSchool(canExportSchoolMisSchool(result.role))
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
  const activeLevel = levels.includes(level) ? level : levels[0] || ''
  const roomOptions = useMemo(
    () => yearClassrooms.filter(c => !activeLevel || c.level === activeLevel).sort((a, b) => a.room - b.room),
    [yearClassrooms, activeLevel],
  )
  const selectedClassroom = roomOptions.find(c => c.id === classroomId) || null

  function handleExport(scope: 'classroom' | 'school' = 'classroom') {
    if (scope === 'school' && !canExportSchool) return
    if (!yearId || (scope === 'classroom' && (!classroomId || !selectedClassroom))) {
      setError('เลือกปีการศึกษาและห้องเรียนก่อน')
      return
    }

    const label = scope === 'school' ? `SchoolMIS ทั้งโรงเรียน · ปี ${years.find(y => y.id === yearId)?.year_be || ''}` : `SchoolMIS ${selectedClassroom!.level}/${selectedClassroom!.room}`
    const placeholderName = scope === 'school' ? `คะแนน_ทั้งโรงเรียน_ปี${years.find(y => y.id === yearId)?.year_be || ''}.csv` : `คะแนน_${selectedClassroom!.level}_ห้อง_${selectedClassroom!.room}.csv`

    setError(null)
    setQueued(true)
    setLastQueue({
      label,
      level: selectedClassroom?.level,
      room: selectedClassroom?.room,
    })

    // ใช้ fetch API เหมือน PDF — Server Action ในคิวข้ามหน้าจะค้าง "กำลังสร้าง..." ได้
    const year = yearId
    const roomId = classroomId
    enqueueFileExport({
      fileName: placeholderName,
      label,
      run: () => fetchSchoolMisCsvBlob({
        academicYearId: year,
        classroomId: scope === 'school' ? undefined : roomId,
        scope,
      }),
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
          ส่งออกเกรดรายห้องหรือทั้งโรงเรียนเป็น CSV ตามรหัสวิชา — ติดตามที่กล่องมุมขวาล่างได้แม้เปลี่ยนหน้า
        </p>
      </div>

      <section className="card-padded">
        <div className="section-title" style={{ marginBottom: 4 }}>เลือกปีการศึกษาและรูปแบบส่งออก</div>
        <p style={{ margin: '0 0 16px', color: 'var(--text-3)', fontSize: 13 }}>
          ส่งออกรายห้องให้เลือกชั้นและห้อง · ส่งออกทั้งโรงเรียนเลือกเฉพาะปีการศึกษา
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
                onChange={e => { setYearId(e.target.value); setLevel(''); setClassroomId(''); setError(null) }}
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
                value={activeLevel}
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
                value={selectedClassroom?.id || ''}
                onChange={e => { setClassroomId(e.target.value); setError(null) }}
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
            disabled={loading || queued || !yearId || !selectedClassroom}
            onClick={() => handleExport('classroom')}
          >
            {queued ? 'ใส่คิวแล้ว...' : 'ส่งออก CSV รายห้อง'}
          </button>
          {canExportSchool && <button type="button" className="btn btn-secondary" disabled={loading || queued || !yearId || !yearClassrooms.length} onClick={() => handleExport('school')}>
            ส่งออก CSV ทั้งโรงเรียน
          </button>}
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
            ส่งออกเกรดและผลการเรียนตามรหัสวิชา ไม่รวมกิจกรรมพัฒนาผู้เรียน
          </span>
        </div>
        {canExportSchool && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
          ทั้งโรงเรียน: รวมทุกห้องในปีการศึกษาที่เลือกเป็นไฟล์เดียว พร้อมคอลัมน์ชั้นและห้อง โดยไม่ต้องเลือกห้อง
        </p>}
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
