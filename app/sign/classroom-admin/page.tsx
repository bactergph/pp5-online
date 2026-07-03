import SignClassDocClient from '@/components/sign/SignClassDocClient'

export default function Page() {
  return (
    <SignClassDocClient
      docType="classroom_admin"
      title="ธุรการชั้นเรียน"
      subtitle="ครูประจำชั้นส่งขอลงนามงานธุรการ → ผู้บริหารลงนาม"
      flowHint="ลำดับ: ครูประจำชั้น → ผอ./รักษาการ"
    />
  )
}
