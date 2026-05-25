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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Perfil del Workspace</CardTitle>
              <CardDescription>
                Administra la identidad y preferencias de tu entorno de trabajo.
              </CardDescription>
            </div>
            {isPersonal ? (
              <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-200">
                Cuenta Independiente
              </Badge>
            ) : (
              <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                Empresa
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la Empresa o Equipo</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Inmobiliaria Sur"
                        {...field}
                        disabled={!isAdmin || isPending}
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
                    <FormLabel>Identificador Único (Slug)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="inmobiliaria-sur"
                        {...field}
                        disabled={!isAdmin || isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      Se usará para enlaces públicos. Solo minúsculas, números y guiones.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isAdmin && (
                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <Button type="submit" disabled={isPending}>
                    {isPending ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      {isPersonal && isAdmin && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="text-blue-800">Transformar a Cuenta Empresa</CardTitle>
            <CardDescription className="text-blue-700/80">
              Desbloquea la capacidad de invitar a vendedores y colaboradores a tu equipo.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" className="text-blue-700 border-blue-300 hover:bg-blue-100">
              Mejorar Plan (Próximamente)
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
