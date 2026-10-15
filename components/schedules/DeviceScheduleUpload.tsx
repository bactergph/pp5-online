'use client'

import { useEffect, useState } from 'react'
import { uploadDeviceSchedule } from '@/app/(shell)/schedules/device-upload-actions'
import { readFreePlanRecord, markFreePlanUploaded } from '@/lib/schedule-device-cache'
import { cleanDeviceSchedule, deviceScheduleHasContent, deviceScheduleHash } from '@/lib/device-schedule-payload'

export default function DeviceScheduleUpload() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    readFreePlanRecord<Record<string, unknown>>().then(async row => {
      const plan = cleanDeviceSchedule(row?.data)
      if (!deviceScheduleHasContent(plan)) return
      const hash = deviceScheduleHash(plan)
      if (row?.uploadedHash === hash) {
        if (active) setMessage('ข้อมูลจากเครื่องนี้ขึ้นระบบแล้ว')
        return
      }
      if (active) setMessage('กำลังส่งข้อมูลจากเครื่องนี้ขึ้นระบบ...')
      const result = await uploadDeviceSchedule(plan)
      if (!active) return
      if (result.error) {
        setError(true)
        setMessage(result.error)
        return
      }
      if (result.stored && result.hash) await markFreePlanUploaded(result.hash)
      setError(false)
      setMessage(result.message || 'ส่งข้อมูลจากเครื่องนี้ขึ้นระบบแล้ว')
    })
    return () => { active = false }
  }, [])

  if (!message) return null
  return <p role="status" style={{ margin: 0, fontWeight: 700, color: error ? '#be123c' : '#52647c' }}>{message}</p>
}
