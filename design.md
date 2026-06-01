---
name: 'Plotify Design System'
version: '1.0.0'
author: 'Antigravity & Plotify Team'
license: 'Apache-2.0'
tokens:
  color:
    # Colores Globales Base (Light Mode)
    light:
      background:
        value: 'oklch(1 0 0)'
        description: 'Fondo principal de la aplicación, blanco puro'
      foreground:
        value: 'oklch(0.13 0.028 261.692)'
        description: 'Texto principal, un azul grisáceo extremadamente oscuro que evita la fatiga del negro puro'
      card:
        value: 'oklch(1 0 0)'
        description: 'Fondo de tarjetas y contenedores elevados'
      card-foreground:
        value: 'oklch(0.13 0.028 261.692)'
        description: 'Texto dentro de tarjetas y contenedores'
      popover:
        value: 'oklch(1 0 0)'
        description: 'Fondo de menús emergentes y popovers'
      popover-foreground:
        value: 'oklch(0.13 0.028 261.692)'
        description: 'Texto de menús emergentes y popovers'
      primary:
        value: 'oklch(0.488 0.243 264.376)'
        description: 'Color de marca e interactivo principal, un azul eléctrico de alta saturación y croma'
      primary-foreground:
        value: 'oklch(0.97 0.014 254.604)'
        description: 'Texto sobre botones y fondos primarios, un blanco frío con tinte azul'
      secondary:
        value: 'oklch(0.967 0.001 286.375)'
        description: 'Color secundario para elementos interactivos sutiles o secundarios'
      secondary-foreground:
        value: 'oklch(0.21 0.006 285.885)'
        description: 'Texto sobre elementos secundarios'
      muted:
        value: 'oklch(0.967 0.003 264.542)'
        description: 'Color de fondo para elementos inactivos, deshabilitados o sutiles'
      muted-foreground:
        value: 'oklch(0.551 0.027 264.364)'
        description: 'Texto secundario, etiquetas e indicaciones sutiles'
      accent:
        value: 'oklch(0.967 0.003 264.542)'
        description: 'Fondo para elementos con estado hover o destacados de forma sutil'
      accent-foreground:
        value: 'oklch(0.21 0.034 264.665)'
        description: 'Texto en elementos con estado hover o destacados sutilmente'
      destructive:
        value: 'oklch(0.577 0.245 27.325)'
        description: 'Color para acciones críticas o de peligro, rojo de alta visibilidad'
      border:
        value: 'oklch(0.928 0.006 264.531)'
        description: 'Líneas divisorias y bordes de componentes'
      input:
        value: 'oklch(0.928 0.006 264.531)'
        description: 'Borde de inputs y elementos de formulario en estado de reposo'
      ring:
        value: 'oklch(0.707 0.022 261.325)'
        description: 'Borde de enfoque (focus-ring) para accesibilidad con teclado'
      sidebar:
        value: 'oklch(0.985 0.002 247.839)'
        description: 'Fondo del sidebar lateral'
      sidebar-foreground:
        value: 'oklch(0.13 0.028 261.692)'
        description: 'Texto del sidebar lateral'

    # Colores Globales Base (Dark Mode)
    dark:
      background:
        value: 'oklch(0.13 0.028 261.692)'
        description: 'Fondo principal en modo oscuro, el mismo azul grisáceo oscuro del foreground en modo claro'
      foreground:
        value: 'oklch(0.985 0.002 247.839)'
        description: 'Texto principal en modo oscuro, un blanco-azul frío extremadamente suave'
      card:
        value: 'oklch(0.21 0.034 264.665)'
        description: 'Fondo de tarjetas elevadas en modo oscuro'
      card-foreground:
        value: 'oklch(0.985 0.002 247.839)'
        description: 'Texto dentro de tarjetas elevadas en modo oscuro'
      popover:
        value: 'oklch(0.21 0.034 264.665)'
        description: 'Fondo de popovers y menús en modo oscuro'
      popover-foreground:
        value: 'oklch(0.985 0.002 247.839)'
        description: 'Texto en popovers y menús en modo oscuro'
      primary:
        value: 'oklch(0.42 0.18 266)'
        description: 'Azul primario adaptado para mayor legibilidad y menor fatiga en modo oscuro'
      primary-foreground:
        value: 'oklch(0.97 0.014 254.604)'
        description: 'Texto sobre fondos primarios en modo oscuro'
      secondary:
        value: 'oklch(0.274 0.006 286.033)'
        description: 'Fondo secundario en modo oscuro'
      secondary-foreground:
        value: 'oklch(0.985 0 0)'
        description: 'Texto secundario en modo oscuro'
      muted:
        value: 'oklch(0.278 0.033 256.848)'
        description: 'Fondo apagado o desactivado en modo oscuro'
      muted-foreground:
        value: 'oklch(0.707 0.022 261.325)'
        description: 'Texto secundario o atenuado en modo oscuro'
      accent:
        value: 'oklch(0.278 0.033 256.848)'
        description: 'Fondo destacado o hover en modo oscuro'
      accent-foreground:
        value: 'oklch(0.985 0.002 247.839)'
        description: 'Texto de elementos hover o destacados en modo oscuro'
      destructive:
        value: 'oklch(0.704 0.191 22.216)'
        description: 'Rojo de peligro calibrado para fondos oscuros'
      border:
        value: 'oklch(1 0 0 / 10%)'
        description: 'Borde translúcido en modo oscuro para efectos sofisticados'
      input:
        value: 'oklch(1 0 0 / 15%)'
        description: 'Borde de formularios translúcido en modo oscuro'
      ring:
        value: 'oklch(0.551 0.027 264.364)'
        description: 'Borde de foco en modo oscuro'
      sidebar:
        value: 'oklch(0.21 0.034 264.665)'
        description: 'Fondo del sidebar en modo oscuro'
      sidebar-foreground:
        value: 'oklch(0.985 0.002 247.839)'
        description: 'Texto del sidebar en modo oscuro'

    # Paletas de Estado Específicas (KPIs y Lotes)
    status:
      total:
        light: 'oklch(0.967 0.003 264.542)'
        dark: 'oklch(0.278 0.033 256.848)'
      available:
        light: 'oklch(0.95 0.08 140)' # Verde suave
        dark: 'oklch(0.25 0.07 140)'
      reserved:
        light: 'oklch(0.95 0.08 70)' # Ámbar suave
        dark: 'oklch(0.25 0.07 70)'
      sold:
        light: 'oklch(0.94 0.08 250)' # Azul suave
        dark: 'oklch(0.22 0.06 250)'

  typography:
    family:
      sans:
        value: 'var(--font-sans), system-ui, -apple-system, sans-serif'
        description: 'Fuente sans-serif principal optimizada para interfaces densas e interactivas'
      mono:
        value: 'var(--font-geist-mono), monospace'
        description: 'Fuente monoespaciada para datos técnicos, coordenadas, lotes o código'
    size:
      xs:
        value: '0.75rem' # 12px
      sm:
        value: '0.875rem' # 14px
      base:
        value: '1rem' # 16px
      lg:
        value: '1.125rem' # 18px
      xl:
        value: '1.25rem' # 20px
      xxl:
        value: '1.5rem' # 24px
      xxxl:
        value: '1.875rem' # 30px
    weight:
      normal: '400'
      medium: '500'
      semibold: '600'
      bold: '700'

  spacing:
    scale:
      '1': '0.25rem' # 4px
      '2': '0.5rem' # 8px
      '3': '0.75rem' # 12px
      '4': '1rem' # 16px
      '6': '1.5rem' # 24px
      '8': '2rem' # 32px
      '12': '3rem' # 48px

  radius:
    default:
      value: '0.625rem' # 10px
      description: 'Radio base para tarjetas, botones medianos e inputs. Da una apariencia moderna pero profesional'
    sm:
      value: 'calc(var(--radius) - 4px)' # 6px
    md:
      value: 'calc(var(--radius) - 2px)' # 8px
    lg:
      value: 'var(--radius)' # 10px
    xl:
      value: 'calc(var(--radius) + 4px)' # 14px
    xxl:
      value: 'calc(var(--radius) + 8px)' # 18px

  elevation:
    shadows:
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)'
      default: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'
      md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'
