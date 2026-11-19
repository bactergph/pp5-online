export const CLASS_LEVELS = ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'] as const

export type HomeroomSeat = { teacherId: string; level: string; room: number }
export type HomeroomPlace = { level: string; room: number }

export function canonicalClassLevel(level: string | null | undefined): string | null {
  const text = String(level || '').trim().replace(/\s+/g, '')
  const kindergarten = text.match(/^(?:อนุบาล|อ\.?)([1-3])/)
  if (kindergarten) return `อ.${kindergarten[1]}`
  const primary = text.match(/^(?:ประถมศึกษาปีที่|ประถม|ป\.?)([1-6])/)
  if (primary) return `ป.${primary[1]}`
  const secondary = text.match(/^(?:มัธยมศึกษาปีที่|มัธยมศึกษา|มัธยม|ม\.?)([1-6])/)
  if (secondary) return `ม.${secondary[1]}`
  return null
}

export function classLevelRank(level: string | null | undefined): number {
  const canonical = canonicalClassLevel(level)
  const index = canonical ? CLASS_LEVELS.indexOf(canonical as typeof CLASS_LEVELS[number]) : -1
  return index < 0 ? 1000 : index
}

export function compareClassLevel(left: string | null | undefined, right: string | null | undefined) {
  return classLevelRank(left) - classLevelRank(right) || String(left || '').localeCompare(String(right || ''), 'th')
}

export function classBand(level: string | null | undefined): { id: string; label: string } | null {
  const canonical = canonicalClassLevel(level)
  if (!canonical) return null
  const rank = classLevelRank(canonical)
  if (rank <= 2) return { id: 'kindergarten', label: 'อนุบาล' }
  if (rank <= 5) return { id: 'primary-lower', label: 'ประถมศึกษาปีที่ 1-3' }
  if (rank <= 8) return { id: 'primary-upper', label: 'ประถมศึกษาปีที่ 4-6' }
  if (rank <= 11) return { id: 'secondary-lower', label: 'มัธยมศึกษาปีที่ 1-3' }
  return { id: 'secondary-upper', label: 'มัธยมศึกษาปีที่ 4-6' }
}

export function teacherListName(teacher: { prefix?: string | null; full_name?: string | null; name?: string | null }) {
  return (teacher.name || `${teacher.prefix || ''}${teacher.full_name || ''}`).replace(/\s+/g, ' ').trim()
}

export function earliestHomeroom(seats: HomeroomSeat[]): Map<string, HomeroomPlace> {
  const places = new Map<string, HomeroomPlace>()
  for (const seat of seats) {
    if (!seat.teacherId) continue
    const level = canonicalClassLevel(seat.level) || seat.level
    const current = places.get(seat.teacherId)
    const rank = classLevelRank(level)
    if (!current || rank < classLevelRank(current.level) || (rank === classLevelRank(current.level) && seat.room < current.room)) {
      places.set(seat.teacherId, { level, room: seat.room })
    }
  }
  return places
}

type OrderedTeacher = { id: string; role?: string | null; prefix?: string | null; full_name?: string | null; name?: string | null }

function roleRank(role: string | null | undefined, leadersFirst: boolean) {
  if (!leadersFirst) return 2
  if (role === 'principal') return 0
  if (role === 'deputy_principal') return 1
  return 2
}

export function compareTeachersByHomeroom<T extends OrderedTeacher>(places: Map<string, HomeroomPlace>, leadersFirst = false) {
  return (left: T, right: T) => {
    const roleDiff = roleRank(left.role, leadersFirst) - roleRank(right.role, leadersFirst)
    if (roleDiff) return roleDiff
    if (leadersFirst && roleRank(left.role, true) < 2) return teacherListName(left).localeCompare(teacherListName(right), 'th') || left.id.localeCompare(right.id)
    const leftPlace = places.get(left.id)
    const rightPlace = places.get(right.id)
    const levelDiff = classLevelRank(leftPlace?.level) - classLevelRank(rightPlace?.level)
    if (levelDiff) return levelDiff
    return teacherListName(left).localeCompare(teacherListName(right), 'th') || left.id.localeCompare(right.id)
  }
}

export function orderTeachers<T extends OrderedTeacher>(teachers: T[], seats: HomeroomSeat[], leadersFirst = false): (T & { homeroomLevel: string | null })[] {
  const places = earliestHomeroom(seats)
  return [...teachers].sort(compareTeachersByHomeroom(places, leadersFirst)).map(teacher => ({
    ...teacher,
    homeroomLevel: leadersFirst && roleRank(teacher.role, true) < 2 ? null : places.get(teacher.id)?.level || null,
  }))
}

export function homeroomClassLabels(seats: HomeroomSeat[]) {
  const labels = new Map<string, string[]>()
  const sorted = [...seats].sort((left, right) => compareClassLevel(left.level, right.level) || left.room - right.room)
  for (const seat of sorted) {
    if (!seat.teacherId) continue
    const label = `${canonicalClassLevel(seat.level) || seat.level}/${seat.room}`
    const current = labels.get(seat.teacherId) || []
    if (!current.includes(label)) current.push(label)
    labels.set(seat.teacherId, current)
  }
  return labels
}

export function homeroomSeatsFromClassrooms(rooms: { level: string; room: number; homeroom_teacher_id?: string | null; homeroom_teacher2_id?: string | null }[]): HomeroomSeat[] {
  return rooms.flatMap(room => [room.homeroom_teacher_id, room.homeroom_teacher2_id].filter((id): id is string => Boolean(id)).map(teacherId => ({
    teacherId, level: room.level, room: room.room,
  })))
}

export function teacherGroups<T extends { id: string; homeroomLevel?: string | null }>(teachers: T[]) {
  const groups: { key: string; label: string; teachers: T[] }[] = []
  for (const teacher of teachers) {
    const label = teacher.homeroomLevel ? homeroomGroupLabel(teacher.homeroomLevel) : 'ครูผู้สอน'
    const key = teacher.homeroomLevel || 'other'
    const current = groups[groups.length - 1]
    if (current?.key === key) current.teachers.push(teacher)
    else groups.push({ key, label, teachers: [teacher] })
  }
  return groups
}

export function homeroomGroupLabel(level: string) {
  return canonicalClassLevel(level) || level
}
