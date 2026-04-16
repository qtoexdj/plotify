
import type { Lot, LotRecord, EstadoLote } from '@/types/database.types'

export type { Lot, LotRecord, EstadoLote }

export type LotWithRecord = Lot & { lot_records: LotRecord | null }

export interface LotRecordForm {
    numero_lote: string
    estado: EstadoLote
    observaciones: string
    vendedor_id: string
    cliente_nombre: string
    cliente_run: string
    cliente_direccion: string
    cliente_estado_civil: string
    cliente_ocupacion: string
    cliente_telefono: string
    cliente_email: string
    valor: string
    abono: string
    detalle_deuda: string
    firma_estado: string
    firma_fecha: string
    firma_lugar: string
    gasto_notaria: string
    gasto_cbr: string
    gasto_abogado: string
    cbr_estado: string
    cbr_numero_petitorio: string
    cbr_fecha_salida_estimada: string
    cbr_reparo: string
    comision_monto: string
    comision_pagada_at: string
}

export interface NewLotRecordForm {
    lot_id: string
    estado: EstadoLote
    vendedor_id: string
    cliente_nombre: string
    cliente_run: string
    cliente_direccion: string
    cliente_estado_civil: string
    cliente_ocupacion: string
    cliente_telefono: string
    cliente_email: string
    valor: string
    abono: string
    detalle_deuda: string
    firma_estado: string
    firma_fecha: string
    firma_lugar: string
    gasto_notaria: string
    gasto_cbr: string
    gasto_abogado: string
    cbr_estado: string
    cbr_numero_petitorio: string
    cbr_fecha_salida_estimada: string
    cbr_reparo: string
    comision_monto: string
    comision_pagada_at: string
}

export const emptyLotForm: LotRecordForm = {
    numero_lote: '',
    estado: 'disponible',
    observaciones: '',
    vendedor_id: '',
    cliente_nombre: '',
    cliente_run: '',
    cliente_direccion: '',
    cliente_estado_civil: '',
    cliente_ocupacion: '',
    cliente_telefono: '',
    cliente_email: '',
    valor: '',
    abono: '',
    detalle_deuda: '',
    firma_estado: '',
    firma_fecha: '',
    firma_lugar: '',
    gasto_notaria: '',
    gasto_cbr: '',
    gasto_abogado: '',
    cbr_estado: '',
    cbr_numero_petitorio: '',
    cbr_fecha_salida_estimada: '',
    cbr_reparo: '',
    comision_monto: '',
    comision_pagada_at: '',
}

export const emptyNewLotForm: NewLotRecordForm = {
    lot_id: '',
    estado: 'disponible',
    vendedor_id: '',
    cliente_nombre: '',
    cliente_run: '',
    cliente_direccion: '',
    cliente_estado_civil: '',
    cliente_ocupacion: '',
    cliente_telefono: '',
    cliente_email: '',
    valor: '',
    abono: '',
    detalle_deuda: '',
    firma_estado: '',
    firma_fecha: '',
    firma_lugar: '',
    gasto_notaria: '',
    gasto_cbr: '',
    gasto_abogado: '',
    cbr_estado: '',
    cbr_numero_petitorio: '',
    cbr_fecha_salida_estimada: '',
    cbr_reparo: '',
    comision_monto: '',
    comision_pagada_at: '',
}

export const currencyFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
})

export const formatCurrency = (value: number | null | undefined) => {
    if (!value && value !== 0) return '—'
    return currencyFormatter.format(value)
}

export const toDateInput = (value: string | null | undefined) => {
    if (!value) return ''
    return value.slice(0, 10)
}

export const buildCreateFormFromLot = (lot: LotWithRecord | null): NewLotRecordForm => {
    const record = lot?.lot_records
    return {
        lot_id: lot?.id ?? '',
        estado: lot?.estado ?? 'disponible',
        vendedor_id: lot?.vendedor_id ?? '',
        cliente_nombre: record?.cliente_nombre ?? '',
        cliente_run: record?.cliente_run ?? '',
        cliente_direccion: record?.cliente_direccion ?? '',
        cliente_estado_civil: record?.cliente_estado_civil ?? '',
        cliente_ocupacion: record?.cliente_ocupacion ?? '',
        cliente_telefono: record?.cliente_telefono ?? '',
        cliente_email: record?.cliente_email ?? '',
        valor: record?.valor != null ? record.valor.toString() : '',
        abono: record?.abono != null ? record.abono.toString() : '',
        detalle_deuda: record?.detalle_deuda ?? '',
        firma_estado: record?.firma_estado ?? '',
        firma_fecha: toDateInput(record?.firma_fecha),
        firma_lugar: record?.firma_lugar ?? '',
        gasto_notaria: record?.gasto_notaria != null ? record.gasto_notaria.toString() : '',
        gasto_cbr: record?.gasto_cbr != null ? record.gasto_cbr.toString() : '',
        gasto_abogado: record?.gasto_abogado != null ? record.gasto_abogado.toString() : '',
        cbr_estado: record?.cbr_estado ?? '',
        cbr_numero_petitorio: record?.cbr_numero_petitorio ?? '',
        cbr_fecha_salida_estimada: toDateInput(record?.cbr_fecha_salida_estimada),
        cbr_reparo: record?.cbr_reparo ?? '',
        comision_monto: record?.comision_monto != null ? record.comision_monto.toString() : '',
        comision_pagada_at: toDateInput(record?.comision_pagada_at),
    }
}
