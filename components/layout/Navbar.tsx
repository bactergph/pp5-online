'use client'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { logout } from '@/lib/actions/auth'

type Props = {
  title: string
  userFullName: string
  userRole: string
  schoolCode?: string | null
  onMenuClick: () => void
}

function LogoutButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="navbar-logout" disabled={pending} aria-busy={pending}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9"/>
      </svg>
      {pending ? 'กำลังออก...' : 'ออกจากระบบ'}
    </button>
  )
}

export default function Navbar({ title, userFullName, userRole, schoolCode, onMenuClick }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const profileHref = schoolCode && userRole !== 'district'
    ? `/school/${schoolCode}/settings/profile`
    : '/settings/profile'

  return (
    <header className="navbar">
      <div className="navbar-title-group">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="navbar-menu-button lg:hidden"
          aria-label="เปิดเมนู"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>

        <h1 className="navbar-title">{title}</h1>
      </div>

      {/* User */}
      <div className="navbar-user">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`navbar-user-button ${menuOpen ? 'is-open' : ''}`}
          aria-expanded={menuOpen}
        >
          <div className="navbar-avatar">
            {userFullName.charAt(0)}
          </div>
          <div className="navbar-user-copy hidden sm:block">
            <div className="navbar-user-name">{userFullName}</div>
            <div className="navbar-user-role">{getRoleLabel(userRole)}</div>
          </div>
          <svg className="navbar-user-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="navbar-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="navbar-dropdown">
              <div className="navbar-dropdown-head">
                <div className="navbar-dropdown-profile">
                  <div className="navbar-avatar navbar-avatar-lg">
                    {userFullName.charAt(0)}
                  </div>
                  <div>
                    <div className="navbar-user-name">{userFullName}</div>
                    <div className="navbar-user-role">{getRoleLabel(userRole)}</div>
                  </div>
                </div>
              </div>
              <div className="navbar-dropdown-body">
                <Link
                  href={profileHref}
                  className="navbar-dropdown-link"
                  onClick={() => setMenuOpen(false)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  ตั้งค่าข้อมูลตัวเอง
                </Link>
                <form action={logout}>
                  <LogoutButton />
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    district: 'Super Admin', admin: 'ผู้ดูแลโรงเรียน',
    principal: 'ผู้อำนวยการ', deputy_principal: 'รองผู้อำนวยการ', academic_head: 'หัวหน้าวิชาการ', teacher: 'ครูผู้สอน',
  }
  return map[role] || role
}
