import ApprovedDocumentsClient from '@/components/approved-documents/ApprovedDocumentsClient'

export default function Page() {
  return (
    <ApprovedDocumentsClient
      docKind="classroom_admin"
      pageTitle="ธุรการชั้นเรียน"
      pageSubtitle="เอกสารที่อนุมัติแล้ว — ดูเฉพาะของคุณตามสิทธิ์"
    />
  )
}
