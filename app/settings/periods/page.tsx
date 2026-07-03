'use client'
import { useState, useEffect } from 'react'
import LoadingButton from '@/components/LoadingButton'
import { fetchPeriodConfigs, savePeriodConfig } from '../actions'

type ClassroomRow = {
  id: string
  level: string
  room: number
  config: {
    mon_hours: number; tue_hours: number; wed_hours: number
    thu_hours: number; fri_hours: number; sat_hours: number; sun_hours: number
  } | null
}

type DayHours = { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number }

const DAYS = [
  { key: 'mon', label: 'จ' },
  { key: 'tue', label: 'อ' },
  { key: 'wed', label: 'พ' },
  { key: 'thu', label: 'พฤ' },
  { key: 'fri', label: 'ศ' },
  { key: 'sat', label: 'ส' },
  { key: 'sun', label: 'อา' },
] as const

function defaultHours(config: ClassroomRow['config']): DayHours {
  return {
    mon: config?.mon_hours ?? 5,
    tue: config?.tue_hours ?? 5,
    wed: config?.wed_hours ?? 5,
    thu: config?.thu_hours ?? 5,
    fri: config?.fri_hours ?? 5,
    sat: config?.sat_hours ?? 0,
    sun: config?.sun_hours ?? 0,
  }
}

export default function PeriodsPage() {
  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([])
  const [hours, setHours] = useState<Record<string, DayHours>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({})

  useEffect(() => {
    fetchPeriodConfigs().then(data => {
      const typed = data as ClassroomRow[]
      setClassrooms(typed)
      const init: Record<string, DayHours> = {}
      typed.forEach((c: ClassroomRow) => { init[c.id] = defaultHours(c.config) })
      setHours(init)
      setLoading(false)
    })
  }, [])

  function setDay(classroomId: string, day: keyof DayHours, val: number) {
    setHours(prev => ({ ...prev, [classroomId]: { ...prev[classroomId], [day]: isNaN(val) ? 0 : Math.min(10, Math.max(0, val)) } }))
  }

  async function save(classroomId: string) {
    setSaving(classroomId)
    const { error } = await savePeriodConfig(classroomId, hours[classroomId])
    setSaving(null)
    setMsg(prev => ({ ...prev, [classroomId]: error ? { ok: false, text: error } : { ok: true, text: 'บันทึกแล้ว' } }))
    setTimeout(() => setMsg(prev => { const n = { ...prev }; delete n[classroomId]; return n }), 2000)
  }

  async function saveAll() {
    setSaving('all')
    const nextMsg: Record<string, { ok: boolean; text: string }> = {}
    for (const c of classrooms) {
      const { error } = await savePeriodConfig(c.id, hours[c.id])
      nextMsg[c.id] = error ? { ok: false, text: error } : { ok: true, text: 'บันทึกแล้ว' }
    }
    setSaving(null)
    setMsg(prev => ({ ...prev, ...nextMsg }))
    setTimeout(() => setMsg({}), 2000)
  }

  const weekTotal = (h: DayHours) => h.mon + h.tue + h.wed + h.thu + h.fri + h.sat + h.sun

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--text-3)' }}>
      กำลังโหลด...
    </div>
  )

  return (
    <div className="page-stack">
      {classrooms.length === 0 ? (
        <div className="card-padded empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ margin: '0 auto 12px', opacity: 0.4 }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>ยังไม่มีชั้นเรียน</p>
          <p style={{ fontSize: 13 }}>กรุณาสร้างชั้นเรียนก่อนที่เมนู &quot;ชั้นเรียน&quot;</p>
        </div>
      ) : (
        <>
          <div className="control-card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div className="section-title" style={{ marginBottom: 2 }}>คาบสอนต่อสัปดาห์</div>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กำหนดจำนวนชั่วโมงเรียนแต่ละวัน ใช้คำนวณชั่วโมงรวมใน ปพ.5</p>
            </div>
            <LoadingButton loading={saving === 'all'} onClick={saveAll}>
              บันทึกทั้งหมด
            </LoadingButton>
          </div>
          <div className="data-card">
            <table className="thai-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>ชั้น/ห้อง</th>
                  {DAYS.map(d => (
                    <th key={d.key} style={{ padding: '12px 8px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: d.key === 'sat' || d.key === 'sun' ? 'var(--text-3)' : 'var(--text-2)', width: 64 }}>
                      {d.label}
                    </th>
                  ))}
                  <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', width: 72 }}>รวม/สัปดาห์</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', width: 100 }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {classrooms.map((c, i) => {
                  const h = hours[c.id] || defaultHours(c.config)
                  const total = weekTotal(h)
                  const m = msg[c.id]
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'white' : 'var(--bg-2)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: 14 }}>
                        {c.level}/{c.room}
                      </td>
                      {DAYS.map(d => (
                        <td key={d.key} style={{ padding: '8px 4px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min={0} max={10}
                            value={h[d.key as keyof DayHours]}
                            onChange={e => setDay(c.id, d.key as keyof DayHours, parseInt(e.target.value))}
                            style={{
                              width: 52, height: 36, textAlign: 'center',
                              border: '1.5px solid var(--border)', borderRadius: 8,
                              fontSize: 14, fontFamily: 'inherit',
                              background: d.key === 'sat' || d.key === 'sun' ? 'var(--bg-2)' : 'white',
                              color: h[d.key as keyof DayHours] === 0 ? 'var(--text-3)' : 'var(--text)',
                              outline: 'none',
                            }}
                          />
                        </td>
                      ))}
                      <td style={{ textAlign: 'center', fontWeight: 700, color: total > 35 ? '#D97706' : 'var(--primary)', fontSize: 15 }}>
                        {total}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 16px' }}>
                        {m ? (
                          <span style={{ fontSize: 12, color: m.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                            {m.ok ? '✓ บันทึก' : '✕ ' + m.text}
                          </span>
                        ) : (
                          <LoadingButton
                            loading={saving === c.id}
                            onClick={() => save(c.id)}
                            className="btn btn-secondary"
                            loadingText="..."
                            style={{ fontSize: 12, padding: '6px 14px' }}
                          >
                            บันทึก
                          </LoadingButton>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
            หมายเหตุ: ค่าตั้งต้น = 5 ชั่วโมงต่อวัน (จ–ศ) รวม 25 ชั่วโมง/สัปดาห์
          </p>
        </>
      )}
    </div>
  )
}
