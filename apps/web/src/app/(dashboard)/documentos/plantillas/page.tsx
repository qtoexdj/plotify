import { PageHeader } from '@/components/dashboard/page-header'
import { PageShell } from '@/components/dashboard/page-shell'
import { EscrituraTabs } from '@/components/documents/escritura-tabs'
import { PlantillaEditor } from '@/components/documents/mesa/plantilla-editor'

export default async function PlantillasPage() {
  return (
    <PageShell>
      <PageHeader
        title="Plantillas de escritura"
        description="Redacta cláusulas, condiciones y alertas con nombres humanos."
      />
      <EscrituraTabs active="plantillas" />
      <PlantillaEditor />
    </PageShell>
  )
}
