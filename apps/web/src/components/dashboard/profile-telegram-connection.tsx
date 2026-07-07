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
import { updateTelegramChatIdAction } from '@/app/(dashboard)/settings/profile/actions'
import { generateTelegramTokenAction } from '@/app/(dashboard)/agente/integrations/actions'
import { HugeiconsIcon } from '@hugeicons/react'
import { TelegramIcon, CheckmarkCircle02Icon, Link01Icon } from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'

const formSchema = z.object({
  telegram_chat_id: z
    .string()
    .refine((val) => val === '' || /^\d+$/.test(val), {
      message: 'El Chat ID debe ser un número entero (ej: 123456789).',
    })
    .optional()
    .or(z.literal('')),
})

interface ProfileTelegramConnectionProps {
  userId: string
  telegramChatId: string | null
  botUsername: string | null
  organizationId: string | null
}

export function ProfileTelegramConnection({
  userId,
  telegramChatId,
  botUsername,
  organizationId,
}: ProfileTelegramConnectionProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      telegram_chat_id: telegramChatId || '',
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsPending(true)
    const result = await updateTelegramChatIdAction(userId, values.telegram_chat_id || null)
    setIsPending(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(
        values.telegram_chat_id
          ? 'Chat ID de Telegram guardado exitosamente.'
          : 'Telegram desvinculado exitosamente.'
      )
      router.refresh()
    }
  }

  async function handleDisconnect() {
    setIsPending(true)
    const result = await updateTelegramChatIdAction(userId, null)
    setIsPending(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Telegram desvinculado exitosamente.')
      form.reset({ telegram_chat_id: '' })
      router.refresh()
    }
  }

  async function handleGenerateLink() {
    setIsGeneratingLink(true)
    try {
      const result = await generateTelegramTokenAction(userId, organizationId || undefined)
      if (result.error || !result.deep_link) {
        toast.error(result.error || 'No se pudo generar el enlace de vinculación.')
        return
      }
      window.open(result.deep_link, '_blank', 'noopener,noreferrer')
    } finally {
      setIsGeneratingLink(false)
    }
  }

  const isConnected = !!telegramChatId

  return (
    <Card className="shadow-xs border-border/60 bg-card/65 backdrop-blur-xs rounded-xl h-full">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
          <HugeiconsIcon icon={TelegramIcon} className="h-5 w-5 text-[#229ED9]" />
          Conectar con Telegram
        </CardTitle>
        <CardDescription className="text-muted-foreground/80">
          Vincula tu Telegram para recibir notificaciones en tiempo real, alertas de minutas y
          aprobaciones operativas directo a tu chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Estado actual */}
        <div className="rounded-lg border border-border/40 p-4 bg-muted/30">
          <h4 className="text-xs font-semibold text-foreground/90 uppercase tracking-wider mb-2">
            Estado del Canal
          </h4>
          {isConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-semibold text-foreground/80">Vinculado exitosamente</p>
                  <p className="text-xs text-muted-foreground">ID: {telegramChatId}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={isPending}
                className="rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive h-8 border-destructive/20"
              >
                Desconectar
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No vinculado a Telegram.</p>
            </div>
          )}
        </div>

        {/* 1. Vinculación automática si hay bot de la org */}
        {botUsername ? (
          <div className="space-y-3 p-4 rounded-lg border border-[#229ED9]/15 bg-[#229ED9]/5">
            <h4 className="text-sm font-semibold text-[#229ED9] flex items-center gap-1.5">
              <HugeiconsIcon icon={Link01Icon} className="h-4 w-4" />
              Vinculación automática en 1 clic
            </h4>
            <p className="text-xs text-foreground/80 leading-relaxed">
              Haz clic en el siguiente enlace para abrir el bot oficial de tu organización en
              Telegram y presiona <strong>Iniciar (Start)</strong>. Esto vinculará tu cuenta
              automáticamente.
            </p>
            <Button
              type="button"
              onClick={handleGenerateLink}
              disabled={isPending || isGeneratingLink}
              className="w-full bg-[#229ED9] hover:bg-[#229ED9]/95 text-white rounded-lg h-9 text-xs"
            >
              {isGeneratingLink ? (
                <Spinner className="h-4 w-4" />
              ) : (
                'Abrir Telegram y Conectar'
              )}
            </Button>
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-warning/20 bg-warning/5 text-warning">
            <p className="text-xs leading-relaxed">
              <strong>Nota:</strong> Tu organización no tiene un Bot de Telegram configurado. Puedes
              ingresar tu Chat ID manualmente a continuación si tienes el ID de tu chat con el bot
              general.
            </p>
          </div>
        )}

        {/* 2. Vinculación manual */}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 pt-4 border-t border-border/40"
          >
            <FormField
              control={form.control}
              name="telegram_chat_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">
                    Vinculación Manual (Chat ID)
                  </FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        placeholder="Ej: 987654321"
                        {...field}
                        disabled={isPending}
                        className="rounded-lg h-10 flex-1"
                      />
                    </FormControl>
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="rounded-lg px-4 h-10 shrink-0"
                    >
                      {isPending ? <Spinner className="h-4 w-4" /> : 'Guardar'}
                    </Button>
                  </div>
                  <FormDescription className="text-[10px]">
                    Si conoces tu Chat ID de Telegram, puedes ingresarlo directamente para
                    vincularte de forma inmediata.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
