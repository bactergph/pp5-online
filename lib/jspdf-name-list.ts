'use client'

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const FONT_CACHE = new Map<string, string>()

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function loadFontBase64(path: string) {
  const cached = FONT_CACHE.get(path)
  if (cached) return cached
  const res = await fetch(path)
  if (!res.ok) throw new Error('โหลดฟอนต์ไม่สำเร็จ')
  const base64 = arrayBufferToBase64(await res.arrayBuffer())
  FONT_CACHE.set(path, base64)
  return base64
}

/** ติดตั้งฟอนต์ไทย TH Sarabun New ให้ jsPDF */
export async function applyThaiFonts(doc: jsPDF) {
  const [regular, bold] = await Promise.all([
    loadFontBase64('/fonts/th-sarabun-new/regular.ttf'),
    loadFontBase64('/fonts/th-sarabun-new/bold.ttf'),
  ])
  doc.addFileToVFS('THSarabunNew.ttf', regular)
  doc.addFileToVFS('THSarabunNew-Bold.ttf', bold)
  doc.addFont('THSarabunNew.ttf', 'THSarabunNew', 'normal')
  doc.addFont('THSarabunNew-Bold.ttf', 'THSarabunNew', 'bold')
  doc.setFont('THSarabunNew', 'normal')
}

export type NameListPdfStudent = {
  student_number: number
  student_code: string | null
  prefix: string | null
  first_name: string
  last_name: string
  gender?: string | null
  status?: string | null
}

export type NameListPdfInput = {
  schoolName: string
  yearBe: number
  classroomLabel: string
  students: NameListPdfStudent[]
}

function nameListFileName(classroomLabel: string, yearBe: number) {
  const safeClass = classroomLabel.replace(/[\\/:*?"<>|]+/g, '-')
  return `รายชื่อ_${safeClass}_ปี${yearBe}.pdf`
}

/** สร้าง PDF รายชื่อนักเรียนด้วย jsPDF ที่เครื่องผู้ใช้ — คืน Blob ใส่คิวได้ */
export async function buildStudentNameListPdfBlob(input: NameListPdfInput) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await applyThaiFonts(doc)

  const marginX = 14
  let y = 16

  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(18)
  doc.text(input.schoolName || 'โรงเรียน', 105, y, { align: 'center' })
  y += 8

  doc.setFontSize(16)
  doc.text('รายชื่อนักเรียน', 105, y, { align: 'center' })
  y += 7

  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(13)
  doc.text(`ชั้น ${input.classroomLabel} · ปีการศึกษา ${input.yearBe}`, 105, y, { align: 'center' })
  y += 4

  doc.setFontSize(11)
  doc.setTextColor(100)
  doc.text('สร้างด้วย jsPDF บนเครื่องผู้ใช้', 105, y, { align: 'center' })
  doc.setTextColor(0)
  y += 6

  autoTable(doc, {
    startY: y,
    head: [['เลขที่', 'รหัสนักเรียน', 'ชื่อ-สกุล', 'สถานะ']],
    body: input.students.map(s => [
      String(s.student_number || ''),
      s.student_code || '',
      [s.prefix, s.first_name, s.last_name].filter(Boolean).join(''),
      s.status || 'ปกติ',
    ]),
    styles: {
      font: 'THSarabunNew',
      fontSize: 12,
      cellPadding: 2.2,
      lineColor: [180, 180, 180],
      lineWidth: 0.2,
    },
    headStyles: {
      font: 'THSarabunNew',
      fontStyle: 'bold',
      fillColor: [107, 79, 50],
      textColor: 255,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 18 },
      1: { halign: 'center', cellWidth: 32 },
      2: { cellWidth: 'auto' },
      3: { halign: 'center', cellWidth: 28 },
    },
    margin: { left: marginX, right: marginX },
    didDrawPage: (data) => {
      doc.setFont('THSarabunNew', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(120)
      doc.text(`หน้า ${data.pageNumber}`, 105, 287, { align: 'center' })
      doc.setTextColor(0)
    },
  })

  const fileName = nameListFileName(input.classroomLabel, input.yearBe)
  const blob = doc.output('blob')
  return { blob, fileName }
}

/** ดาวน์โหลดทันที (ไม่ผ่านคิว) */
export async function buildStudentNameListPdf(input: NameListPdfInput) {
  const { blob, fileName } = await buildStudentNameListPdfBlob(input)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return fileName
}
