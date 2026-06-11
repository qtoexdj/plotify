# Data Model: Creador de Matriz y Minuta DOCX

**Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Convenciones heredadas: tenant-scoped (`organization_id` + trigger de scope
contra `projects`/casos, patron `title_analyses`), RLS por organizacion,
`created_at`/`updated_at` con trigger, JSONB para contenido estructurado,
estados con CHECK constraints. Una sola migracion
`20260611000100_creador_matriz.sql`.

## 1. `escritura_templates` — biblioteca versionada (por organizacion)

| Columna                     | Tipo                            | Notas                               |
| --------------------------- | ------------------------------- | ----------------------------------- |
| id                          | UUID PK                         |                                     |
| organization_id             | UUID NOT NULL → organizations   | RLS                                 |
| name                        | TEXT NOT NULL                   | "Compraventa predio rustico v1"     |
| document_type               | TEXT NOT NULL                   | `compraventa` (CHECK; extensible)   |
| version                     | INTEGER NOT NULL DEFAULT 1      | correlativo por (org, name)         |
| status                      | TEXT NOT NULL                   | `draft` \| `published` \| `retired` |
| published_at / published_by | TIMESTAMPTZ / UUID → auth.users |                                     |
| created_at / updated_at     | TIMESTAMPTZ                     |                                     |

- UNIQUE `(organization_id, name, version)`.
- Indice parcial: un solo `published` por (organization_id, name).
- **Inmutabilidad**: trigger rechaza UPDATE de contenido cuando
  `status='published'` (solo transicion a `retired`). Editar = clonar a
  nueva version `draft`.

## 2. `escritura_template_clauses` — clausulas de una version

| Columna                 | Tipo                                                  | Notas                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                      | UUID PK                                               |                                                                                                                                                                                    |
| organization_id         | UUID NOT NULL                                         | RLS (espejo del template)                                                                                                                                                          |
| template_id             | UUID NOT NULL → escritura_templates ON DELETE CASCADE |                                                                                                                                                                                    |
| clause_key              | TEXT NOT NULL                                         | `comparecencia`, `precio`, `servidumbre_transito`…                                                                                                                                 |
| title                   | TEXT NOT NULL                                         | "PRECIO Y LIQUIDACION"                                                                                                                                                             |
| position                | INTEGER NOT NULL                                      | orden explicito                                                                                                                                                                    |
| fixed_position          | BOOLEAN NOT NULL DEFAULT false                        | comparecencia/PRIMERO no se mueven (FR-010)                                                                                                                                        |
| content_json            | JSONB NOT NULL                                        | ProseMirror JSON (schema D2)                                                                                                                                                       |
| condition_key           | TEXT NULL                                             | `servidumbre.aplica`, `personeria.aplica`, `clausulas.exencion_eviccion_aprobada`                                                                                                  |
| condition_mode          | TEXT NULL                                             | `omit` \| `block` (edge case arrays vacios)                                                                                                                                        |
| alert_tipo              | TEXT NULL                                             | contrato de alertas (CHECK contra taxonomia SDD 009: dl_3516, derechos_aguas, vigente_en_el_resto, multi_inmueble, gravamen, personeria_requerida, discrepancia_declaracion, otro) |
| created_at / updated_at | TIMESTAMPTZ                                           |                                                                                                                                                                                    |

- UNIQUE `(template_id, clause_key)`; UNIQUE `(template_id, position)`
  DEFERRABLE (reordenamientos).
- Validacion de catalogo (FR-015) es de servicio, no de DB: al guardar una
  clausula, cada `variableKey`/`arrayKey`/`conditionKey` del JSON debe
  existir en `VARIABLE_KEY_SET` o en la lista de claves derivadas de
  presentacion (research D11).

## 3. `escritura_matrices` — instancia por caso de escritura

| Columna                         | Tipo                                              | Notas                                                                                                                                |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| id                              | UUID PK                                           |                                                                                                                                      |
| organization_id / project_id    | UUID NOT NULL                                     | RLS + trigger scope                                                                                                                  |
| escritura_case_id               | UUID NOT NULL → escritura_cases ON DELETE CASCADE | UNIQUE parcial: una matriz activa por caso                                                                                           |
| template_id                     | UUID NOT NULL → escritura_templates               | version publicada usada                                                                                                              |
| snapshot_case_status            | TEXT NOT NULL                                     | status del caso al vincular                                                                                                          |
| snapshot_hash                   | TEXT NOT NULL                                     | hash de `variable_snapshot` al vincular (deteccion supersesion FR-014)                                                               |
| clause_order                    | JSONB NOT NULL DEFAULT '[]'                       | array de clause refs en orden efectivo                                                                                               |
| clause_overrides                | JSONB NOT NULL DEFAULT '{}'                       | por clause_key: `{disabled: bool, content_json?: …}` (clausula editada/agregada localmente; las agregadas usan clave `local:<slug>`) |
| status                          | TEXT NOT NULL                                     | `draft` \| `legal_review_pending` \| `approved` \| `superseded`                                                                      |
| version                         | INTEGER NOT NULL DEFAULT 1                        | optimistic locking (D9): UPDATE exige version actual, incrementa                                                                     |
| submitted_by/at, approved_by/at | UUID/TIMESTAMPTZ                                  | gate revisor autorizado                                                                                                              |
| created_at / updated_at         | TIMESTAMPTZ                                       |                                                                                                                                      |

