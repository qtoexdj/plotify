---
title: Incidente - Eliminacion de Proyectos Legacy 2026-04-22
date: 2026-04-22
tags:
  - incidente
  - db
  - proyectos
  - legacy
status: draft
---

# Incidente - Eliminacion de Proyectos Legacy 2026-04-22

## Resumen

El error al eliminar proyectos no era general del sistema. Afectaba solo a proyectos legacy creados al inicio del desarrollo.

El caso confirmado fue el proyecto:

- `8ba199b2-f4c5-4945-addb-573058a16379`

## Sintoma observado

Al eliminar el proyecto desde `apps/web`, Supabase devolvia:

- `23503`
- `approval_requests_lot_id_fkey`
- mensaje: `update or delete on table "lots" violates foreign key constraint`

## Verificacion ejecutada

Se inspecciono directamente la base local dentro del contenedor Docker `supabase-db`.

Hallazgos:

- El proyecto legacy tenia `20` lotes.
- Tenia `5` registros en `approval_requests`.
- No tenia `generated_documents` asociados que bloquearan el borrado.
- Los proyectos nuevos se eliminaban correctamente.

Conclusion:

- El problema provenia de datos historicos de prueba en `approval_requests`, no de un fallo general en el flujo actual.

## Registros encontrados

Se encontraron 5 approvals ligados a lotes del proyecto:

- lote `8` — `approved`
- lote `12` — `approved`
- lote `14` — `approved`
- lote `15` — `pending`
- lote `19` — `approved`

Todos creados el `2026-03-17`.

## Accion tomada

Se elimino unicamente la data legacy de `approval_requests` asociada a ese proyecto de prueba, sin aplicar cambios amplios al flujo de negocio.

Resultado verificado:

- `remaining_approvals = 0` para ese proyecto

## Decision

No tratar este caso como una falla estructural inmediata del sistema productivo.

Primero:

- limpiar data legacy puntual cuando el bloqueo provenga de proyectos de prueba antiguos

Despues, en una tarea separada si sigue siendo necesario:

- decidir si `approval_requests.lot_id` debe o no usar `ON DELETE CASCADE`
- definir politica explicita para borrado de proyectos con historial comercial

## Implicacion practica

Si vuelve a aparecer el mismo error solo en proyectos antiguos:

- revisar si existen approvals historicos asociados a lotes del proyecto
- confirmar si son datos de prueba antes de cambiar schema o logica de negocio

## Relacionado

- [[Backlog Implementable - Cierre Plotify]]
- [[Riesgos y Brechas Tecnicas]]
- [[Revision Integral 2026-04-14]]
