'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatStaffName } from '@/lib/roles'

export type StaffOption = {
  id: string
  prefix: string
  full_name: string
  position?: string | null
  role?: string
}

type Props = {
  label?: string
  staff: StaffOption[]
  value: string | null
  onChange: (userId: string | null, displayName: string) => void
  placeholder?: string
  allowManual?: boolean
  manualValue?: string
  onManualChange?: (name: string) => void
}

export default function StaffPicker({
  label,
  staff,
  value,
  onChange,
  placeholder = 'ค้นหาชื่อบุคลากร...',
  allowManual = false,
  manualValue = '',
  onManualChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = staff.find(s => s.id === value) || null
  const display = selected
    ? formatStaffName(selected.prefix, selected.full_name)
    : (allowManual ? manualValue : '')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return staff
    return staff.filter(s => {
      const name = formatStaffName(s.prefix, s.full_name).toLowerCase()
      const pos = (s.position || '').toLowerCase()
      return name.includes(q) || pos.includes(q)
    })
  }, [staff, query])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(user: StaffOption) {
    onChange(user.id, formatStaffName(user.prefix, user.full_name))
    setQuery('')
    setOpen(false)
  }

  function clear() {
    onChange(null, '')
    setQuery('')
    setOpen(false)
    onManualChange?.('')
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {label && <label className="form-label">{label}</label>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="form-input"
          value={open ? query : display}
          placeholder={placeholder}
          onChange={e => {
            setQuery(e.target.value)
            if (allowManual) onManualChange?.(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          style={{ flex: 1 }}
        />
        {(value || display) && (
          <button type="button" className="btn btn-secondary" onClick={clear}>ล้าง</button>
        )}
      </div>
      {open && (
        <div
          className="data-card"
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 220,
            overflow: 'auto',
            padding: 6,
            boxShadow: '0 12px 28px rgba(15,23,42,0.12)',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--text-3)' }}>ไม่พบรายชื่อ</div>
          ) : filtered.map(user => (
            <button
              key={user.id}
              type="button"
              onClick={() => pick(user)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                border: 'none',
                borderRadius: 8,
                background: user.id === value ? '#EFF6FF' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {formatStaffName(user.prefix, user.full_name)}
              </div>
              {user.position && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{user.position}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
