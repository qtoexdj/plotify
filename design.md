---
name: 'Plotify Design System'
version: '2.0.0'
author: 'Antigravity & Plotify Team'
license: 'Apache-2.0'
tokens:
  color:
    # Colores Globales Base (Light Mode) — dirección "Tinta nítida"
    light:
      background:
        value: '#f6f6f6'
        description: 'Superficie de página/panel, gris muy claro (no blanco puro) para separar del contenido por contraste, sin hairlines'
      foreground:
        value: '#111111'
        description: 'Tinta — texto principal, casi negro'
      card:
        value: '#ffffff'
        description: 'Fondo de tarjetas, blanco puro, sin borde — se separa del panel por contraste de superficie'
      card-foreground:
        value: '#111111'
        description: 'Texto dentro de tarjetas'
      popover:
        value: '#ffffff'
        description: 'Fondo de menús emergentes y popovers'
      popover-foreground:
        value: '#111111'
        description: 'Texto de menús emergentes y popovers'
      primary:
        value: '#a93439'
        description: 'Carmesí — único acento de interactividad de la UI (botones, focus, ítem activo). Distinto de --brand (verde de marca) y de --destructive'
      primary-foreground:
        value: '#ffffff'
        description: 'Texto sobre fondos primarios — 6.5:1 AA'
      secondary:
        value: '#ececec'
        description: 'Fondo secundario para botones/controles sutiles'
      secondary-foreground:
        value: '#111111'
        description: 'Texto sobre elementos secundarios'
      muted:
        value: '#ececec'
        description: 'Fondo para elementos inactivos o deshabilitados'
      muted-foreground:
        value: '#4b5563'
        description: 'Texto secundario — calibrado a 7:1 sobre --background (un tono más oscuro que el gris medio de marca para no fallar AA fuera de tarjetas)'
      accent:
        value: '#e9e9e9'
        description: 'Fondo hover/destacado sutil'
      accent-foreground:
        value: '#111111'
        description: 'Texto en estado hover'
      destructive:
        value: '#dc2626'
        description: 'Rojo para acciones críticas — token propio, no confundir con el carmesí de marca (--primary)'
      destructive-foreground:
        value: '#ffffff'
        description: 'Texto sobre fondos destructivos — 4.8:1 AA'
      success:
        value: '#15803d'
        description: 'Verde AA-safe para texto/badges de éxito (más oscuro que --brand para pasar 4.5:1 sobre blanco)'
      success-foreground:
        value: '#ffffff'
        description: 'Texto/ícono sobre fondo success — 5:1 AA'
      warning:
        value: '#b45309'
        description: 'Ámbar AA-safe para texto/badges de advertencia'
      warning-foreground:
        value: '#ffffff'
        description: 'Texto sobre fondo warning — 5:1 AA'
      info:
        value: '#1d4ed8'
        description: 'Azul para mensajes informativos'
      info-foreground:
        value: '#ffffff'
        description: 'Texto sobre fondo info'
      status-available:
        value: 'var(--success)'
        description: 'Estado de lote disponible — alias de --success'
      status-available-foreground:
        value: 'var(--success-foreground)'
        description: 'Foreground de estado disponible'
      status-reserved:
        value: 'var(--warning)'
        description: 'Estado de lote reservado — alias de --warning'
      status-reserved-foreground:
        value: 'var(--warning-foreground)'
        description: 'Foreground de estado reservado'
      status-sold:
        value: '#6b7280'
        description: 'Estado de lote vendido — neutro (no destructive; vendido es un cierre exitoso, no un error)'
      status-sold-foreground:
        value: '#ffffff'
        description: 'Foreground de estado vendido — 4.8:1 AA'
      border:
        value: '#e5e5e5'
        description: 'Borde sutil — reservado a inputs y controles de formulario, no a separación de tarjetas/paneles'
      input:
        value: '#e5e5e5'
        description: 'Borde de inputs en reposo'
      ring:
        value: 'rgba(169, 52, 57, 0.5)'
        description: 'Anillo de foco, tono carmesí translúcido'
      brand:
        value: '#16a34a'
        description: 'Verde de marca — color del plano del isotipo (Spinner/BrandLoader/BrandMark). Invariante de tema; nunca se usa como color de UI (botones, badges, estados)'
      sidebar:
        value: '#121212'
        description: 'Sidebar SIEMPRE oscuro, en ambos temas — panel flotante'
      sidebar-foreground:
        value: '#f5f5f5'
        description: 'Texto del sidebar'
      sidebar-primary:
        value: '#e06565'
        description: 'Carmesí claro — color del ícono en el ítem activo del sidebar'
      sidebar-primary-foreground:
        value: '#ffffff'
        description: 'Foreground de sidebar-primary'
      sidebar-accent:
        value: '#1f1f1f'
        description: 'Fondo elevado del ítem activo/hover del sidebar'
      sidebar-accent-foreground:
        value: '#f5f5f5'
        description: 'Texto del ítem activo/hover'
      sidebar-border:
        value: 'rgba(255, 255, 255, 0.08)'
        description: 'Borde sutil del panel del sidebar'
      sidebar-ring:
        value: '#e06565'
        description: 'Anillo de foco dentro del sidebar'

    # Colores Globales Base (Dark Mode)
    dark:
      background:
        value: '#161616'
        description: 'Panel oscuro — no es gris azulado, es la variante oscura calibrada de la misma superficie'
      foreground:
        value: '#f5f5f5'
        description: 'Tinta invertida — blanco suave'
      card:
        value: '#222222'
        description: 'Tarjetas en modo oscuro, sin borde'
      card-foreground:
        value: '#f5f5f5'
        description: 'Texto dentro de tarjetas oscuras'
      popover:
        value: '#222222'
        description: 'Fondo de popovers en modo oscuro'
      popover-foreground:
        value: '#f5f5f5'
        description: 'Texto de popovers en modo oscuro'
      primary:
        value: '#c24444'
        description: 'Carmesí calibrado más claro para fondos oscuros — 5:1 AA con texto blanco'
      primary-foreground:
        value: '#ffffff'
        description: 'Texto sobre primary en modo oscuro'
      secondary:
        value: '#2a2a2a'
        description: 'Fondo secundario en modo oscuro'
      secondary-foreground:
        value: '#f5f5f5'
        description: 'Texto secundario en modo oscuro'
      muted:
        value: '#2a2a2a'
        description: 'Fondo apagado en modo oscuro'
      muted-foreground:
        value: '#a1a1aa'
        description: 'Texto secundario en modo oscuro — 7:1 AA sobre --background'
      accent:
        value: '#2a2a2a'
        description: 'Fondo hover en modo oscuro'
      accent-foreground:
        value: '#f5f5f5'
        description: 'Texto hover en modo oscuro'
      destructive:
        value: '#b91c1c'
        description: 'Rojo de peligro calibrado para fondos oscuros — 6.5:1 AA con texto blanco'
      destructive-foreground:
        value: '#ffffff'
        description: 'Texto sobre destructive en modo oscuro'
      success:
        value: '#4ade80'
        description: 'Verde claro para modo oscuro'
      success-foreground:
        value: '#052e14'
        description: 'Texto oscuro sobre success — 8.5:1 AA'
      warning:
        value: '#fbbf24'
        description: 'Ámbar claro para modo oscuro'
      warning-foreground:
        value: '#1f1300'
        description: 'Texto oscuro sobre warning'
      info:
        value: '#60a5fa'
        description: 'Azul claro para modo oscuro'
      info-foreground:
        value: '#06264d'
        description: 'Texto oscuro sobre info'
      status-available:
        value: 'var(--success)'
        description: 'Estado disponible en modo oscuro'
      status-available-foreground:
        value: 'var(--success-foreground)'
        description: 'Foreground de disponible'
      status-reserved:
        value: 'var(--warning)'
        description: 'Estado reservado en modo oscuro'
      status-reserved-foreground:
        value: 'var(--warning-foreground)'
        description: 'Foreground de reservado'
      status-sold:
        value: '#9ca3af'
        description: 'Estado vendido en modo oscuro — neutro'
      status-sold-foreground:
        value: '#161616'
        description: 'Foreground de vendido — 8.3:1 AA'
      border:
        value: 'rgba(255, 255, 255, 0.1)'
        description: 'Borde translúcido en modo oscuro, solo en inputs'
      input:
        value: 'rgba(255, 255, 255, 0.12)'
        description: 'Borde de inputs en modo oscuro'
      ring:
        value: 'rgba(194, 68, 68, 0.5)'
        description: 'Anillo de foco en modo oscuro'
      sidebar:
        value: '#191919'
        description: 'Sidebar oscuro en tema oscuro (tono ligeramente distinto al de tema claro)'
      sidebar-foreground:
        value: '#f5f5f5'
        description: 'Texto del sidebar en modo oscuro'
      sidebar-primary:
        value: '#e06565'
        description: 'Mismo carmesí claro — el sidebar no cambia de iluminación entre temas'
      sidebar-primary-foreground:
        value: '#ffffff'
        description: 'Foreground de sidebar-primary'
      sidebar-accent:
        value: '#242424'
        description: 'Fondo elevado del ítem activo en modo oscuro'
      sidebar-accent-foreground:
        value: '#f5f5f5'
        description: 'Texto del ítem activo en modo oscuro'
      sidebar-border:
        value: 'rgba(255, 255, 255, 0.08)'
        description: 'Borde sutil del sidebar en modo oscuro'
      sidebar-ring:
        value: '#e06565'
        description: 'Anillo de foco del sidebar en modo oscuro'

  typography:
    family:
      display:
        value: 'var(--font-display), system-ui, sans-serif'
        description: 'Bricolage Grotesque 500/600 — h1-h3, cifras KPI, wordmark'
      sans:
        value: 'var(--font-sans), system-ui, -apple-system, sans-serif'
        description: 'Onest 400/500 — UI, cuerpo, etiquetas'
      serif:
        value: 'var(--font-serif), Georgia, serif'
        description: 'Source Serif 4 — exclusivo del documento de la mesa de escritura'
      mono:
        value: 'var(--font-geist-mono), monospace'
        description: 'Geist Mono — ROL, folios, montos, códigos'
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
      bold: '700' # solo Onest/Geist Mono — Bricolage Grotesque solo carga 500/600, nunca usar font-bold junto a font-display

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
      value: '0.75rem' # 12px
      description: 'Radio base para tarjetas, botones e inputs'
    sm:
      value: 'calc(var(--radius) - 4px)' # 8px
    md:
      value: 'calc(var(--radius) - 2px)' # 10px
    lg:
      value: 'var(--radius)' # 12px
    xl:
      value: 'calc(var(--radius) + 4px)' # 16px — radio de paneles (SidebarInset, BentoPanel)
    xxl:
      value: 'calc(var(--radius) + 8px)' # 20px

  elevation:
    shadows:
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)'
      default: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'
      md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'
