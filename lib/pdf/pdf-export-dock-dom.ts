'use client'

import {
  dismissPdfExportDock,
  downloadAllReadyPdfExportJobs,
  downloadPdfExportJob,
  getPdfExportJobs,
  isPdfExportDockVisible,
  removePdfExportJob,
  subscribePdfExportQueue,
  type PdfExportJob,
} from '@/lib/pdf/pdf-export-queue'

const HOST_ID = 'pp5-pdf-export-dock-host'
const STARTED_KEY = '__pp5PdfExportDockDomStarted'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isPrintCapturePage() {
  const q = new URLSearchParams(window.location.search)
  return q.get('print') === '1' || q.get('embed') === '1' || q.get('autoprint') === '1'
}

function statusText(job: PdfExportJob) {
  if (job.status === 'pending') return 'กำลังสร้าง...'
  if (job.status === 'error') return job.error || 'ไม่สำเร็จ'
  return 'พร้อมดาวน์โหลด'
}

/** เก็บ node ไว้ในตัวแปร — แม้ React ดึงออกจาก body ก็เอากลับมาแปะใหม่ได้ */
let hostEl: HTMLDivElement | null = null
let guardTimer: number | null = null
let observer: MutationObserver | null = null

function ensureHost() {
  if (!hostEl) {
    hostEl = document.createElement('div')
    hostEl.id = HOST_ID
    hostEl.setAttribute('data-pp5-pdf-dock', '1')
  }
  // แปะใต้ html ไม่ใช่ body — Next/React มัก reconcile children ของ body แล้วลบ node แปลกปลอม
  const root = document.documentElement
  if (hostEl.parentElement !== root) {
    root.appendChild(hostEl)
  }
  return hostEl
}

function renderDock() {
  if (typeof document === 'undefined') return

  const visible = isPdfExportDockVisible() && !isPrintCapturePage()
  if (!visible) {
    if (hostEl?.isConnected) hostEl.replaceChildren()
    if (hostEl) hostEl.hidden = true
    return
  }

  const host = ensureHost()
  host.hidden = false
  const jobs = getPdfExportJobs()
  const pendingCount = jobs.filter(j => j.status === 'pending').length
  const readyCount = jobs.filter(j => j.status === 'ready').length
  const errorCount = jobs.filter(j => j.status === 'error').length
  const title = pendingCount > 0
    ? `กำลังสร้าง PDF · ${pendingCount} ไฟล์`
    : readyCount > 0
      ? `PDF พร้อมแล้ว · ${readyCount} ไฟล์`
      : errorCount > 0
        ? 'สร้าง PDF ไม่สำเร็จ'
        : 'คิว PDF'

  const items = jobs.map(job => {
    const tone = job.status === 'pending' ? 'is-pending' : job.status === 'error' ? 'is-error' : 'is-ready'
    const actions = [
      job.status === 'ready'
        ? `<button type="button" class="pdf-export-dock__btn pdf-export-dock__btn--primary" data-pdf-action="download" data-id="${escapeHtml(job.id)}">ดาวน์โหลด</button>`
        : '',
      job.status === 'error'
        ? `<button type="button" class="pdf-export-dock__btn" data-pdf-action="remove" data-id="${escapeHtml(job.id)}">ลบ</button>`
        : '',
      job.status === 'ready'
        ? `<button type="button" class="pdf-export-dock__btn pdf-export-dock__btn--ghost" data-pdf-action="remove" data-id="${escapeHtml(job.id)}" aria-label="ลบ">✕</button>`
        : '',
    ].join('')

    return `
      <li class="pdf-export-dock__item ${tone}">
        <div class="pdf-export-dock__item-main">
          <span class="pdf-export-dock__item-name" title="${escapeHtml(job.label)}">${escapeHtml(job.label)}</span>
          <span class="pdf-export-dock__item-status">${escapeHtml(statusText(job))}</span>
        </div>
        <div class="pdf-export-dock__item-actions">${actions}</div>
      </li>
    `
  }).join('')

  const foot = readyCount > 1
    ? `<footer class="pdf-export-dock__foot">
        <button type="button" class="pdf-export-dock__btn pdf-export-dock__btn--primary pdf-export-dock__btn--block" data-pdf-action="download-all">
          ดาวน์โหลด ZIP (${readyCount} ไฟล์)
        </button>
      </footer>`
    : ''

  host.innerHTML = `
    <aside class="pdf-export-dock" aria-live="polite" aria-label="สถานะสร้าง PDF">
      <header class="pdf-export-dock__head">
        <div class="pdf-export-dock__title-wrap">
          ${pendingCount > 0
            ? '<span class="pdf-export-dock__spinner" aria-hidden="true"></span>'
            : '<span class="pdf-export-dock__check" aria-hidden="true">✓</span>'}
          <div>
            <strong class="pdf-export-dock__title">${escapeHtml(title)}</strong>
            <p class="pdf-export-dock__hint">ติดตามได้แม้เปลี่ยนหน้า · กดปิดเมื่อเสร็จ</p>
          </div>
        </div>
        <button type="button" class="pdf-export-dock__close" data-pdf-action="dismiss" aria-label="ปิดกล่อง PDF">×</button>
      </header>
      <ul class="pdf-export-dock__list">${items}</ul>
      ${foot}
    </aside>
  `
}

