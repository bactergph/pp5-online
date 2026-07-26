'use client'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { ROLE_LABELS } from '@/lib/roles'
import { defaultSidebarIcon, normalizeSidebarTone, type SidebarTone } from '@/lib/sidebar-tones'
import { logout } from '@/lib/actions/auth'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Child = { href?: string; label: string; icon?: React.ReactNode; children?: Child[]; tone?: SidebarTone }
type NavItem = { href: string; label: string; icon: React.ReactNode; children?: Child[] }
type NavSection = { label?: string; items: NavItem[] }

function SvgIcon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const SETTINGS_ICON = "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"

const I = {
  home: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  chart: "M18 20V10 M12 20V4 M6 20v-6",
  doc: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  building: "M3 21h18 M9 8h1 M9 12h1 M9 16h1 M14 8h1 M14 12h1 M14 16h1 M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  class: "M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z",
  pen: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5 M17.5 2.5a2.121 2.121 0 013 3L12 14l-4 1 1-4 8.5-8.5z",
  clock: "M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  export: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  sign: "M12 20h9 M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z",
  book: "M4 19.5A2.5 2.5 0 016.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z",
  sliders: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M2 14h4 M10 8h4 M18 16h4",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  calendar: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2",
  tooth: "M12 3c1.1 0 1.7.7 2.6.7S16.1 3 17.2 3C19.3 3 21 4.8 21 7.2c0 1.5-.6 2.8-1.2 4.1-.5 1.2-.8 2.5-1 3.9-.3 2.6-1.1 5.8-3 5.8-1.2 0-1.5-1.5-1.9-3.2-.3-1.4-.7-2.8-1.9-2.8s-1.6 1.4-1.9 2.8C9.7 19.5 9.4 21 8.2 21c-1.9 0-2.7-3.2-3-5.8-.2-1.4-.5-2.7-1-3.9C3.6 10 3 8.7 3 7.2 3 4.8 4.7 3 6.8 3c1.1 0 1.7.7 2.6.7S10.9 3 12 3z",
  bottle: "M9 2h6v4l1 2v12a2 2 0 01-2 2h-4a2 2 0 01-2-2V8l1-2V2z M9 10h6",
  heart: "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z",
  coin: "M12 2a10 10 0 100 20 10 10 0 000-20z M12 6v12 M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5",
  scale: "M12 3v18 M5 7h14 M7 7l-4 7h8L7 7z M17 7l-4 7h8l-4-7z",
}
const ic = (d: string) => <SvgIcon d={d} />

const ICON_BY_PREFIX: Record<string, string> = {
  '/district/results': I.chart,
  '/district': I.building,
  '/reports': I.chart,
  '/export': I.export,
  '/evaluation/summary': I.star,
  '/evaluation': I.star,
  '/settings': SETTINGS_ICON,
  '/classrooms/homeroom': I.users,
  '/classrooms': I.class,
  '/students': I.users,
  '/scores': I.pen,
  '/score-config': I.sliders,
  '/attendance': I.clock,
  '/schedules': I.calendar,
  '/documents': I.sign,
  '/classroom-admin': I.grid,
  '/activity': I.clock,
}

function leafIcon(child: Child) {
  if (child.icon) return child.icon
  if (!child.href) return undefined
  return defaultSidebarIcon(child.href, ic, ICON_BY_PREFIX)
}