---

# Sistema de Diseño de Plotify — "Tinta y Marca" (v2.0.0)

## 1. Visión General del Diseño (Overview)

Plotify es una plataforma monorepo enfocada en la gestión de loteos inmobiliarios, ventas y automatización operativa. A partir de la v2.0.0 (SDD 015, jul 2026) la identidad visual se rediseñó completa bajo la dirección **"Tinta nítida"**: monocromo de alto contraste con un único acento carmesí, sidebar flotante siempre oscuro, y tipografía de marca propia.

### Fundamentos Tecnológicos

- **UI Framework**: `shadcn/ui` como base atómica de componentes interactivos.
- **Engine de Estilos**: **Tailwind CSS v4** vía `@theme inline` en `globals.css`, sin `tailwind.config.js`.
- **Modo de Color**: valores hex directos calibrados a AA (no OKLCH) para que la calibración de contraste sea auditable a simple vista; excepción: los `chart-*` heredados quedan en OKLCH (fuera de alcance de este rediseño).
- **Iconografía**: **Hugeicons** (`@hugeicons/core-free-icons` + `@hugeicons/react`) es la única librería en código de producto. Excepción: las primitivas `components/ui/*` generadas por shadcn traen `lucide-react` internamente.
- **Tipografía de marca**: Bricolage Grotesque (display), Onest (UI/cuerpo), Geist Mono (datos), Source Serif 4 (documento de la mesa).

