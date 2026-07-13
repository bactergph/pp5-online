'use client'

const cache = new Map<string, string>()

/**
 * โหลดรูปแล้วย่อขนาดเป็น data URL (PNG เพื่อคงความโปร่งใสของโลโก้)
 * ป้องกันไม่ให้ Chromium ฝังรูปต้นฉบับความละเอียดสูง (เช่น 3600×3600) ลงใน PDF
 * ซึ่งทำให้ไฟล์ใหญ่และเปิดช้า
 *
 * ถ้าโหลดหรือย่อไม่สำเร็จ (เช่น ติด CORS) จะคืน URL เดิมกลับไปเสมอ
 */
export async function downscaleImageUrl(url: string, maxSizePx = 320): Promise<string> {
  if (!url || url.startsWith('data:')) return url
  const cacheKey = `${url}@${maxSizePx}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  try {
    const result = await new Promise<string>((resolve, reject) => {
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) return reject(new Error('empty image'))
        const scale = Math.min(1, maxSizePx / Math.max(w, h))
        // เล็กพออยู่แล้ว ไม่ต้องย่อ ใช้ URL เดิม
        if (scale >= 1) return resolve(url)
        const cw = Math.max(1, Math.round(w * scale))
        const ch = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no 2d context'))
        ctx.drawImage(img, 0, 0, cw, ch)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('load error'))
      img.src = url
    })
    cache.set(cacheKey, result)
    return result
  } catch {
    return url
  }
}

/**
 * ย่อไฟล์รูป (File/Blob) ก่อนอัปโหลดให้มีด้านยาวสุดไม่เกิน maxSizePx
 * คืนเป็น PNG blob เพื่อคงความโปร่งใส (เหมาะกับโลโก้/ตราโรงเรียน)
 * ถ้ารูปเล็กพออยู่แล้วหรือย่อไม่สำเร็จ จะคืนไฟล์เดิมกลับไป
 */
export async function downscaleImageFile(file: File, maxSizePx = 512): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) return reject(new Error('empty image'))
        const scale = Math.min(1, maxSizePx / Math.max(w, h))
        if (scale >= 1) return resolve(file)
        const cw = Math.max(1, Math.round(w * scale))
        const ch = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no 2d context'))
        ctx.drawImage(img, 0, 0, cw, ch)
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png')
      }
      img.onerror = () => reject(new Error('load error'))
      img.src = objectUrl
    }).catch(() => file)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
