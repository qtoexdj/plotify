'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

interface BreadcrumbContextValue {
  label: string | null
  setLabel: (label: string | null) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = useState<string | null>(null)
  const value = useMemo(() => ({ label, setLabel }), [label])

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

function useBreadcrumbContext() {
  const context = useContext(BreadcrumbContext)
  if (!context) {
    throw new Error('useBreadcrumbContext debe usarse dentro de un BreadcrumbProvider')
  }
  return context
}

export function useBreadcrumbLabel() {
  return useBreadcrumbContext().label
}

/** Registra el nombre de la entidad actual (ej. nombre del proyecto) como último nivel del breadcrumb del header. */
export function useSetBreadcrumbLabel(label: string | null | undefined) {
  const setLabel = useContext(BreadcrumbContext)?.setLabel

  useEffect(() => {
    if (!setLabel) return

    setLabel(label ?? null)
    return () => setLabel(null)
  }, [label, setLabel])
}
