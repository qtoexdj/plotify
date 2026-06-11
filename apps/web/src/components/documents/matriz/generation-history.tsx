import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MinutaGeneration } from '@/lib/documents/matriz-types'

export function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 12)}...` : hash
}

export function formatGenerationDate(value: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

type GenerationHistoryProps = {
  generations: MinutaGeneration[]
}

export function GenerationHistory({ generations }: GenerationHistoryProps) {
  if (generations.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        Aún no hay minutas DOCX generadas.
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-border"
      data-testid="generation-history"
    >
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Generada</th>
            <th className="px-4 py-3 font-medium">Matriz</th>
            <th className="px-4 py-3 font-medium">Snapshot</th>
            <th className="px-4 py-3 font-medium">Hash DOCX</th>
            <th className="px-4 py-3 text-right font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {generations.map((generation) => (
            <tr key={generation.id} className="border-t border-border">
              <td className="px-4 py-3">{formatGenerationDate(generation.generated_at)}</td>
              <td className="px-4 py-3">
                <Badge variant="outline">v{generation.matriz_version}</Badge>
              </td>
              <td className="px-4 py-3 font-mono text-xs">{shortHash(generation.snapshot_hash)}</td>
              <td className="px-4 py-3 font-mono text-xs">{shortHash(generation.content_hash)}</td>
              <td className="px-4 py-3 text-right">
                {generation.download_url ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={generation.download_url}>
                      <Download />
                      Descargar
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin URL</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
