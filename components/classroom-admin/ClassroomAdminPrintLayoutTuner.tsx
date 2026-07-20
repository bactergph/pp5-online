'use client'

import '@/components/reports/Pp5PrintLayoutTuner.css'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  CategoryPicker,
  FieldSlider,
  TunerShell,
  groupFields,
} from '@/components/reports/Pp5PrintLayoutTuner'
import {
  CLASSROOM_ADMIN_MONTHLY_FIELD_KEYS,
  CLASSROOM_ADMIN_MONTHLY_FIELD_LABELS,
  CLASSROOM_ADMIN_PRINT_SECTIONS,
  CLASSROOM_ADMIN_SECTION_LABELS,
  CLASSROOM_ADMIN_STANDARD_FIELD_KEYS,
  CLASSROOM_ADMIN_STANDARD_FIELD_LABELS,
  DEFAULT_CLASSROOM_ADMIN_PRINT_LAYOUTS,
  classroomAdminSectionLayoutCssSnippet,
  loadClassroomAdminPrintLayouts,
  type ClassroomAdminMonthlyLayout,
  type ClassroomAdminPrintLayouts,
  type ClassroomAdminPrintSection,
  type ClassroomAdminStandardLayout,
} from '@/lib/classroom-admin-print-layout'

const MONTHLY_FIELD_META: Record<keyof ClassroomAdminMonthlyLayout, { unit: string; min: number; max: number; step: number; group: string }> = {
  padTopPx: { unit: 'px', min: 4, max: 40, step: 1, group: 'ระยะขอบ' },
  padSidePx: { unit: 'px', min: 4, max: 40, step: 1, group: 'ระยะขอบ' },
  padBottomPx: { unit: 'px', min: 4, max: 40, step: 1, group: 'ระยะขอบ' },
  headLineGapPx: { unit: 'px', min: 0, max: 16, step: 0.5, group: 'หัวกระดาษ' },
  fontH1Px: { unit: 'px', min: 12, max: 28, step: 1, group: 'ฟอนต์' },
  fontSchoolPx: { unit: 'px', min: 12, max: 28, step: 1, group: 'ฟอนต์' },
  fontMetaPx: { unit: 'px', min: 8, max: 18, step: 1, group: 'ฟอนต์' },
  fontTablePx: { unit: 'px', min: 6, max: 16, step: 1, group: 'ฟอนต์' },
  fontMonthTitlePx: { unit: 'px', min: 8, max: 18, step: 1, group: 'ฟอนต์' },
  fontSummaryTitlePx: { unit: 'px', min: 8, max: 18, step: 1, group: 'ฟอนต์' },
  fontNamePx: { unit: 'px', min: 8, max: 18, step: 1, group: 'ฟอนต์' },
  fontHolidayPx: { unit: 'px', min: 5, max: 14, step: 1, group: 'ฟอนต์' },
  letterSpacingPx: { unit: 'px', min: -1, max: 4, step: 0.1, group: 'ฟอนต์' },
  rowHeightPx: { unit: 'px', min: 0, max: 30, step: 1, group: 'ตาราง' },
  minBlankRows: { unit: 'rows', min: 0, max: 35, step: 1, group: 'ตาราง' },
  logoSizePx: { unit: 'px', min: 24, max: 80, step: 1, group: 'โลโก้' },
  numberColWidthPx: { unit: 'px', min: 28, max: 64, step: 1, group: 'ความกว้างคอลัมน์' },
  nameColWidthPx: { unit: 'px', min: 120, max: 260, step: 2, group: 'ความกว้างคอลัมน์' },
  summaryColWidthPx: { unit: 'px', min: 28, max: 64, step: 1, group: 'ความกว้างคอลัมน์' },
  signatureGapPx: { unit: 'px', min: 40, max: 200, step: 4, group: 'ลายเซ็น' },
  signatureMarginTopPx: { unit: 'px', min: 8, max: 64, step: 1, group: 'ลายเซ็น' },
  fontSignaturePx: { unit: 'px', min: 9, max: 18, step: 1, group: 'ลายเซ็น' },
  fontSignatureRolePx: { unit: 'px', min: 8, max: 16, step: 1, group: 'ลายเซ็น' },
}

