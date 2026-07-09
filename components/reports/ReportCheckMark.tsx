/** เครื่องหมายถูกสำหรับรายงาน/PDF — ไม่พึ่ง glyph ใน TH Sarabun New */
export default function ReportCheckMark({
  size = 10,
  color = '#111827',
}: {
  size?: number
  color?: string
}) {
  return (
    <svg
      className="report-checkmark"
      viewBox="0 0 12 12"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.2 6.1 4.8 8.7 9.8 3.2"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
