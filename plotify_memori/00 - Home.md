# Plotify — Documentación del Proyecto

> **B2B SaaS para inmobiliarias y loteadoras** — Gestión completa de proyectos de loteamiento.
> **Versión actual:** V2.1 (CAD Freeze)

> [!info] 📊 Dashboard Central
> Accede al **[[Plotify.base|Dashboard de Proyectos, ADRs e Implementaciones]]** para visualizar métricas, estados y el progreso de los loteamientos en tiempo real.

---

## Mapa del Vault

### Producto
Qué es Plotify, para quién, roles, flujos y feature flags.

- [[Vision y Alcance]]
- [[Roles y Permisos]]
- [[Flujo de Usuario]]
- [[Feature Flags]]

### Arquitectura
Diseño del sistema, patrones, motor de geometrías y comunicación entre servicios.

- [[Arquitectura General]]
- [[Patrones de Diseno]]
- [[Motor de Geometrias]]
- [[Comunicacion entre Servicios]]

### Frontend (Next.js)
App Router, componentes, servicios, acciones, tipos, validaciones y testing.

- [[Tech Stack Frontend]]
- [[Estructura de Carpetas Frontend]]
- [[Rutas y Endpoints API]]
- [[Servicios lib-services]]
- [[Server Actions]]
- [[Validaciones Zod]]
- [[Tipos TypeScript]]
- [[Middleware y Session]]
- [[Componentes Clave]]
- [[Testing Frontend]]

### Backend (plotify_chat)
Microservicio FastAPI + LangGraph para agente IA.

- [[Tech Stack Backend]]
- [[Estructura Backend]]
- [[Core del Microservicio]]
- [[API Endpoints Microservicio]]
- [[Agente IA LangGraph]]
- [[Agent Tools LangGraph]]
- [[Workers del Microservicio]]
- [[Integraciones Telegram WhatsApp]]
- [[Seguridad Backend]]

### Base de Datos (Supabase)
Schema, tablas, triggers, RLS, procedimientos, storage.

- [[Schema General BD]]
- [[Tablas Core BD]]
- [[Tablas Legacy y Adicionales]]
- [[Tablas Agente IA]]
- [[Tablas Documentos BD]]
- [[Tablas MCP]]
- [[Enums Personalizados]]
- [[Politicas RLS]]
- [[Procedimientos Atomicos]]
- [[Triggers de la DB]]
- [[Storage Buckets]]

### Documentación Legal
Generación de documentos legales (escrituras, deslindes, servidumbres).

- [[Generacion de Documentos]]
- [[Texto de Deslinde]]
- [[Servidumbres Legal]]

### Guías de Desarrollo
Setup, convenciones, cómo agregar features y tests.

- [[Setup Local]]
- [[Convenciones de Codigo]]
- [[Como Agregar un Feature]]
- [[Como Agregar un Test]]
- [[Variables de Entorno]]

### Referencia
Glosario, migraciones y roadmap.

- [[Glosario]]
- [[Migraciones]]
- [[Roadmap Plotify]]
- [[Hoja de Ruta - Cierre Plotify Piloto Clientes]]
- [[Backlog Implementable - Cierre Plotify]]
- [[Plotify.base|📊 Dashboard Interactivo (Bases)]]

### PRD y ADRs
Definicion de producto, decisiones arquitectonicas y criterios de cierre del piloto.

- [[PRD - Cierre Plotify Piloto Clientes]]
- [[ADR-001 - Adoptar Monorepo pnpm]]
- [[ADR-002 - Supabase Migrations como Fuente Unica]]
- [[ADR-003 - Contrato Next FastAPI via OpenAPI]]
- [[ADR-004 - Variables Documentales Canonicas Anidadas]]
- [[ADR-005 - Preview y Generacion Documental desde Backend]]
- [[ADR-006 - Service Role con Validacion Tenant Explicita]]
- [[ADR-007 - Baseline DB para Monorepo]]
- [[ADR-008 - Mantener LangGraph en Python para V1]]

### Revision y decisiones
Analisis integral del repositorio para decidir arquitectura, ownership y prioridades.

- [[Revision Integral 2026-04-14]]
- [[Revision Base de Datos Supabase 2026-04-14]]
- [[Mapa de Integracion Frontend Backend]]
- [[Riesgos y Brechas Tecnicas]]
- [[Matriz de Decisiones Pendientes]]

### Implementaciones recientes
Cambios ya aplicados que explican el estado operativo actual del monorepo.

- [[Implementacion Punto 1 - Congelar DB Supabase]]
- [[Implementacion Infra Local Docker Compartida]]
- [[Implementacion Punto 3 - Monorepo pnpm]]
- [[Implementacion Punto 4 - Consolidacion Operativa Monorepo]]
- [[Implementacion SDD 001 Fase 1 - Setup MVP]]
- [[Implementacion SDD 001 Fase 2 - Foundation MVP]]

---

## Repositorio

- **Frontend:** `apps/web` (Next.js)
- **Backend:** `apps/api` (FastAPI + LangGraph)
- **DB:** Supabase (PostgreSQL local puerto 8000)
- **Microservicio chat:** puerto 8005

## Conteo

- **71 notas** documentadas
- **6 secciones** temáticas
- **Wikilinks** entre notas relacionadas
- **Tags** por dominio (#frontend, #backend, #db, #arquitectura, #legal, #guia, #referencia, #prd, #adr)

*Última actualización: 25 de mayo de 2026*



## Implementaciones cerradas

- [[Implementacion Punto 1 - Congelar DB Supabase]] - DB Supabase congelada en packages/database/supabase/migrations, baseline validado y migraciones antiguas removidas.
- [[Implementacion Infra Local Docker Compartida]] - Plotify usa el stack Supabase Docker compartido de 14 contenedores y Redis Docker existente; se eliminaron contenedores `supabase_*_plotify`, se normalizaron `.env`/`.env.example` y se verificaron Redis, LangGraph checkpointer y tests backend.
- [[Implementacion Punto 3 - Monorepo pnpm]] - Workspace pnpm con `apps/web`, `apps/api`, `packages/database` y `packages/contracts`.
- [[Implementacion Punto 4 - Consolidacion Operativa Monorepo]] - Documentacion centralizada, `.gitignore` monorepo, scripts de arranque y endpoint del visor restaurado.
- [[Implementacion SDD 001 Fase 1 - Setup MVP]] - Setup de `001-stabilize-plotify-mvp` cerrado: scope, plan, contratos API y contratos DB revisados antes de foundation.
- [[Implementacion SDD 001 Fase 2 - Foundation MVP]] - Foundation de `001-stabilize-plotify-mvp` cerrada: migracion de templates/documentos, versionado, contratos OpenAPI, fixtures multi-tenant, tests MVP y quickstart de piloto 20 lotes.
