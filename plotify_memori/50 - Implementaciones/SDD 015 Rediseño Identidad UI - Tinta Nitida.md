# SDD 015 Rediseño Identidad UI - Tinta Nitida

Estado actualizado: cierre de correcciones del SDD 015.

## Dirección Implementada

- Paleta "Tinta nítida": monocromo de alto contraste con acento carmesí para UI.
- Logo/isotipo mantiene verde `#16A34A` mediante token `--brand`; no se mezcla con `--primary`.
- Sidebar dashboard y super-admin usan panel oscuro `variant="inset"` con redondeado visual.
- Tipografía: Bricolage Grotesque para display, Onest para UI/cuerpo, Source Serif 4 para mesa de escritura, Geist Mono para datos/códigos.

## Cierre Técnico

- `design.md` v2.0.0 y `globals.css` quedan sincronizados.
- `CommandPaletteProvider` está montado en dashboard y super-admin.
- Agente queda normalizado con `PageShell` + `PageHeader`.
- Mesa de escritura móvil adopta documento a ancho completo y bottom sheets para índice/datos.
- Tabs internos y sidebar cumplen target táctil mínimo de 44 px.
- Guard tests cubren loaders prohibidos, colores crudos y contratos principales del shell SDD 015.

## Desviaciones Y Decisiones

- Telegram mantiene `#2AABEE` como color de marca de tercero, fuera del sistema de tokens de Plotify.
- Colores literales de MapLibre quedan permitidos solo en `apps/web/src/lib/map/lot-colors.ts`.
- Assets de marca no se regeneraron porque no hubo recolor de los SVG maestros.
- El recorrido visual de super-admin requiere una cuenta con rol super-admin; el contrato estructural queda cubierto por build/tests y quickstart.

## Verificación

- Gates esperados: `pnpm typecheck:web`, `pnpm test:web`, `pnpm build:web`.
- Greps esperados en cero: loaders prohibidos, imports `lucide-react` fuera de `components/ui/*`, clases Tailwind crudas fuera de lista blanca MapLibre.

