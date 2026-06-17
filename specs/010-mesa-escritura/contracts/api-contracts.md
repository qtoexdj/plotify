# API Contracts: Mesa de Escritura (SDD 010)

**Regla general**: extensiones **exclusivamente aditivas** sobre los
endpoints de SDD 008. Ningun endpoint nuevo, ningun campo removido, ningun
cambio de semantica. Fuente de verdad: FastAPI/Pydantic →
`pnpm contracts:generate`.

## 1. GET `/api/v1/escritura-matrices/by-case/{case_id}` (extendido)

Respuesta actual + campos nuevos:

```jsonc
{
  "matriz": {
    "clauses": [
      {
        // ...campos existentes...
        "omitted_reason": "No aplica porque el lote no tiene servidumbre", // NUEVO, null si aplica
      },
    ],
    "resolution": {
      "tokens": [
        {
          "variableKey": "comprador.estado_civil", // existente (uso interno)
          "status": "missing", // existente (codigo)
          "value_text": null, // existente
          "state": null, // existente
          "source_type": "system", // existente
          "evidence_refs": [], // existente
          "label": "Estado civil de la compradora", // NUEVO
          "category": "comprador", // NUEVO
          "category_label": "Compradora", // NUEVO
          "source_label": "Registro de venta del Lote 12", // NUEVO, null si hay evidencia documental
        },
      ],
      "blocks": [
        /* sin cambios estructurales; ganan label */
      ],
    },
    "approval_blockers": [
      {
        "kind": "token_missing", // existente
        "key": "comprador.estado_civil", // existente
        "fix_url": "/projects/...", // existente
        "title": "Falta el estado civil de la compradora", // NUEVO
        "description": "Se completa en el registro de venta del lote.", // NUEVO
        "action_label": "Completar dato", // NUEVO
        "action_href": "/projects/...?tab=legal&variable=comprador.estado_civil", // NUEVO
      },
    ],
  },
  "insertable_variables": [
    // NUEVO bloque
    {
      "key": "comprador.nombre",
      "label": "Nombre de la compradora",
      "category": "comprador",
      "category_label": "Compradora",
    },
  ],
}
```

Invariantes:

- `title`/`description`/`action_label` se redactan en
  `legal_microcopy.py`; prohibido componer estos textos en la web.
- `label` cae al `label` del nodo de plantilla solo si fue personalizado;
  por defecto viene de `VARIABLE_LABELS` (cobertura 100% testeada).
- `insertable_variables` respeta el catalogo vigente (claves removidas
  jamas aparecen).

## 2. PUT `/api/v1/escritura-matrices/{id}` — sin cambios

Mismo payload y optimistic locking. La mesa envia exactamente lo que el
builder enviaba (clause_order, clause_overrides, version).

## 3. Workflow y generacion — sin cambios de contrato

`submit` / `approve` / `reject` / `generate` conservan request/response;
las respuestas de error 409/422 ganan los mismos campos humanos de blocker
(seccion 1) cuando devuelven causas.

## 4. Endpoints de plantillas (extendidos)

- Upsert de clausula: acepta los mismos campos; `clause_key` ahora puede
  omitirse y el servidor lo autogenera (slug del titulo, sufijo ante
  colision). Respuesta sin cambios estructurales.
- Error de validacion de catalogo (`invalid_keys`): cada item gana
  `display_text` (texto visible del dato en la clausula) y
  `suggested_label` ademas de la clave y la sugerencia tecnica existentes.

## 5. Tests de contrato exigidos

- Inventario: toda clave del catalogo tiene `label` y `category_label`
  (falla el build de API si no).
- Manifiesto Teno: snapshot del caso golden produce labels/categorias
  correctos y `source_label` para datos operacionales sin evidencia.
- Blockers humanizados: cada `kind` produce `title`/`description`/
  `action_label`/`action_href` no vacios; el caso `derechos_aguas` Teno
  produce el texto comprometido.
- Regeneracion: `pnpm contracts:generate` + `pnpm typecheck:web` en verde
  sin ediciones manuales del JSON generado.