---

# Auditoría y Guía del Sistema de Diseño UI/UX de Plotify

## 1. Visión General del Diseño (Overview)

Plotify es una plataforma monorepo enfocada en la gestión de loteos inmobiliarios, ventas y automatización operativa. La experiencia visual de la plataforma está pensada para ser **altamente interactiva, moderna, profesional y premium**.

### Fundamentos Tecnológicos

- **UI Framework**: `shadcn/ui` como base atómica de componentes interactivos (dialogs, sidebars, selectores, comboboxes, etc.), garantizando que la accesibilidad (WAI-ARIA) y el comportamiento sean óptimos desde el primer día.
- **Engine de Estilos**: **Tailwind CSS v4** integrado directamente mediante la directiva `@theme` en `globals.css` que prescinde del viejo `tailwind.config.js`.
- **Modo de Color Estricto**: Uso nativo de la escala cromática **OKLCH**, ofreciendo una calibración de brillo y contraste matemáticamente perfecta para pantallas HDR y previniendo la fatiga visual en temas claros y oscuros.
- **Iconografía**: La biblioteca oficial es **Hugeicons** en su versión gratuita (`@hugeicons/core-free-icons` y `@hugeicons/react`). Todos los componentes y flujos de navegación deben priorizar estos iconos para mantener uniformidad formal.

