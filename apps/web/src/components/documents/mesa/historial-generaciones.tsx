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

export function generationDescription(generation: MinutaGeneration): string {
  return `${generationAuthor(generation)} generó la minuta el ${formatGenerationDate(
    generation.generated_at
  )} desde la versión ${generation.matriz_version}.`
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

  return (
    <div className="space-y-3" data-testid="historial-generaciones">
      {generations.map((generation) => (
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
            <span className="text-xs text-muted-foreground">{MESA_TEXT.archivoNoDisponible}</span>
          )}
        </article>
      ))}
    </div>
  )
}
