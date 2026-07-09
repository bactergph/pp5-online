import type { Metadata, Viewport } from 'next'
import { sarabun } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'ระบบ ปพ.5 ออนไลน์',
  description: 'ระบบบันทึกผลการเรียน ปพ.5 และธุรการชั้นเรียน สำหรับโรงเรียนประถมศึกษา',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body className={sarabun.className}>{children}</body>
    </html>
  )
}
