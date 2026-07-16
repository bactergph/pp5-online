'use client'

import { zipSync } from 'fflate'
import {
  fetchReportPdfBlob,
  type DownloadReportPdfInput,
} from '@/lib/pdf/download-report-pdf'
import { startPdfExportDockDom } from '@/lib/pdf/pdf-export-dock-dom'

export type PdfExportJobStatus = 'pending' | 'ready' | 'error'

export type PdfExportJob = {
  id: string
  fileName: string
  label: string
  status: PdfExportJobStatus
  blobUrl?: string
  error?: string
  createdAt: number
}

type Listener = () => void

type PdfExportStore = {
  jobs: PdfExportJob[]
  dockDismissed: boolean
  listeners: Set<Listener>
  blobs: Map<string, Blob>
}

const STORE_KEY = '__pp5PdfExportStore'
const EVENT_NAME = 'pp5-pdf-export-queue'

function getWindow(): Window | null {
  if (typeof window === 'undefined') return null
  return window
}

/** singleton บน window — ไม่ผูกกับ React module instance */
function getStore(): PdfExportStore {
  const w = getWindow() as (Window & { [STORE_KEY]?: PdfExportStore }) | null
  if (!w) {
    return { jobs: [], dockDismissed: false, listeners: new Set(), blobs: new Map() }
  }
  if (!w[STORE_KEY]) {
    w[STORE_KEY] = {
      jobs: [],
      dockDismissed: false,
      listeners: new Set(),
      blobs: new Map(),
    }
  }
  return w[STORE_KEY]!
}

function emit() {
  const store = getStore()
  store.listeners.forEach(listener => {
    try { listener() } catch { /* ignore */ }
  })
  getWindow()?.dispatchEvent(new CustomEvent(EVENT_NAME))
}

export function subscribePdfExportQueue(listener: Listener) {
  const store = getStore()
  store.listeners.add(listener)
  const w = getWindow()
  const onEvent = () => listener()
  w?.addEventListener(EVENT_NAME, onEvent)
  return () => {
    store.listeners.delete(listener)
    w?.removeEventListener(EVENT_NAME, onEvent)
  }
}

export function getPdfExportJobs() {
  return getStore().jobs
}

export function isPdfExportDockVisible() {
  const store = getStore()
  return !store.dockDismissed && store.jobs.length > 0
}

function newJobId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function dismissPdfExportDock() {
  const store = getStore()
  for (const job of store.jobs) {
    if (job.blobUrl) URL.revokeObjectURL(job.blobUrl)
  }
  store.blobs.clear()
  store.jobs = []
  store.dockDismissed = true
  emit()
}

export function removePdfExportJob(id: string) {
  const store = getStore()
  const target = store.jobs.find(job => job.id === id)
  if (target?.blobUrl) URL.revokeObjectURL(target.blobUrl)
  store.blobs.delete(id)
  store.jobs = store.jobs.filter(job => job.id !== id)
  if (store.jobs.length === 0) store.dockDismissed = true
  emit()
}

export function downloadPdfExportJob(id: string) {
  const store = getStore()
  const job = store.jobs.find(item => item.id === id)
  if (!job || job.status !== 'ready') return false

  const blob = store.blobs.get(id)
  const href = blob ? URL.createObjectURL(blob) : job.blobUrl
  if (!href) return false

  const link = document.createElement('a')
  link.href = href
  link.download = job.fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  if (blob) URL.revokeObjectURL(href)
  return true
}

function uniqueZipEntryName(fileName: string, used: Map<string, number>) {
  const safe = fileName.replace(/[\\/]/g, '-').trim() || 'document.pdf'
  const count = used.get(safe) || 0
  used.set(safe, count + 1)
  if (count === 0) return safe
  const dot = safe.lastIndexOf('.')
  if (dot <= 0) return `${safe} (${count + 1})`
  return `${safe.slice(0, dot)} (${count + 1})${safe.slice(dot)}`
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

/** รวม PDF ที่พร้อมแล้วเป็นไฟล์ ZIP เดียว */
export async function downloadAllReadyPdfExportJobs() {
  const store = getStore()
  const ready = store.jobs.filter(job => job.status === 'ready')
  if (ready.length === 0) return false
  if (ready.length === 1) return downloadPdfExportJob(ready[0].id)

  const files: Record<string, Uint8Array> = {}
  const usedNames = new Map<string, number>()

  for (const job of ready) {
    const blob = store.blobs.get(job.id)
    if (!blob) continue
    const bytes = new Uint8Array(await blob.arrayBuffer())
    files[uniqueZipEntryName(job.fileName, usedNames)] = bytes
  }

  if (Object.keys(files).length === 0) return false

  // PDF อัดอยู่แล้ว — level 0 เร็วและไฟล์ไม่พอง
  const zipped = zipSync(files, { level: 0 })
  const zipBlob = new Blob([zipped], { type: 'application/zip' })
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const zipName = `PDF_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`
  triggerBlobDownload(zipBlob, zipName)
  return true
}

/** ใส่คิวสร้าง PDF — กล่องมุมขวาล่างติดตามข้ามหน้าจนกว่าจะปิด */
export function enqueueReportPdf(
  input: DownloadReportPdfInput & { label?: string },
) {
  const store = getStore()
  const id = newJobId()
  const label = input.label || input.fileName.replace(/\.pdf$/i, '')
  const job: PdfExportJob = {
    id,
    fileName: input.fileName,
    label,
    status: 'pending',
    createdAt: Date.now(),
  }
  store.dockDismissed = false
  store.jobs = [job, ...store.jobs]
  startPdfExportDockDom()
  emit()

  void (async () => {
    try {
      const blob = await fetchReportPdfBlob(input)
      const live = getStore()
      if (!live.jobs.some(item => item.id === id)) return
      const blobUrl = URL.createObjectURL(blob)
      live.blobs.set(id, blob)
      live.jobs = live.jobs.map(item => (
        item.id === id
          ? { ...item, status: 'ready' as const, blobUrl, error: undefined }
          : item
      ))
      emit()
    } catch (error) {
      const live = getStore()
      if (!live.jobs.some(item => item.id === id)) return
      const message = error instanceof Error ? error.message : 'สร้าง PDF ไม่สำเร็จ'
      live.jobs = live.jobs.map(item => (
        item.id === id
          ? { ...item, status: 'error' as const, error: message }
          : item
      ))
      emit()
    }
  })()

  return id
}
