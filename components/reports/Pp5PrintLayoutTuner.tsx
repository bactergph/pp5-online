'use client'

import './Pp5PrintLayoutTuner.css'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  DEFAULT_PP5_PRINT_LAYOUTS,
  isPp5CoverSection,
  loadPp5PrintLayouts,
  mmToPx96,
  PP5_COVER_FIELD_KEYS,
  PP5_COVER_FIELD_LABELS,
  PP5_SECTION_FIELD_KEYS,
  PP5_SECTION_FIELD_LABELS,
  pp5SectionLayoutCssSnippet,
  type Pp5CoverLayout,
  type Pp5PrintLayouts,
  type Pp5PrintSection,
  type Pp5SectionLayout,
} from '@/lib/pp5-print-layout'
import {
  DEFAULT_PP6_PRINT_LAYOUTS,
  loadPp6PrintLayouts,
  PP6_SECTION_FIELD_KEYS,
  PP6_SECTION_FIELD_LABELS,
  pp6SectionLayoutCssSnippet,
  type Pp6PrintLayouts,
  type Pp6SectionLayout,
} from '@/lib/pp6-print-layout'

const PANEL_POS_KEY = 'pp-print-tuner-pos-v1'

type PanelPos = { x: number; y: number }

const COVER_FIELD_META: Record<keyof Pp5CoverLayout, { unit: 'mm' | 'px'; min: number; max: number; step: number; group: string }> = {
  padTopMm: { unit: 'mm', min: 3, max: 40, step: 0.5, group: 'ระยะขอบ' },
  padSideMm: { unit: 'mm', min: 3, max: 30, step: 0.5, group: 'ระยะขอบ' },
  padBottomMm: { unit: 'mm', min: 3, max: 30, step: 0.5, group: 'ระยะขอบ' },
  fontBasePx: { unit: 'px', min: 12, max: 28, step: 1, group: 'ฟอนต์' },
  fontH1Px: { unit: 'px', min: 18, max: 40, step: 1, group: 'ฟอนต์' },
  fontInfoPx: { unit: 'px', min: 12, max: 24, step: 1, group: 'ฟอนต์' },
  fontTablePx: { unit: 'px', min: 10, max: 24, step: 1, group: 'ฟอนต์' },
  fontTableSmallPx: { unit: 'px', min: 9, max: 20, step: 1, group: 'ฟอนต์' },
  fontSignaturePx: { unit: 'px', min: 10, max: 22, step: 1, group: 'ฟอนต์' },
  logoSizePx: { unit: 'px', min: 48, max: 120, step: 1, group: 'โลโก้ & ปพ.' },
  docMarkTopPx: { unit: 'px', min: 8, max: 80, step: 1, group: 'โลโก้ & ปพ.' },
  docMarkRightPx: { unit: 'px', min: 8, max: 80, step: 1, group: 'โลโก้ & ปพ.' },
  docMarkFontPx: { unit: 'px', min: 14, max: 32, step: 1, group: 'โลโก้ & ปพ.' },
  headerGapPx: { unit: 'px', min: 0, max: 40, step: 1, group: 'ตาราง & ระยะ' },
  tableTopMm: { unit: 'mm', min: 0, max: 15, step: 0.5, group: 'ตาราง & ระยะ' },
  tableRowHeightPx: { unit: 'px', min: 0, max: 24, step: 1, group: 'ตาราง & ระยะ' },
  summaryGapPx: { unit: 'px', min: 0, max: 20, step: 1, group: 'ตาราง & ระยะ' },
  approvalGapPx: { unit: 'px', min: 0, max: 24, step: 1, group: 'ตาราง & ระยะ' },
}

