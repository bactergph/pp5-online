import 'server-only'

/** รายชื่อนักเรียนต่อห้อง — แคชสั้นใน process (warm instance) */
export type ClassroomStudentRow = {
  id: string
  student_number: number
  prefix: string | null
  first_name: string
  last_name: string
  gender: string | null
  birth_date?: string | null
  status: string | null
}

const TTL_MS = 60_000
const store = new Map<string, { expiresAt: number; rows: ClassroomStudentRow[] }>()

export function invalidateClassroomStudents(classroomId: string | null | undefined) {
  if (!classroomId) return
  store.delete(classroomId)
}

export function invalidateClassroomStudentsMany(classroomIds: Iterable<string | null | undefined>) {
  for (const id of classroomIds) invalidateClassroomStudents(id)
}

export async function getClassroomStudentsCached(
  classroomId: string,
  loader: () => Promise<ClassroomStudentRow[]>,
): Promise<ClassroomStudentRow[]> {
  const hit = store.get(classroomId)
  if (hit && hit.expiresAt > Date.now()) return hit.rows.map(row => ({ ...row }))
  const rows = await loader()
  store.set(classroomId, { expiresAt: Date.now() + TTL_MS, rows })
  return rows.map(row => ({ ...row }))
}
