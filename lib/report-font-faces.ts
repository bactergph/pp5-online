/** @font-face สำหรับ TH Sarabun New — ใช้ทั้ง CSS และ inject ตอนสร้าง PDF */
const FONT_FILES = [
  { file: 'regular.woff', weight: 400, style: 'normal' as const },
  { file: 'bold.woff', weight: 700, style: 'normal' as const },
  { file: 'italic.woff', weight: 400, style: 'italic' as const },
  { file: 'bold-italic.woff', weight: 700, style: 'italic' as const },
] as const

export function reportFontFaceCss(origin = '') {
  const base = `${origin}/fonts/th-sarabun-new`
  return FONT_FILES.map(({ file, weight, style }) => `
@font-face {
  font-family: 'TH Sarabun New';
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url('${base}/${file}') format('woff');
}`.trim()).join('\n')
}

export const REPORT_FONT_PRELOADS = FONT_FILES.map(({ file }) => ({
  href: `/fonts/th-sarabun-new/${file}`,
  type: 'font/woff',
}))
