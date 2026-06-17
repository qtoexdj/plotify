# Data Model: Venta → Escritura — Matriz del Proyecto y Borrador Automatico

**Branch**: `011-venta-escritura` | **Date**: 2026-06-15 | **Plan**: [plan.md](./plan.md)

Modelo derivado de [research.md](./research.md). Regla: reusar el modelo de
SDD 008 (`escritura_matrices`, `escritura_minuta_generations`,
`escritura_cases`, `variable_resolutions`); una sola migracion aditiva
acotada. Nada se reconstruye.

---

## 1. Matriz del proyecto (sobre `escritura_matrices`)

La matriz pasa a tener **dos scopes** segun `escritura_case_id`:

| Scope    | `escritura_case_id` | Significado                                                                                                                                 |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto | `NULL`              | Matriz de la escritura del proyecto: resuelta contra el snapshot de variables del proyecto; datos de venta como huecos. "Esperando ventas". |
| Lote     | `<uuid>`            | Borrador del lote, instanciado al validar la venta (como hoy).                                                                              |

### Migracion `escritura_matrices` (aditiva acotada)

```sql
ALTER TABLE public.escritura_matrices
  ALTER COLUMN escritura_case_id DROP NOT NULL;

ALTER TABLE public.escritura_matrices
  ADD COLUMN source_project_matriz_id UUID
    REFERENCES public.escritura_matrices(id) ON DELETE SET NULL;

-- Una matriz de proyecto activa por proyecto (la "una activa por caso"
-- existente ya excluye los NULL por la semantica de UNIQUE en Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS escritura_matrices_one_active_project_idx
  ON public.escritura_matrices (project_id)
  WHERE escritura_case_id IS NULL AND status <> 'superseded';
```

**Campos reutilizados sin cambio**: `clause_order`, `clause_overrides`,
`status` (draft / legal_review_pending / approved / superseded), `version`,
`submitted_by/at`, `approved_by/at`, `snapshot_hash`.

**Estado "esperando ventas"**: no es un valor nuevo de `status`; es la
matriz **de proyecto** (`escritura_case_id IS NULL`) en estado `approved`.
Cambiarla exige nueva version + nueva aprobacion (mismo workflow SDD 008,
historial conservado vía `superseded`).

### Reglas

- **Generacion** (FR-001): copia desde la plantilla general vigente
  (`escritura_templates`) hacia una matriz de proyecto nueva; resuelta
  contra el snapshot de variables del proyecto.
- **Aprobacion** (FR-003): bloqueada mientras la revision del proyecto
  tenga pendientes (titulo, variables legales); pendientes humanizados
  accionables (patron de SDD 010). Aprobada = inmutable.
- **Instanciacion del borrador del lote** (FR-005): copia `clause_order` +
  `clause_overrides` de la matriz de proyecto `approved`, fija
  `source_project_matriz_id` + version, y resuelve contra el snapshot del
  lote (proyecto + datos de venta del puente). No re-deriva texto.

---

## 2. Matriz de variables del proyecto (sobre `variable_resolutions`)

**Sin migracion**: `variable_resolutions` ya admite `lot_id` y
`escritura_case_id` nullable, asi que las variables a scope proyecto
(`lot_id IS NULL`) ya son representables. Es lo que el CCL (SDD 007/009) ya
revisa por proyecto (`legal-variable-editor`/`table`). El feature solo lo
**expone** desde la seccion Documentos; no cambia el modelo.

---

## 3. Expediente de escritura del lote (sobre `escritura_cases`)

Sin cambios de esquema. Gana **origen automatico**: lo crea el enganche al
validar la venta (research D3), no el panel manual. `case_status` ya cubre
el ciclo (draft → … → minuta_approved → sent_to_external → cancelled).

- **Orden corregido** (FR-006): el caso se crea primero; las verificaciones
  (`readiness_gates`) se evaluan despues sobre los datos propuestos por el
  puente. Se retira la precondicion "verificaciones en verde antes de crear
  el caso" del panel actual.
- **Re-venta** (edge case): cada venta validada produce su propio caso
  versionado; el anterior queda `cancelled` con historial.

---

## 4. Entrega de borrador — tabla nueva `escritura_deliveries`

```sql
CREATE TABLE IF NOT EXISTS public.escritura_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    escritura_case_id UUID NOT NULL REFERENCES public.escritura_cases(id) ON DELETE CASCADE,
    generation_id UUID NOT NULL REFERENCES public.escritura_minuta_generations(id) ON DELETE CASCADE,
    recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- vendedor asignado
    channel TEXT NOT NULL,                  -- 'telegram' | 'web'
    link_token TEXT,                        -- enlace seguro
    link_expires_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed | unavailable | expired
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT escritura_deliveries_channel_check CHECK (channel = ANY (ARRAY['telegram'::text, 'web'::text])),
    CONSTRAINT escritura_deliveries_status_check CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'unavailable'::text, 'expired'::text]))
);

CREATE INDEX IF NOT EXISTS escritura_deliveries_recipient_idx
  ON public.escritura_deliveries (recipient_user_id, status);
```

- **Vencimiento del enlace** (FR-010, decision B1): `link_expires_at` =
  creacion + **7 dias**. Vencido (`status='expired'`) el vendedor lo renueva
  desde "mis documentos" sin intervencion del administrador (re-emite token y
  resetea `link_expires_at`).
- **Auditoria** (FR-010/FR-012): quien, a quien, canal, enlace,
  vencimiento, estado, cuando. Telegram no vinculado → fila con
  `status='unavailable'` + caida a web (jamas falla en silencio).
- **RLS**: aislada por organizacion y por vendedor asignado (constitucion
  V): el vendedor ve solo entregas de SUS ventas.

---

## 5. Estados del flujo (diccionario, sin tabla)

Frases humanas unicas (FR-014), derivadas de `case_status` + scope/estado de
la matriz + entregas. Se agregan a `legal_microcopy.py` (API) y
`matriz-microcopy.ts` (web):

| Estado humano                 | Derivacion                                           |
| ----------------------------- | ---------------------------------------------------- |
| Esperando matriz del proyecto | venta validada, sin matriz de proyecto `approved`    |
| En preparacion                | caso con pendientes (datos de venta faltantes)       |
| Borrador por revisar          | borrador instanciado, esperando aceptacion del admin |
| Aceptada                      | DOCX generado con warning aceptado                   |
| Entregada                     | entrega `sent` al vendedor                           |

---

## Resumen de migracion

| Objeto                         | Cambio                                                                     | Migracion            |
| ------------------------------ | -------------------------------------------------------------------------- | -------------------- |
| `escritura_matrices`           | `escritura_case_id` nullable + indice parcial + `source_project_matriz_id` | Sí (aditiva acotada) |
| `escritura_deliveries`         | Tabla nueva                                                                | Sí (aditiva)         |
| `variable_resolutions`         | — (ya soporta scope proyecto)                                              | No                   |
| `escritura_cases`              | — (solo nuevo origen, sin esquema)                                         | No                   |
| `escritura_minuta_generations` | —                                                                          | No                   |

Tras la migracion: `pnpm verify:migrations` + regenerar tipos de DB.
