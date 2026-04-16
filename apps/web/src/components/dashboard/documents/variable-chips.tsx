'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Orígenes conocidos de variables para mostrar en tooltip.
 * 'auto' = generado programáticamente | 'manual' = ingreso por el usuario.
 */
const VARIABLE_ORIGINS: Record<string, string> = {
  'vendedor.nombre':              'profiles / ingreso manual',
  'vendedor.rut':                 'profiles / ingreso manual',
  'vendedor.tipo':                'ingreso manual',
  'comprador.nombre':             'lot_records.cliente_nombre',
  'comprador.rut':                'lot_records.cliente_run',
  'comprador.estado_civil':       'ingreso manual',
  'comprador.profesion_giro':     'ingreso manual',
  'comprador.domicilio':          'ingreso manual',
  'firma_lugar':                  'ingreso manual',
  'firma_fecha':                  'ingreso manual',
  'matriz.nombre_predio':         'projects.name',
  'matriz.ubicacion':             'projects – ingreso manual',
  'matriz.superficie_total':      'ingreso manual',
  'matriz.deslindes.norte':       'ingreso manual',
  'matriz.deslindes.sur':         'ingreso manual',
  'matriz.deslindes.oriente':     'ingreso manual',
  'matriz.deslindes.poniente':    'ingreso manual',
  'matriz.rol_avaluo':            'ingreso manual',
  'sag.certificado_numero':       'ingreso manual',
  'sag.plano_cbr_numero':         'ingreso manual',
  'lote.numero_nombre':           'lots.numero_lote (auto-texto)',
  'lote.superficie_total':        'lots.superficie (auto)',
  'lote.deslindes':               '⚡ deslinde-generator.ts',
  'lote.rol_tramite':             'ingreso manual',
  'servidumbre.superficie':       'ingreso manual',
  'servidumbre.deslindes_tramo':  '⚡ servidumbre-generator.ts',
  'transaccion.precio_numeros':   'lots.precio',
  'transaccion.precio_letras':    'lots.precio (auto-texto)',
  'transaccion.forma_pago':       'ingreso manual',
  'mandato.nombre_representante': 'ingreso manual',
  'mandato.rut_representante':    'ingreso manual',
  'personeria.tipo_documento':    'ingreso manual',
  'personeria.notaria':           'ingreso manual',
  'personeria.fecha':             'ingreso manual',
  'personeria.inscripcion_cbr':   'ingreso manual',
}

interface VariableChipsProps {
  /** HTML/texto con variables Jinja2 {{ variable.campo }} */
  content: string
  maxVisible?: number
}

/**
 * Extrae variables {{ x }} del contenido y las muestra como chips
 * con tooltip indicando su origen de datos.
 */
export function VariableChips({ content, maxVisible = 3 }: VariableChipsProps) {
  const raw = content.match(/\{\{\s*([a-zA-Z_][\w.]*\s*(?:\|[^}]*)?)\}\}/g) ?? []
  const vars = [...new Set(raw.map((m) => m.replace(/\{\{\s*([a-zA-Z_][\w.]*).*?\}\}/, '$1')))]

  const visible = vars.slice(0, maxVisible)
  const rest = vars.length - visible.length

  if (vars.length === 0) {
    return <span className="text-xs text-muted-foreground italic">Sin variables</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((v) => (
        <Tooltip key={v}>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="font-mono text-xs cursor-default">
              {v}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Origen: {VARIABLE_ORIGINS[v] ?? 'ingreso manual'}</p>
          </TooltipContent>
        </Tooltip>
      ))}
      {rest > 0 && (
        <Badge variant="outline" className="text-xs">+{rest}</Badge>
      )}
    </div>
  )
}
