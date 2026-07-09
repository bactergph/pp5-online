import { appOrigin } from '@/lib/app-origin'
import type { Browser } from 'puppeteer-core'

export { appOrigin }

const isProd = process.env.NODE_ENV === 'production'

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
}

export async function generateReportPdf(input: GenerateReportPdfInput): Promise<Buffer> {
  const targetUrl = `${input.origin}${input.path}${input.query ? `?${input.query}` : ''}`
  const domain = new URL(input.origin).hostname
  const secure = input.origin.startsWith('https://')

  let browser: Browser | null = null
  try {
    browser = await launchBrowser()
    const page = await browser.newPage()
    await page.setCookie({
      name: 'session',
      value: input.sessionToken,
      domain,
      path: '/',
      httpOnly: true,
      secure,
    })
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForFunction('window.__REPORT_READY__ === true', { timeout: 90000 })

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
        preferCSSPageSize: true,
      })

    return Buffer.from(pdf)
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