---

## 2. Paleta de Colores y Calibración (Colors)

Plotify cuenta con un sistema de dos temas completamente calibrados basados en variables CSS semánticas:

### Light Mode (Tema Claro)

- **Fondo de Marca (`--background`)**: Blanco puro (`oklch(1 0 0)`), proporcionando un lienzo limpio para destacar los mapas satelitales y los datos de venta.
- **Textos Principales (`--foreground`)**: Un gris azulado sumamente oscuro (`oklch(0.13 0.028 261.692)`). El color de base fría reduce drásticamente el contraste extremo del negro puro en pantallas brillantes.
- **Color Primario (`--primary`)**: Un azul eléctrico de alto croma e impacto visual (`oklch(0.488 0.243 264.376)`). Utilizado como el principal acento de interactividad, botones primarios y estados activos.

### Dark Mode (Tema Oscuro)

- El modo oscuro de Plotify destaca por su cohesión cromática. En lugar de usar gris oscuro plano, el fondo principal de la aplicación (`--background`) se convierte exactamente en el foreground del modo claro (`oklch(0.13 0.028 261.692)`), logrando una simetría perfecta.
- **Textos (`--foreground`)**: Un blanco frío atenuado (`oklch(0.985 0.002 247.839)`).
- **Primario (`--primary`)**: Calibrado ligeramente a un azul de croma más bajo (`oklch(0.42 0.18 266)`) para cumplir estrictamente con los estándares de contraste WCAG en fondos oscuros sin quemar la vista del usuario.

### Estados de Lotes (Código de Colores Semántico)

Para que la interfaz y el mapa interactivo de loteos sean intuitivos a golpe de vista, se ha establecido la siguiente convención:

- **Total de Lotes**: Color neutral / secundario (`bg-slate-50` / `dark:bg-slate-800/50`).
- **Lotes Disponibles**: Verde esmeralda (`emerald-50` / `emerald-600` / `dark:text-emerald-400`). Indica libertad y oportunidad.
- **Lotes Reservados**: Ámbar / Dorado (`amber-50` / `amber-600` / `dark:text-amber-400`). Indica urgencia o estado de transacción.
- **Lotes Vendidos**: Azul frío (`blue-50` / `blue-600` / `dark:text-blue-400`). Indica consolidación y propiedad.

---

## 3. Disposición del Layout e Interacción (Layout & Hierarchy)

El layout de la aplicación sigue una disposición de dos paneles responsivos:

