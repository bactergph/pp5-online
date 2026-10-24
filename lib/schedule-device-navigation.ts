export const DEVICE_SCHEDULE_VIEWS = ['class','teaching','manage','period-times','substitute','conflicts','print','workload'] as const
export type DeviceScheduleView = typeof DEVICE_SCHEDULE_VIEWS[number]
export function deviceScheduleView(path: string): DeviceScheduleView {
  const tail = path.split('/schedules/device')[1]?.replace(/^\/+|\/+$/g,'') || 'class'
  return DEVICE_SCHEDULE_VIEWS.includes(tail as DeviceScheduleView) ? tail as DeviceScheduleView : 'class'
}
export function deviceScheduleHref(path: string, view: DeviceScheduleView) {
  const index = path.indexOf('/schedules/device')
  return `${index < 0 ? '' : path.slice(0,index)}/schedules/device/${view}`
}
