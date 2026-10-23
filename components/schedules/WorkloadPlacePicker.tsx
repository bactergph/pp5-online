'use client'
import { useEffect, useId, useRef, useState } from 'react'

/** Keep the venue ID as the value; typed text is only a filter, never a new venue. */
export default function WorkloadPlacePicker({ places, value, onChange, label }: {
  places: { id: string; name: string }[]; value: string; onChange: (id: string) => void; label: string
}) {
  const id = useId()
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const selected = places.find(place => place.id === value)
  const needle = (query || '').trim().toLocaleLowerCase('th')
  const options = [{ id: '', name: 'ไม่กำหนดสถานที่' }, ...places].filter(place => !needle || place.name.toLocaleLowerCase('th').includes(needle))
  useEffect(() => {
    const container = list.current, option = container?.querySelector<HTMLElement>(`[id="${id}-${active}"]`)
    if (!container || !option) return
    const top = option.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    if (top < container.scrollTop) container.scrollTop = top
    else if (top + option.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = top + option.offsetHeight - container.clientHeight
  }, [active, query, id])
  const choose = (id: string) => { onChange(id); setQuery(null); setActive(0) }
  return <div className="prep-place-picker">
    <input role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={query !== null} aria-controls={`${id}-list`} aria-activedescendant={query !== null && options[active] ? `${id}-${active}` : undefined}
      value={query ?? selected?.name ?? ''} placeholder="พิมพ์ค้นหาสถานที่" autoComplete="off"
      onFocus={() => { setQuery(''); setActive(0) }} onClick={() => { if (query === null) { setQuery(''); setActive(0) } }}
      onChange={event => { setQuery(event.target.value); setActive(0) }} onBlur={() => setQuery(null)}
      onKeyDown={event => {
        if (event.key === 'Escape' && query !== null) { event.preventDefault(); event.stopPropagation(); setQuery(null) }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          if (query === null) { setQuery(''); setActive(0) }
          else setActive(index => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
        }
        if (event.key === 'Enter' && query !== null) { event.preventDefault(); if (options[active]) choose(options[active].id) }
      }} />
    {query !== null && <div ref={list} id={`${id}-list`} className="prep-place-options" role="listbox" aria-label={label}>
      {options.map((place, index) => <div key={place.id} id={`${id}-${index}`} role="option" aria-selected={value === place.id} className={active === index ? 'is-active' : ''}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(place.id)}>{place.name}{value === place.id && <span aria-hidden="true"> ✓</span>}</div>)}
      {!options.length && <p role="status">ไม่พบสถานที่ ใช้ปุ่ม “เพิ่มสถานที่” ด้านบน</p>}
    </div>}
  </div>
}
