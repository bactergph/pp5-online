import { requireShellRoles } from '@/lib/shell-guard'

export default async function DistrictLayout({ children }: { children: React.ReactNode }) {
  await requireShellRoles(['district'])
  return children
}
