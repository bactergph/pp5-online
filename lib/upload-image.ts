export const MAX_UPLOAD_IMAGE_BYTES = 2 * 1024 * 1024

/** Validate the contents as well as the browser-supplied MIME type. */
export async function readUploadImage(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return { error: 'กรุณาเลือกไฟล์รูปภาพ' } as const
  if (value.size > MAX_UPLOAD_IMAGE_BYTES) return { error: 'รูปภาพต้องมีขนาดไม่เกิน 2 MB' } as const
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
  const ext = extensions[value.type]
  if (!ext) return { error: 'รองรับเฉพาะ PNG, JPG, WEBP' } as const
  const bytes = await value.arrayBuffer()
  const b = new Uint8Array(bytes)
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n)
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255
  const webp = b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
  if (!(value.type === 'image/png' ? png : value.type === 'image/jpeg' ? jpeg : webp)) {
    return { error: 'เนื้อหาไฟล์ไม่ตรงกับชนิดรูปภาพ' } as const
  }
  return { bytes, ext, contentType: value.type, size: value.size } as const
}
