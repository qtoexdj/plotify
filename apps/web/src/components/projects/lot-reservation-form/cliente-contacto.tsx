import type { Control, FieldValues, Path } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

interface ClienteContactoProps<T extends FieldValues> {
  control: Control<T>
}

/** Compartida entre reserva y venta (T041): canales de contacto. */
export function ClienteContacto<T extends FieldValues>({ control }: ClienteContactoProps<T>) {
  return (
    <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Contacto</p>
        <p className="text-xs text-muted-foreground">Canales para confirmar la gestión.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          control={control}
          name={'cliente_email' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="juan@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'cliente_telefono' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Teléfono</FormLabel>
              <FormControl>
                <Input placeholder="+569..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </section>
  )
}