// ── building blocks ──
const DASHBOARD: NavItem = { href: '/dashboard', label: 'หน้าหลัก', icon: ic(I.home) }
const CLASSROOMS: NavItem = { href: '/classrooms', label: 'ชั้นที่เปิดสอน', icon: ic(I.class) }
const STUDENTS: NavItem = { href: '/students', label: 'นักเรียน', icon: ic(I.users) }
const SCORES: NavItem = { href: '/scores', label: 'บันทึกคะแนน', icon: ic(I.pen) }
const SCORE_CONFIG: NavItem = { href: '/score-config', label: 'กำหนดสัดส่วนคะแนน', icon: ic(I.sliders) }
const ATTENDANCE: NavItem = { href: '/attendance/hourly', label: 'เช็คเวลาเรียนรายวิชา', icon: ic(I.clock) }
const ADMINS_MANAGE: NavItem = { href: '/district/admins', label: 'สมาชิกโรงเรียน', icon: ic(I.users) }
const SCHOOLS_MANAGE: NavItem = { href: '/district/schools', label: 'ฐานข้อมูลโรงเรียน', icon: ic(I.building) }
const GLOBAL_HOLIDAYS: NavItem = { href: '/district/holidays', label: 'วันหยุดกลาง', icon: ic(I.clock) }
const GLOBAL_TERM_CALENDARS: NavItem = { href: '/district/term-calendars', label: 'เปิด-ปิดภาคเรียนกลาง', icon: ic(I.sliders) }
const GLOBAL_SUBJECTS: NavItem = { href: '/district/subjects', label: 'โครงสร้างรายวิชากลาง', icon: ic(I.book) }
const DISTRICT_REPORT_EXPORT: NavItem = { href: '/district/reports/export', label: 'Export รายงานเขต', icon: ic(I.export) }
const SCHOOL_CLEANUP: NavItem = { href: '/district/school-cleanup', label: 'ล้างข้อมูลโรงเรียนไม่ใช้งาน', icon: ic(I.sliders) }
const ACTIVITY_LOG: NavItem = { href: '/activity', label: 'ประวัติการใช้งาน', icon: ic(I.clock) }

