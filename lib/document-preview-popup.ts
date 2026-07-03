const POPUP_NAME = 'pp5-document-preview'
const POPUP_FEATURES = 'popup=yes,width=1000,height=720,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'

let activePopup: Window | null = null

export function scopeDocumentPreviewPath(path: string) {
  if (typeof window === 'undefined') return path
  const match = window.location.pathname.match(/^\/school\/([^/]+)/)
  if (!match || !path.startsWith('/')) return path
  return `/school/${match[1]}${path}`
}

export function resolveDocumentPreviewUrl(path: string) {
  const scoped = scopeDocumentPreviewPath(path)
  if (scoped.startsWith('http')) return scoped
  if (typeof window === 'undefined') return scoped
  return new URL(scoped, window.location.origin).href
}

export function openDocumentPreviewPopup(path: string) {
  const url = resolveDocumentPreviewUrl(path)
  if (activePopup && !activePopup.closed) {
    activePopup.location.href = url
    activePopup.focus()
    return activePopup
  }
  activePopup = window.open(url, POPUP_NAME, POPUP_FEATURES)
  activePopup?.focus()
  return activePopup
}

export function closeDocumentPreviewPopup() {
  if (activePopup && !activePopup.closed) {
    activePopup.close()
  }
  activePopup = null
}

export function focusDocumentPreviewPopup() {
  if (activePopup && !activePopup.closed) {
    activePopup.focus()
    return true
  }
  return false
}
