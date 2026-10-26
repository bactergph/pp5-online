'use client'
import { useState, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { logout } from '@/lib/actions/auth'
import { withSchoolPrefix } from '@/lib/school-path'

type Props = {
  title: string
  section?:string
  userFullName: string
  userRole: string
  schoolName?: string | null
  sidebarOpen?: boolean
  schoolCode?: string | null
  onMenuClick: () => void
  onMembershipUpgrade?: () => void
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

export default function Navbar({ title, section, userFullName, userRole, schoolCode, schoolName, sidebarOpen, onMenuClick, onMembershipUpgrade }: Props) {
  const userButton = useRef<HTMLButtonElement>(null)
  const userMenu=useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const profileHref = schoolCode && userRole !== 'district'
    ? withSchoolPrefix(schoolCode, '/settings/profile')
    : '/settings/profile'

  return (
    <header className="navbar" onKeyDown={e => { if (e.key === 'Escape'&&menuOpen) { e.stopPropagation();setMenuOpen(false); userButton.current?.focus() } }}>
      <div className="navbar-title-group">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="navbar-menu-button lg:hidden"
          aria-label="เปิดเมนู"
          aria-expanded={sidebarOpen}
          aria-controls="workspace-navigation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>

        <div className="navbar-context"><div className="navbar-context-meta">{schoolName && <span className="navbar-school" title={schoolName}>{schoolName}</span>}{section&&section!==title&&<span className="navbar-section">{section}</span>}</div><div className="navbar-title" title={title}>{title}</div></div>
      </div>

      {/* User */}
      <div ref={userMenu} className="navbar-user" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setMenuOpen(false)}}>
        {onMembershipUpgrade&&<button type="button" className="navbar-package-button" aria-haspopup="dialog" onClick={onMembershipUpgrade}>แพ็กเกจ</button>}
        <button
          ref={userButton}
          onClick={() => setMenuOpen(!menuOpen)}
          onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setMenuOpen(true);requestAnimationFrame(()=>{const items=userMenu.current?.querySelectorAll<HTMLElement>('.navbar-dropdown a,.navbar-dropdown button');(event.key==='ArrowUp'?items?.[items.length-1]:items?.[0])?.focus()})}}}
          aria-label={'เมนูผู้ใช้ '+userFullName}
          aria-haspopup="true"
          aria-controls={menuOpen?'workspace-user-menu':undefined}
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
            <div id="workspace-user-menu" className="navbar-dropdown" aria-label="เมนูผู้ใช้">
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