const TEACHER_REPORTS: NavItem = {
  href: '/reports',
  label: 'รายงาน / เอกสาร',
  icon: ic(I.chart),
  children: [
    { href: '/reports/summary', label: 'สรุปคะแนน', icon: ic(I.chart) },
    { href: '/reports/pp5', label: 'ปพ.5 รายวิชา', icon: ic(I.doc) },
  ],
}
const CLASSROOM_ATTENDANCE: NavItem = { href: '/classroom-admin/daily-attendance', label: 'บันทึกเวลาเรียน', icon: ic(I.calendar) }
const CLASSROOM_BRUSHING: NavItem = { href: '/classroom-admin/brushing', label: 'บันทึกการแปรงฟัน', icon: ic(I.tooth) }
const CLASSROOM_MILK: NavItem = { href: '/classroom-admin/milk', label: 'บันทึกการดื่มนม', icon: ic(I.bottle) }
const CLASSROOM_LUNCH: NavItem = { href: '/classroom-admin/lunch', label: 'บันทึกอาหารกลางวัน', icon: ic(I.doc) }
const CLASSROOM_CLEANING: NavItem = { href: '/classroom-admin/cleaning', label: 'บันทึกทำความสะอาดห้อง', icon: ic(I.shield) }
const CLASSROOM_WEIGHT: NavItem = { href: '/classroom-admin/weight-height', label: 'บันทึกน้ำหนัก - ส่วนสูง', icon: ic(I.scale) }
const CLASSROOM_HEALTH: NavItem = { href: '/classroom-admin/health', label: 'บันทึกตรวจสุขภาพ', icon: ic(I.heart) }
const CLASSROOM_SAVING: NavItem = { href: '/classroom-admin/saving', label: 'บันทึกเงินออม', icon: ic(I.coin) }
const CLASSROOM_PRINT: NavItem = { href: '/export/classroom-admin', label: 'พิมพ์เล่มเอกสาร', icon: ic(I.export) }
const CLASSROOM_ADMIN_APPROVED: NavItem = { href: '/classroom-admin/approved', label: 'เอกสารที่อนุมัติแล้ว', icon: ic(I.doc) }
const CLASSROOM_ADMIN_MAIN: NavItem = {
  href: '/classroom-admin',
  label: 'ธุรการชั้นเรียน',
  icon: ic(I.grid),
  children: [
    {
      label: 'บันทึกประจำวัน',
      icon: ic(I.calendar),
      tone: 'daily',
      children: [
        { href: CLASSROOM_ATTENDANCE.href, label: 'เวลาเรียน', icon: CLASSROOM_ATTENDANCE.icon },
        { href: CLASSROOM_BRUSHING.href, label: 'แปรงฟัน', icon: CLASSROOM_BRUSHING.icon },
        { href: CLASSROOM_MILK.href, label: 'ดื่มนม', icon: CLASSROOM_MILK.icon },
        { href: CLASSROOM_LUNCH.href, label: 'อาหารกลางวัน', icon: CLASSROOM_LUNCH.icon },
        { href: CLASSROOM_CLEANING.href, label: 'ทำความสะอาด', icon: CLASSROOM_CLEANING.icon },
      ],
    },
    {
      label: 'สุขภาพ / พัฒนาการ',
      icon: ic(I.heart),
      tone: 'health',
      children: [
        { href: CLASSROOM_WEIGHT.href, label: 'น้ำหนัก - ส่วนสูง', icon: CLASSROOM_WEIGHT.icon },
        { href: CLASSROOM_HEALTH.href, label: 'ตรวจสุขภาพ', icon: CLASSROOM_HEALTH.icon },
        { href: CLASSROOM_SAVING.href, label: 'เงินออม', icon: CLASSROOM_SAVING.icon },
      ],
    },
    {
      label: 'พิมพ์รายงาน',
      icon: ic(I.export),
      tone: 'docs',
      children: [
        { href: CLASSROOM_PRINT.href, label: 'พิมพ์เล่มเอกสาร', icon: CLASSROOM_PRINT.icon },
        { href: CLASSROOM_ADMIN_APPROVED.href, label: 'อนุมัติแล้ว', icon: CLASSROOM_ADMIN_APPROVED.icon },
      ],
    },
  ],
}
const SCHEDULE_CHECK_VIEW_CHILDREN: Child[] = [
  { href: '/schedules/conflicts', label: 'ตรวจความขัดแย้ง', icon: ic(I.shield) },
  { href: '/schedules/workload', label: 'ภาระงานสอน', icon: ic(I.chart) },
]
const SCHEDULE_CHECK_MANAGE_CHILDREN: Child[] = [
  { href: '/schedules/conflicts', label: 'ตรวจความขัดแย้ง', icon: ic(I.shield) },
  { href: '/schedules/workload', label: 'ภาระงานสอน', icon: ic(I.chart) },
]
const SCHEDULE_VIEW_CHILDREN: Child[] = [
  {
    label: 'ดูตาราง',
    icon: ic(I.calendar),
    tone: 'sky',
    children: [
      { href: '/schedules/class', label: 'ตารางเรียน', icon: ic(I.class) },
      { href: '/schedules/teaching', label: 'ตารางสอน', icon: ic(I.pen) },
    ],
  },
  {
    label: 'ตรวจสอบ',
    icon: ic(I.shield),
    tone: 'violet',
    children: SCHEDULE_CHECK_VIEW_CHILDREN,
  },
  {
    label: 'พิมพ์เอกสาร',
    icon: ic(I.export),
    tone: 'docs',
    children: [
      { href: '/export/schedules', label: 'พิมพ์ตาราง', icon: ic(I.export) },
    ],
  },
]
const SCHEDULE_MANAGE_CHILDREN: Child[] = [
  {
    label: 'ดูตาราง',
    icon: ic(I.calendar),
    tone: 'sky',
    children: [
      { href: '/schedules/class', label: 'ตารางเรียน', icon: ic(I.class) },
      { href: '/schedules/teaching', label: 'ตารางสอน', icon: ic(I.pen) },
    ],
  },
  {
    label: 'จัดการตาราง',
    icon: ic(I.sliders),
    tone: 'indigo',
    children: [
      { href: '/schedules/class/manage', label: 'จัดการตารางเรียน', icon: ic(I.grid) },
      { href: '/schedules/period-times', label: 'เวลาคาบเรียน', icon: ic(I.clock) },
      { href: '/schedules/substitute', label: 'ตารางสอนแทน', icon: ic(I.users) },
    ],
  },
  {
    label: 'ตรวจสอบ',
    icon: ic(I.shield),
    tone: 'violet',
    children: SCHEDULE_CHECK_MANAGE_CHILDREN,
  },
  {
    label: 'พิมพ์เอกสาร',
    icon: ic(I.export),
    tone: 'docs',
    children: [
      { href: '/export/schedules', label: 'พิมพ์ตาราง', icon: ic(I.export) },
    ],
  },
]
const SCHEDULE_VIEW_MAIN: NavItem = {
  href: '/schedules/class',
  label: 'ตารางเรียน / ตารางสอน',
  icon: ic(I.calendar),
  children: SCHEDULE_VIEW_CHILDREN,
}
const SCHEDULE_MANAGE_MAIN: NavItem = {
  href: '/schedules/class',
  label: 'ตารางเรียน / ตารางสอน',
  icon: ic(I.calendar),
  children: SCHEDULE_MANAGE_CHILDREN,
}
const PP5_MAIN: NavItem = {
  href: '/homeroom', label: 'ปพ.5 / ปพ.6', icon: ic(I.book),
  children: [
    {
      label: 'บันทึกผล',
      icon: ic(I.pen),
      tone: 'emerald',
      children: [
        { href: '/scores',                label: 'คะแนนรายวิชา', icon: ic(I.doc) },
        { href: '/evaluation/activities', label: 'พัฒนาผู้เรียน', icon: ic(I.star) },
        { href: '/evaluation/character',  label: 'คุณลักษณะ', icon: ic(I.heart) },
        { href: '/evaluation/reading',    label: 'อ่าน คิด เขียน', icon: ic(I.pen) },
        { href: '/evaluation/competency', label: 'สมรรถนะสำคัญ', icon: ic(I.shield) },
      ],
    },
    {
      label: 'พิมพ์รายงาน',
      icon: ic(I.export),
      tone: 'docs',
      children: [
        { href: '/reports/pp5',       label: 'ปพ.5 รายวิชา', icon: ic(I.doc) },
        { href: '/reports/pp5-class', label: 'ปพ.5 รวมชั้นเรียน', icon: ic(I.grid) },
        { href: '/reports/pp6',       label: 'ปพ.6 นักเรียน', icon: ic(I.doc) },
      ],
    },
  ],
}
const PP5_PRINT_ONLY: NavItem = {
  href: '/export',
  label: 'ปพ.5 / ปพ.6',
  icon: ic(I.book),
  children: [
    {
      label: 'พิมพ์รายงาน',
      icon: ic(I.export),
      tone: 'docs',
      children: [
        { href: '/reports/pp5',       label: 'ปพ.5 รายวิชา', icon: ic(I.doc) },
        { href: '/reports/pp5-class', label: 'ปพ.5 รวมชั้นเรียน', icon: ic(I.grid) },
        { href: '/reports/pp6',       label: 'ปพ.6 นักเรียน', icon: ic(I.doc) },
      ],
    },
  ],
}
const EVAL_SUMMARY: NavItem = {
  href: '/evaluation/summary', label: 'สรุปการประเมิน', icon: ic(I.star),
  children: [
    { href: '/evaluation/summary/reading',    label: 'สรุปอ่าน คิด วิเคราะห์', icon: ic(I.pen) },
    { href: '/evaluation/summary/activities', label: 'สรุปกิจกรรมพัฒนาผู้เรียน', icon: ic(I.star) },
  ],
}
const REPORT_STATUS: NavItem = {
  href: '/reports', label: 'รายงาน', icon: ic(I.chart),
  children: [{ href: '/reports/status', label: 'สถานะการบันทึก', icon: ic(I.clock) }],
}
const REPORT_OVERSIGHT: NavItem = {
  href: '/reports', label: 'รายงาน', icon: ic(I.chart),
  children: [
    { href: '/reports/status',     label: 'สถานะการบันทึก', icon: ic(I.clock) },
    { href: '/reports/individual', label: 'รายงานรายบุคคล', icon: ic(I.users) },
  ],
}
const EXPORT_FULL: NavItem = {
  href: '/export', label: 'Export เอกสาร', icon: ic(I.export),
  children: [
    { href: '/export/schoolmis',       label: 'SchoolMIS', icon: ic(I.export) },
    { href: '/export/grade-matrix',    label: 'Grade Matrix', icon: ic(I.grid) },
    { href: '/export/name-list',       label: 'รายชื่อนักเรียน', icon: ic(I.users) },
    { href: '/export/classroom-admin', label: 'ธุรการชั้นเรียน', icon: ic(I.grid) },
    { href: '/export/schedules',       label: 'ตารางเรียน/สอน', icon: ic(I.calendar) },
    { href: '/export/qr-code',         label: 'QR-Code', icon: ic(I.grid) },
  ],
}
const DOCUMENTS_SIGN_NAV: NavItem = {
  href: '/documents/sign',
  label: 'เอกสารเสนอเซ็น',
  icon: ic(I.sign),
}
const ASSIGN: NavItem = {
  href: '/settings', label: 'มอบหมายและตั้งค่าวิชาการ', icon: ic(I.users),
  children: [
    { href: '/settings/subjects', label: 'รายวิชา / ชุมนุม', icon: ic(I.book) },
    { href: '/score-config',   label: 'กำหนดสัดส่วนคะแนน', icon: ic(I.sliders) },
    { href: '/settings/evaluation-criteria', label: 'เกณฑ์การประเมิน', icon: ic(I.doc) },
    { href: '/settings/class-subjects', label: 'กำหนดครูประจำวิชา', icon: ic(I.users) },
    { href: '/classrooms/homeroom', label: 'กำหนดครูประจำชั้น', icon: ic(I.class) },
  ],
}
const ADMIN_SETTINGS: NavItem = {
  href: '/settings',
  label: 'การตั้งค่า',
  icon: ic(SETTINGS_ICON),
  children: [
    {
      label: 'บัญชีของฉัน',
      icon: ic(I.users),
      tone: 'slate',
      children: [
        { href: '/settings/profile', label: 'ข้อมูลตัวเอง', icon: ic(I.users) },
      ],
    },
    {
      label: 'ข้อมูลพื้นฐาน',
      icon: ic(I.building),
      tone: 'sky',
      children: [
        { href: '/settings/school', label: 'ข้อมูลโรงเรียน', icon: ic(I.building) },
        { href: '/settings/users', label: 'ข้อมูลบุคลากร', icon: ic(I.users) },
        { href: '/settings/academic-year', label: 'ปีการศึกษา', icon: ic(I.calendar) },
        { href: '/settings/holidays', label: 'วันหยุด', icon: ic(I.clock) },
      ],
    },
    {
      label: 'ข้อมูลวิชาการ',
      icon: ic(I.book),
      tone: 'indigo',
      children: [
        { href: '/classrooms', label: 'ชั้นที่เปิดสอน', icon: ic(I.class) },
        { href: '/students', label: 'นักเรียน', icon: ic(I.users) },
        { href: '/settings/subjects', label: 'รายวิชา / ชุมนุม', icon: ic(I.book) },
        { href: '/score-config', label: 'กำหนดสัดส่วนคะแนน', icon: ic(I.sliders) },
        { href: '/settings/evaluation-criteria', label: 'เกณฑ์การประเมิน', icon: ic(I.doc) },
        { href: '/settings/class-subjects', label: 'กำหนดครูประจำวิชา', icon: ic(I.pen) },
        { href: '/classrooms/homeroom', label: 'กำหนดครูประจำชั้น', icon: ic(I.users) },
      ],
    },
  ],
}

