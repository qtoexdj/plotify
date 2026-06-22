import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { MinutaGeneration } from '@/lib/documents/matriz-types'

export function formatGenerationDate(value: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function generationAuthor(generation: MinutaGeneration): string {
  return generation.generated_by ? 'Usuario registrado' : 'Equipo legal'
}

export function generationProjectName(generation: MinutaGeneration): string {
  return generation.project_name ?? 'Proyecto sin nombre'
}

export function generationLotLabel(generation: MinutaGeneration): string | null {
  return generation.lot_label ?? null
}

export function generationDescription(generation: MinutaGeneration): string {
  const lotLabel = generationLotLabel(generation)
  const lotPrefix = lotLabel ? `${lotLabel}: ` : ''
  return `${lotPrefix}${generationAuthor(generation)} generó la minuta el ${formatGenerationDate(
    generation.generated_at
  )} desde la versión ${generation.matriz_version}.`
}

export interface MinutaGenerationProjectGroup {
  projectId: string
  projectName: string
  generations: MinutaGeneration[]
}

export function groupGenerationsByProject(
  generations: MinutaGeneration[]
): MinutaGenerationProjectGroup[] {
  const groups = new Map<string, MinutaGenerationProjectGroup>()

  for (const generation of generations) {
    const projectId = generation.project_id ?? 'sin-proyecto'
    const current = groups.get(projectId)

    if (current) {
      current.generations.push(generation)
      continue
    }

    groups.set(projectId, {
      projectId,
      projectName: generationProjectName(generation),
      generations: [generation],
    })
  }

  return Array.from(groups.values())
}

type HistorialGeneracionesProps = {
  generations: MinutaGeneration[]
}

export function HistorialGeneraciones({ generations }: HistorialGeneracionesProps) {
  if (generations.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        {MESA_TEXT.sinMinutas}
      </div>
    )
  }

  const groups = groupGenerationsByProject(generations)

  return (
    <div className="space-y-6" data-testid="historial-generaciones">
      {groups.map((group) => (
        <section key={group.projectId} className="space-y-3" data-testid="historial-proyecto">
          <div className="flex flex-col gap-1 border-b border-border pb-2">
            <h2 className="text-base font-semibold text-foreground">{group.projectName}</h2>
            <p className="text-xs text-muted-foreground">
              {group.generations.length} minutas generadas
            </p>
          </div>
          {group.generations.map((generation) => (
            <article
              key={generation.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{generationDescription(generation)}</p>
                <p className="text-xs text-muted-foreground">{MESA_TEXT.declaracionAceptada}</p>
              </div>
              {generation.download_url ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={generation.download_url}>
                    <Download />
                    {MESA_TEXT.descargarMinuta}
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {MESA_TEXT.archivoNoDisponible}
                </span>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}
