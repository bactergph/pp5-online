import {notFound} from 'next/navigation'
import {DEVICE_SCHEDULE_VIEWS} from '@/lib/schedule-device-navigation'
export default async function Page({params}:{params:Promise<{view:string}>}) {
  const {view}=await params
  if(!DEVICE_SCHEDULE_VIEWS.some(item=>item===view))notFound()
  return null
}
