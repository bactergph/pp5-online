const DB_NAME = 'pp5-schedule-device'
const STORE = 'snapshots'
const FREE_KEY = 'free-plan'

function openCache() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readScheduleCache<T>(year: string, term: number) {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openCache()
    const row = await new Promise<{ savedAt: string; data: T } | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(`${year}:${term}`)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return row || null
  } catch {
    return null
  }
}

export async function readFreePlan<T>() {
  return readFreePlanRecord<T>()
}

export async function readFreePlanRecord<T>() {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openCache()
    const row = await new Promise<{ savedAt: string; data: T; uploadedHash?: string } | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(FREE_KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return row || null
  } catch {
    return null
  }
}

export async function markFreePlanUploaded(hash: string) {
  const row = await readFreePlanRecord<unknown>()
  if (!row || typeof indexedDB === 'undefined') return
  try {
    const db = await openCache()
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put({ ...row, uploadedHash: hash }, FREE_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    db.close()
  } catch {
    // ส่งขึ้นระบบแล้ว แม้เครื่องนี้จะจำเครื่องหมายไม่สำเร็จ
  }
}

export async function writeFreePlan(data: unknown, savedAt = new Date().toISOString()) {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openCache()
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put({ savedAt, data }, FREE_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    db.close()
  } catch {
    // เครื่องนี้เก็บสำเนาไม่ได้
  }
}

export async function writeScheduleCache(year: string, term: number, data: unknown, savedAt = new Date().toISOString()) {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openCache()
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put({ savedAt, data }, `${year}:${term}`)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    db.close()
  } catch {
    // เครื่องนี้เก็บสำเนาไม่ได้ ยังจัดจากข้อมูลที่โหลดมาแล้วได้
  }
}