const USER_SETTINGS: NavItem = {
  href: '/settings/profile',
  label: 'ตั้งค่า',
  icon: ic(SETTINGS_ICON),
  children: [
    { href: '/settings/profile', label: 'ข้อมูลตัวเอง', icon: ic(I.users) },
  ],
}

// ══════════════════════════════ เมนูแยกราย role (จัดกลุ่มมีหัวข้อ) ══════════════════════════════
const DISTRICT_NAV: NavSection[] = [
  { items: [DASHBOARD] },
  { label: 'สมาชิกและโรงเรียน', items: [SCHOOLS_MANAGE, ADMINS_MANAGE] },
  { label: 'ข้อมูลกลางระบบ', items: [GLOBAL_SUBJECTS, GLOBAL_TERM_CALENDARS, GLOBAL_HOLIDAYS] },
  { label: 'ระบบ', items: [DISTRICT_REPORT_EXPORT, USER_SETTINGS, SCHOOL_CLEANUP, ACTIVITY_LOG] },
]
const ADMIN_NAV: NavSection[] = [
  { items: [DASHBOARD] },
  { label: 'ตั้งค่าโรงเรียน', items: [ADMIN_SETTINGS] },
  { label: 'งานประจำชั้น', items: [CLASSROOM_ADMIN_MAIN, SCHEDULE_MANAGE_MAIN] },
  { label: 'วัดและประเมินผล', items: [PP5_MAIN, DOCUMENTS_SIGN_NAV] },
  { label: 'ติดตามและรายงาน', items: [EVAL_SUMMARY, REPORT_STATUS, EXPORT_FULL, ACTIVITY_LOG] },
]
const PRINCIPAL_NAV: NavSection[] = [
  { items: [DASHBOARD] },
  { label: 'ภาพรวมโรงเรียน', items: [CLASSROOMS, STUDENTS, EVAL_SUMMARY, SCHEDULE_VIEW_MAIN] },
  { label: 'ตรวจสอบข้อมูล', items: [REPORT_OVERSIGHT] },
  { label: 'เอกสาร ปพ.', items: [PP5_PRINT_ONLY, DOCUMENTS_SIGN_NAV] },
  { label: 'ตรวจสอบและอนุมัติ', items: [DOCUMENTS_SIGN_NAV] },
  { label: 'ตั้งค่า', items: [USER_SETTINGS] },
  { label: 'ระบบ', items: [ACTIVITY_LOG] },
]
const ACADEMIC_HEAD_NAV: NavSection[] = [
  { items: [DASHBOARD] },
  { label: 'ภาพรวมโรงเรียน', items: [CLASSROOMS, STUDENTS, EVAL_SUMMARY] },
  { label: 'มอบหมายงานวิชาการ', items: [ASSIGN] },
  { label: 'ตารางเรียน / ตารางสอน', items: [SCHEDULE_MANAGE_MAIN] },
  { label: 'วัดและประเมินผล', items: [PP5_MAIN, DOCUMENTS_SIGN_NAV] },
  { label: 'ตรวจสอบและอนุมัติ', items: [DOCUMENTS_SIGN_NAV] },
  { label: 'รายงานสำหรับวิชาการ', items: [REPORT_OVERSIGHT, ACTIVITY_LOG] },
  { label: 'ตั้งค่า', items: [USER_SETTINGS] },
]
const TEACHER_NAV: NavSection[] = [
  { items: [DASHBOARD] },
  { label: 'งานสอนรายวิชา', items: [SCORES, SCORE_CONFIG, ATTENDANCE, SCHEDULE_VIEW_MAIN] },
  { label: 'นักเรียน', items: [STUDENTS] },
  { label: 'รายงาน / เอกสาร', items: [TEACHER_REPORTS, DOCUMENTS_SIGN_NAV, ACTIVITY_LOG] },
  { label: 'ตั้งค่า', items: [USER_SETTINGS] },
]
const HOMEROOM_NAV: NavSection[] = [
  { items: [DASHBOARD] },
  { label: 'งานสอนรายวิชา', items: [SCORES, SCORE_CONFIG, ATTENDANCE, SCHEDULE_VIEW_MAIN] },
  { label: 'นักเรียน', items: [STUDENTS] },
  { label: 'งานประจำชั้น', items: [CLASSROOM_ADMIN_MAIN] },
  { label: 'วัดและประเมินผล', items: [PP5_MAIN, DOCUMENTS_SIGN_NAV] },
  { label: 'รายงาน / เอกสาร', items: [TEACHER_REPORTS, ACTIVITY_LOG] },
  { label: 'ตั้งค่า', items: [USER_SETTINGS] },
]

