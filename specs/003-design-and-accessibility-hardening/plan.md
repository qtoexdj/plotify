# Plan Técnico: 003 - Hardening de Diseño Visual y Accesibilidad (Fase 1)

Este documento detalla el plan técnico para aplicar los cimientos del diseño visual (grilla de 8 puntos, tipografía fluida y reduced-motion) y accesibilidad global (skip-links y foco visible) en el cliente web de Plotify.

---

## 🎨 Arquitectura de Cambios

### 1. Centralización de Tokens en `globals.css`

Ajustaremos la sección `@theme inline` en `apps/web/src/app/globals.css` para incorporar las variables y tokens definidos:

- **Espaciados**: Agregar la escala de espaciado basada en múltiplos de 8 píxeles.
- **Tipografía**: Crear clases utilitarias de fuentes adaptativas usando `clamp()` y limitar los anchos de línea a 70 caracteres en textos prose.
- **Foco Accesible**: Declarar un estilo unificado de contorno de enfoque (`focus-visible`) que herede del color primario OKLCH y provea un excelente contraste cromático.
- **Preferencia de Animaciones**: Inyectar la regla global `@media (prefers-reduced-motion: reduce)` para desactivar todas las transiciones complejas si el usuario así lo solicita a su sistema.

### 2. Estructuración Semántica y Skip-Link en `layout.tsx`

Modificaremos `apps/web/src/app/(dashboard)/layout.tsx` para:

- Añadir el botón accesible al inicio del DOM del layout con clases específicas de Tailwind para que solo sea visible cuando esté enfocado por teclado.
- Envolver el contenedor secundario en la etiqueta semántica `<main id="main-content" tabindex="-1">`, permitiendo que el foco se transfiera de forma programática.
- Comprobar que los contenedores usen las clases semánticas correctas de Tailwind para layout (`header`, `main`).

---

## Proposed Changes

### [web] apps/web

#### [MODIFY] [globals.css](file:///Users/matiasburgos/Developer/plotify/apps/web/src/app/globals.css)

- Integrar la escala de espaciado en la directiva `@theme inline`.
- Declarar reglas tipográficas adaptativas y de limitación de ancho.
- Añadir la regla global de reducción de movimiento.
- Configurar estilos por defecto de enfoque en la capa `@layer base`.

#### [MODIFY] [layout.tsx](<file:///Users/matiasburgos/Developer/plotify/apps/web/src/app/(dashboard)/layout.tsx>)

- Añadir el componente skip-link accesible al inicio del layout.
- Añadir el ID `main-content` y el atributo `tabIndex={-1}` a la etiqueta `<main>`.

---

## ♿ Plan de Verificación y Control de Calidad

### Pruebas de Calidad Locales

Ejecutaremos los gates de calidad obligatorios de Plotify para la aplicación web antes de dar la tarea por concluida:

1. `pnpm --filter web lint`
2. `pnpm format:check`
3. `pnpm build:web`

### Pruebas de Accesibilidad Manual

1. **Navegación por Teclado**: Presionar la tecla `TAB` al cargar el Dashboard. Verificar que el primer elemento enfocado sea el botón "Saltar al contenido principal" y que sea visible en pantalla.
2. **Transferencia de Foco**: Al hacer click o presionar Enter en el skip-link, el foco del teclado debe saltar directamente al contenido principal (`#main-content`).
3. **Visibilidad de Foco**: Navegar por la página utilizando el teclado (`TAB` y `Shift + TAB`) y verificar que todos los enlaces, botones e inputs interactivos tengan un borde de enfoque claramente visible y contrastado.
