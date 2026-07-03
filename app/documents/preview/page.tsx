import { Suspense } from 'react'
import DocumentPreviewShell from '@/components/documents/DocumentPreviewShell'

export default function DocumentPreviewPage() {
  return (
    <Suspense fallback={<div className="document-preview-shell"><div className="document-preview-shell__loading">กำลังโหลด...</div></div>}>
      <DocumentPreviewShell />
    </Suspense>
  )
}
