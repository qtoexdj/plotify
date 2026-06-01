# Espec. Funcional: 003 - Hardening de Diseño Visual y Accesibilidad (Fase 1)

## 📌 Contexto y Objetivo

Plotify requiere que su interfaz de usuario sea altamente pulida, moderna y premium (siguiendo las directrices del archivo `design.md`), al mismo tiempo que cumple estrictamente con el nivel de conformidad **WCAG 2.2 Nivel AA** de accesibilidad.

Esta especificación cubre la **Fase 1: Cimientos de Diseño Visual y Accesibilidad Global**, que sienta las bases técnicas (grilla de 8 puntos, tipografía fluida y navegación por teclado en layouts principales) antes de abordar interacciones complejas.

---

## 🎯 Criterios de Aceptación

### 1. Sistema de Espaciados e Identidad Visual (Fundamentos)

- **Grilla de 8 puntos**: Definición unificada de las variables de espaciado `--space-1` a `--space-16` en el tema de Tailwind CSS v4 en `apps/web/src/app/globals.css`.
- **Tipografía Fluida**: Implementación de tamaños de letra adaptativos para títulos (`h1`, `h2`) y textos de párrafo utilizando la función CSS `clamp()`.
- **Reducción de Movimiento**: Configuración de media query `prefers-reduced-motion` en el CSS global para desactivar transiciones o animaciones en clientes con sensibilidad motriz o que así lo tengan configurado en el sistema operativo.

### 2. Navegación por Teclado e Inclusión (Accesibilidad)

- **Skip to Content Link**: Inclusión de un enlace accesible y oculto ("Saltar al contenido principal") al inicio del layout del Dashboard (`apps/web/src/app/(dashboard)/layout.tsx`) que se focalice e interactúe mediante la tecla `TAB`.
- **Indicadores de Enfoque Claros**: Reemplazo de directivas de eliminación de contornos (`outline-none`) por anillos de enfoque visibles en todos los componentes interactivos, asegurando una visibilidad de contraste óptima de 3:1 mínimo.
- **Estructura Semántica**: Asegurar que las secciones principales del layout utilicen landmarks HTML5 (`<main>`, `<header>`, `<nav>`, `<aside>`) de forma correcta.

---

## 🛠️ Componentes Afectados

1. **[globals.css](file:///Users/matiasburgos/Developer/plotify/apps/web/src/app/globals.css)**: Centralización de variables, escala de espaciado, tipografía fluida y reduced-motion.
2. **[Dashboard Layout](<file:///Users/matiasburgos/Developer/plotify/apps/web/src/app/(dashboard)/layout.tsx>)**: Inclusión del skip-link, semántica de landmarks y comportamiento de enfoque.

---

## ♿ Estándares de Accesibilidad a Validar (WCAG 2.2 AA)

- **1.4.3 Contraste (Mínimo)**: Todo texto y componente debe cumplir un contraste mínimo de 4.5:1 (texto normal) y 3:1 (UI e interactivos).
- **2.1.1 Teclado**: Todo el flujo de navegación del header y sidebar principal debe ser operable por teclado.
- **2.4.1 Evitar Bloques**: El enlace "Skip to Content" debe funcionar correctamente y enviar el foco al contenedor principal (`#main-content`).
- **2.4.7 Foco Visible**: Cualquier elemento enfocado debe poseer un anillo visible de alta visibilidad.
