# Contrato: aprobar el molde en un clic

**Relacionado**: FR-011, FR-012, FR-013, FR-014, US2. Archivos: `apps/web/src/components/projects/legal/variable-matrix/`, endpoints `escritura-matrices/{id}/submit` y `/approve` (existentes), `bulk-approve` (existente).

## Flujo del botón "Aprobar molde"

1. **Recolectar** las variables `proposed` del molde con `confidence >= 0.9` y con evidencia.
2. **Mostrar diálogo** de confirmación listándolas: "Al aprobar, apruebas estas N variables extraídas — ver detalle".
3. Al confirmar, en orden:
   a. `POST /api/projects/{projectId}/legal-variables/bulk-approve` con esas `variable_keys` (endpoint existente; el server inyecta `reviewed_by`).
   b. `POST /api/escritura-matrices/{matrizId}/submit` (draft → legal_review_pending).
   c. `POST /api/escritura-matrices/{matrizId}/approve` (legal_review_pending → approved).
4. **Tras aprobar**: el header muestra "Molde aprobado · esperando ventas" y el botón queda deshabilitado.

## Reglas

- **NO auto-aprobar** variables con `confidence < 0.9`, `confidence = null`, o en conflicto → siguen exigiendo decisión explícita (quedan visibles en la matriz por-variable como drill-down).
- Si faltan huecos obligatorios del molde → el `submit`/`approve` devolverá blockers; mostrar mensaje claro con qué falta (no fallo silencioso).
- **submit+approve colapsados** para rol admin; opción de organización para mantenerlos separados (separación redactor/aprobador) — default colapsado.

## Wiring pendiente (bug actual)

`MoldeProgressHeader` se renderiza SIN `onApproveMolde` en `variable-matrix.tsx:223`. La tarea debe: (1) pasar el handler desde `VariableMatrix`/CCL, (2) implementar el flujo de 3 pasos arriba.

## Contrato de `bulk-approve` (existente, no cambia)

```
POST /api/v1/legal-variables/bulk-approve?project_id={id}
body: { "variable_keys": ["matriz.comuna", "matriz.deslindes.norte", ...] }
```

## Gates heredados (FR-014) — cambio de presentación

Al construir la vista del caso, los gates de proyecto (title_verified, sag_plano_verified, sii_verified de matriz) se marcan como "heredados del molde aprobado" y NO se cuentan en el número de pendientes del caso. La evaluación interna de gates NO cambia (defensa en profundidad). El conteo visible del caso solo incluye: datos de venta, geometry_verified, legal_review_ready.

## Test

- Molde con variables confidence ≥0.9 → clic Aprobar → matriz `approved` + variables aprobadas, en una acción.
- Variable confidence 0.5 → NO se auto-aprueba tras aprobar el molde.
- Caso de una venta → la mesa muestra ≤2 pendientes (no ~35).
