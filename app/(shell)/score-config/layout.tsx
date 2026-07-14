import { requireShellRoles } from '@/lib/shell-guard'

export default async function ScoreConfigLayout({ children }: { children: React.ReactNode }) {
  await requireShellRoles(['admin', 'district', 'academic_head', 'deputy_principal', 'teacher'])
  return children
}
