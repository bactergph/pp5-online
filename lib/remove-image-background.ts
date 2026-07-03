/** แปลง JPEG ที่พื้นหลังสว่าง → PNG โปร่งใส (เบื้องต้น) */
export async function removeLightBackgroundToPng(file: File): Promise<Blob> {
  if (file.type === 'image/png') return file

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('ไม่สามารถประมวลผลรูปได้')

    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const pixels = imageData.data

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const diff = max - min
      if (max > 235 && diff < 28) pixels[i + 3] = 0
      else if (min > 200 && diff < 18) pixels[i + 3] = Math.min(pixels[i + 3], 48)
    }

    ctx.putImageData(imageData, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('แปลงรูปไม่สำเร็จ'))), 'image/png')
    })
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'))
    img.src = src
  })
}
