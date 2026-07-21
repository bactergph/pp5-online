'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import {
  fetchReportData,
  fetchReportInit,
  fetchPp6Students,
  fetchReportSubjects,
  type ReportClassroom,
  type ReportPp6StudentOption,
  type ReportMode,
  type ReportPayload,
  type ReportDailyAttendanceRecord,
  type ReportCalendarDay,
  type ReportEvaluationRow,
  type ReportHourlyAttendanceRecord,
  type ReportScore,
  type ReportStudent,
  type ReportSubject,
  type ReportYear,
  type ReportCharacterSetting,
  type ReportReadingSetting,
} from './actions'
import {
  buildTeachingWeeks,
  hoursPerWeek,
  buildHourlyStatusMap,
  hourlyCellKey,
  schoolDayCalendarFromLists,
  summarizeHourlyStatuses,
  termDateRange,
  type HourlyStatus,
} from '@/lib/hourly-attendance'
import {
  buildSubjectCalendarWeeks,
  countPrimaryHourlyPages,
  countSecondaryHourlyPages,
  displaySlotsPerWeek,
  holidayNameMap,
  primaryGlobalSlotNumber,
  primaryHourlyPages,
  secondaryHourlyPages,
  subjectHourlyHpw,
  subjectHourlyTermWeeks,
  type SubjectCalendarWeek,
} from '@/lib/subject-hourly-report'
import { activityHoursForField, totalActiveActivityHours, characterCriteriaTopics, readingCriteriaTopics } from '@/lib/evaluation-settings'
import {
  READING_GRAND_TOTAL_MAX,
  READING_SCORE_KEYS,
  defaultReadingTableGroups,
  readingTableColumnMax,
  readingTableColumnValue,
  readingTableFlatColumns,
  type ReadingTableColumn,
} from '@/lib/reading-table-layout'
import {
  directorActingPositionLine,
  directorDisplayName,
  directorSchoolLine,
} from '@/lib/school-director'
import { expandEducationAreaOffice } from '@/lib/education-area-office'
import { enqueueFileExport, enqueueReportPdf } from '@/lib/pdf/pdf-export-queue'
import { buildPp6PdfBlob } from '@/lib/jspdf-pp6'
import { downscaleImageUrl } from '@/lib/downscale-image-url'
import {
  PRINT_STUDENTS_PER_PAGE,
  chunkStudentsForPrintPages,
  printStudentPageCount,
} from '@/lib/print-student-pages'
import { subjectGroupHeadPositionLine } from '@/lib/subject-groups'
import { isPrimaryClassLevel, isSecondaryClassLevel, pp5SubjectReportTerm } from '@/lib/class-level'
import {
  pp5AttendanceBodyRows,
  pp5SectionLayoutStyle,
  pp5StudentTableRows,
  savePp5PrintLayouts,
  PP5_PRINT_LAYOUTS_STORAGE_KEY,
  type Pp5PrintSection,
  PP5_PRINT_SECTIONS,
} from '@/lib/pp5-print-layout'
import ReportCheckMark from '@/components/reports/ReportCheckMark'
import { usePp5Layout, usePp5SectionLayout, Pp5PrintLayoutsProvider } from '@/lib/pp5-print-layout-context'
import { pp6SectionLayoutStyle, savePp6PrintLayouts, PP6_PRINT_LAYOUTS_STORAGE_KEY } from '@/lib/pp6-print-layout'
import { usePp6SectionLayout, Pp6PrintLayoutsProvider } from '@/lib/pp6-print-layout-context'
import Pp5PrintLayoutTuner, { usePp5PrintLayoutsState, usePp6PrintLayoutsState } from '@/components/reports/Pp5PrintLayoutTuner'
import Pp6JsPdfLivePreview from '@/components/reports/Pp6JsPdfLivePreview'
import DocumentSignaturePanel from '@/components/sign/DocumentSignaturePanel'

function usePp5PageStyle(section: Pp5PrintSection) {
  const layout = usePp5Layout(section)
  return pp5SectionLayoutStyle(section, layout)
}

function usePp6PageStyle() {
  const layout = usePp6SectionLayout()
  return pp6SectionLayoutStyle(layout)
}

type InitData = Awaited<ReturnType<typeof fetchReportInit>>
type PrintSection = 'cover' | 'criteria' | 'attendance' | 'scores' | 'achievement' | 'character' | 'reading' | 'competency' | 'activities'

const MODE_CONFIG: Record<ReportMode, { title: string; subtitle: string; printLabel: string }> = {
  'pp5-subject': {
    title: 'ปพ.5 รายวิชา',
    subtitle: 'แบบบันทึกผลการเรียนประจำรายวิชา',
    printLabel: 'พิมพ์รายงาน',
  },
  'pp5-class': {
    title: 'ปพ.5 รวมชั้น',
    subtitle: 'รวมทุกวิชา · ทุกการประเมิน · 1 ห้อง = 1 เล่ม',
    printLabel: 'พิมพ์รายงาน',
  },
  pp6: {
    title: 'ปพ.6 นักเรียน',
    subtitle: 'แบบรายงานผลการพัฒนาคุณภาพผู้เรียนรายบุคคล',
    printLabel: 'พิมพ์',
  },
}

const SECTION_LABELS: Record<PrintSection, string> = {
  cover: 'หน้าปก',
  criteria: 'เกณฑ์ คุณลักษณะ/อ่านเขียน',
  attendance: 'เวลาเรียน',
  scores: 'ผลการเรียน',
  achievement: 'สรุปผลสัมฤทธิ์ทางการเรียน',
  character: 'คุณลักษณะอันพึงประสงค์',
  reading: 'อ่าน คิดวิเคราะห์ เขียน',
  competency: 'สมรรถนะสำคัญ',
  activities: 'กิจกรรมพัฒนาผู้เรียน',
}

const PP5_TUNER_SECTION_LABELS: Record<Pp5PrintSection, string> = {
  coverClass: 'หน้าปกรายชั้น',
  coverSubject: 'หน้าปกรายวิชา',
  criteria: 'เกณฑ์ คุณลักษณะ/อ่านเขียน',
  attendance: 'เวลาเรียน',
  scores: 'ผลการเรียน',
  achievement: 'สรุปผลสัมฤทธิ์ทางการเรียน',
  character: 'คุณลักษณะอันพึงประสงค์',
  reading: 'อ่าน คิดวิเคราะห์ เขียน',
  competency: 'สมรรถนะสำคัญ',
  activities: 'กิจกรรมพัฒนาผู้เรียน',
}

const ALL_SECTIONS: Record<ReportMode, PrintSection[]> = {
  'pp5-subject': ['cover', 'criteria', 'attendance', 'scores', 'character', 'reading', 'competency'],
  'pp5-class': ['cover', 'criteria', 'attendance', 'scores', 'achievement', 'character', 'reading', 'competency', 'activities'],
  pp6: ['scores', 'activities', 'character', 'reading', 'competency'],
}

const DEFAULT_SECTIONS: Record<ReportMode, PrintSection[]> = {
  'pp5-subject': ['cover'],
  'pp5-class': ['cover'],
  pp6: ['scores'],
}

const CHARACTER_KEYS = Array.from({ length: 8 }, (_, index) => `trait${index + 1}_score`)
const READING_KEYS = [...READING_SCORE_KEYS]
const COMPETENCY_KEYS = Array.from({ length: 5 }, (_, index) => `competency${index + 1}_score`)
const COMPETENCY_LABELS = ['สื่อสาร', 'คิด', 'แก้ปัญหา', 'ทักษะชีวิต', 'เทคโนโลยี']
const ACTIVITY_KEYS = ['guidance_result', 'scout_result', 'club_result', 'public_service_result']
const ACTIVITY_LABELS = ['แนะแนว', 'ลูกเสือ/เนตรนารี/ยุวกาชาติ', 'ชุมนุม', 'จิตอาสา']

