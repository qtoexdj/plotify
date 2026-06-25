---
title: SDD 011 Venta-Escritura - Handoff
aliases:
  - SDD 011 Venta a Escritura
  - Matriz del Proyecto y Borrador Automatico
date: 2026-06-16
status: implementado tecnicamente
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - legal
  - ventas
  - telegram
related:
  - "[[SDD 007 Escrituras Variable Resolution]]"
  - "[[SDD 008 Creador de Matriz - Handoff]]"
  - "[[SDD 010 Mesa de Escritura - Handoff]]"
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[Integraciones Telegram WhatsApp]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
---

# SDD 011 Venta-Escritura - Handoff

## Estado

Implementado tecnicamente en `specs/011-venta-escritura`. SDD 011 cierra el
ciclo operativo proyecto -> matriz aprobada -> venta validada -> borrador
automatico -> aceptacion -> entrega al vendedor.

El cierre de producto queda bloqueado por T026: sesion de usabilidad observada
del journey administrador (validar -> aceptar en menos de 5 minutos, sin
digitacion) y vendedor -> entrega. Ese gate humano debe aprobarlo el usuario y
registrarse en `specs/011-venta-escritura/quickstart.md`.

## Alcance implementado

- Matriz de escritura del proyecto sobre `escritura_matrices` con
  `escritura_case_id` nullable: scope proyecto aprobado una vez y luego usado
  como base de borradores por lote.
- Trazabilidad desde borrador de lote hacia matriz del proyecto via
  `source_project_matriz_id`, version de matriz, aprobador, venta, aceptacion y
  entregas.
- Enganche idempotente de venta validada en
  `apps/api/services/escritura_sale_hook.py`: crea o reutiliza el caso del lote,
  ejecuta el puente operacional y copia el borrador desde la matriz del
  proyecto aprobada.
- Camino sin matriz aprobada: la venta comercial se valida igual y la escritura
  queda en preparacion con pendiente humano accionable.
- Entrega auditada en `apps/api/services/escritura_delivery.py` y
  `escritura_deliveries`: enlace seguro vencible, Telegram best-effort y
  fallback web.
- Vista web `apps/web/src/app/(dashboard)/mis-documentos/` para que el vendedor
  vea solo sus borradores, descargue, comparta o renueve enlace vencido.
- Hub `apps/web/src/app/(dashboard)/documentos/page.tsx` con proyecto,
  matriz de escritura del proyecto, matriz de variables existente y actividad.
- Historial documental filtrable por proyecto en
  `apps/web/src/app/(dashboard)/documentos/historial/page.tsx`.
- Estados humanos unificados desde el diccionario unico:
  "Esperando matriz del proyecto", "En preparacion", "Borrador por revisar",
  "Aceptada" y "Entregada".

## Verificacion contra codigo real

Antes de redactar este handoff se sincronizo CodeGraph sobre el repo real:
`codegraph sync .` reporto "Already up to date". La exploracion de impacto
confirmo las superficies principales:

- `apps/api/services/escritura_sale_hook.py` para el paso venta validada ->
  borrador.
- `apps/api/services/escritura_delivery.py` para entrega, auditoria y vista
  segura sin exponer `link_token`.
- `apps/api/scripts/verify_venta_escritura_supabase.py` para el smoke real
  contra Supabase de T023.
- `apps/web/src/app/(dashboard)/mis-documentos/page.tsx` para la superficie del
  vendedor.

## Pasadas y gates

- T023 quedo documentado contra Supabase real en
  `specs/011-venta-escritura/quickstart.md`: fixture Teno, matriz del proyecto
  aprobada, hook de venta validada, caso creado y mesa abierta desde endpoint
  real.
- T024 registra el E2E tecnico completo y sus comandos de cierre en
  `specs/011-venta-escritura/quickstart.md`.
- T025 queda cubierto por esta memoria y por los punteros actualizados desde el
  home y la nota de producto del generador.
- T026 sigue pendiente y no debe marcarse sin aprobacion explicita del usuario.

## Reglas que quedan vigentes

- El motor de matriz y DOCX sigue siendo el de SDD 008; SDD 011 no introduce un
  renderer nuevo.
- La mesa de SDD 010 sigue siendo la superficie unica de lectura, revision y
  edicion de texto legal.
- La matriz de variables del proyecto no es una entidad nueva: es el CCL
  existente a scope proyecto.
- El frontend no debe mostrar JSON, claves internas, `link_token` ni jerga de
  API.
- OpenAPI se regenera desde FastAPI/Pydantic; no se edita a mano el contrato
  generado.
- Toda salida externa conserva el warning ADR-009 y la marca de borrador sujeto
  a revision legal.
- Los vendedores solo ven documentos de sus propias ventas y proyectos
  asignados.
- **Control de Doble Verificación (Four-Eyes)**: Cuando se activa el flag `LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER=True`, el endpoint de aprobación exige que el revisor que aprueba la matriz sea diferente de quien la envió a revisión, bloqueando con un error HTTP 403 `reviewer_not_authorized` en caso de coincidir. Por defecto está inactivo (`False`) para facilitar la autogestión de operadores individuales.

## Pendiente humano

T026 debe observar dos recorridos:

1. Administrador: validar venta -> abrir borrador -> aceptar en menos de 5
   minutos, sin digitar datos del comprador.
2. Vendedor: recibir o abrir el borrador en "Mis documentos", descargar,
   compartir y renovar enlace vencido cuando corresponda.

El resultado debe registrarse en `quickstart.md`; solo entonces se puede cerrar
producto, no solo cierre tecnico.

## Relacionado

- [[SDD 007 Escrituras Variable Resolution]]
- [[SDD 008 Creador de Matriz - Handoff]]
- [[SDD 010 Mesa de Escritura - Handoff]]
- [[Generador de Escrituras de Compraventa]]
- [[Integraciones Telegram WhatsApp]]
- [[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]