---

## 2. Paleta de Colores y Calibración (Colors)

### Dirección "Tinta nítida"

- **Monocromo de alto contraste**: superficies en gris muy claro/muy oscuro (`--background`/`--card`), tinta casi negra/blanca (`--foreground`). Sin hairlines: la separación entre panel y tarjeta es por contraste de superficie, no por bordes.
- **Un solo acento de UI — carmesí (`--primary`)**: `#a93439` claro / `#c24444` oscuro. Es el color de botones primarios, focus, ítems activos.
- **Marca vs UI — no se mezclan**: el isotipo de Plotify (`--brand`, `#16a34a`) es **verde** y se mantiene así; es un color de marca, nunca de interfaz. El carmesí nunca aparece en el logo; el verde nunca aparece en botones/badges/estados. Conviven en el mismo sidebar sin conflicto porque ocupan roles distintos.
- **Carmesí vs destructive**: `--primary` (carmesí, marca/interactividad) y `--destructive` (rojo, acciones críticas) son tokens **distintos**, elegidos con hue distinguible a simple vista. Regla de uso: una tarjeta de alerta carmesí nunca contiene un botón primario carmesí (evita que el usuario confunda "acento de marca" con "algo va a romperse"); las acciones destructivas siempre usan `--destructive` + confirmación.
- **Sidebar siempre oscuro**: `#121212` (tema claro) / `#191919` (tema oscuro) — no cambia a claro nunca, en ningún tema. El ítem activo usa fondo elevado (`--sidebar-accent`) + ícono en carmesí claro (`--sidebar-primary`, `#e06565`).
- **Estados de lote**: `disponible` = `--success` (verde AA-safe, no el verde de marca), `reservado` = `--warning` (ámbar), `vendido` = neutro (`--status-sold`, gris) — **no** destructive/rojo, porque una venta cerrada es un éxito, no un error.

