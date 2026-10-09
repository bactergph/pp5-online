export type SchoolEducationType = 'primary' | 'secondary'

export const SCHOOL_LEVEL_GROUPS = {
  primary: [
    { title: 'อนุบาล', levels: ['อ.2', 'อ.3'] },
    { title: 'ประถมศึกษา', levels: ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'] },
    { title: 'มัธยมศึกษาตอนต้น', levels: ['ม.1', 'ม.2', 'ม.3'] },
  ],
  secondary: [
    { title: 'มัธยมศึกษาตอนต้น', levels: ['ม.1', 'ม.2', 'ม.3'] },
    { title: 'มัธยมศึกษาตอนปลาย', levels: ['ม.4', 'ม.5', 'ม.6'] },
  ],
}

export function schoolLevels(type: SchoolEducationType): string[] {
  return SCHOOL_LEVEL_GROUPS[type].flatMap(group => group.levels)
}

export function resolveSchoolEducationType(value: unknown, levels: string[] = []): SchoolEducationType {
  if (value === 'primary' || value === 'secondary') return value
  return levels.some(level => ['ม.4', 'ม.5', 'ม.6'].includes(level)) ? 'secondary' : 'primary'
}
