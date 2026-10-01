import 'server-only'

/** Expected Thai validation messages survive production Server Action serialization. */
export async function scheduleResult<T>(work: () => Promise<T>) {
  try { return { data: await work(), error: null } }
  catch (error) {
    console.error('[schedule]', error)
    const message = error instanceof Error ? error.message : ''
    return { data: null, error: /^[\u0E00-\u0E7F]/.test(message) ? message : 'ดำเนินการไม่สำเร็จ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง' }
  }
}
