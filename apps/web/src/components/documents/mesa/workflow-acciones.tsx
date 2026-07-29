'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Download01Icon as Download,
  FileValidationIcon as FileCheck2,
  SentIcon as Send,
  ThumbsDownIcon as ThumbsDown,
  ThumbsUpIcon as ThumbsUp,
} from '@hugeicons/core-free-icons'
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
  retryCascade,
  submitLegalReview,
  submitMatriz,
} from '@/lib/documents/matriz-client'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type {
  ApprovalBlocker,
  MatrizCaseResponse,
  MatrizView,
  MinutaGeneration,
} from '@/lib/documents/matriz-types'
import { PendientesList } from './pendientes-list'

/**
 * Acciones del workflow (SDD 010 T016, FR-012, wireframe 5): enviar,
 * aprobar, rechazar y generar con un resumen humano antes de cada paso.
 * Conserva intactos el warning legal obligatorio (ADR-009, redactado con el
 * diccionario), su registro de aceptación (`warning_acknowledged`) y el
 * gate server-side de revisor autorizado. Los bloqueos se explican con la
 * lista de pendientes humanizados.
 */

export type AccionWorkflow =
  | 'enviar'
  | 'aprobar'
  | 'rechazar'
  | 'generar'
  | 'aprobar_revision_juridica'
  | 'rechazar_revision_juridica'

export function puedeEnviar(matriz: MatrizView): boolean {
  return matriz.status === 'draft' && !matriz.snapshot_stale
}

export function puedeRevisar(matriz: MatrizView): boolean {
  return matriz.status === 'legal_review_pending' && !matriz.snapshot_stale
}

/** Migrado de SDD 008: solo escritura aprobada con expediente vigente. */
export function puedeGenerarMinuta(matriz: MatrizView): boolean {
  return (
    matriz.scope === 'lot' &&
    matriz.status === 'approved' &&
    !matriz.snapshot_stale &&
    matriz.semantic_status === 'passed'
  )
}

type ReadinessGateBlocker = Extract<ApprovalBlocker, { kind: 'readiness_gate' }>

/** FR-007/FR-008: pendientes del gate legal_review_ready (uno por causa). */
export function revisionJuridicaBlockers(
  matriz: Pick<MatrizView, 'approval_blockers'>
): ReadinessGateBlocker[] {
  return matriz.approval_blockers.filter(
    (blocker): blocker is ReadinessGateBlocker =>
      blocker.kind === 'readiness_gate' && blocker.gate === 'legal_review_ready'
  )
}

/** Camino mínimo (T015/T018): si falta el abogado redactor, se enlaza al
 * Centro de Control Legal en vez de mostrar un formulario propio en la mesa. */
export function abogadoRedactorPendiente(
  blockers: ReadinessGateBlocker[]
): { href: string } | null {
  const pendiente = blockers.find(
    (blocker) =>
      blocker.cause === 'documento.abogado_redactor.nombre' ||
      blocker.cause === 'documento.abogado_redactor.rut'
  )
  return pendiente ? { href: pendiente.fix_url } : null
}

export function resumenDeAccion(accion: AccionWorkflow): string {
  if (accion === 'enviar') return MESA_TEXT.resumenEnviar
  if (accion === 'aprobar') return MESA_TEXT.resumenAprobar
  if (accion === 'rechazar') return MESA_TEXT.resumenRechazar
  if (accion === 'aprobar_revision_juridica') return MESA_TEXT.resumenAprobarRevisionJuridica
  if (accion === 'rechazar_revision_juridica') return MESA_TEXT.resumenRechazarRevisionJuridica
  return MESA_TEXT.warningLegal
}

export function tituloDeAccion(accion: AccionWorkflow): string {
  if (accion === 'enviar') return MESA_TEXT.enviarRevision
  if (accion === 'aprobar') return MESA_TEXT.aprobar
  if (accion === 'rechazar') return MESA_TEXT.rechazar
  if (accion === 'aprobar_revision_juridica') return MESA_TEXT.aprobarRevisionJuridica
  if (accion === 'rechazar_revision_juridica') return MESA_TEXT.rechazar
  return MESA_TEXT.tituloDeclaracionLegal
}

export function mensajeDeAccion(accion: AccionWorkflow): string {
  if (accion === 'generar') return MESA_TEXT.noSePudoGenerarMinuta
  if (accion === 'aprobar_revision_juridica' || accion === 'rechazar_revision_juridica') {
    return MESA_TEXT.noSePudoActualizarRevisionJuridica
  }
  return MESA_TEXT.noSePudoActualizarRevision
}

