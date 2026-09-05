import type { Metadata } from 'next'
import { Deck } from '@/components/presentacion/deck'

export const metadata: Metadata = {
  title: 'Plotify — Presentación comercial',
  description:
    'Cómo Plotify conecta el plano del loteo, el estudio de títulos y la venta en terreno para emitir la promesa el mismo día.',
  robots: { index: false, follow: false },
}

/**
 * Ruta pública: se comparte con el dueño del loteo después de la reunión.
 * No consulta datos reales; todo el contenido sale de `deck-data.ts`.
 */
export default function PaginaPresentacion() {
  return <Deck />
}
