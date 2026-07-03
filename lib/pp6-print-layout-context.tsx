'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  DEFAULT_PP6_PRINT_LAYOUTS,
  type Pp6PrintLayouts,
  type Pp6SectionLayout,
} from '@/lib/pp6-print-layout'

const Pp6PrintLayoutsContext = createContext<Pp6PrintLayouts>(DEFAULT_PP6_PRINT_LAYOUTS)

export function Pp6PrintLayoutsProvider({
  layouts,
  children,
}: {
  layouts: Pp6PrintLayouts
  children: ReactNode
}) {
  return (
    <Pp6PrintLayoutsContext.Provider value={layouts}>
      {children}
    </Pp6PrintLayoutsContext.Provider>
  )
}

export function usePp6PrintLayouts() {
  return useContext(Pp6PrintLayoutsContext)
}

export function usePp6SectionLayout(): Pp6SectionLayout {
  return useContext(Pp6PrintLayoutsContext).page
}
