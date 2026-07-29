'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const sheets = [
  ['operations', 'Detalle de operación', 'Revisa los antecedentes de la operación seleccionada.'],
  ['sidebar', 'Navegación principal', 'Accede a las secciones disponibles de Plotify.'],
  ['legal-editor', 'Variable legal', 'Revisa y confirma la variable jurídica seleccionada.'],
  ['lots', 'Ficha del lote', 'Actualiza la información contractual del lote.'],
  ['geometry-viewer', 'Detalles del lote', 'Revisa la geometría y las acciones disponibles.'],
  ['mesa', 'Datos y acciones', 'Revisa estados, pendientes y acciones de la escritura.'],
] as const

export function SheetAccessibilityFixture() {
  const [active, setActive] = useState<string | null>(null)

  return (
    <main className="min-h-svh bg-background p-4 text-foreground">
      <h1 className="text-xl font-semibold">Fixture accesible de paneles</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Superficie local determinista para verificar el contrato compartido de Sheet.
      </p>
      <output data-testid="active-sheet" className="sr-only">
        {active ?? 'none'}
      </output>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {sheets.map(([id, title, description]) => (
          <div key={id}>
            <Sheet open={active === id} onOpenChange={(open) => setActive(open ? id : null)}>
              <SheetTrigger asChild>
                <Button data-testid={`open-sheet-${id}`} className="min-h-11 min-w-11">
                  Abrir {title}
                </Button>
              </SheetTrigger>
              <SheetContent
                data-testid={`sheet-${id}`}
                side={id === 'sidebar' ? 'left' : id === 'operations' ? 'right' : 'bottom'}
                className={
                  id === 'sidebar'
                    ? 'w-[min(18rem,calc(100vw-1rem))]'
                    : id === 'operations'
                      ? 'w-full sm:max-w-xl'
                      : 'h-[80dvh] rounded-t-2xl'
                }
              >
                <SheetHeader>
                  <SheetTitle>{title}</SheetTitle>
                  <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
                <SheetBody className="space-y-3 px-6 py-2">
                  <div role="status" aria-live="polite" className="rounded-md border p-3">
                    Panel listo para revisión
                  </div>
                  {Array.from({ length: 18 }, (_, index) => (
                    <label key={index} className="flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-11 shrink-0"
                        aria-label={`${title}: opción ${index + 1}`}
                      />
                      <span>Antecedente verificable {index + 1}</span>
                    </label>
                  ))}
                </SheetBody>
                <SheetFooter className="border-t">
                  <Button className="min-h-11 min-w-11" onClick={() => setActive(null)}>
                    Guardar revisión
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        ))}
      </div>
    </main>
  )
}