const STANDARD_FIELD_META: Record<keyof ClassroomAdminStandardLayout, { unit: string; min: number; max: number; step: number; group: string }> = {
  padTopPx: { unit: 'px', min: 4, max: 40, step: 1, group: 'ระยะขอบ' },
  padSidePx: { unit: 'px', min: 4, max: 40, step: 1, group: 'ระยะขอบ' },
  padBottomPx: { unit: 'px', min: 4, max: 40, step: 1, group: 'ระยะขอบ' },
  headLineGapPx: { unit: 'px', min: 0, max: 16, step: 0.5, group: 'หัวกระดาษ' },
  fontH1Px: { unit: 'px', min: 12, max: 28, step: 1, group: 'ฟอนต์' },
  fontSchoolPx: { unit: 'px', min: 12, max: 28, step: 1, group: 'ฟอนต์' },
  fontMetaPx: { unit: 'px', min: 8, max: 18, step: 1, group: 'ฟอนต์' },
  fontStandardTablePx: { unit: 'px', min: 8, max: 18, step: 1, group: 'ฟอนต์' },
  fontStandardNamePx: { unit: 'px', min: 9, max: 20, step: 1, group: 'ฟอนต์' },
  letterSpacingPx: { unit: 'px', min: -1, max: 4, step: 0.1, group: 'ฟอนต์' },
  standardRowHeightPx: { unit: 'px', min: 0, max: 36, step: 1, group: 'ตาราง' },
  logoSizePx: { unit: 'px', min: 24, max: 80, step: 1, group: 'โลโก้' },
  signatureGapPx: { unit: 'px', min: 40, max: 200, step: 4, group: 'ลายเซ็น' },
  signatureMarginTopPx: { unit: 'px', min: 8, max: 64, step: 1, group: 'ลายเซ็น' },
  fontSignaturePx: { unit: 'px', min: 9, max: 18, step: 1, group: 'ลายเซ็น' },
  fontSignatureRolePx: { unit: 'px', min: 8, max: 16, step: 1, group: 'ลายเซ็น' },
}

const TUNER_CATEGORY_META: Record<string, { icon: string; description: string }> = {
  'ระยะขอบ': { icon: '⊡', description: 'ระยะห่างรอบหน้ากระดาษ' },
  'ฟอนต์': { icon: 'Aa', description: 'ขนาดตัวอักษรและหัวข้อ' },
  'โลโก้': { icon: '◇', description: 'ขนาดโลโก้โรงเรียน' },
  'ตาราง': { icon: '▤', description: 'ความสูงแถวและจำนวนแถว' },
  'ความกว้างคอลัมน์': { icon: '↔', description: 'เลขที่ ชื่อ สรุปผล' },
  'ลายเซ็น': { icon: '✎', description: 'ระยะห่างและฟอนต์ลายเซ็น' },
}

type Props = {
  open: boolean
  onClose: () => void
  activeSection: ClassroomAdminPrintSection
  onActiveSectionChange: (section: ClassroomAdminPrintSection) => void
  layouts: ClassroomAdminPrintLayouts
  onChange: (layouts: ClassroomAdminPrintLayouts) => void
  onSave: () => void
  saved: boolean
  /** พรีวิวเอกสารจริง — อัปเดตตามค่า layout ทันที */
  preview?: React.ReactNode
  previewHint?: string
}

export function useClassroomAdminPrintLayoutsState() {
  const [layouts, setLayouts] = useState<ClassroomAdminPrintLayouts>(DEFAULT_CLASSROOM_ADMIN_PRINT_LAYOUTS)

  useEffect(() => {
    setLayouts(loadClassroomAdminPrintLayouts())
  }, [])

  return { layouts, setLayouts }
}

