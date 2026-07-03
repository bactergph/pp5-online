import { Suspense } from 'react'
import DocumentsSignHub from '@/components/documents/DocumentsSignHub'

export default function DocumentsSignPage() {
  return (
    <Suspense fallback={<div className="page-stack"><p style={{ padding: 24 }}>กำลังโหลด...</p></div>}>
      <DocumentsSignHub />
    </Suspense>
  )
}
