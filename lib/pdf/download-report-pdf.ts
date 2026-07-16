export type DownloadReportPdfInput = {
  path: string
  query: string
  fileName: string
  landscape?: boolean
  emulateMedia?: 'screen' | 'print'
  localStorageSeed?: Record<string, string>
  flattenEffects?: boolean
}

/** ดึง PDF เป็น Blob ผ่าน Puppeteer — ใช้กับคิวดาวน์โหลดมุมขวาล่าง */
export async function fetchReportPdfBlob(input: DownloadReportPdfInput) {
  const res = await fetch('/api/reports/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: input.path,
      query: input.query,
      landscape: input.landscape,
      emulateMedia: input.emulateMedia,
      localStorageSeed: input.localStorageSeed,
      flattenEffects: input.flattenEffects,
    }),
  })

  if (!res.ok) {
    let message = 'สร้าง PDF ไม่สำเร็จ'
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch { /* keep default */ }
    throw new Error(message)
  }

  return res.blob()
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** ดาวน์โหลดทันที (ไม่ผ่านคิว) — เหลือไว้กรณีพิเศษ */
export async function downloadReportPdf(input: DownloadReportPdfInput) {
  const blob = await fetchReportPdfBlob(input)
  triggerBlobDownload(blob, input.fileName)
}
