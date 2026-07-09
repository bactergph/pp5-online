import { appOrigin } from '@/lib/app-origin'
import type { Browser } from 'puppeteer-core'

export { appOrigin }

const isProd = process.env.NODE_ENV === 'production'

/** A4 @ 96dpi — ให้ layout ตรงกับ 210×297mm */
const A4_VIEWPORT = { width: 794, height: 1123, deviceScaleFactor: 1 as const }
const A4_LANDSCAPE_VIEWPORT = { width: 1123, height: 794, deviceScaleFactor: 1 as const }

async function waitForReportFonts(page: import('puppeteer-core').Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    for (let i = 0; i < 100; i++) {
      const ok = document.fonts.check('16px "TH Sarabun New"')
        || document.fonts.check('700 16px "TH Sarabun New"')
        || document.fonts.check('italic 16px "TH Sarabun New"')
        || document.fonts.check('italic 700 16px "TH Sarabun New"')
      if (ok) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  })
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
    await waitForReportFonts(page)
    await page.emulateMediaType('screen')

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

