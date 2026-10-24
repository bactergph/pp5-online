import { deviceSchoolYear, switchDeviceYear, type LocalScheduleBundle } from './schedule-device-years'

export type DeviceSchoolBasics = { schoolName: string; directorName: string; academicHeadName: string; academicYear: string; logoDataUrl: string }
export const MAX_DEVICE_LOGO_LENGTH = 800000
export function validDeviceLogo(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || (value.length <= MAX_DEVICE_LOGO_LENGTH && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)))
}
export function emptyDeviceSchoolBasics(): DeviceSchoolBasics {
  return { schoolName: '', directorName: '', academicHeadName: '', academicYear: deviceSchoolYear(), logoDataUrl: '' }
}
export function validateDeviceSchoolBasics(input: DeviceSchoolBasics): DeviceSchoolBasics {
  const result = { ...input, schoolName: input.schoolName.trim(), directorName: input.directorName.trim(), academicHeadName: input.academicHeadName.trim(), academicYear: input.academicYear.trim() }
  if (!result.schoolName || result.schoolName.length > 200) throw Error('ระบุชื่อโรงเรียนไม่เกิน 200 ตัวอักษร')
  if (result.directorName.length > 200 || result.academicHeadName.length > 200) throw Error('ชื่อบุคลากรต้องไม่เกิน 200 ตัวอักษร')
  if (!/^2\d{3}$/.test(result.academicYear)) throw Error('ระบุปีการศึกษา พ.ศ. 4 หลัก เช่น 2569')
  if (!validDeviceLogo(result.logoDataUrl)) throw Error('ตราโรงเรียนไม่ถูกต้อง กรุณาเลือกรูปใหม่')
  return result
}
/** Switching year archives its timetable; editing school details never clears it. */
export function applyDeviceSchoolBasics(bundle: LocalScheduleBundle, input: DeviceSchoolBasics): LocalScheduleBundle {
  const basics = validateDeviceSchoolBasics(input)
  const next = switchDeviceYear(bundle, basics.academicYear)
  const terms = { ...next.terms }
  for (const term of [1, 2] as const) terms[term] = { ...terms[term], document: { printDate: '', ...terms[term].document, ...basics } }
  return { ...next, terms }
}
