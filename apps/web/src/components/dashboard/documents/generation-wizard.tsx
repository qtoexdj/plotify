'use client'

/**
 * Wizard de generación de documentos legales — 4 pasos.
 * Paso 1: Seleccionar template
 * Paso 2: Variables del documento (con auto-relleno desde lot + lot_records)
 * Paso 3: Preview renderizado localmente
 * Paso 4: Confirmar y generar (PDF / DOCX → microservicio)
 */

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Download,
} from 'lucide-react'
import { generateDocumentAction } from '@/actions/documents.action'
import { numberToWords } from '@/lib/legal/number-to-words'
import { generateDeslindeText } from '@/lib/legal/deslinde-generator'
import { generateServidumbreText, generateServidumbreTextLegacy } from '@/lib/legal/servidumbre-generator'
import type { DocumentTemplate } from '@/types/v2'
import type { EscrituraVariables } from '@/types/documents'
import type { OfficialBoundary, ServidumbreAnalysis } from '@/types/database.types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface LotWithRelations {
  id: string
  numero_lote: string
  m2: number | null
  area_official_m2: number | null
  servidumbre_m2: number | null
  servidumbre_ancho_m?: number | null
  boundaries_official: OfficialBoundary[] | null
  servidumbre_analysis?: ServidumbreAnalysis | null
  precio: number | null
  lot_records: Array<{
    cliente_nombre: string | null
    cliente_run: string | null
    cliente_direccion: string | null
    cliente_estado_civil: string | null
    cliente_ocupacion: string | null
  }> | null
  projects: {
    name: string
    commune: string | null
    region: string | null
    road_width_m?: number | null
  } | null
}

interface GenerationWizardProps {
  lot: LotWithRelations
  templates: DocumentTemplate[]
  organizationId: string
}

// ─── Zod Schema para Step 2 ───────────────────────────────────────────────────

const WizardFormSchema = z.object({
  // Vendedor
  vendedor_tipo: z.enum(['natural', 'juridica']),
  vendedor_nombre: z.string(),
  vendedor_rut: z.string(),
  vendedor_domicilio: z.string(),

  // Comprador
  comprador_nombre: z.string(),
  comprador_rut: z.string(),
  comprador_domicilio: z.string(),
  comprador_estado_civil: z.string(),
  comprador_profesion: z.string(),

  // Predio Matriz
  matriz_nombre_predio: z.string(),
  matriz_ubicacion: z.string(),
  matriz_superficie_total: z.string(),
  matriz_norte: z.string(),
  matriz_sur: z.string(),
  matriz_oriente: z.string(),
  matriz_poniente: z.string(),
  matriz_adquisicion_modo: z.string(),
  matriz_adquisicion_notaria: z.string(),
  matriz_adquisicion_fecha: z.string(),
  matriz_inscripcion_fojas: z.string(),
  matriz_inscripcion_numero: z.string(),
  matriz_inscripcion_anio: z.string(),
  matriz_inscripcion_cbr: z.string(),
  matriz_rol_avaluo: z.string(),

  // SAG
  sag_certificado_numero: z.string(),
  sag_certificado_fecha: z.string(),
  sag_plano_cbr_numero: z.string(),
  sag_plano_cbr_anio: z.string(),

  // Lote
  lote_numero_nombre: z.string(),
  lote_superficie_total: z.string(),
  lote_deslindes: z.string(),
  lote_rol_tramite: z.string(),

  // Servidumbre
  servidumbre_aplica: z.boolean(),
  servidumbre_superficie: z.string(),
  servidumbre_deslindes_tramo: z.string(),

  // Transacción
  transaccion_precio_numeros: z.string(),
  transaccion_precio_letras: z.string(),
  transaccion_forma_pago: z.string(),

  // Mandato
  mandato_nombre_representante: z.string(),
  mandato_rut_representante: z.string(),

  // Personería
  personeria_aplica: z.boolean(),
  personeria_tipo_documento: z.string(),
  personeria_notaria: z.string(),
  personeria_fecha: z.string(),
  personeria_inscripcion_fojas: z.string(),
  personeria_inscripcion_numero: z.string(),
  personeria_inscripcion_anio: z.string(),
  personeria_inscripcion_cbr: z.string(),
})