export default function ClassroomAdminPrintLayoutTuner({
  open,
  onClose,
  activeSection,
  onActiveSectionChange,
  layouts,
  onChange,
  onSave,
  saved,
  preview,
  previewHint,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [previewScale, setPreviewScale] = useState(42)
  const isMonthly = activeSection === 'monthly'
  const layout = layouts[activeSection]

  const setMonthlyField = useCallback(<K extends keyof ClassroomAdminMonthlyLayout>(key: K, value: ClassroomAdminMonthlyLayout[K]) => {
    if (activeSection !== 'monthly') return
    onChange({
      ...layouts,
      monthly: { ...layouts.monthly, [key]: value },
    })
  }, [activeSection, layouts, onChange])

  const setStandardField = useCallback(<K extends keyof ClassroomAdminStandardLayout>(key: K, value: ClassroomAdminStandardLayout[K]) => {
    if (activeSection !== 'standard') return
    onChange({
      ...layouts,
      standard: { ...layouts.standard, [key]: value },
    })
  }, [activeSection, layouts, onChange])

  const resetSection = useCallback(() => {
    onChange({
      ...layouts,
      [activeSection]: { ...DEFAULT_CLASSROOM_ADMIN_PRINT_LAYOUTS[activeSection] },
    })
  }, [activeSection, layouts, onChange])

  const copyCss = useCallback(async () => {
    await navigator.clipboard.writeText(classroomAdminSectionLayoutCssSnippet(activeSection, layout))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [activeSection, layout])

  const fieldGroups = isMonthly
    ? groupFields(CLASSROOM_ADMIN_MONTHLY_FIELD_KEYS, MONTHLY_FIELD_META)
    : groupFields(CLASSROOM_ADMIN_STANDARD_FIELD_KEYS, STANDARD_FIELD_META)

  const categories = fieldGroups.map(group => group.title)
  const [activeCategory, setActiveCategory] = useState(categories[0] || '')

  useEffect(() => {
    setActiveCategory(categories[0] || '')
  }, [activeSection, categories.join('|')])

  const activeGroup = fieldGroups.find(group => group.title === activeCategory) || fieldGroups[0]

  if (!open) return null

  return (
    <>
      {preview != null && (
        <div className="ca-layout-live-preview" aria-label="พรีวิว layout">
          <div className="ca-layout-live-preview__toolbar">
            <div>
              <strong>พรีวิวสด</strong>
              <span>{previewHint || 'เลื่อนค่าทางขวาแล้วดูผลทันที · A4 แนวนอน'}</span>
            </div>
            <label className="ca-layout-live-preview__scale-label">
              ขนาด
              <select
                value={previewScale}
                onChange={e => setPreviewScale(Number(e.target.value))}
              >
                {[28, 34, 42, 50, 60, 75].map(value => (
                  <option key={value} value={value}>{value}%</option>
                ))}
              </select>
            </label>
          </div>
          <div className="ca-layout-live-preview__stage">
            <div
              className="ca-layout-live-preview__zoom"
              style={{ transform: `scale(${previewScale / 100})` }}
            >
              {preview}
            </div>
          </div>
        </div>
      )}

      <TunerShell
        badge="CA"
        title="ปรับ Layout"
        subtitle="เลือกส่วน → เลือกหมวด → ปรับค่า · ดูพรีวิวสดด้านซ้าย"
        open={open}
        onClose={onClose}
        onReset={resetSection}
        onCopy={copyCss}
        copied={copied}
        onSave={onSave}
        saved={saved}
      >
        <div className="lt-step-card">
          <label className="lt-step-label" htmlFor="ca-section-select">1. เลือกส่วนที่ต้องการปรับ</label>
          <select
            id="ca-section-select"
            className="lt-section-select"
            value={activeSection}
            onChange={event => onActiveSectionChange(event.target.value as ClassroomAdminPrintSection)}
          >
            {CLASSROOM_ADMIN_PRINT_SECTIONS.map(section => (
              <option key={section} value={section}>{CLASSROOM_ADMIN_SECTION_LABELS[section]}</option>
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
                  <span className="lt-panel-breadcrumb">{CLASSROOM_ADMIN_SECTION_LABELS[activeSection]}</span>
                  <strong className="lt-panel-title">{activeGroup.title}</strong>
                </div>
                <div className="lt-panel-body">
                  {activeGroup.keys.map(key => (
                    isMonthly ? (
                      <FieldSlider
                        key={key}
                        fieldKey={key as keyof ClassroomAdminMonthlyLayout}
                        label={CLASSROOM_ADMIN_MONTHLY_FIELD_LABELS[key as keyof ClassroomAdminMonthlyLayout]}
                        value={(layout as ClassroomAdminMonthlyLayout)[key as keyof ClassroomAdminMonthlyLayout]}
                        meta={MONTHLY_FIELD_META[key as keyof ClassroomAdminMonthlyLayout]}
                        onChange={setMonthlyField}
                      />
                    ) : (
                      <FieldSlider
                        key={key}
                        fieldKey={key as keyof ClassroomAdminStandardLayout}
                        label={CLASSROOM_ADMIN_STANDARD_FIELD_LABELS[key as keyof ClassroomAdminStandardLayout]}
                        value={(layout as ClassroomAdminStandardLayout)[key as keyof ClassroomAdminStandardLayout]}
                        meta={STANDARD_FIELD_META[key as keyof ClassroomAdminStandardLayout]}
                        onChange={setStandardField}
                      />
                    )
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </TunerShell>
    </>
  )
}

export { TUNER_CATEGORY_META }
