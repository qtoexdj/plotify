# Data Model: Mesa de Escritura — Consolidacion UX Legal

**Feature**: `010-mesa-escritura` | **Date**: 2026-06-11

**Decision macro**: **cero migraciones de base de datos**. Las cuatro tablas
de SDD 008 (`escritura_templates`, `escritura_template_clauses`,
`escritura_matrices`, `escritura_minuta_generations`), sus CHECKs, triggers,
RLS y el workflow draft → legal_review_pending → approved → superseded
quedan exactamente como estan. SDD 010 agrega view-models (contratos de
respuesta) y fuentes de vocabulario en codigo versionado.

## 1. Catalogo canonico etiquetado (codigo, `apps/api`)

Extension aditiva de `legal_variable_catalog.py`:

| Elemento                   | Tipo             | Regla                                                                                                                                |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `VARIABLE_LABELS`          | `dict[str, str]` | Etiqueta humana es-CL por clave del catalogo. Cobertura 100% obligatoria (test de inventario falla si una clave queda sin etiqueta). |
| `VARIABLE_GROUP_LABELS`    | `dict[str, str]` | Etiqueta humana por grupo (fuente unica; la web deja de tener su propia copia como fuente).                                          |
| `variable_label_for_key()` | helper           | Resuelve etiqueta con fallback explicito = error en tests, jamas la clave cruda en runtime de UI.                                    |

Validaciones: ninguna clave nueva entra al catalogo sin etiqueta (regla de
test); los grupos existentes (`VARIABLE_KEYS_BY_GROUP`) actuan como
categoria del dato.

## 2. Diccionario de microcopy (codigo, `apps/api/services/legal_microcopy.py`)

Fuente unica del vocabulario que nace en el servidor:

| Dominio             | Ejemplo codigo → texto                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Gates de readiness  | `party_verified` → "Datos de las partes verificados"                                                |
| Causas de bloqueo   | `token_missing` + clave → "Falta {etiqueta del dato}" + donde se corrige                            |
| Tipos de alerta     | `dl_3516` → "Declaracion DL 3.516"; `derechos_aguas` → "Derechos de aguas"                          |
| Acciones            | destino CCL → "Completar dato"; clausula → "Agregar clausula"; titulo → "Revisar estudio de titulo" |
| Estados de workflow | `legal_review_pending` → "En revision legal" (compartido con web)                                   |

Regla: todo texto compuesto (depende de datos del caso) se redacta aqui;
los textos estaticos de pantalla viven en
`apps/web/src/lib/documents/matriz-microcopy.ts` (tabla en
[contracts/ui-contracts.md](./contracts/ui-contracts.md)).

## 3. Manifiesto humanizado (view-model, extension de schemas Pydantic)

Extension **aditiva** de `apps/api/schemas/escritura_matrices.py` (ningun
campo existente se remueve ni cambia de tipo):

### TokenResolution (extendido)

| Campo nuevo      | Tipo          | Origen                                                                                                                                       |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`          | `str`         | `VARIABLE_LABELS[variableKey]` (override: `label` del nodo en plantilla si fue personalizado)                                                |
| `category`       | `str`         | `variable_group_for_key()`                                                                                                                   |
| `category_label` | `str`         | `VARIABLE_GROUP_LABELS[category]`                                                                                                            |
| `source_label`   | `str \| None` | Descripcion humana del origen operacional cuando no hay evidencia documental ("Registro de venta del Lote 12", "Geometria oficial del lote") |

### ApprovalBlocker (extendido, todos los kinds)

| Campo nuevo    | Tipo          | Regla                                                                            |
| -------------- | ------------- | -------------------------------------------------------------------------------- |
| `title`        | `str`         | Frase humana ("Falta el estado civil de la compradora")                          |
| `description`  | `str`         | Causa + donde se corrige ("Se completa en el registro de venta del lote")        |
| `action_label` | `str`         | "Completar dato" / "Agregar clausula" / "Revisar estudio de titulo" / "Recargar" |
| `action_href`  | `str \| null` | Deep link navegable (conserva y normaliza el `fix_url` existente)                |

### Catalogo para insercion (nuevo bloque en la respuesta GET del caso)

| Campo                  | Tipo                       | Contenido                                                                                                                             |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `insertable_variables` | `list[InsertableVariable]` | `{ key, label, category, category_label }` por clave insertable del catalogo, para el picker (D6), coherente con el snapshot mostrado |

### Clausulas omitidas (extension del view de clausula)

| Campo nuevo      | Tipo          | Regla                                                                                                    |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `omitted_reason` | `str \| null` | Texto humano cuando una clausula condicional no aplica ("No aplica porque el lote no tiene servidumbre") |

## 4. Regla de clausula declarativa (mapeo de presentacion, sin cambio de modelo)

La UI de autoria expresa la condicion existente como frase; el storage no
cambia:

| UI (frase)                             | Modelo vigente                               |
| -------------------------------------- | -------------------------------------------- |
| "Aparece solo si {dato} esta presente" | `condition_key` + `condition_mode='present'` |
| "Aparece solo si {dato} es afirmativo" | `condition_key` + `condition_mode='truthy'`  |
| "Aparece siempre"                      | `condition_key = null`                       |
| "La exige la alerta {nombre humano}"   | `alert_tipo`                                 |

`clause_key` se autogenera como slug del titulo (colision → sufijo
numerico); editable solo en "Opciones avanzadas".

## 5. Estados y transiciones

Sin cambios. El workflow, el optimistic locking (`version`), la deteccion de
`snapshot_stale` y la inmutabilidad de published/generations son los de
SDD 008. La mesa solo los **presenta** con el vocabulario del diccionario.

## 6. Impacto en contratos generados

- `pnpm contracts:generate` regenera OpenAPI + cliente TS con los campos
  aditivos (seccion 3).
- `apps/web/src/lib/documents/matriz-types.ts` extiende sus interfaces con
  los campos nuevos; ningun tipo existente se rompe.