const BODY_FIELD_META: Record<keyof Pp5SectionLayout, { unit: 'mm' | 'px' | 'rows'; min: number; max: number; step: number; group: string }> = {
  padTopMm: { unit: 'mm', min: 5, max: 40, step: 0.5, group: 'ระยะขอบ' },
  padSideMm: { unit: 'mm', min: 3, max: 25, step: 0.5, group: 'ระยะขอบ' },
  padBottomMm: { unit: 'mm', min: 4, max: 25, step: 0.5, group: 'ระยะขอบ' },
  fontH1Px: { unit: 'px', min: 12, max: 28, step: 1, group: 'ฟอนต์' },
  fontSubPx: { unit: 'px', min: 10, max: 22, step: 1, group: 'ฟอนต์' },
  fontTablePx: { unit: 'px', min: 10, max: 22, step: 1, group: 'ฟอนต์' },
  fontScorePx: { unit: 'px', min: 8, max: 22, step: 1, group: 'ฟอนต์' },
  fontGradePx: { unit: 'px', min: 8, max: 22, step: 1, group: 'ฟอนต์' },
  fontNamePx: { unit: 'px', min: 10, max: 22, step: 1, group: 'ฟอนต์' },
  fontNumberPx: { unit: 'px', min: 10, max: 20, step: 1, group: 'ฟอนต์' },
  criteriaFontPx: { unit: 'px', min: 12, max: 20, step: 1, group: 'ฟอนต์' },
  logoSizePx: { unit: 'px', min: 16, max: 80, step: 1, group: 'โลโก้' },
  logoGapPx: { unit: 'px', min: 0, max: 32, step: 1, group: 'โลโก้' },
  logoOffsetXPx: { unit: 'px', min: -80, max: 200, step: 1, group: 'โลโก้' },
  logoOffsetYPx: { unit: 'px', min: -40, max: 80, step: 1, group: 'โลโก้' },
  rowHeightPx: { unit: 'px', min: 0, max: 36, step: 1, group: 'ตาราง' },
  minStudentRows: { unit: 'rows', min: 0, max: 50, step: 1, group: 'ตาราง' },
}

const PP6_FIELD_META: Record<keyof Pp6SectionLayout, { unit: 'mm' | 'px' | 'rows' | 'pct'; min: number; max: number; step: number; group: string }> = {
  padTopMm: { unit: 'mm', min: 4, max: 30, step: 0.5, group: 'ระยะขอบ' },
  padSideMm: { unit: 'mm', min: 6, max: 25, step: 0.5, group: 'ระยะขอบ' },
  padBottomMm: { unit: 'mm', min: 4, max: 25, step: 0.5, group: 'ระยะขอบ' },
  fontBasePx: { unit: 'px', min: 12, max: 24, step: 1, group: 'ฟอนต์' },
  fontH1Px: { unit: 'px', min: 16, max: 32, step: 1, group: 'ฟอนต์' },
  fontSubPx: { unit: 'px', min: 12, max: 24, step: 1, group: 'ฟอนต์' },
  fontStudentLinePx: { unit: 'px', min: 12, max: 24, step: 1, group: 'ฟอนต์' },
  fontTablePx: { unit: 'px', min: 10, max: 20, step: 1, group: 'ฟอนต์' },
  fontNamePx: { unit: 'px', min: 10, max: 20, step: 1, group: 'ฟอนต์' },
  fontNotePx: { unit: 'px', min: 10, max: 18, step: 1, group: 'ฟอนต์' },
  rowHeightPx: { unit: 'px', min: 0, max: 32, step: 1, group: 'ตาราง' },
  theadHeightMm: { unit: 'mm', min: 0, max: 14, step: 0.2, group: 'ตาราง' },
  minSubjectRows: { unit: 'rows', min: 0, max: 20, step: 1, group: 'ตาราง' },
  tableWidthPct: { unit: 'pct', min: 70, max: 100, step: 1, group: 'ตาราง' },
  logoSizeMm: { unit: 'mm', min: 10, max: 30, step: 1, group: 'โลโก้ & ปพ.' },
  logoLeftMm: { unit: 'mm', min: 8, max: 40, step: 1, group: 'โลโก้ & ปพ.' },
  docMarkTopMm: { unit: 'mm', min: 5, max: 35, step: 1, group: 'โลโก้ & ปพ.' },
  docMarkRightMm: { unit: 'mm', min: 8, max: 40, step: 1, group: 'โลโก้ & ปพ.' },
  docMarkFontPx: { unit: 'px', min: 14, max: 28, step: 1, group: 'โลโก้ & ปพ.' },
  headTopMm: { unit: 'mm', min: 0, max: 20, step: 0.5, group: 'ระยะส่วน' },
  sectionGapMm: { unit: 'mm', min: 0, max: 8, step: 0.2, group: 'ระยะส่วน' },
  cellTextNudgeMm: { unit: 'mm', min: -3, max: 3, step: 0.05, group: 'jsPDF' },
  rankGapTopMm: { unit: 'mm', min: 0, max: 10, step: 0.2, group: 'jsPDF' },
  rankGapBottomMm: { unit: 'mm', min: 0, max: 10, step: 0.2, group: 'jsPDF' },
  noteGapTopMm: { unit: 'mm', min: 0, max: 10, step: 0.2, group: 'jsPDF' },
  noteGapBottomMm: { unit: 'mm', min: 0, max: 10, step: 0.2, group: 'jsPDF' },
}

