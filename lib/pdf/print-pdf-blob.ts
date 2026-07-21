/**
 * เปิดไดอะล็อกพิมพ์จาก PDF Blob (jsPDF) — ไม่ผ่าน HTML/window.print ของหน้าเว็บ
 */
export async function printPdfBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'พิมพ์ PDF')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  document.body.appendChild(iframe)

  try {
    await new Promise<void>((resolve, reject) => {
      const done = () => resolve()
      iframe.onload = () => done()
      iframe.onerror = () => reject(new Error('โหลด PDF สำหรับพิมพ์ไม่สำเร็จ'))
      iframe.src = url
      // บางเบราว์เซอร์ไม่ยิง onload กับ PDF — สำรองเวลาสั้น ๆ
      window.setTimeout(done, 1200)
    })
    const win = iframe.contentWindow
    if (!win) throw new Error('เปิดหน้าต่างพิมพ์ไม่สำเร็จ')
    win.focus()
    win.print()
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
      iframe.remove()
    }, 60_000)
  }
}
