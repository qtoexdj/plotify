# Checklist: Calidad de Diseño y UX (015)

**Purpose**: gate de calidad visual/UX antes de cerrar el feature. Completar en la Fase 6 (T043).

## Identidad y tokens

- [ ] CHK001 Ningún color fuera de tokens (grep SC-001 = 0) [FR-001, FR-012]
- [ ] CHK002 `design.md` v2 sincronizado 1:1 con `globals.css`, con tabla AA [FR-002]
- [ ] CHK003 `--brand` tokenizado; recolor de logo = 1 token + regenerar assets [FR-004, SC-008]
- [ ] CHK004 Carmesí primario y destructive nunca ambiguos en una misma vista (regla documentada) [Edge]
- [ ] CHK005 Dark mode diseñado (no invertido): revisión de las 6 secciones + super-admin en oscuro [FR-001]

## Tipografía

- [ ] CHK006 Onest en cuerpo, Bricolage en h1–h3 y cifras, mono en ROL/montos, serif solo en documento de mesa [FR-003]
- [ ] CHK007 Inter y Geist Sans eliminadas del bundle [SC-007]
- [ ] CHK008 Un solo `h1` por página (PageHeader) [FR-014]

## Navegación

- [ ] CHK009 Sidebar plano 6 ítems + Buscar + footer; sin grupos ni submenús [FR-005]
- [ ] CHK010 Tabs internos en Escrituras y Agente con URLs conservadas [FR-006]
- [ ] CHK011 ⌘K funcional con teclado (abrir, navegar, Escape) [FR-007]
- [ ] CHK012 Header sin búsqueda [FR-008]
- [ ] CHK013 Estado activo correcto en sub-rutas [FR-005]

## Feedback

- [ ] CHK014 Solo Spinner/BrandLoader/Skeleton como indicadores (grep SC-002 = 0 + test guardia) [FR-009]
- [ ] CHK015 BrandLoader únicamente en pantallas completas [FR-009]
- [ ] CHK016 StatusBadge único para estados de lote y semánticos [FR-010]
- [ ] CHK017 EmptyState en todas las listas vacías [FR-011]
- [ ] CHK018 reduced-motion: loaders siguen informativos sin animación [FR-016]

## Consistencia

- [ ] CHK019 Una sola librería de iconos en producto (grep SC-003 = 0) [FR-013]
- [ ] CHK020 PageShell en 100% de páginas dashboard + super-admin [FR-014, SC-004]
- [ ] CHK021 Colores de mapa centralizados en `lib/map/lot-colors.ts` [FR-012]

## Responsive y accesibilidad

- [ ] CHK022 375px sin scroll horizontal en todas las rutas del quickstart [FR-015, SC-005]
- [ ] CHK023 Mesa móvil con patrón del visor (sheet/colapsables) [FR-015]
- [ ] CHK024 Visor de proyecto sin regresión [FR-015]
- [ ] CHK025 Tablas con scroll propio o vista tarjeta en móvil [FR-015]
- [ ] CHK026 Targets táctiles ≥44px en acciones primarias [FR-016]
- [ ] CHK027 Contraste AA verificado por par de tokens en ambos temas [FR-016, SC-006]
- [ ] CHK028 Focus-visible y skip-link intactos [FR-016]

## Gates

- [ ] CHK029 `pnpm typecheck:web && pnpm test:web && pnpm build:web` verdes [FR-017, SC-009]