function buildNav(role: string, isHomeroom: boolean): NavSection[] {
  switch (role) {
    case 'district':      return DISTRICT_NAV
    case 'admin':         return ADMIN_NAV
    case 'principal':     return PRINCIPAL_NAV
    case 'academic_head': return ACADEMIC_HEAD_NAV
    case 'teacher':       return isHomeroom ? HOMEROOM_NAV : TEACHER_NAV
    default:              return [
      { items: [DASHBOARD] },
      { label: 'ตั้งค่า', items: [USER_SETTINGS] },
    ]
  }
}

function renderSubmenuLink(
  child: Child,
  tone: string,
  opts: {
    mounted: boolean
    pathname: string
    scopedHref: (href: string) => string
    isCurrent: (href: string) => boolean
    onClose: () => void
  },
) {
  if (!child.href) return null
  const childHref = opts.scopedHref(child.href)
  const active = opts.mounted && (opts.pathname === childHref || opts.pathname === child.href)
  const icon = leafIcon(child)
  return (
    <Link
      key={`${child.href}::${child.label}`}
      href={childHref}
      onClick={opts.onClose}
      data-sidebar-current={opts.isCurrent(child.href) ? 'true' : undefined}
      className={`sidebar-child-link sidebar-submenu-link sidebar-submenu-link--${tone} ${active ? 'is-active' : ''}`}
    >
      {icon && <span className="sidebar-child-icon">{icon}</span>}
      <span>{child.label}</span>
    </Link>
  )
}

