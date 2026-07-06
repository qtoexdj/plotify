# Contrato: verificación masiva de lotes por tolerancia

**Relacionado**: FR-026, US5. Archivos: nuevo endpoint API + acción web; base `apps/web/src/actions/lot-verification.action.ts:190` (`saveAndVerifyLot`).

## Endpoint nuevo

```
POST /api/v1/projects/{projectId}/lots/bulk-verify?organization_id={org}
```

**Auth**: admin de la organización (RPC `is_project_admin`/`is_org_admin`).

**Request body**:

```json
{ "tolerance_pct": 0.5 }
```

(default 0,5%; configurable por el usuario en la UI.)

**Lógica**:

- Para cada lote del proyecto con geometría asignada, comparar superficie y perímetro **calculados** vs **oficiales**.
- Si `abs(diff) <= tolerance_pct` en ambos → marcar `verified_status = 'verified_exact'`, `verified_by = <admin user_id>`, `verified_at = now()`.
- Los que exceden tolerancia → NO se tocan (quedan para revisión manual).
- Los que no tienen geometría → se omiten.
- Todo en una transacción auditada (audit_logs por lote verificado o un evento bulk).

**Response**:

```json
{
  "verified": 47,
  "deviated": ["lotId1", "lotId2"],
  "skipped_no_geometry": ["lotId3"]
}
```

## Ruta proxy web

`apps/web/src/app/api/projects/[id]/lots/bulk-verify/route.ts` — valida rol admin, reenvía.

## UI

- Botón "Verificar los lotes que coinciden con el plano" en la pestaña Lotes / checklist del proyecto.
- Control de tolerancia (default 0,5%).
- Resumen tras ejecutar: "N verificados · M desviados para revisión · K sin geometría".
- Los desviados enlazan al panel de verificación manual existente (`LotVerificationPanel`, que se conserva).

## Test

- Proyecto con lotes diff 0,0% → bulk-verify → todos `verified_exact` con `verified_by` admin.
- Lote con diff 5% → NO se auto-verifica, aparece en `deviated`.
- Lote sin geometría → aparece en `skipped_no_geometry`.