1. **Sidebar Lateral (Panel de Control)**:
   - Utiliza la primitiva reactiva `Sidebar` de `shadcn/ui`.
   - Soporta estado colapsable tipo "icono" para maximizar el área de trabajo en pantallas de laptop.
   - Ofrece transiciones suaves (`transition-[width,height] ease-linear duration-200`).
   - El selector superior de Workspace ofrece una inicialización elegante de la organización con un avatar tipográfico estilizado (`flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600`).

2. **Panel Principal (`SidebarInset` y `main`)**:
   - Un header superior fijo de `h-16` (64px) que agrupa:
     - Control de colapso del sidebar (`SidebarTrigger`).
     - Alertas globales / Campana de Notificaciones (`NotificationBell`).
     - Interruptor de tema (`ModeToggle`).
     - Badge de salud del sistema / Backend (`BackendStatusBadge`), que informa dinámicamente si los microservicios FastAPI están sincronizados.
   - El contenedor de contenido principal (`main`) utiliza un scroll independiente (`flex-1 overflow-auto`) y un padding uniforme de `p-6` (24px) con espaciado vertical consistente de `space-y-6` o `space-y-8`.

---

## 4. Auditoría UI/UX: Fortalezas y Áreas de Oportunidad

### Fortalezas del Diseño Actual

1. **Calidad de Paleta (Excelente)**: El uso de OKLCH en Tailwind CSS v4 dota a la web de una iluminación vibrante e impecable en ambos temas. La elección de tonos no es la clásica de plantillas genéricas.
2. **Consistencia de Bordes**: El radio unificado `--radius: 0.625rem` (10px) le da a las tarjetas (`Card`), inputs y botones una apariencia suave, moderna y premium sin llegar a ser demasiado informal o infantil.
3. **Métricas Claras**: Las tarjetas de KPIs y la grilla de resumen de lotes en los proyectos usan una distribución de columnas altamente legible con micro-tarjetas diferenciadas por color semántico.
4. **Diseño Adaptable (Responsive)**: Las grillas cambian perfectamente de `grid-cols-1` en dispositivos móviles a `md:grid-cols-2` y `lg:grid-cols-3` en pantallas de escritorio.
5. **Transiciones Estéticas**: El uso de clases como `animate-in fade-in duration-500` en las vistas principales suaviza la carga de datos del lado del cliente, evitando parpadeos bruscos.

### Áreas de Mejora Identificadas (UX/UI Audit)

1. **Micro-interacciones en KPIs**: Las tarjetas de KPIs y resúmenes globales en `dashboard/page.tsx` no tienen estados de hover activos. Debería agregarse un sutil escalado visual o cambio en el color del borde para hacerlas sentir vivas.
2. **Contraste de Mapas**: La integración de Maplibre GL en `components/ui/map.tsx` requiere que los popups y marcadores respeten estrictamente el modo oscuro de la aplicación principal. Los popups del mapa deben cambiar su background a `oklch(0.21 0.034 264.665)` cuando la clase `.dark` esté activa.
3. **Filtros en Listas**: La vista de proyectos (`projects/page.tsx`) carece de controles interactivos visibles para buscar por texto o filtrar por comuna/estado (Disponible, Reservado, Vendido). Añadir un input de búsqueda con un `Combobox` interactivo mejoraría notablemente la UX con catálogos grandes.
4. **Carga (Skeleton UI)**: Actualmente la pantalla de carga de proyectos muestra un simple texto `"Cargando proyectos..."` centrado. Debería implementarse un componente de Skeleton de tarjetas utilizando el componente `<Skeleton />` de `shadcn/ui` para reducir la percepción del tiempo de carga.

---

## 5. Do's and Don'ts para Agentes de Código (Do's & Don'ts)

### Do's (Lo que DEBES hacer)

