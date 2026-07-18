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

type Mode = 'manual' | 'pick'

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

function initialMode(value: string | null, allowManual: boolean, manualValue: string): Mode {
  if (value) return 'pick'
  if (allowManual && manualValue.trim()) return 'manual'
  if (allowManual) return 'manual'
  return 'pick'
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
  const [mode, setMode] = useState<Mode>(() => initialMode(value, allowManual, manualValue))
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = staff.find(s => s.id === value) || null
  const pickedLabel = selected
    ? formatStaffName(selected.prefix, selected.full_name)
    : ''

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

  // ถ้า parent ตั้ง userId จากภายนอก ให้สลับไปโหมดเลือก
  useEffect(() => {
    if (value) setMode('pick')
  }, [value])

  function switchMode(next: Mode) {
    setMode(next)
    setOpen(false)
    setQuery('')
    if (next === 'manual') {
      // เคลียร์การผูก user — เก็บชื่อที่เห็นอยู่ให้พิมพ์ต่อได้
      const keep = pickedLabel || manualValue
      if (value) onChange(null, keep)
      if (keep && !manualValue) onManualChange?.(keep)
    }
  }

  function pick(user: StaffOption) {
    const name = formatStaffName(user.prefix, user.full_name)
    onChange(user.id, name)
    onManualChange?.(name)
    setQuery('')
    setOpen(false)
    setMode('pick')
  }

  function clear() {
    onChange(null, '')
    onManualChange?.('')
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={`staff-picker${open ? ' is-open' : ''}`}>
      {label && <label className="form-label">{label}</label>}

      {allowManual && (
        <div className="staff-picker__modes" role="group" aria-label="วิธีระบุชื่อ">
          <button
            type="button"
            className={`staff-picker__mode${mode === 'manual' ? ' is-active' : ''}`}
            aria-pressed={mode === 'manual'}
            onClick={() => switchMode('manual')}
          >
            พิมพ์ชื่อเอง
          </button>
          <button
            type="button"
            className={`staff-picker__mode${mode === 'pick' ? ' is-active' : ''}`}
            aria-pressed={mode === 'pick'}
            onClick={() => switchMode('pick')}
          >
            เลือกจากระบบ
          </button>
        </div>
      )}

      {mode === 'manual' && allowManual ? (
        <div className="staff-picker__row">
          <input
            className="form-input staff-picker__input staff-picker__input--manual"
            value={manualValue}
            placeholder="พิมพ์ชื่อ-นามสกุลที่ใช้ลงนาม"
            autoComplete="name"
            enterKeyHint="done"
            onChange={e => {
              const next = e.target.value
              onManualChange?.(next)
              if (value) onChange(null, next)
            }}
          />
          {manualValue && (
            <button type="button" className="btn btn-secondary staff-picker__clear" onClick={clear}>
              ล้าง
            </button>
          )}
        </div>
      ) : (
        <div className="staff-picker__pick">
          <div className="staff-picker__row">
            <button
              type="button"
              className={`staff-picker__trigger${pickedLabel ? '' : ' is-placeholder'}`}
              aria-haspopup="listbox"
              aria-expanded={open}
              onClick={() => {
                setOpen(v => !v)
                setQuery('')
              }}
            >
              <span className="staff-picker__trigger-text">
                {pickedLabel || (allowManual ? 'เลือกบุคลากรจากระบบ' : placeholder)}
              </span>
              <span className="staff-picker__chevron" aria-hidden>▾</span>
            </button>
            {(value || pickedLabel) && (
              <button type="button" className="btn btn-secondary staff-picker__clear" onClick={clear}>
                ล้าง
              </button>
            )}
          </div>

          {open && (
            <div className="staff-picker__menu" role="listbox">
              <div className="staff-picker__search-wrap">
                <input
                  className="form-input staff-picker__search"
                  value={query}
                  placeholder="ค้นหาชื่อ..."
                  autoComplete="off"
                  enterKeyHint="search"
                  autoFocus
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
              {filtered.length === 0 ? (
                <div className="staff-picker__empty">
                  {allowManual
                    ? 'ไม่พบในรายชื่อ — สลับไป “พิมพ์ชื่อเอง” ได้'
                    : 'ไม่พบรายชื่อ'}
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
      )}
    </div>
  )
}