function renderSubmenuChildren(
  children: Child[],
  opts: {
    mounted: boolean
    pathname: string
    scopedHref: (href: string) => string
    isCurrent: (href: string) => boolean
    onClose: () => void
  },
) {
  const nodes: React.ReactNode[] = []
  let flatBatch: Child[] = []
  let toneIndex = 0

  const flushFlat = () => {
    if (!flatBatch.length) return
    const tone = normalizeSidebarTone(undefined, toneIndex++)
    nodes.push(
      <div key={`flat-${toneIndex}`} className={`sidebar-child-group sidebar-child-group--list sidebar-child-group--${tone}`}>
        <div className="sidebar-grandchildren">
          {flatBatch.map(child => renderSubmenuLink(child, tone, opts))}
        </div>
      </div>,
    )
    flatBatch = []
  }

  for (const child of children) {
    if (child.children?.length) {
      flushFlat()
      const tone = normalizeSidebarTone(child.tone, toneIndex++)
      nodes.push(
        <div key={child.label} className={`sidebar-child-group sidebar-child-group--${tone}`}>
          <div className="sidebar-child-group-label">
            {child.icon && <span className="sidebar-child-group-badge">{child.icon}</span>}
            <span className="sidebar-child-group-text">{child.label}</span>
          </div>
          <div className="sidebar-grandchildren">
            {child.children.map(grandchild => renderSubmenuLink(grandchild, tone, opts))}
          </div>
        </div>,
      )
    } else if (child.href) {
      flatBatch.push(child)
    }
  }

  flushFlat()
  return nodes
}