- **Usa variables CSS semánticas**: Utiliza siempre clases como `bg-background`, `text-foreground`, `bg-primary`, `border-border`, en lugar de colores arbitrarios como `bg-blue-500` o `text-black`.
- **Calibra para Tema Oscuro**: Asegúrate de que cada componente nuevo que desarrolles tenga soporte de tema oscuro usando el prefijo `dark:`. Prueba siempre ambos modos.
- **Mantén Hugeicons como estándar**: Para cualquier elemento visual interactivo que requiera iconos, importa desde `@hugeicons/core-free-icons` y usa la envoltura `<HugeiconsIcon icon={Icono} />` o impórtalos de forma nativa.
- **Usa transiciones y micro-animaciones**: Agrega clases de Tailwind como `transition-all duration-200 ease-in-out` en botones, enlaces y tarjetas. Aprovecha los estados `:hover` y `:focus-visible`.
- **Conserva el radio `--radius`**: Al crear contenedores o componentes personalizados, hereda el radio de borde del tema mediante clases como `rounded-xl` (tarjetas), `rounded-lg` (botones) o `rounded-md` (inputs).

### Don'ts (Lo que NUNCA debes hacer)

- **NO uses colores planos arbitrarios**: Evita agregar clases como `bg-red-500`, `bg-green-600` sin soporte semántico o soporte para modo oscuro. El diseño se rompería visualmente.
- **NO omitas validaciones en el Cliente**: No crees flujos de carga que dejen la pantalla vacía o con un loader feo de navegador. Diseña siempre estados vacíos ("Empty States") elegantes y Skeletons de carga.
- **NO mezcles librerías de iconos**: No importes iconos de `lucide-react`, `heroicons` o `font-awesome` a menos que sea estrictamente necesario y no exista un equivalente en Hugeicons.
- **NO hardcodees radios de esquina**: No uses clases como `rounded-[30px]` o `rounded-none` de manera aleatoria. Toda la web debe respirar consistencia formal.
- **NO sobrepases la densidad visual**: Mantén el espaciado y márgenes consistentes (`p-4` o `p-6` para contenedores interactivos) para dar "aire" al diseño y facilitar la lectura en dispositivos móviles.

---

## 6. Layout Bento y Políticas de Encabezados (Layout Bento & Headers)

A partir de la unificación del diseño visual en junio de 2026 (SDD 5), se establecen las siguientes políticas estructurales obligatorias para todas las pantallas del dashboard:

### Layout de Página y Contenedor Principal (`PageShell`)

- Toda página autenticada del dashboard debe renderizarse dentro del componente común `PageShell`.
- Se prohíben layouts de página aislados con paddings o anchos personalizados a nivel de ruta (como `p-6 max-w-4xl mx-auto`).
- `PageShell` centraliza el padding responsivo (mínimo en mobile, holgado en desktop), el ancho máximo del área de trabajo (`max-w-[1600px]`) y aplica una animación de entrada estándar (`animate-fade-in-up`).

### Encabezados de Página Estandarizados (`PageHeader`)

- Toda página debe utilizar `PageHeader` para renderizar su título principal y descripción.
- **Títulos sin iconos por defecto**: Los `h1` principales del encabezado son estrictamente textuales y no deben incluir iconos decorativos. Esto asegura una transición limpia y sin saltos visuales al navegar por el menú.
- La iconografía queda estrictamente reservada para botones de acción (ej. en el slot `action`), estados vacíos (`EmptyState`), elementos de navegación interna, insignias (`Badge`) y estados de tarjetas.

### Sistema Bento Grid (`BentoGrid` y `BentoPanel`)

- Las vistas complejas que agrupen tablas, formularios, métricas o mapas deben utilizar el sistema de rejilla `BentoGrid` (de 12 columnas en desktop y 1 columna en mobile).
- Para agrupar secciones lógicas (paneles de datos, resúmenes, listados de configuración) se debe utilizar el contenedor `BentoPanel`.
- **BentoPanel** encapsula el borde, fondo y sombras consistentes (`rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden`), evitando la anidación innecesaria de múltiples tarjetas visualmente pesadas.
- Los formularios de configuración y edición en páginas de settings deben alinearse a este carril Bento ocupando una extensión óptima para lectura (usualmente `xl:col-span-8`), evitando la sensación de "isla" aislada.