function onHostClick(event: Event) {
  const target = event.target
  if (!(target instanceof Element)) return
  const btn = target.closest('[data-pdf-action]')
  if (!(btn instanceof HTMLElement)) return
  const action = btn.dataset.pdfAction
  const id = btn.dataset.id
  if (action === 'dismiss') dismissPdfExportDock()
  else if (action === 'download' && id) {
    downloadPdfExportJob(id)
    btn.classList.add('is-done')
    btn.textContent = 'สำเร็จ'
  }
  else if (action === 'remove' && id) removePdfExportJob(id)
  else if (action === 'download-all') {
    if (btn.dataset.busy === '1') return
    btn.dataset.busy = '1'
    const prev = btn.textContent
    btn.textContent = 'กำลังรวม ZIP...'
    btn.setAttribute('disabled', 'true')
    void downloadAllReadyPdfExportJobs()
      .then(ok => {
        btn.classList.add('is-done')
        btn.textContent = ok ? 'ดาวน์โหลด ZIP แล้ว' : (prev || 'ดาวน์โหลด ZIP')
      })
      .catch(() => {
        btn.textContent = prev || 'ดาวน์โหลด ZIP'
      })
      .finally(() => {
        btn.dataset.busy = '0'
        btn.removeAttribute('disabled')
        window.setTimeout(() => renderDock(), 1200)
      })
  }
}

function startGuard() {
  if (guardTimer != null) return
  guardTimer = window.setInterval(() => {
    if (!isPdfExportDockVisible()) return
    // ถ้า React/Next ดึง host ออก — แปะกลับแล้ววาดใหม่
    if (!hostEl || !hostEl.isConnected || hostEl.parentElement !== document.documentElement) {
      ensureHost()
      renderDock()
    }
  }, 400)
}

/** เริ่มระบบกล่อง PDF แบบ DOM (ไม่ผูก React tree) */
export function startPdfExportDockDom() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const w = window as Window & { [STARTED_KEY]?: boolean }
  if (w[STARTED_KEY]) {
    renderDock()
    return
  }
  w[STARTED_KEY] = true

  ensureHost()
  hostEl!.addEventListener('click', onHostClick)
  subscribePdfExportQueue(renderDock)
  renderDock()
  startGuard()

  if (!observer) {
    observer = new MutationObserver(() => {
      if (!isPdfExportDockVisible()) return
      if (!hostEl?.isConnected) {
        ensureHost()
        renderDock()
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }
}
