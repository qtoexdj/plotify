import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { updateLotAndRecord } from '@/lib/services/lots.service'

export const dynamic = 'force-dynamic'

const nullableString = z
  .preprocess((value) => (value === '' ? null : value), z.string().nullable())
  .optional()

const nullableEmail = z
  .preprocess((value) => (value === '' ? null : value), z.string().email().nullable())
  .optional()

const nullableUuid = z
  .preprocess((value) => (value === '' ? null : value), z.string().uuid().nullable())
  .optional()

const nullableNumber = z
  .preprocess((value) => {
    if (value === '' || value === null || value === undefined) return null
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isNaN(parsed) ? value : parsed
  }, z.number().nullable())
  .optional()

const nullableDate = z
  .preprocess((value) => (value === '' ? null : value), z.string().nullable())
  .optional()

const lotSchema = z.object({
  numero_lote: z.string().min(1).optional(),
  estado: z.enum(['disponible', 'reservado', 'vendido']).optional(),
  observaciones: nullableString,
  vendedor_id: nullableUuid,
  precio: nullableNumber,
  reserved_at: nullableDate,
  sold_at: nullableDate,
})

const recordSchema = z.object({
  cliente_nombre: nullableString,
  cliente_run: nullableString,
  cliente_direccion: nullableString,
  cliente_estado_civil: nullableString,
  cliente_ocupacion: nullableString,
  cliente_telefono: nullableString,
  cliente_email: nullableEmail,
  valor: nullableNumber,
  abono: nullableNumber,
  detalle_deuda: nullableString,
  firma_estado: nullableString,
  firma_fecha: nullableDate,
  firma_lugar: nullableString,
  gasto_notaria: nullableNumber,
  gasto_cbr: nullableNumber,
  gasto_abogado: nullableNumber,
  cbr_estado: nullableString,
  cbr_numero_petitorio: nullableString,
  cbr_fecha_salida_estimada: nullableDate,
  cbr_reparo: nullableString,
  comision_monto: nullableNumber,
  comision_pagada_at: nullableDate,
})

const payloadSchema = z.object({
  lot: lotSchema.optional(),
  record: recordSchema.optional(),
})

const pruneUndefined = <T extends Record<string, unknown>>(input: T | null | undefined) => {
  if (!input) return null
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; lotId: string }> }
) {
  try {
    const { lotId } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = payloadSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: 'Payload inválido', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const lotUpdates = pruneUndefined(parsed.data.lot)
    const recordUpdates = pruneUndefined(parsed.data.record)
    const hasLotUpdates = lotUpdates && Object.keys(lotUpdates).length > 0
    const hasRecordUpdates = recordUpdates && Object.keys(recordUpdates).length > 0

    if (!hasLotUpdates && !hasRecordUpdates) {
      return Response.json(
        { error: 'No hay campos para actualizar' },
        { status: 400 }
      )
    }

    const result = await updateLotAndRecord(
      lotId,
      hasLotUpdates ? lotUpdates : null,
      hasRecordUpdates ? recordUpdates : null
    )

    return Response.json({
      lot: result.lot,
      record: result.record,
    })
  } catch (error) {
    console.error('Error in PATCH /api/projects/[id]/lots/[lotId]:', error)
    return Response.json(
      { error: 'Error al actualizar lote' },
      { status: 500 }
    )
  }
}
