'use client'
import { useState, useEffect, useCallback } from 'react'
import './academic-year.css'
import {
  fetchAcademicYears,
  setScoreEntryOpen,
  fetchGlobalTermCalendarsForSchoolYears,
  saveAcademicYear,
  setActiveAcademicYear,
  syncAcademicYearCalendarFromGlobal,
} from '../actions'
import { toBuddhistYear, formatThaiDate } from '@/lib/thaiDate'
import LoadingButton from '@/components/LoadingButton'
import ThaiDatePicker from '@/components/ThaiDatePicker'
import { useAppAlert } from '@/lib/use-app-alert'

type AcademicYear = {
  id: string
  year_be: number
  term1_start_date: string
  term1_end_date: string
  term2_start_date: string
  term2_end_date: string
  is_active: boolean
  school_id: string
  term1_scores_open?: boolean
  term2_scores_open?: boolean
}
type GlobalTermCalendar = {
  id: string
  year_be: number
  term1_start_date: string | null
  term1_end_date: string | null
  term2_start_date: string | null
  term2_end_date: string | null
}

export default function AcademicYearPage() {
  const [years, setYears] = useState<AcademicYear[]>([])
  const [globalCalendars, setGlobalCalendars] = useState<GlobalTermCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Partial<AcademicYear> | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [togglingPeriod, setTogglingPeriod] = useState<string | null>(null)
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const [schoolId, setSchoolId] = useState<string | null>(null)

  const [statusMessage, setStatusMessage] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [schoolData, globalData] = await Promise.all([fetchAcademicYears(), fetchGlobalTermCalendarsForSchoolYears()])
      setSchoolId(schoolData.schoolId)
      setYears(schoolData.years)
      setGlobalCalendars(globalData as GlobalTermCalendar[])
    } catch {
      setStatusMessage('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void Promise.resolve().then(loadData) }, [loadData])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!schoolId) return
    setSaving(true)
    clearAlert()

    const formData = new FormData(e.currentTarget)
    const updates = {
      school_id: schoolId,
      year_be: parseInt(formData.get('year_be') as string),
      term1_start_date: formData.get('term1_start_date') as string || null,
      term1_end_date: formData.get('term1_end_date') as string || null,
      term2_start_date: formData.get('term2_start_date') as string || null,
      term2_end_date: formData.get('term2_end_date') as string || null,
      is_active: formData.get('is_active') === 'true',
    }

    try {
      const { error } = await saveAcademicYear(editItem?.id || null, updates)
      if (error) {
        notify('error', 'เกิดข้อผิดพลาด: ' + error)
      } else {
        notify('success', 'บันทึกเรียบร้อยแล้ว')
        setShowForm(false)
        setEditItem(null)
        await loadData()
      }
    } catch {
      notify('error', 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetActive(id: string) {
    if (!schoolId) return
    setSyncingId(id)
    try {
      const result = await setActiveAcademicYear(id, schoolId)
      if (result?.error) { notify('error', result.error); return }
      await loadData()
    } catch {
      notify('error', 'เปลี่ยนปีปัจจุบันไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSyncingId(null)
    }
  }

  async function handleToggleScoreEntry(year: AcademicYear, term: 1 | 2) {
    const field = term === 1 ? 'term1_scores_open' : 'term2_scores_open'
    const open = !year[field]
    setTogglingPeriod(`${year.id}-${term}`)
    try {
      const { error } = await setScoreEntryOpen(year.id, term, open)
      if (error) { notify('error', error); return }
      setYears(previous => previous.map(item => item.id === year.id ? { ...item, [field]: open } : item))
      setStatusMessage(`บันทึกแล้ว · ปี ${year.year_be} ภาคเรียนที่ ${term} ${open ? 'เปิด' : 'ปิด'}การบันทึกคะแนน`)
    } catch {
      notify('error', 'เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setTogglingPeriod(null)
    }
  }

  function scoreEntryControl(year: AcademicYear, term: 1 | 2) {
    const open = term === 1 ? year.term1_scores_open : year.term2_scores_open
    return (
      <div className={`academic-term__recording ${open === true ? 'is-open' : ''}`}>
        <div>
          <div className="academic-term__label">การบันทึกคะแนน</div>
          <strong>{togglingPeriod === `${year.id}-${term}` ? 'กำลังบันทึก…' : open === undefined ? 'ยังไม่พร้อมใช้งาน' : open ? 'เปิดให้บันทึก' : 'ปิดการบันทึก'}</strong>
        </div>
        <button type="button" className="academic-score-switch" role="switch" aria-checked={open === true}
          aria-busy={togglingPeriod === `${year.id}-${term}`}
          disabled={togglingPeriod !== null || syncingId !== null || open === undefined}
          aria-label={`การบันทึกคะแนน ปี ${year.year_be} ภาคเรียนที่ ${term}`}
          onClick={() => handleToggleScoreEntry(year, term)}>
          <span className="academic-score-switch__thumb" />
        </button>
      </div>
    )
  }

  async function handleSync(year: AcademicYear) {
    setSyncingId(year.id)
    try {
      const { error } = await syncAcademicYearCalendarFromGlobal(year.id)
      if (error) {
        notify('error', 'ใช้จากข้อมูลกลางไม่สำเร็จ: ' + error)
        return
      }
      notify('success', `ใช้จากข้อมูลกลาง ปี ${year.year_be} เรียบร้อยแล้ว`)
      await loadData()
    } catch {
      notify('error', 'นำเข้าปฏิทินไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSyncingId(null)
    }
  }

  if (loading) return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>

  return (
    <div className="page-stack academic-year-page">
      <div className="control-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>ปีการศึกษา</div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>เปิด–ปิดการบันทึกคะแนนแยกตามปีและภาคเรียน ด้วยสวิตช์ที่บันทึกทันที</p>
        </div>
        <button
          onClick={() => { setEditItem({}); setShowForm(true) }}
          className="btn btn-primary"
        >
          + เพิ่มปีการศึกษา
        </button>
      </div>

      <AlertModal />

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-card" style={{ maxWidth: 760, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>
                  {editItem?.id ? 'แก้ไขปีการศึกษา' : 'เพิ่มปีการศึกษาใหม่'}
                </div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กำหนดปีการศึกษาและวันเปิด-ปิดภาคเรียนของโรงเรียน</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-ghost" style={{ padding: '7px 10px' }}>
                ปิด
              </button>
            </div>
            <form onSubmit={handleSave} className="term-calendar-form">
              <div className="term-calendar-form__meta">
                <div className="term-calendar-form__year">
                  <label className="form-label">ปีการศึกษา (พ.ศ.) *</label>
                  <input
                    name="year_be"
                    type="number"
                    defaultValue={editItem?.year_be || toBuddhistYear(new Date().getFullYear())}
                    className="form-input"
                    min="2560"
                    max="2580"
                    required
                  />
                </div>
                <label className="term-calendar-form__active">
                  <input type="checkbox" name="is_active" value="true" defaultChecked={editItem?.is_active} />
                  <span>ใช้เป็นปีการศึกษาปัจจุบัน</span>
                </label>
              </div>

              <div className="term-calendar-form__block">
                <div className="term-calendar-form__block-title">ภาคเรียนที่ 1</div>
                <div className="term-calendar-form__dates">
                  <div>
                    <label className="form-label">เปิดเรียนภาคเรียนที่ 1</label>
                    <ThaiDatePicker
                      key={`t1s-${editItem?.id || 'new'}`}
                      name="term1_start_date"
                      defaultValue={editItem?.term1_start_date || ''}
                      yearsBack={2}
                      yearsForward={3}
                    />
                  </div>
                  <div>
                    <label className="form-label">ปิดเรียนภาคเรียนที่ 1</label>
                    <ThaiDatePicker
                      key={`t1e-${editItem?.id || 'new'}`}
                      name="term1_end_date"
                      defaultValue={editItem?.term1_end_date || ''}
                      yearsBack={2}
                      yearsForward={3}
                    />
                  </div>
                </div>
              </div>

              <div className="term-calendar-form__block">
                <div className="term-calendar-form__block-title">ภาคเรียนที่ 2</div>
                <div className="term-calendar-form__dates">
                  <div>
                    <label className="form-label">เปิดเรียนภาคเรียนที่ 2</label>
                    <ThaiDatePicker
                      key={`t2s-${editItem?.id || 'new'}`}
                      name="term2_start_date"
                      defaultValue={editItem?.term2_start_date || ''}
                      yearsBack={2}
                      yearsForward={3}
                    />
                  </div>
                  <div>
                    <label className="form-label">ปิดเรียนภาคเรียนที่ 2</label>
                    <ThaiDatePicker
                      key={`t2e-${editItem?.id || 'new'}`}
                      name="term2_end_date"
                      defaultValue={editItem?.term2_end_date || ''}
                      yearsBack={2}
                      yearsForward={3}
                    />
                  </div>
                </div>
              </div>

              <div className="term-calendar-form__actions">
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn btn-secondary">ยกเลิก</button>
                <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}


      <div className="academic-year-feedback" role="status" aria-live="polite">
        {statusMessage || 'เปิดสวิตช์ = ครูบันทึกคะแนนได้ · ปิดสวิตช์ = หยุดการบันทึกคะแนน โดยข้อมูลเดิมยังอยู่'}
        {statusMessage.startsWith('โหลดข้อมูล') && <button className="btn btn-secondary" onClick={() => void loadData()}>ลองใหม่</button>}
      </div>
      {years.length === 0 ? (
        <div className="academic-year-empty">ยังไม่มีปีการศึกษา เริ่มต้นด้วยปุ่ม “เพิ่มปีการศึกษา”</div>
      ) : [...years].sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.year_be - a.year_be).map(year => (
        <section key={year.id} className={`academic-year-card ${year.is_active ? 'is-current' : ''}`}>
          <div className="academic-year-card__header">
            <div className="academic-year-card__title">
              <h2>ปีการศึกษา {year.year_be}</h2>
              {year.is_active && <span className="academic-year-current">ปีปัจจุบัน</span>}
            </div>
            <div className="academic-year-card__actions">
              {!year.is_active && <button className="btn btn-secondary" disabled={togglingPeriod !== null || syncingId !== null} onClick={() => handleSetActive(year.id)}>ใช้เป็นปีปัจจุบัน</button>}
              <button className="btn btn-secondary" disabled={togglingPeriod !== null || syncingId !== null} onClick={() => { setEditItem(year); setShowForm(true) }}>แก้ไขวันเปิด–ปิด</button>
            </div>
          </div>
          <div className="academic-year-terms">
            {([1, 2] as const).map(term => {
              const start = term === 1 ? year.term1_start_date : year.term2_start_date
              const end = term === 1 ? year.term1_end_date : year.term2_end_date
              return (
                <div key={term} className="academic-term">
                  <h3>ภาคเรียนที่ {term}</h3>
                  <dl className="academic-term__dates">
                    <div><dt>วันเปิดเรียน</dt><dd>{start ? formatThaiDate(start) : 'ยังไม่กำหนด'}</dd></div>
                    <div><dt>วันปิดเรียน</dt><dd>{end ? formatThaiDate(end) : 'ยังไม่กำหนด'}</dd></div>
                  </dl>
                  {scoreEntryControl(year, term)}
                </div>
              )
            })}
          </div>
          {globalCalendars.some(calendar => calendar.year_be === year.year_be) && (
            <div className="academic-year-card__footer">
              <span>มีปฏิทินภาคเรียนจากส่วนกลางสำหรับปีนี้</span>
              <LoadingButton className="btn btn-secondary" loading={syncingId === year.id}
                disabled={togglingPeriod !== null || syncingId !== null} loadingText="กำลังนำเข้า…" onClick={() => handleSync(year)}>
                นำเข้าวันเปิด–ปิดจากส่วนกลาง
              </LoadingButton>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
