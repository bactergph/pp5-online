import { CLASSROOM_ADMIN_PRINT_LAYOUTS_STORAGE_KEY } from '@/lib/classroom-admin-print-layout'
import { enqueueReportPdf } from '@/lib/pdf/pdf-export-queue'
import type { DownloadReportPdfInput } from '@/lib/pdf/download-report-pdf'

export type ClassroomAdminPdfDownloadInput = Omit<DownloadReportPdfInput, 'landscape'> & {
  label?: string
}

/** ใส่คิวสร้าง PDF ธุรการชั้นเรียน — กล่องมุมขวาล่างติดตามข้ามหน้า */
export function downloadClassroomAdminPdf(input: ClassroomAdminPdfDownloadInput) {
  return enqueueReportPdf({
    ...input,
    landscape: true,
    emulateMedia: 'screen',
    // ตัดเอฟเฟกต์ตกแต่งเฉพาะตอนสร้าง PDF เพื่อให้ไฟล์เปิดลื่น ไม่อืด
    flattenEffects: true,
  })
}

export function classroomAdminPrintLayoutSeed(layouts: unknown): Record<string, string> {
  return {
    [CLASSROOM_ADMIN_PRINT_LAYOUTS_STORAGE_KEY]: JSON.stringify(layouts),
  }
}
