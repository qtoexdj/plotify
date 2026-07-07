import type { Control, FieldValues, Path } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { formatRut } from '@/lib/validations/lot-reservation.schema'

interface ClienteIdentificacionProps<T extends FieldValues> {
  control: Control<T>
}

/** Compartida entre reserva y venta (T041): nombre, RUT y datos personales. */
export function ClienteIdentificacion<T extends FieldValues>({
  control,
}: ClienteIdentificacionProps<T>) {
  return (
    <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Identificación</p>
        <p className="text-xs text-muted-foreground">Datos legales del comprador.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          control={control}
          name={'cliente_nombre' as Path<T>}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Nombre completo</FormLabel>
              <FormControl>
                <Input placeholder="Juan Pérez" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'cliente_run' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>RUT</FormLabel>
              <FormControl>
                <Input
                  placeholder="12.345.678-9"
                  {...field}
                  onChange={(e) => field.onChange(formatRut(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'cliente_nacionalidad' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nacionalidad</FormLabel>
              <FormControl>
                <Input placeholder="Chilena" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'cliente_estado_civil' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado civil</FormLabel>
              <FormControl>
                <Input placeholder="Soltero/a" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'cliente_ocupacion' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ocupación</FormLabel>
              <FormControl>
                <Input placeholder="Arquitecto" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </section>
  )
}
