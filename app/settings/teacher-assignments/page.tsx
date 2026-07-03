'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export default function TeacherAssignmentsRedirect() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    router.replace(pathname.replace('/settings/teacher-assignments', '/settings/class-subjects'))
  }, [pathname, router])

  return <div className="text-center py-10 text-gray-500">กำลังเปิดหน้ากำหนดครูผู้สอน...</div>
}
