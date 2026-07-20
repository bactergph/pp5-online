'use server'

import { fetchReportInit } from '@/app/(shell)/reports/actions'
import { buildSchoolMisGradesExport } from '@/lib/schoolmis-export'

export async function fetchSchoolMisExportInit() {
  return fetchReportInit('pp5-class')
}

/** เหลือไว้เรียกตรง ๆ — คิวดาวน์โหลดควรใช้ /api/export/schoolmis แทน */
export async function exportSchoolMisGradesCsv(params: {
  academicYearId: string
  classroomId: string
}) {
  return buildSchoolMisGradesExport(params)
}
