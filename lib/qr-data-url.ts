import QRCode from 'qrcode'

/** สร้าง data URL (PNG) ของ QR สำหรับฝังใน HTML / jsPDF */
export async function qrDataUrl(text: string, size = 256): Promise<string | null> {
  if (!text.trim()) return null
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#111827', light: '#ffffff' },
    })
  } catch {
    return null
  }
}
