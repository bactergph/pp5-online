'use client'

/** ดึง CSV SchoolMIS ผ่าน API (ไม่ใช้ Server Action — คิวข้ามหน้าไม่ค้าง) */
export async function fetchSchoolMisCsvBlob(params: {
  academicYearId: string
  classroomId: string
}): Promise<{ blob: Blob; fileName: string }> {
  const res = await fetch('/api/export/schoolmis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      academicYearId: params.academicYearId,
      classroomId: params.classroomId,
    }),
  })

  if (!res.ok) {
    let message = 'ส่งออกไม่สำเร็จ'
    try {
      const body = await res.json()
      if (body?.error) message = String(body.error)
    } catch { /* keep default */ }
    throw new Error(message)
  }

  const headerName = res.headers.get('X-Export-Filename')
  let fileName = 'schoolmis.csv'
  if (headerName?.trim()) {
    try { fileName = decodeURIComponent(headerName.trim()) } catch { fileName = headerName.trim() }
  } else {
    fileName = decodeContentDispositionFileName(res.headers.get('Content-Disposition')) || fileName
  }
  const blob = await res.blob()
  return { blob, fileName }
}

function decodeContentDispositionFileName(header: string | null) {
  if (!header) return null
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) {
    try { return decodeURIComponent(utf8[1].trim()) } catch { /* ignore */ }
  }
  const plain = header.match(/filename="([^"]+)"/i) || header.match(/filename=([^;]+)/i)
  return plain?.[1]?.trim() || null
}
