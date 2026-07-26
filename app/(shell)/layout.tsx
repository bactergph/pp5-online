import AppLayout from '@/components/layout/AppLayout'

/** ให้ server action สร้าง PDF หลังอนุมัติรันจบได้ (Puppeteer + Drive) */
export const maxDuration = 300

/**
 * Shared authenticated shell — keeps Sidebar/Navbar mounted across section navigations
 * (dashboard ↔ scores ↔ settings …) without remounting AppLayout each time.
 * Route group `(shell)` does not change URLs.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>
}
