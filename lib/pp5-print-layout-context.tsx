'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  DEFAULT_PP5_PRINT_LAYOUTS,
  isPp5CoverSection,
  type Pp5BodySection,
  type Pp5CoverLayout,
  type Pp5CoverSection,
  type Pp5PrintLayouts,
  type Pp5PrintSection,
  type Pp5SectionLayout,
} from '@/lib/pp5-print-layout'

const Pp5PrintLayoutsContext = createContext<Pp5PrintLayouts>(DEFAULT_PP5_PRINT_LAYOUTS)

export function Pp5PrintLayoutsProvider({
  layouts,
  children,
}: {
  layouts: Pp5PrintLayouts
  children: ReactNode
}) {
  return (
    <Pp5PrintLayoutsContext.Provider value={layouts}>
      {children}
    </Pp5PrintLayoutsContext.Provider>
  )
}

export function usePp5PrintLayouts() {
  return useContext(Pp5PrintLayoutsContext)
}

export function usePp5CoverLayout(section: Pp5CoverSection): Pp5CoverLayout {
  return useContext(Pp5PrintLayoutsContext)[section]
}

export function usePp5SectionLayout(section: Pp5BodySection): Pp5SectionLayout {
  return useContext(Pp5PrintLayoutsContext)[section]
}

export function usePp5Layout(section: Pp5PrintSection): Pp5CoverLayout | Pp5SectionLayout {
  return useContext(Pp5PrintLayoutsContext)[section]
}

export function usePp5PageLayout(section: Pp5PrintSection) {
  const layouts = usePp5PrintLayouts()
  return layouts[section]
}

export { isPp5CoverSection }
