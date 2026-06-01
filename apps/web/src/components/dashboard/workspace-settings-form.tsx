'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { WorkspaceDetails } from '@/lib/services/workspace.service'
import { updateWorkspaceAction } from '@/app/(dashboard)/settings/actions'
import { HugeiconsIcon } from '@hugeicons/react'
import { FloppyDiskIcon, Loading02Icon, StarIcon } from '@hugeicons/core-free-icons'

const formSchema = z.object({
  name: z.string().min(2, {
    message: 'El nombre debe tener al menos 2 caracteres.',
  }),
  slug: z
    .string()
    .min(2, {
      message: 'El slug debe tener al menos 2 caracteres.',
    })
    .regex(/^[a-z0-9-]+$/, {
      message: 'El slug solo puede contener letras minúsculas, números y guiones.',
    }),
})

interface WorkspaceSettingsFormProps {
  workspace: WorkspaceDetails
}

export function WorkspaceSettingsForm({ workspace }: WorkspaceSettingsFormProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: workspace.organization.name || '',
      slug: workspace.organization.slug || '',
    },
  })

  const isAdmin = workspace.role === 'admin'
  const isPersonal = workspace.organization.is_personal

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!isAdmin) {
      toast.error('No tienes permisos de administrador en este workspace.')
      return
    }

    setIsPending(true)
    const result = await updateWorkspaceAction(workspace.organization.id, values)
    setIsPending(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Workspace actualizado exitosamente.')
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-xs border-border/60 bg-card/65 backdrop-blur-xs rounded-xl">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">
                Perfil del Workspace
              </CardTitle>
              <CardDescription className="text-muted-foreground/80">
                Administra la identidad y preferencias de tu entorno de trabajo en Plotify.
              </CardDescription>
            </div>
            {isPersonal ? (
              <Badge
                variant="outline"
                className="bg-muted/65 text-muted-foreground border-border/80 rounded-full w-fit"
              >
                Cuenta Independiente
              </Badge>
            ) : (
              <Badge
                variant="default"
                className="bg-primary hover:bg-primary/95 text-primary-foreground rounded-full w-fit"
              >
                Empresa
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold tracking-tight text-foreground/90">
                      Nombre de la Empresa o Equipo
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Inmobiliaria Sur"
                        {...field}
                        disabled={!isAdmin || isPending}
                        className="rounded-lg h-10"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold tracking-tight text-foreground/90">
                      Identificador Único (Slug)
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="inmobiliaria-sur"
                        {...field}
                        disabled={!isAdmin || isPending}
                        className="rounded-lg h-10"
                      />
                    </FormControl>
                    <FormDescription className="text-[10px] text-muted-foreground/70">
                      Se usará para enlaces públicos. Solo minúsculas, números y guiones.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isAdmin && (
                <div className="pt-4 border-t border-border/50 flex justify-end mt-6">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="rounded-lg shadow-sm px-6 h-10"
                  >
                    {isPending ? (
                      <>
                        <HugeiconsIcon
                          icon={Loading02Icon}
                          className="mr-2 h-4 w-4 animate-spin text-primary-foreground"
                        />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <HugeiconsIcon
                          icon={FloppyDiskIcon}
                          className="mr-2 h-4 w-4 text-primary-foreground"
                        />{' '}
                        Guardar cambios
                      </>
                    )}
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      {isPersonal && isAdmin && (
        <Card className="border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-xl shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={StarIcon}
                className="h-5 w-5 text-indigo-600 dark:text-indigo-400"
              />
              <CardTitle className="text-indigo-600 dark:text-indigo-400 text-lg font-bold tracking-tight">
                Transformar a Cuenta Empresa
              </CardTitle>
            </div>
            <CardDescription className="text-muted-foreground/90 text-xs">
              Desbloquea la capacidad de invitar a vendedores y colaboradores a tu equipo de loteos.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              variant="outline"
              className="border-indigo-500/30 hover:bg-indigo-500/10 hover:border-indigo-500/40 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs"
            >
              Mejorar Plan (Próximamente)
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
