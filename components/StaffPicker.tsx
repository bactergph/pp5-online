'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
  // มีชื่อพิมพ์เองอยู่แล้ว → โหมด manual; ค่าว่างเริ่มที่เลือกจากระบบ (ลงนามได้)
  if (allowManual && manualValue.trim()) return 'manual'
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
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [mounted, setMounted] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!open) return

    function placeMenu() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const gap = 6
      const maxH = Math.min(320, Math.floor(window.innerHeight * 0.5))
      const spaceBelow = window.innerHeight - rect.bottom - gap - 8
      const spaceAbove = rect.top - gap - 8
      const openUp = spaceBelow < 200 && spaceAbove > spaceBelow
      const height = Math.max(160, Math.min(maxH, openUp ? spaceAbove : spaceBelow))
      const width = Math.max(rect.width, Math.min(360, window.innerWidth - 24))
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)

      setMenuStyle({
        position: 'fixed',
        left,
        width,
        zIndex: 12000,
        maxHeight: height,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + gap, top: 'auto' }
          : { top: rect.bottom + gap, bottom: 'auto' }),
      })
    }

    placeMenu()
    document.body.classList.add('staff-picker-menu-open')
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      document.body.classList.remove('staff-picker-menu-open')
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDoc(e: PointerEvent) {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (value) setMode('pick')
  }, [value])

  function switchMode(next: Mode) {
    setMode(next)
    setOpen(false)
    setQuery('')
    if (next === 'manual') {
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

  const showClear = Boolean(mode === 'manual' ? manualValue : (value || pickedLabel))

  const menu = open && mounted
    ? createPortal(
      <div
        ref={menuRef}
        className="staff-picker__menu staff-picker__menu--portal"
        role="listbox"
        style={menuStyle}
      >
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
        <div className="staff-picker__menu-list">
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
              {(user.position || user.role) && (
                <div className="staff-picker__option-meta">
                  {[user.position, user.role === 'teacher' ? 'ครู' : user.role].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div ref={wrapRef} className={`staff-picker${open ? ' is-open' : ''}${mode === 'manual' ? ' is-manual' : ' is-pick'}`}>
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
        <>
          <div className={`staff-picker__field${showClear ? ' has-clear' : ''}`}>
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
            {showClear && (
              <button type="button" className="staff-picker__clear" onClick={clear} aria-label="ล้างชื่อ">
                ×
              </button>
            )}
          </div>
          {!value && (
            <p className="staff-picker__hint staff-picker__hint--warn">
              มีชื่อบนเอกสาร แต่ลงนามดิจิทัลไม่ได้ — ควรเลือกจากรายชื่อในระบบ
            </p>
          )}
        </>
      ) : (
        <div className="staff-picker__pick">
          <div className={`staff-picker__field${showClear ? ' has-clear' : ''}`}>
            <button
              ref={triggerRef}
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
            {showClear && (
              <button type="button" className="staff-picker__clear" onClick={clear} aria-label="ล้างชื่อ">
                ×
              </button>
            )}
          </div>
          {menu}
        </div>
      )}
    </div>
  )
}
