# Validaciones Zod

**Tag:** #frontend #validacion
**Relacionado:** [[00 - Home]], [[Convenciones de Codigo]], [[Como Agregar un Feature]], [[Server Actions]]

---

## Vision general

5 schemas Zod en `src/lib/validations/` que validan toda entrada de usuario antes de procesar.

---

## approval-request.schema.ts

Schemas para solicitudes de aprobacion de reserva. Usado por el viewer form y la API del agente IA.

**Exports:**
- `approvalRequestSchema` — Schema completo con datos del vendedor, cliente, y validacion de RUT chileno (formato + digito verificador via `validateRut`).
- `reservationFormSchema` — Schema simplificado para el formulario del viewer (solo datos del cliente; info del vendedor se resuelve server-side).

---

## lot-reservation.schema.ts

Validacion de RUT y schema de reserva de lote.

**Exports:**
- `validateRut(rut: string): boolean` — Implementa algoritmo modulo-11 de RUT chileno.
- `formatRut(rut: string): string` — Formatea RUT con puntos y guion (ej: `12.345.678-9`).
- `lotReservationSchema` — Schema completo: nombre, RUT, direccion, estado civil, ocupacion, email, telefono, fecha, notaria, valor de reserva.
- `LotReservationInput` — Tipo TypeScript inferido.

---

## lot-update.schema.ts

Schema para actualizaciones parciales de lotes.

**Exports:**
- `lotUpdateSchema` — Permite updates opcionales de: `precio`, `valor_reserva`, `m2`, `observaciones`, `vendedor_id`, `servidumbre_m2`, `servidumbre_ancho_m`, `numero_lote`. Usa `.strict()` para rechazar campos no declarados.

---

## lot-verification.schema.ts

Schemas para verificacion de limites de lotes y override oficial.

**Exports:**
- `officialBoundariesSchema` — Array de boundaries (label, description, distancia, colinda, es_servidumbre, neighbors).
- `VerifiedStatusEnum` — Enum: `draft`, `verified_exact`, `verified_override`.
- `officialOverrideSchema` — Para guardar override oficial (projectId, lotId, area, servidumbre, boundaries).
- `markVerifiedSchema` — Para marcar lote como verificado, requiere area oficial, boundaries, y snapshot calculado de area/perimetro.

---

## process.schema.ts

Enum y schema para actualizar etapas de proceso.

**Exports:**
- `ProcessStageEnum` — Enum: `espera_firma_reserva`, `reserva_firmada`, `espera_firma_escritura`, `escritura_firmada`.
- `updateStageSchema` — Schema con projectId, lotId, newStage.

---

## Patron de uso

```
Formulario → Zod schema parse → si falla → error al usuario
→ si pasa → Server Action → Service → DB
```

## Relacionado
- [[Server Actions]] — Donde se usan estos schemas
- [[Convenciones de Codigo]] — Reglas de validacion
- [[Como Agregar un Feature]] — Paso 3: crear schema Zod
