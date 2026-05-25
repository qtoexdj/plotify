# Server Actions

**Tag:** #frontend #acciones
**Relacionado:** [[00 - Home]], [[Servicios lib-services]], [[Patrones de Diseno]]

---

## Vision general

9 archivos en `src/actions/` que manejan mutaciones del lado del servidor. Cada action valida input con Zod, llama al servicio correspondiente, y retorna resultado.

## Lista de actions

| Action | Responsabilidad |
|--------|----------------|
| agent-skills.action.ts | Toggle/config habilidades del agente |
| complete-onboarding.action.ts | Finaliza wizard de onboarding, crea proyecto |
| documents.action.ts | Genera documentos para un lote |
| invite-vendor.action.ts | Invita vendedor a la plataforma |
| lot-process.action.ts | Cambia etapa de proceso del lote |
| lot-verification.action.ts | Marca lote como verificado |
| request-approval.action.ts | Solicita aprobacion de reserva |
| reserve-lot.action.ts | Reserva un lote (usa RPC atomico) |
| vendor-actions.action.ts | Acciones de gestion de vendors |

## Patron de implementacion

1. Recibe input del formulario.
2. Valida con schema Zod.
3. Si valida, llama al service correspondiente.
4. Si falla, retorna error con mensaje.
5. Si ok, revalida cache o redirige.

## Ejemplo: reserve-lot.action.ts

- Valida lote ID y datos del comprador.
- Llama a `reserve_lot` RPC de la DB (procedimiento atomico con FOR UPDATE lock).
- Crea `lot_record` automatico via trigger.
- Registra en `audit_logs`.
- Retorna exito o error.

## Relacionado
- [[Servicios lib-services]] — Servicios que consumen las actions
- [[Patrones de Diseno]] — Patron de Server Actions para mutaciones
- [[Procedimientos Atomicos]] — reserve_lot RPC