type WizardFormValues = z.infer<typeof WizardFormSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEMPLATE_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  escritura: { label: 'Escritura', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  reserva: { label: 'Reserva', className: 'bg-green-100 text-green-800 border-green-200' },
  promesa: { label: 'Promesa', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  otro: { label: 'Otro', className: 'bg-gray-100 text-gray-700 border-gray-200' },
}

/**
 * Resolución local de variables Jinja2 para el preview.
 * Soporta: {{ variable.campo }} y {{ variable.campo | default("valor") }}
 */
function resolveTemplate(
  templateHtml: string,
  variables: EscrituraVariables
): string {
  return templateHtml.replace(
    /\{\{\s*([\w.]+)\s*(?:\|\s*default\("([^"]*)"\)|\|[^}]*)?\s*\}\}/g,
    (_: string, key: string, fallback: string) => {
      let cursor: unknown = variables as unknown
      for (const k of key.split('.')) {
        if (cursor && typeof cursor === 'object') {
          cursor = (cursor as Record<string, unknown>)[k] ?? null
        } else {
          cursor = null
          break
        }
      }
      if (typeof cursor === 'string') return cursor
      return fallback ?? `[${key}]`
    }
  )
}

/**
 * Mapea los valores del formulario plano al objeto EscrituraVariables anidado.
 */
function formValuesToEscrituraVars(vals: WizardFormValues): EscrituraVariables {
  return {
    vendedor: {
      tipo: vals.vendedor_tipo,
      nombre: vals.vendedor_nombre,
      rut: vals.vendedor_rut,
      domicilio: vals.vendedor_domicilio,
    },
    comprador: {
      tipo: 'natural',
      nombre: vals.comprador_nombre,
      rut: vals.comprador_rut,
      domicilio: vals.comprador_domicilio,
      estado_civil: vals.comprador_estado_civil,
      profesion_giro: vals.comprador_profesion,
    },
    matriz: {
      nombre_predio: vals.matriz_nombre_predio,
      ubicacion: vals.matriz_ubicacion,
      superficie_total: vals.matriz_superficie_total,
      deslindes: {
        norte: vals.matriz_norte,
        sur: vals.matriz_sur,
        oriente: vals.matriz_oriente,
        poniente: vals.matriz_poniente,
      },
      adquisicion_modo: vals.matriz_adquisicion_modo,
      adquisicion_notaria: vals.matriz_adquisicion_notaria,
      adquisicion_fecha: vals.matriz_adquisicion_fecha,
      inscripcion_fojas: vals.matriz_inscripcion_fojas,
      inscripcion_numero: vals.matriz_inscripcion_numero,
      inscripcion_anio: vals.matriz_inscripcion_anio,
      inscripcion_cbr: vals.matriz_inscripcion_cbr,
      rol_avaluo: vals.matriz_rol_avaluo,
    },
    sag: {
      certificado_numero: vals.sag_certificado_numero,
      certificado_fecha: vals.sag_certificado_fecha,
      plano_cbr_numero: vals.sag_plano_cbr_numero,
      plano_cbr_anio: vals.sag_plano_cbr_anio,
    },
    lote: {
      numero_nombre: vals.lote_numero_nombre,
      superficie_total: vals.lote_superficie_total,
      deslindes: vals.lote_deslindes,
      rol_tramite: vals.lote_rol_tramite,
    },
    servidumbre: {
      aplica: vals.servidumbre_aplica,
      superficie: vals.servidumbre_superficie,
      deslindes_tramo: vals.servidumbre_deslindes_tramo,
    },
    transaccion: {
      precio_numeros: vals.transaccion_precio_numeros,
      precio_letras: vals.transaccion_precio_letras,
      forma_pago: vals.transaccion_forma_pago,
    },
    mandato: {
      nombre_representante: vals.mandato_nombre_representante,
      rut_representante: vals.mandato_rut_representante,
    },
    personeria: {
      aplica: vals.personeria_aplica,
      tipo_documento: vals.personeria_tipo_documento,
      notaria: vals.personeria_notaria,
      fecha: vals.personeria_fecha,
      inscripcion_fojas: vals.personeria_inscripcion_fojas,
      inscripcion_numero: vals.personeria_inscripcion_numero,
      inscripcion_anio: vals.personeria_inscripcion_anio,
      inscripcion_cbr: vals.personeria_inscripcion_cbr,
    },
  }
}

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Plantilla' },
  { id: 2, label: 'Variables' },
  { id: 3, label: 'Preview' },
  { id: 4, label: 'Generar' },
]

// ─── Defaults (module-level para evitar recreación en cada render) ────────────

const EMPTY_DEFAULTS: WizardFormValues = {
  vendedor_tipo: 'natural',
  vendedor_nombre: '', vendedor_rut: '', vendedor_domicilio: '',
  comprador_nombre: '', comprador_rut: '', comprador_domicilio: '',
  comprador_estado_civil: '', comprador_profesion: '',
  matriz_nombre_predio: '', matriz_ubicacion: '', matriz_superficie_total: '',
  matriz_norte: '', matriz_sur: '', matriz_oriente: '', matriz_poniente: '',
  matriz_adquisicion_modo: '', matriz_adquisicion_notaria: '', matriz_adquisicion_fecha: '',
  matriz_inscripcion_fojas: '', matriz_inscripcion_numero: '', matriz_inscripcion_anio: '',
  matriz_inscripcion_cbr: '', matriz_rol_avaluo: '',
  sag_certificado_numero: '', sag_certificado_fecha: '',
  sag_plano_cbr_numero: '', sag_plano_cbr_anio: '',
  lote_numero_nombre: '', lote_superficie_total: '', lote_deslindes: '', lote_rol_tramite: '',
  servidumbre_aplica: false, servidumbre_superficie: '', servidumbre_deslindes_tramo: '',
  transaccion_precio_numeros: '', transaccion_precio_letras: '', transaccion_forma_pago: 'al contado',
  mandato_nombre_representante: '', mandato_rut_representante: '',
  personeria_aplica: false, personeria_tipo_documento: '', personeria_notaria: '',
  personeria_fecha: '', personeria_inscripcion_fojas: '', personeria_inscripcion_numero: '',
  personeria_inscripcion_anio: '', personeria_inscripcion_cbr: '',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GenerationWizard({ lot, templates, organizationId }: GenerationWizardProps) {
  const [step, setStep] = useState(1)
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null)
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Secciones colapsables del Step 2
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    vendedor: true,
    comprador: true,
    matriz: false,
    sag: false,
    lote: true,
    servidumbre: false,
    transaccion: true,
    mandato: false,
    personeria: false,
  })

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(WizardFormSchema),
    defaultValues: EMPTY_DEFAULTS,
  })

  const watchServidumbreAplica = form.watch('servidumbre_aplica')
  const watchVendedorTipo = form.watch('vendedor_tipo')
  const watchPersoneriaAplica = form.watch('personeria_aplica')

  // ─── Auto-relleno al montar Step 2 ─────────────────────────────────────
  useEffect(() => {
    if (step !== 2) return

    const lotRecord = lot.lot_records?.[0]
    const area = lot.area_official_m2 ?? lot.m2
    const precio = lot.precio

    const lotNumero = parseInt(lot.numero_lote, 10)
    const lotNumeroWords = !isNaN(lotNumero)
      ? numberToWords(lotNumero).replace(/^UN(\s|$)/, 'UNO$1')
      : lot.numero_lote.toUpperCase()

    const areaWords = area != null && area > 0
      ? `${numberToWords(area)} METROS CUADRADOS`
      : ''

    const precioLetras = precio != null && precio > 0
      ? `${numberToWords(precio)} PESOS`
      : ''

    const tieneServidumbre = (lot.servidumbre_m2 ?? 0) > 0
    const servidumbreWords = tieneServidumbre && lot.servidumbre_m2 != null
      ? `${numberToWords(lot.servidumbre_m2)} METROS CUADRADOS`
      : ''

    form.reset({
      ...EMPTY_DEFAULTS,
      // Comprador desde lot_records
      comprador_nombre: lotRecord?.cliente_nombre ?? '',
      comprador_rut: lotRecord?.cliente_run ?? '',
      comprador_domicilio: lotRecord?.cliente_direccion ?? '',
      comprador_estado_civil: lotRecord?.cliente_estado_civil ?? '',
      comprador_profesion: lotRecord?.cliente_ocupacion ?? '',
      // Lote auto-calculado
      lote_numero_nombre: `LOTE N ${lotNumeroWords}`,
      lote_superficie_total: areaWords,
      // Servidumbre
      servidumbre_aplica: tieneServidumbre,
      servidumbre_superficie: servidumbreWords,
      // Transacción
      transaccion_precio_numeros: precio?.toString() ?? '',
      transaccion_precio_letras: precioLetras,
      transaccion_forma_pago: 'al contado',
    })

    // Abrir sección servidumbre si aplica
    if (tieneServidumbre) {
      setOpenSections(prev => ({ ...prev, servidumbre: true }))
    }
  }, [step, lot, form])

  // ─── Generadores automáticos ────────────────────────────────────────────

  const handleGenerarDeslindes = useCallback(() => {
    const texto = generateDeslindeText({
      numero_lote: lot.numero_lote,
      area_official_m2: lot.area_official_m2,
      m2: lot.m2,
      servidumbre_m2: lot.servidumbre_m2,
      boundaries_official: lot.boundaries_official,
    })
    form.setValue('lote_deslindes', texto, { shouldDirty: true })
  }, [lot, form])

  const handleGenerarServidumbre = useCallback(() => {
    let texto: string
    if (lot.servidumbre_analysis) {
      const roadWidth = lot.servidumbre_ancho_m ?? lot.projects?.road_width_m ?? 6
      texto = generateServidumbreText(lot.servidumbre_analysis, roadWidth)
    } else {
      texto = generateServidumbreTextLegacy({
        numero_lote: lot.numero_lote,
        servidumbre_m2: lot.servidumbre_m2,
        boundaries_official: lot.boundaries_official,
      })
    }
    form.setValue('servidumbre_deslindes_tramo', texto, { shouldDirty: true })
  }, [lot, form])

  // ─── Construir preview HTML local ──────────────────────────────────────

  const buildPreviewHtml = useCallback((): string => {
    if (!selectedTemplate) return ''

    const rawContent = (selectedTemplate as unknown as Record<string, unknown>)
    const templateHtml = (rawContent['content'] as string | undefined) ||
      (rawContent['header_config'] as string | undefined) ||
      '<p>Este template no tiene contenido HTML configurado.</p>'

    const vars = formValuesToEscrituraVars(form.getValues())
    return resolveTemplate(templateHtml, vars)
  }, [selectedTemplate, form])

  // ─── Generar documento (Step 4) ─────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplate) return
    setIsGenerating(true)
    setGenerateError(null)

    try {
      const result = await generateDocumentAction(selectedTemplate.id, lot.id, format)
      if (result.success) {
        setGeneratedUrl(result.data.file_url)
      } else {
        setGenerateError(result.error)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [selectedTemplate, lot.id, format])

  // ─── Contar variables completas / pendientes ─────────────────────────────

  const countVariableStats = useCallback(() => {
    const vals = form.getValues()
    const all = Object.values(vals).filter(v => typeof v === 'string') as string[]
    const filled = all.filter(v => v.trim().length > 0)
    return { filled: filled.length, total: all.length }
  }, [form])

  // ─── Render helpers ──────────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
              step === s.id
                ? 'bg-primary text-primary-foreground'
                : step > s.id
                ? 'bg-green-500 text-white'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {step > s.id ? <CheckCircle2 className="h-4 w-4" /> : s.id}
          </div>
          <span
            className={`text-sm ${
              step === s.id ? 'text-foreground font-medium' : 'text-muted-foreground'
            }`}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
          )}
        </div>
      ))}
    </div>
  )

  // ─── Step 1: Selección de template ───────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Selecciona la plantilla que deseas usar para generar el documento.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(template => {
          const badge = TEMPLATE_TYPE_BADGE[template.document_type] ?? TEMPLATE_TYPE_BADGE.otro
          const isSelected = selectedTemplate?.id === template.id
          return (
            <Card
              key={template.id}
              onClick={() => setSelectedTemplate(template)}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected
                  ? 'ring-2 ring-primary border-primary'
                  : 'hover:border-primary/50'
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  {template.is_default && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      Predeterminada
                    </Badge>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs w-fit ${badge.className}`}
                >
                  {badge.label}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0">
                {template.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                )}
                {isSelected && (
                  <div className="mt-3 flex items-center gap-1 text-primary text-xs font-medium">
                    <CheckCircle2 className="h-3 w-3" />
                    Seleccionada
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      {templates.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No hay plantillas disponibles.</p>
          <p className="text-xs mt-1">
            Crea una plantilla en{' '}
            <a href="/documentos/plantillas" className="text-primary underline">
              /documentos/plantillas
            </a>
          </p>
        </div>
      )}
    </div>
  )

  // ─── Sección colapsable del Step 2 ───────────────────────────────────────
  const SectionCollapsible = ({
    sectionKey,
    title,
    icon,
    children,
  }: {
    sectionKey: string
    title: string
    icon: string
    children: React.ReactNode
  }) => (
    <Collapsible
      open={openSections[sectionKey]}
      onOpenChange={() => toggleSection(sectionKey)}
    >
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent transition-colors">
          <span>
            {icon} {title}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform text-muted-foreground ${
              openSections[sectionKey] ? 'rotate-180' : ''
            }`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border border-t-0 rounded-b-md p-4 space-y-4">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )

  // ─── Campo de formulario reutilizable ─────────────────────────────────────
  const FormField = ({
    label,
    fieldName,
    placeholder,
    textarea = false,
    trailingButton,
  }: {
    label: string
    fieldName: keyof WizardFormValues
    placeholder?: string
    textarea?: boolean
    trailingButton?: React.ReactNode
  }) => {
    const val = form.watch(fieldName)
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex gap-2">
          {textarea ? (
            <textarea
              {...form.register(fieldName as keyof WizardFormValues & string)}
              placeholder={placeholder}
              rows={3}
              className="flex-1 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          ) : (
            <Input
              {...form.register(fieldName as keyof WizardFormValues & string)}
              placeholder={placeholder}
              value={typeof val === 'string' ? val : ''}
              className="flex-1 text-sm"
            />
          )}
          {trailingButton}
        </div>
      </div>
    )
  }

  // ─── Step 2: Variables ────────────────────────────────────────────────────
  const renderStep2 = () => (
    <ScrollArea className="h-[60vh] pr-4">
      <div className="space-y-3">

        {/* Vendedor */}
        <SectionCollapsible sectionKey="vendedor" title="Vendedor" icon="📦">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select
                value={form.watch('vendedor_tipo')}
                onValueChange={v =>
                  form.setValue('vendedor_tipo', v as 'natural' | 'juridica')
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">Persona Natural</SelectItem>
                  <SelectItem value="juridica">Persona Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FormField label="Nombre / Razón Social" fieldName="vendedor_nombre" />
            <FormField label="RUT" fieldName="vendedor_rut" placeholder="12.345.678-9" />
            <div className="col-span-2">
              <FormField label="Domicilio" fieldName="vendedor_domicilio" />
            </div>
          </div>
        </SectionCollapsible>

        {/* Comprador */}
        <SectionCollapsible sectionKey="comprador" title="Comprador" icon="👤">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nombre completo" fieldName="comprador_nombre" />
            <FormField label="RUT" fieldName="comprador_rut" placeholder="12.345.678-9" />
            <FormField label="Estado civil" fieldName="comprador_estado_civil" placeholder="soltero/a, casado/a..." />
            <FormField label="Profesión / Giro" fieldName="comprador_profesion" />
            <div className="col-span-2">
              <FormField label="Domicilio" fieldName="comprador_domicilio" />
            </div>
          </div>
        </SectionCollapsible>

        {/* Predio Matriz */}
        <SectionCollapsible sectionKey="matriz" title="Predio Matriz" icon="🏡">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nombre del predio" fieldName="matriz_nombre_predio" />
            <FormField label="Ubicación" fieldName="matriz_ubicacion" />
            <div className="col-span-2">
              <FormField label="Superficie total" fieldName="matriz_superficie_total" />
            </div>
            <Separator className="col-span-2" />
            <div className="col-span-2 text-xs font-medium text-muted-foreground">
              Deslindes del predio matriz
            </div>
            <FormField label="Norte" fieldName="matriz_norte" textarea />
            <FormField label="Sur" fieldName="matriz_sur" textarea />
            <FormField label="Oriente" fieldName="matriz_oriente" textarea />
            <FormField label="Poniente" fieldName="matriz_poniente" textarea />
            <Separator className="col-span-2" />
            <div className="col-span-2 text-xs font-medium text-muted-foreground">
              Historia de título
            </div>
            <FormField label="Modo de adquisición" fieldName="matriz_adquisicion_modo" placeholder="compraventa, herencia..." />
            <FormField label="Notaría" fieldName="matriz_adquisicion_notaria" />
            <FormField label="Fecha adquisición" fieldName="matriz_adquisicion_fecha" placeholder="dd/mm/aaaa" />
            <FormField label="Fojas inscripción" fieldName="matriz_inscripcion_fojas" />
            <FormField label="N° inscripción" fieldName="matriz_inscripcion_numero" />
            <FormField label="Año inscripción" fieldName="matriz_inscripcion_anio" placeholder="2024" />
            <div className="col-span-2">
              <FormField label="CBR" fieldName="matriz_inscripcion_cbr" />
            </div>
            <div className="col-span-2">
              <FormField label="Rol Avalúo" fieldName="matriz_rol_avaluo" placeholder="XXX-YYY" />
            </div>
          </div>
        </SectionCollapsible>

        {/* SAG */}
        <SectionCollapsible sectionKey="sag" title="SAG (Subdivisión)" icon="📋">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="N° Certificado" fieldName="sag_certificado_numero" />
            <FormField label="Fecha certificado" fieldName="sag_certificado_fecha" placeholder="dd/mm/aaaa" />
            <FormField label="N° plano CBR" fieldName="sag_plano_cbr_numero" />
            <FormField label="Año plano CBR" fieldName="sag_plano_cbr_anio" placeholder="2024" />
          </div>
        </SectionCollapsible>

        {/* Lote */}
        <SectionCollapsible sectionKey="lote" title="Lote" icon="📐">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FormField label="Número del lote (en palabras)" fieldName="lote_numero_nombre" />
            </div>
            <div className="col-span-2">
              <FormField label="Superficie total (en palabras)" fieldName="lote_superficie_total" />
            </div>
            <div className="col-span-2">
              <FormField
                label="Deslindes del lote"
                fieldName="lote_deslindes"
                textarea
                trailingButton={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerarDeslindes}
                    className="shrink-0 text-xs gap-1"
                    title="Generar desde geometría del lote"
                  >
                    <Zap className="h-3 w-3" />
                    Generar
                  </Button>
                }
              />
            </div>
            <div className="col-span-2">
              <FormField label="Rol de trámite" fieldName="lote_rol_tramite" placeholder="XXX-YYY" />
            </div>
          </div>
        </SectionCollapsible>

        {/* Servidumbre */}
        <SectionCollapsible sectionKey="servidumbre" title="Servidumbre de Tránsito" icon="🛤️">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={watchServidumbreAplica}
                onCheckedChange={v => form.setValue('servidumbre_aplica', v)}
              />
              <span className="text-sm">
                {watchServidumbreAplica ? 'Aplica servidumbre' : 'No aplica servidumbre'}
              </span>
            </div>
            {watchServidumbreAplica && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="col-span-2">
                  <FormField label="Superficie servidumbre (en palabras)" fieldName="servidumbre_superficie" />
                </div>
                <div className="col-span-2">
                  <FormField
                    label="Deslindes del tramo de servidumbre"
                    fieldName="servidumbre_deslindes_tramo"
                    textarea
                    trailingButton={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGenerarServidumbre}
                        className="shrink-0 text-xs gap-1"
                        title="Generar desde análisis de geometría"
                      >
                        <Zap className="h-3 w-3" />
                        Generar
                      </Button>
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </SectionCollapsible>

        {/* Transacción */}
        <SectionCollapsible sectionKey="transaccion" title="Transacción" icon="💰">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Precio (números)" fieldName="transaccion_precio_numeros" placeholder="25000000" />
            <FormField label="Forma de pago" fieldName="transaccion_forma_pago" placeholder="al contado" />
            <div className="col-span-2">
              <FormField label="Precio (en palabras)" fieldName="transaccion_precio_letras" />
            </div>
          </div>
        </SectionCollapsible>

        {/* Mandato */}
        <SectionCollapsible sectionKey="mandato" title="Mandato de Rectificación" icon="📜">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nombre representante" fieldName="mandato_nombre_representante" />
            <FormField label="RUT representante" fieldName="mandato_rut_representante" placeholder="12.345.678-9" />
          </div>
        </SectionCollapsible>

        {/* Personería — visible si vendedor es jurídica */}
        {watchVendedorTipo === 'juridica' && (
          <SectionCollapsible sectionKey="personeria" title="Personería" icon="🏢">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={watchPersoneriaAplica}
                  onCheckedChange={v => form.setValue('personeria_aplica', v)}
                />
                <span className="text-sm">Incluir datos de personería</span>
              </div>
              {watchPersoneriaAplica && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <FormField label="Tipo documento" fieldName="personeria_tipo_documento" placeholder="escritura pública, resolución..." />
                  <FormField label="Notaría" fieldName="personeria_notaria" />
                  <FormField label="Fecha" fieldName="personeria_fecha" placeholder="dd/mm/aaaa" />
                  <FormField label="Fojas" fieldName="personeria_inscripcion_fojas" />
                  <FormField label="N° inscripción" fieldName="personeria_inscripcion_numero" />
                  <FormField label="Año" fieldName="personeria_inscripcion_anio" />
                  <div className="col-span-2">
                    <FormField label="CBR" fieldName="personeria_inscripcion_cbr" />
                  </div>
                </div>
              )}
            </div>
          </SectionCollapsible>
        )}
      </div>
    </ScrollArea>
  )

  // ─── Step 3: Preview ──────────────────────────────────────────────────────
  const renderStep3 = () => {
    const previewHtml = buildPreviewHtml()
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Vista previa generada localmente. Las variables sin valor aparecen como{' '}
          <code className="bg-muted px-1 rounded text-xs">[key]</code>.
        </p>
        <ScrollArea className="h-[60vh] border rounded-lg">
          <div
            className="prose prose-sm max-w-none p-8 bg-white text-black [&_h2]:text-base [&_h3]:text-sm font-serif"
            dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-gray-400 italic">Sin contenido HTML en la plantilla seleccionada.</p>' }}
          />
        </ScrollArea>
      </div>
    )
  }

  // ─── Step 4: Confirmar y generar ──────────────────────────────────────────
  const renderStep4 = () => {
    const stats = countVariableStats()
    return (
      <div className="space-y-6">
        {/* Resumen */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resumen de generación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plantilla</span>
              <span className="font-medium">{selectedTemplate?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lote</span>
              <span className="font-medium">
                {lot.numero_lote} — {lot.projects?.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Variables completadas</span>
              <span className={stats.filled < stats.total ? 'text-orange-500 font-medium' : 'text-green-600 font-medium'}>
                {stats.filled} / {stats.total}
              </span>
            </div>
            {stats.filled < stats.total && (
              <div className="flex items-start gap-2 text-orange-600 bg-orange-50 rounded-md p-3 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Hay {stats.total - stats.filled} variables sin completar. El documento se generará
                  con los campos vacíos marcados como{' '}
                  <code className="bg-orange-100 px-1 rounded">___________</code>.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selector de formato */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Formato de salida</Label>
          <div className="flex gap-3">
            {(['pdf', 'docx'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 border rounded-lg py-3 text-sm font-medium transition-colors ${
                  format === f
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'hover:border-primary/50'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Error de generación */}
        {generateError && (
          <div className="flex items-start gap-2 text-destructive bg-destructive/10 rounded-md p-3 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{generateError}</span>
          </div>
        )}

        {/* Resultado exitoso */}
        {generatedUrl && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-md p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Documento generado correctamente.</span>
            <a
              href={generatedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-primary underline font-medium"
            >
              <Download className="h-4 w-4" />
              Descargar
            </a>
          </div>
        )}

        {/* Botón de generación */}
        {!generatedUrl && (
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedTemplate}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generando documento...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generar {format.toUpperCase()}
              </>
            )}
          </Button>
        )}
      </div>
    )
  }

  // ─── Navigation buttons ───────────────────────────────────────────────────

  const canAdvance =
    step === 1 ? selectedTemplate !== null :
    step === 2 ? true :
    step === 3 ? true : false

  const renderNavButtons = () => (
    <div className="flex justify-between pt-6 border-t">
      <Button
        variant="outline"
        onClick={() => setStep(s => Math.max(1, s - 1))}
        disabled={step === 1}
      >
        Anterior
      </Button>
      {step < 4 ? (
        <Button
          onClick={() => setStep(s => s + 1)}
          disabled={!canAdvance}
        >
          Siguiente
        </Button>
      ) : null}
    </div>
  )

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {renderStepIndicator()}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {step === 1 && 'Paso 1 — Seleccionar Plantilla'}
            {step === 2 && 'Paso 2 — Variables del Documento'}
            {step === 3 && 'Paso 3 — Vista Previa'}
            {step === 4 && 'Paso 4 — Confirmar y Generar'}
          </CardTitle>
          {step === 2 && selectedTemplate && (
            <CardDescription>
              Plantilla: <strong>{selectedTemplate.name}</strong> — Lote{' '}
              <strong>{lot.numero_lote}</strong>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {renderNavButtons()}
        </CardContent>
      </Card>
    </div>
  )
}