function requiereComentario(accion: AccionWorkflow | null): boolean {
  return accion === 'rechazar' || accion === 'rechazar_revision_juridica'
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
  const confirmarDeshabilitado =
    trabajando || (requiereComentario(accion) && razon.trim().length === 0)

  const revisionBlockers = revisionJuridicaBlockers(matriz)
  const enEsperaRevisionJuridica = matriz.scope === 'lot' && revisionBlockers.length > 0
  const abogadoPendiente = abogadoRedactorPendiente(revisionBlockers)
  const cascadeStatus = matriz.cascade_status ?? 'legacy'
  const esCasoConCascada = matriz.scope === 'lot' && cascadeStatus !== 'legacy'
  const puedeMostrarWorkflowManual = !esCasoConCascada

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
    const escrituraCaseId = matriz.escritura_case_id
    if (
      (accion === 'aprobar_revision_juridica' || accion === 'rechazar_revision_juridica') &&
      !escrituraCaseId
    ) {
      return
    }
    setTrabajando(true)
    setAviso(null)
    try {
      if (accion === 'enviar') {
        onWorkflowUpdate(await submitMatriz(matriz.id))
      } else if (accion === 'aprobar') {
        onWorkflowUpdate(await approveMatriz(matriz.id))
      } else if (accion === 'rechazar') {
        onWorkflowUpdate(await rejectMatriz(matriz.id, { reason: razon.trim() }))
      } else if (
        accion === 'aprobar_revision_juridica' ||
        accion === 'rechazar_revision_juridica'
      ) {
        onWorkflowUpdate(
          await submitLegalReview(escrituraCaseId as string, {
            decision: accion === 'aprobar_revision_juridica' ? 'aprobada' : 'rechazada',
            comentario: accion === 'rechazar_revision_juridica' ? razon.trim() : undefined,
          })
        )
      } else {
        const nueva = await generateMinuta(matriz.id, { warning_acknowledged: false })
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

  async function generarDirecto() {
    setTrabajando(true)
    setAviso(null)
    try {
      const nueva = await generateMinuta(matriz.id, { warning_acknowledged: false })
      setGeneracion(nueva)
      onGenerada?.(nueva)
    } catch {
      setAviso(MESA_TEXT.noSePudoGenerarMinuta)
    } finally {
      setTrabajando(false)
    }
  }

  async function reintentarCascada() {
    const escrituraCaseId = matriz.escritura_case_id
    if (!escrituraCaseId) return
    setTrabajando(true)
    setAviso(null)
    try {
      await retryCascade(escrituraCaseId)
      window.location.reload()
    } catch {
      setAviso(MESA_TEXT.noSePudoReintentarCascada)
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div data-testid="workflow-acciones" className="flex flex-wrap items-center gap-2">
      {cascadeStatus === 'exception' ? (
        <Button type="button" size="sm" disabled={trabajando} onClick={reintentarCascada}>
          <HugeiconsIcon icon={FileCheck2} />
          {MESA_TEXT.reintentarCascada}
        </Button>
      ) : null}

      {matriz.status === 'draft' && puedeMostrarWorkflowManual ? (
        <Button
          type="button"
          size="sm"
          disabled={!puedeEnviar(matriz)}
          onClick={() => abrir('enviar')}
        >
          <HugeiconsIcon icon={Send} />
          {MESA_TEXT.enviarRevision}
        </Button>
      ) : null}

      {matriz.status === 'legal_review_pending' && puedeMostrarWorkflowManual ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!puedeRevisar(matriz)}
            onClick={() => abrir('rechazar')}
          >
            <HugeiconsIcon icon={ThumbsDown} />
            {MESA_TEXT.rechazar}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!puedeRevisar(matriz)}
            onClick={() => abrir('aprobar')}
          >
            <HugeiconsIcon icon={ThumbsUp} />
            {MESA_TEXT.aprobar}
          </Button>
        </>
      ) : null}

      {matriz.status === 'approved' && matriz.scope === 'lot' && cascadeStatus !== 'completed' ? (
        <>
          {generacion?.fileId ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={`/api/files/${encodeURIComponent(generacion.fileId)}`}>
                <HugeiconsIcon icon={Download} />
                {MESA_TEXT.descargarMinuta}
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!puedeGenerarMinuta(matriz) || trabajando}
            onClick={generarDirecto}
          >
            <HugeiconsIcon icon={FileCheck2} />
            {MESA_TEXT.generarMinuta}
          </Button>
        </>
      ) : null}

      {enEsperaRevisionJuridica ? (
        <div
          data-testid="revision-juridica-pendiente"
          className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2"
        >
          <span className="text-sm font-medium text-warning">
            {MESA_TEXT.esperandoRevisionJuridica}
          </span>
          {abogadoPendiente ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={abogadoPendiente.href}>{MESA_TEXT.completarDatosAbogado}</a>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => abrir('rechazar_revision_juridica')}
              >
                <HugeiconsIcon icon={ThumbsDown} />
                {MESA_TEXT.rechazar}
              </Button>
              <Button type="button" size="sm" onClick={() => abrir('aprobar_revision_juridica')}>
                <HugeiconsIcon icon={ThumbsUp} />
                {MESA_TEXT.aprobarRevisionJuridica}
              </Button>
            </>
          )}
        </div>
      ) : null}

      {accion && requiereComentario(accion) ? (
        <div className="w-full space-y-2 rounded-lg border border-border bg-card p-3">
          <Label htmlFor="razon-rechazo">
            {accion === 'rechazar_revision_juridica'
              ? MESA_TEXT.comentarioRechazoRevisionLabel
              : MESA_TEXT.razonRechazoLabel}
          </Label>
          <Textarea
            id="razon-rechazo"
            value={razon}
            onChange={(event) => setRazon(event.target.value)}
            rows={3}
          />
          {aviso ? (
            <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              {aviso}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={cerrar} disabled={trabajando}>
              {MESA_TEXT.cancelar}
            </Button>
            <Button type="button" onClick={confirmar} disabled={confirmarDeshabilitado}>
              {MESA_TEXT.confirmar}
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={accion !== null && !requiereComentario(accion)}
        onOpenChange={(abierto) => (abierto ? null : cerrar())}
      >
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
      {aviso && accion === null ? (
        <p
          role="alert"
          className="w-full rounded-md bg-destructive/10 p-2 text-sm text-destructive"
        >
          {aviso}
        </p>
      ) : null}
    </div>
  )
}
