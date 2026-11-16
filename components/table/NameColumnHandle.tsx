'use client'
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'

const STORAGE_KEY = 'jarnsek-name-column-width'
const MIN = 110
const MAX = 520
let shared = 0
const listeners = new Set<(width: number) => void>()

function clamp(width: number) {
  return Math.min(MAX, Math.max(MIN, Math.round(width)))
}

function storedWidth() {
  if (shared) return shared
  if (typeof window === 'undefined') return 0
  const saved = Number(window.localStorage.getItem(STORAGE_KEY))
  if (saved >= MIN && saved <= MAX) shared = saved
  return shared
}

function publish(width: number) {
  const next = clamp(width)
  shared = next
  window.localStorage.setItem(STORAGE_KEY, String(next))
  listeners.forEach(listener => listener(next))
}

export function useNameColumnWidth(fallback: number) {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const saved = storedWidth()
    if (saved) setWidth(saved)
    const listen = (next: number) => setWidth(next)
    listeners.add(listen)
    return () => { listeners.delete(listen) }
  }, [])
  return { width, setWidth: publish }
}

export default function NameColumnHandle({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    try { handle.setPointerCapture(event.pointerId) } catch { /* mouse drag still uses window listeners */ }
    const startX = event.clientX
    const startWidth = width
    document.body.classList.add('name-col-dragging')
    const move = (pointer: PointerEvent | MouseEvent) => onResize(startWidth + pointer.clientX - startX)
    const stop = () => {
      document.body.classList.remove('name-col-dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('mousemove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('mouseup', stop)
    window.addEventListener('pointercancel', stop)
  }

  return (
    <button
      type="button"
      className="name-col-resizer"
      aria-label="ลากเพื่อขยายช่องชื่อ"
      title="ลากเพื่อขยายช่องชื่อ"
      onPointerDown={startDrag}
    />
  )
}
