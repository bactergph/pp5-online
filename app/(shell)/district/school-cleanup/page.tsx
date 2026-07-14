'use client'

import { useEffect, useState } from 'react'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'
import {
  cleanupAllOrphanEvaluationSettings,
  cleanupEvaluationSettings,
  fetchCleanupCandidates,
  fetchCleanupSummary,
  type CleanupSchoolRow,
} from './actions'

type Summary = {
  schoolCount: number
  activeSchoolCount: number
  orphanSchoolCount: number
  settingsCount: number
  orphanSettingsCount: number
}

export default function DistrictSchoolCleanupPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [schools, setSchools] = useState<CleanupSchoolRow[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const { notify, AlertModal } = useAppAlert()

  async function load() {
    setLoading(true)
    const [sum, candidates] = await Promise.all([
      fetchCleanupSummary(),
      fetchCleanupCandidates(search, 100),
    ])
    setSummary(sum)
    setSchools(candidates.schools)
    setSelected(prev => {
      const next = new Set<string>()
      for (const id of prev) {
        if (candidates.schools.some(s => s.id === id)) next.add(id)
      }
      return next
    })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const candidates = await fetchCleanupCandidates(search, 100)
    setSchools(candidates.schools)
    setLoading(false)
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === schools.length) setSelected(new Set())
    else setSelected(new Set(schools.map(s => s.id)))
  }

  async function runCleanup(ids: string[], label: string) {
    if (!ids.length) {
      notify('error', 'ไม่ได้เลือกโรงเรียน')
      return
    }
    if (!confirm(`${label}\n\nจะลบเฉพาะ evaluation_settings ของโรงเรียนที่เลือก\nรายชื่อโรงเรียนในระบบจะไม่ถูกลบ`)) return

    setCleaning(true)
    const result = await cleanupEvaluationSettings(ids)
    setCleaning(false)
    if (result.error) notify('error', result.error)
    else {
      notify('success', `ล้างการตั้งค่าแล้ว ${result.deleted.toLocaleString()} แถว`)
      setSelected(new Set())
      load()
    }
  }

  async function runCleanupAll() {
    if (!summary?.orphanSettingsCount) {
      notify('error', 'ไม่มีการตั้งค่าค้างของโรงเรียนที่ไม่ใช้งาน')
      return
    }
    if (!confirm(
      `ล้างการตั้งค่าประเมินของโรงเรียนที่ไม่มีผู้ใช้และไม่มีห้องเรียนทั้งหมด?\n\nประมาณ ${summary.orphanSettingsCount.toLocaleString()} แถว\nรายชื่อโรงเรียน ${summary.schoolCount.toLocaleString()} แห่งจะยังอยู่ครบ`,
    )) return

    setCleaning(true)
    const result = await cleanupAllOrphanEvaluationSettings()
    setCleaning(false)
    if (result.error) notify('error', result.error)
    else {
      notify('success', `ล้างแล้ว ${result.deleted.toLocaleString()} แถว จากโรงเรียนที่ไม่ใช้งาน ${result.orphanSchools.toLocaleString()} แห่ง`)
      setSelected(new Set())
      load()
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <AlertModal />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>ล้างข้อมูลโรงเรียนไม่ใช้งาน</h1>
        <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.5 }}>
          ลบเฉพาะ <b>evaluation_settings</b> (แม่แบบตั้งค่าประเมิน) ของโรงเรียนที่ยังไม่มีผู้ใช้และไม่มีห้องเรียน
          รายชื่อโรงเรียนในฐานข้อมูลจะไม่ถูกลบ
        </p>
      </div>

      {summary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'โรงเรียนในระบบ', value: summary.schoolCount },
            { label: 'โรงเรียนใช้งานจริง', value: summary.activeSchoolCount },
            { label: 'โรงเรียนในรายชื่ออย่างเดียว', value: summary.orphanSchoolCount },
            { label: 'แถว settings ทั้งหมด', value: summary.settingsCount },
            { label: 'settings ค้าง (ไม่ใช้งาน)', value: summary.orphanSettingsCount, highlight: summary.orphanSettingsCount > 0 },
          ].map(card => (
            <div key={card.label} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: card.highlight ? '#FEF3C7' : 'white' }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{card.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{card.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <LoadingButton
          loading={cleaning}
          onClick={runCleanupAll}
          disabled={!summary?.orphanSettingsCount}
          style={{ background: '#DC2626', color: 'white', border: 'none' }}
        >
          ล้าง settings โรงเรียนไม่ใช้งานทั้งหมด
        </LoadingButton>
        <LoadingButton
          loading={cleaning}
          onClick={() => runCleanup([...selected], `ล้าง ${selected.size} โรงเรียนที่เลือก`)}
          disabled={selected.size === 0}
        >
          ล้างที่เลือก ({selected.size})
        </LoadingButton>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อโรงเรียนที่มี settings ค้าง..."
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-secondary">ค้นหา</button>
      </form>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)' }}>กำลังโหลด...</div>
        ) : schools.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)' }}>
            ไม่พบโรงเรียนที่ไม่ใช้งานแต่ยังมี evaluation_settings ค้างอยู่
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 44 }}>
                  <input type="checkbox" checked={selected.size === schools.length && schools.length > 0} onChange={toggleAll} />
                </th>
                <th>โรงเรียน</th>
                <th>จังหวัด</th>
                <th>อำเภอ</th>
                <th style={{ textAlign: 'right' }}>แถว settings</th>
              </tr>
            </thead>
            <tbody>
              {schools.map(school => (
                <tr key={school.id}>
                  <td><input type="checkbox" checked={selected.has(school.id)} onChange={() => toggleOne(school.id)} /></td>
                  <td>{school.name}</td>
                  <td>{school.province || '-'}</td>
                  <td>{school.district || '-'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{school.settings_count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>
        โรงเรียนที่สมัครและได้รับการอนุมัติจะได้รับการสร้าง evaluation_settings อัตโนมัติครั้งเดียวตอนเปิดใช้งาน
      </p>
      <p style={{ marginTop: 8, fontSize: 13, color: '#92400E', background: '#FEF3C7', padding: '10px 12px', borderRadius: 8 }}>
        หลังลบจำนวนมาก disk ใน Dashboard อาจยังไม่ลดทันที — ต้องรัน <b>VACUUM FULL</b> ใน Supabase SQL Editor:
        <code style={{ display: 'block', marginTop: 6 }}>vacuum full analyze public.evaluation_settings;</code>
      </p>
    </div>
  )
}
