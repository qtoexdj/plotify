---
title: SDD 016 Pipeline Remediacion UX - Handoff
aliases:
  - SDD 016 Remediacion Venta-Escritura
  - Camino Guiado y Verificacion Masiva
date: 2026-07-07
status: implementado tecnicamente, HG-2 aprobado, HG-3 pendiente
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - legal
  - ventas
  - telegram
  - seguridad
related:
  - "[[SDD 011 Venta-Escritura - Handoff]]"
  - "[[SDD 010 Mesa de Escritura - Handoff]]"
  - "[[SDD 008 Creador de Matriz - Handoff]]"
  - "[[Seguridad Backend]]"
  - "[[Integraciones Telegram WhatsApp]]"
  - "[[Storage Buckets]]"
---

# SDD 016 Pipeline Remediacion UX - Handoff

## Estado

Implementado tecnicamente en `specs/016-pipeline-remediacion-ux`. T001-T073
cerrados (todos con su `Verify:` en verde). Quedan T080-T082: esta nota
(T080), T081 (correr todos los gates juntos) y T082 (HG-3, sesion de
usabilidad real — la marca el usuario).

HG-1 (destino de entrega admin+vendedor, delta sin auto-aprobacion) e HG-2
(migracion de seguridad + limpieza de datos de prueba de Teno) ya fueron
aprobados y aplicados por el usuario durante esta implementacion.

## Alcance implementado

**US1 — Pipeline de punta a punta (P1, MVP)**
- El puente operacional ya no revienta con orgs sin `organization_payment_info`
  (`_safe_data` defensivo) ni con `maybe_single()` de fila opcional.
- `comprador.nacionalidad/region/comuna` se mapean desde `lot_records` al
  puente y llegan hasta `variable_resolutions`.
- Aprobar la matriz del proyecto recomputa el snapshot de todos los casos
  `variables_pending` del proyecto.
- Revision juridica visible como paso propio en la mesa (`documento.abogado_redactor.*`
  materializable antes de aprobar), con endpoint dedicado y auditoria en
  `legal_review_decisions`.
- Entrega de minuta: admin(s) siempre + vendedor si tiene Telegram, una fila
  por destinatario, nunca `sent` con `recipient_user_id` nulo (estado
  `unavailable` en su lugar).

**US2 — Molde en un clic (P2)**
- Flujo de 3 pasos (bulk-approve confianza≥0.9 con evidencia → submit →
  approve) con dialogo de confirmacion.
- Gates heredados del proyecto (titulo/SAG/SII) se marcan `inherited` y no
  cuentan como pendientes del caso — la mesa de venta baja de ~35 a ≤2
  pendientes reales (SC-002).

**US3 — Reserva/venta con prefill + delta + estado de lote (P2)**
- `reservationSchema` (liviano) vs `saleSchema` (estricto) separados;
  `LotReservationForm` descompuesto en secciones compartidas.
- Vender un lote `reservado` precarga los datos de la reserva con aviso
  "Datos cargados desde la reserva" y foco en el primer campo vacio.
- Notificacion de aprobacion muestra el delta (valor final) cuando
  `sale_mode='reserved'` y el RUT coincide, en vez del formulario completo.
  Auto-aprobacion queda OFF por default (HG-1).
- Maquina de estados server-side para `lots.estado`
  (`apps/web/src/lib/models/lot-transitions.ts`): transiciones invalidas
  rechazadas antes de escribir en DB; liberar un lote limpia
  `reserved_at`/`sold_at`/`vendedor_id` y audita.
- Bulk-update de lotes valida `response.ok`; se elimino la UI de "cambiar
  estado masivo" del panel de seleccion multiple (accion muerta: el endpoint
  destino nunca acepto `estado`).

**US4 — Camino guiado + configuracion + roles (P2)**
- Checklist de preparacion en la vista general del proyecto
  (Documentos/Titulo/Variables/Molde/Lotes/Ventas) con estado real derivado
  de datos existentes y CTA por paso, no de un flag fijo.
- Configuracion → Workspace: pantalla de datos de organizacion para
  escrituras (razon social, RUT, banco/cuenta, abogado redactor, mandatario
  por defecto) y registro del bot de Telegram de la organizacion.
- Configuracion → Perfil: vinculacion de Telegram con deep-link de un solo
  uso (token efimero en Redis via el endpoint interno `/users/telegram-token`,
  reutilizado desde su implementacion previa en `/agente/integrations`).
- Sidebar oculta Escrituras (Mesa/Plantillas) y Vendedores al rol `user`,
  con guard server-side en las rutas (no solo ocultar el link).
- Aviso "lote no verificado" en el panel del lote antes de vender.

**US5 — Verificacion masiva de lotes (P2)**
- `POST /projects/{projectId}/lots/bulk-verify`: compara superficie/perimetro
  calculado (UTM + Shoelace) contra los valores oficiales de cada lote con
  geometria, marca `verified_exact` dentro de tolerancia (default 0,5%) con
  auditoria, deja el resto para revision manual.
- Boton "Verificar coincidencias" en la pestaña Lotes con resumen N
  verificados / M desviados / K sin plano y enlace directo al lote desviado
  en el visor (`?lotId=` preselecciona el lote al llegar).

**US6 — Seguridad (gate de piloto, HG-2)**
- `REVOKE EXECUTE` de `decrypt_credential`/`get_decrypted_bot_token`/
  `get_mcp_credentials` a `anon`/`authenticated` (la migracion baseline las
  otorgaba indebidamente).
