import type { Metadata, Viewport } from 'next'
import { kanit, sarabun } from '@/lib/fonts'
import PdfExportDockBoot from '@/components/pdf/PdfExportDockBoot'
import IosViewportFix from '@/components/layout/IosViewportFix'
import './globals.css'
import './glass-login.css'
import './report-fonts.css'
import './workspace-theme.css'

export const metadata: Metadata = {
  title: 'จารย์เสก (Jarn-Sek) - ระบบจัดการงานวิชาการครู',
  description: 'เสก ปพ.5, ปพ.6, ธุรการชั้นเรียน, ตารางสอน ให้เสร็จไวในพริบตา',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${sarabun.variable} ${kanit.variable}`}>
      <body className={sarabun.className}>
        <IosViewportFix />
        {children}
        <PdfExportDockBoot />
      </body>
    </html>
  )
}