function loadPanelPos(): PanelPos | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PANEL_POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PanelPos
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
  } catch { /* ignore */ }
  return null
}

function savePanelPos(pos: PanelPos) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PANEL_POS_KEY, JSON.stringify(pos))
}

function defaultPanelPos(panelW: number, panelH: number): PanelPos {
  if (typeof window === 'undefined') return { x: 24, y: 24 }
  const margin = 16
  return {
    x: Math.max(margin, window.innerWidth - panelW - margin),
    y: Math.max(margin, window.innerHeight - panelH - margin),
  }
}

function clampPanelPos(x: number, y: number, panelW: number, panelH: number): PanelPos {
  const margin = 8
  const maxX = Math.max(margin, window.innerWidth - panelW - margin)
  const maxY = Math.max(margin, window.innerHeight - panelH - margin)
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  }
}

export function useDraggablePanel(open: boolean) {
  const panelRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [pos, setPos] = useState<PanelPos | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    const saved = loadPanelPos()
    const panel = panelRef.current
    const w = panel?.offsetWidth || 400
    const h = panel?.offsetHeight || 560
    setPos(saved || defaultPanelPos(w, h))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onResize = () => {
      setPos(prev => {
        if (!prev) return prev
        const panel = panelRef.current
        const w = panel?.offsetWidth || 400
        const h = panel?.offsetHeight || 560
        return clampPanelPos(prev.x, prev.y, w, h)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  const onDragStart = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const current = pos || defaultPanelPos(400, 560)
    dragRef.current = { startX: event.clientX, startY: event.clientY, originX: current.x, originY: current.y }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }, [pos])

  const onDragMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return
    const panel = panelRef.current
    const w = panel?.offsetWidth || 400
    const h = panel?.offsetHeight || 560
    const dx = event.clientX - dragRef.current.startX
    const dy = event.clientY - dragRef.current.startY
    setPos(clampPanelPos(dragRef.current.originX + dx, dragRef.current.originY + dy, w, h))
  }, [])

  const onDragEnd = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setPos(prev => {
      if (prev) savePanelPos(prev)
      return prev
    })
  }, [])

  const recenter = useCallback(() => {
    const panel = panelRef.current
    const w = panel?.offsetWidth || 440
    const h = panel?.offsetHeight || 560
    const next = {
      x: Math.max(8, (window.innerWidth - w) / 2),
      y: Math.max(8, (window.innerHeight - h) / 2),
    }
    setPos(next)
    savePanelPos(next)
  }, [])

  return { panelRef, pos, dragging, onDragStart, onDragMove, onDragEnd, recenter }
}

type Pp5Props = {
  variant?: 'pp5'
  open: boolean
  onClose: () => void
  availableSections: Pp5PrintSection[]
  sectionLabels: Record<Pp5PrintSection, string>
  activeSection: Pp5PrintSection
  onActiveSectionChange: (section: Pp5PrintSection) => void
  layouts: Pp5PrintLayouts
  onChange: (layouts: Pp5PrintLayouts) => void
  onSave: () => void
  saved: boolean
}

type Pp6Props = {
  variant: 'pp6'
  open: boolean
  onClose: () => void
  layouts: Pp6PrintLayouts
  onChange: (layouts: Pp6PrintLayouts) => void
  onSave: () => void
  saved: boolean
}

type Props = Pp5Props | Pp6Props