### Tabla de contraste AA (verificado, WCAG 2.1)

| Par                                                    | Tema   | Ratio  | Umbral              | Resultado |
| ------------------------------------------------------ | ------ | ------ | ------------------- | --------- |
| `--foreground` sobre `--background`                    | Claro  | 17.5:1 | 4.5:1               | PASS      |
| `--muted-foreground` sobre `--background`              | Claro  | 7.0:1  | 4.5:1               | PASS      |
| `--primary-foreground` sobre `--primary`               | Claro  | 6.5:1  | 4.5:1               | PASS      |
| `--destructive-foreground` sobre `--destructive`       | Claro  | 4.8:1  | 4.5:1               | PASS      |
| `--success-foreground` sobre `--success`               | Claro  | 5.0:1  | 4.5:1               | PASS      |
| `--warning-foreground` sobre `--warning`               | Claro  | 5.0:1  | 4.5:1               | PASS      |
| `--status-sold-foreground` sobre `--status-sold`       | Claro  | 4.8:1  | 4.5:1               | PASS      |
| `--sidebar-foreground` sobre `--sidebar`               | Ambos  | 17.2:1 | 4.5:1               | PASS      |
| `--sidebar-accent-foreground` sobre `--sidebar-accent` | Ambos  | 15.1:1 | 4.5:1               | PASS      |
| `--sidebar-primary` (ícono) sobre `--sidebar-accent`   | Ambos  | 4.9:1  | 3:1 (UI no textual) | PASS      |
| `--muted-foreground` sobre `--background`              | Oscuro | 7.1:1  | 4.5:1               | PASS      |
| `--primary-foreground` sobre `--primary`               | Oscuro | 5.0:1  | 4.5:1               | PASS      |
| `--destructive-foreground` sobre `--destructive`       | Oscuro | 6.5:1  | 4.5:1               | PASS      |
| `--success-foreground` sobre `--success`               | Oscuro | 8.5:1  | 4.5:1               | PASS      |
| `--status-sold-foreground` sobre `--status-sold`       | Oscuro | 8.3:1  | 4.5:1               | PASS      |

Nota de calibración: `--muted-foreground` claro se ajustó de `#6b7280` (gris medio de `brand/colors.md`, pensado para piezas de marca sobre blanco) a `#4b5563`, porque sobre `--background` (`#f6f6f6`, no blanco puro) el primero caía a 4.47:1 — bajo el umbral. El gris de marca se mantiene sin cambios en `brand/colors.md` (es correcto para piezas de marca sobre blanco puro); la UI usa su propio tono ligeramente más oscuro.

---

## 3. Disposición del Layout e Interacción (Layout & Hierarchy)