type Props = {
  isOpen: boolean
  onClose: () => void
  userRole: string
  navRole: string
  userName: string
  isHomeroom: boolean
  isActingDirector?: boolean
  schoolCode: string | null
  schoolLogoUrl?: string | null
  schoolProgramName?: string | null
  schoolName?: string | null
}

export default function Sidebar({
  isOpen,
  onClose,
  userRole,
  navRole,
  userName,
  isHomeroom,
  isActingDirector = false,
  schoolCode,
  schoolLogoUrl = null,
  schoolProgramName = null,
  schoolName = null,
}: Props) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [manualExpand, setManualExpand] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    Promise.resolve().then(() => setMounted(true))
  }, [])

  useEffect(() => {
    // เปลี่ยนหน้าแล้วกลับไปเปิดตามเมนูที่กำลังอยู่
    setManualExpand(false)
    setExpanded([])
  }, [pathname])

  const sections = buildNav(navRole, isHomeroom)
  const schoolPrefix = schoolCode && userRole !== 'district' ? `/${schoolCode}` : ''
  const scopedHref = (href: string) => {
    if (!schoolPrefix || !href.startsWith('/') || href.startsWith('/district')) return href
    return `${schoolPrefix}${href}`
  }
  const isActive = (href: string) => {
    if (!mounted) return false
    const scoped = scopedHref(href)
    return pathname === scoped || pathname.startsWith(scoped + '/') || pathname === href || pathname.startsWith(href + '/')
  }
  const isCurrent = (href: string) => {
    if (!mounted) return false
    const scoped = scopedHref(href)
    return pathname === scoped || pathname === href
  }
  function hasActiveChild(children?: Child[]): boolean {
    if (!children) return false
    return children.some(child => {
      if (child.href && isActive(child.href)) return true
      return hasActiveChild(child.children)
    })
  }
  const isExpanded = (item: NavItem) => {
    if (manualExpand) return expanded.includes(item.href)
    return isActive(item.href) || hasActiveChild(item.children)
  }
  const toggle = (item: NavItem) => {
    const currentlyOpen = isExpanded(item)
    setManualExpand(true)
    setExpanded(currentlyOpen ? [] : [item.href])
  }

  useEffect(() => {
    if (!mounted) return
    const nav = navRef.current
    if (!nav) return

    const frame = window.requestAnimationFrame(() => {
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches
      if (!isOpen && !isDesktop) return

      const currentLink = nav.querySelector<HTMLElement>('[data-sidebar-current="true"]')
      const activeLink = currentLink || nav.querySelector<HTMLElement>('.sidebar-child-link.is-active, .sidebar-link.is-active')
      activeLink?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isOpen, mounted, pathname, userRole, isHomeroom])

  function renderItem(item: NavItem) {
    const href = scopedHref(item.href)
    const active = isActive(item.href) || hasActiveChild(item.children)
    const left = (
      <span className="sidebar-link-left">
        <span className="sidebar-link-icon">{item.icon}</span>
        <span className="sidebar-link-label">{item.label}</span>
      </span>
    )

    if (!item.children) {
      return (
        <Link key={item.href} href={href} onClick={onClose} data-sidebar-current={isCurrent(item.href) ? 'true' : undefined} className={`sidebar-link ${active ? 'is-active' : ''}`}>
          {left}
        </Link>
      )
    }
    const open = isExpanded(item)
    return (
      <div key={item.href} className={`sidebar-item${open ? ' is-open' : ''}${active ? ' has-active' : ''}`}>
        <button
          type="button"
          onClick={() => toggle(item)}
          aria-expanded={open}
          className={`sidebar-link sidebar-parent${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        >
          {left}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
            className={`sidebar-chevron${open ? ' is-expanded' : ''}`} aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        {open && (
          <div className="sidebar-children sidebar-submenu--cards">
            {renderSubmenuChildren(item.children ?? [], {
              mounted,
              pathname,
              scopedHref,
              isCurrent,
              onClose,
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      {/* Logo — โรงเรียน: โลโก้ + ชื่อโปรแกรม / Super Admin: จารย์เสก */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-main">
          <div className={`sidebar-brand-mark${schoolLogoUrl && userRole !== 'district' ? ' sidebar-brand-mark--school' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={userRole !== 'district' && schoolLogoUrl ? schoolLogoUrl : '/brand/jarnsek-logo-sm.png'}
              alt=""
            />
          </div>
          <div className="sidebar-brand-copy">
            <div className="sidebar-brand-title">
              {userRole !== 'district'
                ? (schoolProgramName || schoolName || 'ระบบ ปพ.5 ออนไลน์')
                : 'จารย์เสก'}
            </div>
            {userRole !== 'district' ? (
              schoolProgramName && schoolName ? (
                <div className="sidebar-brand-subtitle">{schoolName}</div>
              ) : null
            ) : (
              <div className="sidebar-brand-subtitle">Jarn-Sek</div>
            )}
          </div>
        </div>
        <button onClick={onClose} className="sidebar-close lg:hidden">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* User chip */}
      <div className="sidebar-user-chip">
        <div className="sidebar-user-avatar">
          {userName.charAt(0)}
        </div>
        <div className="sidebar-user-copy">
          <div className="sidebar-user-name">{userName}</div>
          <div className="sidebar-user-role">
            {getRoleLabel(userRole, isActingDirector)}{isHomeroom ? ' · ครูประจำชั้น' : ''}
          </div>
        </div>
      </div>

      {/* Nav (sectioned) */}
      <nav ref={navRef} className="sidebar-nav">
        {sections.map((section, si) => (
          <div key={si} className={section.label ? 'sidebar-section' : 'sidebar-section sidebar-section-first'}>
            {section.label && (
              <div className="sidebar-section-label">
                {section.label}
              </div>
            )}
            {section.items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <form action={logout} className="sidebar-logout-form">
          <SidebarLogoutButton />
        </form>
      </div>
    </aside>
  )
}

function SidebarLogoutButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="sidebar-logout" disabled={pending} aria-busy={pending}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9" />
      </svg>
      {pending ? 'กำลังออก...' : 'ออกจากระบบ'}
    </button>
  )
}

function getRoleLabel(role: string, isActingDirector = false): string {
  if (role === 'district') return 'Super Admin'
  const label = ROLE_LABELS[role] || role
  if (isActingDirector) return `${label} · รักษาการ ผอ.`
  return label
}
