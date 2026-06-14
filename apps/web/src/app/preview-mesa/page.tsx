import { MesaEscritura } from '@/components/documents/mesa/mesa-escritura'
import type { MatrizCaseResponse } from '@/lib/documents/matriz-types'
import lectura from './fixture-lectura.json'
import preparacion from './fixture-preparacion.json'

/**
 * TEMPORAL — revisión visual de la mesa con fixtures Teno (no commitear).
 * /preview-mesa            → mesa de lectura (caso completo)
 * /preview-mesa?v=preparacion → llegada guiada (caso bloqueado)
 */
export default async function PreviewMesaPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>
}) {
  const { v } = await searchParams
  const data = (v === 'preparacion' ? preparacion : lectura) as unknown as MatrizCaseResponse
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-[1400px]">
        <MesaEscritura caseId="preview" initialData={data} />
      </div>
    </div>
  )
}
