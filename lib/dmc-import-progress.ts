export const DMC_IMPORT_BATCH_SIZE = 200
export type DmcImportProgress = {
  total: number; processed: number; inserted: number; duplicate: number; failed: number; missingClass: number
  batch: number; batches: number; classroom: string; status: 'saving' | 'done' | 'error'
}
type BatchResult = { error?: string | null; inserted: number; duplicate?: number; failed?: number; missingClass?: number; firstError?: string | null }

export async function runDmcImport<T>(rows: T[], save: (batch: T[]) => Promise<BatchResult>,
  update: (progress: DmcImportProgress) => void, classroom: (row: T) => string) {
  const progress: DmcImportProgress = { total: rows.length, processed: 0, inserted: 0, duplicate: 0, failed: 0,
    missingClass: 0, batch: 0, batches: Math.ceil(rows.length / DMC_IMPORT_BATCH_SIZE), classroom: '', status: 'saving' }
  let firstError: string | null = null
  try {
    for (let from = 0; from < rows.length; from += DMC_IMPORT_BATCH_SIZE) {
      const batch = rows.slice(from, from + DMC_IMPORT_BATCH_SIZE)
      progress.batch++
      progress.classroom = [...new Set(batch.map(classroom))].join(', ')
      update({ ...progress })
      const result = await save(batch)
      progress.inserted += result.inserted
      progress.duplicate += result.duplicate || 0
      progress.failed += result.failed || 0
      progress.missingClass += result.missingClass || 0
      firstError ||= result.firstError || null
      if (result.error) throw new Error(result.error)
      progress.processed += batch.length
      update({ ...progress })
    }
    progress.status = progress.failed || progress.missingClass ? 'error' : 'done'
    update({ ...progress })
    return { ...progress, error: progress.status === 'error' ? firstError || 'บางรายการนำเข้าไม่สำเร็จ กรุณาตรวจสอบข้อมูล' : null }
  } catch (cause) {
    progress.status = 'error'
    update({ ...progress })
    return { ...progress, error: cause instanceof Error ? cause.message : 'การเชื่อมต่อขัดข้อง กรุณาตรวจข้อมูลที่บันทึกแล้วก่อนลองใหม่' }
  }
}
