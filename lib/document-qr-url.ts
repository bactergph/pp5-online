/** URL ที่ฝังใน QR บนปกปพ.5 — ใช้ลิงก์ Google Drive เมื่อมีไฟล์แล้ว */
export function documentQrUrl(ref: { pdfUrl?: string | null; verifyUrl: string }) {
  const drive = typeof ref.pdfUrl === 'string' ? ref.pdfUrl.trim() : ''
  if (drive) return drive
  return ref.verifyUrl
}
