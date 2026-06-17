'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Loader2, PencilLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { bulkApproveProjectVariables, upsertProjectVariable } from '@/lib/documents/matriz-client'
import type { ApprovalBlocker } from '@/lib/documents/matriz-types'
import { pendienteHref, pendienteTitle } from './pendientes-list'

/**
 * SDD 011 (B): preparación de la matriz del proyecto. Convierte los pendientes
 * humanizados de la matriz en un checklist accionable agrupado por sección:
 *  - variables de captura manual/autoría → "Ingresar dato" en línea (upsert).
 *  - variables extraídas por IA → "Aprobar revisados" por sección (bulk).
 * Todo el texto llega ya redactado desde el API; este componente no traduce
 * códigos ni muestra jerga.
 */

type TokenBlocker = Extract<ApprovalBlocker, { kind: 'token_missing' }>

const SECTION_BY_GROUP: Record<string, string> = {
  matriz: 'Identidad del predio',
  titulo: 'Dominio y título',
  vendedor: 'Dominio y título',
  evidencia: 'Dominio y título',
  sii: 'Roles del SII',
  sag: 'SAG y plano',
  personeria: 'Personería y representación',
  mandato: 'Personería y representación',
  clausulas: 'Cláusulas',
  documento: 'Otorgamiento',
}

function sectionFor(key: string): string {
  return SECTION_BY_GROUP[key.split('.')[0]] ?? 'Otros datos'
}

function isManualEntry(blocker: TokenBlocker): boolean {
  return blocker.producer === 'manual' || blocker.producer === 'authored'
}

type PreparacionMatrizProps = {
  projectId: string
  blockers: ApprovalBlocker[]
  onResolved: () => void
}

export function PreparacionMatriz({ projectId, blockers, onResolved }: PreparacionMatrizProps) {
  const tokens = useMemo(
    () => blockers.filter((b): b is TokenBlocker => b.kind === 'token_missing'),
    [blockers]
  )
  const otros = useMemo(() => blockers.filter((b) => b.kind !== 'token_missing'), [blockers])

  const secciones = useMemo(() => {
    const map = new Map<string, TokenBlocker[]>()
    for (const token of tokens) {
      const section = sectionFor(token.key)
      const list = map.get(section) ?? []
      list.push(token)
      map.set(section, list)
    }
    return Array.from(map.entries())
  }, [tokens])

  const [editando, setEditando] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function guardarDato(key: string) {
    if (!valor.trim()) return
    setOcupado(key)
    setAviso(null)
    try {
      await upsertProjectVariable(projectId, { variable_key: key, value_text: valor.trim() })
      setEditando(null)
      setValor('')
      onResolved()
    } catch {
      setAviso('No se pudo guardar el dato. Intenta de nuevo.')
    } finally {
      setOcupado(null)
    }
  }

  async function aprobarSeccion(section: string, claves: string[]) {
    if (claves.length === 0) return
    setOcupado(`section:${section}`)
    setAviso(null)
    try {
      await bulkApproveProjectVariables(projectId, { variable_keys: claves })
      onResolved()
    } catch {
      setAviso('No se pudieron aprobar los datos. Intenta de nuevo.')
    } finally {
      setOcupado(null)
    }
  }

  if (tokens.length === 0 && otros.length === 0) {
    return null
  }

  return (
    <div data-testid="preparacion-matriz" className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          Faltan {tokens.length + otros.length} datos para aprobar la matriz
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Completa o aprueba cada dato; el comprador, el lote y la servidumbre se llenan al vender.
        </p>
      </div>

      {aviso ? (
        <p role="alert" className="text-xs text-destructive">
          {aviso}
        </p>
      ) : null}

      {secciones.map(([section, items]) => {
        const revisables = items
          .filter((item) => item.producer === 'extracted')
          .map((item) => item.key)
        const aprobandoSeccion = ocupado === `section:${section}`
        return (
          <section key={section} className="rounded-md border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section}
              </h4>
              {revisables.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={aprobandoSeccion}
                  onClick={() => aprobarSeccion(section, revisables)}
                >
                  {aprobandoSeccion ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  Aprobar revisados ({revisables.length})
                </Button>
              ) : null}
            </div>

            <ul className="space-y-2">
              {items.map((item) => {
                const enEdicion = editando === item.key
                const guardando = ocupado === item.key
                const href = pendienteHref(item)
                return (
                  <li
                    key={item.key}
                    className="rounded-md border border-amber-200 bg-background p-2.5"
                  >
                    <p className="text-sm font-medium text-foreground">{pendienteTitle(item)}</p>
                    {item.description && item.description !== item.title ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                    ) : null}

                    {enEdicion ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          autoFocus
                          value={valor}
                          onChange={(event) => setValor(event.target.value)}
                          placeholder="Escribe el dato"
                          aria-label={`Valor de ${pendienteTitle(item)}`}
                          className="h-8 text-sm"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={guardando || !valor.trim()}
                          onClick={() => guardarDato(item.key)}
                        >
                          {guardando ? <Loader2 className="size-3 animate-spin" /> : 'Guardar'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={guardando}
                          onClick={() => {
                            setEditando(null)
                            setValor('')
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-1.5 flex items-center gap-3">
                        {isManualEntry(item) ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                            onClick={() => {
                              setEditando(item.key)
                              setValor('')
                            }}
                          >
                            <PencilLine className="size-3" />
                            Ingresar dato
                          </button>
                        ) : null}
                        {href && item.action_label ? (
                          <Link
                            href={href}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                          >
                            {item.action_label}
                            <ArrowRight className="size-3" />
                          </Link>
                        ) : null}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
