/** ดึงแถว PostgREST ครบทุกหน้า — ค่าเริ่ม max ~1000 แถว/ครั้ง ถ้าไม่วน range จะตัดเงียบ */

export const SUPABASE_DEFAULT_PAGE_SIZE = 1000

type PageResult<T> = {
  data: T[] | null
  error: { message: string } | null
}

/**
 * วนดึงทุกหน้าจนครบ
 * `fetchPage(from, to)` ต้องใส่ `.order(...)` คงที่ก่อน `.range(from, to)` เสมอ
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = SUPABASE_DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const size = Math.max(1, pageSize)
  const all: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...data)
    if (data.length < size) break
  }
  return all
}

/** เหมือน fetchAllRows แต่คืน [] เมื่อ error แทนการ throw — ใช้คู่กับ safeRows เดิม */
export async function fetchAllRowsSafe<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = SUPABASE_DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  try {
    return await fetchAllRows(fetchPage, pageSize)
  } catch {
    return []
  }
}
