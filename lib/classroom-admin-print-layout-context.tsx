'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  DEFAULT_CLASSROOM_ADMIN_PRINT_LAYOUTS,
  type ClassroomAdminPrintLayouts,
  type ClassroomAdminPrintSection,
} from '@/lib/classroom-admin-print-layout'

const ClassroomAdminPrintLayoutsContext = createContext<ClassroomAdminPrintLayouts>(DEFAULT_CLASSROOM_ADMIN_PRINT_LAYOUTS)

export function ClassroomAdminPrintLayoutsProvider({
  layouts,
  children,
}: {
  layouts: ClassroomAdminPrintLayouts
  children: ReactNode
}) {
  return (
    <ClassroomAdminPrintLayoutsContext.Provider value={layouts}>
      {children}
    </ClassroomAdminPrintLayoutsContext.Provider>
  )
}

export function useClassroomAdminPrintLayouts() {
  return useContext(ClassroomAdminPrintLayoutsContext)
}

export function useClassroomAdminSectionLayout(section: ClassroomAdminPrintSection) {
  return useContext(ClassroomAdminPrintLayoutsContext)[section]
}
