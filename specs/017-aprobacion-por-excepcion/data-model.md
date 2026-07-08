# Data Model: Aprobación por excepción (SDD017)

Tres migraciones nuevas en `packages/database/supabase/migrations` (Principio III — aplicar con `supabase db push`, no vía MCP). Ninguna tabla existente pierde columnas; el registro inmutable del caso (snapshot, versión, hash, generaciones) no se modifica (FR-010).

## Migración 1 — Política de revisión de la organización

```sql
-- XXXX_escritura_review_policy.sql
alter table organizations
  add column escritura_review_policy text not null default 'every_sale'
  check (escritura_review_policy in ('every_sale', 'exceptions_only'));
```

- Cambios solo por admin de la organización vía endpoint dedicado; el endpoint registra el evento en la auditoría existente (quién, cuándo, valor anterior → nuevo) — Principio V.
- La cascada lee la política al momento de correr; no hay efecto retroactivo sobre casos en curso (FR-003).

## Migración 2 — Warning legal por proyecto

```sql
-- XXXX_project_minuta_warning_ack.sql
alter table projects
  add column minuta_warning_acknowledged_by uuid references auth.users(id),
  add column minuta_warning_acknowledged_at timestamptz;
```

- Una confirmación vigente por proyecto (FR-009). `escritura_minuta_generations.warning_acknowledged_by/_at` se conservan y ahora copian el amparo del proyecto al momento de generar (registro auto-contenido).
- Backfill implícito: proyectos con generaciones previas ya confirmadas quedan cubiertos al primer uso (la cascada pide la confirmación solo si el proyecto no la tiene).

## Migración 3 — Corridas de cascada

```sql
-- XXXX_escritura_cascade_runs.sql
create table escritura_cascade_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  escritura_case_id uuid not null references escritura_cases(id),
  trigger text not null check (trigger in ('sale_validated', 'review_approved', 'manual_retry')),
  outcome text not null check (outcome in ('completed', 'exception', 'awaiting_review')),
  causes jsonb not null default '[]'::jsonb,   -- blockers humanizados al momento de la corrida
  steps jsonb not null default '[]'::jsonb,    -- [{step, action: executed|skipped, detail}]
  created_at timestamptz not null default now()
);
create index on escritura_cascade_runs (escritura_case_id, created_at desc);
-- RLS: mismo patrón multi-tenant de escritura_cases (select para miembros de la org; escritura solo service role).
```

- Historia completa de corridas y reintentos (auditoría Nivel B); la mesa deriva su vista de la última corrida.
- `steps` documenta la idempotencia (qué se ejecutó vs. saltó en cada corrida) — D6.

## Extensiones a tablas existentes

### `escritura_matrices`

```sql
alter table escritura_matrices
  add column approval_origin text not null default 'human'
  check (approval_origin in ('human', 'system'));
```

- Aprobación automática: `approved_by`/`submitted_by` NULL + `approval_origin='system'` (D2). Filas históricas quedan `'human'` (correcto: todas fueron humanas).

### `legal_review_decisions`

```sql
alter table legal_review_decisions
  add column origin text not null default 'human' check (origin in ('human', 'system')),
  add column trigger text,                 -- sale_validated | review_approved | manual_retry (solo origin=system)
  add column inherited_from_matriz_id uuid,    -- molde de proyecto heredado
  add column inherited_matriz_version int;     -- versión del molde al aprobar
```

- `decided_by` pasa a ser nullable para decisiones del sistema (verificar constraint actual; si es NOT NULL, la migración lo relaja).
- Cumple FR-002/SC-005: cada aprobación automática es rastreable (origen, gatillo, molde/versión, y el hash ya viaja en la matriz).

## Entidades derivadas (sin persistencia nueva)

- **Estado de cascada del caso** (para la mesa y `MatrizCaseResponse`): derivado de la última `escritura_cascade_run` + datos existentes:
  - `completed` — última corrida completed (minuta generada y entrega registrada)
  - `exception` — última corrida exception (con `causes`)
  - `awaiting_review` — última corrida awaiting_review (política every_sale, revisión pendiente)
  - `legacy` — caso sin corridas (anterior a SDD017): conserva el flujo manual actual
- **Causas accionables**: los `approval_blockers` humanizados de SDD016 tal cual (título, descripción, fix_url) congelados en `causes` al momento de la corrida.

## Reglas de transición (cascada)

```text
venta validada ──► staging + snapshot ──► ¿blockers?
                                            ├─ sí ──► run(exception, causes) + notificación ──► [corrección humana] ──► manual_retry
                                            └─ no ──► ¿política?
                                                       ├─ every_sale ──► run(awaiting_review) ──► [humano aprueba revisión] ──► review_approved ──► aprobar(system) ──► generar ──► entregar ──► run(completed)
                                                       │                                    └──► [humano rechaza] ──► run(exception, causa=revisión rechazada + comentario)
                                                       └─ exceptions_only ──► aprobar(system) ──► generar ──► entregar ──► run(completed)
```

- Rechazo de revisión, molde re-aprobado o dato corregido post-entrega NUNCA regeneran solos (FR-011): siempre `manual_retry` o regeneración explícita.
- Todos los pasos re-verifican estado en base antes de actuar (D6): `manual_retry` sobre un caso ya completado termina en `completed` sin efectos.
