'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * iOS Safari zooms into inputs (<16px) and often keeps that zoom after login/navigation.
 * Briefly pin maximum-scale=1 then restore — resets scale without permanently blocking pinch-zoom on iOS.
 */
function resetIosViewportScale() {
  if (typeof window === 'undefined') return
  const ua = window.navigator.userAgent
  if (!/iPhone|iPad|iPod/i.test(ua)) return

  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return

  const base = 'width=device-width, initial-scale=1, viewport-fit=cover'
  meta.setAttribute('content', `${base}, maximum-scale=1`)
  window.setTimeout(() => {
    meta.setAttribute('content', `${base}, maximum-scale=5`)
  }, 300)
}

export default function IosViewportFix() {
  const pathname = usePathname()

  useEffect(() => {
    resetIosViewportScale()

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) resetIosViewportScale()
    }

    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [pathname])

  return null
}
