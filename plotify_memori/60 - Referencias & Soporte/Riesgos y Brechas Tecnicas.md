---
title: Riesgos y Brechas Tecnicas
date: 2026-04-14
tags:
  - revision
  - riesgos
  - seguridad
  - deuda-tecnica
status: draft
---

# Riesgos y Brechas Tecnicas

> [!warning]
> Esta nota separa hallazgos por severidad decisional. No todos son bugs confirmados en runtime, pero si son puntos que pueden bloquear despliegue o crecimiento si no se resuelven.

## Contratos frontend-backend

### Alto: Prompt Ops no tiene puente consistente

Evidencia:

- `plotify_chat/api/v1/endpoints/prompts.py` define:
  - `GET /api/v1/prompts/`
  - `GET /api/v1/prompts/{prompt_id}/versions`
  - `POST /api/v1/prompts/{prompt_id}/versions`
  - `PUT /api/v1/prompts/{prompt_id}/activate/{version_id}`
  - `POST /api/v1/prompts/sandbox`
- `plotify/src/lib/services/prompt-ops.service.ts` usa rutas distintas:
  - `POST /api/v1/prompts/{promptId}/versions/{versionId}/activate`
  - `POST /api/v1/prompts/sandbox/test`
- Componentes UI (`prompt-editor`, `prompt-history`, `prompt-sandbox`) llaman `/api/prompt-ops/...`, pero no hay route handlers bajo `plotify/src/app/api/prompt-ops`.
- `microservice.client.ts` envia `Authorization: Bearer`, mientras `verify_super_admin` exige `X-User-Id`.

Impacto:

- La UI de Prompt Ops puede verse lista, pero fallar al guardar, activar o probar prompts.
- La seguridad real queda ambigua: no esta claro si manda token Supabase, user id confiable o ambos.

Decision requerida:

- O crear route handlers Next.js `/api/prompt-ops` que validen Supabase Auth, calculen `X-User-Id` y llamen FastAPI.
- O consumir FastAPI directamente desde server services con un contrato corregido.

### Alto: Documentos legales no pasan `organization_id` al generador

Evidencia:

- Backend `GenerateRequest` requiere `organization_id`.
- Frontend `generateDocumentAction` llama `generateDocApi({ template_id, lot_id, format, generated_by })` sin `organization_id`.
- `GenerationWizard` recibe `organizationId`, pero `handleGenerate` no lo pasa.
- Backend responde `{ file_url, format }`, frontend tipa `{ file_url, document_id }`.

Impacto:

- La generacion PDF/DOCX via microservicio puede responder 422 o romper la expectativa de datos.
- La trazabilidad legal (`generated_documents.organization_id`, `variables_snapshot`) depende de ese campo.

Decision requerida:

- Hacer que el backend derive `organization_id` desde `template_id`/`lot_id`, o que el frontend lo envie explicitamente y el backend lo verifique.

### Medio: Preview local y generacion real usan modelos de variables diferentes

Evidencia:

- Frontend `GenerationWizard` resuelve `{{ vendedor.nombre }}`, `{{ comprador.rut }}`, `{{ lote.deslindes }}` desde `EscrituraVariables`.
- Backend `document_engine.py` resuelve variables planas como `cliente_nombre`, `numero_lote`, `proyecto_comuna`.

Impacto:

- Lo que el usuario ve en preview puede no coincidir con el PDF/DOCX final.

Decision requerida:

- Unificar un diccionario canonico de variables para documentos.
- Mantener preview local solo si reutiliza el mismo contrato de variables.

## Base de datos y migraciones

### Alto: Dos fuentes de migracion para una misma DB

Evidencia:

- `plotify/supabase/migrations` contiene el core, RLS, Prompt Ops, skills y documentos.
- `plotify_chat/supabase/migrations` agrega `leads`, `organization_payment_info`, `dead_letter_queue`.
- La revision con MCP `supabase-local` confirma 60 migraciones aplicadas en DB local contra 29 archivos `.sql` versionados en los repositorios actuales. Ver [[Revision Base de Datos Supabase 2026-04-14]].
- La DB local tiene aplicadas migraciones clave que no aparecen como archivo con esa version: `create_document_tables`, `create_documents_bucket`, `create_mcp_connections`, `vault_setup_and_refactor_telegram` y varias de storage.

