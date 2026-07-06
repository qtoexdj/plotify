'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { useBreadcrumbLabel } from './breadcrumb-context'

const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Panel',
  projects: 'Proyectos',
  documentos: 'Escrituras',
  clients: 'Leads',
  vendors: 'Vendedores',
  agente: 'Agente',
  settings: 'Configuración',
}

export function HeaderBreadcrumb() {
  const pathname = usePathname()
  const entityLabel = useBreadcrumbLabel()
  const [section, ...rest] = pathname.split('/').filter(Boolean)
  const sectionLabel = SECTION_LABELS[section]
  const hasDetail = rest.length > 0 && Boolean(entityLabel)

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/dashboard">Plotify</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {sectionLabel ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {hasDetail ? (
                <BreadcrumbLink asChild>
                  <Link href={`/${section}`}>{sectionLabel}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{sectionLabel}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        ) : null}
        {hasDetail ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{entityLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
