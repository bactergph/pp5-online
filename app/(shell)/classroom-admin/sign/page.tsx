import { Suspense } from 'react'
import ClassroomAdminSignHub from '@/components/documents/ClassroomAdminSignHub'

export default function ClassroomAdminSignPage() {
  return (
    <Suspense fallback={<div className="page-stack"><p style={{ padding: 24 }}>กำลังโหลด...</p></div>}>
      <ClassroomAdminSignHub />
    </Suspense>
  )
}
