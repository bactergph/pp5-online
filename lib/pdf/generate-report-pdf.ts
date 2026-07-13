import { appOrigin } from '@/lib/app-origin'
import { CLASSROOM_ADMIN_A4_LANDSCAPE_PX_96DPI } from '@/lib/classroom-admin-a4-landscape'
import { reportFontFaceCss } from '@/lib/report-font-faces'
import type { Browser } from 'puppeteer-core'

export { appOrigin }

const isProd = process.env.NODE_ENV === 'production'

/** A4 @ 96dpi — ให้ layout ตรงกับ 210×297mm */
const A4_VIEWPORT = {
  width: CLASSROOM_ADMIN_A4_LANDSCAPE_PX_96DPI.height,
  height: CLASSROOM_ADMIN_A4_LANDSCAPE_PX_96DPI.width,
  deviceScaleFactor: 1 as const,
}
const A4_LANDSCAPE_VIEWPORT = {
  width: CLASSROOM_ADMIN_A4_LANDSCAPE_PX_96DPI.width,
  height: CLASSROOM_ADMIN_A4_LANDSCAPE_PX_96DPI.height,
  deviceScaleFactor: 1 as const,
}

async function waitForReportFonts(page: import('puppeteer-core').Page, origin: string) {
  await page.evaluate(async (baseOrigin) => {
    const specs = [
      { file: 'regular.woff', weight: '400', style: 'normal' },
      { file: 'bold.woff', weight: '700', style: 'normal' },
      { file: 'italic.woff', weight: '400', style: 'italic' },
      { file: 'bold-italic.woff', weight: '700', style: 'italic' },
    ] as const
    const loads = specs.map(async ({ file, weight, style }) => {
      const url = `${baseOrigin}/fonts/th-sarabun-new/${file}`
      try {
        const face = new FontFace('TH Sarabun New', `url(${url}) format('woff')`, { weight, style })
        const loaded = await face.load()
        document.fonts.add(loaded)
      } catch {
        // @font-face จาก CSS อาจโหลดให้แล้ว
      }
    })
    await Promise.all(loads)
    await document.fonts.ready
    for (let i = 0; i < 100; i++) {
      const ok = document.fonts.check('16px "TH Sarabun New"')
        || document.fonts.check('700 16px "TH Sarabun New"')
      if (ok) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }, origin)
}

async function launchBrowser(): Promise<Browser> {
  if (isProd) {
    const [{ default: chromium }, { default: puppeteerCore }] = await Promise.all([
      import('@sparticuz/chromium'),
      import('puppeteer-core'),
    ])
    chromium.setGraphicsMode = false
    return puppeteerCore.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1240, height: 1754 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const { default: puppeteerCore } = await import('puppeteer-core')
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
  return puppeteerCore.launch({
    channel: executablePath ? undefined : 'chrome',
    executablePath: executablePath || undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1240, height: 1754 },
  })
}

export type GenerateReportPdfInput = {
  origin: string
  path: string
  query: string
  sessionToken: string
  landscape?: boolean
  /** บังคับชนิด media ตอนสร้าง PDF ('screen' = ให้ PDF ตรงกับ preview บนจอ) */
  emulateMedia?: 'screen' | 'print'
  /** ใส่ค่า layout จาก localStorage ของ browser ก่อนโหลดหน้า print=1 */
  localStorageSeed?: Record<string, string>
}

export async function generateReportPdf(input: GenerateReportPdfInput): Promise<Buffer> {
  const targetUrl = `${input.origin}${input.path}${input.query ? `?${input.query}` : ''}`
  const domain = new URL(input.origin).hostname
  const secure = input.origin.startsWith('https://')

  let browser: Browser | null = null
  try {
    browser = await launchBrowser()
    const page = await browser.newPage()
    await page.setViewport(input.landscape ? A4_LANDSCAPE_VIEWPORT : A4_VIEWPORT)
    const fontCss = reportFontFaceCss(input.origin)
    await page.evaluateOnNewDocument((css) => {
      const style = document.createElement('style')
      style.setAttribute('data-report-fonts', '1')
      style.textContent = css
      document.documentElement.appendChild(style)
    }, fontCss)
    if (input.localStorageSeed) {
      for (const [key, value] of Object.entries(input.localStorageSeed)) {
        await page.evaluateOnNewDocument((storageKey, storageValue) => {
          localStorage.setItem(storageKey, storageValue)
        }, key, value)
      }
    }
    await page.setCookie({
      name: 'session',
      value: input.sessionToken,
      domain,
      path: '/',
      httpOnly: true,
      secure,
    })
    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 120000 }).catch(async () => {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 90000 })
    })
    await page.waitForFunction('window.__REPORT_READY__ === true', { timeout: 120000 })
    await waitForReportFonts(page, input.origin)
    await page.emulateMediaType(input.emulateMedia ?? (input.landscape ? 'print' : 'screen'))

    const pdf = input.landscape
      ? await page.pdf({
        printBackground: true,
        width: '297mm',
        height: '210mm',
        preferCSSPageSize: false,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      })
      : await page.pdf({
        printBackground: true,
        width: '210mm',
        height: '297mm',
        preferCSSPageSize: false,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      })

    return Buffer.from(pdf)
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

