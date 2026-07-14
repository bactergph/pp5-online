'use client'
import { useEffect, useMemo, useState } from 'react'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'
import {
  bulkUpsertGlobalSubjects,
  deleteGlobalSubject,
  fetchGlobalSubjects,
  saveGlobalSubject,
  type GlobalSubject,
} from './actions'

const empty = {
  id: '',
  code: '',
  name: '',
  short_name: '',
  subject_group: SUBJECT_GROUPS[0] as string,
  type: 'พื้นฐาน',
  hours_per_year: 40,
  credits: 1,
  max_score: 100,
  sort_order: 0,
}

type Draft = typeof empty

const CODE_GROUP: Record<string, string> = {
  ท: 'ภาษาไทย', ค: 'คณิตศาสตร์', ว: 'วิทยาศาสตร์และเทคโนโลยี',
  ส: 'สังคมศึกษา ศาสนา และวัฒนธรรม', พ: 'สุขศึกษาและพลศึกษา',
  ศ: 'ศิลปะ', ง: 'การงานอาชีพ', อ: 'ภาษาต่างประเทศ',
}

function deriveGroup(code: string) {
  return CODE_GROUP[code.trim().charAt(0)] || SUBJECT_GROUPS[0]
}

export default function DistrictSubjectsPage() {
  const [subjects, setSubjects] = useState<GlobalSubject[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<Draft>(empty)
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteSaving, setPasteSaving] = useState(false)
  const { notify, AlertModal } = useAppAlert()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setSubjects(await fetchGlobalSubjects())
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'โหลดไม่สำเร็จ')
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return subjects.filter(s => {
      const matchQ = !q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      const matchG = !filterGroup || s.subject_group === filterGroup
      return matchQ && matchG
    })
  }, [subjects, search, filterGroup])

  function openAdd() {
    setDraft({ ...empty })
    setShowForm(true)
  }

  function openEdit(s: GlobalSubject) {
    setDraft({
      id: s.id,
      code: s.code,
      name: s.name,
      short_name: s.short_name || '',
      subject_group: s.subject_group,
      type: s.type || 'พื้นฐาน',
      hours_per_year: s.hours_per_year || 0,
      credits: Number(s.credits) || 0,
      max_score: s.max_score || 100,
      sort_order: s.sort_order || 0,
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await saveGlobalSubject(draft.id || null, {
      code: draft.code,
      name: draft.name,
      short_name: draft.short_name,
      subject_group: draft.subject_group,
      type: draft.type,
      hours_per_year: draft.hours_per_year,
      credits: draft.credits,
      max_score: draft.max_score,
      sort_order: draft.sort_order,
    })
    setSaving(false)
    if (error) { notify('error', error); return }
    notify('success', draft.id ? 'อัปเดตรายวิชากลางแล้ว' : 'เพิ่มรายวิชากลางแล้ว')
    setShowForm(false)
    load()
  }

  async function handleDelete(s: GlobalSubject) {
    if (!confirm(`ลบรายวิชา ${s.code} ${s.name}?`)) return
    const { error } = await deleteGlobalSubject(s.id)
    if (error) notify('error', error)
    else { notify('success', 'ลบแล้ว'); load() }
  }

  async function handlePasteSave() {
    const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const rows = []
    for (const line of lines) {
      const cols = line.split('\t').map(c => c.trim())
      // code, name, [short], [group], [type], [hours], [credits], [max]
      const code = (cols[0] || '').toUpperCase()
      const name = cols[1] || ''
      if (!code || !name) continue
      rows.push({
        code,
        name,
        short_name: cols[2] || null,
        subject_group: cols[3] || deriveGroup(code),
        type: cols[4] || 'พื้นฐาน',
        hours_per_year: Number(cols[5]) || 0,
        credits: Number(cols[6]) || 0,
        max_score: Number(cols[7]) || 100,
      })
    }
    if (!rows.length) {
      notify('error', 'ไม่พบข้อมูล — วางเป็นคอลัมน์: รหัส ชื่อ [ชื่อย่อ] [กลุ่มสาระ] [ประเภท] [ชั่วโมง] [หน่วยกิต] [คะแนนเต็ม]')
      return
    }
    setPasteSaving(true)
    const { error, count } = await bulkUpsertGlobalSubjects(rows)
    setPasteSaving(false)
    if (error) { notify('error', error); return }
    notify('success', `บันทึก ${count} รายวิชาเรียบร้อย`)
    setShowPaste(false)
    setPasteText('')
    load()
  }

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">Central curriculum</span>
          <h1 className="page-title">โครงสร้างรายวิชากลาง</h1>
          <p className="page-subtitle">
            แม่แบบรายวิชาของระบบ — โรงเรียนสามารถนำเข้าไปใช้ได้ {subjects.length.toLocaleString()} รายการ
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setShowPaste(true)}>วางจากตาราง</button>
          <button type="button" className="btn btn-primary" onClick={openAdd}>+ เพิ่มรายวิชา</button>
        </div>
      </div>

      <AlertModal />

      <div className="filter-bar control-card">
        <input
          className="form-input"
          placeholder="ค้นหารหัสหรือชื่อวิชา..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, maxWidth: 360 }}
        />
        <select className="form-input" value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={{ width: 240 }}>
          <option value="">กลุ่มสาระทั้งหมด</option>
          {SUBJECT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="data-card">
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>
            {subjects.length === 0 ? 'ยังไม่มีรายวิชากลาง — กดเพิ่มหรือวางจากตาราง' : 'ไม่พบรายวิชาที่ค้นหา'}
          </div>
        ) : (
          <table className="thai-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>รหัส</th>
                <th>ชื่อวิชา</th>
                <th style={{ width: 180 }}>กลุ่มสาระ</th>
                <th style={{ width: 90 }}>ประเภท</th>
                <th style={{ width: 70 }}>ชม./ปี</th>
                <th style={{ width: 70 }}>นก.</th>
                <th style={{ width: 110 }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 700 }}>{s.code}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    {s.short_name && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.short_name}</div>}
                  </td>
                  <td style={{ fontSize: 13 }}>{s.subject_group}</td>
                  <td style={{ fontSize: 13 }}>{s.type}</td>
                  <td style={{ textAlign: 'center' }}>{s.hours_per_year}</td>
                  <td style={{ textAlign: 'center' }}>{s.credits}</td>
                  <td>
                    <button type="button" onClick={() => openEdit(s)} style={{ fontSize: 13, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginRight: 8 }}>แก้ไข</button>
                    <button type="button" onClick={() => handleDelete(s)} style={{ fontSize: 13, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer' }}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="section-title" style={{ marginBottom: 14 }}>{draft.id ? 'แก้ไขรายวิชากลาง' : 'เพิ่มรายวิชากลาง'}</div>
            <form onSubmit={handleSave} className="form-grid">
              <div>
                <label className="form-label">รหัสวิชา *</label>
                <input className="form-input" required value={draft.code}
                  onChange={e => {
                    const code = e.target.value
                    setDraft(d => ({
                      ...d,
                      code,
                      subject_group: d.id ? d.subject_group : deriveGroup(code),
                    }))
                  }}
                  placeholder="ท12101" />
              </div>
              <div>
                <label className="form-label">ชื่อย่อ</label>
                <input className="form-input" value={draft.short_name} onChange={e => setDraft(d => ({ ...d, short_name: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">ชื่อวิชา *</label>
                <input className="form-input" required value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">กลุ่มสาระ *</label>
                <select className="form-input" value={draft.subject_group} onChange={e => setDraft(d => ({ ...d, subject_group: e.target.value }))}>
                  {SUBJECT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">ประเภท</label>
                <select className="form-input" value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}>
                  <option value="พื้นฐาน">พื้นฐาน</option>
                  <option value="เพิ่มเติม">เพิ่มเติม</option>
                </select>
              </div>
              <div>
                <label className="form-label">ชั่วโมง/ปี</label>
                <input className="form-input" type="number" value={draft.hours_per_year} onChange={e => setDraft(d => ({ ...d, hours_per_year: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="form-label">หน่วยกิต</label>
                <input className="form-input" type="number" step="0.5" value={draft.credits} onChange={e => setDraft(d => ({ ...d, credits: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="form-label">คะแนนเต็ม</label>
                <input className="form-input" type="number" value={draft.max_score} onChange={e => setDraft(d => ({ ...d, max_score: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="form-label">ลำดับ</label>
                <input className="form-input" type="number" value={draft.sort_order} onChange={e => setDraft(d => ({ ...d, sort_order: Number(e.target.value) }))} />
              </div>
              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setShowForm(false)}>ยกเลิก</button>
                <LoadingButton type="submit" loading={saving}>บันทึก</LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaste && (
        <div className="modal-backdrop" onClick={() => !pasteSaving && setShowPaste(false)}>
          <div className="modal-card" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div className="section-title" style={{ marginBottom: 8 }}>วางจากตาราง</div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
              คัดลอกจาก Excel แล้ววางด้านล่าง · คอลัมน์: รหัส · ชื่อ · ชื่อย่อ · กลุ่มสาระ · ประเภท · ชั่วโมง · หน่วยกิต · คะแนนเต็ม
            </p>
            <textarea
              className="form-input"
              rows={12}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={'ท12101\tภาษาไทย\tท123\tภาษาไทย\tพื้นฐาน\t160\t4\t100'}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
            <div className="form-actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-secondary" disabled={pasteSaving} onClick={() => setShowPaste(false)}>ยกเลิก</button>
              <LoadingButton loading={pasteSaving} onClick={handlePasteSave}>บันทึกที่วาง</LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
