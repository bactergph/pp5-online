'use client'

import { useEffect, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function NavigationProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setPending(false)
    document.body.removeAttribute('data-nav-pending')
  }, [pathname, searchParams])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const target = e.target
      if (!(target instanceof Element)) return
      const a = target.closest('a[href]')
      if (!(a instanceof HTMLAnchorElement)) return
      if (a.hasAttribute('download')) return
      if (a.target && a.target !== '_self') return

      const raw = a.getAttribute('href')
      if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) return

      let url: URL
      try {
        url = new URL(raw, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return

      const next = `${url.pathname}${url.search}`
      const current = `${window.location.pathname}${window.location.search}`
      if (next === current) return

      // highlight ลิงก์ที่กดทันที
      document.querySelectorAll('[data-nav-active-pending]').forEach(el => el.removeAttribute('data-nav-active-pending'))
      a.setAttribute('data-nav-active-pending', '1')

      setPending(true)
      document.body.setAttribute('data-nav-pending', '1')
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!pending) return
    const t = window.setTimeout(() => {
      setPending(false)
      document.body.removeAttribute('data-nav-pending')
      document.querySelectorAll('[data-nav-active-pending]').forEach(el => el.removeAttribute('data-nav-active-pending'))
    }, 15000)
    return () => window.clearTimeout(t)
  }, [pending])

  useEffect(() => {
    if (pending) return
    document.querySelectorAll('[data-nav-active-pending]').forEach(el => el.removeAttribute('data-nav-active-pending'))
  }, [pending])

  if (!pending) return null

  return (
    <div className="nav-transit" aria-busy="true" aria-label="กำลังเปลี่ยนหน้า">
      <div className="nav-transit__bar" />
    </div>
  )
}

export default function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  )
}
