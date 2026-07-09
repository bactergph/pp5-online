/** ดาวน์โหลด blob — คืน true ถ้าควรแสดงลิงก์สำรอง (เบราว์เซอร์อาจบล็อกหลัง async นาน) */
export function downloadBlob(blob: Blob, fileName: string): { manualUrl: string } {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  return { manualUrl: url }
}

export function revokeBlobUrl(url: string | null | undefined) {
  if (url) URL.revokeObjectURL(url)
}
