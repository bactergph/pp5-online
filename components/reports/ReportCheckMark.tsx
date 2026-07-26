/** เครื่องหมายถูกสำหรับรายงาน/PDF — ไม่พึ่ง glyph ใน TH Sarabun New */
export default function ReportCheckMark({
  size = 10,
  color = '#111827',
  /** ทับช่องสี่เหลี่ยมให้อ่านชัด (ใช้บนปกปพ.5) */
  stamp = false,
}: {
  size?: number
  color?: string
  stamp?: boolean
}) {
  const stroke = stamp ? 2.2 : 1.8
  return (
    <svg
      className={`report-checkmark${stamp ? ' report-checkmark--stamp' : ''}`}
      viewBox="0 0 12 12"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1.6 6.2 4.7 9.2 10.4 2.6"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
