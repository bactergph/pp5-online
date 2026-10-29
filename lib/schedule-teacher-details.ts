export type TeacherProfile = { prefix: string; name: string; position: string }
export type TeacherDetailsInput = TeacherProfile & { expected: TeacherProfile }

/** Compare profile fields, not a timetable hash: renaming never changes identity. */
export function prepareTeacherDetails(current: TeacherProfile, input: TeacherDetailsInput): TeacherProfile {
  const valid = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
  if (!input || !valid(input.prefix, 30) || !valid(input.name, 200) || !input.name.trim() || !valid(input.position, 100) ||
      !input.expected || !valid(input.expected.prefix, 30) || !valid(input.expected.name, 200) || !valid(input.expected.position, 100)) throw Error('กรอกชื่อ-นามสกุล คำนำหน้า และตำแหน่งให้ถูกต้อง')
  if (current.prefix !== input.expected.prefix || current.name !== input.expected.name || current.position !== input.expected.position) throw Error('ชื่อครูเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
  return { prefix: input.prefix.trim(), name: input.name.trim(), position: input.position.trim() }
}
