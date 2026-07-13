/** A4 แนวนอน — ใช้ร่วมกันระหว่าง preview, พิมพ์ และ Puppeteer PDF */
export const CLASSROOM_ADMIN_A4_LANDSCAPE_MM = {
  width: 297,
  height: 210,
} as const

export const CLASSROOM_ADMIN_A4_LANDSCAPE_CSS = {
  width: `${CLASSROOM_ADMIN_A4_LANDSCAPE_MM.width}mm`,
  height: `${CLASSROOM_ADMIN_A4_LANDSCAPE_MM.height}mm`,
  minHeight: `${CLASSROOM_ADMIN_A4_LANDSCAPE_MM.height}mm`,
} as const

/** 96dpi — ตรงกับ viewport ใน generate-report-pdf.ts */
export const CLASSROOM_ADMIN_A4_LANDSCAPE_PX_96DPI = {
  width: Math.round((CLASSROOM_ADMIN_A4_LANDSCAPE_MM.width / 25.4) * 96),
  height: Math.round((CLASSROOM_ADMIN_A4_LANDSCAPE_MM.height / 25.4) * 96),
} as const
