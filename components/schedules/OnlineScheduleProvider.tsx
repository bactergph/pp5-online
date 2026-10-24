'use client'
import type { ReactNode } from 'react'
import * as actions from '@/app/schedules/actions'
import * as planning from '@/app/schedules/planning-actions'
import { ScheduleServicesProvider } from './ScheduleServices'
const operations = { ...actions, ...planning }
export default function OnlineScheduleProvider({children}:{children:ReactNode}) {
  return <ScheduleServicesProvider operations={operations}>{children}</ScheduleServicesProvider>
}
