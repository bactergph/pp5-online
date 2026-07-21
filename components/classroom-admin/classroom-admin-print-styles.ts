import { reportFontFaceCss } from '@/lib/report-font-faces'
import { REPORT_FONT_FAMILY } from '@/lib/report-font'
import { CLASSROOM_ADMIN_A4_LANDSCAPE_CSS } from '@/lib/classroom-admin-a4-landscape'

const CA_PAGE_W = CLASSROOM_ADMIN_A4_LANDSCAPE_CSS.width
const CA_PAGE_MIN_H = CLASSROOM_ADMIN_A4_LANDSCAPE_CSS.minHeight

const CLASSROOM_ADMIN_PRINT_RULES = `
  .classroom-admin-print-header { display: none; }
  .classroom-admin-print-row, .classroom-admin-print-signatures { display: none; }
  .attendance-print-only { display: none; }
  .print-preview-backdrop {
    position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column;
    background: #EEF2F7;
  }
  .print-preview-shell { display: grid; grid-template-rows: auto 1fr; min-height: 100vh; }
  .print-preview-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 14px; border-bottom: 1px solid #CBD5E1; background: #FFFFFF;
  }
  .print-preview-toolbar strong { display: block; color: #0F172A; font-size: 14px; }
  .print-preview-toolbar span { display: block; color: #64748B; font-size: 12px; }
  .print-preview-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .print-preview-actions label { display: inline-flex; align-items: center; gap: 6px; color: #475569; font-size: 12px; font-weight: 800; }
  .print-preview-actions select {
    height: 34px; padding: 4px 8px; border: 1px solid #CBD5E1; border-radius: 9px; background: #FFFFFF;
  }
  .print-preview-stage {
    overflow: auto; padding: 24px; display: grid; place-items: start center;
  }
  .print-preview-scale {
    transform-origin: top center;
  }
  .attendance-print-sheet {
    width: ${CA_PAGE_W}; min-height: ${CA_PAGE_MIN_H};
    padding: var(--ca-pad-top, 16px) var(--ca-pad-x, 18px) var(--ca-pad-bottom, 12px);
    background: #FFFFFF;
    color: #111827; box-shadow: 0 18px 45px rgba(15,23,42,0.16);
    font-family: ${REPORT_FONT_FAMILY} !important;
  }
  .attendance-print-sheet,
  .attendance-print-sheet * {
    font-family: ${REPORT_FONT_FAMILY} !important;
  }
  .attendance-print-head {
    display: grid; justify-items: center; gap: 3px;
    margin-bottom: 6px; text-align: center;
  }
  .attendance-print-logo-slot {
    width: var(--ca-logo-size, 42px); height: var(--ca-logo-size, 42px); display: grid; place-items: center;
    border: 1px solid #CBD5E1; border-radius: 50%; color: #94A3B8; font-size: 11px; overflow: hidden;
  }
  .attendance-print-logo-slot img { width: 100%; height: 100%; object-fit: contain; }
  .attendance-print-head h1 { margin: 0; font-size: var(--ca-font-h1, 16px); line-height: 1.05; font-weight: 900; color: #111827; }
  .attendance-print-school { margin-top: var(--ca-head-line-gap, 2px); font-size: var(--ca-font-school, 16px); font-weight: 900; color: #111827; }
  .attendance-print-head p { margin: var(--ca-head-line-gap, 1px) 0 0; font-size: var(--ca-font-meta, 11px); font-weight: 800; color: #334155; }
  .attendance-print-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    border-spacing: 0;
    font-size: var(--ca-font-table, 8px);
    line-height: 1.2;
  }
  .attendance-print-table.attendance-print-inspection-table {
    width: var(--ca-inspection-table-w, auto);
    max-width: 100%;
  }
  .attendance-print-table.attendance-print-weight-table {
    width: 100%;
    max-width: 100%;
  }
  .attendance-print-sheet.is-pdf-export .attendance-print-inspection-table {
    width: var(--ca-inspection-table-w) !important;
    max-width: var(--ca-inspection-table-w) !important;
  }
  .attendance-print-sheet.is-pdf-export .attendance-print-weight-table {
    width: var(--ca-weight-table-w, 100%) !important;
    max-width: var(--ca-weight-table-w, 100%) !important;
  }
  .attendance-print-number-col { width: var(--ca-number-col-w, 42px); }
  .attendance-print-name-col { width: var(--ca-name-col-w, 190px); }
  .attendance-print-summary-col { width: var(--ca-summary-col-w, 40px); }
  .attendance-print-table th,
  .attendance-print-table td {
    border: 1px solid #111827;
    padding: 1px 2px;
    box-sizing: border-box;
    height: max(23px, var(--ca-row-h, 23px));
    min-height: max(23px, var(--ca-row-h, 23px));
    max-height: max(23px, var(--ca-row-h, 23px));
    text-align: center;
    vertical-align: middle;
    color: #111827;
    overflow: hidden;
    line-height: 1.2;
  }
  .attendance-print-table tbody tr {
    height: max(23px, var(--ca-row-h, 23px));
    min-height: max(23px, var(--ca-row-h, 23px));
    max-height: max(23px, var(--ca-row-h, 23px));
  }
  .attendance-print-table th { background: #BFEAF4; font-weight: 900; }
  .attendance-print-month-title { background: #BFEAF4 !important; font-size: var(--ca-font-month-title, 10px); }
  .attendance-print-summary-title { background: #C4B5FD !important; font-size: var(--ca-font-summary-title, 10px); }
  .attendance-print-student-name {
    text-align: left !important;
    padding: 1px 2px 1px 6px !important;
    font-size: var(--ca-font-name, 11px) !important;
    font-weight: 900;
    line-height: 1.2 !important;
    vertical-align: middle !important;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .attendance-print-status-cell.attendance-ม,
  .attendance-print-status-cell.attendance-print-status-present,
  .attendance-print-status-cell:not(.is-weekend):not(.is-holiday):not(:empty) { background: #CFF8D8; font-weight: 900; color: #14532D; }
  .attendance-print-status-ป,
  .attendance-print-status-ล { background: #FEF3C7 !important; color: #78350F !important; font-weight: 900; }
  .attendance-print-status-ข { background: #FEE2E2 !important; color: #7F1D1D !important; font-weight: 900; }
  .attendance-print-status-cell.is-weekend,
  .attendance-print-empty-cell.is-weekend,
  .attendance-print-day.is-weekend,
  .attendance-print-weekday.is-weekend { background: #D9D9D9 !important; }
  .attendance-print-status-cell.is-holiday,
  .attendance-print-day.is-holiday { background: #FF5B5F !important; color: #111827; }
  .attendance-print-holiday-cell {
    background: #FF5B5F !important;
    padding: 0 !important;
    vertical-align: middle !important;
    position: relative;
  }
  .attendance-print-holiday-stack {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px 0;
    box-sizing: border-box;
    overflow: hidden;
  }
  /* ตรงกับ jsPDF angle 90: ข้อความหมุนทวนเข็ม อ่านจากล่างขึ้นบน */
  .attendance-print-holiday-name {
    display: block;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    color: #111827 !important;
    font-size: var(--ca-font-holiday, 7px);
    font-weight: 900;
    line-height: 1.1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    max-height: calc(100% - 2px);
  }
  .attendance-print-summary-good { background: #DCFCE7 !important; font-weight: 900; }
  .attendance-print-summary-sick { background: #FEF3C7 !important; font-weight: 900; }
  .attendance-print-summary-leave,
  .attendance-print-summary-absent { background: #FEE2E2 !important; font-weight: 900; }
  .attendance-print-standard-table {
    margin-top: 8px; font-size: var(--ca-font-standard-table, 10px);
  }
  .attendance-print-standard-table th,
  .attendance-print-standard-table td {
    height: max(24px, var(--ca-standard-row-h, 24px));
    min-height: max(24px, var(--ca-standard-row-h, 24px));
    max-height: max(24px, var(--ca-standard-row-h, 24px));
    padding: 2px 4px;
    line-height: 1.2;
  }
  .attendance-print-standard-table tbody tr {
    height: max(24px, var(--ca-standard-row-h, 24px));
    min-height: max(24px, var(--ca-standard-row-h, 24px));
    max-height: max(24px, var(--ca-standard-row-h, 24px));
  }
  .attendance-print-standard-table .attendance-print-student-name {
    font-size: var(--ca-font-standard-name, 12px) !important;
  }
  .attendance-print-inspection-table .attendance-print-inspection-number-col {
    width: var(--ca-inspection-number-col-w, 36px);
  }
  .attendance-print-inspection-table .attendance-print-inspection-name-col {
    width: var(--ca-inspection-name-col-w, 280px);
  }
  .attendance-print-inspection-table .attendance-print-inspection-field-col {
    width: var(--ca-inspection-field-col-w, 96px);
  }
  .attendance-print-weight-table .attendance-print-weight-number-col {
    width: var(--ca-weight-number-col-w, 48px);
  }
  .attendance-print-weight-table .attendance-print-weight-name-col {
    width: var(--ca-weight-name-col-w, 320px);
  }
  .attendance-print-weight-table .attendance-print-weight-field-col {
    width: auto;
  }
  .attendance-print-weight-table th,
  .attendance-print-weight-table td {
    font-size: var(--ca-font-standard-table, 11px);
  }
  .attendance-print-value-done { background: #CFF8D8 !important; color: #14532D !important; font-weight: 900; }
  .attendance-print-value-alert { background: #FEE2E2 !important; color: #7F1D1D !important; font-weight: 900; }
  .attendance-print-signatures {
    display: grid; grid-template-columns: 1fr 1fr; gap: var(--ca-signature-gap, 120px); margin-top: var(--ca-signature-margin-top, 32px);
  }
  .attendance-print-signatures > div { text-align: center; font-size: var(--ca-font-signature, 12px); color: #111827; }
  .attendance-print-sign-line { width: 260px; margin: 0 auto 4px; line-height: 1.15; }
  .attendance-print-signatures strong { display: block; min-height: 15px; font-size: var(--ca-font-signature, 12px); font-weight: 900; line-height: 1.15; }
  .attendance-print-signatures span { display: block; margin-top: 2px; font-size: var(--ca-font-signature-role, 11px); line-height: 1.15; }
  @media print {
    @page { size: A4 landscape; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { width: 100%; background: #fff !important; color: #111827 !important; font-size: 10px !important; font-family: ${REPORT_FONT_FAMILY} !important; }
    .sidebar, .sidebar-overlay, .navbar, .navbar-menu-backdrop, .navbar-dropdown,
    .classroom-admin-page > :not(style):not(.attendance-print-only), .print-preview-backdrop, .no-print {
      display: none !important;
    }
    .app-shell, .main-content, .content-shell, .page-stack, .classroom-admin-page {
      display: block !important; width: 100% !important; max-width: none !important;
      min-height: 0 !important; padding: 0 !important; margin: 0 !important; background: #fff !important;
    }
    .attendance-print-only { display: block !important; }
    .attendance-print-sheet {
      width: 100% !important; min-height: 0 !important; padding: 0 !important;
      box-shadow: none !important;
    }
    .attendance-print-head { margin-bottom: 1.5mm !important; gap: 0.8mm !important; }
    .attendance-print-logo-slot { width: 9mm !important; height: 9mm !important; }
    .attendance-print-table th,
    .attendance-print-table td {
      height: 4.9mm !important;
      padding-top: 0.35mm !important;
      padding-bottom: 0.35mm !important;
      line-height: 1.05 !important;
    }
    .attendance-print-student-name {
      font-size: 11px !important;
      line-height: 1.05 !important;
      padding-top: 0.25mm !important;
      padding-bottom: 0.45mm !important;
      vertical-align: middle !important;
    }
    .attendance-print-signatures {
      margin-top: 8.5mm !important;
    }
    .classroom-admin-print-header {
      display: flex !important; align-items: flex-start; justify-content: space-between; gap: 10px;
      margin: 0 0 2mm; padding-bottom: 1.5mm; border-bottom: 0.25mm solid #111827;
    }
    .classroom-admin-print-kicker {
      margin-bottom: 1mm; color: #475569; font-size: 8px; font-weight: 800;
      letter-spacing: 0.08em; text-transform: uppercase;
    }
    .classroom-admin-print-header h1 { margin: 0; color: #0F172A; font-size: 13px; font-weight: 900; line-height: 1.1; }
    .classroom-admin-print-header p { margin: 0.5mm 0 0; color: #334155; font-size: 8px; font-weight: 700; }
    .classroom-admin-print-meta {
      padding: 2mm 3mm; border: 1px solid #CBD5E1; border-radius: 999px;
      color: #334155; font-size: 8.5px; font-weight: 800; white-space: nowrap;
    }
    .classroom-admin-table-card, .class-subjects-table-card, .data-card {
      width: 100% !important; overflow: visible !important; padding: 0 !important;
      border: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important;
    }
    .classroom-admin-month-table {
      width: 100% !important; min-width: 0 !important; table-layout: fixed !important;
      border-collapse: collapse !important; font-size: 6.6px !important;
    }
    .classroom-admin-month-table col { width: auto !important; }
    .classroom-admin-month-table col:first-child { width: 9mm !important; }
    .classroom-admin-month-table col:nth-child(2) { width: 44mm !important; }
    .classroom-admin-month-table th, .classroom-admin-month-table td {
      position: static !important; height: auto !important; min-height: 0 !important;
      padding: 0.45mm 0.45mm !important; border: 0.2mm solid #111827 !important;
      box-shadow: none !important; background: #fff !important; color: #111827 !important;
      vertical-align: middle !important;
    }
    .classroom-admin-month-table th {
      background: #CFFAFE !important; font-size: 6.5px !important; font-weight: 900 !important; line-height: 1.05 !important;
    }
    .classroom-admin-month-title {
      height: auto !important; padding: 0.8mm 1mm !important; text-align: center !important;
      background: #BDECF5 !important; color: #0F172A !important; font-size: 7.2px !important;
    }
    .classroom-admin-student-cell {
      white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
      color: #0F172A !important; font-size: 6.8px !important; line-height: 1.05 !important;
    }
    .classroom-admin-month-table tbody tr { break-inside: avoid; page-break-inside: avoid; }
    .classroom-admin-month-td { padding: 0.35mm !important; text-align: center !important; }
    .classroom-admin-month-cell, .classroom-admin-month-input {
      width: 100% !important; height: 3.6mm !important; min-height: 0 !important;
      border: 0 !important; border-radius: 0 !important; outline: none !important; box-shadow: none !important;
      background: transparent !important; color: #111827 !important; font-size: 6.6px !important; font-weight: 900 !important; line-height: 1 !important;
    }
    .classroom-admin-month-cell.attendance-ม, .classroom-admin-month-cell.is-done { background: #DCFCE7 !important; color: #14532D !important; }
    .classroom-admin-month-cell.attendance-ป, .classroom-admin-month-cell.attendance-ล { background: #FEF3C7 !important; color: #78350F !important; }
    .classroom-admin-month-cell.attendance-ข { background: #FEE2E2 !important; color: #7F1D1D !important; }
    .classroom-admin-month-cell.is-weekend, .classroom-admin-month-input.is-weekend,
    .classroom-admin-weekday-head.is-weekend, .classroom-admin-day-head.is-weekend {
      background: #D9D9D9 !important; color: #111827 !important;
    }
    .classroom-admin-summary-head, .classroom-admin-summary-cell {
      background: #E9D5FF !important; color: #111827 !important; border-left: 0.2mm solid #111827 !important;
    }
    .classroom-admin-summary-cell:nth-last-child(4) { background: #DCFCE7 !important; }
    .classroom-admin-summary-cell:nth-last-child(3) { background: #FEF3C7 !important; }
    .classroom-admin-summary-cell:nth-last-child(2),
    .classroom-admin-summary-cell:nth-last-child(1) { background: #FEE2E2 !important; }
    .classroom-admin-holiday-label { font-size: 6.5px !important; color: #111827 !important; }
    .classroom-admin-print-row { display: table-row !important; }
    .classroom-admin-print-signatures {
      display: grid !important; grid-template-columns: 1fr 1fr; gap: 24mm;
      margin-top: 4mm; break-inside: avoid; page-break-inside: avoid;
    }
    .classroom-admin-signature-box { text-align: center; color: #111827; font-size: 10px; }
    .classroom-admin-signature-line { margin: 0 auto 1.5mm; width: 58mm; border-bottom: 0.25mm dotted #111827; height: 6mm; }
    .classroom-admin-signature-name { margin-top: 1mm; font-weight: 900; }
    .classroom-admin-signature-role { margin-top: 1mm; font-size: 9px; }
  }
  .pp5-tuner-toggle.active {
    border-color: #8B6B45 !important;
    background: #eff6ff !important;
    color: #6B4F32 !important;
  }
  .classroom-admin-page--print {
    padding: 0 !important;
    margin: 0 !important;
    min-height: 0 !important;
    background: #fff !important;
  }
  .classroom-admin-page--print .attendance-print-only {
    display: block !important;
  }
  .classroom-admin-page--print .attendance-print-sheet {
    width: ${CA_PAGE_W} !important;
    min-height: ${CA_PAGE_MIN_H} !important;
    box-shadow: none !important;
    margin: 0 auto;
  }
  .classroom-admin-page--print .classroom-admin-top-card,
  .classroom-admin-page--print .classroom-admin-print-header,
  .classroom-admin-page--print .classroom-admin-table-card,
  .classroom-admin-page--print .classroom-admin-page-legend,
  .classroom-admin-page--print .teacher-assignment-actions,
  .classroom-admin-page--print .print-preview-backdrop {
    display: none !important;
  }
  body:has(.classroom-admin-page--print) .sidebar,
  body:has(.classroom-admin-page--print) .navbar,
  body:has(.classroom-admin-page--print) .sidebar-overlay,
  body:has(.classroom-admin-page--print) .app-topbar {
    display: none !important;
  }
  body:has(.classroom-admin-page--print) .main-content,
  body:has(.classroom-admin-page--print) .content-shell,
  body:has(.classroom-admin-page--print) .page-stack {
    width: auto !important;
    max-width: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }
`

export function classroomAdminPrintStyles(origin = '') {
  return `${reportFontFaceCss(origin)}${CLASSROOM_ADMIN_PRINT_RULES}`
}

export const CLASSROOM_ADMIN_PRINT_STYLES = classroomAdminPrintStyles()
