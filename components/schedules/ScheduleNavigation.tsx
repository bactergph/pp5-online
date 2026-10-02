'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  ['/schedules/class/manage','จัดตารางเรียน','กำหนดวิชาและจัดทั้งโรงเรียน'],
  ['/schedules/substitute','จัดครูสอนแทน','เลือกครูว่างและออกเอกสาร'],
  ['/schedules/teaching','ตารางครู','ตรวจคาบสอนรายคน'],
  ['/schedules/conflicts','ตรวจคาบชน','ตรวจความพร้อมก่อนใช้ตาราง'],
  ['/schedules/period-times','เวลาคาบเรียน','ตั้งเวลาเรียนและพัก'],
  ['/schedules/workload','ภาระงานครู','สรุปจำนวนคาบสอน'],
]
export default function ScheduleNavigation({ canEdit }: { canEdit: boolean }) {
  const path = usePathname()
  if (/\/schedules\/class(?:\/manage)?$/.test(path?.replace(/\/$/, '') || '')) return null
  return <nav className="schedule-navigation" aria-label="เมนูตารางเรียน">
    <style>{`.schedule-navigation{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:22px}.schedule-navigation a{padding:13px 16px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;text-decoration:none;color:#334155;transition:background .15s}.schedule-navigation a:hover{background:#f1f5f9}.schedule-navigation a[aria-current=page]{background:#eef6ff;border-color:#93c5fd;color:#1e40af}.schedule-navigation strong{display:block;font-size:14px}.schedule-navigation span{display:block;font-size:12px;color:#64748b;margin-top:3px}@media(max-width:700px){.schedule-navigation{grid-template-columns:repeat(2,minmax(0,1fr))}.schedule-navigation a{padding:10px}.schedule-navigation span{font-size:11px}}`}</style>
    {items.filter(([href]) => canEdit || !['/schedules/substitute','/schedules/period-times'].includes(href)).map(([url,label,description])=>{
      const href = !canEdit && url.endsWith('/manage') ? '/schedules/class' : url
      return <Link key={href} href={href} aria-current={path===href?'page':undefined}><strong>{!canEdit && url.endsWith('/manage') ? 'ตารางเรียน' : label}</strong><span>{description}</span></Link>
    })}
  </nav>
}
