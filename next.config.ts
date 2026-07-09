import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  // Vercel ต้อง trace ไฟล์ chromium.br ใน bin/ มาด้วย ไม่งั้น PDF บน production จะหา path ไม่เจอ
  outputFileTracingIncludes: {
    '/api/reports/pdf': ['./node_modules/@sparticuz/chromium/**/*'],
    '/documents/**/*': ['./node_modules/@sparticuz/chromium/**/*'],
    '/sign/**/*': ['./node_modules/@sparticuz/chromium/**/*'],
    '/school/**/*': ['./node_modules/@sparticuz/chromium/**/*'],
  },
  typescript: {
    // TODO: แก้ type errors แล้วปิด ignore
    ignoreBuildErrors: true,
  },
  experimental: {
    // ปิด cache บนไดรฟ์ช้า — ลดอาการ compile ค้าง/404
    turbopackFileSystemCacheForDev: false,
  },
}

export default nextConfig
