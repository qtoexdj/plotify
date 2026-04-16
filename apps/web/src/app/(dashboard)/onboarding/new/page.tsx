'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { GeometryUploadPanel } from '@/components/projects/GeometryUploadPanel'
import { ProjectMediaStep } from '@/components/projects/onboarding/ProjectMediaStep'
import { GeometryAssignmentPanel } from '@/components/projects/geometry-assignment'
import type { ParsedFeature } from '@/types/onboarding.types'
import type { Project } from '@/types/database.types'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert01Icon, Tick02Icon, Loading02Icon, Location01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'

const projectSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  region: z.string().min(1, 'La región es obligatoria'),
  comuna: z.string().min(1, 'La comuna es obligatoria'),
  descripcion: z.string().optional(),
  total_lotes: z.number().int().min(1, 'Debe haber al menos 1 lote'),
  usar_prefijo_lotes: z.boolean(),
  prefijo_lotes: z.string(),
  precio_tipo: z.enum(['fijo', 'variable']),
  precio_valor: z.number().optional(),
  reserva_tipo: z.enum(['fijo', 'variable']),
  reserva_valor: z.number().optional(),
})

type ProjectFormData = z.infer<typeof projectSchema>

const steps = [
  { id: 1, label: 'Datos del proyecto' },
  { id: 2, label: 'Media y Documentos' },
  { id: 3, label: 'Subir Plano/Geometría' },
  { id: 4, label: 'Asignar geometrías' },
  { id: 5, label: 'Confirmación' },
]

