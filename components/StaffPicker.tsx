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
    function onDoc(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
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
    <div ref={wrapRef} className="staff-picker">
      {label && <label className="form-label">{label}</label>}
      <div className="staff-picker__row">
        <input
          className="form-input staff-picker__input"
          value={open ? query : display}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          onChange={e => {
            const next = e.target.value
            setQuery(next)
            if (allowManual) onManualChange?.(next)
            // พิมพ์ทับชื่อที่เลือกไว้ → เคลียร์ userId เพื่อให้เป็นกรอกมือ
            if (value) onChange(null, allowManual ? next : '')
            setOpen(true)
          }}
          onFocus={() => {
            setQuery(display)
            setOpen(true)
          }}
        />
        {(value || display) && (
          <button type="button" className="btn btn-secondary staff-picker__clear" onClick={clear}>
            ล้าง
          </button>
        )}
      </div>
      {open && (
        <div className="staff-picker__menu" role="listbox">
          {filtered.length === 0 ? (
            <div className="staff-picker__empty">
              {allowManual ? 'ไม่พบในรายชื่อ — พิมพ์ชื่อแล้วใช้ค่านั้นได้เลย' : 'ไม่พบรายชื่อ'}
            </div>
          ) : filtered.map(user => (
            <button
              key={user.id}
              type="button"
              role="option"
              aria-selected={user.id === value}
              className={`staff-picker__option${user.id === value ? ' is-selected' : ''}`}
              onPointerDown={e => e.preventDefault()}
              onClick={() => pick(user)}
            >
              <div className="staff-picker__option-name">
                {formatStaffName(user.prefix, user.full_name)}
              </div>
              {user.position && (
                <div className="staff-picker__option-meta">{user.position}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
