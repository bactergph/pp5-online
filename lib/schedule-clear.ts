import type { Preparation } from './schedule-preparation'

export type ScheduleClearOptions = { kind?: 'subjects' | 'activities'; includeLocked?: boolean; expectedHash?: string }
export type ScheduleClearScope = 'room' | 'level' | 'school' | 'selected'
type ClearData = Pick<Preparation, 'classrooms' | 'lessons' | 'slots' | 'plan'>
const position = (room: string, day: number, period: number) => `${room}:${day}:${period}`

export function scheduleClearRooms(data: ClearData, scope: ScheduleClearScope, roomId: string, selected?: string[]) {
  const room = data.classrooms.find(item => item.id === roomId)
  if (!room || !['room', 'level', 'school', 'selected'].includes(scope)) throw Error('เลือกห้องและขอบเขตการล้างตารางให้ถูกต้อง')
  if (scope === 'selected' && (!selected?.length || selected.some(id => !data.classrooms.some(item => item.id === id)))) throw Error('เลือกห้องเรียนก่อนล้างตาราง')
  return data.classrooms.filter(item => scope === 'selected' ? selected!.includes(item.id) : scope === 'school' || (scope === 'level' ? item.level === room.level : item.id === roomId)).map(item => item.id)
}

/** Deletion only. Shared events are removed together, and explicit shared locks
 * are released only after opt-in. Catalogs, quotas and teacher absences survive. */
export function planScheduleClear(data: ClearData, roomIds: string[], options: ScheduleClearOptions = {}) {
  if (options.kind !== undefined && !['subjects', 'activities'].includes(options.kind) || options.includeLocked !== undefined && typeof options.includeLocked !== 'boolean') throw Error('ตัวเลือกการล้างตารางไม่ถูกต้อง')
  const activities = options.kind === 'activities', selected = new Set(roomIds), byId = new Map(data.lessons.map(lesson => [lesson.id, lesson]))
  const groups = activities ? data.plan.activityGroups || [] : []
  const affectedGroups = groups.filter(group => group.roomIds.some(id => selected.has(id)))
  const positions = new Set<string>(), virtualPositions = new Set<string>(), protectedPositions = new Set<string>()
  for (const row of data.slots) {
    const lesson = byId.get(row.activity_id ? `activity:${row.activity_id}` : row.class_subject_id || '')
    const matchingGroup = activities && affectedGroups.some(group => group.roomIds.includes(row.classroom_id) && group.settingId === lesson?.subjectId)
    if ((selected.has(row.classroom_id) || matchingGroup) && (activities ? !!row.activity_id : !!row.class_subject_id && !row.activity_id)) positions.add(position(row.classroom_id, row.day_of_week, row.period))
  }
  // Fixed activity times can be displayed before any timetable rows exist.
  for (const group of affectedGroups) for (const room of group.roomIds) for (const cell of group.cells) {const key=position(room, cell.day, cell.period);positions.add(key);virtualPositions.add(key)}
  const subjectGroups = activities ? [] : (data.plan.teachingGroups || []).filter(group => group.lessonIds.some(id => selected.has(byId.get(id)?.classroomId || '')))
  // A legacy import may contain the shared definition but only one member's
  // timetable row. Clearing must also repair that state, without moving others.
  for (const group of subjectGroups) {
    for (const row of data.slots) if (group.lessonIds.includes(row.class_subject_id || '') && (!group.cells || group.cells.some(cell => cell.day === row.day_of_week && cell.period === row.period))) positions.add(position(row.classroom_id,row.day_of_week,row.period))
    if (options.includeLocked) for (const id of group.lessonIds) for (const cell of group.cells || []) {const room=byId.get(id)?.classroomId;if(room){const key=position(room,cell.day,cell.period);positions.add(key);virtualPositions.add(key)}}
  }
  const shared = activities ? affectedGroups.map(group => ({rooms:group.roomIds, cells:group.cells, lessons: data.lessons.filter(lesson => lesson.activity && lesson.subjectId === group.settingId && group.roomIds.includes(lesson.classroomId)).map(lesson => lesson.id)})) : (data.plan.teachingGroups || []).map(group => ({rooms:group.lessonIds.map(id => byId.get(id)?.classroomId).filter((id): id is string => !!id), cells:group.cells, lessons:group.lessonIds}))
  // Propagate each removed shared event to every member; never clear unrelated
  // subjects in the other classrooms. A locked member protects the whole event.
  for (const group of shared) {
    const events = new Map<string, {day:number;period:number}>()
    for (const row of data.slots) if (group.lessons.includes(row.activity_id ? `activity:${row.activity_id}` : row.class_subject_id || '') && positions.has(position(row.classroom_id,row.day_of_week,row.period)) && (activities || !group.cells || group.cells.some(cell => cell.day === row.day_of_week && cell.period === row.period))) events.set(`${row.day_of_week}:${row.period}`,{day:row.day_of_week,period:row.period})
    if (activities) for (const cell of group.cells || []) events.set(`${cell.day}:${cell.period}`,cell)
    for (const cell of events.values()) for (const room of group.rooms) positions.add(position(room,cell.day,cell.period))
    if (!options.includeLocked) for (const cell of events.values()) if (data.slots.some(row => row.locked && group.rooms.includes(row.classroom_id) && row.day_of_week === cell.day && row.period === cell.period)) for (const room of group.rooms) protectedPositions.add(position(room,cell.day,cell.period))
  }
  const locked = new Set(data.slots.filter(row => row.locked && positions.has(position(row.classroom_id,row.day_of_week,row.period))).map(row => position(row.classroom_id,row.day_of_week,row.period)))
  if (!options.includeLocked) for (const key of locked) protectedPositions.add(key)
  for (const key of protectedPositions) positions.delete(key)
  const removed = data.slots.filter(row => {
    if (!positions.has(position(row.classroom_id,row.day_of_week,row.period)) || !(activities ? !!row.activity_id : !!row.class_subject_id && !row.activity_id)) return false
    if (selected.has(row.classroom_id)) return true
    const lesson=byId.get(row.activity_id ? `activity:${row.activity_id}` : row.class_subject_id || '')
    return activities ? affectedGroups.some(group => group.settingId === lesson?.subjectId && group.roomIds.includes(row.classroom_id)) : subjectGroups.some(group => group.lessonIds.includes(row.class_subject_id || ''))
  })
  const removedSet = new Set(removed)
  const plan = {...data.plan}
  if (activities && data.plan.activityGroups) plan.activityGroups = data.plan.activityGroups.map(group => affectedGroups.includes(group) ? {...group,cells:group.cells.filter(cell => !group.roomIds.some(room => positions.has(position(room,cell.day,cell.period))))} : group)
  if (!activities && data.plan.teachingGroups) plan.teachingGroups = data.plan.teachingGroups.flatMap(group => {
    if (!group.cells) return [group]
    const cells = group.cells.filter(cell => !group.lessonIds.some(id => {const room=byId.get(id)?.classroomId;return room && positions.has(position(room,cell.day,cell.period))}))
    return cells.length ? [{...group,cells}] : []
  })
  const affectedRooms = [...new Set([...positions].map(key => key.slice(0,key.lastIndexOf(':',key.lastIndexOf(':')-1))))]
  const count=removed.length+[...virtualPositions].filter(key => positions.has(key) && !data.slots.some(row => position(row.classroom_id,row.day_of_week,row.period)===key)).length
  return {rows:data.slots.filter(row => !removedSet.has(row)),plan,positions:[...positions],removed:count,locked:locked.size,rooms:roomIds.length,affectedRooms,extraRooms:affectedRooms.filter(id => !selected.has(id))}
}
