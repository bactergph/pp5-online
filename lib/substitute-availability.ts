export function availableSubstitutes<T extends { id: string }>(teachers: T[], busy: {teacherId: string; period: number}[], entries: {id: string; absent_teacher_id: string; substitute_teacher_id: string | null; period: number}[], entry: {id: string; period: number}) {
  const absent = new Set(entries.map(e => e.absent_teacher_id))
  return teachers.filter(t => !absent.has(t.id)
    && !busy.some(b => b.teacherId === t.id && b.period === entry.period)
    && !entries.some(e => e.id !== entry.id && e.period === entry.period && e.substitute_teacher_id === t.id))
}
