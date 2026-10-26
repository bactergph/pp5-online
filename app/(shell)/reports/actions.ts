'use server'
// Expose only authenticated entry points; trusted archive loaders are server-only.
import * as reportData from '@/lib/report-data-server'
import type {ReportMode} from '@/lib/report-data-server'
export async function fetchReportInit(mode?:ReportMode){return reportData.fetchReportInit(mode)}
export async function fetchReportSubjects(params:Parameters<typeof reportData.fetchReportSubjects>[0]){return reportData.fetchReportSubjects(params)}
export async function fetchReportData(params:Parameters<typeof reportData.fetchReportData>[0]){return reportData.fetchReportData(params)}
export async function fetchPp6Students(academicYearId:string){return reportData.fetchPp6Students(academicYearId)}
export type {ReportMode,ReportYear,ReportClassroom,ReportStudent,ReportSubject,ReportScore,ReportScoreConfig,ReportDailyAttendanceRecord,ReportCalendarDay,ReportEvaluationRow,ReportActivitySetting,ReportCharacterSetting,ReportReadingSetting,ReportHourlyAttendanceRecord,ReportPayload,ReportPp6StudentOption} from '@/lib/report-data-server'
