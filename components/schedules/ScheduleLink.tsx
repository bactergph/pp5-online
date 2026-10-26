'use client'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentProps } from 'react'
import { useScheduleServices } from './ScheduleServices'
import { deviceScheduleHref, type DeviceScheduleView } from '@/lib/schedule-device-navigation'

const destinations: Record<string, DeviceScheduleView> = {
  '/schedules/class': 'class', '/schedules/class/manage': 'manage', '/schedules/teaching': 'teaching',
  '/schedules/teaching/manage': 'manage', '/schedules/substitute': 'substitute',
  '/schedules/period-times': 'period-times', '/schedules/conflicts': 'conflicts',
  '/schedules/workload': 'workload', '/export/schedules': 'print',
  '/settings/users': 'manage', '/settings/class-subjects': 'manage',
}
/** Keep links inside the selected database, including links in empty states and PDF tools. */
export default function ScheduleLink(props: ComponentProps<typeof NextLink>) {
  const { local } = useScheduleServices(), pathname = usePathname()
  if (!local || typeof props.href !== 'string') return <NextLink {...props}/>
  const [path, query] = props.href.split('?'), view = destinations[path]
  if (!view) return <NextLink {...props}/>
  const step = path === '/settings/users' ? 3 : path === '/settings/class-subjects' ? 5 : null
  const href = deviceScheduleHref(pathname, view) + (step ? `?step=${step}` : query ? `?${query}` : '')
  return <NextLink {...props} href={href} onClick={event => {
    props.onClick?.(event)
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault(); window.history.pushState(null, '', href)
    window.dispatchEvent(new Event('device-schedule-navigate'))
  }}/>
}
