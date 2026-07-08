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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { registerTelegramBotAction } from '@/app/(dashboard)/settings/actions'
import { HugeiconsIcon } from '@hugeicons/react'
import { FloppyDiskIcon, TelegramIcon } from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'

const formSchema = z.object({
  token: z.string().min(10, {
    message: 'El Token de Telegram es obligatorio y debe tener formato válido.',
  }),
  username: z.string().min(3, {
    message: 'El nombre de usuario del bot es obligatorio (ej: PlotifyBot).',
  }),
})

interface WorkspaceTelegramBotFormProps {
  orgId: string
  isAdmin: boolean
  initialBot: {
    bot_username: string
    is_active: boolean
  } | null
}

export function WorkspaceTelegramBotForm({
  orgId,
  isAdmin,
  initialBot,
}: WorkspaceTelegramBotFormProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      token: '', // El token se mantiene en blanco por seguridad; sólo se ingresa para crear/actualizar
      username: initialBot?.bot_username || '',
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!isAdmin) {
      toast.error('No tienes permisos de administrador para realizar esta acción.')
      return
    }

    setIsPending(true)
    const result = await registerTelegramBotAction(orgId, values)
    setIsPending(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Bot de Telegram registrado exitosamente.')
      form.reset({ token: '', username: values.username })
      router.refresh()
    }
  }

  return (
    <Card className="shadow-xs border-border/60 bg-card/65 backdrop-blur-xs rounded-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
          <HugeiconsIcon icon={TelegramIcon} className="h-5 w-5 text-[#229ED9]" />
          Bot de Telegram de la Organización
        </CardTitle>
        <CardDescription className="text-muted-foreground/80">
          Registra el Bot de Telegram de tu organización para permitir la auto-vinculación de los
          miembros y el envío de notificaciones y minutas automáticas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 rounded-lg border border-border/40 p-4 bg-muted/30">
          <h4 className="text-xs font-semibold text-foreground/90 uppercase tracking-wider mb-2">
            Estado de Conexión
          </h4>
          {initialBot ? (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <p className="text-sm font-medium text-foreground/80">
                Bot Activo:{' '}
                <span className="font-semibold text-[#229ED9]">@{initialBot.bot_username}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-warning" />
              <p className="text-sm font-medium text-foreground/80">
                Sin bot registrado. Los flujos de Telegram no se enviarán hasta registrar un bot.
              </p>
            </div>
          )}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Username del Bot</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: MiEmpresaPlotifyBot"
                        {...field}
                        disabled={!isAdmin || isPending}
                        className="rounded-lg h-10"
                      />
                    </FormControl>
                    <FormDescription className="text-[10px]">
                      El nombre de usuario del bot en Telegram (sin el símbolo @).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Bot Token (HTTP API)</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={
                          initialBot
                            ? '••••••••••••••••••••••••'
                            : 'Ingresa el token provisto por BotFather'
                        }
                        {...field}
                        disabled={!isAdmin || isPending}
                        className="rounded-lg h-10"
                      />
                    </FormControl>
                    <FormDescription className="text-[10px]">
                      Token de acceso HTTP API del bot de Telegram. Se almacena encriptado de forma
                      segura.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isAdmin && (
              <div className="pt-4 border-t border-border/50 flex justify-end">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg shadow-sm px-6 h-10"
                >
                  {isPending ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Guardando bot...
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon
                        icon={FloppyDiskIcon}
                        className="mr-2 h-4 w-4 text-primary-foreground"
                      />{' '}
                      {initialBot ? 'Actualizar Bot' : 'Registrar Bot'}
                    </>
                  )}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
