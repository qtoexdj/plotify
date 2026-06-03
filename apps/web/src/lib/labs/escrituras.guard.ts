import { NextResponse } from 'next/server'

export function isEscriturasLabEnabled() {
  return (
    process.env.NODE_ENV !== 'production' && process.env.PLOTIFY_ENABLE_ESCRITURAS_LAB === 'true'
  )
}

export function disabledEscriturasLabResponse() {
  return NextResponse.json(
    {
      error:
        'Laboratorio de escrituras deshabilitado. Define PLOTIFY_ENABLE_ESCRITURAS_LAB=true en entorno local/desarrollo.',
    },
    { status: 404 }
  )
}