export default function OnboardingWizardPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [project, setProject] = useState<Project | null>(null)
  const [isSavingProject, setIsSavingProject] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [parsedFeatures, setParsedFeatures] = useState<ParsedFeature[]>([])
  const [sourceType, setSourceType] = useState<'kmz' | 'kml' | 'dxf' | 'dwg'>('kmz')
  const [assignmentDone, setAssignmentDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      region: '',
      comuna: '',
      descripcion: '',
      total_lotes: 1,
      usar_prefijo_lotes: true,
      prefijo_lotes: 'Lote ',
      precio_tipo: 'variable',
      reserva_tipo: 'variable',
    },
  })

  // Watch los nuevos valores
  const usarPrefijo = watch('usar_prefijo_lotes')
  const precioTipo = watch('precio_tipo')
  const reservaTipo = watch('reserva_tipo')

  const totalLotes = watch('total_lotes')

  const handleCreateProject = async (data: ProjectFormData) => {
    setIsSavingProject(true)
    setProjectError(null)
    try {
      const payload = {
        ...data,
        lotPrefix: data.usar_prefijo_lotes ? data.prefijo_lotes : '',
        precio: data.precio_tipo === 'fijo' ? data.precio_valor : null,
        valor_reserva: data.reserva_tipo === 'fijo' ? data.reserva_valor : null,
      }

      const url = project ? `/api/projects/${project.id}` : '/api/projects'
      const method = project ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error al procesar el proyecto')
      }

      setProject(result.project)
      setCurrentStep(2)
      if (project) {
          toast.success('Proyecto actualizado')
      }
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Error al procesar el proyecto')
    } finally {
      setIsSavingProject(false)
    }
  }

  const handleUpdateMedia = async (media: Record<string, string | string[] | null>) => {
    if (!project) return
    setIsSavingProject(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(media),
      })

      if (!response.ok) {
        throw new Error('Error al actualizar documentos del proyecto')
      }

      const result = await response.json()
      setProject(result.project)
      toast.success('Archivos guardados en el proyecto')
    } catch {
      toast.error('Error al guardar archivos')
    } finally {
      setIsSavingProject(false)
    }
  }

  const canGoNext = useMemo(() => {
    if (currentStep === 1) return !!project
    if (currentStep === 2) return !!project
    if (currentStep === 3) return project !== null && parsedFeatures.length > 0
    if (currentStep === 4) return project !== null
    return true
  }, [currentStep, parsedFeatures.length, project])

  const goNext = () => {
    if (currentStep === steps.length) {
      if (project) router.push(`/projects/${project.id}`)
      return
    }
    if (canGoNext) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  const goPrev = () => {
    if (currentStep === 1) return
    setCurrentStep((prev) => prev - 1)
  }

  return (
    <div className={currentStep === 3 ? 'px-4 py-6' : 'max-w-5xl mx-auto space-y-6 p-6'}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Nuevo proyecto</h1>
          <p className="text-slate-600 dark:text-slate-400">Completa el onboarding en pasos antes de ir al proyecto.</p>
        </div>
        <div className="flex gap-2">
          {steps.map((step) => {
            const isActive = currentStep === step.id
            const isDone = currentStep > step.id
            return (
              <div
                key={step.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${isActive
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/50 dark:bg-blue-900/20 dark:text-blue-400'
                  : isDone
                    ? 'border-green-500 bg-green-50 text-green-700 dark:border-emerald-500/50 dark:bg-emerald-900/20 dark:text-emerald-400'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
              >
                {isDone ? <HugeiconsIcon icon={Tick02Icon} className="w-4 h-4" /> : <span>{step.id}</span>}
                <span>{step.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Paso 1: Datos del proyecto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit(handleCreateProject)}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    {...register('name')}
                    placeholder="Parcelas Los Aromos"
                  />
                  {errors.name && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_lotes">Total de lotes *</Label>
                  <Input
                    id="total_lotes"
                    type="number"
                    min="1"
                    {...register('total_lotes', { valueAsNumber: true })}
                  />
                  {errors.total_lotes && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.total_lotes.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">Región *</Label>
                  <Input
                    id="region"
                    {...register('region')}
                    placeholder="Valparaíso"
                  />
                  {errors.region && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.region.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comuna">Comuna *</Label>
                  <Input
                    id="comuna"
                    {...register('comuna')}
                    placeholder="Quillota"
                  />
                  {errors.comuna && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.comuna.message}</p>
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex flex-col gap-4 p-4 mt-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Formato de nombre para lotes</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Personaliza cómo se llamarán tus lotes automáticamente.
                        </p>
                      </div>
                      <Switch
                        checked={usarPrefijo}
                        onCheckedChange={(checked) =>
                          register('usar_prefijo_lotes').onChange({
                            target: { name: 'usar_prefijo_lotes', value: checked },
                          })
                        }
                      />
                    </div>

                    {usarPrefijo && (
                      <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <Label htmlFor="prefijo_lotes">Prefijo personalizado</Label>
                        <div className="flex gap-2 items-center">
                          <Input
                            id="prefijo_lotes"
                            {...register('prefijo_lotes')}
                            placeholder="Ej: LOTE , RESTO LOTE , N "
                            className="max-w-62.5"
                          />
                          <span className="text-sm text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                            Vista previa: {watch('prefijo_lotes') || ''}1
                          </span>
                        </div>
                      </div>
                    )}

                    {!usarPrefijo && (
                      <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <span className="text-sm text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                          Vista previa: 1
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
                  {/* Precio Block */}
                  <div className="flex flex-col gap-4 p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Precio de Venta</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Establece el precio general de los lotes.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500 dark:text-slate-400">Variable</span>
                        <Switch
                          checked={precioTipo === 'fijo'}
                          onCheckedChange={(checked) =>
                            register('precio_tipo').onChange({
                              target: { name: 'precio_tipo', value: checked ? 'fijo' : 'variable' },
                            })
                          }
                        />
                        <span className="text-sm font-medium">Fijo</span>
                      </div>
                    </div>
                    {precioTipo === 'fijo' && (
                      <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <Label htmlFor="precio_valor">Monto ($)</Label>
                        <Input
                          id="precio_valor"
                          type="number"
                          min="0"
                          {...register('precio_valor', { valueAsNumber: true })}
                          placeholder="Ej: 50000000"
                        />
                      </div>
                    )}
                  </div>

                  {/* Reserva Block */}
                  <div className="flex flex-col gap-4 p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Valor de Reserva</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Monto a cobrar por resevar un lote.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500 dark:text-slate-400">Variable</span>
                        <Switch
                          checked={reservaTipo === 'fijo'}
                          onCheckedChange={(checked) =>
                            register('reserva_tipo').onChange({
                              target: { name: 'reserva_tipo', value: checked ? 'fijo' : 'variable' },
                            })
                          }
                        />
                        <span className="text-sm font-medium">Fijo</span>
                      </div>
                    </div>
                    {reservaTipo === 'fijo' && (
                      <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <Label htmlFor="reserva_valor">Monto de reserva ($)</Label>
                        <Input
                          id="reserva_valor"
                          type="number"
                          min="0"
                          {...register('reserva_valor', { valueAsNumber: true })}
                          placeholder="Ej: 500000"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Textarea
                    id="descripcion"
                    rows={3}
                    {...register('descripcion')}
                    placeholder="Detalles adicionales..."
                  />
                </div>
              </div>

              {projectError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/50 rounded text-red-700 dark:text-red-400">
                  <HugeiconsIcon icon={Alert01Icon} className="w-4 h-4" />
                  <span>{projectError}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <HugeiconsIcon icon={Location01Icon} className="w-4 h-4" />
                  Total lotes: {totalLotes || 0}
                </div>
                <Button type="submit" disabled={isSavingProject} className="min-w-40">
                  {isSavingProject ? (
                    <>
                      <HugeiconsIcon icon={Loading02Icon} className="w-4 h-4 mr-2 animate-spin" /> Creando...
                    </>
                  ) : (
                    'Guardar y continuar'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && project && (
        <div className="space-y-4">
          <ProjectMediaStep 
            onMediaChange={(media) => {
              handleUpdateMedia(media)
            }} 
          />
          <div className="flex justify-between">
            <Button variant="outline" onClick={goPrev}>
              Anterior
            </Button>
            <Button onClick={goNext} disabled={!canGoNext}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {currentStep === 3 && project && (
        <Card>
          <CardHeader>
            <CardTitle>Paso 3: Subir archivo (KMZ, KML o DXF)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GeometryUploadPanel
              projectId={project.id}
              onUploadSuccess={(features, type) => {
                setParsedFeatures(features)
                setSourceType(type)
              }}
            />
            <div className="flex justify-between">
              <Button variant="outline" onClick={goPrev}>
                Anterior
              </Button>
              <Button onClick={goNext} disabled={!canGoNext}>
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 4 && project && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Paso 4: Asignar geometrías</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={goPrev}>
                Anterior
              </Button>
              <Button onClick={goNext} disabled={!canGoNext}>
                {assignmentDone ? 'Siguiente' : 'Continuar'}
              </Button>
            </div>
          </div>
          <GeometryAssignmentPanel
            projectId={project.id}
            parsedFeatures={parsedFeatures}
            sourceType={sourceType}
            onFeatureAssigned={() => {
              // Ya no filtramos el array principal para poder restaurar la geometría al desasignar
              // setParsedFeatures((prev) => prev.filter((f) => f.tempId !== tempId))
            }}
            onAssignmentComplete={() => {
              setAssignmentDone(true)
            }}
          />
        </div>
      )}

      {currentStep === 5 && project && (
        <Card>
          <CardHeader>
            <CardTitle>Paso 5: Confirmación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded text-green-700">
              <HugeiconsIcon icon={Tick02Icon} className="w-5 h-5" />
              <div>
                <p className="font-semibold">Proyecto listo</p>
                <p className="text-sm">ID: {project.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Resumen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-700">
                  <div>
                    <strong>Proyecto:</strong> {project.name}
                  </div>
                  <div>
                    <strong>Ubicación:</strong> {project.region} / {project.comuna}
                  </div>
                  <div>
                    <strong>Total lotes:</strong> {project.total_lotes}
                  </div>
                  <div>
                    <strong>Geometrías parseadas:</strong> {parsedFeatures.length}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Siguientes pasos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-700">
                  <p>Revisa el visor y edita lotes en la página del proyecto.</p>
                  <p>
                    Si faltan asignaciones, puedes completarlas luego en la pestaña de
                    importación.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Separator />

            <div className="flex justify-between">
              <Button variant="outline" onClick={goPrev}>
                Anterior
              </Button>
              <Button onClick={() => router.push(`/projects/${project.id}`)}>
                Ir al proyecto
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
