import { PageHeader } from '@/components/dashboard/page-header'
import { PageShell } from '@/components/dashboard/page-shell'
import { TemplateLibrary } from '@/components/documents/matriz/template-library'

export default async function PlantillasPage() {
  return (
    <PageShell>
      <PageHeader
        title="Plantillas de escritura"
        description="Administra versiones de cláusulas para la matriz de compraventa."
      />
      <TemplateLibrary />
    </PageShell>
  )
}
