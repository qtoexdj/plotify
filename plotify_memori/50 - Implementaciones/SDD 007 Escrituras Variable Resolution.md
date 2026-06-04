---
title: SDD 007 Escrituras Variable Resolution
aliases:
  - SDD 007 Escrituras Variables
  - Escrituras Variable Resolution
date: 2026-06-03
status: planificado
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - legal
related:
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[Plan Logica Productiva Generador Escrituras - Variables y Editor]]"
  - "[[Variables Escritura Compraventa - Fuentes de Obtencion]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
  - "[[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]"
  - "[[SDD 008 Creador de Matriz - Handoff]]"
  - "[[Rol de Avaluo en Tramite - Fuentes SII]]"
---

# SDD 007 Escrituras Variable Resolution

## Resumen

SDD 007 convierte el analisis del laboratorio de escrituras en un plan
productivo por fases para resolver variables legales con evidencia antes de
construir la minuta DOCX.

El foco inicial no es el constructor visual de minuta. El foco es:

1. Registrar documentos legales subidos en onboarding o en el proyecto.
2. Disparar extraccion automatica en segundo plano.
3. Extraer texto y proponer variables canonicas con evidencia.
4. Revisar, corregir y aprobar variables en el Centro de Control Legal.
5. Asociar roles SII y roles de avaluo en tramite a lotes.
6. Crear readiness y snapshot de caso de escritura por lote vendido.

## Artefactos SDD

- `specs/007-escrituras-variable-resolution/spec.md`
- `specs/007-escrituras-variable-resolution/plan.md`
- `specs/007-escrituras-variable-resolution/research.md`
- `specs/007-escrituras-variable-resolution/data-model.md`
- `specs/007-escrituras-variable-resolution/contracts/api-contracts.md`
- `specs/007-escrituras-variable-resolution/contracts/ui-contracts.md`
- `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`
- `specs/007-escrituras-variable-resolution/quickstart.md`
- `specs/007-escrituras-variable-resolution/tasks.md`

## Decisiones incorporadas

- Onboarding solo sube archivos y arranca extraccion; no revisa variables.
- El Centro de Control Legal concentra revision, evidencia, brechas y aprobacion.
- El laboratorio 006 queda como insumo de conocimiento, no runtime productivo.
- `Rol de avaluo en tramite` es valido cuando tiene evidencia SII o aprobacion
  legal.
- La variable de abogado redactor/revisor es un gate de workflow antes de
  aprobacion externa.
- La minuta automatica debe mostrar advertencia de revision y aprobacion por
  abogado antes de usarse ante notaria o como instrumento final.

## Fases

| Fase | Entregable |
| --- | --- |
| 1 | Migracion, tipos y catalogo de variables |
| 2 | Schemas, servicios y worker base |
| 3 | Registro de documentos legales desde onboarding/proyecto |
| 4 | Extraccion de variables y evidencia |
| 5 | Centro de Control Legal |
| 6 | Matching SII por lote |
| 7 | Readiness y casos de escritura |
| 8 | Contratos, documentacion, produccion y handoff SDD 008 |

## Handoff a SDD 008

El SDD 008 debe ser el `Creador de Matriz y Minuta DOCX`. Su punto de partida
sera `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`.

Regla principal: el creador de matriz consume `variable_snapshot`,
`evidence_snapshot` y `readiness_gates` del caso de escritura. No debe leer OCR
bruto ni propuestas vivas de extraccion.

SDD 008 debe ocuparse de:

- Interfaz nueva de matriz construida desde cero con ProseKit + dnd-kit.
- Bloques/clausulas versionadas.
- Tokens de variables estructurados.
- Reordenamiento de clausulas permitido.
- Preview por template/resuelto/evidencia.
- Generacion DOCX desde snapshot aprobado.

Si una variable esta mal, el usuario vuelve al Centro de Control Legal del SDD
007, corrige y crea un nuevo snapshot.

La visualizacion, correccion y aprobacion de variables extraidas queda en SDD
007. SDD 008 solo muestra/inserta variables desde snapshots aprobados.

## Proxima tarea recomendada

Empezar con `T001` de `specs/007-escrituras-variable-resolution/tasks.md`:
crear la migracion canonica de Supabase para documentos, ingesta, evidencia,
variables, roles por lote, casos de escritura y decisiones de revision.

## Relacionado

- [[Variables Escritura Compraventa - Fuentes de Obtencion]]
- [[Plan Logica Productiva Generador Escrituras - Variables y Editor]]
- [[Generador de Escrituras de Compraventa]]
- [[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]
- [[SDD 008 Creador de Matriz - Handoff]]
