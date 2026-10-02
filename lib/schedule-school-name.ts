export function scheduleSchoolName(name: string | null | undefined) {
  const value = name?.trim() || ''
  return value.startsWith('โรงเรียน') ? value : 'โรงเรียน' + value
}
