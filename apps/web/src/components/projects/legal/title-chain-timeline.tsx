'use client'

import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type {
  EvidencedValue,
  InscripcionChainLink,
  VerificationFailure,
} from '@/lib/legal/title-types'

export const ADQUISICION_TIPO_LABELS: Record<string, string> = {
  compra: 'Compra',
  compra_derechos: 'Compra de derechos',
  herencia_posesion_efectiva: 'Herencia (posesión efectiva)',
  herencia_inscripcion_especial: 'Herencia (inscripción especial)',
  cesion_derechos: 'Cesión de derechos',
  otro: 'Otro',
}

export function formatAdquisicionTipo(tipo: string): string {
  return ADQUISICION_TIPO_LABELS[tipo] ?? tipo
}

/**
 * Find the verification failure for a chain field path
 * (e.g. `inscripciones[0].escritura.fecha`).
 */
export function failureForPath(
  failures: VerificationFailure[],
  path: string
): VerificationFailure | null {
  return failures.find((failure) => failure.path === path) ?? null
}

interface ChainFieldProps {
  label: string
  field: EvidencedValue<string | null> | null | undefined
  failure?: VerificationFailure | null
}

function ChainField({ label, field, failure }: ChainFieldProps) {
  if (!field || field.value === null || field.value === undefined) {
    return null
  }
  const unverified = field.verified !== true || Boolean(failure)
  const value = (
    <span
      className={cn(
        'text-xs',
        unverified ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
      )}
    >
      {field.value}
    </span>
  )

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {field.evidence ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-left underline decoration-dotted underline-offset-2"
                aria-label={`Ver evidencia de ${label}`}
              >
                {value}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 text-xs" align="start">
              <p className="font-medium text-foreground">Evidencia documental</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                “{field.evidence.snippet}”
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Página {field.evidence.page_number} · documento {field.evidence.legal_document_id}
              </p>
            </PopoverContent>
          </Popover>
        ) : (
          <>
            {value}
            <Badge variant="outline" className="px-1 py-0 text-[9px] text-muted-foreground">
              sin evidencia
            </Badge>
          </>
        )}
        {unverified && (
          <Badge
            variant="outline"
            className="border-amber-500/20 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-600 dark:text-amber-400"
          >
            {failure ? failure.reason : 'requiere revisión'}
          </Badge>
        )}
      </div>
    </div>
  )
}

interface TitleChainTimelineProps {
  inscripciones: InscripcionChainLink[]
  failures?: VerificationFailure[]
}

export function TitleChainTimeline({ inscripciones, failures = [] }: TitleChainTimelineProps) {
  if (inscripciones.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No se extrajeron inscripciones de la cadena de título.
      </p>
    )
  }

  const ordered = [...inscripciones].sort((a, b) => a.orden - b.orden)

  return (
    <ol className="flex flex-col gap-3" aria-label="Cadena de adquisición">
      {ordered.map((insc, index) => {
        const prefix = `inscripciones[${index}]`
        return (
          <li
            // orden alone is not a safe key: pre-migration analyses can carry
            // colliding orden values across documents.
            key={`${insc.orden}-${index}`}
            className="rounded-lg border border-border bg-muted/5 p-3 transition-colors hover:border-primary/10"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {insc.orden}°
                </Badge>
                <span className="text-xs font-semibold text-foreground">
                  {formatAdquisicionTipo(insc.tipo_adquisicion)}
                </span>
              </div>
              {insc.adquirentes.length > 0 && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {insc.adquirentes.map((a) => a.nombre.value).join(', ')}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ChainField
                label="Antecesor"
                field={insc.antecesor?.nombre}
                failure={failureForPath(failures, `${prefix}.antecesor.nombre`)}
              />
              <ChainField
                label="Fecha escritura"
                field={insc.escritura?.fecha}
                failure={failureForPath(failures, `${prefix}.escritura.fecha`)}
              />
              <ChainField
                label="Notario"
                field={insc.escritura?.notario}
                failure={failureForPath(failures, `${prefix}.escritura.notario`)}
              />
              <ChainField
                label="Fojas"
                field={insc.inscripcion?.fojas}
                failure={failureForPath(failures, `${prefix}.inscripcion.fojas`)}
              />
              <ChainField
                label="Número"
                field={insc.inscripcion?.numero}
                failure={failureForPath(failures, `${prefix}.inscripcion.numero`)}
              />
              <ChainField
                label="Año"
                field={insc.inscripcion?.anio}
                failure={failureForPath(failures, `${prefix}.inscripcion.anio`)}
              />
              <ChainField
                label="CBR"
                field={insc.inscripcion?.cbr}
                failure={failureForPath(failures, `${prefix}.inscripcion.cbr`)}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
