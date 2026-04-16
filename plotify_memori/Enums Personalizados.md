# Enums Personalizados

**Tag:** #db
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Tablas Core BD]]

---

## estado_lote

Estado basico del lote en el proyecto.

- `disponible` — Lote libre para reservar.
- `reservado` — Lote con reserva activa.
- `vendido` — Lote vendido completamente.

Usado en: `lots.estado`

## geometry_type

Tipo de geometria en el sistema.

- `lot` — Lote individual.
- `road` — Camino/via.
- `common_area` — Area comun.

Usado en: `geometries.geometry_type`

## source_type

Fuente del archivo de geometria.

- `kmz` — Archivo KMZ (ZIP con KML).
- `kml` — Archivo KML directo.

Usado en: `geometries.source_type`

## sale_state

Estado detallado del proceso de venta.

- `propuesta` — En negociacion/propuesta.
- `reservado` — Reserva confirmada.
- `vendido` — Venta completada.
- `cancelado` — Proceso cancelado.

Usado en: `lots.sale_state`

## org_role

Rol dentro de una organizacion.

- `admin` — Administrador de org.
- `user` — Usuario estandar (vendor).

Usado en: `organization_members.org_role`

## process_stage

Etapa del proceso de venta contractual.

- `espera_firma_reserva` — Pendiente firma de reserva.
- `reserva_firmada` — Reserva firmada.
- `espera_firma_escritura` — Pendiente firma de escritura.
- `escritura_firmada` — Escritura firmada (venta completa).

Usado en: `lots.process_stage`

## VerifiedStatus

Estado de verificacion del lote.

- Verificacion de geometria contra archivo original.
- Campos: `verified_status`, `verified_at`, `verified_by`.

## ApprovalStatus

Estado de solicitudes de aprobacion.

- `pending`, `approved`, `rejected`.

## VendorPlatform

Plataforma del vendedor.

- `telegram`, `whatsapp`, `web`, etc.

## Relacionado
- [[Tablas Core BD]] — Donde se usa cada enum
- [[Procedimientos Atomicos]] — Como reserve_lot usa estos enums