const TUNER_CATEGORY_META: Record<string, { icon: string; description: string }> = {
  'ระยะขอบ': { icon: '⊡', description: 'ระยะห่างรอบหน้ากระดาษ' },
  'หัวกระดาษ': { icon: '≡', description: 'ระยะบรรทัดหัวกระดาษ' },
  'ฟอนต์': { icon: 'Aa', description: 'ขนาดตัวอักษรและหัวข้อ' },
  'โลโก้': { icon: '◇', description: 'ตำแหน่งและขนาดโลโก้' },
  'ตาราง': { icon: '▤', description: 'ความสูงแถวและจำนวนแถว' },
  'โลโก้ & ปพ.': { icon: '◇', description: 'โลโก้และเลข ปพ.5' },
  'ตาราง & ระยะ': { icon: '▤', description: 'ระยะห่างและตารางหน้าปก' },
  'ระยะส่วน': { icon: '↕', description: 'ระยะห่างระหว่างส่วน' },
}

export function groupFields<K extends string>(
  keys: readonly K[],
  meta: Record<K, { group: string }>,
): Array<{ title: string; keys: K[] }> {
  const order: string[] = []
  const map = new Map<string, K[]>()
  for (const key of keys) {
    const title = meta[key].group
    if (!map.has(title)) {
      map.set(title, [])
      order.push(title)
    }
    map.get(title)!.push(key)
  }
  return order.map(title => ({ title, keys: map.get(title)! }))
}

function LogoPositionPad({
  offsetX,
  offsetY,
  sizePx,
  onOffsetChange,
}: {
  offsetX: number
  offsetY: number
  sizePx: number
  onOffsetChange: (x: number, y: number) => void
}) {
  const step = 2
  const markSize = Math.max(12, Math.min(32, sizePx * 0.42))
  const previewX = 50 + offsetX * 0.22
  const previewY = 50 + offsetY * 0.35

  return (
    <div className="lt-logo-pad">
      <div className="lt-logo-pad-preview" aria-hidden="true">
        <div className="lt-logo-pad-frame">
          <span
            className="lt-logo-pad-mark"
            style={{
              width: markSize,
              height: markSize,
              left: `calc(${previewX}% - ${markSize / 2}px)`,
              top: `calc(${previewY}% - ${markSize / 2}px)`,
            }}
          />
          <span className="lt-logo-pad-line lt-logo-pad-line-h" />
          <span className="lt-logo-pad-line lt-logo-pad-line-v" />
        </div>
        <p className="lt-logo-pad-caption">
          X {offsetX}px · Y {offsetY}px
        </p>
      </div>
      <div className="lt-logo-pad-dpad" role="group" aria-label="เลื่อนโลโก้">
        <button type="button" className="lt-logo-pad-btn lt-is-up" onClick={() => onOffsetChange(offsetX, offsetY - step)} aria-label="เลื่อนขึ้น">↑</button>
        <button type="button" className="lt-logo-pad-btn lt-is-left" onClick={() => onOffsetChange(offsetX - step, offsetY)} aria-label="เลื่อนซ้าย">←</button>
        <button type="button" className="lt-logo-pad-btn lt-is-center" onClick={() => onOffsetChange(0, 0)} aria-label="รีเซ็ตตำแหน่ง">◎</button>
        <button type="button" className="lt-logo-pad-btn lt-is-right" onClick={() => onOffsetChange(offsetX + step, offsetY)} aria-label="เลื่อนขวา">→</button>
        <button type="button" className="lt-logo-pad-btn lt-is-down" onClick={() => onOffsetChange(offsetX, offsetY + step)} aria-label="เลื่อนลง">↓</button>
      </div>
    </div>
  )
}

