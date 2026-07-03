import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
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
