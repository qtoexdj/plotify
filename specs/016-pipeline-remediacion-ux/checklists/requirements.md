# Specification Quality Checklist: Remediación pipeline venta→escritura y UX

**Purpose**: Validar completitud y calidad de la especificación antes de planificar/implementar.
**Created**: 2026-07-06
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Cada requisito funcional es testeable (FR-001..FR-030 con Verify en tasks/quickstart).
- [x] Las historias de usuario están priorizadas (P1..P3) y son independientemente testeables.
- [x] Los criterios de éxito son medibles y agnósticos de implementación (SC-001..SC-008).
- [x] Los edge cases están enumerados.
- [x] Las entidades clave están descritas sin detalle de implementación innecesario.
- [x] Los human gates (HG-1..HG-3) están explícitos y marcados como responsabilidad del usuario.

## Alcance y límites

- [x] Se declara qué NO se reconstruye (motor SDD 006→011, mesa SDD 010).
- [x] Cada FR referencia el archivo/símbolo/línea real donde se implementa (verificado 2026-07-06).
- [x] La migración es aditiva y acotada; sin renombres ni borrados de columnas.
- [x] Los cambios de seguridad están detrás de un human gate (HG-2).

## Consistencia con la constitución

- [x] Principio III: migración solo en `packages/database/supabase/migrations`.
- [x] Principio IV: cambios de payload → `pnpm contracts:generate`; frontend consume el cliente generado.
- [x] Principio V: `organization_id` inferido del JWT; auditoría de revisión jurídica y verificación masiva.
- [x] Principio VI: cada tarea con Verify; tests de contrato contra el camino venta→escritura (cubre gap FakeStore).

## Trazabilidad plan → spec

- [x] P0.1 → FR-001/002 (US1).
- [x] P1.1 → FR-003/004 (US1/US3). P1.2 → FR-005/006. P1.3 → FR-009/010. P1.4 → FR-018/019 (US3). P1.5 → FR-007/008 (US1).
- [x] P2.1+P6.2 → FR-011/012/013 (US2). P2.3+P5.3 → FR-020/021 (US4). P2.4+P5.2 → FR-022/023 (US4). P2.5+P6.3 → FR-015/016/017 (US3). P2.6 → FR-024 (US4). P5.1 → FR-025 (US4).
- [x] P6.1 → FR-026 (US5). P6.5 → FR-014 (US2).
- [x] P3.1 → FR-027. P3.2 → FR-028 (US6).
- [x] P4 → FR-029/030 (US7). P5.4 → HG-2 + US7.

## Preguntas abiertas (resolver con el usuario antes/durante)

- [ ] **HG-1**: política de auto-aprobación venta-desde-reserva y copia al vendedor por Telegram.
- [ ] **HG-2**: aprobar migración de seguridad + limpieza de datos de prueba.
- [ ] **HG-3**: sesión de usabilidad con usuario nuevo.
- [ ] Rama base: 016 desde `main` o tras mergear 015 (R12).
- [ ] `notaria`/`fecha_firma` en `lot_records`: columnas nuevas o reuso de `firma_lugar`/`firma_fecha` (data-model §1).
- [ ] Estado masivo de lotes: eliminar la UI muerta (default) o agregar `estado` al schema con guard (R9).
