import { verifySession } from '@/lib/dal'

export default async function DocumentPreviewLayout({ children }: { children: React.ReactNode }) {
  await verifySession()
  return <div className="document-preview-root">{children}</div>
}
