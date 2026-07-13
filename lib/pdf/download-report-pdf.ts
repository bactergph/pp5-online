export type DownloadReportPdfInput = {
  path: string
  query: string
  fileName: string
  landscape?: boolean
  emulateMedia?: 'screen' | 'print'
  localStorageSeed?: Record<string, string>
}

/** ดาวน์โหลด PDF ผ่าน Puppeteer (/api/reports/pdf) — ใช้ร่วมกับ ปพ.5, ธุรการชั้นเรียน, ตารางเรียน */
export async function downloadReportPdf(input: DownloadReportPdfInput) {
  const res = await fetch('/api/reports/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: input.path,
      query: input.query,
      landscape: input.landscape,
      emulateMedia: input.emulateMedia,
      localStorageSeed: input.localStorageSeed,
    }),
  })

  if (!res.ok) {
    let message = 'สร้าง PDF ไม่สำเร็จ'
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {}
    throw new Error(message)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = input.fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