function studentName(student: ReportStudent) {
  return `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim()
}

function classLabel(classroom: ReportClassroom | null) {
  return classroom ? `${classroom.level}/${classroom.room}` : '-'
}

function scoreFor(data: ReportPayload | null, studentId: string, classSubjectId: string) {
  return data?.scores.find(score => score.student_id === studentId && score.class_subject_id === classSubjectId) || null
}

function scoreForTerm(data: ReportPayload | null, studentId: string, classSubjectId: string, term: 1 | 2) {
  return data?.scores.find(score => score.student_id === studentId && score.class_subject_id === classSubjectId && score.term === term) || null
}

function finalScoreForSubject(data: ReportPayload | null, studentId: string, classSubjectId: string) {
  return scoreForTerm(data, studentId, classSubjectId, 2)
    || scoreForTerm(data, studentId, classSubjectId, 1)
    || scoreFor(data, studentId, classSubjectId)
}

function numericGrade(score: ReportScore | null) {
  if (!score || score.grade === null || score.grade === undefined) return null
  return Number.isFinite(Number(score.grade)) ? Number(score.grade) : null
}

function studentGpa(data: ReportPayload | null, studentId: string, subjects: ReportSubject[]) {
  let weighted = 0
  let weightTotal = 0
  for (const subject of subjects) {
    const grade = numericGrade(finalScoreForSubject(data, studentId, subject.class_subject_id))
    if (grade === null) continue
    const weight = Number(subject.subject.credits || 0) > 0 ? Number(subject.subject.credits) : 1
    weighted += grade * weight
    weightTotal += weight
  }
  return weightTotal > 0 ? weighted / weightTotal : null
}

function scoreConfigFor(data: ReportPayload | null, classSubjectId: string, term: 1 | 2) {
  return data?.scoreConfigs.find(config => config.class_subject_id === classSubjectId && config.term === term) || null
}

const SUBJECT_SCORE_PAGES_PER_TERM = 3
const SUBJECT_UNIT_DISPLAY_COLS = 6
const SUBJECT_FINAL_DISPLAY_COLS = 4
const CRITERIA_REPORT_PAGE_COUNT = 2

function studentTablePageCount(data: ReportPayload | null) {
  return printStudentPageCount(data?.students?.length || 0)
}

function withStudentChunks<T>(
  data: ReportPayload | null,
  render: (pageData: ReportPayload | null, pageIndex: number, pageStartOffset: number) => T,
): T[] {
  const chunks = chunkStudentsForPrintPages(data?.students || [])
  return chunks.map((students, pageIndex) => {
    const pageData = data ? { ...data, students } : null
    return render(pageData, pageIndex, pageIndex * PRINT_STUDENTS_PER_PAGE)
  })
}

function subjectScorePageCount(term: 0 | 1 | 2, data: ReportPayload | null = null) {
  return (term === 0 ? 2 : 1) * SUBJECT_SCORE_PAGES_PER_TERM * studentTablePageCount(data)
}

function splitScoreUnits(config: ReturnType<typeof scoreConfigFor>) {
  const betweenScores = config?.between_scores?.length ? config.between_scores : [5, 5, 5, 5, 5]
  const beforeCount = Math.ceil(betweenScores.length / 2)
  const afterCount = Math.max(0, betweenScores.length - beforeCount)
  const beforeMaxes = betweenScores.slice(0, beforeCount)
  const afterMaxes = betweenScores.slice(beforeCount)
  return {
    betweenScores,
    beforeCount,
    afterCount,
    beforeMaxes,
    afterMaxes,
    beforeMax: beforeMaxes.reduce((sum, value) => sum + value, 0),
    afterMax: afterMaxes.reduce((sum, value) => sum + value, 0),
    midtermMax: config?.midterm_max || 0,
    finalMax: config?.final_max || 0,
  }
}

function unitScoreValues(score: ReportScore | null, startIndex: number, count: number) {
  return Array.from({ length: count }, (_, index) => score?.unit_scores?.[String(startIndex + index + 1)] ?? '')
}

function padScoreCells(values: Array<string | number>, size: number) {
  return Array.from({ length: size }, (_, index) => values[index] ?? '')
}

function sumScoreCells(values: Array<string | number>) {
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0)
}

function pp5ScoreHeadLabel(label: string, max?: number | null) {
  const fullScore = max && max > 0 ? `(${max}) ` : ''
  return <span>{fullScore}{label}</span>
}

function subjectReportSubhead(data: ReportPayload | null, term: 0 | 1 | 2) {
  const classroom = data?.classroom
  const termLabel = term === 0 ? 'สรุปทั้งปี' : `ภาคเรียนที่ ${term}`
  if (!classroom) return `${termLabel} ปีการศึกษา ${data?.academicYear?.year_be || '-'}`
  return `${classroomCoverLine(classroom)} ${termLabel} ปีการศึกษา ${data?.academicYear?.year_be || '-'}`
}

function SubjectReportHead({
  data,
  title,
  term,
  subject,
}: {
  data: ReportPayload | null
  title: string
  term: 0 | 1 | 2
  subject?: ReportSubject | null
}) {
  return (
    <header className="pp5-subject-report-head">
      <h1>{title}</h1>
      <p>{subjectReportSubhead(data, term)}</p>
      {subject && (
        <p className="pp5-subject-report-subline">
          รายวิชา {subject.subject.name} รหัสวิชา {subject.subject.code}
          <span>ครูผู้สอน {subject.teacher_name || '-'}</span>
          <span>ครูที่ปรึกษา {homeroomTeacherLine(data?.classroom)}</span>
        </p>
      )}
    </header>
  )
}

function HeaderLine({ data, title, term }: { data: ReportPayload | null; title: string; term: 0 | 1 | 2 }) {
  return <SubjectReportHead data={data} title={title} term={term} />
}

function rowFor(rows: Record<string, string | number | null>[], studentId: string) {
  return rows.find(row => row.student_id === studentId) || null
}

function rowForTerm(rows: Record<string, string | number | null>[], studentId: string, term: 1 | 2 | 0) {
  const studentRows = rows.filter(row => row.student_id === studentId)
  if (term !== 0) return studentRows.find(row => Number(row.term) === term) || studentRows[0] || null
  return studentRows.find(row => Number(row.term) === 2) || studentRows.find(row => Number(row.term) === 1) || studentRows[0] || null
}

function scoreText(score: ReportScore | null) {
  if (!score) return '-'
  if (score.result && score.result !== 'เรียน') return score.result
  return score.grade === null || score.grade === undefined ? '-' : String(score.grade)
}

function levelFromAverage(value: number | null) {
  if (value === null) return '-'
  if (value >= 2.5) return 'ดีเยี่ยม'
  if (value >= 2) return 'ดี'
  if (value >= 1) return 'ผ่าน'
  return 'ไม่ผ่าน'
}

function resultLevelNumber(level: string | number | null | undefined) {
  if (level === 'ดีเยี่ยม') return 3
  if (level === 'ดี') return 2
  if (level === 'ผ่าน') return 1
  if (level === 'ไม่ผ่าน') return 0
  return ''
}

function averageScore(row: Record<string, string | number | null> | null, keys: string[]) {
  if (!row) return null
  const values = keys.map(key => Number(row[key] ?? 0))
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function attendanceText(summary?: { present: number; sick: number; leave: number; absent: number }) {
  if (!summary) return 'มา 0 · ป่วย 0 · ลา 0 · ขาด 0'
  return `มา ${summary.present} · ป่วย ${summary.sick} · ลา ${summary.leave} · ขาด ${summary.absent}`
}

function termTitle(term: 1 | 2 | 0) {
  return term === 0 ? 'สรุปทั้งปี' : `ภาคเรียนที่ ${term}`
}

function compactSubjectName(subject: ReportSubject) {
  if (subject.subject.short_name?.trim()) return subject.subject.short_name.trim()
  const name = subject.subject.name.trim()
  return name
    .replace(/^ภาษาไทย/, 'ไทย')
    .replace(/^คณิตศาสตร์/, 'คณิต')
    .replace(/^วิทยาศาสตร์และเทคโนโลยี/, 'วิทย์')
    .replace(/^วิทยาศาสตร์/, 'วิทย์')
    .replace(/^สังคมศึกษา\s*ศาสนาและวัฒนธรรม/, 'สังคม ฯ')
    .replace(/^สังคมศึกษา/, 'สังคม ฯ')
    .replace(/^ประวัติศาสตร์/, 'ประวัติ')
    .replace(/^สุขศึกษาและพลศึกษา/, 'สุขฯ')
    .replace(/^สุขศึกษา/, 'สุขฯ')
    .replace(/^พลศึกษา/, 'พละ')
    .replace(/^ศิลปะ/, 'ศิลปะ')
    .replace(/^การงานอาชีพ/, 'การงาน')
    .replace(/^ภาษาอังกฤษ/, 'อังกฤษ')
}

function formatPp6Number(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return ''
  if (digits <= 0) return String(Number(value))
  return Number(value).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function pp6SubjectType(subject: ReportSubject) {
  const text = `${subject.subject.subject_group || ''} ${subject.subject.name || ''}`.toLowerCase()
  return /เพิ่มเติม|elective|เลือก/.test(text) ? 'เพิ่มเติม' : 'พื้นฐาน'
}

function pp6SubjectWeight(subject: ReportSubject) {
  const credits = Number(subject.subject.credits || 0)
  return credits > 0 ? credits : 1
}

function pp6TermScore(data: ReportPayload | null, studentId: string, subjectId: string, term: 1 | 2) {
  const score = scoreForTerm(data, studentId, subjectId, term)
  return {
    total: score?.term_total ?? null,
    grade: numericGrade(score),
  }
}

function pp6AnnualScore(data: ReportPayload | null, studentId: string, subjectId: string) {
  const term2 = scoreForTerm(data, studentId, subjectId, 2)
  const term1 = scoreForTerm(data, studentId, subjectId, 1)
  const fallback = finalScoreForSubject(data, studentId, subjectId)
  return {
    total: term2?.year_total ?? fallback?.year_total ?? term2?.term_total ?? term1?.term_total ?? null,
    grade: numericGrade(term2 || fallback || term1),
  }
}

function pp6StudentTermScoreTotal(data: ReportPayload | null, studentId: string, subjects: ReportSubject[], term: 1 | 2) {
  let total = 0
  let hasAny = false
  for (const subject of subjects) {
    const termScore = pp6TermScore(data, studentId, subject.class_subject_id, term)
    if (termScore.total === null || !Number.isFinite(Number(termScore.total))) continue
    total += Number(termScore.total)
    hasAny = true
  }
  return hasAny ? total : null
}

function pp6StudentAnnualScoreTotal(data: ReportPayload | null, studentId: string, subjects: ReportSubject[]) {
  let total = 0
  let hasAny = false
  for (const subject of subjects) {
    const annual = pp6AnnualScore(data, studentId, subject.class_subject_id)
    if (annual.total === null || !Number.isFinite(Number(annual.total))) continue
    total += Number(annual.total)
    hasAny = true
  }
  return hasAny ? total : null
}

function buildPp6RankMap(data: ReportPayload | null, subjects: ReportSubject[], term: 1 | 2 | 0) {
  if (term === 1) {
    const ranked = [...(data?.students || [])]
      .map(student => ({
        student,
        scoreTotal: pp6StudentTermScoreTotal(data, student.id, subjects, 1),
      }))
      .filter(item => item.scoreTotal !== null)
      .sort((a, b) => (b.scoreTotal ?? -1) - (a.scoreTotal ?? -1))

    const rankMap = new Map<string, number>()
    ranked.forEach((item, index) => {
      if (index > 0 && ranked[index - 1].scoreTotal === item.scoreTotal) {
        rankMap.set(item.student.id, rankMap.get(ranked[index - 1].student.id)!)
        return
      }
      rankMap.set(item.student.id, index + 1)
    })
    return rankMap
  }

  const ranked = [...(data?.students || [])]
    .map(student => ({
      student,
      gpa: studentGpa(data, student.id, subjects),
      scoreTotal: pp6StudentAnnualScoreTotal(data, student.id, subjects),
    }))
    .filter(item => item.gpa !== null)
    .sort((a, b) => {
      const gpaDiff = (b.gpa ?? -1) - (a.gpa ?? -1)
      if (gpaDiff !== 0) return gpaDiff
      return (b.scoreTotal ?? -1) - (a.scoreTotal ?? -1)
    })

  const rankMap = new Map<string, number>()
  ranked.forEach((item, index) => {
    if (index > 0) {
      const prev = ranked[index - 1]
      if (prev.gpa === item.gpa && prev.scoreTotal === item.scoreTotal) {
        rankMap.set(item.student.id, rankMap.get(prev.student.id)!)
        return
      }
    }
    rankMap.set(item.student.id, index + 1)
  })
  return rankMap
}

function pp6LevelDigit(classroom: ReportClassroom | null | undefined) {
  const match = classroom?.level?.match(/\d+/)
  return match?.[0] || ''
}

function pp6ActivityCode(data: ReportPayload | null, index: number) {
  const level = pp6LevelDigit(data?.classroom) || '1'
  return `ก${level}29${String(index + 1).padStart(2, '0')}`
}

const ACTIVITY_HOURS_FALLBACK = [40, 40, 30, 10]

function pp6ActivityLabel(data: ReportPayload | null, index: number) {
  const key = ACTIVITY_KEYS[index]
  const setting = data?.activitySettings?.find(item => item.field_key === key)
  return setting?.label || ACTIVITY_LABELS[index]
}

function pp6ActivityHours(data: ReportPayload | null, index: number) {
  const key = ACTIVITY_KEYS[index]
  const fallback = ACTIVITY_HOURS_FALLBACK[index] ?? 0
  return activityHoursForField(data?.activitySettings || [], key, fallback)
}

const THAI_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const PP5_ATTENDANCE_DAYS_PER_WEEK = 7
/** หัวคอลัมน์คงที่ จ–อา · วันที่เรียงตามลำดับในสัปดาห์ */
const PP5_ATTENDANCE_WEEK_LABELS = [1, 2, 3, 4, 5, 6, 0] as const

type AttendanceDayCell = {
  weekday: number
  colIndex: number
  date: Date | null
  key: string | null
  dayNumber: number | null
  dayIndex: number | null
  isWeekend: boolean
}

function expandAttendanceWeek(week: AttendanceWeek): AttendanceDayCell[] {
  return PP5_ATTENDANCE_WEEK_LABELS.map((weekday, colIndex) => {
    const day = week.days[colIndex]
    const isWeekend = day ? [0, 6].includes(day.date.getDay()) : false
    if (!day) {
      return { weekday, colIndex, date: null, key: null, dayNumber: null, dayIndex: null, isWeekend }
    }
    return {
      weekday,
      colIndex,
      date: day.date,
      key: day.key,
      dayNumber: day.dayNumber,
      dayIndex: day.dayIndex,
      isWeekend,
    }
  })
}

function pp5AttendanceTableStyle(rowCount: number): CSSProperties {
  return { ['--pp5-attendance-rows' as string]: String(rowCount) }
}

function parseDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : null
}

function dateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

type AttendanceWeek = {
  weekNumber: number
  days: { date: Date; key: string; dayNumber: number; dayIndex: number }[]
}

function attendanceWeeks(start: Date | null, end: Date | null) {
  if (!start || !end) return []
  const weeks: AttendanceWeek[] = []
  let currentWeek: AttendanceWeek | null = null
  let schoolDayIndex = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    if (!currentWeek || currentWeek.days.length >= PP5_ATTENDANCE_DAYS_PER_WEEK) {
      currentWeek = { weekNumber: weeks.length + 1, days: [] }
      weeks.push(currentWeek)
    }
    schoolDayIndex += 1
    currentWeek.days.push({
      date: new Date(cursor),
      key: dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
      dayNumber: cursor.getDate(),
      dayIndex: schoolDayIndex,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return weeks
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function weekMonthLabel(week: AttendanceWeek) {
  const months = [...new Set(week.days.map(day => day.date.getMonth()))]
  return months.length === 1
    ? THAI_MONTH_SHORT[months[0]]
    : months.map(month => THAI_MONTH_SHORT[month]).join(' - ')
}

function attendanceDateRange(data: ReportPayload | null, term: 0 | 1 | 2) {
  const year = data?.academicYear
  if (!year) return { start: null, end: null }
  if (term === 0) return { start: parseDate(year.term1_start_date), end: parseDate(year.term2_end_date) }
  return term === 1
    ? { start: parseDate(year.term1_start_date), end: parseDate(year.term1_end_date) }
    : { start: parseDate(year.term2_start_date), end: parseDate(year.term2_end_date) }
}

function attendanceRecordMap(records: ReportDailyAttendanceRecord[]) {
  const out = new Map<string, string>()
  for (const record of records) out.set(`${record.student_id}:${record.date}`, record.status)
  return out
}

function calendarDayMap(days: ReportCalendarDay[]) {
  return new Map(days.map(day => [day.date, day.name || '']))
}

function isAttendanceSchoolDay(date: Date, key: string, holidayMap: Map<string, string>, openWeekendMap: Map<string, string>) {
  const isWeekend = [0, 6].includes(date.getDay())
  const isHoliday = holidayMap.has(key)
  return !isHoliday && (!isWeekend || openWeekendMap.has(key))
}

function attendanceSchoolDayKeysForTerm(data: ReportPayload | null, term: 1 | 2, holidayMap: Map<string, string>, openWeekendMap: Map<string, string>) {
  const { start, end } = attendanceDateRange(data, term)
  const keys: string[] = []
  if (!start || !end) return keys
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    if (isAttendanceSchoolDay(cursor, key, holidayMap, openWeekendMap)) keys.push(key)
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

function summarizeAttendanceKeys(studentId: string, keys: string[], recordMap: Map<string, string>) {
  const summary = { leave: 0, sick: 0, absent: 0, present: 0 }
  for (const key of keys) {
    const status = recordMap.get(`${studentId}:${key}`) || 'ม'
    if (status === 'ป') summary.sick += 1
    else if (status === 'ล') summary.leave += 1
    else if (status === 'ข') summary.absent += 1
    else summary.present += 1
  }
  return summary
}

function classAttendanceTermPageCount(data: ReportPayload | null, term: 1 | 2) {
  const { start, end } = attendanceDateRange(data, term)
  return chunkArray(attendanceWeeks(start, end), 4).length
}

function reportSchoolCalendar(data: ReportPayload | null) {
  return schoolDayCalendarFromLists(
    (data?.holidays || []).map(day => day.date),
    (data?.weekendSchoolDays || []).map(day => day.date),
  )
}

function subjectHourlyTermPageCount(data: ReportPayload | null, subject: ReportSubject | null | undefined, term: 1 | 2) {
  const range = termDateRange(data?.academicYear || null, term)
  const calendar = reportSchoolCalendar(data)
  const teachingWeeks = subjectHourlyTermWeeks(range.start, range.end, calendar)
  if (teachingWeeks.length === 0) return 1
  if (isSecondaryClassLevel(data?.classroom?.level)) {
    const hpw = subjectHourlyHpw(subject?.subject.hours_per_year || 0, teachingWeeks)
    const { weeks } = buildSubjectCalendarWeeks(range.start, range.end, calendar, hpw, holidayNameMap(data?.holidays))
    return countSecondaryHourlyPages(weeks)
  }
  return countPrimaryHourlyPages(teachingWeeks)
}

function subjectHourlySummaryPageCount(data: ReportPayload | null, term: 0 | 1 | 2) {
  const isSecondary = isSecondaryClassLevel(data?.classroom?.level)
  if (isSecondary) {
    if (term === 0) return 2
    return 1
  }
  return term === 0 || term === 2 ? 1 : 0
}

function attendancePageCount(data: ReportPayload | null, mode: ReportMode, term: 0 | 1 | 2, subject?: ReportSubject | null) {
  const studentPages = studentTablePageCount(data)
  if (mode === 'pp5-subject') {
    if (term === 0) {
      const term1 = subjectHourlyTermPageCount(data, subject, 1)
      const term2 = subjectHourlyTermPageCount(data, subject, 2)
      const summaries = subjectHourlySummaryPageCount(data, term)
      if (isSecondaryClassLevel(data?.classroom?.level)) {
        return (term1 + 1 + term2 + 1) * studentPages
      }
      return (term1 + term2 + summaries) * studentPages
    }
    return (subjectHourlyTermPageCount(data, subject, term as 1 | 2) + subjectHourlySummaryPageCount(data, term)) * studentPages
  }
  if (mode !== 'pp5-class') return studentPages
  const term1Pages = term === 0 || term === 1 ? classAttendanceTermPageCount(data, 1) : 0
  const term2Pages = term === 0 || term === 2 ? classAttendanceTermPageCount(data, 2) : 0
  const total = term1Pages + term2Pages
  if (total === 0) return studentPages
  return (total + (term === 0 ? 1 : 0)) * studentPages
}

function classScorePageCount(data: ReportPayload | null, term: 0 | 1 | 2) {
  const termCount = term === 0 ? 2 : 1
  return (data?.subjects.length || 0) * termCount * studentTablePageCount(data)
}

const PP5_SUBJECT_PAGE_MARK = '(รายวิชา)'

function ReportPageNumber({ value, mark }: { value?: number; mark?: string }) {
  if (!value) return null
  return (
    <div className="report-page-number-wrap">
      <div className="report-page-number">หน้า {value}</div>
      {mark ? <div className="report-page-number-mark">{mark}</div> : null}
    </div>
  )
}

function ReportComingSoonPage({
  title,
  pageNumber,
  pageMark,
}: {
  title: string
  pageNumber?: number
  pageMark?: string
}) {
  return (
    <section className="report-page report-coming-soon-page">
      <ReportPageNumber value={pageNumber} mark={pageMark} />
      <div className="report-coming-soon-body">
        <h1>{title}</h1>
        <p>Coming soon</p>
      </div>
    </section>
  )
}

function reportPageStarts(data: ReportPayload | null, mode: ReportMode, sections: PrintSection[], term: 0 | 1 | 2, subject?: ReportSubject | null) {
  let nextPage = 1
  const takePageStart = (enabled: boolean, count = 1) => {
    if (!data || !enabled || count <= 0) return undefined
    const start = nextPage
    nextPage += count
    return start
  }

  if (mode === 'pp6') {
    return {
      cover: undefined,
      character: undefined,
      reading: undefined,
      attendance: undefined,
      subjectScore: undefined,
      classScore: undefined,
      achievement: undefined,
      competency: undefined,
      activities: undefined,
      pp6: takePageStart(true),
    }
  }

  return {
    cover: undefined,
    criteria: takePageStart(sections.includes('criteria'), CRITERIA_REPORT_PAGE_COUNT),
    attendance: takePageStart(sections.includes('attendance'), attendancePageCount(data, mode, term, subject)),
    subjectScore: takePageStart(mode === 'pp5-subject' && sections.includes('scores'), subjectScorePageCount(term, data)),
    classScore: takePageStart(mode === 'pp5-class' && sections.includes('scores'), classScorePageCount(data, term)),
    achievement: takePageStart(mode === 'pp5-class' && sections.includes('achievement'), studentTablePageCount(data)),
    character: takePageStart(sections.includes('character'), studentTablePageCount(data)),
    reading: takePageStart(sections.includes('reading'), studentTablePageCount(data)),
    competency: takePageStart(sections.includes('competency'), studentTablePageCount(data)),
    activities: takePageStart(mode === 'pp5-class' && sections.includes('activities'), studentTablePageCount(data)),
    pp6: undefined,
  }
}

function uniqueLevels(classrooms: ReportClassroom[]) {
  return [...new Set(classrooms.map(item => item.level))].sort((a, b) => a.localeCompare(b, 'th'))
}

const CLASS_COVER_GRADE_COLUMNS = [
  { key: '0', label: '0, ร, มส' },
  { key: '1', label: '1' },
  { key: '1.5', label: '1.5' },
  { key: '2', label: '2' },
  { key: '2.5', label: '2.5' },
  { key: '3', label: '3' },
  { key: '3.5', label: '3.5' },
  { key: '4', label: '4' },
]

const SUBJECT_COVER_GRADE_COLUMNS = [
  { key: '4', label: '4' },
  { key: '3.5', label: '3.5' },
  { key: '3', label: '3' },
  { key: '2.5', label: '2.5' },
  { key: '2', label: '2' },
  { key: '1.5', label: '1.5' },
  { key: '1', label: '1' },
  { key: '0', label: '0' },
  { key: 'ร', label: 'ร' },
  { key: 'มส', label: 'มส' },
]

const SUBJECT_COVER_GRADE_LEVEL_COLUMNS = SUBJECT_COVER_GRADE_COLUMNS.filter(column => column.key !== 'ร' && column.key !== 'มส')
const SUBJECT_COVER_GRADE_RESULT_COLUMNS = SUBJECT_COVER_GRADE_COLUMNS.filter(column => column.key === 'ร' || column.key === 'มส')
const SUBJECT_COVER_GRADE_TABLE_COLS = 1 + SUBJECT_COVER_GRADE_COLUMNS.length + 1

const SUBJECT_COVER_SIGN_DOTS = '............................................................'

function PrintSignatureSlot({
  url,
  fallback = SUBJECT_COVER_SIGN_DOTS,
  asLine = false,
}: {
  url?: string | null
  fallback?: string
  asLine?: boolean
}) {
  if (url) {
    return (
      <span className="print-signature-slot">
        <img src={url} alt="" className="print-signature-img" />
      </span>
    )
  }
  if (asLine) return <div className="report-sign-line" />
  return <>{fallback}</>
}

function gradeBucket(score: ReportScore | null) {
  if (!score) return null
  if (score.result && score.result !== 'เรียน') return '0'
  if (score.grade === null || score.grade === undefined) return null
  return String(score.grade)
}

function subjectGradeBucket(score: ReportScore | null) {
  if (!score) return null
  if (score.result === 'ร') return 'ร'
  if (score.result === 'มส') return 'มส'
  if (score.result && score.result !== 'เรียน') return '0'
  if (score.grade === null || score.grade === undefined) return null
  return String(score.grade)
}

function subjectGradeSummaryForTerm(data: ReportPayload | null, subject: ReportSubject, term: 0 | 1 | 2) {
  const counts = Object.fromEntries(SUBJECT_COVER_GRADE_COLUMNS.map(column => [column.key, 0])) as Record<string, number>
  for (const student of data?.students || []) {
    const score = term === 0
      ? finalScoreForSubject(data, student.id, subject.class_subject_id)
      : scoreForTerm(data, student.id, subject.class_subject_id, term as 1 | 2)
    const bucket = subjectGradeBucket(score)
    if (bucket && bucket in counts) counts[bucket] += 1
  }
  return counts
}

function coverPercent(count: number, total: number) {
  if (total <= 0) return '-'
  return ((count / total) * 100).toFixed(2)
}

function classroomLevelLabel(level: string) {
  const match = level.match(/(\d+)/)
  const digit = match?.[1] || level
  if (/ม\.|มัธยม/i.test(level)) return `มัธยมศึกษาปีที่ ${digit}`
  if (/ป\.|ประถม/i.test(level)) return `ประถมศึกษาปีที่ ${digit}`
  if (level.startsWith('ม')) return `มัธยมศึกษาปีที่ ${digit}`
  return `ประถมศึกษาปีที่ ${digit}`
}

function classroomCoverLine(classroom: ReportClassroom | null | undefined) {
  if (!classroom) return '-'
  return `ชั้น ${classroomLevelLabel(classroom.level)} ห้อง ${classroom.room}`
}

function subjectHourlyClassLine(classroom: ReportClassroom | null | undefined) {
  if (!classroom) return '-'
  const levelType = classroomLevelLabel(classroom.level).split('ปีที่')[0] || 'ประถมศึกษา'
  return `ชั้น${levelType}ปีที่ ${classLabel(classroom)}`
}

function subjectIsElective(subject: ReportSubject | null | undefined) {
  const type = subject?.subject.type || ''
  return /เพิ่มเติม|elective/i.test(type)
}

function CoverFormCheckbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className="pp5-subject-cover-check-item">
      <span className={`pp5-subject-cover-checkbox${checked ? ' is-checked' : ''}`}>
        {checked ? <ReportCheckMark size={10} /> : null}
      </span>
      {label}
    </span>
  )
}

function CoverLabel({ children }: { children: ReactNode }) {
  return <b className="report-cover-label">{children}</b>
}

function CoverValue({ children }: { children: ReactNode }) {
  return <span className="report-cover-value">{children}</span>
}

function SubjectCoverGridRow({
  variant,
  children,
}: {
  variant: 'school' | 'class' | 'primary-meta-subject' | 'primary-meta-row' | 'subject' | 'teacher' | 'homeroom'
  children: ReactNode
}) {
  return (
    <div className={`pp5-subject-cover-grid-row is-${variant}`}>
      {children}
    </div>
  )
}

function SubjectCoverSchoolRow({ data }: { data: ReportPayload | null }) {
  return (
    <SubjectCoverGridRow variant="school">
      <span className="pp5-subject-cover-school-main">
        <CoverLabel>โรงเรียน</CoverLabel>{data?.school?.name || '-'}
        <span className="pp5-subject-cover-school-district">
          <CoverLabel>อำเภอ</CoverLabel>{' '}
          <CoverValue>{data?.school?.district || '-'}</CoverValue>
        </span>
      </span>
      <span className="pp5-subject-cover-school-area">
        <CoverValue>{schoolOfficeLine(data)}</CoverValue>
      </span>
    </SubjectCoverGridRow>
  )
}

function subjectGroupHeadName(data: ReportPayload | null, subjectGroup: string | null | undefined) {
  const group = subjectGroup?.trim()
  if (!group) return '—'
  return data?.subjectGroupHeads?.[group]?.trim() || '—'
}

function subjectGradeSummary(data: ReportPayload | null, subject: ReportSubject) {
  const counts = Object.fromEntries(CLASS_COVER_GRADE_COLUMNS.map(column => [column.key, 0])) as Record<string, number>
  for (const student of data?.students || []) {
    const bucket = gradeBucket(scoreFor(data, student.id, subject.class_subject_id))
    if (bucket && bucket in counts) counts[bucket] += 1
  }
  return counts
}

function evaluationSummary(data: ReportPayload | null, rows: ReportEvaluationRow[], keys: string[]) {
  const out = { total: data?.students.length || 0, excellent: 0, good: 0, pass: 0, fail: 0 }
  for (const student of data?.students || []) {
    const level = levelFromAverage(averageScore(rowFor(rows, student.id), keys))
    if (level === 'ดีเยี่ยม') out.excellent += 1
    else if (level === 'ดี') out.good += 1
    else if (level === 'ผ่าน') out.pass += 1
    else out.fail += 1
  }
  return out
}

function activitySummary(data: ReportPayload | null) {
  const out = { total: data?.students.length || 0, pass: 0, fail: 0 }
  for (const student of data?.students || []) {
    const row = rowFor(data?.evaluations.activities || [], student.id)
    const passed = !!row && ACTIVITY_KEYS.every(key => row[key] === 'ผ่าน')
    if (passed) out.pass += 1
    else out.fail += 1
  }
  return out
}

function schoolOfficeLine(data: ReportPayload | null) {
  const raw = data?.school?.area_office || data?.school?.department || [data?.school?.district, data?.school?.province].filter(Boolean).join(' ') || '-'
  if (raw === '-') return raw
  return expandEducationAreaOffice(raw)
}

function schoolDistrictLine(data: ReportPayload | null) {
  return data?.school?.district ? `อำเภอ ${data.school.district}` : ''
}

function homeroomTeacherLine(classroom: ReportClassroom | null | undefined) {
  return [classroom?.homeroom_teacher_name, classroom?.homeroom_teacher2_name].filter(Boolean).join(' / ') || '-'
}

function SignatureBlock({ data, subject }: { data: ReportPayload | null; subject?: ReportSubject | null }) {
  const sig = data?.documentSignatures
  return (
    <div className="report-sign-grid">
      <div>
        <PrintSignatureSlot url={sig?.teacher} asLine />
        <p>({subject?.teacher_name || '—'})</p>
        <span>ครูผู้สอน</span>
      </div>
      <div>
        <PrintSignatureSlot url={sig?.academic_head} asLine />
        <p>({data?.school?.academic_head_name || '—'})</p>
        <span>หัวหน้าวิชาการ</span>
      </div>
      <div>
        <PrintSignatureSlot url={sig?.director} asLine />
        <p>({directorDisplayName(data?.school)})</p>
        <span>{directorSchoolLine(data?.school)}</span>
      </div>
    </div>
  )
}

function ClassCoverEvaluationBox({
  title,
  summary,
}: {
  title: string
  summary: { total: number; excellent?: number; good?: number; pass: number; fail: number }
}) {
  const columnCount = 3 + ('excellent' in summary ? 1 : 0) + ('good' in summary ? 1 : 0)
  return (
    <table className="pp5-class-cover-mini-table">
      <thead>
        <tr><th colSpan={columnCount}>{title}</th></tr>
        <tr>
          <th>จำนวนนักเรียนทั้งหมด</th>
          {'excellent' in summary && <th>ดีเยี่ยม</th>}
          {'good' in summary && <th>ดี</th>}
          <th>ผ่าน</th>
          <th>ไม่ผ่าน</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{summary.total}</td>
          {'excellent' in summary && <td>{summary.excellent}</td>}
          {'good' in summary && <td>{summary.good}</td>}
          <td>{summary.pass}</td>
          <td>{summary.fail || '-'}</td>
        </tr>
      </tbody>
    </table>
  )
}

function SubjectCoverEvaluationBox({
  title,
  summary,
}: {
  title: string
  summary: { total: number; excellent: number; good: number; pass: number; fail: number }
}) {
  return (
    <table className="pp5-class-cover-mini-table">
      <thead>
        <tr><th colSpan={5}>{title}</th></tr>
        <tr>
          <th>จำนวนนักเรียนทั้งหมด</th>
          <th>ดีเยี่ยม</th>
          <th>ดี</th>
          <th>ผ่าน</th>
          <th>ปรับปรุง</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{summary.total}</td>
          <td>{summary.excellent || '-'}</td>
          <td>{summary.good || '-'}</td>
          <td>{summary.pass || '-'}</td>
          <td>{summary.fail || '-'}</td>
        </tr>
        <tr>
          <td>คิดเป็นร้อยละ</td>
          <td>{coverPercent(summary.excellent, summary.total)}</td>
          <td>{coverPercent(summary.good, summary.total)}</td>
          <td>{coverPercent(summary.pass, summary.total)}</td>
          <td>{coverPercent(summary.fail, summary.total)}</td>
        </tr>
      </tbody>
    </table>
  )
}

function Pp5ClassCoverPage({ data, term, pageNumber }: { data: ReportPayload | null; term: 0 | 1 | 2; pageNumber?: number }) {
  const pageStyle = usePp5PageStyle('coverClass')
  const paddedSubjects: Array<ReportSubject | null> = [...(data?.subjects || [])]
  while (paddedSubjects.length < 13) paddedSubjects.push(null)
  const displayedSubjects = paddedSubjects.slice(0, Math.max(13, data?.subjects.length || 0))
  const studentsTotal = data?.students.length || 0
  const subjectHours = (data?.subjects || []).reduce((sum, subject) => sum + (subject.subject.hours_per_year || 0), 0)
  const activityHours = totalActiveActivityHours(data?.activitySettings || [])
  const hoursPerYear = subjectHours + activityHours
  const character = evaluationSummary(data, data?.evaluations.character || [], CHARACTER_KEYS)
  const reading = evaluationSummary(data, data?.evaluations.reading || [], READING_KEYS)
  const competency = evaluationSummary(data, data?.evaluations.competency || [], COMPETENCY_KEYS)
  const activities = activitySummary(data)
  const homeroomTeacher = homeroomTeacherLine(data?.classroom)
  const viceDirectorName = data?.school?.vice_director_name?.trim()
  const directorSignPosition = directorActingPositionLine(data?.school)

  return (
    <section className="report-page pp5-class-cover-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} />
      <div className="pp5-class-cover-doc-mark">
        <span>ปพ.5</span>
        <span>(รวมวิชา)</span>
      </div>
      <div className="pp5-class-cover-logo" aria-label="โลโก้โรงเรียน">
        {data?.school?.logo_url ? (
          <Image src={data.school.logo_url} alt={`โลโก้โรงเรียน${data.school.name || ''}`} width={88} height={88} unoptimized />
        ) : (
          <span>{data?.school?.name?.slice(0, 2) || 'รร'}</span>
        )}
      </div>
      <header className="pp5-class-cover-header pp5-subject-cover-header">
        <h1>แบบบันทึกผลการเรียนประจำรายวิชา</h1>
        <div className="pp5-subject-cover-info">
          <SubjectCoverSchoolRow data={data} />
          <SubjectCoverGridRow variant="class">
            <span>
              <CoverLabel>ชั้นประถมศึกษาปีที่</CoverLabel>{' '}
              <CoverValue>{classLabel(data?.classroom || null)}</CoverValue>
            </span>
            <span><CoverLabel>ปีการศึกษา</CoverLabel> <CoverValue>{data?.academicYear?.year_be || '-'}</CoverValue></span>
            <span>
              {term === 0
                ? <CoverLabel>สรุปทั้งปี</CoverLabel>
                : <><CoverLabel>ภาคเรียนที่</CoverLabel> <CoverValue>{term}</CoverValue></>}
            </span>
            <span>
              <CoverLabel>เวลาเรียน</CoverLabel>{' '}
              <CoverValue>{hoursPerYear || '-'}</CoverValue>{' '}
              <CoverLabel>ชั่วโมง/ปี</CoverLabel>
            </span>
          </SubjectCoverGridRow>
          <SubjectCoverGridRow variant="homeroom">
            <span><CoverLabel>ครูประจำชั้น</CoverLabel> <CoverValue>{homeroomTeacher}</CoverValue></span>
          </SubjectCoverGridRow>
        </div>
      </header>

      <table className="pp5-class-cover-score-table">
        <thead>
          <tr>
            <th rowSpan={2}>ที่</th>
            <th rowSpan={2}>รหัส<br />วิชา</th>
            <th rowSpan={2}>รายวิชา</th>
            <th rowSpan={2}>จำนวน<br />นักเรียน</th>
            <th colSpan={CLASS_COVER_GRADE_COLUMNS.length}>สรุปผลการเรียน<br /><small>จำนวนนักเรียนที่ได้รับผลการเรียน</small></th>
            <th rowSpan={2} className="pp5-class-cover-note-head">หมายเหตุ</th>
          </tr>
          <tr>
            {CLASS_COVER_GRADE_COLUMNS.map(column => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {displayedSubjects.map((subject, index) => {
            const counts = subject ? subjectGradeSummary(data, subject) : null
            return (
              <tr key={subject?.class_subject_id || `empty-${index}`}>
                <td>{index + 1}</td>
                <td>{subject?.subject.code || ''}</td>
                <td className="text-left">{subject?.subject.name || ''}</td>
                <td>{subject ? studentsTotal : ''}</td>
                {CLASS_COVER_GRADE_COLUMNS.map(column => <td key={column.key}>{counts ? counts[column.key] || '-' : ''}</td>)}
                <td />
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="pp5-class-cover-summary-grid">
        <ClassCoverEvaluationBox title="สรุปผลการประเมินคุณลักษณะอันพึงประสงค์" summary={character} />
        <ClassCoverEvaluationBox title="สรุปผลการประเมินสมรรถนะสำคัญของผู้เรียน" summary={competency} />
        <ClassCoverEvaluationBox title="สรุปผลการประเมินอ่าน คิด วิเคราะห์ เขียน" summary={reading} />
        <ClassCoverEvaluationBox title="สรุปผลการประเมินกิจกรรมพัฒนาผู้เรียน" summary={activities} />
      </div>

      <section className="pp5-class-cover-approval">
        <div className="pp5-class-cover-approval-title">เสนอเพื่อโปรดพิจารณาอนุมัติ</div>
        <div className="pp5-class-cover-signatures">
          <div className="pp5-class-cover-signature-block pp5-class-cover-homeroom">
            <p>ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.homeroom} fallback="..........................................." /></p>
            <b>( {homeroomTeacher} )</b>
            <span>ครูประจำชั้น</span>
          </div>
          <div className="pp5-class-cover-signature-block pp5-class-cover-academic">
            <p>ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.academic_head} fallback="..........................................." /></p>
            <b>( {data?.school?.academic_head_name || '—'} )</b>
            <span>หัวหน้าวิชาการ</span>
          </div>
        </div>
        {viceDirectorName ? (
          <div className="pp5-class-cover-approval-bottom">
            <div className="pp5-class-cover-approval-col-box pp5-class-cover-vice-director">
              <p className="pp5-class-cover-propose-line">เสนอเพื่อพิจารณา</p>
              <p>ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.vice_director} fallback="..........................................." /></p>
              <b>( {viceDirectorName} )</b>
              <span>รองผู้อำนวยการโรงเรียน{data?.school?.name || '-'}</span>
            </div>
            <div className="pp5-class-cover-approval-col-box pp5-class-cover-director">
              <div className="pp5-class-cover-approval-options">
                <label><span className="pp5-class-cover-checkbox" /> ไม่อนุมัติ</label>
                <label><span className="pp5-class-cover-checkbox" /> อนุมัติ เมื่อวันที่...........................................</label>
              </div>
              <div className="pp5-class-cover-director-signature">
                <p className="pp5-class-cover-director-sign-line">ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.director} fallback="..........................................." /></p>
                <b>( {directorDisplayName(data?.school)} )</b>
                {directorSignPosition && <span>{directorSignPosition}</span>}
                <span>{directorSchoolLine(data?.school)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="pp5-class-cover-director-box-full">
            <div className="pp5-class-cover-approval-options pp5-class-cover-approval-options-full">
              <label><span className="pp5-class-cover-checkbox" /> อนุมัติ</label>
              <label><span className="pp5-class-cover-checkbox" /> ไม่อนุมัติ</label>
            </div>
            <div className="pp5-class-cover-director-main">
              <p className="pp5-class-cover-director-sign-line">ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.director} /></p>
              <b>( {directorDisplayName(data?.school)} )</b>
              {directorSignPosition && <span>{directorSignPosition}</span>}
              <span>{directorSchoolLine(data?.school)}</span>
              <span className="pp5-class-cover-verify-date">............ / ............ / ............</span>
            </div>
            <div className="pp5-class-cover-qr-block" aria-hidden="true">
              <div className="pp5-class-cover-qr-placeholder" />
              <span>ตรวจสอบเอกสาร</span>
              <small>Digital Reference</small>
            </div>
          </div>
        )}
      </section>
    </section>
  )
}

function Pp5SubjectCoverPage({
  data,
  subject,
  term,
  pageNumber,
}: {
  data: ReportPayload | null
  subject: ReportSubject | null
  term: 0 | 1 | 2
  pageNumber?: number
}) {
  const pageStyle = usePp5PageStyle('coverSubject')
  const studentsTotal = data?.students.length || 0
  const activeTerm = (term === 0 ? 1 : term) as 1 | 2
  const range = termDateRange(data?.academicYear || null, activeTerm)
  const weeks = buildTeachingWeeks(range.start, range.end, reportSchoolCalendar(data))
  const hoursWeek = subject ? hoursPerWeek(subject.subject.hours_per_year || 0, weeks.length) : 0
  const gradeCounts = subject ? subjectGradeSummaryForTerm(data, subject, term) : null
  const character = evaluationSummary(data, data?.evaluations.character || [], CHARACTER_KEYS)
  const reading = evaluationSummary(data, data?.evaluations.reading || [], READING_KEYS)
  const homeroomTeacher = homeroomTeacherLine(data?.classroom)
  const teacherName = subject?.teacher_name || '—'
  const directorSignPosition = directorActingPositionLine(data?.school)
  const viceDirectorName = data?.school?.vice_director_name?.trim()
  const subjectGroupHead = subjectGroupHeadName(data, subject?.subject.subject_group)
  const subjectGroupHeadLine = subjectGroupHeadPositionLine(subject?.subject.subject_group)
  const isPrimary = isPrimaryClassLevel(data?.classroom?.level)
  const isSecondary = isSecondaryClassLevel(data?.classroom?.level)
  const isElective = subjectIsElective(subject)

  return (
    <section className="report-page pp5-subject-cover-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={PP5_SUBJECT_PAGE_MARK} />
      <div className="pp5-subject-cover-doc-mark">
        <span>ปพ.5</span>
        <span>{PP5_SUBJECT_PAGE_MARK}</span>
      </div>
      <div className="pp5-subject-cover-logo" aria-label="โลโก้โรงเรียน">
        {data?.school?.logo_url ? (
          <Image src={data.school.logo_url} alt={`โลโก้โรงเรียน${data.school.name || ''}`} width={88} height={88} unoptimized />
        ) : (
          <span>{data?.school?.name?.slice(0, 2) || 'รร'}</span>
        )}
      </div>
      <header className="pp5-subject-cover-header">
        <h1>แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน</h1>
        <div className="pp5-subject-cover-info">
          <SubjectCoverSchoolRow data={data} />
          <SubjectCoverGridRow variant="class">
            <span>
              <CoverLabel>ชั้น</CoverLabel>{' '}
              <CoverValue>{data?.classroom ? classroomLevelLabel(data.classroom.level) : '-'}</CoverValue>
              {' '}<CoverLabel>ห้อง</CoverLabel>{' '}
              <CoverValue>{data?.classroom?.room || '-'}</CoverValue>
            </span>
            <span>
              {term === 0
                ? <CoverLabel>สรุปทั้งปี</CoverLabel>
                : <><CoverLabel>ภาคเรียนที่</CoverLabel> <CoverValue>{term}</CoverValue></>}
            </span>
            <span><CoverLabel>ปีการศึกษา</CoverLabel> <CoverValue>{data?.academicYear?.year_be || '-'}</CoverValue></span>
            <span><CoverLabel>เวลาเรียน</CoverLabel> <CoverValue>{hoursWeek || '-'}</CoverValue> ชม./สัปดาห์</span>
          </SubjectCoverGridRow>
          {isPrimary && (
            <>
              <SubjectCoverGridRow variant="primary-meta-subject">
                <span><CoverLabel>กลุ่มสาระการเรียนรู้</CoverLabel> <CoverValue>{subject?.subject.subject_group || '-'}</CoverValue></span>
                <span className="pp5-subject-cover-meta-part pp5-subject-cover-meta-part-right">
                  <CoverLabel>สาระการเรียนรู้</CoverLabel>
                  <CoverFormCheckbox checked={!isElective} label="พื้นฐาน" />
                  <CoverFormCheckbox checked={isElective} label="เพิ่มเติม" />
                </span>
              </SubjectCoverGridRow>
              <SubjectCoverGridRow variant="primary-meta-row">
                <span className="pp5-subject-cover-primary-meta-row is-level-row">
                  <span className="pp5-subject-cover-meta-part">
                    <CoverLabel>ระดับชั้น</CoverLabel>
                    <CoverFormCheckbox checked={isPrimary} label="ประถมศึกษา" />
                    <CoverFormCheckbox checked={isSecondary} label="มัธยมศึกษา" />
                  </span>
                </span>
              </SubjectCoverGridRow>
            </>
          )}
          <SubjectCoverGridRow variant="subject">
            <span>
              <CoverLabel>รายวิชา</CoverLabel>{' '}
              <CoverValue>{subject?.subject.name || '-'}</CoverValue>
              {' '}(<CoverValue>{subject?.subject.code || '-'}</CoverValue>)
            </span>
            <span><CoverLabel>หน่วยกิต</CoverLabel> <CoverValue>{subject?.subject.credits ?? '-'}</CoverValue> หน่วย</span>
          </SubjectCoverGridRow>
          <SubjectCoverGridRow variant="teacher">
            <span><CoverLabel>ครูผู้สอน</CoverLabel> <CoverValue>{teacherName}</CoverValue></span>
            <span><CoverLabel>ครูที่ปรึกษา</CoverLabel> <CoverValue>{homeroomTeacher}</CoverValue></span>
          </SubjectCoverGridRow>
        </div>
      </header>

      <table className="pp5-class-cover-mini-table pp5-subject-cover-grade-table">
        <thead>
          <tr>
            <th colSpan={SUBJECT_COVER_GRADE_TABLE_COLS} className="pp5-subject-cover-grade-banner">สรุปผลการเรียน</th>
          </tr>
          <tr>
            <th rowSpan={2}>จำนวนนักเรียน<br />ทั้งหมด</th>
            <th colSpan={SUBJECT_COVER_GRADE_LEVEL_COLUMNS.length}>ระดับผลการเรียน</th>
            <th colSpan={SUBJECT_COVER_GRADE_RESULT_COLUMNS.length}>ผลการเรียน</th>
            <th rowSpan={2}>หมายเหตุ</th>
          </tr>
          <tr>
            {SUBJECT_COVER_GRADE_LEVEL_COLUMNS.map(column => <th key={column.key}>{column.label}</th>)}
            {SUBJECT_COVER_GRADE_RESULT_COLUMNS.map(column => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{studentsTotal}</td>
            {SUBJECT_COVER_GRADE_COLUMNS.map(column => (
              <td key={column.key}>{gradeCounts ? (gradeCounts[column.key] || '-') : ''}</td>
            ))}
            <td />
          </tr>
          <tr>
            <td>คิดเป็นร้อยละ</td>
            {SUBJECT_COVER_GRADE_COLUMNS.map(column => (
              <td key={`pct-${column.key}`}>
                {gradeCounts ? coverPercent(gradeCounts[column.key] || 0, studentsTotal) : ''}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>

      <div className="pp5-subject-cover-summary-grid">
        <SubjectCoverEvaluationBox title="สรุปผลการประเมินคุณลักษณะอันพึงประสงค์" summary={character} />
        <SubjectCoverEvaluationBox title="สรุปผลการประเมินอ่าน คิด วิเคราะห์เขียน" summary={reading} />
      </div>

      <section className="pp5-subject-cover-approval">
        <div className="pp5-subject-cover-approval-title">การตรวจสอบและอนุมัติผลการเรียน</div>
        <div className="pp5-subject-cover-signatures">
          <div className="pp5-subject-cover-signature-block">
            <p>ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.teacher} /></p>
            <b>( {teacherName} )</b>
            <span>ครูผู้สอน</span>
          </div>
          <div className="pp5-subject-cover-signature-block">
            <p>ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.subject_head} /></p>
            <b>( {subjectGroupHead} )</b>
            <span>{subjectGroupHeadLine}</span>
          </div>
          <div className="pp5-subject-cover-signature-block">
            <p>ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.measurement_head} /></p>
            <b>( {data?.school?.measurement_head_name || '—'} )</b>
            <span>หัวหน้างานวัดและประเมินผล</span>
          </div>
          <div className="pp5-subject-cover-signature-block">
            <p>ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.academic_head} /></p>
            <b>( {data?.school?.academic_head_name || '—'} )</b>
            <span>หัวหน้าฝ่ายวิชาการ</span>
          </div>
        </div>
        {viceDirectorName ? (
          <div className="pp5-subject-cover-approval-bottom">
            <div className="pp5-subject-cover-approval-col-box pp5-subject-cover-vice-director">
              <p className="pp5-subject-cover-propose-line">เสนอเพื่อพิจารณา</p>
              <p>ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.vice_director} /></p>
              <b>( {viceDirectorName} )</b>
              <span>รองผู้อำนวยการโรงเรียน{data?.school?.name || '-'}</span>
            </div>
            <div className="pp5-subject-cover-approval-col-box pp5-subject-cover-director">
              <div className="pp5-subject-cover-approval-options pp5-subject-cover-approval-options-split">
                <label><span className="pp5-subject-cover-checkbox" /> ไม่อนุมัติ</label>
                <label><span className="pp5-subject-cover-checkbox" /> อนุมัติ เมื่อวันที่...........................................</label>
              </div>
              <div className="pp5-subject-cover-director-signature">
                <p className="pp5-subject-cover-director-sign">ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.director} /></p>
                <b>( {directorDisplayName(data?.school)} )</b>
                {directorSignPosition && <span>{directorSignPosition}</span>}
                <span>{directorSchoolLine(data?.school)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="pp5-subject-cover-director-box">
            <div className="pp5-subject-cover-approval-options">
              <label><span className="pp5-subject-cover-checkbox" /> อนุมัติ</label>
              <label><span className="pp5-subject-cover-checkbox" /> ไม่อนุมัติ</label>
            </div>
            <div className="pp5-subject-cover-director-main">
              <p className="pp5-subject-cover-director-sign">ลงชื่อ <PrintSignatureSlot url={data?.documentSignatures?.director} /></p>
              <b>( {directorDisplayName(data?.school)} )</b>
              {directorSignPosition && <span>{directorSignPosition}</span>}
              <span>{directorSchoolLine(data?.school)}</span>
              <span className="pp5-subject-cover-verify-date">............ / ............ / ............</span>
            </div>
            <div className="pp5-subject-cover-qr-block" aria-hidden="true">
              <div className="pp5-subject-cover-qr-placeholder" />
              <span>ตรวจสอบเอกสาร</span>
              <small>Digital Reference</small>
            </div>
          </div>
        )}
      </section>
    </section>
  )
}

function CoverPage({ data, mode, subject, term, pageNumber }: { data: ReportPayload | null; mode: ReportMode; subject: ReportSubject | null; term: 0 | 1 | 2; pageNumber?: number }) {
  if (mode === 'pp5-class') return <Pp5ClassCoverPage data={data} term={term} pageNumber={pageNumber} />
  if (mode === 'pp5-subject') return <Pp5SubjectCoverPage data={data} subject={subject} term={term} pageNumber={pageNumber} />

  const title = 'แบบบันทึกผลการเรียนประจำชั้น (ปพ.5)'
  return (
    <section className="report-page report-cover-page">
      <ReportPageNumber value={pageNumber} />
      <div className="report-cover-mark">ปพ.5</div>
      <h1>{title}</h1>
      <h2>โรงเรียน{data?.school?.name || '-'}</h2>
      <div className="report-cover-info">
        {mode === 'pp5-subject' ? (
          <>
            <div><b>รายวิชา</b><span>{subject?.subject.name || '-'}</span></div>
            <div><b>รหัสวิชา</b><span>{subject?.subject.code || '-'}</span></div>
            <div><b>กลุ่มสาระ</b><span>{subject?.subject.subject_group || '-'}</span></div>
            <div><b>ครูผู้สอน</b><span>{subject?.teacher_name || '-'}</span></div>
          </>
        ) : (
          <>
            <div><b>ชั้นเรียน</b><span>{classLabel(data?.classroom || null)}</span></div>
            <div><b>จำนวนรายวิชา</b><span>{data?.subjects.length || 0} วิชา</span></div>
            <div><b>จำนวนนักเรียน</b><span>{data?.students.length || 0} คน</span></div>
            <div><b>รูปแบบ</b><span>รวมทุกวิชาและทุกการประเมิน</span></div>
          </>
        )}
        <div><b>ปีการศึกษา</b><span>{data?.academicYear?.year_be || '-'}</span></div>
        <div><b>ภาคเรียน</b><span>{term}</span></div>
      </div>
      <div className="report-cover-summary">
        <div>สรุปเวลาเรียน</div>
        <div>ผลการเรียนรายวิชา</div>
        <div>คุณลักษณะ · อ่านคิดเขียน · สมรรถนะ</div>
      </div>
      <SignatureBlock data={data} subject={subject} />
    </section>
  )
}

function hourlyStatusCellContent(status: HourlyStatus | undefined) {
  if (status === undefined) return ''
  if (status === '/') return '/'
  return status
}

function studentHourlySummary(
  weeks: ReturnType<typeof subjectHourlyTermWeeks>,
  dataSlotsPerWeek: number,
  recordMap: Map<string, HourlyStatus>,
  studentId: string,
) {
  const statuses: HourlyStatus[] = []
  for (const week of weeks) {
    for (let slot = 1; slot <= dataSlotsPerWeek; slot += 1) {
      const key = hourlyCellKey(studentId, week.weekNumber, slot)
      const status = recordMap.get(key)
      if (status !== undefined) statuses.push(status)
    }
  }
  return summarizeHourlyStatuses(statuses)
}

function studentSecondaryHourlySummary(
  weeks: SubjectCalendarWeek[],
  recordMap: Map<string, HourlyStatus>,
  studentId: string,
) {
  const statuses: HourlyStatus[] = []
  for (const week of weeks) {
    for (const day of week.days) {
      if (!day.slotInWeek) continue
      const status = recordMap.get(hourlyCellKey(studentId, week.weekNumber, day.slotInWeek))
      if (status !== undefined) statuses.push(status)
    }
  }
  return summarizeHourlyStatuses(statuses)
}

function subjectWeekMonthLabel(week: SubjectCalendarWeek) {
  const months = [...new Set(week.days.map(day => day.date.getMonth()))]
  return months.length === 1
    ? THAI_MONTH_SHORT[months[0]]
    : months.map(month => THAI_MONTH_SHORT[month]).join('-')
}

function hourlyExamEligibility(percent: number) {
  return percent >= 80 ? 'มี' : 'ไม่มี'
}

function SubjectPrimaryHourlyAttendancePage({
  data,
  subject,
  term,
  pageWeeks,
  allWeeks,
  showSummary,
  pageNumber,
  slotsPerWeek,
  dataSlotsPerWeek,
  recordMap,
  students,
}: {
  data: ReportPayload | null
  subject: ReportSubject
  term: 1 | 2
  pageWeeks: ReturnType<typeof subjectHourlyTermWeeks>
  allWeeks: ReturnType<typeof subjectHourlyTermWeeks>
  showSummary: boolean
  pageNumber: number
  slotsPerWeek: number
  dataSlotsPerWeek: number
  recordMap: Map<string, HourlyStatus>
  students: ReportStudent[]
}) {
  const layout = usePp5SectionLayout('attendance')
  const pageStyle = usePp5PageStyle('attendance')
  const rowCount = pp5AttendanceBodyRows(students.length, layout, 3)

  return (
    <section className="report-page pp5-body-page pp5-attendance-month-page pp5-subject-hourly-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={PP5_SUBJECT_PAGE_MARK} />
      <header className="pp5-subject-hourly-head">
        <h1>แบบบันทึกเวลาเรียนรายวิชา {subjectHourlyClassLine(data?.classroom)} ภาคเรียนที่ {term}</h1>
        <p>
          รหัสวิชา <b>{subject.subject.code}</b>
          {' '}รายวิชา <b>{subject.subject.name}</b>
          {' '}ปีการศึกษา <b>{data?.academicYear?.year_be || '-'}</b>
        </p>
      </header>
      <table className="pp5-attendance-table pp5-subject-hourly-table" style={pp5AttendanceTableStyle(rowCount)}>
        <colgroup>
          <col className="pp5-subject-hourly-no-col" />
          <col className="pp5-subject-hourly-code-col" />
          <col className="pp5-subject-hourly-name-col" />
          {pageWeeks.flatMap(week => (
            Array.from({ length: slotsPerWeek }, (_, i) => (
              <col key={`${week.weekNumber}-${i}`} className="pp5-subject-hourly-slot-col" />
            ))
          ))}
          {showSummary ? (
            <>
              <col className="pp5-subject-hourly-summary-col" />
              <col className="pp5-subject-hourly-summary-col" />
              <col className="pp5-subject-hourly-summary-col" />
              <col className="pp5-subject-hourly-summary-col" />
            </>
          ) : null}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={3} className="pp5-subject-hourly-fixed-head pp5-subject-hourly-no-head">
              <span className="pp5-subject-hourly-head-label is-vertical">เลขที่</span>
            </th>
            <th rowSpan={3} className="pp5-subject-hourly-fixed-head pp5-subject-hourly-code-head">
              <span className="pp5-subject-hourly-head-label is-stacked">
                <span>เลข</span>
                <span>ประจำตัว</span>
              </span>
            </th>
            <th rowSpan={3} className="pp5-subject-hourly-fixed-head pp5-subject-hourly-name-head">
              <span className="pp5-subject-hourly-head-label">ชื่อ - สกุล</span>
            </th>
            {pageWeeks.map(week => (
              <th key={week.weekNumber} colSpan={slotsPerWeek} className="pp5-subject-hourly-week">สัปดาห์ที่ {week.weekNumber}</th>
            ))}
            {showSummary ? (
              <th colSpan={4} className="pp5-subject-hourly-summary-head pp5-subject-hourly-summary-title">สรุป (รวมทั้งภาค)</th>
            ) : null}
          </tr>
          <tr>
            {pageWeeks.map(week => (
              <th key={`date-${week.weekNumber}`} colSpan={slotsPerWeek} className="pp5-subject-hourly-date">{week.dateLabel}</th>
            ))}
            {showSummary ? (
              <>
                <th rowSpan={2} className="pp5-subject-hourly-summary-head">มา</th>
                <th rowSpan={2} className="pp5-subject-hourly-summary-head">ขาด</th>
                <th rowSpan={2} className="pp5-subject-hourly-summary-head">ลา</th>
                <th rowSpan={2} className="pp5-subject-hourly-summary-head">ร้อยละ</th>
              </>
            ) : null}
          </tr>
          <tr>
            {pageWeeks.map(week => (
              Array.from({ length: slotsPerWeek }, (_, i) => (
                <th key={`slot-${week.weekNumber}-${i + 1}`} className="pp5-subject-hourly-slot">
                  {primaryGlobalSlotNumber(week.weekNumber, i + 1)}
                </th>
              ))
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, index) => {
            const student = students[index]
            const summary = showSummary && student
              ? studentHourlySummary(allWeeks, dataSlotsPerWeek, recordMap, student.id)
              : null
            return (
              <tr key={student?.id || `empty-${index}`}>
                <td className="pp5-subject-hourly-no">{student ? student.student_number || index + 1 : ''}</td>
                <td className="pp5-subject-hourly-code">{student?.student_code || ''}</td>
                <td className="pp5-subject-hourly-name text-left">{student ? studentName(student) : ''}</td>
                {pageWeeks.map(week => (
                  Array.from({ length: slotsPerWeek }, (_, i) => {
                    const slot = i + 1
                    if (!student) {
                      return <td key={`empty-${index}-${week.weekNumber}-${slot}`} className="pp5-subject-hourly-cell" />
                    }
                    const status = recordMap.get(hourlyCellKey(student.id, week.weekNumber, slot))
                    if (status === undefined) {
                      return <td key={`${student.id}-${week.weekNumber}-${slot}`} className="pp5-subject-hourly-cell" />
                    }
                    return (
                      <td
                        key={`${student.id}-${week.weekNumber}-${slot}`}
                        className={`pp5-subject-hourly-cell${status === '/' ? ' is-present' : ''}`}
                        title={status === '/' ? 'มา' : undefined}
                      >
                        {hourlyStatusCellContent(status)}
                      </td>
                    )
                  })
                ))}
                {showSummary && summary ? (
                  <>
                    <td className="pp5-subject-hourly-summary">{summary.present}</td>
                    <td className="pp5-subject-hourly-summary">{summary.absent}</td>
                    <td className="pp5-subject-hourly-summary">{summary.leave + summary.sick}</td>
                    <td className="pp5-subject-hourly-summary">{summary.percent.toFixed(1)}</td>
                  </>
                ) : showSummary ? (
                  <>
                    <td className="pp5-subject-hourly-summary" />
                    <td className="pp5-subject-hourly-summary" />
                    <td className="pp5-subject-hourly-summary" />
                    <td className="pp5-subject-hourly-summary" />
                  </>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function SubjectSecondaryHourlyAttendancePage({
  data,
  subject,
  term,
  pageWeeks,
  allWeeks,
  showSummary,
  pageNumber,
  totalHours,
  recordMap,
  students,
}: {
  data: ReportPayload | null
  subject: ReportSubject
  term: 1 | 2
  pageWeeks: SubjectCalendarWeek[]
  allWeeks: SubjectCalendarWeek[]
  showSummary: boolean
  pageNumber: number
  totalHours: number
  recordMap: Map<string, HourlyStatus>
  students: ReportStudent[]
}) {
  const layout = usePp5SectionLayout('attendance')
  const pageStyle = usePp5PageStyle('attendance')
  const columns = pageWeeks.flatMap(week => week.days)
  const weekStartKeys = new Set(pageWeeks.map(week => week.days[0]?.iso).filter(Boolean))
  const rowCount = pp5AttendanceBodyRows(students.length, layout, 5)

  return (
    <section className="report-page pp5-body-page pp5-attendance-month-page pp5-subject-hourly-secondary-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={PP5_SUBJECT_PAGE_MARK} />
      <header className="pp5-attendance-head">
        <h1>บันทึกเวลาเรียน ภาคเรียนที่ {term}</h1>
        <p className="pp5-attendance-class-line">
          ชั้น <b>{classroomLevelLabel(data?.classroom?.level || '')}</b>
          {' '}ห้อง <b>{data?.classroom?.room || '-'}</b>
          {' '}ภาคเรียนที่ <b>{term}</b>
          {' '}ปีการศึกษา <b>{data?.academicYear?.year_be || '-'}</b>
        </p>
      </header>
      <table className="pp5-attendance-table pp5-subject-hourly-secondary-table" style={pp5AttendanceTableStyle(rowCount)}>
        <thead>
          <tr className="pp5-attendance-week-row">
            <th rowSpan={5} className="pp5-attendance-number-col pp5-attendance-vertical">เลขที่</th>
            <th rowSpan={5} className="pp5-attendance-code-col pp5-attendance-vertical">เลขประจำตัว</th>
            <th rowSpan={5} className="pp5-attendance-name-col">ชื่อ - นามสกุล</th>
            <th className="pp5-attendance-row-label">สัปดาห์</th>
            {pageWeeks.map(week => (
              <th key={week.weekNumber} colSpan={week.days.length} className="pp5-attendance-week-group">{week.weekNumber}</th>
            ))}
            {showSummary ? (
              <>
                <th rowSpan={5} colSpan={2} className="pp5-subject-hourly-sec-summary-head">เวลาเรียนทั้งหมด<br />{totalHours} ชั่วโมง</th>
                <th rowSpan={5} className="pp5-subject-hourly-sec-summary-head">มาเรียน</th>
                <th rowSpan={5} className="pp5-subject-hourly-sec-summary-head">ร้อยละ</th>
              </>
            ) : null}
          </tr>
          <tr className="pp5-attendance-month-row">
            <th className="pp5-attendance-row-label">เดือน</th>
            {pageWeeks.map(week => (
              <th key={`month-${week.weekNumber}`} colSpan={week.days.length} className="pp5-attendance-week-group">{subjectWeekMonthLabel(week)}</th>
            ))}
          </tr>
          <tr className="pp5-attendance-day-row">
            <th className="pp5-attendance-row-label">วัน</th>
            {columns.map(day => (
              <th
                key={`day-${day.iso}`}
                className={`${weekStartKeys.has(day.iso) ? 'week-start' : ''} ${day.isWeekend ? 'is-weekend' : ''} ${day.isHoliday ? 'is-holiday' : ''}`}
              >
                {THAI_WEEKDAYS[day.dayOfWeek]}
              </th>
            ))}
          </tr>
          <tr className="pp5-attendance-date-row">
            <th className="pp5-attendance-row-label">วันที่</th>
            {columns.map(day => (
              <th
                key={`date-${day.iso}`}
                className={`${weekStartKeys.has(day.iso) ? 'week-start' : ''} ${day.isWeekend ? 'is-weekend' : ''} ${day.isHoliday ? 'is-holiday' : ''}`}
              >
                {day.dayNumber}
              </th>
            ))}
          </tr>
          <tr className="pp5-attendance-hour-row">
            <th className="pp5-attendance-row-label">ชั่วโมงที่</th>
            {columns.map(day => (
              <th
                key={`hour-${day.iso}`}
                className={`${weekStartKeys.has(day.iso) ? 'week-start' : ''} ${day.isWeekend ? 'is-weekend' : ''} ${day.isHoliday ? 'is-holiday' : ''}`}
              >
                {day.hourNumber || ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, index) => {
            const student = students[index]
            const summary = showSummary && student
              ? studentSecondaryHourlySummary(allWeeks, recordMap, student.id)
              : null
            return (
              <tr key={student?.id || `empty-${index}`}>
                <td>{student ? student.student_number || index + 1 : ''}</td>
                <td>{student?.student_code || ''}</td>
                <td className="text-left">{student ? studentName(student) : ''}</td>
                <td className="pp5-attendance-row-label" />
                {columns.map(day => {
                  if (day.isWeekend) {
                    if (index > 0) return null
                    return (
                      <td key={`${student?.id || 'empty'}-${day.iso}`} rowSpan={rowCount} className="is-weekend pp5-subject-hourly-weekend-cell">
                        <span className="pp5-attendance-vertical">วันหยุดเสาร์-อาทิตย์</span>
                      </td>
                    )
                  }
                  if (day.isHoliday && !day.slotInWeek) {
                    if (index > 0) return null
                    return (
                      <td key={`${student?.id || 'empty'}-${day.iso}`} rowSpan={rowCount} className="is-holiday pp5-subject-hourly-holiday-cell">
                        <span className="pp5-attendance-vertical">{day.holidayLabel || 'วันหยุด'}</span>
                      </td>
                    )
                  }
                  if (!day.slotInWeek) {
                    return <td key={`${student?.id || 'empty'}-${day.iso}`} className={`${day.isHoliday ? 'is-holiday' : ''}`} />
                  }
                  if (!student) {
                    return <td key={`empty-${index}-${day.iso}`} className={`${weekStartKeys.has(day.iso) ? 'week-start' : ''}`} />
                  }
                  const status = recordMap.get(hourlyCellKey(student.id, day.weekNumber, day.slotInWeek))
                  return (
                    <td
                      key={`${student.id}-${day.iso}`}
                      className={`${weekStartKeys.has(day.iso) ? 'week-start' : ''} ${status === 'ข' || status === 'ป' || status === 'ล' ? 'is-absence' : ''} ${status === '/' ? 'is-present' : ''}`}
                      title={status === '/' ? 'มา' : undefined}
                    >
                      {hourlyStatusCellContent(status)}
                    </td>
                  )
                })}
                {showSummary && summary ? (
                  <>
                    <td colSpan={2} className="pp5-subject-hourly-sec-summary" />
                    <td className="pp5-subject-hourly-sec-summary">{summary.present}</td>
                    <td className="pp5-subject-hourly-sec-summary">{Math.round(summary.percent)}</td>
                  </>
                ) : showSummary ? (
                  <>
                    <td colSpan={2} className="pp5-subject-hourly-sec-summary" />
                    <td className="pp5-subject-hourly-sec-summary" />
                    <td className="pp5-subject-hourly-sec-summary" />
                  </>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function SubjectHourlySummaryPage({
  data,
  subject,
  classSubjectId,
  term,
  pageNumber,
}: {
  data: ReportPayload | null
  subject: ReportSubject | null
  classSubjectId?: string
  term: 1 | 2
  pageNumber?: number
}) {
  const range = termDateRange(data?.academicYear || null, term)
  const calendar = reportSchoolCalendar(data)
  const subjectId = subject?.class_subject_id || classSubjectId || ''
  const recordMap = buildHourlyStatusMap(data?.hourlyAttendanceRecords, subjectId, term)
  const students = data?.students || []
  const isSecondary = isSecondaryClassLevel(data?.classroom?.level)

  const teachingWeeks = subjectHourlyTermWeeks(range.start, range.end, calendar)
  const hpw = subjectHourlyHpw(subject?.subject.hours_per_year || 0, teachingWeeks)

  if (!subject || teachingWeeks.length === 0) return null

  const secondaryCalendar = isSecondary
    ? buildSubjectCalendarWeeks(range.start, range.end, calendar, hpw, holidayNameMap(data?.holidays))
    : null
  const layout = usePp5SectionLayout('attendance')
  const pageStyle = usePp5PageStyle('attendance')
  const primaryWeeks = teachingWeeks
  const slotsPerWeek = displaySlotsPerWeek(true, hpw)
  const totalHours = isSecondary ? (secondaryCalendar?.totalHours || 0) : 0
  const rowCount = pp5AttendanceBodyRows(students.length, layout, 1)

  return (
    <section className="report-page pp5-body-page pp5-attendance-month-page pp5-subject-hourly-summary-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={PP5_SUBJECT_PAGE_MARK} />
      <header className="pp5-subject-hourly-head">
        <h1>สรุปเวลาเรียนรายวิชา {isSecondary ? (
          <>ชั้น <b>{classroomLevelLabel(data?.classroom?.level || '')}</b> ห้อง <b>{data?.classroom?.room || '-'}</b></>
        ) : subjectHourlyClassLine(data?.classroom)} ภาคเรียนที่ {term}</h1>
        <p>
          รหัสวิชา <b>{subject.subject.code}</b>
          {' '}รายวิชา <b>{subject.subject.name}</b>
          {' '}ภาคเรียนที่ <b>{term}</b>
          {' '}ปีการศึกษา <b>{data?.academicYear?.year_be || '-'}</b>
          {isSecondary && totalHours > 0 ? (
            <>{' '}<span>เวลาเรียนทั้งหมด <b>{totalHours}</b> ชั่วโมง</span></>
          ) : null}
        </p>
      </header>
      <table className="pp5-attendance-table pp5-subject-hourly-table pp5-subject-hourly-summary-table" style={pp5AttendanceTableStyle(rowCount)}>
        <colgroup>
          <col className="pp5-subject-hourly-no-col" />
          <col className="pp5-subject-hourly-summary-code-col" />
          <col className="pp5-subject-hourly-name-col" />
          <col className="pp5-subject-hourly-summary-col" />
          <col className="pp5-subject-hourly-summary-col" />
          <col className="pp5-subject-hourly-summary-col" />
          <col className="pp5-subject-hourly-summary-col" />
          <col className="pp5-subject-hourly-summary-col" />
          <col className="pp5-subject-hourly-summary-col" />
        </colgroup>
        <thead>
          <tr>
            <th className="pp5-subject-hourly-fixed-head pp5-subject-hourly-summary-id-head">เลขที่</th>
            <th className="pp5-subject-hourly-fixed-head pp5-subject-hourly-summary-id-head">รหัสประจำตัว</th>
            <th className="pp5-subject-hourly-fixed-head pp5-subject-hourly-summary-id-head">ชื่อ - สกุล</th>
            <th className="pp5-subject-hourly-week pp5-subject-hourly-summary-metric-head">{isSecondary ? 'มาเรียน' : 'มา'}</th>
            <th className="pp5-subject-hourly-week pp5-subject-hourly-summary-metric-head">ขาด</th>
            <th className="pp5-subject-hourly-week pp5-subject-hourly-summary-metric-head">ลา</th>
            <th className="pp5-subject-hourly-week pp5-subject-hourly-summary-metric-head">เต็ม</th>
            <th className="pp5-subject-hourly-week pp5-subject-hourly-summary-metric-head">%</th>
            <th className="pp5-subject-hourly-week pp5-subject-hourly-summary-metric-head">สิทธิ์สอบ</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, index) => {
            const student = students[index]
            const summary = student
              ? (isSecondary && secondaryCalendar
                ? studentSecondaryHourlySummary(secondaryCalendar.weeks, recordMap, student.id)
                : studentHourlySummary(primaryWeeks, hpw, recordMap, student.id))
              : null
            const fullHours = summary ? (isSecondary ? totalHours : summary.total) : null
            return (
              <tr key={student?.id || `empty-${index}`}>
                <td className="pp5-subject-hourly-no">{student ? student.student_number || index + 1 : ''}</td>
                <td className="pp5-subject-hourly-summary">{student?.student_code || ''}</td>
                <td className="pp5-subject-hourly-name text-left">{student ? studentName(student) : ''}</td>
                <td className="pp5-subject-hourly-summary">{summary ? summary.present : ''}</td>
                <td className="pp5-subject-hourly-summary">{summary ? summary.absent : ''}</td>
                <td className="pp5-subject-hourly-summary">{summary ? summary.leave + summary.sick : ''}</td>
                <td className="pp5-subject-hourly-summary">{summary ? fullHours : ''}</td>
                <td className="pp5-subject-hourly-summary">
                  {summary ? (isSecondary ? Math.round(summary.percent) : summary.percent.toFixed(1)) : ''}
                </td>
                <td className="pp5-subject-hourly-summary">{summary ? hourlyExamEligibility(summary.percent) : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function SubjectHourlyAttendancePages({
  data,
  subject,
  classSubjectId,
  term,
  pageStart = 1,
}: {
  data: ReportPayload | null
  subject: ReportSubject | null
  classSubjectId?: string
  term: 1 | 2
  pageStart?: number
}) {
  const pageStyle = usePp5PageStyle('attendance')
  const range = termDateRange(data?.academicYear || null, term)
  const calendar = reportSchoolCalendar(data)
  const subjectId = subject?.class_subject_id || classSubjectId || ''
  const recordMap = buildHourlyStatusMap(data?.hourlyAttendanceRecords, subjectId, term)
  const students = data?.students || []
  const studentChunks = chunkStudentsForPrintPages(students)
  const studentPageCount = studentChunks.length
  const isSecondary = isSecondaryClassLevel(data?.classroom?.level)

  if (!subject) {
    return withStudentChunks(data, (pageData, pageIndex) => (
      <section key={`subject-hourly-empty-${term}-${pageIndex}`} className="report-page pp5-body-page pp5-subject-hourly-page" style={pageStyle}>
        <ReportPageNumber value={pageStart + pageIndex} mark={PP5_SUBJECT_PAGE_MARK} />
        <HeaderLine data={pageData} title="แบบบันทึกเวลาเรียนรายวิชา" term={term} />
        <p className="report-empty-inline">ยังไม่มีข้อมูลเวลาเรียนหรือยังไม่ได้กำหนดปฏิทินภาคเรียน</p>
      </section>
    ))
  }

  if (isSecondary) {
    const teachingWeeks = subjectHourlyTermWeeks(range.start, range.end, calendar)
    const hpw = subjectHourlyHpw(subject.subject.hours_per_year || 0, teachingWeeks)
    const { weeks, totalHours } = buildSubjectCalendarWeeks(range.start, range.end, calendar, hpw, holidayNameMap(data?.holidays))
    if (weeks.length === 0) {
      return withStudentChunks(data, (pageData, pageIndex) => (
        <section key={`subject-hourly-sec-empty-${term}-${pageIndex}`} className="report-page pp5-body-page pp5-subject-hourly-page" style={pageStyle}>
          <ReportPageNumber value={pageStart + pageIndex} mark={PP5_SUBJECT_PAGE_MARK} />
          <HeaderLine data={pageData} title="บันทึกเวลาเรียน" term={term} />
          <p className="report-empty-inline">ยังไม่มีข้อมูลเวลาเรียนหรือยังไม่ได้กำหนดปฏิทินภาคเรียน</p>
        </section>
      ))
    }
    const pages = secondaryHourlyPages(weeks)
    return pages.flatMap((page, pageIndex) =>
      studentChunks.map((chunk, studentPageIndex) => (
        <SubjectSecondaryHourlyAttendancePage
          key={`subject-hourly-sec-${term}-${page.key}-${studentPageIndex}`}
          data={data}
          subject={subject}
          term={term}
          pageWeeks={page.weeks}
          allWeeks={weeks}
          showSummary={page.showSummary}
          pageNumber={pageStart + pageIndex * studentPageCount + studentPageIndex}
          totalHours={totalHours}
          recordMap={recordMap}
          students={chunk}
        />
      )),
    )
  }

  const weeks = subjectHourlyTermWeeks(range.start, range.end, calendar)
  const hpw = subjectHourlyHpw(subject.subject.hours_per_year || 0, weeks)
  const slotsPerWeek = displaySlotsPerWeek(true, hpw)

  if (weeks.length === 0) {
    return withStudentChunks(data, (pageData, pageIndex) => (
      <section key={`subject-hourly-pri-empty-${term}-${pageIndex}`} className="report-page pp5-body-page pp5-subject-hourly-page" style={pageStyle}>
        <ReportPageNumber value={pageStart + pageIndex} mark={PP5_SUBJECT_PAGE_MARK} />
        <HeaderLine data={pageData} title="แบบบันทึกเวลาเรียนรายวิชา" term={term} />
        <p className="report-empty-inline">ยังไม่มีข้อมูลเวลาเรียนหรือยังไม่ได้กำหนดปฏิทินภาคเรียน</p>
      </section>
    ))
  }

  const pages = primaryHourlyPages(weeks)
  return pages.flatMap((page, pageIndex) =>
    studentChunks.map((chunk, studentPageIndex) => (
      <SubjectPrimaryHourlyAttendancePage
        key={`subject-hourly-${term}-${page.key}-${studentPageIndex}`}
        data={data}
        subject={subject}
        term={term}
        pageWeeks={page.weeks}
        allWeeks={weeks}
        showSummary={page.showSummary}
        pageNumber={pageStart + pageIndex * studentPageCount + studentPageIndex}
        slotsPerWeek={slotsPerWeek}
        dataSlotsPerWeek={hpw}
        recordMap={recordMap}
        students={chunk}
      />
    )),
  )
}

function AttendancePage({ data, mode, subject, classSubjectId, term, pageStart }: { data: ReportPayload | null; mode: ReportMode; subject: ReportSubject | null; classSubjectId?: string; term: 0 | 1 | 2; pageStart?: number }) {
  const pageStyle = usePp5PageStyle('attendance')
  if (mode === 'pp5-class') return <ClassAttendancePages data={data} term={term} pageStart={pageStart} />
  if (mode === 'pp5-subject') {
    const isSecondary = isSecondaryClassLevel(data?.classroom?.level)
    const studentPages = studentTablePageCount(data)
    if (term === 0) {
      const term1Pages = subjectHourlyTermPageCount(data, subject, 1) * studentPages
      const term2Pages = subjectHourlyTermPageCount(data, subject, 2) * studentPages
      const start = pageStart || 1
      if (isSecondary) {
        const afterTerm1 = start + term1Pages
        const afterTerm1Summary = afterTerm1 + studentPages
        const afterTerm2 = afterTerm1Summary + term2Pages
        return (
          <>
            <SubjectHourlyAttendancePages data={data} subject={subject} classSubjectId={classSubjectId} term={1} pageStart={start} />
            {withStudentChunks(data, (pageData, pageIndex) => (
              <SubjectHourlySummaryPage
                key={`hourly-summary-1-${pageIndex}`}
                data={pageData}
                subject={subject}
                classSubjectId={classSubjectId}
                term={1}
                pageNumber={afterTerm1 + pageIndex}
              />
            ))}
            <SubjectHourlyAttendancePages data={data} subject={subject} classSubjectId={classSubjectId} term={2} pageStart={afterTerm1Summary} />
            {withStudentChunks(data, (pageData, pageIndex) => (
              <SubjectHourlySummaryPage
                key={`hourly-summary-2-${pageIndex}`}
                data={pageData}
                subject={subject}
                classSubjectId={classSubjectId}
                term={2}
                pageNumber={afterTerm2 + pageIndex}
              />
            ))}
          </>
        )
      }
      return (
        <>
          <SubjectHourlyAttendancePages data={data} subject={subject} classSubjectId={classSubjectId} term={1} pageStart={start} />
          <SubjectHourlyAttendancePages data={data} subject={subject} classSubjectId={classSubjectId} term={2} pageStart={start + term1Pages} />
          {withStudentChunks(data, (pageData, pageIndex) => (
            <SubjectHourlySummaryPage
              key={`hourly-summary-year-${pageIndex}`}
              data={pageData}
              subject={subject}
              classSubjectId={classSubjectId}
              term={2}
              pageNumber={start + term1Pages + term2Pages + pageIndex}
            />
          ))}
        </>
      )
    }
    const activeTerm = term as 1 | 2
    const termPages = subjectHourlyTermPageCount(data, subject, activeTerm) * studentPages
    const start = pageStart || 1
    return (
      <>
        <SubjectHourlyAttendancePages data={data} subject={subject} classSubjectId={classSubjectId} term={activeTerm} pageStart={start} />
        {subjectHourlySummaryPageCount(data, term) > 0
          ? withStudentChunks(data, (pageData, pageIndex) => (
              <SubjectHourlySummaryPage
                key={`hourly-summary-${activeTerm}-${pageIndex}`}
                data={pageData}
                subject={subject}
                classSubjectId={classSubjectId}
                term={activeTerm}
                pageNumber={start + termPages + pageIndex}
              />
            ))
          : null}
      </>
    )
  }

  const attendance = data?.dailyAttendance
  const start = pageStart || 1
  return (
    <>
      {withStudentChunks(data, (pageData, pageIndex) => (
        <section key={`attendance-fallback-${pageIndex}`} className="report-page pp5-body-page pp5-attendance-summary-page" style={pageStyle}>
          <ReportPageNumber value={start + pageIndex} />
          <HeaderLine data={pageData} title="สรุปเวลาเรียนรวมของชั้นเรียน" term={term} />
          <table className="report-table compact">
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>เลขประจำตัว</th>
                <th>ชื่อ - สกุล</th>
                <th>มา</th>
                <th>ป่วย</th>
                <th>ลา</th>
                <th>ขาด</th>
                <th>รวม</th>
              </tr>
            </thead>
            <tbody>
              {(pageData?.students || []).map(student => {
                const summary = attendance?.[student.id] || { present: 0, sick: 0, leave: 0, absent: 0 }
                const total = summary.present + summary.sick + summary.leave + summary.absent
                return (
                  <tr key={student.id}>
                    <td>{student.student_number}</td>
                    <td>{student.student_code || '-'}</td>
                    <td className="text-left">{studentName(student)}</td>
                    <td>{summary.present}</td>
                    <td>{summary.sick}</td>
                    <td>{summary.leave}</td>
                    <td>{summary.absent}</td>
                    <td>{total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}

function ClassAttendancePages({ data, term, pageStart = 1 }: { data: ReportPayload | null; term: 0 | 1 | 2; pageStart?: number }) {
  const layout = usePp5SectionLayout('attendance')
  const pageStyle = usePp5PageStyle('attendance')
  const recordMap = attendanceRecordMap(data?.dailyAttendanceRecords || [])
  const holidayMap = calendarDayMap(data?.holidays || [])
  const openWeekendMap = calendarDayMap(data?.weekendSchoolDays || [])
  const studentChunks = chunkStudentsForPrintPages(data?.students || [])
  const studentPageCount = studentChunks.length

  function renderTermPages(activeTerm: 1 | 2, pageOffset = 0) {
    const { start, end } = attendanceDateRange(data, activeTerm)
    const weekPages = chunkArray(attendanceWeeks(start, end), 4)
    return weekPages.flatMap((weeks, weekIndex) =>
      studentChunks.map((chunkStudents, studentPageIndex) => {
        const weekSlots = weeks.map(week => ({ week, slots: expandAttendanceWeek(week) }))
        const columns = weekSlots.flatMap(({ week, slots }) => slots.map(slot => ({ weekNumber: week.weekNumber, slot })))
        const rowCount = pp5AttendanceBodyRows(chunkStudents.length, layout, 5)
        const pageNumber = pageStart + pageOffset + weekIndex * studentPageCount + studentPageIndex
        return (
          <section className="report-page pp5-body-page pp5-attendance-month-page" key={`attendance-term-${activeTerm}-page-${weekIndex}-${studentPageIndex}`} style={pageStyle}>
            <ReportPageNumber value={pageNumber} />
            <header className="pp5-attendance-head">
              <h1>บันทึกเวลาเรียน ภาคเรียนที่ {activeTerm}</h1>
              <p className="pp5-attendance-class-line">
                นักเรียนชั้นประถมศึกษาปีที่ <b>{classLabel(data?.classroom || null)}</b>
                <span>โรงเรียน{data?.school?.name || '-'}</span>
                <span>ปีการศึกษา</span><b>{data?.academicYear?.year_be || '-'}</b>
              </p>
            </header>
            <table className="pp5-attendance-table" style={pp5AttendanceTableStyle(rowCount)}>
              <thead>
                <tr className="pp5-attendance-week-row">
                  <th rowSpan={5} className="pp5-attendance-number-col pp5-attendance-vertical">เลขที่</th>
                  <th rowSpan={5} className="pp5-attendance-code-col pp5-attendance-vertical">เลขประจำตัว</th>
                  <th rowSpan={5} className="pp5-attendance-name-col">ชื่อ - นามสกุล</th>
                  <th className="pp5-attendance-row-label">สัปดาห์</th>
                  {weekSlots.map(({ week }) => <th key={week.weekNumber} colSpan={PP5_ATTENDANCE_DAYS_PER_WEEK} className="pp5-attendance-week-group">{week.weekNumber}</th>)}
                </tr>
                <tr className="pp5-attendance-month-row">
                  <th className="pp5-attendance-row-label">เดือน</th>
                  {weekSlots.map(({ week }) => <th key={week.weekNumber} colSpan={PP5_ATTENDANCE_DAYS_PER_WEEK} className="pp5-attendance-week-group">{weekMonthLabel(week)}</th>)}
                </tr>
                <tr className="pp5-attendance-day-row">
                  <th className="pp5-attendance-row-label">วัน</th>
                  {columns.map(({ weekNumber, slot }) => {
                    const isHoliday = slot.key ? holidayMap.has(slot.key) : false
                    return (
                      <th
                        key={`day-w${weekNumber}-${slot.weekday}`}
                        className={`${slot.colIndex === 0 ? 'week-start' : ''} ${slot.isWeekend ? 'is-weekend' : ''} ${isHoliday ? 'is-holiday' : ''}`}
                      >
                        {THAI_WEEKDAYS[slot.weekday]}
                      </th>
                    )
                  })}
                </tr>
                <tr className="pp5-attendance-date-row">
                  <th className="pp5-attendance-row-label">วันที่</th>
                  {columns.map(({ weekNumber, slot }) => {
                    const isHoliday = slot.key ? holidayMap.has(slot.key) : false
                    return (
                      <th
                        key={`date-w${weekNumber}-${slot.weekday}`}
                        className={`${slot.colIndex === 0 ? 'week-start' : ''} ${slot.isWeekend ? 'is-weekend' : ''} ${isHoliday ? 'is-holiday' : ''}`}
                      >
                        {slot.dayNumber ?? ''}
                      </th>
                    )
                  })}
                </tr>
                <tr className="pp5-attendance-hour-row">
                  <th className="pp5-attendance-row-label">ชั่วโมงที่</th>
                  {columns.map(({ weekNumber, slot }) => {
                    const isHoliday = slot.key ? holidayMap.has(slot.key) : false
                    return (
                      <th
                        key={`hour-w${weekNumber}-${slot.weekday}`}
                        className={`${slot.colIndex === 0 ? 'week-start' : ''} ${slot.isWeekend ? 'is-weekend' : ''} ${isHoliday ? 'is-holiday' : ''}`}
                      >
                        {slot.dayIndex ?? ''}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rowCount }, (_, index) => {
                  const student = chunkStudents[index]
                  return (
                    <tr key={student?.id || `empty-${index}`}>
                      <td>{student ? student.student_number || index + 1 : ''}</td>
                      <td>{student?.student_code || ''}</td>
                      <td className="text-left">{student ? studentName(student) : ''}</td>
                      <td className="pp5-attendance-row-label" />
                      {columns.map(({ weekNumber, slot }) => {
                        const isHoliday = slot.key ? holidayMap.has(slot.key) : false
                        const isOpenWeekend = slot.key ? openWeekendMap.has(slot.key) : false
                        const recordedValue = student && slot.key ? recordMap.get(`${student.id}:${slot.key}`) || '' : ''
                        const rawValue = student && slot.date && slot.key
                          ? recordedValue || (isAttendanceSchoolDay(slot.date, slot.key, holidayMap, openWeekendMap) ? 'ม' : '')
                          : ''
                        const display = !student ? '' : rawValue === 'ม' || rawValue === '/' ? 'ม' : rawValue
                        return (
                          <td
                            key={`${student?.id || 'empty'}-w${weekNumber}-${slot.weekday}`}
                            className={`${slot.colIndex === 0 ? 'week-start' : ''} ${slot.isWeekend ? 'is-weekend' : ''} ${isHoliday ? 'is-holiday' : ''} ${isOpenWeekend ? 'is-open-weekend' : ''} ${rawValue === 'ข' || rawValue === 'ป' || rawValue === 'ล' ? 'is-absence' : ''}`}
                          >
                            {display}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      }),
    )
  }

  const term1Pages = term === 0 || term === 1 ? renderTermPages(1, 0) : []
  const term2Pages = term === 0 || term === 2 ? renderTermPages(2, term === 0 ? term1Pages.length : 0) : []

  if (term1Pages.length + term2Pages.length === 0) {
    return (
      <>
        {withStudentChunks(data, (pageData, pageIndex) => (
          <section key={`attendance-empty-${pageIndex}`} className="report-page pp5-body-page pp5-attendance-month-page" style={pageStyle}>
            <ReportPageNumber value={pageStart + pageIndex} />
            <HeaderLine data={pageData} title="แบบบันทึกเวลาเรียน" term={term} />
            <div className="report-empty">ยังไม่ได้ตั้งค่าวันเปิด-ปิดภาคเรียนในปีการศึกษา</div>
          </section>
        ))}
      </>
    )
  }

  return (
    <>
      {term1Pages}
      {term2Pages}
      {term === 0
        ? withStudentChunks(data, (pageData, pageIndex) => (
            <ClassAttendanceSummaryPage
              key={`class-att-summary-${pageIndex}`}
              data={pageData}
              recordMap={recordMap}
              holidayMap={holidayMap}
              openWeekendMap={openWeekendMap}
              pageNumber={pageStart + term1Pages.length + term2Pages.length + pageIndex}
            />
          ))
        : null}
    </>
  )
}

function ClassAttendanceSummaryPage({
  data,
  recordMap,
  holidayMap,
  openWeekendMap,
  pageNumber,
}: {
  data: ReportPayload | null
  recordMap: Map<string, string>
  holidayMap: Map<string, string>
  openWeekendMap: Map<string, string>
  pageNumber?: number
}) {
  const pageStyle = usePp5PageStyle('attendance')
  const term1Keys = attendanceSchoolDayKeysForTerm(data, 1, holidayMap, openWeekendMap)
  const term2Keys = attendanceSchoolDayKeysForTerm(data, 2, holidayMap, openWeekendMap)
  const allKeys = [...term1Keys, ...term2Keys]

  return (
    <section className="report-page pp5-body-page pp5-attendance-summary-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} />
      <header className="pp5-attendance-head">
        <h1>สรุปข้อมูลการมาเรียนนักเรียนชั้นประถมศึกษาปีที่ {classLabel(data?.classroom || null)} ปีการศึกษา {data?.academicYear?.year_be || '-'}</h1>
      </header>
      <table className="pp5-attendance-table pp5-attendance-summary-table">
        <colgroup>
          <col className="pp5-summary-number-col" />
          <col className="pp5-summary-code-col" />
          <col className="pp5-summary-name-col" />
          {Array.from({ length: 13 }, (_, index) => <col key={index} className="pp5-summary-metric-col" />)}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>เลขที่</th>
            <th rowSpan={2}>เลขประจำตัว</th>
            <th rowSpan={2}>ชื่อ - นามสกุล</th>
            <th colSpan={4}>เวลาเรียนภาคเรียนที่ 1</th>
            <th colSpan={4}>เวลาเรียนภาคเรียนที่ 2</th>
            <th colSpan={5}>รวมเวลาเรียนตลอดปีการศึกษา</th>
          </tr>
          <tr>
            <th>ลา</th><th>ป่วย</th><th>ขาด</th><th>มาเรียน</th>
            <th>ลา</th><th>ป่วย</th><th>ขาด</th><th>มาเรียน</th>
            <th>ลา</th><th>ป่วย</th><th>ขาด</th><th>มาเรียน</th><th>ร้อยละ</th>
          </tr>
        </thead>
        <tbody>
          {(data?.students || []).map((student, index) => {
            const term1 = summarizeAttendanceKeys(student.id, term1Keys, recordMap)
            const term2 = summarizeAttendanceKeys(student.id, term2Keys, recordMap)
            const total = summarizeAttendanceKeys(student.id, allKeys, recordMap)
            const percent = allKeys.length ? (total.present / allKeys.length) * 100 : 0
            return (
              <tr key={student.id}>
                <td>{student.student_number || index + 1}</td>
                <td>{student.student_code || '-'}</td>
                <td className="text-left">{studentName(student)}</td>
                <td>{term1.leave || '-'}</td>
                <td>{term1.sick || '-'}</td>
                <td>{term1.absent || '-'}</td>
                <td>{term1.present}</td>
                <td>{term2.leave || '-'}</td>
                <td>{term2.sick || '-'}</td>
                <td>{term2.absent || '-'}</td>
                <td>{term2.present}</td>
                <td>{total.leave || '-'}</td>
                <td>{total.sick || '-'}</td>
                <td>{total.absent || '-'}</td>
                <td>{total.present}</td>
                <td>{percent.toFixed(1)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function SubjectBetweenScorePage({
  data,
  subject,
  term,
  pageNumber,
}: {
  data: ReportPayload | null
  subject: ReportSubject
  term: 1 | 2
  pageNumber: number
}) {
  const pageStyle = usePp5PageStyle('scores')
  const config = scoreConfigFor(data, subject.class_subject_id, term)
  const split = splitScoreUnits(config)
  const students = data?.students || []
  const beforeCols = Math.max(SUBJECT_UNIT_DISPLAY_COLS, split.beforeCount)
  const afterCols = Math.max(SUBJECT_UNIT_DISPLAY_COLS, split.afterCount)
  const finalCols = SUBJECT_FINAL_DISPLAY_COLS

  return (
    <section className="report-page pp5-body-page pp5-score-entry-page pp5-subject-score-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={PP5_SUBJECT_PAGE_MARK} />
      <SubjectReportHead data={data} title={`คะแนนระหว่างเรียน ภาคเรียนที่ ${term}`} term={term} subject={subject} />
      <table className="pp5-score-entry-table pp5-subject-between-score-table">
        <thead>
          <tr>
            <th rowSpan={3}>เลขที่</th>
            <th rowSpan={3}>เลขประจำตัว</th>
            <th rowSpan={3} className="pp5-score-name-col">ชื่อ - สกุล</th>
            <th colSpan={beforeCols + 1}>ก่อนกลางภาค ({split.beforeMax})</th>
            <th colSpan={1}>กลางภาค ({split.midtermMax})</th>
            <th colSpan={afterCols + 1}>หลังกลางภาค ({split.afterMax})</th>
            <th colSpan={finalCols + 1}>ปลายภาค ({split.finalMax})</th>
          </tr>
          <tr>
            {Array.from({ length: beforeCols }, (_, index) => <th key={`before-${index}`}>{index + 1}</th>)}
            <th>รวม</th>
            <th>รวม</th>
            {Array.from({ length: afterCols }, (_, index) => <th key={`after-${index}`}>{index + 1}</th>)}
            <th>รวม</th>
            {Array.from({ length: finalCols }, (_, index) => <th key={`final-${index}`}>{index + 1}</th>)}
            <th>รวม</th>
          </tr>
          <tr>
            {padScoreCells(split.beforeMaxes, beforeCols).map((value, index) => <th key={`before-max-${index}`}>{value}</th>)}
            <th>{split.beforeMax}</th>
            <th>{split.midtermMax}</th>
            {padScoreCells(split.afterMaxes, afterCols).map((value, index) => <th key={`after-max-${index}`}>{value}</th>)}
            <th>{split.afterMax}</th>
            {Array.from({ length: finalCols }, (_, index) => <th key={`final-max-pad-${index}`} />)}
            <th>{split.finalMax}</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => {
            const score = scoreForTerm(data, student.id, subject.class_subject_id, term)
            const beforeValues = unitScoreValues(score, 0, split.beforeCount)
            const afterValues = unitScoreValues(score, split.beforeCount, split.afterCount)
            return (
              <tr key={student.id}>
                <td>{student.student_number || index + 1}</td>
                <td>{student.student_code || ''}</td>
                <td className="text-left">{studentName(student)}</td>
                {padScoreCells(beforeValues, beforeCols).map((value, cellIndex) => <td key={`before-${student.id}-${cellIndex}`}>{value}</td>)}
                <td>{score?.between_total != null ? sumScoreCells(beforeValues) : ''}</td>
                <td>{score?.midterm_score ?? ''}</td>
                {padScoreCells(afterValues, afterCols).map((value, cellIndex) => <td key={`after-${student.id}-${cellIndex}`}>{value}</td>)}
                <td>{score?.between_total != null ? sumScoreCells(afterValues) : ''}</td>
                {Array.from({ length: finalCols }, (_, cellIndex) => <td key={`final-pad-${student.id}-${cellIndex}`} />)}
                <td>{score?.final_score ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function SubjectAchievementResultPage({
  data,
  subject,
  term,
  pageNumber,
}: {
  data: ReportPayload | null
  subject: ReportSubject
  term: 1 | 2
  pageNumber: number
}) {
  const pageStyle = usePp5PageStyle('scores')
  const config = scoreConfigFor(data, subject.class_subject_id, term)
  const split = splitScoreUnits(config)
  const students = data?.students || []
  const beforeCols = Math.max(5, split.beforeCount)
  const afterCols = Math.max(5, split.afterCount)

  return (
    <section className="report-page pp5-body-page pp5-score-entry-page pp5-subject-score-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={PP5_SUBJECT_PAGE_MARK} />
      <SubjectReportHead data={data} title="สรุปผลการประเมินผลสัมฤทธิ์ทางการเรียน" term={term} subject={subject} />
      <table className="pp5-score-entry-table pp5-subject-achievement-table">
        <thead>
          <tr>
            <th rowSpan={3}>เลขที่</th>
            <th rowSpan={3}>เลขประจำตัว</th>
            <th rowSpan={3} className="pp5-score-name-col">ชื่อ - สกุล</th>
            <th colSpan={beforeCols}>คะแนนก่อนกลางภาค</th>
            <th colSpan={afterCols}>คะแนนหลังกลางภาค</th>
            <th rowSpan={3} className="pp5-score-vertical"><span>รวม</span></th>
            <th rowSpan={3} className="pp5-score-vertical">{pp5ScoreHeadLabel('คะแนนกลางภาค', config?.midterm_max)}</th>
            <th rowSpan={3} className="pp5-score-vertical">{pp5ScoreHeadLabel('คะแนนปลายภาค', config?.final_max)}</th>
            <th rowSpan={3} className="pp5-score-vertical">{pp5ScoreHeadLabel(`รวมภาคเรียนที่ ${term}`, config?.total_max)}</th>
            <th rowSpan={3} className="pp5-score-vertical"><span>ระดับผลการเรียน</span></th>
            <th rowSpan={3} className="pp5-score-vertical"><span>หมายเหตุ</span></th>
          </tr>
          <tr>
            {Array.from({ length: beforeCols }, (_, index) => <th key={`before-head-${index}`}>{index + 1}</th>)}
            {Array.from({ length: afterCols }, (_, index) => <th key={`after-head-${index}`}>{index + 1}</th>)}
          </tr>
          <tr>
            {padScoreCells(split.beforeMaxes, beforeCols).map((value, index) => <th key={`before-max-${index}`}>{value}</th>)}
            {padScoreCells(split.afterMaxes, afterCols).map((value, index) => <th key={`after-max-${index}`}>{value}</th>)}
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => {
            const score = scoreForTerm(data, student.id, subject.class_subject_id, term)
            const beforeValues = unitScoreValues(score, 0, split.beforeCount)
            const afterValues = unitScoreValues(score, split.beforeCount, split.afterCount)
            return (
              <tr key={student.id}>
                <td>{student.student_number || index + 1}</td>
                <td>{student.student_code || ''}</td>
                <td className="text-left">{studentName(student)}</td>
                {padScoreCells(beforeValues, beforeCols).map((value, cellIndex) => <td key={`before-${student.id}-${cellIndex}`}>{value}</td>)}
                {padScoreCells(afterValues, afterCols).map((value, cellIndex) => <td key={`after-${student.id}-${cellIndex}`}>{value}</td>)}
                <td>{score?.between_total ?? ''}</td>
                <td>{score?.midterm_score ?? ''}</td>
                <td>{score?.final_score ?? ''}</td>
                <td>{score?.term_total ?? ''}</td>
                <td>{scoreText(score)}</td>
                <td>{score?.result && score.result !== 'เรียน' ? score.result : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function SubjectExamNoticePage({
  data,
  subject,
  term,
  pageNumber,
}: {
  data: ReportPayload | null
  subject: ReportSubject
  term: 1 | 2
  pageNumber: number
}) {
  const pageStyle = usePp5PageStyle('scores')
  const students = data?.students || []
  const gradeCounts = subjectGradeSummaryForTerm(data, subject, term)
  const studentsTotal = students.length
  const termRange = termDateRange(data?.academicYear || null, term)
  const teachingWeeks = buildTeachingWeeks(termRange.start, termRange.end, reportSchoolCalendar(data))
  const hoursWeek = hoursPerWeek(subject.subject.hours_per_year || 0, teachingWeeks.length)
  const readingSummary = { excellent: 0, good: 0, pass: 0, fail: 0 }
  const characterSummary = { excellent: 0, good: 0, pass: 0, fail: 0 }
  for (const student of students) {
    const readingLevel = levelFromAverage(averageScore(rowForTerm(data?.evaluations.reading || [], student.id, term), READING_KEYS))
    if (readingLevel === 'ดีเยี่ยม') readingSummary.excellent += 1
    else if (readingLevel === 'ดี') readingSummary.good += 1
    else if (readingLevel === 'ผ่าน') readingSummary.pass += 1
    else readingSummary.fail += 1
    const characterLevel = levelFromAverage(averageScore(rowForTerm(data?.evaluations.character || [], student.id, term), CHARACTER_KEYS))
    if (characterLevel === 'ดีเยี่ยม') characterSummary.excellent += 1
    else if (characterLevel === 'ดี') characterSummary.good += 1
    else if (characterLevel === 'ผ่าน') characterSummary.pass += 1
    else characterSummary.fail += 1
  }

  return (
    <section className="report-page pp5-body-page pp5-score-entry-page pp5-subject-score-page pp5-subject-exam-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={PP5_SUBJECT_PAGE_MARK} />
      <SubjectReportHead
        data={data}
        title={`แบบประกาศผลสอบโรงเรียน${data?.school?.name || ''}`}
        term={term}
        subject={subject}
      />
      <p className="pp5-subject-exam-meta">
        กลุ่มสาระฯ {subject.subject.subject_group}
        <span>เวลาเรียน {hoursWeek || '-'} ชม./สัปดาห์</span>
        <span>จำนวน {subject.subject.credits || '-'} หน่วยกิต</span>
      </p>
      <table className="pp5-score-entry-table pp5-subject-exam-table">
        <thead>
          <tr>
            <th>เลขที่</th>
            <th>เลขประจำตัว</th>
            <th className="pp5-score-name-col">ชื่อ - สกุล</th>
            <th>ผลการเรียน<br />คะแนน</th>
            <th>ผลการเรียน<br />ระดับผลการเรียน</th>
            <th>การประเมิน<br />อ่าน คิด วิเคราะห์</th>
            <th>การประเมิน<br />คุณลักษณะ</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => {
            const score = scoreForTerm(data, student.id, subject.class_subject_id, term)
            const readingRow = rowForTerm(data?.evaluations.reading || [], student.id, term)
            const characterRow = rowForTerm(data?.evaluations.character || [], student.id, term)
            return (
              <tr key={student.id}>
                <td>{student.student_number || index + 1}</td>
                <td>{student.student_code || ''}</td>
                <td className="text-left">{studentName(student)}</td>
                <td>{score?.term_total ?? ''}</td>
                <td>{scoreText(score)}</td>
                <td>{resultLevelNumber(levelFromAverage(averageScore(readingRow, READING_KEYS)))}</td>
                <td>{resultLevelNumber(levelFromAverage(averageScore(characterRow, CHARACTER_KEYS)))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="pp5-subject-exam-summary-grid">
        <table className="pp5-class-cover-mini-table">
          <thead>
            <tr><th colSpan={2}>สรุปผลการเรียน</th></tr>
          </thead>
          <tbody>
            {SUBJECT_COVER_GRADE_LEVEL_COLUMNS.map(column => (
              <tr key={column.key}>
                <td className="text-left">จำนวนนักเรียนที่ได้ผลการเรียน {column.label}</td>
                <td>{gradeCounts[column.key] || 0} คน</td>
              </tr>
            ))}
            <tr>
              <td className="text-left">รวมทั้งเรียนทั้งสิ้น</td>
              <td>{studentsTotal} คน</td>
            </tr>
          </tbody>
        </table>
        <table className="pp5-class-cover-mini-table">
          <thead>
            <tr><th colSpan={5}>สรุปผลการประเมินการอ่าน คิด วิเคราะห์</th></tr>
            <tr>
              <th>3 (ดีเยี่ยม)</th>
              <th>2 (ดี)</th>
              <th>1 (ผ่าน)</th>
              <th>0 (ไม่ผ่าน)</th>
              <th>จำนวนนักเรียน</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{readingSummary.excellent}</td>
              <td>{readingSummary.good}</td>
              <td>{readingSummary.pass}</td>
              <td>{readingSummary.fail}</td>
              <td>{studentsTotal}</td>
            </tr>
          </tbody>
        </table>
        <table className="pp5-class-cover-mini-table">
          <thead>
            <tr><th colSpan={5}>สรุปผลการประเมินคุณลักษณะที่พึงประสงค์</th></tr>
            <tr>
              <th>3 (ดีเยี่ยม)</th>
              <th>2 (ดี)</th>
              <th>1 (ผ่าน)</th>
              <th>0 (ไม่ผ่าน)</th>
              <th>จำนวนนักเรียน</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{characterSummary.excellent}</td>
              <td>{characterSummary.good}</td>
              <td>{characterSummary.pass}</td>
              <td>{characterSummary.fail}</td>
              <td>{studentsTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pp5-subject-exam-signatures">
        <span>ลงชื่อ ครูผู้สอน</span>
        <span>ลงชื่อ หัวหน้ากลุ่มสาระการเรียนรู้</span>
        <span>ลงชื่อ หัวหน้าฝ่ายวิชาการ</span>
        <span>ลงชื่อ รองผู้อำนวยการสถานศึกษา</span>
        <span>ลงชื่อ ผู้อำนวยการสถานศึกษา</span>
      </div>
    </section>
  )
}

function SubjectScorePages({
  data,
  subject,
  term,
  pageStart = 1,
}: {
  data: ReportPayload | null
  subject: ReportSubject | null
  term: 0 | 1 | 2
  pageStart?: number
}) {
  const pageStyle = usePp5PageStyle('scores')
  if (!subject) {
    return (
      <section className="report-page pp5-body-page pp5-subject-score-page" style={pageStyle}>
        <ReportPageNumber value={pageStart} mark={PP5_SUBJECT_PAGE_MARK} />
        <p className="report-empty-inline">ยังไม่ได้เลือกรายวิชา</p>
      </section>
    )
  }

  const activeTerms: Array<1 | 2> = term === 0 ? [1, 2] : [term]
  let pageNumber = pageStart

  return (
    <>
      {activeTerms.flatMap(activeTerm =>
        withStudentChunks(data, (pageData, pageIndex) => {
          const base = pageNumber
          pageNumber += SUBJECT_SCORE_PAGES_PER_TERM
          return [
            <SubjectBetweenScorePage key={`between-${activeTerm}-${pageIndex}`} data={pageData} subject={subject} term={activeTerm} pageNumber={base} />,
            <SubjectAchievementResultPage key={`achievement-${activeTerm}-${pageIndex}`} data={pageData} subject={subject} term={activeTerm} pageNumber={base + 1} />,
            <SubjectExamNoticePage key={`exam-${activeTerm}-${pageIndex}`} data={pageData} subject={subject} term={activeTerm} pageNumber={base + 2} />,
          ]
        }).flat(),
      )}
    </>
  )
}

function ClassScorePage({ data, term, pageStart = 1 }: { data: ReportPayload | null; term: 0 | 1 | 2; pageStart?: number }) {
  const activeTerms: Array<1 | 2> = term === 0 ? [1, 2] : [term]
  const pages = (data?.subjects || []).flatMap(subject =>
    activeTerms.flatMap(activeTerm =>
      withStudentChunks(data, (pageData, pageIndex) => ({
        subject,
        term: activeTerm,
        pageData,
        pageIndex,
      })),
    ),
  )

  return (
    <>
      {pages.map(({ subject, term: activeTerm, pageData, pageIndex }, pageOrdinal) => (
        <ClassSubjectScorePage
          key={`${subject.class_subject_id}-${activeTerm}-${pageIndex}`}
          data={pageData}
          subject={subject}
          term={activeTerm}
          pageNumber={pageStart + pageOrdinal}
        />
      ))}
    </>
  )
}

function ClassSubjectScorePage({
  data,
  subject,
  term,
  pageNumber,
}: {
  data: ReportPayload | null
  subject: ReportSubject
  term: 1 | 2
  pageNumber: number
}) {
  const layout = usePp5SectionLayout('scores')
  const pageStyle = usePp5PageStyle('scores')
  const config = scoreConfigFor(data, subject.class_subject_id, term)
  const betweenScores = config?.between_scores?.length ? config.between_scores : [5, 5, 5, 5, 5, 5, 5]
  const visibleUnits = Math.max(14, betweenScores.length)
  const students = data?.students || []
  const yearTotalMax =
    term === 2
      ? (scoreConfigFor(data, subject.class_subject_id, 1)?.total_max || 0) +
        (scoreConfigFor(data, subject.class_subject_id, 2)?.total_max || 0)
      : 0

  return (
    <section className="report-page pp5-body-page pp5-score-entry-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} />
      <header className="pp5-score-entry-head">
        <h1>คะแนนระหว่างเรียน/คะแนนกลางภาค/คะแนนปลายภาค</h1>
        <p className="pp5-score-entry-class-line">
          นักเรียนชั้นประถมศึกษาปีที่ <b>{classLabel(data?.classroom || null)}</b>
          <span>โรงเรียน{data?.school?.name || '-'}</span>
          <span>ปีการศึกษา</span><b>{data?.academicYear?.year_be || '-'}</b>
        </p>
      </header>
      <table className={`pp5-score-entry-table ${term === 2 ? 'is-term-two' : 'is-term-one'}`}>
        <colgroup>
          <col className="pp5-score-number-col" />
          <col className="pp5-score-code-col" />
          <col className="pp5-score-name-col" />
          {Array.from({ length: visibleUnits }, (_, index) => <col key={index} className="pp5-score-unit-col" />)}
          <col className="pp5-score-total-col" />
          <col className="pp5-score-side-col" />
          <col className="pp5-score-side-col" />
          <col className="pp5-score-side-col" />
          {term === 2 && <col className="pp5-score-side-col" />}
          {term === 2 && <col className="pp5-score-grade-col" />}
          <col className="pp5-score-note-col" />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={3} className="pp5-score-vertical pp5-score-number-col"><span>เลขที่</span></th>
            <th rowSpan={3} className="pp5-score-vertical pp5-score-code-col"><span>เลขประจำตัว</span></th>
            <th rowSpan={3} className="pp5-score-name-col">ชื่อ - สกุล</th>
            <th colSpan={visibleUnits + 1} className="pp5-score-between-head">
              <span>คะแนนระหว่างเรียน&nbsp;&nbsp; วิชา{subject.subject.name}</span>
              <span>(ภาคเรียนที่ {term})</span>
            </th>
            <th rowSpan={3} className="pp5-score-vertical pp5-score-side-head">{pp5ScoreHeadLabel('สอบกลางภาค', config?.midterm_max)}</th>
            <th rowSpan={3} className="pp5-score-vertical pp5-score-side-head">{pp5ScoreHeadLabel('สอบปลายภาค', config?.final_max)}</th>
            <th rowSpan={3} className="pp5-score-vertical pp5-score-side-head">{pp5ScoreHeadLabel(`รวมภาคเรียนที่ ${term}`, config?.total_max)}</th>
            {term === 2 && <th rowSpan={3} className="pp5-score-vertical pp5-score-side-head">{pp5ScoreHeadLabel('รวมทั้งปีการศึกษา', yearTotalMax)}</th>}
            {term === 2 && <th rowSpan={3} className="pp5-score-vertical pp5-score-side-head"><span>ระดับผลการเรียน</span></th>}
            <th rowSpan={3} className="pp5-score-vertical pp5-score-side-head"><span>หมายเหตุ</span></th>
          </tr>
          <tr>
            {Array.from({ length: visibleUnits }, (_, index) => <th key={index}>{index + 1}</th>)}
            <th rowSpan={2}>รวม</th>
          </tr>
          <tr>
            {Array.from({ length: visibleUnits }, (_, index) => <th key={index}>{betweenScores[index] || ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: pp5StudentTableRows(students.length, layout) }, (_, index) => {
            const student = students[index]
            const score = student ? scoreForTerm(data, student.id, subject.class_subject_id, term) : null
            return (
              <tr key={student?.id || `empty-score-${index}`}>
                <td>{student ? student.student_number || index + 1 : ''}</td>
                <td>{student?.student_code || ''}</td>
                <td className="text-left">{student ? studentName(student) : ''}</td>
                {Array.from({ length: visibleUnits }, (_, unitIndex) => (
                  <td key={unitIndex}>{score?.unit_scores?.[String(unitIndex + 1)] ?? ''}</td>
                ))}
                <td>{score?.between_total ?? ''}</td>
                <td>{score?.midterm_score ?? ''}</td>
                <td>{score?.final_score ?? ''}</td>
                <td>{score?.term_total ?? ''}</td>
                {term === 2 && <td>{score?.year_total ?? ''}</td>}
                {term === 2 && <td>{scoreText(score)}</td>}
                <td>{score?.result && score.result !== 'เรียน' ? score.result : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function AchievementSummaryPage({ data, pageNumber }: { data: ReportPayload | null; pageNumber?: number }) {
  const layout = usePp5SectionLayout('achievement')
  const pageStyle = usePp5PageStyle('achievement')
  const subjects = (data?.subjects || [])
    .slice()
    .sort((a, b) => a.order_number - b.order_number)
    .slice(0, 15)
  const students = data?.students || []

  return (
    <section className="report-page pp5-body-page pp5-achievement-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} />
      <header className="pp5-achievement-head">
        <div className="pp5-achievement-logo" aria-label="โลโก้โรงเรียน">
          {data?.school?.logo_url ? (
            <Image src={data.school.logo_url} alt={`โลโก้โรงเรียน${data.school.name || ''}`} width={layout.logoSizePx} height={layout.logoSizePx} unoptimized />
          ) : (
            <span>ตรา</span>
          )}
        </div>
        <div className="pp5-achievement-head-text">
          <h1>สรุปผลสัมฤทธิ์ทางการเรียนนักเรียนชั้นประถมศึกษาปีที่ {classLabel(data?.classroom || null)} ปีการศึกษา {data?.academicYear?.year_be || '-'}</h1>
          <p>
            โรงเรียน{data?.school?.name || '-'}
            {data?.school?.district ? <span>อำเภอ{data?.school?.district}</span> : null}
            {data?.school?.province ? <span>จังหวัด{data?.school?.province}</span> : null}
            <span>{expandEducationAreaOffice(data?.school?.area_office || data?.school?.department || '')}</span>
          </p>
        </div>
      </header>

      <table className="pp5-achievement-table">
        <colgroup>
          <col className="pp5-achievement-number-col" />
          <col className="pp5-achievement-code-col" />
          <col className="pp5-achievement-name-col" />
          {subjects.map(subject => (
            <Fragment key={subject.class_subject_id}>
              <col className="pp5-achievement-score-col" />
              <col className="pp5-achievement-grade-col" />
            </Fragment>
          ))}
          <col className="pp5-achievement-gpa-col" />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={3} className="pp5-achievement-vertical"><span>เลขที่</span></th>
            <th rowSpan={3} className="pp5-achievement-vertical"><span>เลขประจำตัว</span></th>
            <th rowSpan={3}>ชื่อ - สกุล</th>
            <th colSpan={subjects.length * 2 || 1}>รายวิชา</th>
            <th rowSpan={3} className="pp5-achievement-vertical"><span>เกรดเฉลี่ย</span></th>
          </tr>
          <tr>
            {subjects.length ? subjects.map(subject => (
              <th key={subject.class_subject_id} colSpan={2} className="pp5-achievement-subject-head">
                <span>{compactSubjectName(subject)}</span>
              </th>
            )) : <th>ไม่มีรายวิชา</th>}
          </tr>
          <tr>
            {subjects.map(subject => (
              <Fragment key={`${subject.class_subject_id}-sub`}>
                <th className="pp5-achievement-vertical pp5-achievement-score-head"><span>คะแนน</span></th>
                <th className="pp5-achievement-vertical pp5-achievement-grade-head"><span>เกรด</span></th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: pp5StudentTableRows(students.length, layout) }, (_, index) => {
            const student = students[index]
            const gpa = student ? studentGpa(data, student.id, subjects) : null
            return (
              <tr key={student?.id || `achievement-empty-${index}`}>
                <td>{student ? student.student_number || index + 1 : ''}</td>
                <td>{student?.student_code || ''}</td>
                <td className="text-left">{student ? studentName(student) : ''}</td>
                {subjects.map(subject => {
                  const score = student ? finalScoreForSubject(data, student.id, subject.class_subject_id) : null
                  return (
                    <Fragment key={`${student?.id || index}-${subject.class_subject_id}`}>
                      <td>{score?.year_total ?? score?.term_total ?? ''}</td>
                      <td>{score ? scoreText(score) : ''}</td>
                    </Fragment>
                  )
                })}
                <td>{gpa === null ? '' : gpa.toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function CharacterCriteriaPage({
  data,
  settings,
  pageNumber,
  pageMark,
  term = 0,
}: {
  data: ReportPayload | null
  settings: ReportCharacterSetting[]
  pageNumber?: number
  pageMark?: string
  term?: 0 | 1 | 2
}) {
  const pageStyle = usePp5PageStyle('criteria')
  const topics = characterCriteriaTopics(settings)

  return (
    <section className="report-page pp5-body-page pp5-character-criteria-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={pageMark} />
      <header className="pp5-character-head">
        <h1>คุณลักษณะอันพึงประสงค์</h1>
        <p>{subjectReportSubhead(data, term)}</p>
      </header>
      <table className="pp5-character-criteria-table">
        <colgroup>
          <col className="pp5-character-criteria-topic-col" />
          <col className="pp5-character-criteria-behavior-col" />
        </colgroup>
        <thead>
          <tr>
            <th>คุณลักษณะอันพึงประสงค์</th>
            <th>พฤติกรรมบ่งชี้</th>
          </tr>
        </thead>
        <tbody>
          {topics.map(topic => {
            const behaviorCount = Math.max(topic.behaviors.length, 1)
            return topic.behaviors.length > 0 ? (
              topic.behaviors.map((behavior, behaviorIndex) => (
                <tr key={`${topic.shortLabel}-${behavior.shortLabel}`}>
                  {behaviorIndex === 0 && (
                    <td rowSpan={behaviorCount} className="pp5-character-criteria-topic-cell">
                      <div className="pp5-character-criteria-topic-title">{topic.shortLabel}. {topic.label}</div>
                      <div className="pp5-character-criteria-topic-score">(คะแนน) {topic.maxScore}</div>
                    </td>
                  )}
                  <td className="pp5-character-criteria-behavior-cell">
                    <span className="pp5-character-criteria-behavior-no">{behavior.shortLabel}</span>
                    <span className="pp5-character-criteria-behavior-text">{behavior.label}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr key={topic.shortLabel}>
                <td className="pp5-character-criteria-topic-cell">
                  <div className="pp5-character-criteria-topic-title">{topic.shortLabel}. {topic.label}</div>
                  <div className="pp5-character-criteria-topic-score">(คะแนน) {topic.maxScore}</div>
                </td>
                <td className="pp5-character-criteria-behavior-cell" />
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function ReadingCriteriaPage({
  data,
  settings,
  pageNumber,
  pageMark,
  term = 0,
}: {
  data: ReportPayload | null
  settings: ReportReadingSetting[]
  pageNumber?: number
  pageMark?: string
  term?: 0 | 1 | 2
}) {
  const pageStyle = usePp5PageStyle('criteria')
  const topics = readingCriteriaTopics(settings)
  const rubricHeaders = [
    { key: '3', label: '3\n(ดีเยี่ยม)' },
    { key: '2', label: '2\n(ดี)' },
    { key: '1', label: '1\n(ผ่านเกณฑ์)' },
    { key: '0', label: '0\n(ปรับปรุง)' },
  ] as const

  return (
    <section className="report-page pp5-body-page pp5-character-criteria-page pp5-reading-criteria-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={pageMark} />
      <header className="pp5-character-head">
        <h1>อ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย</h1>
        <p>{subjectReportSubhead(data, term)}</p>
      </header>
      <table className="pp5-character-criteria-table pp5-reading-criteria-table">
        <colgroup>
          <col className="pp5-character-criteria-topic-col" />
          <col className="pp5-character-criteria-behavior-col" />
          <col className="pp5-reading-rubric-col" />
          <col className="pp5-reading-rubric-col" />
          <col className="pp5-reading-rubric-col" />
          <col className="pp5-reading-rubric-col" />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>มาตรฐาน</th>
            <th rowSpan={2}>ตัวชี้วัด</th>
            <th colSpan={4}>ระดับคุณภาพ</th>
          </tr>
          <tr>
            {rubricHeaders.map(header => (
              <th key={header.key} className="pp5-reading-rubric-head">{header.label.split('\n').map((line, index) => (
                <span key={`${header.key}-${index}`}>{index > 0 ? <><br />{line}</> : line}</span>
              ))}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topics.map(topic => {
            const indicatorCount = Math.max(topic.indicators.length, 1)
            return topic.indicators.length > 0 ? (
              topic.indicators.map((indicator, indicatorIndex) => (
                <tr key={`${topic.shortLabel}-${indicator.shortLabel}`}>
                  {indicatorIndex === 0 && (
                    <td rowSpan={indicatorCount} className="pp5-character-criteria-topic-cell">
                      <div className="pp5-character-criteria-topic-title">{topic.shortLabel}. {topic.label}</div>
                      <div className="pp5-character-criteria-topic-score">(คะแนน) {topic.maxScore}</div>
                    </td>
                  )}
                  <td className="pp5-character-criteria-behavior-cell">
                    <span className="pp5-character-criteria-behavior-no">{indicator.shortLabel}</span>
                    <span className="pp5-character-criteria-behavior-text">{indicator.label}</span>
                  </td>
                  {rubricHeaders.map(header => (
                    <td key={`${indicator.shortLabel}-${header.key}`} className="pp5-reading-rubric-cell">
                      {indicator.rubricLevels?.[header.key as '0' | '1' | '2' | '3'] || ''}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr key={topic.shortLabel}>
                <td className="pp5-character-criteria-topic-cell">
                  <div className="pp5-character-criteria-topic-title">{topic.shortLabel}. {topic.label}</div>
                  <div className="pp5-character-criteria-topic-score">(คะแนน) {topic.maxScore}</div>
                </td>
                <td className="pp5-character-criteria-behavior-cell" />
                {rubricHeaders.map(header => (
                  <td key={`${topic.shortLabel}-${header.key}`} className="pp5-reading-rubric-cell" />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function CriteriaReportPages({
  data,
  characterSettings,
  readingSettings,
  pageStart,
  pageMark,
  term = 0,
}: {
  data: ReportPayload | null
  characterSettings: ReportCharacterSetting[]
  readingSettings: ReportReadingSetting[]
  pageStart?: number
  pageMark?: string
  term?: 0 | 1 | 2
}) {
  return (
    <>
      <CharacterCriteriaPage
        data={data}
        settings={characterSettings}
        pageNumber={pageStart}
        pageMark={pageMark}
        term={term}
      />
      <ReadingCriteriaPage
        data={data}
        settings={readingSettings}
        pageNumber={pageStart ? pageStart + 1 : undefined}
        pageMark={pageMark}
        term={term}
      />
    </>
  )
}

function CharacterReportPages({
  data,
  rows,
  pageStart,
  pageMark,
  term = 0,
}: {
  data: ReportPayload | null
  rows: Record<string, string | number | null>[]
  pageStart?: number
  pageMark?: string
  term?: 0 | 1 | 2
}) {
  const start = pageStart || 1
  return (
    <>
      {withStudentChunks(data, (pageData, pageIndex) => (
        <CharacterEvaluationPage
          key={`character-${pageIndex}`}
          data={pageData}
          rows={rows}
          pageNumber={start + pageIndex}
          pageMark={pageMark}
          term={term}
        />
      ))}
    </>
  )
}

function CharacterEvaluationPage({
  data,
  rows,
  pageNumber,
  pageMark,
  term = 0,
}: {
  data: ReportPayload | null
  rows: Record<string, string | number | null>[]
  pageNumber?: number
  pageMark?: string
  term?: 0 | 1 | 2
}) {
  const layout = usePp5SectionLayout('character')
  const pageStyle = usePp5PageStyle('character')
  const students = data?.students || []
  const scoreColumns = 10

  return (
    <section className="report-page pp5-body-page pp5-character-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={pageMark} />
      <header className="pp5-character-head">
        <h1>ผลการประเมินคุณลักษณะอันพึงประสงค์</h1>
        <p>{subjectReportSubhead(data, term)}</p>
      </header>
      <table className="pp5-character-table">
        <colgroup>
          <col className="pp5-character-number-col" />
          <col className="pp5-character-code-col" />
          <col className="pp5-character-name-col" />
          {Array.from({ length: scoreColumns }, (_, index) => <col key={index} className="pp5-character-score-col" />)}
          <col className="pp5-character-level-col" />
          <col className="pp5-character-result-col" />
          <col className="pp5-character-note-col" />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={4} className="pp5-character-vertical"><span>เลขที่</span></th>
            <th rowSpan={4} className="pp5-character-vertical"><span>เลขประจำตัว</span></th>
            <th rowSpan={4}>ชื่อ - สกุล</th>
            <th colSpan={scoreColumns}>ผลประเมินคุณลักษณะอันพึงประสงค์</th>
            <th colSpan={2}>ผลการประเมิน</th>
            <th rowSpan={4}>หมายเหตุ</th>
          </tr>
          <tr>
            <th colSpan={scoreColumns}>ข้อ/คะแนน</th>
            <th rowSpan={3}>ระดับ</th>
            <th rowSpan={3}>ผล</th>
          </tr>
          <tr>
            {Array.from({ length: scoreColumns }, (_, index) => <th key={index}>{index < CHARACTER_KEYS.length ? index + 1 : ''}</th>)}
          </tr>
          <tr>
            {Array.from({ length: scoreColumns }, (_, index) => <th key={index}>{index < CHARACTER_KEYS.length ? 3 : ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: pp5StudentTableRows(students.length, layout) }, (_, index) => {
            const student = students[index]
            const row = student ? (term !== 0 ? rowForTerm(rows, student.id, term) : rowFor(rows, student.id)) : null
            const fallbackResult = levelFromAverage(averageScore(row, CHARACTER_KEYS))
            const result = (row?.result_level as string | null) || (fallbackResult === '-' ? '' : fallbackResult)
            return (
              <tr key={student?.id || `empty-character-${index}`}>
                <td>{student ? student.student_number || index + 1 : ''}</td>
                <td>{student?.student_code || ''}</td>
                <td className="text-left">{student ? studentName(student) : ''}</td>
                {Array.from({ length: scoreColumns }, (_, scoreIndex) => (
                  <td key={scoreIndex}>{scoreIndex < CHARACTER_KEYS.length ? row?.[CHARACTER_KEYS[scoreIndex]] ?? '' : ''}</td>
                ))}
                <td>{resultLevelNumber(result)}</td>
                <td>{result}</td>
                <td />
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function ReadingEvaluationPage({
  data,
  rows,
  pageNumber,
  pageMark,
  term = 0,
}: {
  data: ReportPayload | null
  rows: Record<string, string | number | null>[]
  pageNumber?: number
  pageMark?: string
  term?: 0 | 1 | 2
}) {
  const layout = usePp5SectionLayout('reading')
  const pageStyle = usePp5PageStyle('reading')
  const students = data?.students || []
  const readingGroups = defaultReadingTableGroups()
  const readingColumns = readingTableFlatColumns(readingGroups)

  const columnValue = (row: Record<string, string | number | null> | null, column: ReadingTableColumn) =>
    readingTableColumnValue(row, column)

  const columnKey = (column: ReadingTableColumn, index: number) =>
    column.kind === 'score' ? column.key : column.kind === 'total' ? `total-${index}` : `spacer-${index}`

  const columnLabel = (column: ReadingTableColumn) =>
    column.kind === 'score' || column.kind === 'total' ? column.label : ''

  return (
    <section className="report-page pp5-body-page pp5-reading-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={pageMark} />
      <header className="pp5-reading-head">
        <h1>ผลการประเมินอ่าน คิดวิเคราะห์ และเขียนสื่อความหมาย</h1>
        <p>{subjectReportSubhead(data, term)}</p>
      </header>
      <table className="pp5-reading-table">
        <colgroup>
          <col className="pp5-reading-number-col" />
          <col className="pp5-reading-code-col" />
          <col className="pp5-reading-name-col" />
          {readingColumns.map((column, index) => <col key={columnKey(column, index)} className="pp5-reading-score-col" />)}
          <col className="pp5-reading-total-col" />
          <col className="pp5-reading-level-col" />
          <col className="pp5-reading-result-col" />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={4} className="pp5-reading-vertical"><span>เลขที่</span></th>
            <th rowSpan={4} className="pp5-reading-vertical"><span>เลขประจำตัว</span></th>
            <th rowSpan={4}>ชื่อ - สกุล</th>
            <th colSpan={readingColumns.length}>ผลประเมินอ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย</th>
            <th rowSpan={4} className="pp5-reading-vertical"><span>รวมทั้งหมด</span></th>
            <th colSpan={2}>ผลการประเมิน</th>
          </tr>
          <tr>
            <th colSpan={3}>1. การอ่าน</th>
            <th colSpan={3}>2. การคิดวิเคราะห์</th>
            <th colSpan={3}>3. การเขียน</th>
            <th rowSpan={3}>ระดับ</th>
            <th rowSpan={3}>ผล</th>
          </tr>
          <tr>
            {readingColumns.map((column, index) => <th key={columnKey(column, index)}>{columnLabel(column)}</th>)}
          </tr>
          <tr>
            {readingColumns.map((column, index) => <th key={`max-${columnKey(column, index)}`}>{readingTableColumnMax(column)}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: pp5StudentTableRows(students.length, layout) }, (_, index) => {
            const student = students[index]
            const row = student ? (term !== 0 ? rowForTerm(rows, student.id, term) : rowFor(rows, student.id)) : null
            const total = row ? Number(row.total_score ?? READING_KEYS.reduce((sum, key) => sum + Number(row[key] ?? 0), 0)) : ''
            const fallbackResult = levelFromAverage(averageScore(row, READING_KEYS))
            const result = (row?.result_level as string | null) || (fallbackResult === '-' ? '' : fallbackResult)
            return (
              <tr key={student?.id || `empty-reading-${index}`}>
                <td>{student ? student.student_number || index + 1 : ''}</td>
                <td>{student?.student_code || ''}</td>
                <td className="text-left">{student ? studentName(student) : ''}</td>
                {readingColumns.map((column, columnIndex) => <td key={columnKey(column, columnIndex)}>{columnValue(row, column)}</td>)}
                <td>{total}</td>
                <td>{resultLevelNumber(result)}</td>
                <td>{result}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function CompetencyEvaluationPage({
  data,
  rows,
  pageNumber,
  pageMark,
  term = 0,
}: {
  data: ReportPayload | null
  rows: Record<string, string | number | null>[]
  pageNumber?: number
  pageMark?: string
  term?: 0 | 1 | 2
}) {
  const layout = usePp5SectionLayout('competency')
  const pageStyle = usePp5PageStyle('competency')
  const students = data?.students || []
  const rowCount = pp5StudentTableRows(students.length, layout)

  return (
    <section className="report-page pp5-body-page pp5-competency-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} mark={pageMark} />
      <header className="pp5-competency-head">
        <h1>ผลการประเมินสมรรถนะสำคัญของผู้เรียน</h1>
        <p>{subjectReportSubhead(data, term)}</p>
      </header>
      <table className="pp5-competency-table">
        <colgroup>
          <col className="pp5-competency-number-col" />
          <col className="pp5-competency-name-col" />
          {COMPETENCY_KEYS.map(key => <col key={key} className="pp5-competency-score-col" />)}
          <col className="pp5-competency-result-col" />
        </colgroup>
        <thead>
          <tr>
            <th>ที่</th>
            <th>ชื่อ - สกุล</th>
            {COMPETENCY_LABELS.map(label => <th key={label}>{label}</th>)}
            <th>สรุป</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, index) => {
            const student = students[index]
            const row = student ? (term !== 0 ? rowForTerm(rows, student.id, term) : rowFor(rows, student.id)) : null
            const fallbackResult = levelFromAverage(averageScore(row, COMPETENCY_KEYS))
            const result = (row?.result_level as string | null) || (fallbackResult === '-' ? '' : fallbackResult)
            return (
              <tr key={student?.id || `empty-competency-${index}`}>
                <td>{student ? student.student_number || index + 1 : ''}</td>
                <td className="text-left">{student ? studentName(student) : ''}</td>
                {COMPETENCY_KEYS.map(key => <td key={key}>{row?.[key] ?? (student ? '–' : '')}</td>)}
                <td>{result}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function ActivityEvaluationPage({
  data,
  rows,
  pageNumber,
}: {
  data: ReportPayload | null
  rows: Record<string, string | number | null>[]
  pageNumber?: number
}) {
  const layout = usePp5SectionLayout('activities')
  const pageStyle = usePp5PageStyle('activities')
  const students = data?.students || []

  return (
    <section className="report-page pp5-body-page pp5-activity-page" style={pageStyle}>
      <ReportPageNumber value={pageNumber} />
      <header className="pp5-activity-head">
        <h1>ผลการประเมินกิจกรรมพัฒนาผู้เรียน</h1>
        <p>
          นักเรียนชั้นประถมศึกษาปีที่ <b>{classLabel(data?.classroom || null)}</b>
          <span>โรงเรียน{data?.school?.name || '-'}</span>
          <span>ปีการศึกษา</span><b>{data?.academicYear?.year_be || '-'}</b>
        </p>
      </header>
      <table className="pp5-activity-table">
        <colgroup>
          <col className="pp5-activity-number-col" />
          <col className="pp5-activity-name-col" />
          {ACTIVITY_KEYS.map(key => <col key={key} className="pp5-activity-score-col" />)}
          <col className="pp5-activity-result-col" />
        </colgroup>
        <thead>
          <tr>
            <th>ที่</th>
            <th>ชื่อ - สกุล</th>
            {ACTIVITY_LABELS.map(label => <th key={label}>{label}</th>)}
            <th>สรุป</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: pp5StudentTableRows(students.length, layout) }, (_, index) => {
            const student = students[index]
            const row = student ? rowFor(rows, student.id) : null
            return (
              <tr key={student?.id || `empty-activity-${index}`}>
                <td>{student ? student.student_number || index + 1 : ''}</td>
                <td className="text-left">{student ? studentName(student) : ''}</td>
                {ACTIVITY_KEYS.map(key => <td key={key}>{row?.[key] ?? (student ? '–' : '')}</td>)}
                <td>{row?.overall_result || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function Pp6Page({
  data,
  term,
  selectedStudentId,
  individual,
  ranked,
  showGrade,
}: {
  data: ReportPayload | null
  term: 1 | 2 | 0
  selectedStudentId: string
  individual: boolean
  ranked: boolean
  showGrade: boolean
}) {
  const layout = usePp6SectionLayout()
  const pageStyle = usePp6PageStyle()
  const subjects = data?.subjects || []
  const baseStudents = individual && selectedStudentId
    ? (data?.students || []).filter(student => student.id === selectedStudentId)
    : data?.students || []
  const rankMap = buildPp6RankMap(data, subjects, term)
  const directorSignPosition = directorActingPositionLine(data?.school)

  return (
    <>
      {baseStudents.map(student => {
        const paddedSubjects: Array<ReportSubject | null> = [...subjects]
        while (paddedSubjects.length < layout.minSubjectRows) paddedSubjects.push(null)
        const characterRow = rowForTerm(data?.evaluations.character || [], student.id, term)
        const readingRow = rowForTerm(data?.evaluations.reading || [], student.id, term)
        const activityRow = rowFor(data?.evaluations.activities || [], student.id)
        const gpa = studentGpa(data, student.id, subjects)
        const basicUnits = subjects.filter(subject => pp6SubjectType(subject) === 'พื้นฐาน').reduce((sum, subject) => sum + pp6SubjectWeight(subject), 0)
        const electiveUnits = subjects.filter(subject => pp6SubjectType(subject) === 'เพิ่มเติม').reduce((sum, subject) => sum + pp6SubjectWeight(subject), 0)
        return (
          <section key={student.id} className="report-page pp6-page" style={pageStyle}>
            <div className="pp6-doc-mark">ปพ.6</div>
            <header className="pp6-head">
              <div className="pp6-logo" aria-label="โลโก้โรงเรียน">
                {data?.school?.logo_url ? (
                  <Image src={data.school.logo_url} alt={`โลโก้โรงเรียน${data.school.name || ''}`} width={58} height={58} unoptimized />
                ) : (
                  <span>{data?.school?.name?.slice(0, 2) || 'รร'}</span>
                )}
              </div>
              <div>
                <h1>{term === 1 ? 'แบบรายงานความก้าวหน้าการเรียน ภาคเรียนที่ 1' : 'แบบรายงานผลการพัฒนาคุณภาพผู้เรียนรายบุคคล'} <b>ปีการศึกษา</b> {data?.academicYear?.year_be || '-'}</h1>
                <p><b>โรงเรียน</b>{data?.school?.name || '-'} <b>อำเภอ</b> {data?.school?.district || '-'} {schoolOfficeLine(data)}</p>
              </div>
            </header>

            <div className="pp6-student-line">
              <span><b>เลขประจำตัวนักเรียน</b> <b>{student.student_code || '-'}</b></span>
              <span><b>ชื่อ-นามสกุล</b> <b>{studentName(student)}</b></span>
              <span><b>ชั้น</b> <b>{classLabel(data?.classroom || null)}</b></span>
              <span><b>{termTitle(term)}</b></span>
            </div>

            <table className="pp6-score-table">
              <colgroup>
                <col className="pp6-no-col" />
                <col className="pp6-code-col" />
                <col className="pp6-name-col" />
                <col className="pp6-type-col" />
                <col className="pp6-weight-col" />
                <col className="pp6-score-col" />
                <col className="pp6-grade-col" />
                <col className="pp6-score-col" />
                <col className="pp6-grade-col" />
                <col className="pp6-score-col" />
                <col className="pp6-grade-col" />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2}>ที่</th>
                  <th rowSpan={2}>รหัสวิชา</th>
                  <th rowSpan={2}>ชื่อวิชา</th>
                  <th rowSpan={2}>ประเภท</th>
                  <th rowSpan={2}>น้ำหนัก</th>
                  <th colSpan={2}>ภาคเรียนที่ 1</th>
                  <th colSpan={2}>ภาคเรียนที่ 2</th>
                  <th colSpan={2}>ปีการศึกษา</th>
                </tr>
                <tr>
                  <th>คะแนน</th>
                  <th>เกรด</th>
                  <th>คะแนน</th>
                  <th>เกรด</th>
                  <th>คะแนน</th>
                  <th>เกรด</th>
                </tr>
              </thead>
              <tbody>
                {paddedSubjects.map((subject, index) => {
                  if (!subject) {
                    return (
                      <tr key={`empty-${index}`}>
                        <td>{index + 1}</td>
                        <td />
                        <td />
                        <td />
                        <td />
                        <td />
                        <td className={term === 1 && !showGrade ? 'pp6-muted-cell' : undefined} />
                        <td className={term === 1 ? 'pp6-muted-cell' : undefined} />
                        <td className={term === 1 ? 'pp6-muted-cell' : undefined} />
                        <td className={term === 1 ? 'pp6-muted-cell' : undefined} />
                        <td className={term === 1 ? 'pp6-muted-cell' : undefined} />
                      </tr>
                    )
                  }
                  const term1 = pp6TermScore(data, student.id, subject.class_subject_id, 1)
                  const term2 = pp6TermScore(data, student.id, subject.class_subject_id, 2)
                  const annual = pp6AnnualScore(data, student.id, subject.class_subject_id)
                  return (
                    <tr key={subject.class_subject_id}>
                      <td>{index + 1}</td>
                      <td>{subject.subject.code}</td>
                      <td className="text-left">{subject.subject.name}</td>
                      <td>{pp6SubjectType(subject)}</td>
                      <td>{formatPp6Number(pp6SubjectWeight(subject))}</td>
                      <td>{formatPp6Number(term1.total)}</td>
                      <td className={term === 1 && !showGrade ? 'pp6-muted-cell' : undefined}>{term !== 1 || showGrade ? formatPp6Number(term1.grade, 1) : ''}</td>
                      <td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : formatPp6Number(term2.total)}</td>
                      <td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : formatPp6Number(term2.grade, 1)}</td>
                      <td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : formatPp6Number(annual.total)}</td>
                      <td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : formatPp6Number(annual.grade, 1)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {ranked && term === 1 && (
              <div className="pp6-gpa-line">
                ได้อันดับที่ <b>{rankMap.get(student.id) || '-'}</b> ของห้อง
              </div>
            )}

            {term === 1 && (
              <div className="pp6-term-one-note">
                หมายเหตุ.- ภาคเรียนที่ 1 จะเป็นการรายงานความก้าวหน้าทางการเรียนของผู้เรียน ส่วนผลการพัฒนาคุณภาพผู้เรียน นั้น โรงเรียนจะรายงานให้ผู้ปกครองทราบเมื่อสิ้นปีการศึกษา เกรดที่แสดงนี้ เป็นเพียงการเทียบเคียงเกณฑ์การวัดผล ไม่ใช่เกรดจริง
              </div>
            )}

            <table className="pp6-activity-table">
              <thead>
                <tr>
                  <th colSpan={2}>กิจกรรมพัฒนาผู้เรียน</th>
                  <th>จำนวนชั่วโมง</th>
                  <th>ผลการประเมิน</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITY_LABELS.map((label, index) => (
                  <tr key={label}>
                    <td>{pp6ActivityCode(data, index)}</td>
                    <td className="text-left">{pp6ActivityLabel(data, index)}</td>
                    <td>{pp6ActivityHours(data, index)}</td>
                    <td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : activityRow?.[ACTIVITY_KEYS[index]] || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {term !== 1 && (
              <div className="pp6-gpa-line">
                ผลการเรียนเฉลี่ย (GPA) <b>{gpa === null ? '-' : gpa.toFixed(2)}</b>
                {ranked && <span> ได้อันดับที่ <b>{rankMap.get(student.id) || '-'}</b> ของห้อง</span>}
              </div>
            )}

            <div className="pp6-bottom-grid">
              <table className="pp6-summary-table">
                <thead>
                  <tr><th colSpan={2}>สรุปผลการประเมิน</th></tr>
                </thead>
                <tbody>
                  <tr><td>จำนวนหน่วยกิต/น้ำหนักวิชาพื้นฐานที่ได้</td><td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : formatPp6Number(basicUnits)}</td></tr>
                  <tr><td>จำนวนหน่วยกิต/น้ำหนักวิชาเพิ่มเติมที่ได้</td><td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : formatPp6Number(electiveUnits)}</td></tr>
                  <tr><td>รวมจำนวนหน่วยกิต/น้ำหนักที่ได้</td><td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : formatPp6Number(basicUnits + electiveUnits)}</td></tr>
                  <tr><th colSpan={2}>การประเมินคุณลักษณะ</th></tr>
                  <tr><td>ผลการประเมินคุณลักษณะอันพึงประสงค์</td><td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : levelFromAverage(averageScore(characterRow, CHARACTER_KEYS))}</td></tr>
                  <tr><td>ผลการประเมินการอ่าน คิด วิเคราะห์และเขียน</td><td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : levelFromAverage(averageScore(readingRow, READING_KEYS))}</td></tr>
                  <tr><td>ผลการประเมินกิจกรรมพัฒนาผู้เรียน</td><td className={term === 1 ? 'pp6-muted-cell' : undefined}>{term === 1 ? '' : activityRow?.overall_result || '-'}</td></tr>
                </tbody>
              </table>

              <div className="pp6-signatures">
                <div>
                  <PrintSignatureSlot url={data?.documentSignatures?.homeroom} asLine />
                  <p>({homeroomTeacherLine(data?.classroom)})</p>
                  <span>ครูประจำชั้น</span>
                </div>
                <div>
                  <PrintSignatureSlot url={data?.documentSignatures?.director} asLine />
                  <p>({directorDisplayName(data?.school)})</p>
                  {directorSignPosition && <span>{directorSignPosition}</span>}
                  <span>{directorSchoolLine(data?.school)}</span>
                </div>
              </div>
            </div>
          </section>
        )
      })}
    </>
  )
}

export default function ReportBuilder({ mode }: { mode: ReportMode }) {
  const searchParams = useSearchParams()
  const printMode = searchParams.get('print') === '1'
  const embedMode = searchParams.get('embed') === '1'
  const deepLinkMode = printMode || embedMode
  const [init, setInit] = useState<InitData | null>(null)
  const [yearId, setYearId] = useState('')
  const [level, setLevel] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [term, setTerm] = useState<0 | 1 | 2>(1)
  const [pp6Term, setPp6Term] = useState<0 | 1 | 2>(1)
  const [classSubjectId, setClassSubjectId] = useState('')
  const [subjectOptions, setSubjectOptions] = useState<ReportSubject[]>([])
  const [sections, setSections] = useState<PrintSection[]>(DEFAULT_SECTIONS[mode])
  const [data, setData] = useState<ReportPayload | null>(null)
  const [logoResolved, setLogoResolved] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scale, setScale] = useState(88)
  const [pp6Individual, setPp6Individual] = useState(true)
  const [pp6Ranked, setPp6Ranked] = useState(true)
  const [pp6ShowGrade, setPp6ShowGrade] = useState(true)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [pp6StudentOptions, setPp6StudentOptions] = useState<ReportPp6StudentOption[]>([])
  const [pp5TunerOpen, setPp5TunerOpen] = useState(false)
  const [layoutSaved, setLayoutSaved] = useState(false)
  const [pp5TunerSection, setPp5TunerSection] = useState<Pp5PrintSection>('coverClass')
  /** ปพ.6: พรีวิว HTML หรือ PDF จริงจาก jsPDF */
  const [pp6PreviewMode, setPp6PreviewMode] = useState<'html' | 'pdf'>('pdf')
  const { layouts: pp5PrintLayouts, setLayouts: setPp5PrintLayouts } = usePp5PrintLayoutsState()
  const { layouts: pp6PrintLayouts, setLayouts: setPp6PrintLayouts } = usePp6PrintLayoutsState()

  useEffect(() => {
    fetchReportInit(mode).then(result => {
      setInit(result)
      if (deepLinkMode) return
      const years = result.years as ReportYear[]
      const classrooms = result.classrooms as ReportClassroom[]
      const active = years.find(year => year.is_active) || years[0]
      const yearClassrooms = classrooms.filter(item => item.academic_year_id === active?.id)
      const initialLevels = uniqueLevels(yearClassrooms)
      const firstLevel = initialLevels[0] || ''
      const firstClassroom = yearClassrooms.find(item => item.level === firstLevel) || yearClassrooms[0]
      setYearId(active?.id || '')
      if (mode === 'pp5-class') {
        setTerm(0)
        setLevel('')
        setClassroomId('')
      } else if (mode === 'pp5-subject') {
        setLevel(firstLevel)
        setClassroomId(firstClassroom?.id || '')
        setTerm(isSecondaryClassLevel(firstLevel) ? 1 : 0)
      } else if (mode === 'pp6') {
        setLevel(firstLevel)
        setClassroomId('')
      } else {
        setLevel(firstLevel)
        setClassroomId(firstClassroom?.id || '')
      }
    }).catch((err: Error) => setError(err.message))
  }, [mode, deepLinkMode])

  useEffect(() => {
    if (!deepLinkMode || !init) return
    const params = new URLSearchParams(window.location.search)
    const yearParam = params.get('year')
    const levelParam = params.get('level')
    const classroomParam = params.get('classroom')
    const termParam = params.get('term')
    const sectionsParam = params.get('sections')
    const subjectParam = params.get('subject')
    const studentParam = params.get('student')
    const individualParam = params.get('individual')
    const rankedParam = params.get('ranked')
    const showGradeParam = params.get('showGrade')
    if (yearParam) setYearId(yearParam)
    if (levelParam) setLevel(levelParam)
    if (classroomParam) setClassroomId(classroomParam)
    if (termParam !== null) {
      const value = Number(termParam) as 0 | 1 | 2
      setTerm(value)
      setPp6Term(value)
    }
    if (sectionsParam !== null) setSections(sectionsParam.split(',').filter(Boolean) as PrintSection[])
    else if (embedMode) setSections(DEFAULT_SECTIONS[mode])
    if (subjectParam) setClassSubjectId(subjectParam)
    if (studentParam) setSelectedStudentId(studentParam)
    if (individualParam !== null) setPp6Individual(individualParam === '1')
    if (rankedParam !== null) setPp6Ranked(rankedParam !== '0')
    if (showGradeParam !== null) setPp6ShowGrade(showGradeParam !== '0')
  }, [deepLinkMode, embedMode, init, mode])

  const userRole = init?.role || ''
  // super admin เปิด/ปิดเมนู "ปรับ layout" ต่อโรงเรียน (ค่าเริ่มต้น = เปิด)
  const layoutTunerEnabled = init?.layoutTunerEnabled !== false
  const years = useMemo(() => (init?.years || []) as ReportYear[], [init])
  const classrooms = useMemo(() => (init?.classrooms || []) as ReportClassroom[], [init])
  const yearClassrooms = useMemo(
    () => classrooms.filter(item => item.academic_year_id === yearId),
    [classrooms, yearId],
  )
  const levels = useMemo(() => uniqueLevels(yearClassrooms), [yearClassrooms])
  const filteredClassrooms = useMemo(
    () => yearClassrooms.filter(item => !level || item.level === level),
    [yearClassrooms, level],
  )
  const classroomOptions = level ? filteredClassrooms : []
  const pp6ClassroomIdsForLevel = useMemo(
    () => new Set(yearClassrooms.filter(classroom => !level || classroom.level === level).map(classroom => classroom.id)),
    [yearClassrooms, level],
  )
  const pp6StudentsForLevel = useMemo(
    () => pp6StudentOptions.filter(student => pp6ClassroomIdsForLevel.has(student.classroom_id)),
    [pp6StudentOptions, pp6ClassroomIdsForLevel],
  )
  const selectedSubject = data?.subjects.find(subject => subject.class_subject_id === classSubjectId)
    || subjectOptions.find(subject => subject.class_subject_id === classSubjectId)
    || null
  const reportTerm = useMemo(() => {
    if (mode === 'pp5-subject') return pp5SubjectReportTerm(level, term)
    if (mode === 'pp6') return pp6Term
    return term
  }, [mode, level, term, pp6Term])
  const showPp5SubjectTerm = mode === 'pp5-subject' && isSecondaryClassLevel(level)
  const pageNumbers = useMemo(
    () => reportPageStarts(data, mode, sections, reportTerm, selectedSubject),
    [data, mode, sections, reportTerm, selectedSubject],
  )
  const pp5TunerSections = useMemo(() => {
    if (mode === 'pp6') return []
    const picked = new Set<Pp5PrintSection>()
    for (const section of sections) {
      if (!(ALL_SECTIONS[mode] as readonly PrintSection[]).includes(section)) continue
      if (section === 'cover') {
        picked.add('coverClass')
        picked.add('coverSubject')
      } else {
        picked.add(section as Pp5PrintSection)
      }
    }
    return PP5_PRINT_SECTIONS.filter(section => picked.has(section))
  }, [mode, sections])

  useEffect(() => {
    if (mode === 'pp6' || pp5TunerSections.length === 0) return
    const preferred = sections.find(section => pp5TunerSections.includes(section as Pp5PrintSection)) as Pp5PrintSection | undefined
    if (!pp5TunerSections.includes(pp5TunerSection)) {
      setPp5TunerSection(preferred || pp5TunerSections[0])
    }
  }, [mode, sections, pp5TunerSection, pp5TunerSections])

  useEffect(() => {
    setLayoutSaved(false)
  }, [pp5PrintLayouts, pp6PrintLayouts])

  const savePrintLayouts = useCallback(() => {
    if (mode === 'pp6') {
      savePp6PrintLayouts(pp6PrintLayouts)
    } else {
      savePp5PrintLayouts(pp5PrintLayouts)
    }
    setLayoutSaved(true)
    window.setTimeout(() => setLayoutSaved(false), 2000)
  }, [mode, pp5PrintLayouts, pp6PrintLayouts])

  const loadSubjectOptions = useCallback(async (activeRef?: { active: boolean }) => {
    if (!yearId || !classroomId) return
    setLoading(true)
    setError('')
    try {
      const result = await fetchReportSubjects({ academicYearId: yearId, classroomId, mode })
      if (activeRef && !activeRef.active) return
      setSubjectOptions(result)
    } catch (err) {
      if (activeRef && !activeRef.active) return
      setError(err instanceof Error ? err.message : 'โหลดรายวิชาไม่สำเร็จ')
    } finally {
      if (!activeRef || activeRef.active) setLoading(false)
    }
  }, [yearId, classroomId, mode])

  const loadSubjectPreview = useCallback(async (activeRef?: { active: boolean }) => {
    if (!yearId || !classroomId || !classSubjectId) return
    setLoading(true)
    setError('')
    try {
      const result = await fetchReportData({
        academicYearId: yearId,
        classroomId,
        term: reportTerm,
        classSubjectId: classSubjectId || undefined,
        mode,
      })
      if (activeRef && !activeRef.active) return
      setData(result)
    } catch (err) {
      if (activeRef && !activeRef.active) return
      setError(err instanceof Error ? err.message : 'โหลดรายงานไม่สำเร็จ')
    } finally {
      if (!activeRef || activeRef.active) setLoading(false)
    }
  }, [yearId, classroomId, reportTerm, classSubjectId, mode])

  const loadClassPreview = useCallback(async (activeRef?: { active: boolean }) => {
    if (!yearId || !classroomId) return
    setLoading(true)
    setError('')
    try {
      const result = await fetchReportData({
        academicYearId: yearId,
        classroomId,
        term,
        mode,
      })
      if (activeRef && !activeRef.active) return
      setData(result)
    } catch (err) {
      if (activeRef && !activeRef.active) return
      setError(err instanceof Error ? err.message : 'โหลดรายงานไม่สำเร็จ')
    } finally {
      if (!activeRef || activeRef.active) setLoading(false)
    }
  }, [yearId, classroomId, term, mode])

  useEffect(() => {
    if (deepLinkMode || mode === 'pp5-class' || !yearId) return
    if (levels.length === 0) {
      if (level || classroomId) {
        setLevel('')
        setClassroomId('')
        resetData()
      }
      return
    }
    if (!level || !levels.includes(level)) {
      const nextLevel = levels[0]
      const nextClassroom = yearClassrooms.find(item => item.level === nextLevel)
      setLevel(nextLevel)
      setClassroomId(nextClassroom?.id || '')
      resetData()
      return
    }
    if (classroomId && !yearClassrooms.some(item => item.id === classroomId && item.level === level)) {
      const nextClassroom = yearClassrooms.find(item => item.level === level)
      setClassroomId(nextClassroom?.id || '')
      resetData()
    }
  }, [yearId, levels, yearClassrooms, mode, printMode])

  useEffect(() => {
    if (mode !== 'pp5-subject' || !level) return
    if (!isSecondaryClassLevel(level)) {
      if (term !== 0) setTerm(0)
    } else if (term === 0) {
      setTerm(1)
    }
  }, [mode, level, term])

  useEffect(() => {
    if (mode !== 'pp5-subject' || !yearId || !classroomId) return
    const activeRef = { active: true }
    const timer = window.setTimeout(() => {
      if (classSubjectId) void loadSubjectPreview(activeRef)
      else void loadSubjectOptions(activeRef)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      activeRef.active = false
    }
  }, [mode, yearId, classroomId, classSubjectId, reportTerm, loadSubjectOptions, loadSubjectPreview])

  useEffect(() => {
    if (mode !== 'pp5-class' || !yearId || !level || !classroomId) return
    const activeRef = { active: true }
    const timer = window.setTimeout(() => {
      void loadClassPreview(activeRef)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      activeRef.active = false
    }
  }, [mode, yearId, term, level, classroomId, loadClassPreview])

  useEffect(() => {
    if (mode !== 'pp6' || !yearId) {
      setPp6StudentOptions([])
      return
    }
    const activeRef = { active: true }
    fetchPp6Students(yearId)
      .then(students => {
        if (!activeRef.active) return
        setPp6StudentOptions(students)
      })
      .catch((err: unknown) => {
        if (activeRef.active) setError(err instanceof Error ? err.message : 'โหลดรายชื่อนักเรียนไม่สำเร็จ')
      })
    return () => { activeRef.active = false }
  }, [mode, yearId])

  useEffect(() => {
    if (mode !== 'pp6') return
    if (deepLinkMode && classroomId) return
    setSelectedStudentId(prev => {
      if (prev && pp6StudentsForLevel.some(student => student.id === prev)) return prev
      return ''
    })
  }, [mode, level, pp6StudentsForLevel, deepLinkMode, classroomId])

  useEffect(() => {
    if (mode !== 'pp6' || !yearId || !level) return

    let targetClassroomId = ''
    if (selectedStudentId) {
      const student = pp6StudentsForLevel.find(item => item.id === selectedStudentId)
      if (student) targetClassroomId = student.classroom_id
    }
    if (!targetClassroomId) targetClassroomId = classroomId
    if (!targetClassroomId) {
      targetClassroomId = yearClassrooms.find(item => item.level === level)?.id
        || pp6StudentsForLevel[0]?.classroom_id
        || ''
    }
    if (!targetClassroomId) return

    const activeRef = { active: true }
    if (printMode) {
      (window as unknown as { __REPORT_READY__?: boolean }).__REPORT_READY__ = false
    }
    setLoading(true)
    setError('')
    if (classroomId !== targetClassroomId) setClassroomId(targetClassroomId)
    fetchReportData({ academicYearId: yearId, classroomId: targetClassroomId, term: 0, mode: 'pp6' })
      .then(result => {
        if (!activeRef.active) return
        setData(result)
      })
      .catch((err: unknown) => {
        if (activeRef.active) setError(err instanceof Error ? err.message : 'โหลดรายงานไม่สำเร็จ')
      })
      .finally(() => {
        if (activeRef.active) setLoading(false)
      })
    return () => { activeRef.active = false }
  }, [mode, yearId, level, selectedStudentId, classroomId, pp6StudentsForLevel, yearClassrooms, printMode])

  useEffect(() => {
    const url = data?.school?.logo_url
    if (!url || url.startsWith('data:')) {
      setLogoResolved(true)
      return
    }
    let active = true
    setLogoResolved(false)
    downscaleImageUrl(url, 320)
      .then(src => {
        if (!active || src === url) return
        setData(prev => (prev?.school && prev.school.logo_url === url)
          ? { ...prev, school: { ...prev.school, logo_url: src } }
          : prev)
      })
      .finally(() => { if (active) setLogoResolved(true) })
    return () => { active = false }
  }, [data?.school?.logo_url])

  useEffect(() => {
    if (!printMode) return
    if (!data || loading || !logoResolved) {
      (window as unknown as { __REPORT_READY__?: boolean }).__REPORT_READY__ = false
      return
    }
    let cancelled = false
    const markReady = async () => {
      try {
        if ('fonts' in document) await (document as { fonts: { ready: Promise<unknown> } }).fonts.ready
      } catch {}

      const individualPrint = new URLSearchParams(window.location.search).get('individual') === '1'
      if (mode === 'pp6' && !individualPrint) {
        const expectedPages = data.students?.length || 0
        let rendered = 0
        for (let attempt = 0; attempt < 300; attempt++) {
          if (cancelled) return
          rendered = document.querySelectorAll('.pp6-page').length
          if (expectedPages > 0 && rendered >= expectedPages) break
          await new Promise(resolve => window.setTimeout(resolve, 50))
        }
        if (expectedPages > 0 && rendered < expectedPages) return
      }

      const images = Array.from(document.querySelectorAll<HTMLImageElement>('.report-print-zone img'))
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise<void>(resolve => {
          const timer = window.setTimeout(() => resolve(), 8000)
          const done = () => {
            window.clearTimeout(timer)
            resolve()
          }
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        })
      }))
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      if (printMode) await new Promise(resolve => window.setTimeout(resolve, 300))
      if (!cancelled) (window as unknown as { __REPORT_READY__?: boolean }).__REPORT_READY__ = true
    }
    void markReady()
    return () => { cancelled = true }
  }, [printMode, data, loading, logoResolved, mode])

  function resetData() {
    setData(null)
    setClassSubjectId('')
    setSelectedStudentId('')
    setSubjectOptions([])
  }

  function handleYearChange(nextYearId: string) {
    setYearId(nextYearId)
    const nextClassrooms = classrooms.filter(item => item.academic_year_id === nextYearId)
    const nextLevels = uniqueLevels(nextClassrooms)
    const nextLevel = mode === 'pp5-class' ? '' : (nextLevels[0] || '')
    const nextClassroom = nextClassrooms.find(item => item.level === nextLevel)
    setLevel(nextLevel)
    setClassroomId(mode === 'pp5-class' || mode === 'pp6' ? '' : nextClassroom?.id || '')
    resetData()
  }

  function handleLevelChange(nextLevel: string) {
    setLevel(nextLevel)
    const nextClassroom = yearClassrooms.find(item => item.level === nextLevel)
    setClassroomId(mode === 'pp5-class' || mode === 'pp6' ? '' : nextClassroom?.id || '')
    if (mode === 'pp5-subject') {
      setTerm(isSecondaryClassLevel(nextLevel) ? (term === 0 ? 1 : term) : 0)
    }
    resetData()
  }

  function toggleSection(section: PrintSection) {
    setSections(prev => prev.includes(section) ? prev.filter(item => item !== section) : [...prev, section])
  }

  function savePdf() {
    if (!data) return
    setError('')
    const classText = data.classroom ? `${data.classroom.level}-${data.classroom.room}` : 'รายงาน'
    const yearText = data.academicYear?.year_be || ''
    const nameParts = [MODE_CONFIG[mode].title, classText]
    if (mode === 'pp5-subject' && selectedSubject) {
      const subjectCode = selectedSubject.subject.code?.trim()
      const subjectName = selectedSubject.subject.name?.trim()
      if (subjectCode) nameParts.push(subjectCode)
      if (subjectName) nameParts.push(subjectName)
    }
    if (yearText) nameParts.push(yearText)
    const fileName = `${nameParts.join('_')}.pdf`.replace(/[\\/:*?"<>|]/g, '-')

    // ปพ.6 → jsPDF (วาดตาม layout พรีวิว) ไม่ผ่าน Puppeteer
    if (mode === 'pp6') {
      enqueueFileExport({
        fileName,
        label: nameParts.join(' · '),
        run: async () => buildPp6PdfBlob({
          data,
          term: pp6Term,
          individual: pp6Individual,
          selectedStudentId,
          ranked: pp6Ranked,
          showGrade: pp6ShowGrade,
          layout: pp6PrintLayouts.page,
          fileName,
        }),
      })
      return
    }

    const params = new URLSearchParams()
    params.set('print', '1')
    if (yearId) params.set('year', yearId)
    if (level) params.set('level', level)
    const exportClassroomId = classroomId || ''
    if (exportClassroomId) params.set('classroom', exportClassroomId)
    if (mode === 'pp5-subject') {
      if (isSecondaryClassLevel(level)) params.set('term', String(reportTerm))
    } else {
      params.set('term', String(term))
    }
    params.set('sections', sections.join(','))
    if (classSubjectId) params.set('subject', classSubjectId)

    const localStorageSeed: Record<string, string> = {}
    if (mode === 'pp5-subject' || mode === 'pp5-class') {
      localStorageSeed[PP5_PRINT_LAYOUTS_STORAGE_KEY] = JSON.stringify(pp5PrintLayouts)
    }

    enqueueReportPdf({
      path: window.location.pathname,
      query: params.toString(),
      fileName,
      label: nameParts.join(' · '),
      localStorageSeed: Object.keys(localStorageSeed).length > 0 ? localStorageSeed : undefined,
      flattenEffects: true,
    })
  }

  return (
    <div className={`page-stack report-workspace${embedMode ? ' report-workspace--embed' : ''}${printMode ? ' report-workspace--print' : ''}`}>
      <div className="report-layout">
        {!embedMode && !printMode && (
        <aside className="report-side-panel">
          <div className="report-side-title">
            <div className="section-title">พิมพ์รายงาน {MODE_CONFIG[mode].title}</div>
          </div>

          <div className="report-filter-grid">
            {mode !== 'pp5-class' && (
              <div>
                <label className="form-label">ปีการศึกษา</label>
                <select value={yearId} onChange={event => handleYearChange(event.target.value)} className="form-input">
                  {years.map(year => <option key={year.id} value={year.id}>{year.year_be}{year.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
                </select>
              </div>
            )}
            {showPp5SubjectTerm && (
              <div>
                <label className="form-label">ภาคเรียน</label>
                <select value={term} onChange={event => { setTerm(Number(event.target.value) as 0 | 1 | 2); resetData() }} className="form-input">
                  <option value={1}>ภาคเรียนที่ 1</option>
                  <option value={2}>ภาคเรียนที่ 2</option>
                </select>
              </div>
            )}
            {mode === 'pp6' ? (
              <div>
                <label className="form-label">ช่วงรายงาน</label>
                <select value={pp6Term} onChange={event => setPp6Term(Number(event.target.value) as 0 | 1 | 2)} className="form-input">
                  <option value={1}>ภาคเรียนที่ 1</option>
                  <option value={0}>ทั้งปี</option>
                </select>
              </div>
            ) : null}
            <div>
              <label className="form-label">ระดับชั้น</label>
              <select value={level} onChange={event => handleLevelChange(event.target.value)} className="form-input" disabled={levels.length === 0}>
                <option value="">{levels.length === 0 ? '— ไม่มีชั้นที่ปรับได้ —' : '— เลือกระดับชั้น —'}</option>
                {levels.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            {mode !== 'pp6' && (
              <div>
                <label className="form-label">ห้องเรียน</label>
                <select value={classroomId} onChange={event => { setClassroomId(event.target.value); resetData() }} className="form-input" disabled={!level}>
                  <option value="">{level ? (classroomOptions.length === 0 ? '— ไม่มีห้องที่ปรับได้ —' : '— เลือกห้อง —') : '— เลือกระดับชั้นก่อน —'}</option>
                  {classroomOptions.map(item => <option key={item.id} value={item.id}>{item.level}/{item.room}</option>)}
                </select>
              </div>
            )}
            {mode === 'pp5-subject' && (
              <div>
                <label className="form-label">รายวิชา</label>
                <select value={classSubjectId} onChange={event => { setData(null); setClassSubjectId(event.target.value) }} className="form-input" disabled={!classroomId || loading || subjectOptions.length === 0}>
                  <option value="">{classroomId ? (subjectOptions.length === 0 ? '— ไม่มีวิชาที่ปรับได้ —' : '— เลือกรายวิชา —') : '— เลือกห้องก่อน —'}</option>
                  {subjectOptions.map(subject => (
                    <option key={subject.class_subject_id} value={subject.class_subject_id}>[{subject.subject.code}] {subject.subject.name}</option>
                  ))}
                </select>
              </div>
            )}
            {mode === 'pp6' && (
              <>
                <div>
                  <label className="form-label">พิมพ์แบบ</label>
                  <div className="report-toggle">
                    <button
                      type="button"
                      className={pp6Individual ? 'active' : ''}
                      onClick={() => { setPp6Individual(true); setSelectedStudentId(''); setData(null) }}
                    >
                      รายบุคคล
                    </button>
                    <button
                      type="button"
                      className={!pp6Individual ? 'active' : ''}
                      onClick={() => {
                        setPp6Individual(false)
                        setSelectedStudentId('')
                        setData(null)
                      }}
                    >
                      ทั้งหมด
                    </button>
                  </div>
                </div>
                {pp6Individual && (
                <div>
                  <label className="form-label">นักเรียน</label>
                  <select
                    value={selectedStudentId}
                    onChange={event => {
                      const nextStudentId = event.target.value
                      setSelectedStudentId(nextStudentId)
                      if (nextStudentId) {
                        const student = pp6StudentsForLevel.find(item => item.id === nextStudentId)
                        setClassroomId(student?.classroom_id || '')
                      }
                      setData(null)
                    }}
                    className="form-input"
                    disabled={!yearId || !level || pp6StudentsForLevel.length === 0}
                  >
                    <option value="">
                      {!level
                        ? '— เลือกระดับชั้นก่อน —'
                        : pp6StudentsForLevel.length === 0
                          ? '— ไม่มีนักเรียนในชั้นนี้ —'
                          : '— ทุกคน (ไม่ระบุ) —'}
                    </option>
                    {pp6StudentsForLevel.map(student => (
                      <option key={student.id} value={student.id}>
                        {student.student_number}. {studentName(student)} ({student.classroom_label})
                      </option>
                    ))}
                  </select>
                </div>
                )}
                <div>
                  <label className="form-label">อันดับ</label>
                  <label className="report-inline-switch">
                    <input type="checkbox" checked={pp6Ranked} onChange={event => setPp6Ranked(event.target.checked)} />
                    <span>{pp6Ranked ? 'เปิดจัดอันดับ' : 'ปิดจัดอันดับ'}</span>
                  </label>
                </div>
                {pp6Term === 1 && (
                  <div>
                    <label className="form-label">เกรด</label>
                    <label className="report-inline-switch">
                      <input type="checkbox" checked={pp6ShowGrade} onChange={event => setPp6ShowGrade(event.target.checked)} />
                      <span>{pp6ShowGrade ? 'แสดงเกรด' : 'ไม่แสดงเกรด'}</span>
                    </label>
                  </div>
                )}
              </>
            )}
          </div>

          {mode === 'pp5-subject' && userRole === 'teacher' && yearId && levels.length === 0 && (
            <div className="alert alert-error">ยังไม่มีชั้นที่คุณได้รับมอบหมายสอนในปีนี้ — ตรวจสอบที่เมนู &quot;จัดครูเข้าสอน&quot;</div>
          )}
          {mode === 'pp5-subject' && userRole === 'teacher' && yearId && level && classroomOptions.length === 0 && (
            <div className="alert alert-error">ยังไม่มีห้องที่คุณได้รับมอบหมายสอนในปีนี้ — ตรวจสอบที่เมนู &quot;จัดครูเข้าสอน&quot;</div>
          )}
          {mode === 'pp5-subject' && userRole === 'teacher' && classroomId && !loading && subjectOptions.length === 0 && (
            <div className="alert alert-error">ไม่มีวิชาที่คุณสอนในห้องนี้ — ตรวจสอบการมอบหมายที่เมนู &quot;จัดครูเข้าสอน&quot;</div>
          )}

          <p className="report-filter-note">{MODE_CONFIG[mode].subtitle}</p>

          {mode !== 'pp6' && (
            <div className="report-section-card">
              <div className="report-section-head">
                <span>สิ่งที่จะพิมพ์</span>
                <button type="button" onClick={() => setSections(ALL_SECTIONS[mode])}>ทั้งหมด</button>
                <button type="button" onClick={() => setSections([])}>ล้าง</button>
              </div>
              {ALL_SECTIONS[mode].map(section => (
                <label key={section} className="report-switch-row">
                  <span>{SECTION_LABELS[section]}</span>
                  <input type="checkbox" checked={sections.includes(section)} onChange={() => toggleSection(section)} />
                </label>
              ))}
            </div>
          )}

          {(loading || !data) && (
            <span className="report-loading-note">
              {mode === 'pp5-subject'
                ? loading ? 'กำลังโหลดข้อมูล...' : subjectOptions.length ? 'เลือกรายวิชาเพื่อดูพรีวิว' : 'เลือกชั้น/ห้องเพื่อโหลดรายวิชา'
                : mode === 'pp5-class'
                  ? loading ? 'กำลังโหลดพรีวิว...' : 'เลือกระดับชั้นและห้องเรียน'
                  : loading ? 'กำลังโหลดพรีวิว...' : 'เลือกระดับชั้นเพื่อดูพรีวิว ปพ.6'}
            </span>
          )}

          {error && <div className="alert alert-error">{error}</div>}
        </aside>
        )}

        <main className="report-preview-panel">
          {!embedMode && !printMode && (mode === 'pp5-subject' || mode === 'pp5-class' || mode === 'pp6') && (
            <DocumentSignaturePanel
              variant={mode === 'pp5-subject' ? 'pp5_subject' : mode === 'pp5-class' ? 'pp5_class' : 'pp6'}
              classSubjectId={mode === 'pp5-subject' ? classSubjectId : undefined}
              classroomId={classroomId || data?.classroom?.id || ''}
              reportTerm={reportTerm}
              disabled={mode === 'pp5-subject' ? !classSubjectId : !(classroomId || data?.classroom?.id)}
              compact
              onSignatureChange={async () => {
                if (mode === 'pp5-subject') await loadSubjectPreview()
                else await loadClassPreview()
              }}
            />
          )}
          {!embedMode && !printMode && (
          <div className="report-preview-toolbar">
            <label>
              <span>ขนาด</span>
              <select value={scale} onChange={event => setScale(Number(event.target.value))} disabled={!data} className="form-input">
                <option value={72}>เล็ก (72%)</option>
                <option value={88}>พอดี (88%)</option>
                <option value={100}>เต็ม (100%)</option>
              </select>
            </label>
            {mode === 'pp6' && (
              <div className="report-preview-mode" role="group" aria-label="โหมดพรีวิว">
                <button
                  type="button"
                  className={`btn btn-secondary${pp6PreviewMode === 'pdf' ? ' active' : ''}`}
                  disabled={!data}
                  onClick={() => setPp6PreviewMode('pdf')}
                >
                  PDF (jsPDF)
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary${pp6PreviewMode === 'html' ? ' active' : ''}`}
                  disabled={!data}
                  onClick={() => setPp6PreviewMode('html')}
                >
                  HTML
                </button>
              </div>
            )}
            <div className="report-preview-actions">
              {layoutTunerEnabled && (
              <button
                type="button"
                onClick={() => {
                  setPp5TunerOpen(open => {
                    const next = !open
                    if (next && mode === 'pp6') setPp6PreviewMode('pdf')
                    return next
                  })
                }}
                className={`btn btn-secondary pp5-tuner-toggle${pp5TunerOpen ? ' active' : ''}`}
                disabled={!data}
              >
                {pp5TunerOpen ? 'ปิดปรับ layout' : mode === 'pp6' ? 'ปรับ layout ปพ.6' : 'ปรับ layout ปพ.5'}
              </button>
              )}
              <button type="button" onClick={savePdf} disabled={!data} className="btn btn-secondary">
                บันทึก PDF
              </button>
              <button type="button" onClick={() => window.print()} disabled={!data} className="btn btn-primary">{MODE_CONFIG[mode].printLabel}</button>
            </div>
          </div>
          )}
          {!embedMode && !printMode && (mode === 'pp6' ? (
            <Pp5PrintLayoutTuner
              variant="pp6"
              open={pp5TunerOpen}
              onClose={() => setPp5TunerOpen(false)}
              layouts={pp6PrintLayouts}
              onChange={setPp6PrintLayouts}
              onSave={savePrintLayouts}
              saved={layoutSaved}
            />
          ) : (
            <Pp5PrintLayoutTuner
              open={pp5TunerOpen}
              onClose={() => setPp5TunerOpen(false)}
              availableSections={pp5TunerSections}
              sectionLabels={PP5_TUNER_SECTION_LABELS}
              activeSection={pp5TunerSection}
              onActiveSectionChange={setPp5TunerSection}
              layouts={pp5PrintLayouts}
              onChange={setPp5PrintLayouts}
              onSave={savePrintLayouts}
              saved={layoutSaved}
            />
          ))}

          <div className="report-preview-shell">
            {!data ? (
              <div className="report-empty">
                <b>{mode === 'pp5-subject' ? 'ยังไม่ได้เลือกรายวิชา' : mode === 'pp5-class' ? 'เลือกระดับชั้น/ห้องก่อน' : 'เลือกชั้นและห้องก่อน'}</b>
                <span>{mode === 'pp5-subject'
                  ? showPp5SubjectTerm
                    ? 'เลือกชั้น ห้อง และภาคเรียนเพื่อโหลดรายวิชา จากนั้นเลือกรายวิชาเพื่อดูพรีวิว'
                    : 'เลือกชั้นและห้องเพื่อโหลดรายวิชา จากนั้นเลือกรายวิชาเพื่อดูพรีวิว (ประถมใช้ข้อมูลทั้งปี)'
                  : mode === 'pp6' ? 'เลือกระดับชั้นเพื่อดูพรีวิว ปพ.6' : 'เลือกข้อมูลด้านซ้ายเพื่อดูพรีวิว'}</span>
              </div>
            ) : mode === 'pp6' ? (
              pp6PreviewMode === 'pdf' && !printMode && !embedMode ? (
                <Pp6JsPdfLivePreview
                  data={data}
                  term={pp6Term}
                  individual={pp6Individual}
                  selectedStudentId={selectedStudentId}
                  ranked={pp6Ranked}
                  showGrade={pp6ShowGrade}
                  layout={pp6PrintLayouts.page}
                  scale={scale}
                />
              ) : (
              <Pp6PrintLayoutsProvider layouts={pp6PrintLayouts}>
              <div
                className={printMode ? 'report-print-zone is-pdf-export' : 'report-print-zone'}
                style={printMode ? undefined : { transform: `scale(${(embedMode ? 72 : scale) / 100})`, transformOrigin: 'top center' }}
              >
                <Pp6Page data={data} term={pp6Term} individual={pp6Individual} selectedStudentId={selectedStudentId} ranked={pp6Ranked} showGrade={pp6ShowGrade} />
              </div>
              </Pp6PrintLayoutsProvider>
              )
            ) : (
              <Pp5PrintLayoutsProvider layouts={pp5PrintLayouts}>
              <div
                className={printMode ? 'report-print-zone is-pdf-export' : 'report-print-zone'}
                style={printMode ? undefined : { transform: `scale(${(embedMode ? 72 : scale) / 100})`, transformOrigin: 'top center' }}
              >
                {mode === 'pp5-subject' && sections.includes('cover') && <CoverPage data={data} mode={mode} subject={selectedSubject} term={reportTerm} pageNumber={pageNumbers.cover} />}
                {mode === 'pp5-class' && sections.includes('cover') && <CoverPage data={data} mode={mode} subject={null} term={term} pageNumber={pageNumbers.cover} />}
                {mode === 'pp5-subject' && sections.includes('criteria') && (
                  <CriteriaReportPages
                    data={data}
                    characterSettings={data.characterSettings}
                    readingSettings={data.readingSettings}
                    pageStart={pageNumbers.criteria}
                    pageMark={PP5_SUBJECT_PAGE_MARK}
                    term={reportTerm}
                  />
                )}
                {mode === 'pp5-class' && sections.includes('criteria') && (
                  <CriteriaReportPages
                    data={data}
                    characterSettings={data.characterSettings}
                    readingSettings={data.readingSettings}
                    pageStart={pageNumbers.criteria}
                    term={reportTerm}
                  />
                )}
                {mode !== 'pp6' && sections.includes('attendance') && <AttendancePage data={data} mode={mode} subject={selectedSubject} classSubjectId={classSubjectId} term={reportTerm} pageStart={pageNumbers.attendance} />}
                {mode === 'pp5-subject' && sections.includes('scores') && <SubjectScorePages data={data} subject={selectedSubject} term={reportTerm} pageStart={pageNumbers.subjectScore} />}
                {mode === 'pp5-class' && sections.includes('scores') && <ClassScorePage data={data} term={term} pageStart={pageNumbers.classScore} />}
                {mode === 'pp5-class' && sections.includes('achievement') && withStudentChunks(data, (pageData, pageIndex) => (
                  <AchievementSummaryPage
                    key={`achievement-${pageIndex}`}
                    data={pageData}
                    pageNumber={(pageNumbers.achievement || 1) + pageIndex}
                  />
                ))}
                {mode === 'pp5-subject' && sections.includes('character') && (
                  <CharacterReportPages
                    data={data}
                    rows={data.evaluations.character}
                    pageStart={pageNumbers.character}
                    pageMark={PP5_SUBJECT_PAGE_MARK}
                    term={reportTerm}
                  />
                )}
                {mode === 'pp5-class' && sections.includes('character') && (
                  <CharacterReportPages
                    data={data}
                    rows={data.evaluations.character}
                    pageStart={pageNumbers.character}
                    term={reportTerm}
                  />
                )}
                {mode === 'pp5-subject' && sections.includes('reading') && withStudentChunks(data, (pageData, pageIndex) => (
                  <ReadingEvaluationPage
                    key={`reading-subj-${pageIndex}`}
                    data={pageData}
                    rows={data.evaluations.reading}
                    pageNumber={(pageNumbers.reading || 1) + pageIndex}
                    pageMark={PP5_SUBJECT_PAGE_MARK}
                    term={reportTerm}
                  />
                ))}
                {mode === 'pp5-class' && sections.includes('reading') && withStudentChunks(data, (pageData, pageIndex) => (
                  <ReadingEvaluationPage
                    key={`reading-class-${pageIndex}`}
                    data={pageData}
                    rows={data.evaluations.reading}
                    pageNumber={(pageNumbers.reading || 1) + pageIndex}
                    term={reportTerm}
                  />
                ))}
                {mode !== 'pp6' && sections.includes('competency') && withStudentChunks(data, (pageData, pageIndex) => (
                  <CompetencyEvaluationPage
                    key={`competency-${pageIndex}`}
                    data={pageData}
                    rows={data.evaluations.competency}
                    pageNumber={(pageNumbers.competency || 1) + pageIndex}
                    pageMark={mode === 'pp5-subject' ? PP5_SUBJECT_PAGE_MARK : undefined}
                    term={reportTerm}
                  />
                ))}
                {mode === 'pp5-class' && sections.includes('activities') && withStudentChunks(data, (pageData, pageIndex) => (
                  <ActivityEvaluationPage
                    key={`activities-${pageIndex}`}
                    data={pageData}
                    rows={data.evaluations.activities}
                    pageNumber={(pageNumbers.activities || 1) + pageIndex}
                  />
                ))}
              </div>
              </Pp5PrintLayoutsProvider>
            )}
          </div>
        </main>
      </div>

      <style jsx global>{`
        .report-config-card,
        .report-actions,
        .report-section-card,
        .report-toggle {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .report-config-card {
          justify-content: space-between;
        }
        .report-filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 14px;
        }
        .report-section-card label {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          font-size: 13px;
          font-weight: 700;
          color: var(--text-2);
        }
        .report-toggle {
          gap: 0;
          padding: 3px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--bg-2);
        }
        .report-toggle button {
          border: 0;
          background: transparent;
          border-radius: 9px;
          padding: 8px 12px;
          font-weight: 800;
          cursor: pointer;
          color: var(--text-2);
        }
        .report-toggle button.active {
          background: var(--primary);
          color: white;
        }
        .report-inline-switch {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 32px;
          color: var(--text-2);
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }
        .report-inline-switch input {
          appearance: none;
          width: 38px;
          height: 21px;
          border-radius: 999px;
          background: #D1D5DB;
          position: relative;
          cursor: pointer;
          transition: background 0.2s ease;
          flex: 0 0 auto;
        }
        .report-inline-switch input::after {
          content: "";
          position: absolute;
          top: 2px;
          left: 2px;
          width: 17px;
          height: 17px;
          border-radius: 999px;
          background: white;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.24);
          transition: transform 0.2s ease;
        }
        .report-inline-switch input:checked {
          background: var(--primary);
        }
        .report-inline-switch input:checked::after {
          transform: translateX(17px);
        }
        .report-loading-note {
          display: inline-flex;
          align-items: center;
          min-height: 38px;
          padding: 0 12px;
          border-radius: 999px;
          background: #F5EDE3;
          color: #6B4F32;
          font-size: 13px;
          font-weight: 800;
        }
        .report-preview-shell {
          min-height: 620px;
          padding: 24px;
          border-radius: 22px;
          background: #e5e7eb;
          overflow: auto;
          border: 1px solid var(--border);
        }
        .report-empty {
          min-height: 520px;
          display: grid;
          place-content: center;
          text-align: center;
          color: var(--text-3);
          gap: 8px;
        }
        .report-empty b {
          color: var(--text);
          font-size: 20px;
        }
        .report-coming-soon-page {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .report-coming-soon-body {
          text-align: center;
        }
        .report-coming-soon-body h1 {
          margin: 0 0 12px;
          font-size: 28px;
          font-weight: 700;
        }
        .report-coming-soon-body p {
          margin: 0;
          font-size: 22px;
          color: #6b7280;
          font-weight: 600;
        }
        .report-print-zone {
          width: 210mm;
          margin: 0 auto;
        }
        .report-print-zone.is-pdf-export {
          width: 210mm !important;
          margin: 0 !important;
          transform: none !important;
          transform-origin: top left !important;
          background: white !important;
        }
        .report-print-zone.is-pdf-export .report-page {
          width: 210mm !important;
          min-height: 297mm !important;
          height: 297mm !important;
          margin: 0 !important;
          box-shadow: none !important;
          overflow: hidden !important;
          break-after: page;
          page-break-after: always;
        }
        .report-print-zone.is-pdf-export .report-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }
        .report-page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto 24px;
          padding: 34px;
          position: relative;
          background: white;
          color: #111827;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
          page-break-after: always;
          box-sizing: border-box;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          font-size: 14px;
        }
        .report-page-number-wrap {
          position: absolute;
          top: 6mm;
          right: 8mm;
          z-index: 5;
          text-align: right;
        }
        .report-page-number {
          font-size: 16px;
          line-height: 1.15;
          font-weight: 700;
          color: #111827;
          white-space: nowrap;
        }
        .report-page-number-mark {
          margin-top: 3px;
          font-size: 14px;
          line-height: 1.1;
          font-weight: 700;
          color: #111827;
          white-space: nowrap;
        }
        .report-page.landscape {
          width: 297mm;
          min-height: 210mm;
        }
        .report-doc-header {
          text-align: center;
          margin-bottom: 16px;
          line-height: 1.5;
        }
        .report-doc-title {
          font-size: 22px;
          font-weight: 900;
        }
        .report-cover-page {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: center;
        }
        .report-cover-mark {
          margin-left: auto;
          border: 2px solid #111827;
          border-radius: 10px;
          padding: 8px 16px;
          font-size: 24px;
          font-weight: 900;
        }
        .report-cover-page h1 {
          margin: 60px 0 8px;
          font-size: 30px;
        }
        .report-cover-page h2 {
          margin: 0 0 34px;
          font-size: 24px;
        }
        .report-cover-info {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          text-align: left;
          max-width: 620px;
          margin: 0 auto;
        }
        .report-cover-info div {
          border-bottom: 1px dotted #111827;
          padding: 8px 0;
          display: flex;
          gap: 10px;
        }
        .report-cover-info b {
          min-width: 120px;
        }
        .report-cover-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin: 44px 0;
        }
        .report-cover-summary div {
          border: 1px solid #111827;
          border-radius: 12px;
          padding: 14px 10px;
          font-weight: 800;
        }
        .pp5-class-cover-page {
          position: relative;
          width: 210mm;
          min-height: 297mm;
          height: 297mm;
          max-height: 297mm;
          padding: var(--pp5-cover-pad-top, 9mm) var(--pp5-cover-pad-x, 10mm) var(--pp5-cover-pad-bottom, 10mm);
          font-size: var(--pp5-cover-font-base, 20px);
          line-height: 1.15;
          box-sizing: border-box;
        }
        .pp5-class-cover-doc-mark {
          position: absolute;
          top: var(--pp5-cover-doc-mark-top, 42px);
          right: var(--pp5-cover-doc-mark-right, 40px);
          display: flex;
          flex-direction: column;
          gap: 6px;
          text-align: center;
          font-size: var(--pp5-cover-doc-mark-font, 22px);
          line-height: 1.2;
          font-weight: 900;
        }
        .pp5-class-cover-logo {
          width: var(--pp5-cover-logo-size, 88px);
          height: var(--pp5-cover-logo-size, 88px);
          margin: 0 auto 4px;
          display: grid;
          place-items: center;
          overflow: hidden;
          color: #374151;
          font-size: 20px;
          font-weight: 900;
          line-height: 1;
        }
        .pp5-class-cover-logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }
        .pp5-class-cover-logo span {
          width: 90px;
          height: 90px;
          display: grid;
          place-items: center;
          border: 1px solid #9CA3AF;
          border-radius: 999px;
        }
        .pp5-class-cover-header {
          text-align: center;
        }
        .pp5-class-cover-header.pp5-subject-cover-header h1 {
          margin: 0 0 var(--pp5-cover-header-gap, 18px);
          font-size: var(--pp5-cover-font-h1, 27px);
        }
        .pp5-class-cover-score-table,
        .pp5-class-cover-mini-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .pp5-class-cover-score-table {
          margin-top: var(--pp5-cover-table-top, 3mm);
          font-size: var(--pp5-cover-font-table, 19px);
          line-height: 1.05;
        }
        .pp5-class-cover-score-table th,
        .pp5-class-cover-score-table td,
        .pp5-class-cover-mini-table th,
        .pp5-class-cover-mini-table td {
          border: 1px solid #111827;
          padding: 1px 2px;
          text-align: center;
          vertical-align: middle;
        }
        .pp5-class-cover-score-table th {
          font-weight: 900;
        }
        .pp5-class-cover-score-table small {
          display: block;
          font-size: var(--pp5-cover-font-table-sm, 15px);
          font-weight: 600;
        }
        .pp5-class-cover-score-table th:nth-child(1),
        .pp5-class-cover-score-table td:nth-child(1) {
          width: 26px;
        }
        .pp5-class-cover-score-table th:nth-child(2),
        .pp5-class-cover-score-table td:nth-child(2) {
          width: 58px;
        }
        .pp5-class-cover-score-table th:nth-child(3),
        .pp5-class-cover-score-table td:nth-child(3) {
          width: 170px;
        }
        .pp5-class-cover-score-table td:nth-child(3) {
          text-align: left;
          padding-left: 8px;
        }
        .pp5-class-cover-score-table th:nth-child(4),
        .pp5-class-cover-score-table td:nth-child(4) {
          width: 46px;
        }
        .pp5-class-cover-score-table th:last-child,
        .pp5-class-cover-score-table td:last-child {
          width: 60px;
        }
        .pp5-class-cover-note-head {
          padding: 2px 1px !important;
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
          writing-mode: vertical-rl;
          transform: rotate(180deg);
        }
        .pp5-class-cover-score-table tbody td {
          height: var(--pp5-cover-table-row-h, 11px);
          line-height: 1;
        }
        .pp5-class-cover-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--pp5-cover-summary-gap, 3px) 6px;
          margin-top: 3px;
        }
        .pp5-class-cover-mini-table {
          font-size: var(--pp5-cover-font-table-sm, 15px);
          line-height: 1;
        }
        .pp5-class-cover-mini-table th {
          font-weight: 900;
          padding: 1px 2px;
        }
        .pp5-class-cover-mini-table td {
          height: 10px;
          line-height: 1;
          padding: 0 2px;
        }
        .pp5-class-cover-mini-table thead tr:first-child th {
          padding: 1px 2px;
          line-height: 1.05;
        }
        .pp5-class-cover-approval {
          margin-top: var(--pp5-cover-approval-gap, 5px);
          font-size: var(--pp5-cover-font-signature, 16px);
          line-height: 1.12;
        }
        .pp5-class-cover-approval-title {
          display: block;
          margin-bottom: 3px;
          font-weight: 700;
          text-align: left;
        }
        .pp5-class-cover-signatures {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 32px;
          padding: 0 24px;
          margin-bottom: 8px;
          text-align: center;
          align-items: start;
        }
        .pp5-class-cover-signature-block {
          min-height: 60px;
        }
        .pp5-class-cover-signatures p {
          margin: 0;
        }
        .pp5-class-cover-signatures b,
        .pp5-class-cover-signatures span {
          display: block;
          line-height: 1.12;
        }
        .pp5-class-cover-approval-bottom {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 32px;
          padding: 0 24px;
          align-items: stretch;
        }
        .pp5-class-cover-director-box-full {
          position: relative;
          width: 100%;
          min-height: 108px;
          padding: 8px 10px 10px;
          border: 1px solid #111827;
        }
        .pp5-class-cover-director-main {
          text-align: center;
          padding: 0 64px 0;
        }
        .pp5-class-cover-director-main b,
        .pp5-class-cover-director-main span {
          display: block;
          line-height: 1.12;
        }
        .pp5-class-cover-director-main .pp5-class-cover-director-sign-line {
          margin: 0 0 2px;
          white-space: nowrap;
        }
        .pp5-class-cover-verify-date {
          display: block;
          margin-top: 6px;
        }
        .pp5-class-cover-approval-options-full {
          margin-bottom: 8px;
          gap: 24px;
        }
        .pp5-class-cover-qr-block {
          position: absolute;
          right: 10px;
          bottom: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          font-size: 10px;
          line-height: 1.1;
          font-weight: 400;
        }
        .pp5-class-cover-qr-placeholder {
          width: 52px;
          height: 52px;
          border: 1px solid #111827;
          margin-bottom: 2px;
          background:
            linear-gradient(45deg, #111827 25%, transparent 25%, transparent 75%, #111827 75%),
            linear-gradient(45deg, #111827 25%, transparent 25%, transparent 75%, #111827 75%);
          background-size: 7px 7px;
          background-position: 0 0, 3.5px 3.5px;
        }
        .pp5-class-cover-qr-block small {
          font-size: 9px;
        }
        .pp5-class-cover-approval-col-box {
          min-height: 88px;
          padding: 8px 10px 10px;
          border: 1px solid #111827;
          text-align: center;
        }
        .pp5-class-cover-vice-director p {
          margin: 0;
        }
        .pp5-class-cover-vice-director b,
        .pp5-class-cover-vice-director span {
          display: block;
          line-height: 1.12;
        }
        .pp5-class-cover-director {
          text-align: center;
        }
        .pp5-class-cover-propose-line {
          text-align: center;
          font-weight: 700;
          margin-bottom: 2px !important;
        }
        .pp5-class-cover-approval-options {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          max-width: 100%;
          margin: 0 auto 4px;
          text-align: center;
        }
        .pp5-class-cover-director-signature {
          margin-top: 0;
        }
        .pp5-class-cover-director-signature b,
        .pp5-class-cover-director-signature span {
          display: block;
          line-height: 1.12;
        }
        .pp5-class-cover-director-sign-line {
          margin-top: 0 !important;
        }
        .pp5-class-cover-approval-options label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
        .pp5-class-cover-checkbox {
          display: inline-block;
          width: 9px;
          height: 9px;
          border: 1px solid #111827;
          margin: 0;
          vertical-align: -1px;
          flex: 0 0 auto;
        }
        .pp5-subject-cover-page {
          position: relative;
          width: 210mm;
          min-height: 297mm;
          height: 297mm;
          max-height: 297mm;
          padding: var(--pp5-cover-pad-top, 9mm) var(--pp5-cover-pad-x, 10mm) var(--pp5-cover-pad-bottom, 10mm);
          font-size: var(--pp5-cover-font-base, 18px);
          line-height: 1.15;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          box-sizing: border-box;
        }
        .pp5-subject-cover-doc-mark {
          position: absolute;
          top: var(--pp5-cover-doc-mark-top, 24px);
          right: var(--pp5-cover-doc-mark-right, 34px);
          display: flex;
          flex-direction: column;
          gap: 4px;
          text-align: center;
          font-size: var(--pp5-cover-doc-mark-font, 23px);
          font-weight: 700;
          line-height: 1;
        }
        .pp5-subject-cover-logo {
          width: var(--pp5-cover-logo-size, 88px);
          height: var(--pp5-cover-logo-size, 88px);
          margin: 0 auto 2px;
          display: grid;
          place-items: center;
          overflow: hidden;
        }
        .pp5-subject-cover-logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }
        .pp5-subject-cover-logo span {
          width: 84px;
          height: 84px;
          display: grid;
          place-items: center;
          border: 1px solid #9ca3af;
          border-radius: 999px;
          font-size: 18px;
          font-weight: 700;
        }
        .pp5-subject-cover-header {
          text-align: center;
          margin-bottom: 4px;
        }
        .pp5-subject-cover-header h1 {
          margin: 0 0 var(--pp5-cover-header-gap, 18px);
          font-size: var(--pp5-cover-font-h1, 30px);
          line-height: 1.12;
          font-weight: 700;
        }
        .pp5-subject-cover-info {
          width: 100%;
          margin-top: 10px;
          border-top: 1px solid #d1d5db;
        }
        .report-cover-label {
          font-weight: 700;
        }
        .report-cover-value {
          font-weight: 400;
        }
        .pp5-subject-cover-grid-row {
          display: grid;
          align-items: baseline;
          column-gap: 6px;
          padding: 2px 0;
          border-bottom: 1px solid #d1d5db;
          font-size: var(--pp5-cover-font-info, 18px);
          font-weight: 400;
          line-height: 1.12;
          text-align: left;
        }
        .pp5-subject-cover-grid-row.is-school {
          font-weight: 700;
        }
        .pp5-subject-cover-grid-row.is-school .report-cover-value {
          font-weight: 700;
        }
        .pp5-subject-cover-grid-row > span {
          min-width: 0;
        }
        .pp5-subject-cover-grid-row.is-school {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .pp5-subject-cover-school-main {
          flex: 0 0 auto;
          white-space: nowrap;
        }
        .pp5-subject-cover-school-district {
          margin-left: 10px;
        }
        .pp5-subject-cover-school-area {
          flex: 1 1 auto;
          min-width: 0;
          text-align: right;
          white-space: nowrap;
        }
        .pp5-subject-cover-grid-row.is-class {
          grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.75fr) minmax(0, 0.85fr) minmax(0, 1fr);
        }
        .pp5-subject-cover-grid-row.is-class > span:nth-child(1) {
          text-align: left;
        }
        .pp5-subject-cover-grid-row.is-class > span:nth-child(2) {
          text-align: center;
        }
        .pp5-subject-cover-grid-row.is-class > span:nth-child(3) {
          text-align: center;
        }
        .pp5-subject-cover-grid-row.is-class > span:nth-child(4) {
          text-align: right;
        }
        .pp5-subject-cover-grid-row.is-subject {
          grid-template-columns: minmax(0, 1fr) auto;
        }
        .pp5-subject-cover-grid-row.is-subject > span:nth-child(1) {
          text-align: left;
        }
        .pp5-subject-cover-grid-row.is-subject > span:nth-child(2) {
          text-align: right;
        }
        .pp5-subject-cover-grid-row.is-teacher {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
        .pp5-subject-cover-grid-row.is-teacher > span:nth-child(1) {
          text-align: left;
        }
        .pp5-subject-cover-grid-row.is-teacher > span:nth-child(2) {
          text-align: right;
        }
        .pp5-subject-cover-grid-row.is-homeroom {
          grid-template-columns: 1fr;
        }
        .pp5-subject-cover-grid-row.is-homeroom > span {
          text-align: left;
        }
        .pp5-subject-cover-grid-row.is-primary-meta-subject {
          grid-template-columns: minmax(0, 1fr) auto;
        }
        .pp5-subject-cover-grid-row.is-primary-meta-subject > span:nth-child(1) {
          text-align: left;
        }
        .pp5-subject-cover-grid-row.is-primary-meta-subject > span:nth-child(2) {
          text-align: right;
          justify-self: end;
        }
        .pp5-subject-cover-grid-row.is-primary-meta-row {
          display: block;
        }
        .pp5-subject-cover-grid-row.is-primary-meta-row > span {
          display: block;
          width: 100%;
        }
        .pp5-subject-cover-primary-meta-row {
          display: flex;
          align-items: center;
          flex-wrap: nowrap;
          gap: 12px;
          width: 100%;
        }
        .pp5-subject-cover-primary-meta-row.is-level-row {
          justify-content: flex-start;
        }
        .pp5-subject-cover-meta-part-right {
          margin-left: 0;
        }
        .pp5-subject-cover-meta-part {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          line-height: 1;
          white-space: nowrap;
        }
        .pp5-subject-cover-check-item {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          line-height: 1;
          white-space: nowrap;
        }
        .pp5-subject-cover-checkbox {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 13px;
          height: 13px;
          box-sizing: border-box;
          border: 1px solid #111827;
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          flex: 0 0 auto;
        }
        .pp5-subject-cover-checkbox.is-checked {
          color: #111827;
        }
        .pp5-subject-cover-checkbox .report-checkmark {
          display: block;
        }
        .pp5-subject-cover-grade-table,
        .pp5-subject-cover-eval-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .pp5-subject-cover-grade-table {
          margin-top: var(--pp5-cover-table-top, 10mm);
          font-size: var(--pp5-cover-font-table, 15px);
          line-height: 1.1;
        }
        .pp5-subject-cover-grade-table .pp5-subject-cover-grade-banner {
          font-size: calc(var(--pp5-cover-font-table, 15px) + 6px);
          font-weight: 700;
          padding: 3px 2px;
        }
        .pp5-subject-cover-grade-table th,
        .pp5-subject-cover-grade-table td,
        .pp5-subject-cover-eval-table th,
        .pp5-subject-cover-eval-table td {
          border: 1px solid #111827;
          padding: 2px 2px;
          text-align: center;
          vertical-align: middle;
        }
        .pp5-subject-cover-grade-table th,
        .pp5-subject-cover-eval-table th {
          font-weight: 700;
        }
        .pp5-subject-cover-grade-table tbody td {
          height: var(--pp5-cover-table-row-h, 10px);
        }
        .pp5-subject-cover-grade-table th:first-child,
        .pp5-subject-cover-grade-table td:first-child {
          width: 10%;
        }
        .pp5-subject-cover-grade-table th:last-child,
        .pp5-subject-cover-grade-table td:last-child {
          width: 7%;
        }
        .pp5-subject-cover-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--pp5-cover-summary-gap, 3px) 8px;
          margin-top: 6px;
        }
        .pp5-subject-cover-eval-table {
          font-size: var(--pp5-cover-font-table-sm, 14px);
          line-height: 1.08;
        }
        .pp5-subject-cover-eval-table tbody td {
          height: var(--pp5-cover-table-row-h, 10px);
        }
        .pp5-subject-cover-approval {
          margin-top: var(--pp5-cover-approval-gap, 4px);
          font-size: var(--pp5-cover-font-signature, 16px);
        }
        .pp5-subject-cover-approval-title {
          margin-bottom: 10px;
          text-align: center;
          font-weight: 700;
        }
        .pp5-subject-cover-signatures {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px 64px;
          padding: 0 48px;
          margin-bottom: 10px;
          text-align: center;
        }
        .pp5-subject-cover-signature-block {
          min-height: 72px;
        }
        .pp5-subject-cover-signature-block p {
          margin: 0 0 2px;
          font-size: 18px;
          white-space: nowrap;
        }
        .pp5-subject-cover-signature-block b,
        .pp5-subject-cover-signature-block span {
          display: block;
          line-height: 1.25;
        }
        .pp5-subject-cover-approval-bottom {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 48px;
          padding: 0 48px;
          align-items: stretch;
        }
        .pp5-subject-cover-approval-col-box {
          min-height: 108px;
          padding: 10px 12px 12px;
          border: 1px solid #111827;
          text-align: center;
        }
        .pp5-subject-cover-vice-director p {
          margin: 0 0 2px;
          font-size: 18px;
          white-space: nowrap;
        }
        .pp5-subject-cover-vice-director b,
        .pp5-subject-cover-vice-director span {
          display: block;
          line-height: 1.25;
        }
        .pp5-subject-cover-propose-line {
          font-weight: 700;
          white-space: normal !important;
        }
        .pp5-subject-cover-director-signature b,
        .pp5-subject-cover-director-signature span {
          display: block;
          line-height: 1.25;
        }
        .pp5-subject-cover-approval-options-split {
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .pp5-subject-cover-director-box {
          position: relative;
          width: 100%;
          min-height: 132px;
          padding: 10px 12px 12px;
          border: 1px solid #111827;
        }
        .pp5-subject-cover-director-main {
          text-align: center;
          padding: 0 78px 0;
        }
        .pp5-subject-cover-director-main b,
        .pp5-subject-cover-director-main span {
          display: block;
          line-height: 1.25;
        }
        .pp5-subject-cover-director-sign {
          margin: 0 0 2px;
          font-size: 18px;
          white-space: nowrap;
        }
        .pp5-subject-cover-approval-options {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 28px;
          margin: 0 0 12px;
        }
        .pp5-subject-cover-approval-options label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 400;
        }
        .pp5-subject-cover-verify-date {
          display: block;
          margin-top: 8px;
          font-size: 18px;
        }
        .pp5-subject-cover-qr-block {
          position: absolute;
          right: 12px;
          bottom: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          font-size: 11px;
          line-height: 1.12;
          font-weight: 400;
        }
        .pp5-subject-cover-qr-placeholder {
          width: 64px;
          height: 64px;
          border: 1px solid #111827;
          margin-bottom: 2px;
          background:
            linear-gradient(45deg, #111827 25%, transparent 25%, transparent 75%, #111827 75%),
            linear-gradient(45deg, #111827 25%, transparent 25%, transparent 75%, #111827 75%);
          background-size: 8px 8px;
          background-position: 0 0, 4px 4px;
        }
        .pp5-subject-cover-qr-block small {
          font-size: 10px;
        }
        .pp5-subject-report-head {
          text-align: center;
          margin-bottom: 10px;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
        }
        .pp5-subject-report-head h1 {
          margin: 0 0 4px;
          font-size: 18px;
          line-height: 1.2;
          font-weight: 700;
        }
        .pp5-subject-report-head p {
          margin: 0;
          font-size: 16px;
          line-height: 1.25;
          font-weight: 700;
        }
        .pp5-subject-report-subline {
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 4px !important;
          font-size: 16px !important;
          font-weight: 700;
        }
        .pp5-subject-score-page {
          padding: 24px 10mm 12mm 13mm !important;
        }
        .pp5-subject-exam-meta {
          display: flex;
          justify-content: center;
          gap: 14px;
          flex-wrap: wrap;
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 700;
          text-align: center;
        }
        .pp5-subject-exam-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-top: 8px;
        }
        .pp5-subject-exam-summary-grid .text-left {
          text-align: left !important;
          padding-left: 4px !important;
        }
        .pp5-subject-exam-signatures {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
          font-size: 16px;
          font-weight: 700;
          text-align: center;
        }
        .report-info-strip,
        .pp6-student-info,
        .pp6-summary-grid,
        .report-subject-list {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin: 10px 0 14px;
        }
        .report-info-strip span,
        .pp6-student-info span,
        .pp6-summary-grid div,
        .report-subject-list span {
          border: 1px solid #d1d5db;
          border-radius: 999px;
          padding: 4px 10px;
          background: #f9fafb;
          font-size: 12px;
        }
        .pp5-attendance-month-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-att-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
          display: flex;
          flex-direction: column;
        }
        .pp5-attendance-month-page .pp5-attendance-table,
        .pp5-attendance-month-page .pp5-subject-hourly-table {
          flex: 0 0 auto;
          height: auto;
        }
        .pp5-attendance-month-page .pp5-attendance-table tbody tr,
        .pp5-attendance-month-page .pp5-subject-hourly-table tbody tr {
          height: var(--pp5-row-h, 23px);
          min-height: var(--pp5-row-h, 23px);
          max-height: var(--pp5-row-h, 23px);
        }
        .pp5-attendance-head {
          text-align: center;
          position: relative;
          margin-bottom: 24px;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
        }
        .pp5-attendance-page-number {
          position: absolute;
          top: 0;
          right: 8px;
          font-size: 14px;
          font-weight: 900;
        }
        .pp5-attendance-head h1 {
          margin: 0;
          line-height: 1.15;
          font-weight: 900;
        }
        .pp5-attendance-head p {
          display: flex;
          justify-content: center;
          gap: 28px;
          margin: 2px 0 0;
          font-size: 14px;
          font-weight: 700;
        }
        .pp5-attendance-head .pp5-attendance-class-line {
          align-items: baseline;
          gap: 10px;
          margin-top: 6px;
          font-size: 17px;
          line-height: 1.1;
          font-weight: 800;
          flex-wrap: wrap;
        }
        .pp5-attendance-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 16px;
          line-height: 1;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          border: 2px solid #111827;
        }
        .pp5-attendance-table th,
        .pp5-attendance-table td {
          border: 1px solid #111827;
          padding: 1px 2px;
          height: var(--pp5-row-h, 23px);
          text-align: center;
          vertical-align: middle;
          font-size: var(--pp5-font-table, 16px);
        }
        .pp5-attendance-table thead th {
          height: 15px;
        }
        .pp5-attendance-table th {
          font-weight: 900;
        }
        .pp5-attendance-week-row th {
          background: #E0F2FE;
        }
        .pp5-attendance-month-row th {
          background: #FEF3C7;
        }
        .pp5-attendance-day-row th {
          background: #FDE68A;
        }
        .pp5-attendance-date-row th {
          background: #F8FAFC;
        }
        .pp5-attendance-hour-row th {
          background: #E5E7EB;
        }
        .pp5-attendance-week-group {
          border-left-width: 2px !important;
          border-right-width: 2px !important;
        }
        .pp5-attendance-table .week-start {
          border-left-width: 2px !important;
        }
        .pp5-attendance-table tbody tr:first-child td {
          border-top-width: 2px;
        }
        .pp5-attendance-table .is-weekend {
          background: #FDE68A !important;
          color: #92400E;
          font-weight: 900;
        }
        .pp5-attendance-table .is-holiday {
          background: #FCA5A5 !important;
          color: #7F1D1D;
          font-weight: 900;
        }
        .pp5-attendance-table .is-open-weekend {
          background: #BBF7D0 !important;
          color: #166534;
          font-weight: 900;
        }
        .pp5-attendance-table .is-absence {
          color: #DC2626;
          font-weight: 900;
        }
        .pp5-attendance-number-col {
          width: 7mm;
          font-size: 13px;
        }
        .pp5-attendance-code-col {
          width: 12mm;
          font-size: 13px;
        }
        .pp5-attendance-name-col {
          width: 44mm;
          background: #F8FAFC !important;
          font-size: 15px;
          vertical-align: middle !important;
        }
        .pp5-attendance-row-label {
          width: 12mm;
          background: #F8FAFC !important;
          font-weight: 900;
        }
        .pp5-attendance-vertical {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          white-space: nowrap;
          font-size: 16px;
          line-height: 1.1;
          padding: 2px 1px !important;
        }
        .pp5-attendance-day-row th:not(.pp5-attendance-row-label),
        .pp5-attendance-date-row th:not(.pp5-attendance-row-label),
        .pp5-attendance-hour-row th:not(.pp5-attendance-row-label) {
          writing-mode: horizontal-tb;
          transform: none;
          text-orientation: mixed;
          white-space: nowrap;
          overflow: hidden;
          padding: 1px 0 !important;
          line-height: 1.1;
        }
        .pp5-attendance-day-row th:not(.pp5-attendance-row-label) {
          height: 14px;
          min-height: 14px;
          font-size: 11px;
        }
        .pp5-attendance-date-row th:not(.pp5-attendance-row-label) {
          height: 16px;
          min-height: 16px;
          font-size: 11px;
        }
        .pp5-attendance-hour-row th:not(.pp5-attendance-row-label) {
          height: 16px;
          min-height: 16px;
          font-size: 10px;
        }
        .pp5-subject-hourly-secondary-table .pp5-attendance-day-row th:not(.pp5-attendance-row-label) {
          width: 5mm;
          min-width: 5mm;
          max-width: 5.5mm;
        }
        .pp5-subject-hourly-secondary-table .pp5-attendance-date-row th:not(.pp5-attendance-row-label) {
          width: 5.5mm;
          min-width: 5mm;
          max-width: 6mm;
        }
        .pp5-subject-hourly-secondary-table .pp5-attendance-hour-row th:not(.pp5-attendance-row-label) {
          width: 6mm;
          min-width: 5.5mm;
          max-width: 6.5mm;
          font-size: 9px !important;
        }
        .pp5-subject-hourly-secondary-table .pp5-attendance-day-row th.is-weekend,
        .pp5-subject-hourly-secondary-table .pp5-attendance-date-row th.is-weekend,
        .pp5-subject-hourly-secondary-table .pp5-attendance-hour-row th.is-weekend {
          background: #FDE68A !important;
          color: #92400E;
        }
        .pp5-attendance-table .text-left {
          text-align: left;
          padding-left: 5px;
          font-size: 15px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
        }
        .pp5-subject-hourly-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-att-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
          display: flex;
          flex-direction: column;
        }
        .pp5-subject-hourly-page .pp5-subject-hourly-table {
          flex: 1 1 auto;
        }
        .pp5-subject-hourly-head {
          margin-bottom: 24px;
        }
        .pp5-subject-hourly-head h1 {
          margin: 0 0 4px;
          font-size: 20px;
          font-weight: 900;
          text-align: center;
          line-height: 1.15;
        }
        .pp5-subject-hourly-head p {
          margin: 0 0 8px;
          font-size: 15px;
          text-align: center;
          font-weight: 700;
        }
        .pp5-subject-hourly-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          table-layout: fixed;
        }
        .pp5-subject-hourly-table th,
        .pp5-subject-hourly-table td {
          border: 1px solid #111827;
          text-align: center;
          padding: 1px;
          height: 18px;
          vertical-align: middle;
        }
        .pp5-subject-hourly-table.pp5-attendance-table thead th {
          height: auto;
          overflow: visible;
        }
        .pp5-subject-hourly-table thead tr:nth-child(1) th {
          min-height: 22px;
          padding: 3px 2px;
        }
        .pp5-subject-hourly-table thead tr:nth-child(2) th {
          min-height: 18px;
          padding: 2px 1px;
        }
        .pp5-subject-hourly-table thead tr:nth-child(3) th {
          min-height: 18px;
          padding: 2px 1px;
        }
        .pp5-subject-hourly-fixed-head {
          background: #F8FAFC !important;
          vertical-align: middle !important;
          padding: 4px 2px !important;
        }
        .pp5-subject-hourly-head-label {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 900;
          line-height: 1.1;
          color: #0F172A;
        }
        .pp5-subject-hourly-head-label.is-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
          transform: rotate(180deg);
          min-height: 40px;
          white-space: nowrap;
        }
        .pp5-subject-hourly-head-label.is-stacked {
          flex-direction: column;
          gap: 1px;
          font-size: 10px;
          min-height: 34px;
          white-space: nowrap;
        }
        .pp5-subject-hourly-name-head .pp5-subject-hourly-head-label {
          font-size: 12px;
          min-height: 40px;
        }
        .pp5-subject-hourly-no-col { width: 8mm; }
        .pp5-subject-hourly-code-col { width: 11mm; }
        .pp5-subject-hourly-name-col { width: 30mm; }
        .pp5-subject-hourly-slot-col { width: 5.5mm; }
        .pp5-subject-hourly-summary-col { width: 7mm; }
        .pp5-subject-hourly-no { width: 8mm; font-size: 14px !important; font-weight: 900; }
        .pp5-subject-hourly-code { width: 11mm; font-size: 12px !important; font-weight: 800; }
        .pp5-subject-hourly-name { width: 30mm; text-align: left !important; padding-left: 4px !important; font-size: 14px !important; font-weight: 700; white-space: nowrap; overflow: hidden; }
        .pp5-subject-hourly-week { background: #E0F2FE !important; font-weight: 900; font-size: 11px !important; line-height: 1.15; }
        .pp5-subject-hourly-date { background: #F8FAFC; font-size: 9px !important; font-weight: 700; line-height: 1.1; white-space: nowrap; }
        .pp5-subject-hourly-slot { width: 5.5mm; font-size: 10px !important; font-weight: 900; background: #E5E7EB; line-height: 1.1; }
        .pp5-subject-hourly-cell { font-size: 12px !important; font-weight: 700; }
        .pp5-subject-hourly-cell.is-present { color: #166534; background: #F0FDF4; }
        .pp5-subject-hourly-summary-head { background: #E0F2FE !important; font-weight: 900; font-size: 10px !important; line-height: 1.1; padding: 2px 1px !important; }
        .pp5-subject-hourly-summary-title { font-size: 9px !important; line-height: 1.15; padding: 3px 2px !important; white-space: normal; }
        .pp5-subject-hourly-summary { background: #FAFAFA; font-weight: 800; font-size: 12px !important; }
        .pp5-subject-hourly-secondary-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-att-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
          display: flex;
          flex-direction: column;
        }
        .pp5-subject-hourly-secondary-page .pp5-subject-hourly-secondary-table {
          flex: 0 0 auto;
          height: auto;
        }
        .pp5-subject-hourly-secondary-page .pp5-subject-hourly-secondary-table tbody tr {
          height: 5.5mm;
          min-height: 5.5mm;
          max-height: 5.5mm;
        }
        .pp5-subject-hourly-secondary-table .pp5-subject-hourly-weekend-cell,
        .pp5-subject-hourly-secondary-table .pp5-subject-hourly-holiday-cell {
          background: #F3F4F6 !important;
          padding: 0 !important;
          vertical-align: middle;
        }
        .pp5-subject-hourly-secondary-table .pp5-subject-hourly-holiday-cell {
          background: #FEE2E2 !important;
        }
        .pp5-subject-hourly-sec-summary-head {
          background: #E0F2FE !important;
          font-weight: 900;
          font-size: 11px !important;
          line-height: 1.1;
          min-width: 10mm;
        }
        .pp5-subject-hourly-sec-summary {
          background: #FAFAFA;
          font-weight: 800;
          font-size: 12px !important;
        }
        .pp5-subject-hourly-summary-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-att-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
          display: flex;
          flex-direction: column;
        }
        .pp5-subject-hourly-summary-page .pp5-subject-hourly-table {
          flex: 1 1 auto;
        }
        .pp5-subject-hourly-summary-code-col {
          width: 12mm;
        }
        .pp5-subject-hourly-summary-table thead th {
          text-align: center !important;
          vertical-align: middle !important;
          padding: 3px 2px !important;
          font-weight: 900;
        }
        .pp5-subject-hourly-summary-table .pp5-subject-hourly-summary-id-head {
          background: #F8FAFC !important;
          font-size: 12px !important;
          line-height: 1.15;
        }
        .pp5-subject-hourly-summary-table .pp5-subject-hourly-summary-metric-head {
          background: #E0F2FE !important;
          font-size: 11px !important;
          line-height: 1.15;
        }
        .pp5-subject-hourly-summary-table tbody .pp5-subject-hourly-summary {
          background: #FAFAFA;
          font-weight: 800;
          font-size: 12px !important;
        }
        .report-empty-inline { text-align: center; color: #64748B; padding: 24px 0; font-size: 13px; }
        .pp5-attendance-summary-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-att-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
        }
        .pp5-attendance-summary-table {
          font-size: 13px;
          line-height: 1.1;
        }
        .pp5-summary-number-col {
          width: 8mm;
        }
        .pp5-summary-code-col {
          width: 16mm;
        }
        .pp5-summary-name-col {
          width: 48mm;
        }
        .pp5-summary-metric-col {
          width: 7.8mm;
        }
        .pp5-attendance-summary-table th,
        .pp5-attendance-summary-table td {
          height: 24px;
          padding: 1px 2px;
        }
        .pp5-attendance-summary-table th {
          background: #F8FAFC;
        }
        .pp5-attendance-summary-table thead tr:first-child th:nth-child(n+4) {
          background: #E0F2FE;
        }
        .pp5-attendance-summary-table .text-left {
          font-size: 15px;
          white-space: nowrap;
          overflow: visible;
        }
        .pp5-attendance-table tbody td:nth-child(1),
        .pp5-attendance-table tbody td:nth-child(2) {
          font-size: 13px;
          font-weight: 800;
        }
        .pp5-score-entry-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
        }
        .pp5-score-entry-head {
          position: relative;
          text-align: center;
          margin-bottom: 24px;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
        }
        .pp5-score-entry-head h1 {
          margin: 0;
          font-size: 21px;
          line-height: 1.15;
          font-weight: 900;
        }
        .pp5-score-entry-head .pp5-score-entry-class-line {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 10px;
          margin: 6px 0 0;
          font-size: 17px;
          line-height: 1.1;
          font-weight: 800;
          flex-wrap: wrap;
        }
        .pp5-score-entry-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 2px solid #111827;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          font-size: 16px;
          line-height: 1;
        }
        .pp5-score-entry-table th,
        .pp5-score-entry-table td {
          border: 1px solid #111827;
          padding: 1px 2px;
          text-align: center;
          vertical-align: middle;
        }
        .pp5-score-entry-table tbody td {
          height: 23px;
          font-size: 16px;
        }
        .pp5-score-entry-table th {
          background: #F8FAFC;
          font-weight: 900;
        }
        .pp5-score-entry-table thead tr:first-child th:nth-child(4) {
          background: #E0F2FE;
          font-size: 14px;
        }
        .pp5-score-between-head {
          line-height: 1.15;
        }
        .pp5-score-between-head > span {
          display: block;
        }
        .pp5-score-entry-table thead tr:first-child th {
          height: 38px;
        }
        .pp5-score-entry-table thead tr:nth-child(2) th,
        .pp5-score-entry-table thead tr:nth-child(3) th {
          height: 17px;
        }
        .pp5-score-entry-table tbody tr:first-child td {
          border-top-width: 2px;
        }
        .pp5-score-vertical {
          padding: 0 !important;
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
        }
        .pp5-score-vertical > span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: 88px;
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          transform-origin: center;
          text-align: center;
        }
        .pp5-score-side-head > span {
          min-height: 88px;
        }
        .pp5-score-number-col {
          width: 7mm;
        }
        .pp5-score-code-col {
          width: 13mm;
        }
        .pp5-score-name-col {
          width: 42mm;
          font-size: 15px;
        }
        .pp5-score-entry-table.is-term-two .pp5-score-name-col {
          width: 38mm;
        }
        .pp5-score-unit-col {
          width: 4.5mm;
        }
        .pp5-score-total-col {
          width: 7.5mm;
        }
        .pp5-score-side-col,
        .pp5-score-grade-col,
        .pp5-score-note-col {
          width: 7.5mm;
        }
        .pp5-score-entry-table .text-left {
          text-align: left;
          padding-left: 5px;
          font-size: 15px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
        }
        .pp5-score-entry-table tbody td:nth-child(1),
        .pp5-score-entry-table tbody td:nth-child(2) {
          font-size: 13px;
          font-weight: 800;
        }
        .pp5-achievement-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
        }
        .pp5-achievement-head {
          position: relative;
          margin-bottom: 6px;
          text-align: center;
          min-height: calc(var(--pp5-logo-size, 24px) + var(--pp5-logo-offset-y, 0px) + 8px);
        }
        .pp5-achievement-head-text {
          min-width: 0;
          padding-left: calc(var(--pp5-logo-size, 24px) + var(--pp5-logo-gap, 8px));
        }
        .pp5-achievement-logo {
          position: absolute;
          left: var(--pp5-logo-offset-x, 0px);
          top: var(--pp5-logo-offset-y, 0px);
          width: var(--pp5-logo-size, 24px);
          height: var(--pp5-logo-size, 24px);
          display: grid;
          place-items: center;
          z-index: 1;
          color: #94A3B8;
          font-size: calc(var(--pp5-logo-size, 24px) * 0.33);
        }
        .pp5-achievement-logo img {
          width: var(--pp5-logo-size, 24px);
          height: var(--pp5-logo-size, 24px);
          object-fit: contain;
        }
        .pp5-achievement-head h1 {
          margin: 0 0 2px;
          font-size: 18px;
          line-height: 1.05;
          font-weight: 900;
        }
        .pp5-achievement-head p {
          margin: 0;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
          font-size: 16px;
          line-height: 1.05;
          font-weight: 800;
        }
        .pp5-achievement-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          font-size: 16px;
          line-height: 1.1;
        }
        .pp5-achievement-table th,
        .pp5-achievement-table td {
          border: 1px solid #111827;
          padding: 1px 2px;
          height: 23px;
          text-align: center;
          vertical-align: middle;
          color: #111827;
        }
        .pp5-achievement-table th {
          font-weight: 900;
          background: #F8FAFC;
        }
        .pp5-achievement-table tbody td {
          height: 23px;
        }
        .pp5-achievement-table .text-left {
          text-align: left;
          padding-left: 5px;
          font-size: 15px;
          font-weight: 800;
          white-space: nowrap;
          overflow: hidden;
        }
        .pp5-achievement-number-col {
          width: 5mm;
        }
        .pp5-achievement-code-col {
          width: 9mm;
        }
        .pp5-achievement-name-col {
          width: 34mm;
        }
        .pp5-achievement-score-col,
        .pp5-achievement-grade-col {
          width: 4.6mm;
        }
        .pp5-achievement-gpa-col {
          width: 7mm;
        }
        .pp5-achievement-vertical {
          padding: 0 !important;
        }
        .pp5-achievement-vertical span {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          display: inline-block;
          white-space: nowrap;
          line-height: 1;
        }
        .pp5-achievement-subject-head {
          height: 20mm !important;
          padding: 0 !important;
          overflow: hidden;
        }
        .pp5-achievement-subject-head span {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          display: inline-block;
          max-height: 19mm;
          white-space: nowrap;
          font-size: 11px;
          line-height: 1;
        }
        .pp5-achievement-table thead tr:nth-child(3) th {
          height: 14mm;
          min-height: 14mm;
          padding: 0 !important;
          vertical-align: middle;
        }
        .pp5-achievement-score-head span,
        .pp5-achievement-grade-head span {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 13mm;
          white-space: nowrap;
          line-height: 1;
        }
        .pp5-character-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
        }
        .pp5-character-criteria-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
        }
        .pp5-character-criteria-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 2px solid #111827;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          font-size: 15px;
          line-height: 1.15;
        }
        .pp5-character-criteria-table th,
        .pp5-character-criteria-table td {
          border: 1px solid #111827;
          padding: 4px 6px;
          vertical-align: middle;
        }
        .pp5-character-criteria-table th {
          background: #F8FAFC;
          font-weight: 900;
          text-align: center;
          font-size: 18px;
          height: 28px;
        }
        .pp5-character-criteria-table tbody tr:first-child td {
          border-top-width: 2px;
        }
        .pp5-character-criteria-topic-col {
          width: 38%;
        }
        .pp5-character-criteria-behavior-col {
          width: 62%;
        }
        .pp5-character-criteria-topic-cell {
          text-align: left;
          vertical-align: middle;
          padding: 6px 8px;
        }
        .pp5-character-criteria-topic-title {
          font-weight: 900;
          font-size: 16px;
          line-height: 1.15;
        }
        .pp5-character-criteria-topic-score {
          text-align: center;
          font-weight: 800;
          font-size: 16px;
          margin-top: 6px;
        }
        .pp5-character-criteria-behavior-cell {
          text-align: left;
          vertical-align: top;
          padding: 4px 6px;
          font-size: 16px;
          line-height: 1.2;
        }
        .pp5-character-criteria-behavior-no {
          display: inline-block;
          min-width: 24px;
          font-weight: 900;
          margin-right: 4px;
        }
        .pp5-character-criteria-behavior-text {
          font-weight: 700;
        }
        .pp5-reading-criteria-table .pp5-reading-rubric-col {
          width: 16%;
        }
        .pp5-reading-rubric-head {
          white-space: pre-line;
          line-height: 1.25;
        }
        .pp5-reading-rubric-cell {
          vertical-align: top;
          font-size: 15px;
          line-height: 1.35;
          color: #334155;
        }
        .pp5-character-head {
          position: relative;
          text-align: center;
          margin-bottom: 10px;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
        }
        .pp5-character-head h1 {
          margin: 0 0 8px;
          font-size: 21px;
          line-height: 1.1;
          font-weight: 900;
        }
        .pp5-character-head p {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 10px;
          margin: 0;
          font-size: 17px;
          line-height: 1.1;
          font-weight: 800;
          flex-wrap: wrap;
        }
        .pp5-character-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 2px solid #111827;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          font-size: 16px;
          line-height: 1;
        }
        .pp5-character-table th,
        .pp5-character-table td {
          border: 1px solid #111827;
          height: 23px;
          padding: 1px 2px;
          text-align: center;
          vertical-align: middle;
        }
        .pp5-character-table th {
          background: #F8FAFC;
          font-weight: 900;
        }
        .pp5-character-table thead tr:first-child th:nth-child(4),
        .pp5-character-table thead tr:first-child th:nth-child(5) {
          background: #E0F2FE;
        }
        .pp5-character-table tbody tr:first-child td {
          border-top-width: 2px;
        }
        .pp5-character-number-col {
          width: 7mm;
        }
        .pp5-character-code-col {
          width: 13mm;
        }
        .pp5-character-name-col {
          width: 50mm;
        }
        .pp5-character-score-col {
          width: 5.5mm;
        }
        .pp5-character-level-col {
          width: 18mm;
        }
        .pp5-character-result-col {
          width: 18mm;
        }
        .pp5-character-note-col {
          width: 23mm;
        }
        .pp5-character-vertical {
          padding: 0 !important;
          white-space: nowrap;
        }
        .pp5-character-vertical > span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: 92px;
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          transform-origin: center;
          text-align: center;
          font-size: 15px;
        }
        .pp5-character-table .text-left {
          text-align: left;
          padding-left: 5px;
          font-size: 15px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
        }
        .pp5-character-table tbody td:nth-child(1),
        .pp5-character-table tbody td:nth-child(2) {
          font-size: 13px;
          font-weight: 800;
        }
        .pp5-reading-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
        }
        .pp5-reading-head {
          position: relative;
          text-align: center;
          margin-bottom: 10px;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
        }
        .pp5-reading-head h1 {
          margin: 0 0 8px;
          font-size: 21px;
          line-height: 1.1;
          font-weight: 900;
        }
        .pp5-reading-head p {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 10px;
          margin: 0;
          font-size: 17px;
          line-height: 1.1;
          font-weight: 800;
          flex-wrap: wrap;
        }
        .pp5-reading-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 2px solid #111827;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          font-size: 16px;
          line-height: 1;
        }
        .pp5-reading-table th,
        .pp5-reading-table td {
          border: 1px solid #111827;
          height: 23px;
          padding: 1px 2px;
          text-align: center;
          vertical-align: middle;
        }
        .pp5-reading-table th {
          background: #F8FAFC;
          font-weight: 900;
        }
        .pp5-reading-table thead tr:first-child th:nth-child(4),
        .pp5-reading-table thead tr:first-child th:nth-child(6) {
          background: #E0F2FE;
        }
        .pp5-reading-table tbody tr:first-child td {
          border-top-width: 2px;
        }
        .pp5-reading-number-col {
          width: 7mm;
        }
        .pp5-reading-code-col {
          width: 13mm;
        }
        .pp5-reading-name-col {
          width: 50mm;
        }
        .pp5-reading-score-col {
          width: 8mm;
        }
        .pp5-reading-total-col {
          width: 10mm;
        }
        .pp5-reading-level-col {
          width: 14mm;
        }
        .pp5-reading-result-col {
          width: 19mm;
        }
        .pp5-reading-vertical {
          padding: 0 !important;
          white-space: nowrap;
        }
        .pp5-reading-vertical > span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: 92px;
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          transform-origin: center;
          text-align: center;
          font-size: 15px;
        }
        .pp5-reading-table .text-left {
          text-align: left;
          padding-left: 5px;
          font-size: 15px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
        }
        .pp5-reading-table tbody td:nth-child(1),
        .pp5-reading-table tbody td:nth-child(2) {
          font-size: 13px;
          font-weight: 800;
        }
        .pp5-competency-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
        }
        .pp5-competency-head {
          position: relative;
          text-align: center;
          margin-bottom: 10px;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
        }
        .pp5-competency-head h1 {
          margin: 0 0 8px;
          font-size: 18px;
          line-height: 1.1;
          font-weight: 900;
        }
        .pp5-competency-head p {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 10px;
          margin: 0;
          font-size: 16px;
          line-height: 1.1;
          font-weight: 800;
          flex-wrap: wrap;
        }
        .pp5-competency-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 2px solid #111827;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          font-size: 16px;
          line-height: 1;
        }
        .pp5-competency-table th,
        .pp5-competency-table td {
          border: 1px solid #111827;
          height: 23px;
          padding: 1px 2px;
          text-align: center;
          vertical-align: middle;
          font-size: 16px !important;
        }
        .pp5-competency-table th {
          background: #F8FAFC;
          font-weight: 900;
        }
        .pp5-competency-table thead th {
          background: #E0F2FE;
        }
        .pp5-competency-table tbody tr:first-child td {
          border-top-width: 2px;
        }
        .pp5-competency-number-col {
          width: 7mm;
        }
        .pp5-competency-name-col {
          width: 70mm;
        }
        .pp5-competency-score-col {
          width: 16mm;
        }
        .pp5-competency-result-col {
          width: 24mm;
        }
        .pp5-competency-table .text-left {
          text-align: left;
          padding-left: 5px;
          font-size: 15px !important;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
        }
        .pp5-competency-table tbody td:nth-child(1) {
          font-size: 13px !important;
          font-weight: 800;
        }
        .pp5-activity-page {
          padding: var(--pp5-pad-top, 25mm) var(--pp5-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
        }
        .pp5-activity-head {
          position: relative;
          text-align: center;
          margin-bottom: 10px;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
        }
        .pp5-activity-head h1 {
          margin: 0 0 8px;
          font-size: 21px;
          line-height: 1.1;
          font-weight: 900;
        }
        .pp5-activity-head p {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 10px;
          margin: 0;
          font-size: 17px;
          line-height: 1.1;
          font-weight: 800;
          flex-wrap: wrap;
        }
        .pp5-activity-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 2px solid #111827;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          font-size: 16px;
          line-height: 1;
        }
        .pp5-activity-table th,
        .pp5-activity-table td {
          border: 1px solid #111827;
          height: 23px;
          padding: 1px 2px;
          text-align: center;
          vertical-align: middle;
        }
        .pp5-activity-table th {
          background: #E0F2FE;
          font-weight: 900;
        }
        .pp5-activity-table tbody tr:first-child td {
          border-top-width: 2px;
        }
        .pp5-activity-number-col {
          width: 7mm;
        }
        .pp5-activity-name-col {
          width: 74mm;
        }
        .pp5-activity-score-col {
          width: 20mm;
        }
        .pp5-activity-result-col {
          width: 24mm;
        }
        .pp5-activity-table .text-left {
          text-align: left;
          padding-left: 5px;
          font-size: 15px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
        }
        .pp5-activity-table tbody td:nth-child(1) {
          font-size: 13px;
          font-weight: 800;
        }
        .pp6-page {
          height: 297mm;
          padding: var(--pp6-pad-top, 8mm) var(--pp6-pad-x, 12mm) var(--pp6-pad-bottom, 9mm) !important;
          overflow: hidden;
          font-family: "TH Sarabun New", Sarabun, "Noto Sans Thai", sans-serif;
          font-size: var(--pp6-font-base, 17px);
          line-height: 1.05;
        }
        .pp6-doc-mark {
          position: absolute;
          top: var(--pp6-doc-mark-top, 15mm);
          right: var(--pp6-doc-mark-right, 20mm);
          font-size: var(--pp6-doc-mark-font, 20px);
          font-weight: 900;
        }
        .pp6-head {
          position: relative;
          display: block;
          min-height: 21mm;
          margin-bottom: var(--pp6-section-gap, 1.2mm);
          padding-top: calc(var(--pp6-head-top, 5mm) + 2.4em);
          text-align: center;
        }
        .pp6-logo {
          position: absolute;
          left: var(--pp6-logo-left, 20mm);
          top: 50%;
          transform: translateY(-50%);
          width: var(--pp6-logo-size, 18mm);
          height: var(--pp6-logo-size, 18mm);
          display: grid;
          place-items: center;
          color: #64748B;
          font-size: 10px;
          font-weight: 900;
        }
        .pp6-logo img {
          width: var(--pp6-logo-size, 18mm);
          height: var(--pp6-logo-size, 18mm);
          object-fit: contain;
        }
        .pp6-head h1 {
          margin: 0 0 1mm;
          font-size: var(--pp6-font-h1, 22px);
          line-height: 1.05;
          font-weight: 900;
        }
        .pp6-head p {
          margin: 0;
          font-size: var(--pp6-font-sub, 19px);
          font-weight: 700;
          line-height: 1.05;
        }
        .pp6-head p b {
          font-weight: 700;
        }
        .pp6-student-line {
          display: flex;
          justify-content: center;
          gap: 2mm;
          align-items: end;
          margin-bottom: var(--pp6-section-gap, 1.2mm);
          font-size: var(--pp6-font-student, 18px);
          font-weight: 400;
        }
        .pp6-student-line span {
          white-space: nowrap;
        }
        .pp6-student-line b {
          display: inline-block;
          min-width: 16mm;
          padding: 0 2mm;
          border-bottom: 1px solid #111827;
          text-align: center;
          font-weight: 700;
        }
        .pp6-student-line b:first-child {
          border-bottom: none;
          min-width: 0;
          padding: 0;
        }
        .pp6-score-table,
        .pp6-activity-table,
        .pp6-summary-table {
          width: var(--pp6-table-width, 85%);
          margin-left: auto;
          margin-right: auto;
          border-collapse: collapse;
          table-layout: fixed;
          border: 1.5px solid #111827;
        }
        .pp6-score-table th,
        .pp6-score-table td,
        .pp6-activity-table th,
        .pp6-activity-table td,
        .pp6-summary-table th,
        .pp6-summary-table td {
          border: 1px solid #111827;
          padding: 1px 2px;
          text-align: center;
          vertical-align: middle;
          color: #111827;
        }
        .pp6-score-table th,
        .pp6-activity-table th,
        .pp6-summary-table th {
          font-weight: 900;
          background: #F8FAFC;
        }
        .pp6-score-table {
          font-size: var(--pp6-font-table, 14px);
          line-height: 1;
        }
        .pp6-score-table th {
          height: var(--pp6-thead-h, 7.2mm);
        }
        .pp6-score-table td {
          height: var(--pp6-row-h, 22px);
        }
        .pp6-score-table .text-left,
        .pp6-activity-table .text-left,
        .pp6-summary-table td:first-child {
          text-align: left;
        }
        .pp6-score-table .text-left {
          padding-left: 3px;
          font-size: var(--pp6-font-name, 15px);
          white-space: nowrap;
          overflow: hidden;
        }
        .pp6-no-col {
          width: 7mm;
        }
        .pp6-code-col {
          width: 15mm;
        }
        .pp6-name-col {
          width: 48mm;
        }
        .pp6-type-col {
          width: 14mm;
        }
        .pp6-weight-col {
          width: 9mm;
        }
        .pp6-score-col {
          width: 9mm;
        }
        .pp6-grade-col {
          width: 8mm;
        }
        .pp6-activity-table {
          margin-top: 1.5mm;
          font-size: 15px;
        }
        .pp6-activity-table th,
        .pp6-activity-table td {
          height: 6.4mm;
        }
        .pp6-activity-table th:first-child {
          width: 115mm;
        }
        .pp6-activity-table td:first-child {
          width: 19mm;
          font-weight: 800;
        }
        .pp6-gpa-line {
          margin: 2mm 0 3mm;
          padding-left: 20mm;
          font-size: 16px;
          font-weight: 900;
        }
        .pp6-gpa-line b {
          font-weight: 900;
        }
        .pp6-bottom-grid {
          display: grid;
          width: 85%;
          margin-left: auto;
          margin-right: auto;
          grid-template-columns: 89mm 1fr;
          gap: 10mm;
          align-items: start;
        }
        .pp6-summary-table {
          width: 100%;
          margin-left: 0;
          margin-right: 0;
          font-size: 15px;
        }
        .pp6-summary-table th,
        .pp6-summary-table td {
          height: 6.2mm;
        }
        .pp6-summary-table td:last-child {
          width: 20mm;
          font-weight: 900;
        }
        .pp6-signatures {
          display: grid;
          gap: 14mm;
          padding-top: 5mm;
          text-align: center;
          font-size: 17px;
          font-weight: 700;
        }
        .pp6-sign-line {
          height: 7mm;
          border-bottom: 1px solid #111827;
        }
        .pp6-signatures p {
          margin: 1mm 0 0;
          font-weight: 900;
        }
        .pp6-signatures span {
          display: block;
        }
        .pp6-muted-cell {
          background: #D9D9D9 !important;
        }
        .pp6-term-one-note {
          width: var(--pp6-table-width, 85%);
          margin: var(--pp6-section-gap, 2mm) auto;
          padding: 1mm 3mm !important;
          color: #FF0000 !important;
          font-size: var(--pp6-font-note, 17px);
          line-height: 1.35;
          text-align: left !important;
          font-weight: 700;
          box-sizing: border-box;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .report-table th,
        .report-table td {
          border: 1px solid #111827;
          padding: 5px 4px;
          text-align: center;
          vertical-align: middle;
          word-break: break-word;
        }
        .report-table th {
          background: #f3f4f6;
          font-weight: 900;
        }
        .report-table.compact {
          font-size: 12px;
        }
        .report-table .text-left {
          text-align: left;
        }
        .report-sign-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 48px;
          text-align: center;
          font-size: 13px;
        }
        .report-sign-line {
          border-bottom: 1px dotted #111827;
          height: 34px;
          margin-bottom: 6px;
        }
        .print-signature-slot {
          display: inline-block;
          vertical-align: middle;
          min-width: 120px;
        }
        .print-signature-img {
          display: block;
          max-height: 42px;
          max-width: 180px;
          margin: 0 auto 4px;
          object-fit: contain;
        }
        .report-sign-grid .print-signature-img,
        .pp6-signatures .print-signature-img {
          max-height: 48px;
          margin-bottom: 6px;
        }
        .pp6-student-sheet {
          page-break-inside: avoid;
          margin-bottom: 20px;
        }
        .pp6-student-sheet + .pp6-student-sheet {
          padding-top: 16px;
          border-top: 2px solid #111827;
        }
        .report-workspace {
          gap: 0;
        }
        .report-workspace--embed {
          padding: 8px;
          min-height: 100vh;
          background: #f8fafc;
        }
        .report-workspace--embed .report-layout {
          grid-template-columns: 1fr;
        }
        .report-workspace--embed .report-preview-panel {
          width: 100%;
          max-width: none;
        }
        .report-workspace--embed .report-preview-shell {
          padding: 0;
        }
        .report-workspace--print {
          padding: 0;
          margin: 0;
          min-height: 0;
          background: white;
        }
        .report-workspace--print .report-layout {
          display: block;
        }
        .report-workspace--print .report-preview-panel,
        .report-workspace--print .report-preview-shell {
          width: 210mm;
          max-width: none;
          margin: 0;
          padding: 0;
        }
        .report-layout {
          display: grid;
          grid-template-columns: minmax(270px, 300px) minmax(420px, 1fr);
          gap: 14px;
          align-items: start;
        }
        .report-side-panel {
          position: sticky;
          top: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
          width: 100%;
          max-width: 300px;
          padding: 14px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: white;
          box-shadow: none;
        }
        .report-side-panel .section-title {
          font-size: 15px;
          line-height: 1.4;
        }
        .report-side-panel .report-filter-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .report-side-panel .report-filter-grid > div {
          display: grid;
          grid-template-columns: 72px minmax(0, 1fr);
          gap: 10px;
          align-items: center;
        }
        .report-side-panel .form-label {
          font-size: 13px;
          color: var(--text-2);
          margin: 0;
        }
        .report-side-panel .form-input {
          min-height: 32px;
          border-radius: 6px;
          font-size: 13px;
          width: 100%;
        }
        .report-filter-note {
          margin: 0;
          color: var(--text-3);
          font-size: 12px;
          line-height: 1.5;
        }
        .report-section-card {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        .report-section-head {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 9px;
          color: var(--text-3);
          font-size: 12px;
        }
        .report-section-head span {
          margin-right: auto;
          color: var(--text);
          font-weight: 900;
        }
        .report-section-head button {
          border: 0;
          background: transparent;
          color: var(--primary);
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        .report-switch-row {
          display: flex !important;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 31px;
          width: 100%;
          box-sizing: border-box;
          padding: 5px 8px;
          border: 1px solid #EEF2F7;
          border-radius: 4px;
          background: #fff;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-2);
        }
        .report-switch-row span {
          min-width: 0;
          text-align: left;
        }
        .report-switch-row + .report-switch-row {
          margin-top: 5px;
        }
        .report-switch-row input {
          appearance: none;
          width: 34px;
          height: 19px;
          border-radius: 999px;
          background: #D1D5DB;
          position: relative;
          cursor: pointer;
          transition: background 0.2s ease;
          flex: 0 0 auto;
        }
        .report-switch-row input::after {
          content: "";
          position: absolute;
          top: 2px;
          left: 2px;
          width: 15px;
          height: 15px;
          border-radius: 999px;
          background: white;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.24);
          transition: transform 0.2s ease;
        }
        .report-switch-row input:checked {
          background: #10B981;
        }
        .report-switch-row input:checked::after {
          transform: translateX(15px);
        }
        .report-preview-panel {
          min-width: 0;
          overflow: visible;
          background: transparent;
          box-shadow: none;
          margin-top: 2.4em;
        }
        .report-preview-toolbar {
          position: sticky;
          top: 8px;
          z-index: 60;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 57px;
          padding: 8px 12px;
          background: white;
          border: 1px solid var(--border);
          border-radius: 6px 6px 0 0;
          border-bottom: 12px solid #E5EBF2;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.10);
        }
        .report-preview-toolbar label {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: var(--text-3);
          font-size: 13px;
        }
        .report-preview-toolbar .form-input {
          width: 120px;
          min-height: 30px;
          border-radius: 5px;
          font-size: 12px;
          padding-top: 5px;
          padding-bottom: 5px;
        }
        .report-preview-actions {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .report-preview-mode {
          display: inline-flex;
          gap: 4px;
          margin-left: auto;
          margin-right: 8px;
        }
        .report-preview-mode .btn {
          min-height: 30px;
          padding: 4px 10px;
          font-size: 12px;
        }
        .report-preview-mode .btn.active {
          border-color: #8B6B45;
          background: #F5EDE3;
          color: #6B4F32;
          font-weight: 800;
        }
        .pp6-jspdf-live {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          min-height: 70vh;
        }
        .pp6-jspdf-live__bar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 12px;
        }
        .pp6-jspdf-live__badge {
          display: inline-flex;
          padding: 4px 10px;
          border-radius: 999px;
          background: #F5EDE3;
          color: #6B4F32;
          font-weight: 800;
        }
        .pp6-jspdf-live__status { color: var(--text-3); }
        .pp6-jspdf-live__error { color: #b91c1c; font-weight: 700; }
        .pp6-jspdf-live__frame-wrap {
          width: 210mm;
          max-width: 100%;
          margin: 0 auto;
          background: #e2e8f0;
          border-radius: 8px;
          padding: 12px;
        }
        .pp6-jspdf-live__frame {
          display: block;
          width: 210mm;
          height: 297mm;
          max-width: 100%;
          border: 0;
          background: white;
          box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
        }
        .pp6-jspdf-live__empty {
          display: grid;
          place-items: center;
          width: 210mm;
          max-width: 100%;
          min-height: 40vh;
          margin: 0 auto;
          background: white;
          color: var(--text-3);
          border-radius: 8px;
        }
        .pp5-tuner-toggle.active {
          border-color: #8B6B45;
          background: #eff6ff;
          color: #6B4F32;
        }
        .report-preview-toolbar .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 31px;
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 13px;
        }
        .report-button-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid currentColor;
          border-right-color: transparent;
          border-radius: 999px;
          display: inline-block;
          animation: reportSpin 0.7s linear infinite;
        }
        @keyframes reportSpin {
          to { transform: rotate(360deg); }
        }
        .report-preview-shell {
          border: 0;
          border-radius: 0;
          background: #F3F6FA;
          min-height: calc(100vh - 180px);
          padding: 44px 28px 28px;
          scrollbar-gutter: stable;
        }
        .report-loading-note {
          justify-content: center;
          min-height: 34px;
          border-radius: 10px;
          text-align: center;
        }
        @media (max-width: 820px) {
          .report-layout {
            grid-template-columns: 1fr;
          }
          .report-side-panel {
            position: static;
            max-width: none;
          }
          .report-side-panel .report-filter-grid > div {
            grid-template-columns: 1fr;
            gap: 6px;
          }
          .report-preview-toolbar {
            align-items: stretch;
            flex-direction: column;
          }
          .report-preview-toolbar label {
            justify-content: space-between;
          }
          .report-preview-actions {
            width: 100%;
            flex-direction: column;
          }
          .report-preview-toolbar .btn,
          .report-preview-toolbar .form-input {
            width: 100%;
          }
        }
        .pp6-summary-table tbody td {
          font-size: 17px;
        }
        /* PP5 body pages — typography & UX (exclude หน้าปก รายวิชา/รวมวิชา) */
        .report-page.pp5-body-page {
          width: 210mm;
          min-height: 297mm;
          height: 297mm;
          max-height: 297mm;
          overflow: hidden;
          padding: var(--pp5-pad-top, 25mm) var(--pp5-pad-x, 13mm) var(--pp5-pad-bottom, 10mm);
          box-sizing: border-box;
          font-size: var(--pp5-font-table, 16px);
          line-height: 1.25;
          color: #111827;
        }
        .report-page.pp5-body-page h1 {
          margin: 0 0 6px !important;
          font-size: var(--pp5-font-h1, 18px) !important;
          font-weight: 700 !important;
          line-height: 1.2 !important;
        }
        .report-page.pp5-body-page header p,
        .report-page.pp5-body-page .pp5-subject-report-subline,
        .report-page.pp5-body-page .pp5-subject-exam-meta,
        .report-page.pp5-body-page .pp5-attendance-head .pp5-attendance-class-line,
        .report-page.pp5-body-page .pp5-score-entry-head .pp5-score-entry-class-line {
          font-size: var(--pp5-font-sub, 16px) !important;
          font-weight: 700 !important;
          line-height: 1.25 !important;
        }
        .report-page.pp5-body-page .pp5-subject-report-head,
        .report-page.pp5-body-page .pp5-character-head,
        .report-page.pp5-body-page .pp5-reading-head,
        .report-page.pp5-body-page .pp5-competency-head,
        .report-page.pp5-body-page .pp5-activity-head,
        .report-page.pp5-body-page .pp5-attendance-head,
        .report-page.pp5-body-page .pp5-score-entry-head,
        .report-page.pp5-body-page .pp5-achievement-head,
        .report-page.pp5-body-page .pp5-subject-hourly-head {
          margin-bottom: 12px;
        }
        .report-page.pp5-body-page table {
          border-collapse: collapse;
        }
        .report-page.pp5-body-page table th,
        .report-page.pp5-body-page table td {
          font-size: var(--pp5-font-table, 16px) !important;
          line-height: 1.2 !important;
          padding: 2px 4px !important;
          vertical-align: middle !important;
        }
        .report-page.pp5-body-page table th {
          font-weight: 700 !important;
        }
        .report-page.pp5-body-page table tbody td {
          min-height: var(--pp5-row-h, 23px);
          height: var(--pp5-row-h, 23px);
        }
        .report-page.pp5-body-page .pp5-character-criteria-table tbody td,
        .report-page.pp5-body-page .pp5-reading-criteria-table tbody td {
          min-height: auto;
          height: auto;
        }
        .report-page.pp5-body-page table .text-left {
          font-size: var(--pp5-font-name, 15px) !important;
          font-weight: 700 !important;
          text-align: left !important;
        }
        .report-page.pp5-body-page .pp5-character-vertical > span,
        .report-page.pp5-body-page .pp5-reading-vertical > span,
        .report-page.pp5-body-page .pp5-score-vertical > span,
        .report-page.pp5-body-page .pp5-achievement-vertical span {
          font-size: var(--pp5-font-table, 16px) !important;
          font-weight: 700 !important;
        }
        .report-page.pp5-body-page .pp5-character-criteria-topic-title,
        .report-page.pp5-body-page .pp5-character-criteria-topic-score,
        .report-page.pp5-body-page .pp5-character-criteria-behavior-cell,
        .report-page.pp5-body-page .pp5-reading-rubric-cell {
          font-size: var(--pp5-criteria-font, 16px) !important;
          line-height: 1.25 !important;
        }
        .report-page.pp5-body-page .pp5-subject-exam-signatures,
        .report-page.pp5-body-page .pp5-class-cover-mini-table {
          font-size: 16px !important;
        }
        .report-page.pp5-body-page .pp5-subject-exam-summary-grid .pp5-class-cover-mini-table,
        .report-page.pp5-body-page .pp5-subject-exam-summary-grid .pp5-class-cover-mini-table th,
        .report-page.pp5-body-page .pp5-subject-exam-summary-grid .pp5-class-cover-mini-table td {
          font-size: 16px !important;
        }
        .report-page.pp5-body-page.pp5-attendance-month-page table th,
        .report-page.pp5-body-page.pp5-attendance-month-page table td {
          padding: 0 1px !important;
          line-height: 1.1 !important;
        }
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-attendance-number-col,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-attendance-code-col,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-attendance-name-col,
        .report-page.pp5-body-page.pp5-attendance-month-page tbody td.text-left,
        .report-page.pp5-body-page.pp5-attendance-month-page tbody td:nth-child(1),
        .report-page.pp5-body-page.pp5-attendance-month-page tbody td:nth-child(2),
        .report-page.pp5-body-page.pp5-attendance-month-page tbody td:nth-child(3),
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-no,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-code,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-name,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-summary-id-head {
          font-size: 16px !important;
          font-weight: 700 !important;
          padding: 1px 3px !important;
        }
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-attendance-row-label,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-attendance-day-row th:not(.pp5-attendance-row-label),
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-attendance-date-row th:not(.pp5-attendance-row-label),
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-attendance-hour-row th:not(.pp5-attendance-row-label),
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-attendance-week-group,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-week,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-date,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-slot,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-cell,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-summary-head,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-summary-title,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-sec-summary-head,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-sec-summary,
        .report-page.pp5-body-page.pp5-attendance-month-page .pp5-subject-hourly-summary {
          font-size: 11px !important;
          font-weight: 700 !important;
        }
        .report-page.pp5-body-page.pp5-subject-hourly-summary-page .pp5-subject-hourly-summary,
        .report-page.pp5-body-page.pp5-subject-hourly-summary-page .pp5-subject-hourly-summary-metric-head,
        .report-page.pp5-body-page.pp5-subject-hourly-summary-page .pp5-subject-hourly-summary-id-head,
        .report-page.pp5-body-page.pp5-attendance-summary-page .pp5-attendance-summary-table th,
        .report-page.pp5-body-page.pp5-attendance-summary-page .pp5-attendance-summary-table td {
          font-size: 16px !important;
        }
        .report-page.pp5-body-page .pp5-achievement-subject-head span {
          font-size: 14px !important;
        }
        .report-page.pp5-body-page .pp5-achievement-table .pp5-achievement-score-head span {
          font-size: var(--pp5-font-score, 16px) !important;
        }
        .report-page.pp5-body-page .pp5-achievement-table .pp5-achievement-grade-head span {
          font-size: var(--pp5-font-grade, 16px) !important;
        }
        .report-page.pp5-body-page .pp5-achievement-table thead tr:nth-child(3) th {
          height: 14mm !important;
          min-height: 14mm !important;
          padding: 0 !important;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          html,
          body {
            width: 210mm !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
          }
          body * {
            visibility: hidden !important;
          }
          .report-workspace,
          .report-layout,
          .report-preview-panel,
          .report-preview-shell {
            display: block !important;
            width: 210mm !important;
            min-width: 0 !important;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            background: white !important;
            overflow: visible !important;
          }
          .report-side-panel,
          .report-preview-toolbar,
          .no-print {
            display: none !important;
          }
          .report-print-zone,
          .report-print-zone * {
            visibility: visible !important;
          }
          .report-print-zone {
            position: static !important;
            left: 0;
            top: 0;
            transform: none !important;
            width: 210mm !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
          }
          .report-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0;
            padding: 10mm !important;
            box-shadow: none;
            border: 0;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .report-page.pp5-body-page.pp5-attendance-month-page,
          .report-page.pp5-body-page.pp5-attendance-summary-page,
          .report-page.pp5-body-page.pp5-subject-hourly-page,
          .report-page.pp5-body-page.pp5-subject-hourly-secondary-page,
          .report-page.pp5-body-page.pp5-subject-hourly-summary-page {
            padding: var(--pp5-pad-top, 25mm) var(--pp5-att-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
          }
          .report-page.pp5-body-page.pp5-character-page,
          .report-page.pp5-body-page.pp5-reading-page,
          .report-page.pp5-body-page.pp5-score-entry-page,
          .report-page.pp5-body-page.pp5-achievement-page,
          .report-page.pp5-body-page.pp5-character-criteria-page,
          .report-page.pp5-body-page.pp5-competency-page,
          .report-page.pp5-body-page.pp5-activity-page {
            padding: var(--pp5-pad-top, 25mm) var(--pp5-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
          }
          .pp5-class-cover-page {
            padding: var(--pp5-cover-pad-top, 9mm) var(--pp5-cover-pad-x, 10mm) var(--pp5-cover-pad-bottom, 10mm) !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .pp5-subject-cover-page {
            padding: var(--pp5-cover-pad-top, 9mm) var(--pp5-cover-pad-x, 10mm) var(--pp5-cover-pad-bottom, 10mm) !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .report-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .report-page-number-wrap {
            top: 6mm !important;
            right: 8mm !important;
          }
          .pp5-achievement-page {
            padding: var(--pp5-pad-top, 25mm) var(--pp5-att-pad-x, 13mm) var(--pp5-pad-bottom, 10mm) !important;
          }
          .pp6-page {
            height: 297mm !important;
            padding: 8mm 12mm 9mm !important;
          }
        }
      `}</style>
    </div>
  )
}