1. **Sidebar flotante (`variant="inset"`)**: lista plana de 6 destinos (Panel, Proyectos, Escrituras, Leads, Vendedores, Agente) + "Buscar ⌘K" arriba + Configuración/usuario abajo. Sin grupos con etiqueta ni submenús. Siempre oscuro, en ambos temas.
2. **Panel Principal (`SidebarInset`)**: header limpio (`SidebarTrigger` + breadcrumb/título + `NotificationBell` + avatar, sin búsqueda ni toggle de tema), radio de panel `rounded-xl` (16px).
3. **Command palette (⌘K)**: búsqueda global de navegación, proyectos y acciones rápidas (cambiar tema). Reemplaza cualquier input de búsqueda en header.
4. **Tabs internos**: Escrituras (Mesa · Historial · Plantillas) y Agente (Chat · Skills · Integraciones) — links que conservan las URLs actuales.

---

## 4. Do's and Don'ts para Agentes de Código (Do's & Don'ts)

### Do's

- **Usa variables CSS semánticas**: `bg-background`, `text-foreground`, `bg-primary`, `bg-status-available`, etc. Nunca clases crudas (`bg-blue-500`, `text-slate-400`).
- **`--brand` solo en componentes de marca**: `Spinner`, `BrandLoader`, `BrandMark`. Nunca en botones, badges o estados de la UI.
- **Distingue `--primary` de `--destructive`**: el carmesí es interactividad/marca, el rojo es peligro. No los intercambies.
- **Tipografía**: `font-display` en h1-h3 y cifras KPI (ya heredado globalmente para h1-h3), `font-mono` en ROL/montos/folios, `font-serif` solo en el documento de la mesa. Bricolage Grotesque solo tiene pesos 500/600 — nunca combines `font-display` con `font-bold` (700); usa `font-semibold` (600) como máximo.
- **Superficies sin hairline**: separa panel/tarjeta por contraste de fondo (`bg-card` sobre `bg-background`), no agregues `border` decorativo salvo en inputs/formularios.
- **Radios**: `rounded-lg` (12px) en tarjetas/botones, `rounded-xl` (16px) en paneles (`SidebarInset`, `BentoPanel`).
- **Mantén Hugeicons como estándar**: `<HugeiconsIcon icon={Icono} />`.
- **Iconos de solo-ícono**: siempre `aria-label`.

### Don'ts

- **NO reintroduzcas colores planos arbitrarios** (`bg-red-500`, `bg-emerald-600`, etc.) fuera de `lib/map/lot-colors.ts` (única lista blanca, constantes de capas MapLibre).
- **NO uses `Loader2`, `LoaderCircle`, `Loading02Icon`/`Loading03Icon` ni `div` con `animate-spin`**: usa `Spinner` (contenido/botones) o `BrandLoader` (pantalla completa) o `Skeleton` (listas/Suspense).
- **NO mezcles `--brand` (verde) con `--primary` (carmesí)** en el mismo elemento de UI.
- **NO uses `lucide-react`** fuera de `components/ui/*`.
- **NO agregues bordes hairline** a tarjetas/paneles para "separarlos" — usa contraste de superficie.
- **NO regresiones el visor de proyecto** (`geometry-viewer`): es el patrón de oro responsive, prohibido cambiar su UX.

---

## 5. Layout Bento y Políticas de Encabezados (Layout Bento & Headers)

_(Vigente desde SDD 5, sin cambios de fondo en SDD 015 — solo la superficie subyacente cambia de OKLCH azulado a la paleta "Tinta nítida")_

### Layout de Página y Contenedor Principal (`PageShell`)

- Toda página autenticada del dashboard debe renderizarse dentro de `PageShell`. Prohibidos paddings/anchos aislados por ruta.
- `PageShell` centraliza el padding responsivo, `max-w-[1600px]` y `animate-fade-in-up`, ahora sobre la superficie de panel (`bg-background` = `#f6f6f6`/`#161616`).

### Encabezados de Página Estandarizados (`PageHeader`)

- Todo `h1` usa `PageHeader`, con `font-display font-semibold`. Sin iconos decorativos en el título.

### Sistema Bento Grid (`BentoGrid` y `BentoPanel`)

- `BentoPanel` encapsula fondo `bg-card` y radio `rounded-xl` (16px), **sin borde** (se retira `border-border` del estilo por defecto — la separación es por contraste de superficie contra el panel).
- Los formularios de configuración se alinean a `xl:col-span-8`.
