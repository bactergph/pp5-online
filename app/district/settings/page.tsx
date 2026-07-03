'use client'
import { useState, useEffect, useRef } from 'react'
import LoadingButton from '@/components/LoadingButton'
import { saveDistrictArea, getDistrictArea } from './actions'
import { useAppAlert } from '@/lib/use-app-alert'

export type DistrictDefaults = {
  department: string
  area_office: string
  province: string
  document_prefix: string
  area_code: string
  schoolIdPrefix?: string
  seqMin?: number | null
  seqMax?: number | null
}

type ZoneEntry = {
  label: string
  province: string
  department: string
  schoolIdPrefix: string
  seqMin: number | null
  seqMax: number | null
  count: number
}

const STORAGE_KEY = 'district_defaults'

export function loadDistrictDefaults(): DistrictDefaults {
  if (typeof window === 'undefined') {
    return { department: '', area_office: '', province: '', document_prefix: '', area_code: '' }
  }
  try {
    return {
      department: '', area_office: '', province: '', document_prefix: '', area_code: '',
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'),
    }
  } catch {
    return { department: '', area_office: '', province: '', document_prefix: '', area_code: '' }
  }
}

export function saveDistrictDefaults(d: DistrictDefaults) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
}

export default function DistrictSettingsPage() {
  const [defaults, setDefaults] = useState<DistrictDefaults>({
    department: '', area_office: '', province: '', document_prefix: '', area_code: '',
  })
  const [query, setQuery] = useState('')
  const [zones, setZones] = useState<ZoneEntry[]>([])
  const [suggestions, setSuggestions] = useState<ZoneEntry[]>([])
  const [selectedZone, setSelectedZone] = useState<ZoneEntry | null>(null)
  const [showDrop, setShowDrop] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState<{ step: string; msg: string }[]>([])
  const { notify, clearAlert, AlertModal } = useAppAlert()
  const searchRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void Promise.resolve().then(() => {
      const local = loadDistrictDefaults()
      setDefaults(local)
      // โหลด area_office จาก Supabase (authoritative) แล้ว override ค่าใน localStorage
      getDistrictArea().then(serverArea => {
        if (serverArea) {
          setDefaults(prev => ({ ...prev, area_office: serverArea }))
          setQuery(serverArea)
        }
      })
      fetch('/zones-static.json')
        .then(r => r.json())
        .then(data => {
          // กรองเฉพาะ สพป + สพม (ไม่รวม สำนักบริหารงานการศึกษาพิเศษ ฯลฯ)
          setZones(data.filter((z: ZoneEntry) =>
            z.label.startsWith('สพป.') || z.label.startsWith('สพม.')
          ))
        })
    })
  }, [])

  // ค้นหา zone แบบ fuzzy
  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!query.trim()) { setSuggestions([]); return }
      const q = query.trim().toLowerCase()
      const matches = zones.filter(z =>
        z.label.toLowerCase().includes(q) ||
        z.province.toLowerCase().includes(q)
      ).slice(0, 12)
      setSuggestions(matches)
      setShowDrop(matches.length > 0)
    })
  }, [query, zones])

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function selectZone(z: ZoneEntry) {
    setSelectedZone(z)
    setQuery(z.label)
    setShowDrop(false)
    setDefaults(prev => ({
      ...prev,
      area_office: z.label,
      province: z.province,
      department: z.department,
      schoolIdPrefix: z.schoolIdPrefix,
      seqMin: z.seqMin,
      seqMax: z.seqMax,
    }))
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    clearAlert()
    const fd = new FormData(e.currentTarget)

    const data: DistrictDefaults = {
      department: fd.get('department') as string,
      area_office: fd.get('area_office') as string,
      province: fd.get('province') as string,
      document_prefix: fd.get('document_prefix') as string,
      area_code: (fd.get('area_code') as string).trim(),
      schoolIdPrefix: defaults.schoolIdPrefix,
      seqMin: defaults.seqMin,
      seqMax: defaults.seqMax,
    }
    saveDistrictDefaults(data)
    setDefaults(data)

    // บันทึก area_office ลง DB + refresh session
    await saveDistrictArea(data.area_office)
    setSaving(false)

    // ถ้ามี schoolIdPrefix → sync โรงเรียนอัตโนมัติ (streaming)
    if (data.schoolIdPrefix) {
      setSyncing(true)
      setSyncLog([])
      clearAlert()
      try {
        const res = await fetch('/api/district/schools/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schoolIdPrefix: data.schoolIdPrefix,
            seqMin: data.seqMin,
            seqMax: data.seqMax,
            area_office: data.area_office,
            province: data.province,
            department: data.department,
          }),
        })
        if (!res.body) throw new Error('no stream')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let lastMsg = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const data = JSON.parse(line)
              setSyncLog(prev => [...prev, data])
              lastMsg = data.msg
              if (data.step === 'done') {
                notify('success', lastMsg)
              } else if (data.step === 'error') {
                notify('error', lastMsg)
              }
            } catch { /* skip malformed */ }
          }
        }
      } catch {
        notify('error', 'เชื่อมต่อ MOE API ไม่ได้')
      } finally {
        setSyncing(false)
      }
    } else {
      notify('success', 'บันทึกการตั้งค่าเรียบร้อยแล้ว')
    }
  }

  const isLoading = saving || syncing

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">District defaults</span>
          <h1 className="page-title">ตั้งค่าสำนักงานเขต</h1>
          <p className="page-hero-kicker">ค้นหาเขตพื้นที่การศึกษา — ระบบจะกรอกข้อมูลและนำเข้าโรงเรียนให้อัตโนมัติ</p>
        </div>
      </div>

      <AlertModal />

      <div className="card-padded" style={{ maxWidth: '760px' }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Zone Search */}
          <div>
            <label className="form-label" style={{ fontWeight: 600 }}>
              ค้นหาเขตพื้นที่การศึกษา
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={searchRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedZone(null) }}
                onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                className="form-input"
                placeholder="พิมพ์ชื่อเขต หรือจังหวัด เช่น บึงกาฬ, สพป.เชียงใหม่"
                autoComplete="off"
              />
              {showDrop && (
                <div ref={dropRef} style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'white', border: '1px solid var(--border)',
                  borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)',
                  maxHeight: '320px', overflowY: 'auto', marginTop: '4px',
                }}>
                  {suggestions.map(z => (
                    <button key={z.label} type="button"
                      onMouseDown={() => selectZone(z)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                        cursor: 'pointer', textAlign: 'left', gap: '12px',
                        borderBottom: '1px solid var(--border)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span>
                        <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>{z.label}</span>
                        <span style={{ color: 'var(--text-3)', fontSize: '13px', marginLeft: '8px' }}>
                          จ.{z.province}
                        </span>
                      </span>
                      <span style={{
                        fontSize: '12px', color: 'var(--text-3)',
                        background: 'var(--surface)', padding: '2px 8px', borderRadius: '12px', whiteSpace: 'nowrap',
                      }}>
                        {z.count} รร.
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedZone && (
              <p style={{ fontSize: '13px', color: 'var(--success)', marginTop: '6px' }}>
                ✓ เลือก {selectedZone.label} · {selectedZone.count} โรงเรียน
                {selectedZone.schoolIdPrefix && (
                  <span style={{ color: 'var(--text-3)', marginLeft: '6px' }}>
                    (รหัส {selectedZone.schoolIdPrefix})
                  </span>
                )}
              </p>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-3)', margin: '-8px 0 0' }}>
            หรือกรอกข้อมูลเองด้านล่าง
          </p>

          {/* Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">สำนักงานเขตพื้นที่การศึกษา</label>
              <input
                name="area_office"
                value={defaults.area_office}
                onChange={e => setDefaults(p => ({ ...p, area_office: e.target.value }))}
                className="form-input"
                placeholder="เช่น สพป.บึงกาฬ"
              />
            </div>
            <div>
              <label className="form-label">จังหวัด</label>
              <input
                name="province"
                value={defaults.province}
                onChange={e => setDefaults(p => ({ ...p, province: e.target.value }))}
                className="form-input"
                placeholder="เช่น บึงกาฬ"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">สังกัดหลัก</label>
              <input
                name="department"
                value={defaults.department}
                onChange={e => setDefaults(p => ({ ...p, department: e.target.value }))}
                className="form-input"
                placeholder="เช่น สพฐ."
              />
            </div>
            <div>
              <label className="form-label">คำนำหน้าเลขหนังสือ (Default)</label>
              <input
                name="document_prefix"
                value={defaults.document_prefix}
                onChange={e => setDefaults(p => ({ ...p, document_prefix: e.target.value }))}
                className="form-input"
                placeholder="เช่น ศธ 04153/"
              />
            </div>
          </div>

          <div>
            <label className="form-label">รหัสเขตพื้นที่ OBEC (สำรอง)</label>
            <input
              name="area_code"
              value={defaults.area_code}
              onChange={e => setDefaults(p => ({ ...p, area_code: e.target.value }))}
              className="form-input"
              placeholder="เช่น 3801"
              pattern="\d{0,6}"
              style={{ maxWidth: '160px' }}
            />
            <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>
              ใช้เฉพาะกรณีนำเข้าจากไฟล์ Excel
            </p>
          </div>

          <div style={{ paddingTop: '4px' }}>
            <LoadingButton
              type="submit"
              loading={isLoading}
              loadingText={syncing ? 'กำลังนำเข้าโรงเรียน...' : 'กำลังบันทึก...'}
            >
              {selectedZone
                ? `บันทึกและนำเข้าโรงเรียน ${selectedZone.count} แห่ง`
                : 'บันทึกการตั้งค่า'}
            </LoadingButton>
            {selectedZone && !syncing && syncLog.length === 0 && (
              <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '8px' }}>
                ระบบจะดึงข้อมูลโรงเรียนจาก exchange-api.moe.go.th และนำเข้าในระบบให้อัตโนมัติ
              </p>
            )}
          </div>


        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Sync overlay */}
      {syncLog.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(2, 6, 23, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            background: '#0F172A',
            borderRadius: '20px',
            padding: '36px 40px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
            animation: 'fadeIn 0.2s ease',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
              {syncing ? (
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{
                    display: 'block', width: '22px', height: '22px',
                    border: '2.5px solid rgba(74,222,128,0.3)', borderTopColor: '#4ADE80',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                </div>
              ) : (
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: syncLog.at(-1)?.step === 'error' ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
                  border: `1px solid ${syncLog.at(-1)?.step === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px', flexShrink: 0,
                }}>
                  {syncLog.at(-1)?.step === 'error' ? '✕' : '✓'}
                </div>
              )}
              <div>
                <div style={{ color: 'white', fontWeight: 700, fontSize: '16px' }}>
                  {syncing ? 'กำลังนำเข้าโรงเรียน...' : syncLog.at(-1)?.step === 'error' ? 'เกิดข้อผิดพลาด' : 'นำเข้าเสร็จสิ้น'}
                </div>
                <div style={{ color: '#64748B', fontSize: '13px', marginTop: '2px' }}>
                  exchange-api.moe.go.th
                </div>
              </div>
            </div>

            {/* Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {syncLog.map((entry, i) => {
                const isLast = i === syncLog.length - 1
                const isDone = entry.step === 'done'
                const isError = entry.step === 'error'
                const isCurrent = isLast && syncing
                const color = isError ? '#F87171' : isDone ? '#4ADE80' : isCurrent ? '#FCD34D' : '#6EE7B7'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    padding: '8px 0',
                    borderBottom: i < syncLog.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    animation: 'slideUp 0.2s ease',
                  }}>
                    {/* icon */}
                    <div style={{ flexShrink: 0, width: '20px', display: 'flex', justifyContent: 'center', paddingTop: '2px' }}>
                      {isCurrent ? (
                        <span style={{
                          display: 'block', width: '13px', height: '13px',
                          border: '2px solid rgba(74,222,128,0.3)', borderTopColor: '#4ADE80',
                          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                        }} />
                      ) : (
                        <span style={{ color, fontSize: '13px', fontWeight: 700 }}>
                          {isError ? '✕' : '✓'}
                        </span>
                      )}
                    </div>
                    <span style={{ color, fontSize: '13px', lineHeight: '1.5', fontFamily: 'Sarabun, sans-serif' }}>
                      {entry.msg}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Footer button — แสดงหลัง done/error */}
            {!syncing && (
              <button
                onClick={() => setSyncLog([])}
                style={{
                  marginTop: '24px', width: '100%', padding: '12px',
                  borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: syncLog.at(-1)?.step === 'error'
                    ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)',
                  color: syncLog.at(-1)?.step === 'error' ? '#F87171' : '#4ADE80',
                  fontFamily: 'Sarabun, sans-serif', fontSize: '14px', fontWeight: 600,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = syncLog.at(-1)?.step === 'error' ? 'rgba(248,113,113,0.25)' : 'rgba(74,222,128,0.25)'}
                onMouseLeave={e => e.currentTarget.style.background = syncLog.at(-1)?.step === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)'}
              >
                ปิด
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
