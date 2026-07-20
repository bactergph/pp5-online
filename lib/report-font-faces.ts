/** @font-face สำหรับ TH Sarabun New — ใช้ทั้ง CSS และ inject ตอนสร้าง PDF */
const FONT_FILES = [
  { file: 'regular.woff', weight: 400, style: 'normal' as const },
  { file: 'regular.woff', weight: 500, style: 'normal' as const },
  { file: 'bold.woff', weight: 600, style: 'normal' as const },
  { file: 'bold.woff', weight: 700, style: 'normal' as const },
  { file: 'bold.woff', weight: 800, style: 'normal' as const },
  { file: 'bold.woff', weight: 900, style: 'normal' as const },
  { file: 'italic.woff', weight: 400, style: 'italic' as const },
  { file: 'bold-italic.woff', weight: 700, style: 'italic' as const },
  { file: 'bold-italic.woff', weight: 800, style: 'italic' as const },
  { file: 'bold-italic.woff', weight: 900, style: 'italic' as const },
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

export const REPORT_FONT_PRELOADS = [
  { href: '/fonts/th-sarabun-new/regular.woff', type: 'font/woff' },
  { href: '/fonts/th-sarabun-new/bold.woff', type: 'font/woff' },
  { href: '/fonts/th-sarabun-new/italic.woff', type: 'font/woff' },
  { href: '/fonts/th-sarabun-new/bold-italic.woff', type: 'font/woff' },
]

export async function waitForReportFonts() {
  try {
    if ('fonts' in document) await document.fonts.ready
    for (let i = 0; i < 100; i++) {
      if (
        document.fonts.check('16px "TH Sarabun New"')
        || document.fonts.check('700 16px "TH Sarabun New"')
        || document.fonts.check('900 16px "TH Sarabun New"')
      ) return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  } catch {
    // ignore
  }
}
