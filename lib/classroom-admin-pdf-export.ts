import { CLASSROOM_ADMIN_PRINT_LAYOUTS_STORAGE_KEY } from '@/lib/classroom-admin-print-layout'
import { downloadReportPdf, type DownloadReportPdfInput } from '@/lib/pdf/download-report-pdf'

export type ClassroomAdminPdfDownloadInput = Omit<DownloadReportPdfInput, 'landscape'>

export async function downloadClassroomAdminPdf(input: ClassroomAdminPdfDownloadInput) {
  return downloadReportPdf({
    ...input,
    landscape: true,
    emulateMedia: 'screen',
    // ตัดเอฟเฟกต์ตกแต่งเฉพาะตอนสร้าง PDF เพื่อให้ไฟล์เปิดลื่น ไม่อืด
    // (ไม่กระทบ CSS/preview บนจอ และสีพื้นตารางยังอยู่ครบ)
    flattenEffects: true,
  })
}

export function classroomAdminPrintLayoutSeed(layouts: unknown): Record<string, string> {
  return {
    [CLASSROOM_ADMIN_PRINT_LAYOUTS_STORAGE_KEY]: JSON.stringify(layouts),
  }
}
