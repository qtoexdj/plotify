# API Contracts: Stabilize Plotify MVP

This file lists verified existing API contracts and planned deltas. Existing
paths are from `packages/contracts/openapi/plotify-chat.v1.json` and
`apps/api/api/v1/endpoints/*`. New implementation must update FastAPI and then
run `pnpm contracts:generate`; this document does not replace OpenAPI.

## Existing Contracts To Preserve

### Reservation Request

- Method/path: `POST /api/v1/approvals/request-reservation`
- Operation id: `requestReservationApproval`
- Existing request schema: `ReservationRequest`
- Existing response: approval id for the pending request
- Current source:
  - `apps/api/api/v1/endpoints/approvals.py`
  - `apps/web/src/lib/services/approvals.service.ts`

Required behavior:

- Validate lot belongs to claimed organization by deriving organization from
  persisted lot/project relationship.
- Reject unavailable lots.
- Reject duplicate pending requests.
- Insert `approval_requests`.
- Enqueue `notify_admin_approval`.

### Telegram Webhook

- Method/path: `POST /api/v1/webhook/telegram/{org_id}`
- Existing source: `apps/api/api/v1/endpoints/webhook.py`

Required behavior:

- For callback data `approve:{approval_id}` or `reject:{approval_id}`, enqueue
  the admin decision worker.
- Answer callback query and remove buttons from the Telegram message.
- Keep callback handling idempotent with already-processed decisions.

### Document Preview

- Method/path: `POST /api/v1/documents/preview`
- Operation id: `previewDocument`
- Existing response: `{ html }`

Required behavior:

- Validate tenant from lot/template context.
- Render using backend variables, not frontend-only substitution.
- P1 delta: include or pair with variable status before final generation.

### Document Generation

- Method/path: `POST /api/v1/documents/generate`
- Operation id: `generateDocument`
- Existing request: template id, lot id, organization id, format, generated_by
- Existing response: `{ file_url, format }`

P1 required response delta:

```json
{
  "document_id": "uuid",
  "file_url": "signed-or-public-url",
  "format": "pdf",
  "document_type": "reserva",
  "version_number": 1,
  "lot_id": "uuid",
  "template_id": "uuid",
  "missing_variables_accepted": false
}
```

Notes:

- Field names can be adjusted during implementation, but the generated OpenAPI
  contract must expose persisted document identity and version metadata.
- The current backend `persist_document` returns only URL, so it must be changed
  to return persisted metadata.

### Document Variables

- Method/path: `GET /api/v1/documents/variables/{lot_id}`
- Existing response: flat variable dictionary from `resolve_variables`

P1 required delta:

```json
{
  "variables": {
    "comprador": {},
    "vendedor": {},
    "matriz": {},
    "sag": {},
    "lote": {},
    "servidumbre": {},
    "transaccion": {},
    "mandato": {},
    "personeria": {}
  },
  "available": ["comprador.nombre", "lote.deslindes"],
  "missing": ["matriz.inscripcion_fojas"],
  "sources": {
    "lote.deslindes": "geometry",
    "comprador.nombre": "lot_record",
    "matriz.inscripcion_fojas": "project_legal_data"
  }
}
```

Notes:

- Exact shape must be committed in `packages/contracts` and generated clients.
- Existing flat variables may remain as compatibility during migration.

## P1 New Contract Needs

### Seller Telegram Reservation Operation

Current gap:

- The existing Telegram webhook and message worker support bot messages, but the
  MVP contract must explicitly support assigned sellers operating from Telegram.

Contract requirement:

- Linked seller can query assigned project/lot availability from Telegram.
- Linked seller can submit reservation buyer data from Telegram.
- Server verifies seller assignment from persisted project/vendor relations
  before exposing lot data or creating an approval request.
- The resulting reservation request uses the same approval request contract as
  the web flow.

### Web Admin Reservation Decision

Current gap:

- Telegram can resolve reservation decisions.
- Web admin decision path is required by the spec but was not found as a
  verified API contract.

Contract requirement:

- Admin can approve/reject a pending reservation from web.
- Server-side handler verifies authenticated admin membership for the request's
  organization before mutation.
- Uses the same locked resolution semantics as Telegram.
- Returns success or already-processed state.

Implementation options:

- Add a FastAPI endpoint and regenerate OpenAPI.
- Or add a Next.js server action that verifies membership and calls existing
  database RPCs safely.

The implementation must document which option is chosen in the later technical
plan/tasks before code changes.

## P2 New Contract Needs

### Sale Approval

Current gap:

- `directSale` exists, but the spec wants admin approval parity with reservation.

Contract requirement:

- Vendor/admin can request sale from an eligible lot:
  - `disponible` for direct sale.
  - `reservado` for sale after reservation.
- Admin can approve/reject from Telegram or web.
- Approved sale changes lot state to sold atomically.
- Rejected sale preserves previous commercial state (`disponible` or
  `reservado`).
- The sale request contract must include or server-derive `sale_mode` and
  `previous_lot_state` so Telegram, audit, and RPC resolution can distinguish
  direct sale from sale after reservation.
- The server must validate tenant, vendor assignment, current lot state, and
  absence of any pending approval for the same lot before inserting.
- If an admin initiates the sale and is not a vendor, the request must use a
  valid `vendors.id` from the lot/project context, not the admin `user.id`.

Implementation options:

- Extend `approval_requests` with a request type and add sale resolution RPC.
- Or add a separate sale approval table/RPC set if migration analysis rejects
  overloading.

### Escritura Generation

Contract requirement:

- Resolve escritura variables from project, lot, buyer, geometry, organization,
  and reviewed legal project data.
- Return missing-variable status before generation.
- Generate PDF/DOCX with snapshot and explicit version metadata.
- Track which uploaded project documents informed reviewed variables.

## Contract Verification

After API changes:

```bash
pnpm contracts:generate
pnpm typecheck:web
pnpm test:web
pnpm test:api
```
