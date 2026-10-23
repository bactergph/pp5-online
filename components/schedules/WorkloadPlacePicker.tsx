'use client'
import { useEffect, useId, useRef, useState } from 'react'

/** Keep IDs as values. A new venue is created only when its Add option is confirmed. */
export default function WorkloadPlacePicker({ places, value, onChange, onCreate, onPendingChange, label }: {
  places: { id: string; name: string }[]; value: string; onChange: (id: string) => void; onCreate: (name: string) => string; onPendingChange: (pending: boolean) => void; label: string
}) {
  const id = useId()
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const selected = places.find(place => place.id === value)
  const name = (query || '').replace(/\s+/g, ' ').trim()
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('th')
  const needle = normalize(name)
  const options: { id: string; name: string; create?: boolean }[] = [{ id: '', name: 'ไม่กำหนดสถานที่' }, ...places].filter(place => !needle || normalize(place.name).includes(needle))
  if (needle && !options.some(place => normalize(place.name) === needle)) options.push({ id: '__create__', name, create: true })
  useEffect(() => {
    const container = list.current, option = container?.querySelector<HTMLElement>(`[id="${id}-${active}"]`)
    if (!container || !option) return
    const top = option.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    if (top < container.scrollTop) container.scrollTop = top
    else if (top + option.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = top + option.offsetHeight - container.clientHeight
  }, [active, query, id])
  const cancelQuery = () => { setQuery(null); setOpen(false); setActive(0); setError(''); onPendingChange(false) }
  const choose = (id: string) => { onChange(id); cancelQuery() }
  const confirm = (option: typeof options[number]) => {
    try { choose(option.create ? onCreate(option.name) : option.id); setError('') }
    catch (error) { setError(error instanceof Error ? error.message : 'เพิ่มสถานที่ไม่สำเร็จ กรุณาลองใหม่') }
  }
  return <div className="prep-place-picker">
    <input role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
      value={query ?? selected?.name ?? ''} placeholder="ค้นหาหรือเพิ่มสถานที่" autoComplete="off" maxLength={100} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
      onFocus={() => { if (query === null) setQuery(''); setOpen(true); setActive(0) }} onClick={() => { if (!open) { if (query === null) setQuery(''); setOpen(true); setActive(0) } }}
      onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); setError(''); onPendingChange(!!event.target.value.trim()) }}
      onBlur={() => {
        setOpen(false)
        if (!needle) { cancelQuery(); return }
        const exact = [{ id: '', name: 'ไม่กำหนดสถานที่' }, ...places].find(place => normalize(place.name) === needle)
        if (exact) choose(exact.id)
        else { setError('เลือกจากรายการ หรือกด “+ เพิ่มสถานที่” เพื่อใช้ชื่อนี้'); onPendingChange(true) }
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); cancelQuery() }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          if (!open) { if (query === null) setQuery(''); setOpen(true); setActive(0) }
          else setActive(index => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
        }
        if (event.key === 'Enter' && open && !event.nativeEvent.isComposing) { event.preventDefault(); if (options[active]) confirm(options[active]) }
      }} />
    {open && <div ref={list} id={`${id}-list`} className="prep-place-options" role="listbox" aria-label={label}>
      {options.map((place, index) => <div key={place.id} id={`${id}-${index}`} role="option" aria-selected={!place.create && value === place.id} className={`${active === index ? 'is-active' : ''}${place.create ? ' prep-place-create' : ''}`}
        onMouseDown={event => event.preventDefault()} onClick={() => confirm(place)}>{place.create ? `+ เพิ่มสถานที่ “${place.name}”` : place.name}{!place.create && value === place.id && <span aria-hidden="true"> ✓</span>}</div>)}
    </div>}
    {error && <small id={`${id}-error`} className="prep-code-place-error" role="alert">{error}</small>}
  </div>
}
