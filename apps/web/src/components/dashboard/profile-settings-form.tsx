"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"
import type { Profile } from "@/types/database.types"
import { updateProfileAction } from "@/app/(dashboard)/settings/profile/actions"
import imageCompression from "browser-image-compression"
import { createClient } from "@/lib/supabase/client"
import { Camera, Loader2, Save } from "lucide-react"

const profileFormSchema = z.object({
    first_name: z.string().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres").optional().or(z.literal('')),
    last_name: z.string().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres").optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    username: z.string()
        .min(2, "El nombre de usuario debe tener al menos 2 caracteres.")
        .max(30, "El nombre de usuario no puede tener más de 30 caracteres."),
    website: z.string().url("Debe ser una URL válida").optional().or(z.literal("")),
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
            first_name: profile.first_name || "",
            last_name: profile.last_name || "",
            phone: profile.phone || "",
            username: profile.username || "",
            website: profile.website || "",
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
            toast.success("Perfil actualizado exitosamente.")
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
                    upsert: true
                })

            if (uploadError) throw uploadError

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName)

            // Update user profile with new avatar URL
            const formValues = form.getValues()
            const result = await updateProfileAction(profile.id, {
                first_name: formValues.first_name || null,
                last_name: formValues.last_name || null,
                phone: formValues.phone || null,
                username: formValues.username || null,
                website: formValues.website || null,
                avatar_url: publicUrl
            })

            if (result.error) throw new Error(result.error)

            toast.success("Foto de perfil actualizada exitosamente.")
            router.refresh()
        } catch (error) {
            console.error('Avatar upload exception caught:', error)
            toast.error("Error al actualizar la foto de perfil. Revisa la consola.")
        } finally {
            setIsUploadingAvatar(false)
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Foto de Perfil</CardTitle>
                    <CardDescription>
                        Esta foto es pública y será visible para otros usuarios.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-6">
                    <Avatar className="h-24 w-24">
                        <AvatarImage src={profile.avatar_url || ""} />
                        <AvatarFallback className="text-2xl">
                            {profile.first_name?.charAt(0) || profile.username?.charAt(0) || "U"}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex flex-col gap-2">
                        <Button
                            variant="outline"
                            className="relative overflow-hidden w-fit"
                            disabled={isUploadingAvatar}
                        >
                            {isUploadingAvatar ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Subiendo...
                                </>
                            ) : (
                                <>
                                    <Camera className="mr-2 h-4 w-4" />
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
                        <p className="text-sm text-slate-500">
                            JPG, PNG o WebP. Máximo 5MB (será comprimida automáticamente).
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Información Personal</CardTitle>
                    <CardDescription>
                        Actualiza tus datos públicos y de contacto personal.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="first_name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nombre</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ej: Matias" {...field} disabled={isPending} />
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
                                            <FormLabel>Apellido</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ej: Burgos" {...field} disabled={isPending} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="username"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nombre de Usuario</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ej: matias" {...field} disabled={isPending} />
                                            </FormControl>
                                            <FormDescription>
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
                                            <FormLabel>Teléfono de Contacto</FormLabel>
                                            <FormControl>
                                                <Input placeholder="+56 9 1234 5678" {...field} disabled={isPending} type="tel" />
                                            </FormControl>
                                            <FormDescription>
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
                                        <FormLabel>Sitio Web (Opcional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="https://tu-sitio.com" {...field} disabled={isPending} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="pt-4 border-t border-slate-100 flex justify-end">
                                <Button type="submit" disabled={isPending}>
                                    {isPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="mr-2 h-4 w-4" /> Guardar cambios
                                        </>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>



            <Card>
                <CardHeader>
                    <CardTitle>Cuenta y Acceso</CardTitle>
                    <CardDescription>
                        Información asociada a tu identidad de la cuenta actual.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">Correo Electrónico</span>
                        <Input value={email} disabled className="bg-slate-50 cursor-not-allowed" />
                        <span className="text-xs text-slate-500">
                            No puedes cambiar tu correo electrónico directamente.
                        </span>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
