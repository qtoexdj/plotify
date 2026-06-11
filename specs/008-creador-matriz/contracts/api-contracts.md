# API Contracts: Creador de Matriz y Minuta DOCX

**Date**: 2026-06-10 | **Feature**: `008-creador-matriz`

Endpoints FastAPI en `apps/api/api/v1/endpoints/escritura_matrices.py` y
`escritura_templates.py`, bajo el patron internal-secret + validacion de
tenant de SDD 007. Proxies Next.js autenticados bajo
`apps/web/src/app/api/`. Contratos regeneran via `pnpm contracts:generate`.

## Biblioteca de plantillas

### `GET /escritura-templates?organization_id&document_type=compraventa`

Lista versiones (published + drafts) con resumen de clausulas.

### `POST /escritura-templates`

Crea template `draft` (o clona desde una version publicada con
`clone_from_template_id`). Body: `{ name, document_type, clone_from_template_id? }`.

### `PUT /escritura-templates/{template_id}/clauses/{clause_key}`

Upsert de clausula en template `draft`. Body: `{ title, position,
fixed_position, content_json, condition_key?, condition_mode?, alert_tipo? }`.

`422` con `invalid_keys: [...]` cuando `content_json` referencia claves fuera
del catalogo canonico + derivadas permitidas (FR-015), incluyendo claves
removidas (`matriz.inscripcion_*`) con `suggested_migration`.

### `POST /escritura-templates/{template_id}/publish`

Transicion draft → published (inmutable). `409` si la version tiene claves
invalidas o clausulas sin contenido.

## Matriz por caso

### `GET /escritura-matrices/case/{escritura_case_id}`

Retorna la matriz activa del caso (creandola lazy desde el template publicado
si no existe), con resolucion calculada:

```jsonc
{
  "matriz": {
    "id": "uuid",
    "status": "draft", // draft | legal_review_pending | approved | superseded
    "version": 4, // optimistic locking
    "template": { "id": "uuid", "name": "Compraventa predio rustico", "version": 2 },
    "snapshot_stale": false, // FR-014: hash de snapshot divergente
    "clauses": [
      {
        "clause_key": "comparecencia",
        "title": "COMPARECENCIA",
        "position": 1,
        "fixed_position": true,
        "content_json": {
          /* ProseMirror */
        },
        "overridden": false,
        "condition": { "key": "personeria.aplica", "mode": "omit", "active": true },
      },
    ],
    "resolution": {
      // manifiesto del resolutor (research D6)
      "tokens": [
        {
          "variableKey": "comprador.nombre",
          "status": "resolved",
          "value_text": "...",
          "state": "approved",
          "evidence_ref": null,
        },
        {
          "variableKey": "transaccion.precio_letras",
          "status": "resolved",
          "source_type": "derived",
        },
        { "variableKey": "comprador.nacionalidad", "status": "missing" },
      ],
      "blocks": [{ "blockKey": "titulo.clausula_primero_texto", "status": "resolved" }],
      "missing_count": 1,
    },
    "approval_blockers": [
      // FR-007: vacio cuando aprobable
      {
        "kind": "token_missing",
        "key": "comprador.nacionalidad",
        "fix_url": "/projects/{id}?tab=legal",
      },
      {
        "kind": "readiness_gate",
        "gate": "title_verified",
        "cause": "analysis_needs_review",
        "fix_url": "...",
      },
      {
        "kind": "alert_clause_missing",
        "alert_tipo": "derechos_aguas",
        "required_clause": "Water-rights clause",
      },
    ],
  },
}
```

### `PUT /escritura-matrices/{matriz_id}`

Guarda orden y overrides. Body: `{ version, clause_order, clause_overrides }`.
`409 version_conflict` al perder el CAS; `409 snapshot_stale` si el caso
re-snapshoteo (el cliente recarga).

### `POST /escritura-matrices/{matriz_id}/submit` / `/approve` / `/reject`

Transiciones del workflow (data-model §6). `approve`/`reject` exigen revisor
autorizado y razon en reject; `422` con `approval_blockers` cuando no se
cumplen las precondiciones. Auditan en `legal_review_decisions`.

### `POST /escritura-matrices/{matriz_id}/generate`

Genera la minuta DOCX. Body: `{ warning_acknowledged: true }` obligatorio
(FR-012). Precondiciones server-side: `status='approved'` y `snapshot_hash`
vigente. Respuesta: fila de `escritura_minuta_generations` + URL firmada de
descarga. `409 snapshot_stale`, `422 warning_required`.

### `GET /escritura-matrices/case/{escritura_case_id}/generations`

Historial inmutable de generaciones (para `/documentos/historial`).

## Puente operacional (interno)

### `POST /escritura-cases/{case_id}/stage-operational` (tambien invocado al crear el caso)

Corre `escritura_operational_bridge` (research D3): propone `comprador.*`,
`transaccion.*`, `lote.*`, `servidumbre.*` desde `lot_records`/`lots`/
`organization_payment_info`. Respuesta: `{ proposed: [...], skipped_same_hash:
[...], superseded: [...] }`. Idempotente por `source_row_hash`.

## Reglas transversales

- Toda mutacion exige scope org/proyecto/caso (trigger + asserts de servicio).
- El builder jamas escribe `variable_resolutions` (FR-017); el unico productor
  nuevo es el puente operacional, que corre en el API de casos, no en la UI.
- Errores con cuerpo `{ code, message, detail }` consistente con SDD 007/009.
