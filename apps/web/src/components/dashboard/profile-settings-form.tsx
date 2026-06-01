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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import type { Profile } from '@/types/database.types'
import { updateProfileAction } from '@/app/(dashboard)/settings/profile/actions'
import imageCompression from 'browser-image-compression'
import { createClient } from '@/lib/supabase/client'
import { HugeiconsIcon } from '@hugeicons/react'
import { Camera01Icon, Loading02Icon, FloppyDiskIcon } from '@hugeicons/core-free-icons'

const profileFormSchema = z.object({
  first_name: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(50, 'Máximo 50 caracteres')
    .optional()
    .or(z.literal('')),
  last_name: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(50, 'Máximo 50 caracteres')
    .optional()
    .or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  username: z
    .string()
    .min(2, 'El nombre de usuario debe tener al menos 2 caracteres.')
    .max(30, 'El nombre de usuario no puede tener más de 30 caracteres.'),
  website: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
})

interface ProfileSettingsFormProps {
  profile: Profile
  email: string
}

export function ProfileSettingsForm({ profile, email }: ProfileSettingsFormProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const supabase = createClient()

  const form = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || '',
      username: profile.username || '',
      website: profile.website || '',
    },
  })

  async function onSubmit(values: z.infer<typeof profileFormSchema>) {
    setIsPending(true)
    const result = await updateProfileAction(profile.id, {
      first_name: values.first_name || null,
      last_name: values.last_name || null,
      phone: values.phone || null,
      username: values.username || null,
      website: values.website || null,
      // avatar_url is omitted here, as it's updated directly on upload
    })
    setIsPending(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Perfil actualizado exitosamente.')
      router.refresh()
    }
  }

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploadingAvatar(true)

    try {
      // Options for browser-image-compression
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      }

      const compressedFile = await imageCompression(file, options)

      // Upload compressed image to Supabase storage
      const fileName = `${profile.id}-${Math.random().toString(36).substring(7)}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, compressedFile, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) throw uploadError

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(fileName)

      // Update user profile with new avatar URL
      const formValues = form.getValues()
      const result = await updateProfileAction(profile.id, {
        first_name: formValues.first_name || null,
        last_name: formValues.last_name || null,
        phone: formValues.phone || null,
        username: formValues.username || null,
        website: formValues.website || null,
        avatar_url: publicUrl,
      })

      if (result.error) throw new Error(result.error)

      toast.success('Foto de perfil actualizada exitosamente.')
      router.refresh()
    } catch (error) {
      console.error('Avatar upload exception caught:', error)
      toast.error('Error al actualizar la foto de perfil. Revisa la consola.')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const initials = (
    profile.first_name?.charAt(0) ||
    profile.username?.charAt(0) ||
    'U'
  ).toUpperCase()

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
      {/* Columna Izquierda: Foto y Cuenta (Bento Grid Panel 1) */}
      <div className="md:col-span-1 space-y-6 flex flex-col">
        {/* Tarjeta 1: Foto de Perfil */}
        <Card className="shadow-xs border-border/60 bg-card/65 backdrop-blur-xs rounded-xl flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-lg font-bold tracking-tight">Foto de Perfil</CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">
              Visible en navegación y paneles de Plotify.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center text-center gap-6 py-6">
            <Avatar className="h-28 w-28 border-2 border-primary/20 dark:border-primary/10 shadow-lg rounded-full shrink-0 transition-transform duration-300 hover:scale-105">
              <AvatarImage src={profile.avatar_url || ''} className="rounded-full object-cover" />
              <AvatarFallback className="rounded-full bg-primary/10 text-primary font-bold text-4xl">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex flex-col items-center gap-3">
              <Button
                variant="outline"
                className="relative overflow-hidden w-fit rounded-lg hover:bg-muted transition-colors duration-200 shadow-3xs text-xs h-9"
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? (
                  <>
                    <HugeiconsIcon
                      icon={Loading02Icon}
                      className="mr-2 h-4 w-4 animate-spin text-muted-foreground"
                    />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <HugeiconsIcon
                      icon={Camera01Icon}
                      className="mr-2 h-4 w-4 text-muted-foreground"
                    />
                    Subir nueva foto
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  onChange={handleAvatarUpload}
                  disabled={isUploadingAvatar}
                />
              </Button>
              <p className="text-[10px] leading-relaxed text-muted-foreground/80 max-w-[180px]">
                JPG, PNG o WebP. Máximo 5MB (comprimido automáticamente).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tarjeta 2: Cuenta y Acceso */}
        <Card className="shadow-xs border-border/60 bg-card/65 backdrop-blur-xs rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold tracking-tight">Cuenta y Acceso</CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">
              Identidad asociada a la cuenta activa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-tight text-foreground/85">
                Correo Electrónico
              </span>
              <Input
                value={email}
                disabled
                className="bg-muted/40 border-border/60 cursor-not-allowed rounded-lg text-xs h-9"
              />
              <span className="text-[10px] text-muted-foreground/80 font-medium">
                No editable directamente.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Columna Derecha: Información Personal (Bento Grid Panel 2) */}
      <div className="md:col-span-2">
        <Card className="shadow-xs border-border/60 bg-card/65 backdrop-blur-xs rounded-xl h-full">
          <CardHeader>
            <CardTitle className="text-lg font-bold tracking-tight">Información Personal</CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">
              Actualiza tus datos públicos y de contacto personal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold tracking-tight text-foreground/90">
                            Nombre
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ej: Matias"
                              {...field}
                              disabled={isPending}
                              className="rounded-lg h-10"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold tracking-tight text-foreground/90">
                            Apellido
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ej: Burgos"
                              {...field}
                              disabled={isPending}
                              className="rounded-lg h-10"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold tracking-tight text-foreground/90">
                            Nombre de Usuario
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ej: matias"
                              {...field}
                              disabled={isPending}
                              className="rounded-lg h-10"
                            />
                          </FormControl>
                          <FormDescription className="text-[10px] text-muted-foreground/70">
                            Tu identificador único en la plataforma.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold tracking-tight text-foreground/90">
                            Teléfono de Contacto
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="+56 9 1234 5678"
                              {...field}
                              disabled={isPending}
                              type="tel"
                              className="rounded-lg h-10"
                            />
                          </FormControl>
                          <FormDescription className="text-[10px] text-muted-foreground/70">
                            Mismo número de los leads entrantes.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold tracking-tight text-foreground/90">
                          Sitio Web (Opcional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://tu-sitio.com"
                            {...field}
                            disabled={isPending}
                            className="rounded-lg h-10"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
