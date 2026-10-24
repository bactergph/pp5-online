const DB_NAME = 'pp5-schedule-device'
const STORE = 'snapshots'
const FREE_KEY = 'free-plan'

// Signup school details contain no login credentials and stay on this device.
export async function writeRegistrationSchool(userId: string, data: import('./schedule-device-school').DeviceSchoolBasics) {
  if (!userId || typeof indexedDB === 'undefined') throw Error('บันทึกข้อมูลโรงเรียนบนอุปกรณ์นี้ไม่ได้')
  const db = await openCache()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error || Error('บันทึกข้อมูลโรงเรียนไม่สำเร็จ'))
      transaction.onerror = () => reject(transaction.error)
      transaction.objectStore(STORE).put(data, `registration-school:${userId}`)
    })
  } finally { db.close() }
}

export async function readRegistrationSchool(userId?: string) {
  if (!userId || typeof indexedDB === 'undefined') return null
  const db = await openCache()
  try {
    return await new Promise<import('./schedule-device-school').DeviceSchoolBasics | null>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(`registration-school:${userId}`)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

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
  return readFreePlanRecord<T>(true)
}

export async function readFreePlanRecord<T>(strict = false) {
  if (typeof indexedDB === 'undefined') {
    if (strict) throw Error('เบราว์เซอร์นี้ไม่รองรับฐานข้อมูลบนเครื่อง')
    return null
  }
  try {
    const db = await openCache()
    const row = await new Promise<{ savedAt: string; data: T; uploadedHash?: string } | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(FREE_KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return row || null
  } catch (error) {
    if (strict) throw error
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

export async function writeFreePlan(data: unknown, savedAt = new Date().toISOString(), expectedSavedAt?: string) {
  if (typeof indexedDB === 'undefined') throw Error('เบราว์เซอร์นี้ไม่รองรับฐานข้อมูลบนเครื่อง')
  const db = await openCache()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      const store = transaction.objectStore(STORE)
      let conflict = false
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(conflict ? Error('ข้อมูลถูกแก้จากแท็บอื่น กรุณาสำรองข้อมูลแล้วโหลดหน้าใหม่') : transaction.error || Error('บันทึกลงเครื่องไม่สำเร็จ'))
      transaction.onerror = () => reject(transaction.error)
      const request = store.get(FREE_KEY)
      request.onsuccess = () => {
        if (expectedSavedAt !== undefined && (request.result?.savedAt || '') !== expectedSavedAt) { conflict = true; transaction.abort(); return }
        store.put({ savedAt, data }, FREE_KEY)
      }
    })
  } finally {
    db.close()
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