- Bucket `project-files` pasado a privado; todo acceso via
  `/api/files/[...path]`, que valida membresia de organizacion (para ambos
  buckets, `project-files` y `documents`) antes de emitir una URL firmada de
  60s.
- RLS habilitado en `checkpoint_*`/`dead_letter_queue` (exclusivas de
  `service_role`), con politica `service_role_full_access` explicita.

**US7 — Salud de codigo (P3)**
- Codigo muerto eliminado (`generation-wizard.tsx`, `reserve-lot.action.ts`).
- `buildApprovalRequest` compartido entre `requestReservationApproval` y
  `requestSaleApproval` (elimina ~110 lineas duplicadas).
- Limpieza de `console.log` de debug y de los tests web fragiles heredados
  de la rama 015.
- Datos de prueba de Teno limpiados con OK explicito del usuario: lotes
  26/37/14 revertidos a `disponible` sin dueño (lot_records, approval_requests
  y escritura_cases de prueba eliminados). La minuta demo del lote 1 se dejo
  intacta a pedido del usuario, por ser el caso sembrado para demostrar la
  Mesa.

## Verificacion contra codigo real

Se revisaron manualmente todos los diffs de T051-T072 antes de commitear
(auditoria, no solo "correr los tests") y aparecieron tres bugs reales que
los tests existentes no cubrian:

1. **Hueco de autorizacion en `/api/files/[...path]`**: el chequeo de
   membresia de organizacion solo cubria el bucket `project-files`; el
   bucket `documents` (minutas de escritura) no tenia ningun chequeo, asi que
   cualquier usuario autenticado de cualquier organizacion podia pedir una
   URL firmada para el documento legal de otra organizacion si conocia la
   ruta. Corregido antes de aprobar HG-2.
2. **Deep-link de Telegram roto**: el boton "Abrir Telegram y Conectar"
   armaba `https://t.me/{bot}?start={userId}` directo, pero el bot valida el
   token contra un registro efimero en Redis (`tg_link:{token}`), no contra
   el `userId` crudo — cada clic hubiera fallado con "enlace invalido o
   expirado". Corregido reutilizando `generateTelegramTokenAction`.
3. **Enlace muerto tras verificacion masiva**: el boton "abrir panel de
   revision manual" de un lote desviado solo cambiaba de pestaña, sin
   seleccionar nada, porque el visor nunca leia `?lotId=`. Corregido.

Tambien se descubrio, al intentar aplicar las migraciones de seguridad, que
**ya estaban aplicadas en produccion** (`swkrnjdpnlrgxgotmfxy`) bajo otros
numeros de version (`20260707050138`/`20260707051012` en vez de
`20260706000200`/`20260707000100`) — contenido identico, aplicado
previamente por fuera del flujo `supabase db push` (probablemente via el MCP
de Supabase). Se reconcilio el historial con
`supabase migration repair --status reverted/applied` en vez de reintentar
el push (que hubiera fallado por `CREATE POLICY` duplicado).

## Pasadas y gates

- Cada tarea T001-T073 quedo verificada individualmente antes de marcarse
  `[x]` (una tarea por pasada, regla del repo).
- Gate final por pasada de auditoria: `pnpm typecheck:web`,
  `pnpm --filter web lint`, `pnpm build:web`, `pnpm test:api` (665 passed, 2
  skipped), `pnpm --filter web test` (819 passed), `pnpm verify:migrations`.
- T081 (correr todos los gates juntos como cierre formal) sigue pendiente de
  ejecutarse explicitamente.

## Reglas que quedan vigentes

- El motor de matriz/DOCX y la mesa de lectura siguen siendo los de SDD
  008/010; SDD 016 no introduce un renderer ni una superficie de lectura
  nueva.
- Auto-aprobacion de venta desde reserva coincidente sigue OFF por default
  (HG-1); solo se muestra el delta al admin.
- Todo acceso a Storage pasa por URLs firmadas de corta duracion via
  `/api/files/[...path]`; no debe reaparecer `getPublicUrl()` directo contra
  `project-files` ni `documents`.
- `decrypt_credential`, `get_decrypted_bot_token` y `get_mcp_credentials`
  solo deben ser invocables por `service_role`; cualquier migracion futura
  que las toque debe verificar que el `REVOKE` siga vigente.
- El checklist de preparacion del proyecto deriva su estado de datos reales
  (blockers de la matriz, `verified_status` de lotes, `estado` del proyecto);
  no debe volver a depender de un flag fijo.

## Pendiente humano

- **T081**: correr los 5 gates juntos como cierre formal (no solo por
  pasada individual).
- **T082 / HG-3**: sesion de usabilidad con un usuario nuevo real que valide
  SC-003 (configurar proyecto en ≤12 acciones), SC-004 (vender lote
  reservado en 2 actos reales) y SC-005 (usuario nuevo autosuficiente:
  conecta Telegram, carga datos de organizacion, sabe el siguiente paso via
  checklist). La marca el usuario, no el agente.

## Relacionado

- [[SDD 011 Venta-Escritura - Handoff]]
- [[SDD 010 Mesa de Escritura - Handoff]]
- [[SDD 008 Creador de Matriz - Handoff]]
- [[Seguridad Backend]]
- [[Integraciones Telegram WhatsApp]]
- [[Storage Buckets]]
