import { CLASSROOM_ADMIN_PRINT_LAYOUTS_STORAGE_KEY } from '@/lib/classroom-admin-print-layout'
import { downloadReportPdf, type DownloadReportPdfInput } from '@/lib/pdf/download-report-pdf'

export type ClassroomAdminPdfDownloadInput = Omit<DownloadReportPdfInput, 'landscape'>

export async function downloadClassroomAdminPdf(input: ClassroomAdminPdfDownloadInput) {
  return downloadReportPdf({
    ...input,
    landscape: true,
    emulateMedia: 'screen',
  })
}

export function classroomAdminPrintLayoutSeed(layouts: unknown): Record<string, string> {
  return {
    [CLASSROOM_ADMIN_PRINT_LAYOUTS_STORAGE_KEY]: JSON.stringify(layouts),
  }
}
