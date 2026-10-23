'use client'
import { useEffect, useId, useRef, useState } from 'react'

/** Keep IDs as values. A new venue is created only when its Add option is confirmed. */
export default function WorkloadPlacePicker({ places, value, onChange, onCreate, label }: {
  places: { id: string; name: string }[]; value: string; onChange: (id: string) => void; onCreate: (name: string) => string; label: string
}) {
  const id = useId()
  const [query, setQuery] = useState<string | null>(null)
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
  const choose = (id: string) => { onChange(id); setQuery(null); setActive(0) }
  const confirm = (option: typeof options[number]) => {
    try { choose(option.create ? onCreate(option.name) : option.id); setError('') }
    catch (error) { setError(error instanceof Error ? error.message : 'เพิ่มสถานที่ไม่สำเร็จ กรุณาลองใหม่') }
  }
  return <div className="prep-place-picker">
    <input role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={query !== null} aria-controls={`${id}-list`} aria-activedescendant={query !== null && options[active] ? `${id}-${active}` : undefined}
      value={query ?? selected?.name ?? ''} placeholder="ค้นหาหรือเพิ่มสถานที่" autoComplete="off" maxLength={100} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
      onFocus={() => { setQuery(''); setActive(0); setError('') }} onClick={() => { if (query === null) { setQuery(''); setActive(0); setError('') } }}
      onChange={event => { setQuery(event.target.value); setActive(0); setError('') }} onBlur={() => setQuery(null)}
      onKeyDown={event => {
        if (event.key === 'Escape' && query !== null) { event.preventDefault(); event.stopPropagation(); setQuery(null) }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          if (query === null) { setQuery(''); setActive(0) }
          else setActive(index => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
        }
        if (event.key === 'Enter' && query !== null && !event.nativeEvent.isComposing) { event.preventDefault(); if (options[active]) confirm(options[active]) }
      }} />
    {query !== null && <div ref={list} id={`${id}-list`} className="prep-place-options" role="listbox" aria-label={label}>
      {options.map((place, index) => <div key={place.id} id={`${id}-${index}`} role="option" aria-selected={!place.create && value === place.id} className={`${active === index ? 'is-active' : ''}${place.create ? ' prep-place-create' : ''}`}
        onMouseDown={event => event.preventDefault()} onClick={() => confirm(place)}>{place.create ? `+ เพิ่มสถานที่ “${place.name}”` : place.name}{!place.create && value === place.id && <span aria-hidden="true"> ✓</span>}</div>)}
    </div>}
    {error && <small id={`${id}-error`} className="prep-code-place-error" role="alert">{error}</small>}
  </div>
}