- Aprobacion escribe ademas en `legal_review_decisions` (tipo
  `matriz_approved` / `matriz_rejected`) — tabla existente, sin cambios.
- Supersesion de snapshot: el servicio compara `snapshot_hash` con el hash
  vigente del caso; divergencia ⇒ `status='draft'` + flag de aviso, la
  aprobacion anterior queda en `legal_review_decisions` (historia, FR-013).

## 4. `escritura_minuta_generations` — registro inmutable de DOCX

| Columna                      | Tipo                                 | Notas                                                                  |
| ---------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| id                           | UUID PK                              |                                                                        |
| organization_id / project_id | UUID NOT NULL                        | RLS + scope                                                            |
| escritura_case_id            | UUID NOT NULL → escritura_cases      |                                                                        |
| matriz_id                    | UUID NOT NULL → escritura_matrices   |                                                                        |
| matriz_version               | INTEGER NOT NULL                     | version aprobada usada                                                 |
| template_id                  | UUID NOT NULL                        |                                                                        |
| snapshot_hash                | TEXT NOT NULL                        | snapshot exacto usado                                                  |
| resolution_manifest          | JSONB NOT NULL                       | manifiesto del resolutor (D6): por token, resolved/missing y evidencia |
| content_hash                 | TEXT NOT NULL                        | sha256 del DOCX                                                        |
| storage_path                 | TEXT NOT NULL                        | Supabase Storage (bucket privado existente de documentos)              |
| warning_acknowledged_by/at   | UUID NOT NULL / TIMESTAMPTZ NOT NULL | FR-012: sin ack no hay fila ni archivo                                 |
| generated_by/at              | UUID / TIMESTAMPTZ NOT NULL          |                                                                        |

- Sin UPDATE permitido (trigger): solo INSERT/SELECT. Historial = filas.
- `historial/` de `/documentos` lista esta tabla.

## 5. Cambios a tablas/codigo existentes

- **`legal_variable_catalog.py`**: agregar claves de research D11 (grupos
  comprador/documento/clausulas/evidencia/personeria). Sin remociones.
- **`variable_resolutions`**: sin cambios de schema. El puente operacional
  (research D3) inserta propuestas con `source_type` `system`/`geometry`/
  `derived` y `source_ref` `{source: "lot_records"|"lots"|
"organization_payment_info", row_id, source_row_hash}`.
- **Idempotencia del puente**: `source_ref.source_row_hash` (sha256 de los
  campos fuente usados); si el hash vigente coincide, no re-propone; si
  difiere, supersede + nueva propuesta (FR-021). Sin tabla nueva.
- **`escritura_cases`**: sin cambios de schema; `variable_snapshot` ya
  soporta los grupos. La creacion de caso invoca el puente antes de
  snapshotear.
- **MVP legacy**: `templates`, `template_blocks`, `generated_documents` no se
  migran; quedan solo-lectura hasta la tarea de retiro (research D10).

## 6. Estados y transiciones de la matriz

```
draft ──submit(redactor)──► legal_review_pending ──approve(revisor autorizado)──► approved
  ▲                              │ reject(con razon)                                  │
  └──────────────◄───────────────┘                  snapshot superseded / re-snapshot │
  ▲                                                                                   │
  └──────────────────────────────◄────────────────────────────────────────────────────┘
```

- `submit` exige: 0 tokens `missing` sin decision, gates de readiness no
  bloqueados, contrato de alertas satisfecho (D8). Bloqueos listados con
  deep link (FR-007).
- `approve` exige rol revisor autorizado (mismo criterio
  `legal_review_decisions` de SDD 007/009).
- Generacion DOCX permitida solo en `approved` con `snapshot_hash` vigente.

## 7. RLS

Mismo patron SDD 007/009 en las cuatro tablas: policy por
`organization_id IN (SELECT organization_id FROM organization_members WHERE
user_id = auth.uid())` para SELECT, y service-role para escritura desde el
API; triggers `validate_*_scope` verifican coherencia org/proyecto/caso.
Tests de regresion tenant en `tests/test_matriz_endpoints.py` (cross-org y
cross-project, patron `test_titulo_endpoints.py::TestTenantRegression`).
