# Feature Specification: Dashboard Bento Layout Unification

**Feature Branch**: `004-ui-ux-premium-upgrade`

**Created**: 2026-06-01

**Status**: Draft

**Input**: Decision de producto/diseno posterior a la auditoria visual de las pantallas
`/projects`, `/vendors` y `/settings/workspace`. El objetivo es eliminar diferencias
de margen, alineacion, jerarquia de titulos e iconografia entre paginas del dashboard.

## Design Decisions

- **Layout canonico**: todas las paginas autenticadas del dashboard deben renderizarse
  dentro de un `PageShell` con margen horizontal y vertical uniforme.
- **Composicion bento**: el contenido interno se organiza con un `BentoGrid` de 12
  columnas en desktop y una columna en mobile. No todas las paginas deben convertirse
  en tarjetas pequenas; tablas, formularios y mapas pueden ocupar spans amplios.
- **Titulos sin icono por defecto**: los `h1` de pagina no llevan icono. La iconografia
  queda reservada para navegacion, acciones, empty states, badges, tarjetas internas y
  estados.
- **Header unico**: cada pagina usa un `PageHeader` compartido para titulo,
  descripcion y accion primaria.
- **No cambio funcional**: esta feature no modifica permisos, consultas, contratos,
  migraciones ni reglas de negocio.

## User Scenarios & Testing

### User Story 1 - Margen y alineacion uniforme (Priority: P1)

Como administrador o vendedor, al navegar entre Dashboard, Proyectos, Leads,
Vendedores, Documentos y Configuracion, quiero que el contenido arranque desde el
mismo rail visual para no sentir saltos de layout.

**Independent Test**: Navegar por las paginas principales y verificar que todas usan
el mismo padding responsive y ancho maximo.

**Acceptance Scenarios**:

1. **Given** un usuario abre `/projects`, **When** cambia a `/vendors`, **Then** los
   titulos y paneles arrancan desde el mismo margen izquierdo.
2. **Given** un usuario abre `/settings/workspace`, **When** compara con `/projects`,
   **Then** la pagina ya no queda centrada como isla independiente con `mx-auto`
   aplicado al contenedor raiz.
3. **Given** el viewport es mobile, **When** se navega entre paginas, **Then** el
   padding se reduce de forma uniforme y no hay overflow horizontal.

### User Story 2 - Jerarquia de titulos consistente (Priority: P1)

Como usuario, quiero reconocer rapidamente la pagina actual sin que algunos titulos
tengan iconos decorativos y otros no.

**Independent Test**: Revisar los `h1` de rutas dashboard y confirmar que usan
`PageHeader` sin icono principal.

**Acceptance Scenarios**:

1. **Given** una pagina dashboard renderiza un `h1`, **When** se inspecciona el DOM,
   **Then** el titulo principal no incluye icono decorativo.
2. **Given** una tarjeta interna necesita reforzar contexto, **When** renderiza su
   header, **Then** puede usar icono pequeno dentro del card, no en el `h1`.
3. **Given** un empty state aparece, **When** no hay datos, **Then** el icono grande
   sigue permitido porque representa estado, no titulo de pagina.

### User Story 3 - Bento grid reutilizable (Priority: P2)

Como equipo de producto, quiero que las paginas usen una grilla comun para que nuevos
modulos respeten el mismo ritmo visual sin recrear clases ad hoc.

**Independent Test**: Renderizar paginas con panels de 4, 6, 8 y 12 columnas y
verificar que los spans responden correctamente en desktop y mobile.

**Acceptance Scenarios**:

1. **Given** `/projects` muestra cards de proyectos, **When** hay multiples proyectos,
   **Then** se renderizan en el `BentoGrid` sin cambiar el margen de pagina.
2. **Given** `/vendors` muestra una tabla, **When** se renderiza en desktop, **Then**
   el panel de tabla ocupa un span ancho sin romper el sistema bento.
3. **Given** `/settings/workspace` muestra un formulario, **When** se renderiza en
   desktop, **Then** el formulario ocupa una columna principal con espacio reservado
   para ayuda/contexto futuro.

## Requirements

- **FR-001**: Crear componentes compartidos `PageShell`, `PageHeader`, `BentoGrid` y
  `BentoPanel` bajo `apps/web/src/components/dashboard/`.
- **FR-002**: `PageShell` debe centralizar padding, ancho maximo, animacion de entrada
  y espaciado vertical de pagina.
- **FR-003**: `PageHeader` debe soportar titulo, descripcion y accion primaria sin
  icono en el titulo principal.
- **FR-004**: `BentoGrid` debe usar 12 columnas en desktop y 1 columna en mobile.
- **FR-005**: `BentoPanel` debe encapsular borde, fondo, radio y overflow de paneles
  bento sin anidar cards innecesariamente.
- **FR-006**: Migrar las paginas `/dashboard`, `/projects`, `/clients`, `/vendors`,
  `/settings/profile`, `/settings/workspace` y `/documentos` al shell comun.
- **FR-007**: Remover iconos decorativos de los `h1` principales.
- **FR-008**: No modificar consultas Supabase, server actions, rutas API, modelos ni
  contratos en esta feature.
- **FR-009**: Mantener los empty states, botones con icono, badges e iconos internos
  de cards cuando aportan escaneo o estado.
- **FR-010**: Actualizar `design.md` con la decision canonica de margen, bento grid
  y uso de iconos.

## Success Criteria

- **SC-001**: Cero contenedores raiz dashboard usan `p-6 max-w-4xl mx-auto` como
  layout de pagina aislado.
- **SC-002**: Las paginas principales usan `PageShell` y `PageHeader`.
- **SC-003**: Cero `h1` principales en dashboard tienen iconos decorativos.
- **SC-004**: Proyectos, Vendedores y Configuracion se alinean visualmente al mismo
  rail en desktop y mobile.
- **SC-005**: Verificacion pasa con `pnpm --filter web lint`, `pnpm format:check` y
  `pnpm build:web`.

## Assumptions

- El stack visual sigue siendo Next.js, React, Tailwind CSS 4, shadcn/ui y HugeIcons.
- La unificacion es visual y estructural; no requiere migraciones ni cambios de API.
- Las pantallas de detalle de proyecto con mapas pueden requerir una variante
  `PageShell` mas densa, pero deben mantener el mismo margen responsive.