Impacto:

- Ambiguedad al levantar entornos nuevos.
- Riesgo de orden incorrecto entre migraciones.
- Los tipos TypeScript pueden quedar incompletos si se generan desde una DB sin migraciones del microservicio.
- Riesgo de que un entorno limpio no tenga las mismas tablas/buckets que la DB local usada para desarrollar.

Decision requerida:

- Elegir una fuente unica de migraciones o crear una convencion formal de ownership y orden.

### Medio: Operaciones multi-step fuera de transaccion

Evidencia:

- Reservas/ventas usan RPC atomicas (`reserve_lot`, `direct_sale_lot`).
- Asignacion de geometria, recalculo de servidumbres, creacion de proyecto+lotes y documentos mezclan varias operaciones desde TypeScript o Python.

Impacto:

- Estados parciales si una segunda escritura falla.
- Mayor esfuerzo para auditar operaciones legales o comerciales.

Decision requerida:

- Toda operacion con impacto comercial/legal debe ser RPC transaccional o endpoint backend con transaccion explicita.

## Seguridad

### Alto: Service role en microservicio exige validacion de tenant en cada endpoint

Estado 2026-04-15:

- Mitigado para `documents/preview`, `documents/generate` y `approvals/request-reservation`.
- Backend deriva `organization_id` desde `lot_id` y rechaza payloads cross-tenant.
- Queda como politica general para nuevos endpoints service-role.

Evidencia:

- `plotify_chat/core/database.py` usa `SUPABASE_SERVICE_ROLE_KEY`.
- Endpoints de documentos, integrations y prompts reciben `organization_id`/`user_id` por request o query.

Impacto:

- Service role bypasses RLS. Si el frontend manda un `organization_id` incorrecto y el backend no lo valida, hay riesgo de acceso cross-tenant.

Decision requerida:

- Definir una politica: todo endpoint service-role debe verificar ownership contra DB antes de leer/escribir.

### Medio: MCP Gateway puede ejecutar llamadas externas configurables

Evidencia:

- `mcp_connections.server_url` se usa para `POST {server_url}/tools/{tool_name}`.
- Las credenciales descifradas se mandan al servidor MCP externo.

Impacto:

- Riesgo SSRF o exfiltracion si `server_url` no esta restringido.

Decision requerida:

- Allowlist por proveedor, validacion de esquema/host y timeouts/retries/auditoria.

### Medio: HTML documental en frontend usa `dangerouslySetInnerHTML`

Evidencia:

- `GenerationWizard` renderiza preview local con `dangerouslySetInnerHTML`.
- Backend Jinja2 tiene `autoescape=True`, pero el preview frontend hace reemplazo local.

Impacto:

- Si templates o variables contienen HTML no confiable, preview puede ejecutar markup no esperado.

Decision requerida:

- Sanitizar HTML antes del preview o renderizar preview desde el microservicio con sanitizacion controlada.

## Testing y operacion

### Resuelto: Python tests ya no requieren `PYTHONPATH=.`

Evidencia:

- `pytest.ini` configura `pythonpath = .`, siguiendo la opcion soportada por pytest.
- `./venv/bin/pytest -q` pasa sin variable de entorno: 70 tests pasados, 2 omitidos.

Decision tomada:

- Mantener comando canonico limpio: `./venv/bin/pytest -q`.

### Resuelto: Frontend test suite fallaba por mock incompleto

Evidencia:

- `src/components/app-sidebar.tsx` importa `File02Icon`.
- El mock de `@hugeicons/core-free-icons` en `tests/fase3-components.test.ts` ahora define `File02Icon`.
- `npm test -- --run` pasa: 23 archivos, 443 tests.

Impacto:

- Gate frontend desbloqueado.

## Relacionado

- [[Revision Integral 2026-04-14]]
- [[Revision Base de Datos Supabase 2026-04-14]]
- [[Mapa de Integracion Frontend Backend]]
- [[Matriz de Decisiones Pendientes]]
- [[Seguridad Backend]]
- [[Politicas RLS]]
- [[Generacion de Documentos]]
