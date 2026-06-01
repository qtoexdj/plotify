# Documento de Diseño: UI/UX Premium Upgrade

Este documento define la arquitectura visual, el sistema de tokens semánticos, las directrices de animación y la especificación de componentes responsivos del rediseño UI/UX de **Plotify** implementados en el monorepo `apps/web`.

---

## 1. Sistema de Tokens Semánticos (OKLCH)

Hemos abandonado los colores hardcodeados de Tailwind (e.g. `slate-`, `blue-`, `green-`) a favor de un sistema adaptativo calibrado en OKLCH que garantiza alto contraste y accesibilidad (WCAG 2.2 AA/AAA) tanto en Light Mode como en Dark Mode.

### 1.1 Configuración de Variables en `globals.css`

Los nuevos tokens se declaran a nivel de CSS nativo dentro de la directiva `@theme inline` de Tailwind CSS v4:

```css
:root {
  /* Éxito - Emerald Calibrado */
  --success: oklch(0.627 0.194 149.213);
  --success-foreground: oklch(0.985 0.007 106.5);

  /* Advertencia - Amber Calibrado */
  --warning: oklch(0.769 0.188 70.08);
  --warning-foreground: oklch(0.141 0.019 72.805);

  /* Acento de Marca - Teal/Cyan (Hue 190) */
  --accent: oklch(0.705 0.15 190);
  --accent-foreground: oklch(0.98 0.01 190);

  /* Gradiente de Marca */
  --brand-gradient: linear-gradient(135deg, oklch(0.55 0.22 260) 0%, var(--accent) 100%);
}

.dark {
  /* En Dark Mode se disminuye la luminosidad de los fondos pero se incrementa la vibrancia */
  --success: oklch(0.68 0.18 150);
  --success-foreground: oklch(0.12 0.03 150);

  --warning: oklch(0.79 0.16 70);
  --warning-foreground: oklch(0.11 0.02 70);

  --accent: oklch(0.73 0.13 190);
  --accent-foreground: oklch(0.12 0.02 190);
}
```

---

## 2. Experiencia de Sidebar Premium

El Sidebar utiliza la primitiva oficial de `@/components/ui/sidebar` con tres mejoras de marca y accesibilidad:

### 2.1 Workspace Header

- **Gradiente**: Reemplaza el fondo plano por `--brand-gradient` para una apariencia tridimensional moderna.
- **Logotipo**: Se integra un isologo SVG geométrico tridimensional isométrico de 3 capas superpuestas que simbolizan el parcelamiento de loteos.

### 2.2 Estructura Categorizada

- Organizado bajo grupos temáticos en mayúsculas: `PRINCIPAL`, `HERRAMIENTAS` y `CONFIGURACIÓN`.
- Los encabezados de sección se colapsan suavemente y las etiquetas no desbordan visualmente.

### 2.3 Badges de Actividad Dinámica

- Conectores en tiempo real muestran insignias circulares para elementos clave como "Leads" y "Aprobaciones".
- **Comportamiento**: Auto-ocultamiento absoluto cuando el valor del contador es igual a `0`.

---

## 3. Centro de Notificaciones y Motion Design

### 3.1 Unificación de Iconografía

- Se removió por completo `lucide-react` en el feed.
- Todos los iconos se unificaron usando `@hugeicons/react` en su set sólido/lineal (Stroke 1.2/1.5) para una forma premium cohesiva.

### 3.2 Segmentación Temporal

Las notificaciones se clasifican reactivamente bajo banners temporales relativos:

- **Hoy**: Notificaciones recibidas en las últimas 24 horas.
- **Ayer**: Notificaciones del día calendario anterior.
- **Esta semana**: Notificaciones de los últimos 7 días.
- **Anteriores**: Historial remanente.

### 3.3 Micro-Interacciones y Easing

- **Keyframe `fade-in-up`**:
  ```css
  @keyframes fade-in-up {
    0% {
      opacity: 0;
      transform: translateY(8px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .animate-fade-in-up {
    animation: fade-in-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  ```
- **Optimistic State Updates**: El botón de aprobaciones se marca instantáneamente como resuelto en la UI local. Si la llamada de red falla, se gatilla un rollback seguro con Sonner restaurando el estado pendiente.

---

## 4. Vacíos de Contenido y Onboarding Checklist

### 4.1 Reutilización de `<EmptyState />`

El componente `<EmptyState />` de `apps/web/src/components/dashboard/empty-state.tsx` unifica todas las páginas vacías (`projects`, `clients`, `vendors`):

- Recibe un `HugeIcon` decorado con un círculo de fondo difuminado.
- Mapea un título claro, descripción informativa y un CTA de acción opcional.

### 4.2 Onboarding Interactivo (`<OnboardingChecklist />`)

Si el dashboard no reporta proyectos (`kpis.totalProjects === 0`), se ocultan las estadísticas vacías y se renderiza un panel interactivo premium:

- Monitorea reactivamente si se han completado los pasos:
  1. _Crea tu primer proyecto_ (`hasProjects`).
  2. _Habilita a un vendedor_ (`hasVendors`).
  3. _Registra tu primer cliente_ (`hasClients`).
- Muestra una barra de progreso radial e iconografía adaptativa (checks de color éxito en ítems completados).

---

## 5. Arquitectura de Componentes y Mobile Stack

### 5.1 `<ProjectCard />` con Class Variance Authority (CVA)

Soporta variantes de visualización para máxima flexibilidad:

- `grid`: Vista clásica en tarjetas de mosaico con imágenes completas y KPIs en grilla.
- `list`: Layout horizontal óptimo para listas densas en desktop.
- `compact`: Visualización minimalista de altura reducida ideal para barras laterales y widgets del home.

### 5.2 `<LotStatusBadge />`

Unifica el inventario de lotes (`disponible`, `reservado`, `vendido`):

- Calibrado con variables semánticas OKLCH.
- Incorpora un punto de color circular reactivo y accesible.

### 5.3 Mobile Stack (Touch Targets >= 44px)

Para pantallas inferiores a `768px`, las tablas tradicionales de leads y vendedores se ocultan y apilan en tarjetas verticales independientes:

- Cada tarjeta contiene tipografía adaptativa y espaciados amigables para pulgares.
- Los botones interactivos y acciones de diálogo flotante se expanden a una altura mínima de `44px` (`h-11`) para evitar errores táctiles y cumplir con las normas de accesibilidad móviles de primer nivel.