export function CategoryPicker({
  categories,
  active,
  onChange,
}: {
  categories: string[]
  active: string
  onChange: (category: string) => void
}) {
  return (
    <nav className="lt-category-nav" aria-label="เลือกหมวดที่ต้องการปรับ">
      {categories.map(category => {
        const meta = TUNER_CATEGORY_META[category] || { icon: '•', description: category }
        const isActive = active === category
        return (
          <button
            key={category}
            type="button"
            aria-current={isActive ? 'true' : undefined}
            className={`lt-category-item${isActive ? ' is-active' : ''}`}
            onClick={() => onChange(category)}
          >
            <span className="lt-category-icon">{meta.icon}</span>
            <span className="lt-category-text">
              <span className="lt-category-label">{category}</span>
              <span className="lt-category-desc">{meta.description}</span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}

export function FieldSlider<K extends string>({
  fieldKey,
  label,
  value,
  meta,
  onChange,
}: {
  fieldKey: K
  label: string
  value: number
  meta: { unit: string; min: number; max: number; step: number }
  onChange: (key: K, value: number) => void
}) {
  // Local draft lets users type freely (empty, partial, decimals, or values
  // outside the slider range) without the controlled input fighting back.
  const [draft, setDraft] = useState<string | null>(null)
  const pct = Math.max(0, Math.min(100, ((value - meta.min) / (meta.max - meta.min)) * 100))
  const pxHint = meta.unit === 'mm' ? `${mmToPx96(value)} px` : null
  const axisHint =
    fieldKey === 'logoOffsetXPx'
      ? (value < 0 ? `เลื่อนซ้าย ${Math.abs(value)} px` : value > 0 ? `เลื่อนขวา ${value} px` : 'ตำแหน่งกลางแนวนอน')
      : fieldKey === 'logoOffsetYPx'
        ? (value < 0 ? `เลื่อนขึ้น ${Math.abs(value)} px` : value > 0 ? `เลื่อนลง ${value} px` : 'ตำแหน่งกลางแนวตั้ง')
        : null

  const commitInput = (raw: string) => {
    setDraft(raw)
    if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') return
    const num = Number(raw)
    if (Number.isNaN(num)) return
    onChange(fieldKey, num)
  }

  const inputValue = draft !== null ? draft : String(value)

  return (
    <div className="layout-tuner-field">
      <div className="layout-tuner-field-top">
        <span className="layout-tuner-field-label">{label}</span>
        <span className="layout-tuner-field-value">
          <input
            type="number"
            step={meta.step}
            value={inputValue}
            onChange={event => commitInput(event.target.value)}
            onBlur={() => setDraft(null)}
            className="layout-tuner-num"
          />
          <span className="layout-tuner-unit">{meta.unit}</span>
        </span>
      </div>
      <div className="layout-tuner-range-wrap">
        <div className="layout-tuner-range-fill" style={{ width: `${pct}%` }} />
        <input
          type="range"
          className="layout-tuner-range"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={Math.max(meta.min, Math.min(meta.max, value))}
          onChange={event => {
            setDraft(null)
            onChange(fieldKey, Number(event.target.value))
          }}
        />
      </div>
      {pxHint && <span className="layout-tuner-hint">≈ {pxHint}</span>}
      {axisHint && <span className="layout-tuner-hint">{axisHint}</span>}
    </div>
  )
}

export function TunerShell({
  title,
  badge,
  subtitle,
  open,
  onClose,
  children,
  onReset,
  onCopy,
  copied,
  onSave,
  saved,
}: {
  title: string
  badge: string
  subtitle: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
  onReset: () => void
  onCopy: () => void
  copied: boolean
  onSave: () => void
  saved: boolean
}) {
  const { panelRef, pos, dragging, onDragStart, onDragMove, onDragEnd, recenter } = useDraggablePanel(open)

  if (!open) return null

  const style = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' as const }
    : undefined

  return (
    <aside
      ref={panelRef}
      className={`layout-tuner${dragging ? ' is-dragging' : ''}`}
      style={style}
      aria-label={title}
    >
      <header
        className="layout-tuner-header"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <div className="layout-tuner-grip" aria-hidden="true">
          <span /><span /><span /><span /><span /><span />
        </div>
        <div className="layout-tuner-header-text">
          <div className="layout-tuner-title-row">
            <span className="layout-tuner-badge">{badge}</span>
            <strong>{title}</strong>
          </div>
          <span>{subtitle}</span>
        </div>
        <div
          className="layout-tuner-header-actions"
          onPointerDown={event => event.stopPropagation()}
        >
          <button type="button" className="layout-tuner-icon-btn" onClick={recenter} title="จัดกลาง">◎</button>
          <button type="button" className="layout-tuner-icon-btn" onClick={onClose} aria-label="ปิด">×</button>
        </div>
      </header>

      <div className="layout-tuner-body">{children}</div>

      <footer className="layout-tuner-footer">
        <button type="button" className="layout-tuner-btn is-ghost" onClick={onReset}>รีเซ็ตส่วนนี้</button>
        <button type="button" className="layout-tuner-btn is-secondary" onClick={onCopy}>
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก CSS'}
        </button>
        <button
          type="button"
          className={`layout-tuner-btn is-save${saved ? ' is-saved' : ''}`}
          onClick={onSave}
        >
          {saved ? 'บันทึกแล้ว' : 'บันทึก layout'}
        </button>
      </footer>
    </aside>
  )
}

export default function Pp5PrintLayoutTuner(props: Props) {
  const [copied, setCopied] = useState(false)

  if (props.variant === 'pp6') {
    return <Pp6Tuner {...props} copied={copied} setCopied={setCopied} />
  }

  return <Pp5Tuner {...props} copied={copied} setCopied={setCopied} />
}

function Pp5Tuner({
  open,
  onClose,
  availableSections,
  sectionLabels,
  activeSection,
  onActiveSectionChange,
  layouts,
  onChange,
  onSave,
  saved,
  copied,
  setCopied,
}: Pp5Props & { copied: boolean; setCopied: (v: boolean) => void }) {
  const layout = layouts[activeSection]
  const isCover = isPp5CoverSection(activeSection)

  const setCoverField = useCallback(<K extends keyof Pp5CoverLayout>(key: K, value: Pp5CoverLayout[K]) => {
    if (!isPp5CoverSection(activeSection)) return
    onChange({
      ...layouts,
      [activeSection]: { ...layouts[activeSection], [key]: value },
    })
  }, [activeSection, layouts, onChange])

  const setBodyField = useCallback(<K extends keyof Pp5SectionLayout>(key: K, value: Pp5SectionLayout[K]) => {
    if (isPp5CoverSection(activeSection)) return
    onChange({
      ...layouts,
      [activeSection]: { ...layouts[activeSection], [key]: value },
    })
  }, [activeSection, layouts, onChange])

  const resetSection = useCallback(() => {
    onChange({
      ...layouts,
      [activeSection]: { ...DEFAULT_PP5_PRINT_LAYOUTS[activeSection] },
    })
  }, [activeSection, layouts, onChange])

  const copyCss = useCallback(async () => {
    await navigator.clipboard.writeText(pp5SectionLayoutCssSnippet(activeSection, layout))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [activeSection, layout, setCopied])

  const fieldGroups = isCover
    ? groupFields(PP5_COVER_FIELD_KEYS, COVER_FIELD_META)
    : groupFields(PP5_SECTION_FIELD_KEYS[activeSection], BODY_FIELD_META)

  const categories = fieldGroups.map(group => group.title)
  const [activeCategory, setActiveCategory] = useState(categories[0] || '')

  useEffect(() => {
    setActiveCategory(categories[0] || '')
  }, [activeSection, categories.join('|')])

  const activeGroup = fieldGroups.find(group => group.title === activeCategory) || fieldGroups[0]
  const bodyLayout = layout as Pp5SectionLayout
  const showLogoPad = !isCover && activeSection === 'achievement' && activeCategory === 'โลโก้'

  return (
    <TunerShell
      badge="PP5"
      title="ปรับ Layout"
      subtitle="เลือกส่วน → เลือกหมวด → ปรับค่า"
      open={open}
      onClose={onClose}
      onReset={resetSection}
      onCopy={copyCss}
      copied={copied}
      onSave={onSave}
      saved={saved}
    >
      <div className="lt-step-card">
        <label className="lt-step-label" htmlFor="lt-section-select">1. เลือกส่วนที่ต้องการปรับ</label>
        <select
          id="lt-section-select"
          className="lt-section-select"
          value={activeSection}
          onChange={event => onActiveSectionChange(event.target.value as Pp5PrintSection)}
        >
          {availableSections.map(section => (
            <option key={section} value={section}>{sectionLabels[section]}</option>
          ))}
        </select>
      </div>

      {activeGroup && (
        <div className="lt-step-card">
          <span className="lt-step-label">2. เลือกหมวด · 3. ปรับค่า</span>
          <div className="lt-workspace">
            <CategoryPicker
              categories={categories}
              active={activeCategory}
              onChange={setActiveCategory}
            />
            <div className="lt-panel">
              <div className="lt-panel-head">
                <span className="lt-panel-breadcrumb">{sectionLabels[activeSection]}</span>
                <strong className="lt-panel-title">{activeGroup.title}</strong>
              </div>
              <div className="lt-panel-body">
                {showLogoPad && (
                  <LogoPositionPad
                    offsetX={bodyLayout.logoOffsetXPx}
                    offsetY={bodyLayout.logoOffsetYPx}
                    sizePx={bodyLayout.logoSizePx}
                    onOffsetChange={(x, y) => {
                      onChange({
                        ...layouts,
                        [activeSection]: { ...(layouts[activeSection] as Pp5SectionLayout), logoOffsetXPx: x, logoOffsetYPx: y },
                      })
                    }}
                  />
                )}
                {activeGroup.keys.map(key => (
                  isCover ? (
                    <FieldSlider
                      key={key}
                      fieldKey={key}
                      label={PP5_COVER_FIELD_LABELS[key as keyof Pp5CoverLayout]}
                      value={(layout as Pp5CoverLayout)[key as keyof Pp5CoverLayout]}
                      meta={COVER_FIELD_META[key as keyof Pp5CoverLayout]}
                      onChange={setCoverField}
                    />
                  ) : (
                    <FieldSlider
                      key={key}
                      fieldKey={key}
                      label={PP5_SECTION_FIELD_LABELS[key as keyof Pp5SectionLayout]}
                      value={bodyLayout[key] as number}
                      meta={BODY_FIELD_META[key as keyof Pp5SectionLayout]}
                      onChange={setBodyField}
                    />
                  )
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </TunerShell>
  )
}

function Pp6Tuner({
  open,
  onClose,
  layouts,
  onChange,
  onSave,
  saved,
  copied,
  setCopied,
}: Pp6Props & { copied: boolean; setCopied: (v: boolean) => void }) {
  const layout = layouts.page

  const setField = useCallback(<K extends keyof Pp6SectionLayout>(key: K, value: Pp6SectionLayout[K]) => {
    onChange({
      ...layouts,
      page: { ...layouts.page, [key]: value },
    })
  }, [layouts, onChange])

  const resetSection = useCallback(() => {
    onChange({
      ...layouts,
      page: { ...DEFAULT_PP6_PRINT_LAYOUTS.page },
    })
  }, [layouts, onChange])

  const copyCss = useCallback(async () => {
    await navigator.clipboard.writeText(pp6SectionLayoutCssSnippet(layout))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [layout, setCopied])


  const fieldGroups = groupFields(PP6_SECTION_FIELD_KEYS, PP6_FIELD_META)
  const categories = fieldGroups.map(group => group.title)
  const [activeCategory, setActiveCategory] = useState(categories[0] || '')
  const activeGroup = fieldGroups.find(group => group.title === activeCategory) || fieldGroups[0]

  return (
    <TunerShell
      badge="PP6"
      title="ปรับ Layout"
      subtitle="เลือกหมวด → ปรับค่า · ดูพรีวิวทันที"
      open={open}
      onClose={onClose}
      onReset={resetSection}
      onCopy={copyCss}
      copied={copied}
      onSave={onSave}
      saved={saved}
    >
      <div className="lt-step-card">
        <span className="lt-step-label">เลือกหมวด · ปรับค่า</span>
        <div className="lt-workspace">
          <CategoryPicker
            categories={categories}
            active={activeCategory}
            onChange={setActiveCategory}
          />
          {activeGroup && (
            <div className="lt-panel">
              <div className="lt-panel-head">
                <strong className="lt-panel-title">{activeGroup.title}</strong>
              </div>
              <div className="lt-panel-body">
                {activeGroup.keys.map(key => (
                  <FieldSlider
                    key={key}
                    fieldKey={key}
                    label={PP6_SECTION_FIELD_LABELS[key]}
                    value={layout[key]}
                    meta={PP6_FIELD_META[key]}
                    onChange={setField}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </TunerShell>
  )
}

export function usePp5PrintLayoutsState() {
  const [layouts, setLayouts] = useState<Pp5PrintLayouts>(DEFAULT_PP5_PRINT_LAYOUTS)

  useEffect(() => {
    setLayouts(loadPp5PrintLayouts())
  }, [])

  return { layouts, setLayouts }
}

export function usePp6PrintLayoutsState() {
  const [layouts, setLayouts] = useState<Pp6PrintLayouts>(DEFAULT_PP6_PRINT_LAYOUTS)

  useEffect(() => {
    setLayouts(loadPp6PrintLayouts())
  }, [])

  return { layouts, setLayouts }
}
