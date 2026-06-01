# Tareas: 003 - Hardening de Diseño Visual y Accesibilidad (Fase 1)

Este checklist detalla las tareas secuenciales requeridas para completar la Fase 1 del endurecimiento de diseño y accesibilidad en el monorepo.

---

## 📋 Lista de Tareas

### Fase 1: Cimientos de Diseño Visual

- [x] **T001**: Centralizar variables de espaciado, clamp tipográfico y reduced-motion en `globals.css`
  - **Criterio de Aceptación**: Variables de espaciado `--space-1` a `--space-16` añadidas en `@theme inline` en [globals.css](file:///Users/matiasburgos/Developer/plotify/apps/web/src/app/globals.css). Media query `@media (prefers-reduced-motion: reduce)` declarada.
  - **Verify**: Inspeccionar el archivo [globals.css](file:///Users/matiasburgos/Developer/plotify/apps/web/src/app/globals.css) para verificar que las clases de espaciado y la media query estén presentes de manera correcta.

- [x] **T002**: Integrar Skip-Link de accesibilidad y estructura semántica en el layout
  - **Criterio de Aceptación**: Agregar un componente de enlace functional con clase `sr-only focus:not-sr-only` al inicio de `apps/web/src/app/(dashboard)/layout.tsx` enlazando a `#main-content`. El elemento `<main>` del layout debe llevar `id="main-content"` y `tabIndex={-1}`.
  - **Verify**: Verificar que el código se compile adecuadamente y comprobar en pantalla la inyección de las nuevas propiedades semánticas.

- [x] **T003**: Estandarizar anillos de enfoque interactivo en la capa base de estilos
  - **Criterio de Aceptación**: Configurar contornos de enfoque visibles de alto contraste en `globals.css` en la capa `@layer base` usando el color primario de Plotify, evitando la remoción por defecto de focos (`outline-none`).
  - **Verify**: Inspeccionar [globals.css](file:///Users/matiasburgos/Developer/plotify/apps/web/src/app/globals.css) en busca de las reglas `*:focus-visible` aplicadas.

- [x] **T004**: Validación de calidad y verificación de navegación con teclado
  - **Criterio de Aceptación**: Pasar con éxito todos los gates de calidad locales (`pnpm --filter web lint`, `pnpm format:check` y `pnpm build:web`).
  - **Verify**: Ejecutar los comandos indicados en la consola y verificar que no arrojen errores.
