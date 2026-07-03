'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

type Props = {
  children: React.ReactNode
  title: string
  userRole: string
  navRole: string
  userFullName: string
  isHomeroom: boolean
  schoolCode: string | null
  isActingDirector?: boolean
}

function LayoutClientInner({
  children,
  title,
  userRole,
  navRole,
  userFullName,
  isHomeroom,
  schoolCode,
  isActingDirector = false,
}: Props) {
  const searchParams = useSearchParams()
  const chromeless = searchParams.get('embed') === '1' || searchParams.get('print') === '1'
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (chromeless || !sidebarOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [chromeless, sidebarOpen])

  if (chromeless) {
    return (
      <div className="app-shell app-shell--chromeless">
        <main className="main-content main-content--chromeless">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userRole={userRole}
        navRole={navRole}
        userName={userFullName}
        isHomeroom={isHomeroom}
        isActingDirector={isActingDirector}
        schoolCode={schoolCode}
      />

      {sidebarOpen && (
        <div
          className="sidebar-overlay lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Navbar
        title={title}
        userRole={userRole}
        userFullName={userFullName}
        schoolCode={schoolCode}
        onMenuClick={() => setSidebarOpen(true)}
      />

      <main className="main-content">
        <div className="content-shell">
          {children}
        </div>
      </main>
    </div>
  )
}

export default function LayoutClient(props: Props) {
  return (
    <Suspense fallback={<div className="app-shell"><main className="main-content">{props.children}</main></div>}>
      <LayoutClientInner {...props} />
    </Suspense>
  )
}
