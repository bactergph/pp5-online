/** กลุ่มสาระ 8 กลุ่ม — ต้องตรงกับ subjects_group_check ใน 001_initial_schema.sql */
export const SUBJECT_GROUPS = [
  'ภาษาไทย',
  'คณิตศาสตร์',
  'วิทยาศาสตร์และเทคโนโลยี',
  'สังคมศึกษา ศาสนา และวัฒนธรรม',
  'สุขศึกษาและพลศึกษา',
  'ศิลปะ',
  'การงานอาชีพ',
  'ภาษาต่างประเทศ',
] as const

export type SubjectGroup = (typeof SUBJECT_GROUPS)[number]

/** ข้อความตำแหน่งลงนามหัวหน้ากลุ่มสาระบนปพ.5 รายวิชา */
export function subjectGroupHeadPositionLine(subjectGroup: string | null | undefined) {
  const group = subjectGroup?.trim()
  if (!group) return 'หัวหน้ากลุ่มสาระการเรียนรู้'
  return `หัวหน้ากลุ่มสาระการเรียนรู้${group}`
}
