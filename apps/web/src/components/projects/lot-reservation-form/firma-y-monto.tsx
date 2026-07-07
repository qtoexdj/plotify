import type { Control, FieldValues, Path } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

interface FirmaYMontoProps<T extends FieldValues> {
  control: Control<T>
}

/** Solo venta (T041, saleSchema): fecha y notaría de firma + valor final.
 * La reserva no pide estos datos (research R7); su monto se muestra aparte. */
export function FirmaYMonto<T extends FieldValues>({ control }: FirmaYMontoProps<T>) {
  return (
    <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Firma y monto</p>
        <p className="text-xs text-muted-foreground">
          Condiciones para solicitar la aprobación de la venta.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          control={control}
          name={'fecha' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de firma</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'notaria' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notaría</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Notaría Santiago" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'valor_reserva' as Path<T>}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Valor final venta ($)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="500000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </section>
  )
}
