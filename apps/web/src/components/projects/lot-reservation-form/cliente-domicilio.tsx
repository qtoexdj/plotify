'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Control, FieldValues, Path } from 'react-hook-form'
import { useWatch } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import {
  CHILE_COMMUNES_BY_REGION,
  CHILE_REGIONS,
  fetchChileRegions,
  fetchCommunesByRegion,
  type ChileRegion,
} from '@/lib/geo/chile-location'

interface ClienteDomicilioProps<T extends FieldValues> {
  control: Control<T>
  setValue: (name: Path<T>, value: string) => void
}

/** Compartida entre reserva y venta (T041): dirección, región y comuna.
 * En reserva son opcionales (reservationSchema); en venta, obligatorias
 * (saleSchema) — la validación la decide el schema, no este componente. */
export function ClienteDomicilio<T extends FieldValues>({
  control,
  setValue,
}: ClienteDomicilioProps<T>) {
  const [regions, setRegions] = useState<ChileRegion[]>(CHILE_REGIONS)
  const [fetchedCommunes, setFetchedCommunes] = useState<{
    regionCode: string
    items: string[]
  } | null>(null)

  const selectedRegionCode = useWatch({ control, name: 'cliente_region' as Path<T> }) as
    | string
    | undefined
  const selectedCommune = useWatch({ control, name: 'cliente_comuna' as Path<T> }) as
    | string
    | undefined

  const isLoadingCommunes =
    Boolean(selectedRegionCode) && fetchedCommunes?.regionCode !== selectedRegionCode
  const communes = useMemo(() => {
    if (!selectedRegionCode) return []
    if (fetchedCommunes && fetchedCommunes.regionCode === selectedRegionCode) {
      return fetchedCommunes.items
    }
    return CHILE_COMMUNES_BY_REGION[selectedRegionCode] ?? []
  }, [selectedRegionCode, fetchedCommunes])

  const communeOptions =
    selectedCommune && !communes.includes(selectedCommune)
      ? [selectedCommune, ...communes]
      : communes

  useEffect(() => {
    let isMounted = true

    fetchChileRegions()
      .then((items) => {
        if (!isMounted) return
        setRegions(items)
      })
      .catch(() => {
        if (!isMounted) return
        setRegions(CHILE_REGIONS)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedRegionCode) return

    let isMounted = true

    fetchCommunesByRegion(selectedRegionCode)
      .then((items) => {
        if (!isMounted) return
        setFetchedCommunes({ regionCode: selectedRegionCode, items })
      })
      .catch(() => {
        if (!isMounted) return
        setFetchedCommunes({ regionCode: selectedRegionCode, items: [] })
      })

    return () => {
      isMounted = false
    }
  }, [selectedRegionCode])

  return (
    <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Domicilio</p>
        <p className="text-xs text-muted-foreground">
          Dirección civil y ubicación administrativa.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          control={control}
          name={'cliente_direccion' as Path<T>}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Dirección</FormLabel>
              <FormControl>
                <Input placeholder="Av. Siempre Viva 123" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'cliente_region' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Región</FormLabel>
              <Select
                value={field.value as string}
                onValueChange={(value) => {
                  field.onChange(value)
                  setValue('cliente_comuna' as Path<T>, '')
                }}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona región" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.code} value={region.code}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'cliente_comuna' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Comuna</FormLabel>
              <Select
                value={field.value as string}
                onValueChange={field.onChange}
                disabled={!selectedRegionCode || communeOptions.length === 0}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={isLoadingCommunes ? 'Cargando comunas...' : 'Selecciona comuna'}
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {communeOptions.map((commune) => (
                    <SelectItem key={commune} value={commune}>
                      {commune}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </section>
  )
}
