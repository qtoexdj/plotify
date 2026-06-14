'use client'

import { useState } from 'react'
import { Download, FileCheck2, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  approveMatriz,
  generateMinuta,
  rejectMatriz,
  submitMatriz,
} from '@/lib/documents/matriz-client'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { MatrizCaseResponse, MatrizView, MinutaGeneration } from '@/lib/documents/matriz-types'
import { PendientesList } from './pendientes-list'

/**
 * Acciones del workflow (SDD 010 T016, FR-012, wireframe 5): enviar,
 * aprobar, rechazar y generar con un resumen humano antes de cada paso.
 * Conserva intactos el warning legal obligatorio (ADR-009, redactado con el
 * diccionario), su registro de aceptación (`warning_acknowledged`) y el
 * gate server-side de revisor autorizado. Los bloqueos se explican con la
 * lista de pendientes humanizados.
 */

export type AccionWorkflow = 'enviar' | 'aprobar' | 'rechazar' | 'generar'

export function puedeEnviar(matriz: MatrizView): boolean {
  return matriz.status === 'draft' && !matriz.snapshot_stale
}

export function puedeRevisar(matriz: MatrizView): boolean {
  return matriz.status === 'legal_review_pending' && !matriz.snapshot_stale
}

/** Migrado de SDD 008: solo escritura aprobada con expediente vigente. */
export function puedeGenerarMinuta(matriz: MatrizView): boolean {
  return matriz.status === 'approved' && !matriz.snapshot_stale
}

export function resumenDeAccion(accion: AccionWorkflow): string {
  if (accion === 'enviar') return MESA_TEXT.resumenEnviar
  if (accion === 'aprobar') return MESA_TEXT.resumenAprobar
  if (accion === 'rechazar') return MESA_TEXT.resumenRechazar
  return MESA_TEXT.warningLegal
}

export function tituloDeAccion(accion: AccionWorkflow): string {
  if (accion === 'enviar') return MESA_TEXT.enviarRevision
  if (accion === 'aprobar') return MESA_TEXT.aprobar
  if (accion === 'rechazar') return MESA_TEXT.rechazar
  return MESA_TEXT.tituloDeclaracionLegal
}

export function mensajeDeAccion(accion: AccionWorkflow): string {
  return accion === 'generar'
    ? MESA_TEXT.noSePudoGenerarMinuta
    : MESA_TEXT.noSePudoActualizarRevision
}

type WorkflowAccionesProps = {
  matriz: MatrizView
  onWorkflowUpdate: (response: MatrizCaseResponse) => void
  onGenerada?: (generation: MinutaGeneration) => void
}

export function WorkflowAcciones({ matriz, onWorkflowUpdate, onGenerada }: WorkflowAccionesProps) {
  const [accion, setAccion] = useState<AccionWorkflow | null>(null)
  const [razon, setRazon] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [generacion, setGeneracion] = useState<MinutaGeneration | null>(null)

  const hayPendientes = matriz.approval_blockers.length > 0
  const enviarBloqueado = accion === 'enviar' && hayPendientes
  const confirmarDeshabilitado = trabajando || (accion === 'rechazar' && razon.trim().length === 0)

  function abrir(siguiente: AccionWorkflow) {
    setAviso(null)
    setAccion(siguiente)
  }

  function cerrar() {
    setAccion(null)
    setRazon('')
    setAviso(null)
  }

  async function confirmar() {
    if (!accion) return
    setTrabajando(true)
    setAviso(null)
    try {
      if (accion === 'enviar') {
        onWorkflowUpdate(await submitMatriz(matriz.id))
      } else if (accion === 'aprobar') {
        onWorkflowUpdate(await approveMatriz(matriz.id))
      } else if (accion === 'rechazar') {
        onWorkflowUpdate(await rejectMatriz(matriz.id, { reason: razon.trim() }))
      } else {
        const nueva = await generateMinuta(matriz.id, { warning_acknowledged: true })
        setGeneracion(nueva)
        onGenerada?.(nueva)
      }
      cerrar()
    } catch {
      setAviso(mensajeDeAccion(accion))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div data-testid="workflow-acciones" className="flex flex-wrap items-center gap-2">
      {matriz.status === 'draft' ? (
        <Button
          type="button"
          size="sm"
          disabled={!puedeEnviar(matriz)}
          onClick={() => abrir('enviar')}
        >
          <Send />
          {MESA_TEXT.enviarRevision}
        </Button>
      ) : null}

      {matriz.status === 'legal_review_pending' ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!puedeRevisar(matriz)}
            onClick={() => abrir('rechazar')}
          >
            <ThumbsDown />
            {MESA_TEXT.rechazar}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!puedeRevisar(matriz)}
            onClick={() => abrir('aprobar')}
          >
            <ThumbsUp />
            {MESA_TEXT.aprobar}
          </Button>
        </>
      ) : null}

      {matriz.status === 'approved' ? (
        <>
          {generacion?.download_url ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={generacion.download_url}>
                <Download />
                {MESA_TEXT.descargarMinuta}
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!puedeGenerarMinuta(matriz)}
            onClick={() => abrir('generar')}
          >
            <FileCheck2 />
            {MESA_TEXT.generarMinuta}
          </Button>
        </>
      ) : null}

      <AlertDialog open={accion !== null} onOpenChange={(abierto) => (abierto ? null : cerrar())}>
        <AlertDialogContent data-testid="workflow-dialogo">
          {enviarBloqueado ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{MESA_TEXT.enviarBloqueadoTitle}</AlertDialogTitle>
                <AlertDialogDescription>{MESA_TEXT.pendientesTitle}:</AlertDialogDescription>
              </AlertDialogHeader>
              <PendientesList blockers={matriz.approval_blockers} compact />
              <AlertDialogFooter>
                <AlertDialogCancel>{MESA_TEXT.entendido}</AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : accion ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{tituloDeAccion(accion)}</AlertDialogTitle>
                <AlertDialogDescription>{resumenDeAccion(accion)}</AlertDialogDescription>
              </AlertDialogHeader>

              {accion === 'rechazar' ? (
                <div className="space-y-2">
                  <Label htmlFor="razon-rechazo">{MESA_TEXT.razonRechazoLabel}</Label>
                  <Textarea
                    id="razon-rechazo"
                    value={razon}
                    onChange={(event) => setRazon(event.target.value)}
                    rows={3}
                  />
                </div>
              ) : null}

              {aviso ? (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 p-2 text-sm text-destructive"
                >
                  {aviso}
                </p>
              ) : null}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={trabajando}>{MESA_TEXT.cancelar}</AlertDialogCancel>
                <Button type="button" onClick={confirmar} disabled={confirmarDeshabilitado}>
                  {accion === 'generar' ? MESA_TEXT.confirmoYGenero : MESA_TEXT.confirmar}
                </Button>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
