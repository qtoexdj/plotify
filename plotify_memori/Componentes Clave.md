# Componentes Clave

**Tag:** #frontend #componentes
**Relacionado:** [[00 - Home]], [[Estructura de Carpetas Frontend]], [[Tech Stack Frontend]]

---

## Navegacion

| Componente | Archivo | Funcion |
|-----------|---------|--------|
| AppSidebar | app-sidebar.tsx | Sidebar principal con menu contextual al rol |
| NavMain | nav-main.tsx | Links principales del dashboard |
| NavProjects | nav-projects.tsx | Lista de proyectos recientes |
| NavUser | nav-user.tsx | Menu de usuario (perfil, settings, logout) |
| TeamSwitcher | team-switcher.tsx | Selector de workspace/org |
| ModeToggle | mode-toggle.tsx | Toggle dark/light mode |

## Dashboard

| Componente | Funcion |
|-----------|---------|
| KPICards | Muestra KPIs principales (lotes, ingreso, estado) |
| TelegramSetup | Configuracion de deep link a bot de Telegram |
| OperationsTable | Tabla de lotes con filtros y paginacion |

## Proyectos

| Componente | Funcion |
|-----------|---------|
| ProjectDetail | Tabs de detalle: mapa, lotes, vendors, estado |
| GeometryAssignment | Mapa interactivo para asignar poligonos a lotes (onboarding) |
| GeometryViewer | Visor de mapa para proyecto ya configurado |
| OnboardingWizard | Wizard paso a paso para crear proyecto |

## shadcn/ui (35 componentes)

alert-dialog, avatar, badge, button, card, carousel, checkbox, collapsible, combobox, command, dialog, dropdown-menu, field, form, input-group, input, interactive-grid-pattern, label, map, popover, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, switch, table, tabs, textarea, toggle-group, toggle, tooltip.

## Relacionado
- [[Tech Stack Frontend]] — Stack UI
- [[Estructura de Carpetas Frontend]] — Donde estan los componentes