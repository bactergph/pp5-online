'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { scheduleSemesterForYear } from '@/lib/schedule-helpers'
import type { Preparation } from '@/lib/schedule-preparation'
import { isSchoolCodeSegment } from '@/lib/school-path'
import TeacherActivityEditor from './TeacherActivityEditor'
import { useScheduleOperations } from './ScheduleServices'

type Year = {
  id: string
  year_be: number
  is_active: boolean
  term1_start_date?: string | null
  term1_end_date?: string | null
  term2_start_date?: string | null
  term2_end_date?: string | null
}

export default function TeacherActivitiesSettings() {
  const { fetchScheduleInit, fetchPreparation } = useScheduleOperations()
  const pathname = usePathname()
  const router = useRouter()
  const [years, setYears] = useState<Year[]>([])
  const [yearId, setYearId] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)
  const [data, setData] = useState<Preparation | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetchScheduleInit()
      .then(init => {
        if (!active) return
        const list = init.years as Year[]
        setYears(list)
        const current = list.find(year => year.is_active) || list[0]
        if (!current) return
        setYearId(current.id)
        setTerm(scheduleSemesterForYear(current))
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'โหลดปีการศึกษาไม่สำเร็จ')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchScheduleInit])

  useEffect(() => {
    if (!yearId) return
    let active = true
    setData(null)
    fetchPreparation(yearId, term)
      .then(result => {
        if (!active) return
        if (result.error || !result.data) setError(result.error || 'โหลดกิจกรรมครูไม่สำเร็จ')
        else { setError(''); setData(result.data) }
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'โหลดกิจกรรมครูไม่สำเร็จ')
      })
    return () => { active = false }
  }, [yearId, term, fetchPreparation])

  function abandonDraft(message: string) {
    return !dirty || window.confirm(message)
  }

  function changeYear(next: string) {
    if (next === yearId || !abandonDraft('มีกิจกรรมที่ยังไม่บันทึก เปลี่ยนปีการศึกษาหรือไม่?')) return
    const year = years.find(item => item.id === next)
    setDirty(false)
    setData(null)
    setError('')
    setYearId(next)
    if (year) setTerm(scheduleSemesterForYear(year))
  }

  function changeTerm(next: 1 | 2) {
    if (next === term || !abandonDraft('มีกิจกรรมที่ยังไม่บันทึก เปลี่ยนภาคเรียนหรือไม่?')) return
    setDirty(false)
    setData(null)
    setError('')
    setTerm(next)
  }

  const school = pathname.split('/')[1]
  const manageHref = `${school && isSchoolCodeSegment(school) ? `/${school}` : ''}/schedules/class/manage`

  return (
    <div className="page-stack">
      <section className="control-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>กิจกรรมครู</div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
            PLC ประชุม เวร หรือภารกิจช่วงพัก เช่น ขายของสหกรณ์ตอนพักเที่ยง บันทึกตามปีและภาคเรียน แล้วแสดงในตารางสอนครู
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180 }}>
            <label className="form-label" htmlFor="teacher-activity-year">ปีการศึกษา</label>
            <select id="teacher-activity-year" className="form-input" style={{ width: '100%' }} value={yearId} disabled={busy || !years.length} onChange={event => changeYear(event.target.value)}>
              {years.map(year => <option key={year.id} value={year.id}>{year.year_be}{year.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 160 }}>
            <label className="form-label" htmlFor="teacher-activity-term">ภาคเรียน</label>
            <select id="teacher-activity-term" className="form-input" style={{ width: '100%' }} value={term} disabled={busy || !yearId} onChange={event => changeTerm(Number(event.target.value) as 1 | 2)}>
              <option value={1}>ภาคเรียนที่ 1</option>
              <option value={2}>ภาคเรียนที่ 2</option>
            </select>
          </div>
        </div>
      </section>
      {error ? <p className="prep-error" role="alert">{error}</p> : null}
      {loading || (yearId && !data && !error) ? <p role="status">กำลังโหลดกิจกรรมครู…</p> : null}
      {!loading && !yearId && !error ? <p>ยังไม่มีปีการศึกษา ให้ตั้งปีการศึกษาก่อน แล้วกลับมากำหนดกิจกรรมครู</p> : null}
      {data ? (
        <TeacherActivityEditor
          data={data}
          year={yearId}
          term={term}
          blocked={false}
          busy={busy}
          onBusy={setBusy}
          onDirty={setDirty}
          onSaved={async () => {
            const latest = await fetchPreparation(yearId, term)
            if (latest.error || !latest.data) throw Error(latest.error || 'โหลดข้อมูลล่าสุดไม่สำเร็จ')
            setData(latest.data)
          }}
          onFix={() => router.push(manageHref)}
        />
      ) : null}
    </div>
  )
}
