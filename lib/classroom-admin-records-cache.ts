import 'server-only'

/** แคชสั้นสำหรับ records ธุรการ: น้ำหนัก/สุขภาพ/เงินออม */
const TTL_MS = 45_000

type CacheEntry<T> = { expiresAt: number; value: T }

const weightStore = new Map<string, CacheEntry<Record<string, unknown>>>()
const inspectionStore = new Map<string, CacheEntry<Record<string, unknown>>>()
const activityStore = new Map<string, CacheEntry<unknown>>()

function getCached<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = store.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    store.delete(key)
    return null
  }
  return hit.value
}

function setCached<T>(store: Map<string, CacheEntry<T>>, key: string, value: T) {
  store.set(key, { expiresAt: Date.now() + TTL_MS, value })
}

function weightKey(classroomId: string, academicYearId: string, month: number) {
  return `${classroomId}|${academicYearId}|${month}`
}

function inspectionKey(classroomId: string, academicYearId: string, term: number, month: number) {
  return `${classroomId}|${academicYearId}|${term}|${month}`
}

function activityKey(classroomId: string, monthKey: string, activityType: string) {
  return `${classroomId}|${monthKey}|${activityType}`
}

export function invalidateWeightHeightCache(classroomId: string, academicYearId: string, month: number) {
  weightStore.delete(weightKey(classroomId, academicYearId, month))
}

export function invalidateHealthInspectionCache(
  classroomId: string,
  academicYearId: string,
  term: number,
  month: number,
) {
  inspectionStore.delete(inspectionKey(classroomId, academicYearId, term, month))
}

export function invalidateMonthlyActivityCache(classroomId: string, monthKey: string, activityType: string) {
  activityStore.delete(activityKey(classroomId, monthKey, activityType))
}

export async function getWeightHeightRecordsCached(
  classroomId: string,
  academicYearId: string,
  month: number,
  loader: () => Promise<Record<string, unknown>>,
) {
  const key = weightKey(classroomId, academicYearId, month)
  const hit = getCached(weightStore, key)
  if (hit) return { ...hit }
  const value = await loader()
  setCached(weightStore, key, value)
  return { ...value }
}

export async function getHealthInspectionRecordsCached(
  classroomId: string,
  academicYearId: string,
  term: number,
  month: number,
  loader: () => Promise<Record<string, unknown>>,
) {
  const key = inspectionKey(classroomId, academicYearId, term, month)
  const hit = getCached(inspectionStore, key)
  if (hit) return { ...hit }
  const value = await loader()
  setCached(inspectionStore, key, value)
  return { ...value }
}

export async function getMonthlyActivityRowsCached<T>(
  classroomId: string,
  monthKey: string,
  activityType: string,
  loader: () => Promise<T>,
): Promise<T> {
  const key = activityKey(classroomId, monthKey, activityType)
  const hit = getCached(activityStore, key) as T | null
  if (hit != null) {
    return Array.isArray(hit) ? ([...hit] as T) : hit
  }
  const value = await loader()
  setCached(activityStore, key, value as unknown)
  return Array.isArray(value) ? ([...value] as T) : value
}
