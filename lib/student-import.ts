import type { createServerClient } from '@/lib/supabase'

type ImportDb = ReturnType<typeof createServerClient>
export type ImportStudentRow = {
  student_code: string | null; national_id: string | null; prefix: string
  first_name: string; last_name: string; gender: string; birth_date: string | null
  address?: string | null; status: string
}
export type ImportStudentSchoolRow = ImportStudentRow & { level: string; room: number | string }
type ExistingStudent = { classroom_id: string; student_number: number; national_id: string | null; student_code: string | null }
export type ImportCandidate = ImportStudentRow & { classroom_id: string }

export function normalizeImportNationalId(raw: unknown): string | null {
  let value = String(raw ?? '').trim()
  if (/e[+-]?\d+/i.test(value) && Number.isFinite(Number(value))) value = Math.round(Number(value)).toString()
  return value.replace(/\D/g, '') || null
}

// PostgREST limits returned rows. Always page, otherwise retries miss students after row 1,000.
export async function readImportStudents(db: ImportDb, classroomIds: string[]) {
  const students: ExistingStudent[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('students')
      .select('classroom_id, student_number, national_id, student_code')
      .in('classroom_id', classroomIds).order('id').range(from, from + 999)
    if (error) return { students: [], error: `ตรวจสอบรายชื่อนักเรียนเดิมไม่สำเร็จ: ${error.message}` }
    students.push(...(data || []))
    if (!data || data.length < 1000) return { students, error: null }
  }
}

export async function insertImportStudents(db: ImportDb, candidates: ImportCandidate[], existing: ExistingStudent[]) {
  const nationalIds = new Set(existing.map(s => normalizeImportNationalId(s.national_id)).filter(Boolean))
  const codes = new Set(existing.map(s => String(s.student_code ?? '').trim()).filter(Boolean))
  const numbers = new Map<string, number>()
  for (const row of existing) numbers.set(row.classroom_id, Math.max(numbers.get(row.classroom_id) || 0, row.student_number || 0))
  const payload: (ImportStudentRow & { classroom_id: string; student_number: number })[] = []
  let duplicate = 0, inserted = 0, failed = 0
  let firstError: string | null = null
  let error: string | null = null
  const touchedClassroomIds = new Set<string>()
  for (const row of candidates) {
    const nationalId = normalizeImportNationalId(row.national_id)
    const studentCode = String(row.student_code ?? '').trim() || null
    if ((nationalId && nationalIds.has(nationalId)) || (studentCode && codes.has(studentCode))) { duplicate++; continue }
    if (nationalId) nationalIds.add(nationalId)
    if (studentCode) codes.add(studentCode)
    const prefix = String(row.prefix || '').trim() || 'เด็กชาย'
    const rawGender = String(row.gender || '').trim()
    const gender = rawGender === 'F' || rawGender === 'ญ' || rawGender.includes('หญิง') || rawGender.toLowerCase() === 'f'
      ? 'F' : rawGender === 'M' || rawGender === 'ช' || rawGender.includes('ชาย') || rawGender.toLowerCase() === 'm'
        ? 'M' : ['เด็กหญิง', 'นางสาว', 'นาง'].includes(prefix) ? 'F' : 'M'
    const studentNumber = (numbers.get(row.classroom_id) || 0) + 1
    numbers.set(row.classroom_id, studentNumber)
    payload.push({
      student_code: studentCode, national_id: nationalId, prefix,
      first_name: String(row.first_name || '').trim() || '-', last_name: String(row.last_name || '').trim() || '-',
      gender, birth_date: row.birth_date || null, address: row.address ?? null, status: row.status || 'เรียน',
      classroom_id: row.classroom_id, student_number: studentNumber,
    })
  }
  async function write(batch: typeof payload): Promise<void> {
    if (!batch.length || error) return
    const result = await db.from('students').insert(batch)
    if (!result.error) {
      inserted += batch.length
      batch.forEach(row => touchedClassroomIds.add(row.classroom_id))
      return
    }
    // A rejected statement is atomic. Isolate invalid rows without slowing down valid batches.
    // Do not retry connection errors: a response could have been lost after the commit.
    const rowError = /^(22|23)/.test(result.error.code || '')
    if (rowError && batch.length > 1) {
      const mid = Math.floor(batch.length / 2)
      await write(batch.slice(0, mid)); await write(batch.slice(mid))
    } else if (rowError) {
      failed++
      firstError ||= result.error.message
    } else {
      error = `นำเข้าหยุดระหว่างบันทึก: ${result.error.message}`
      firstError ||= result.error.message
    }
  }
  for (let i = 0; i < payload.length && !error; i += 200) await write(payload.slice(i, i + 200))
  return { error, inserted, duplicate, failed, firstError, touchedClassroomIds }
}
