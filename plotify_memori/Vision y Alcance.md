# Visión y Alcance

**Tag:** #producto
**Relacionado:** [[00 - Home]], [[Roles y Permisos]], [[Flujo de Usuario]], [[Arquitectura General]]

---

## Qué es Plotify

Plotify es una plataforma **B2B SaaS** diseñada para **inmobiliarias y desarrolladoras de terrenos** que necesitan gestionar proyectos de loteamiento completo.

## Problema que resuelve

Las empresas que trabajan con subdivisión de terrenos manejaban lotes, estados de venta, datos contractuales y documentos legales en planillas y archivos dispersos. Plotify centraliza todo en un sistema interactivo con mapa.

## Funcionalidades principales

1. **Importación de datos geoespaciales** — Archivos KMZ/KML con geometrías de lotes, caminos y áreas comunes.
2. **Asignación de geometrías** — Vinculación de polígonos del mapa a lotes individuales con cálculo automático de m².
3. **Gestión de estados de venta** — Disponible → Reservado → Vendido → Cancelado.
4. **Tracking contractual** — Datos del comprador, documentos legales, gastos, comisiones, estado CBR.
5. **Dashboard de KPIs** — Métricas en tiempo real del proyecto.
6. **Generación de documentos legales** — Escrituras, deslindes, servidumbres (sistema de bloques + plantillas).
7. **Agente IA** — Bot de Telegram/WhatsApp que responde consultas sobre disponibilidad de lotes y requisitos de reserva.
8. **Gestión de vendors** — Asignación de vendedores a proyectos, tracking de su actividad.

## Versión actual: V2.1 (CAD Freeze)

- El procesamiento de archivos CAD (DWG/DXF) está **congelado/experimental**.
- El flujo principal de importación es nativo **KMZ/KML**.
- Motivo: la mayoría de los clientes ya tienen los lotes georreferenciados en KMZ; el pipeline CAD era costoso y de baja adopción.

## Stack resumido

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui |
| Mapas | MapLibre GL + Turf.js + proj4 |
| DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth (SSR) |
| Backend IA | FastAPI + LangGraph + Redis/arq |

## Relacionado
- [[Roles y Permisos]] — Quién puede hacer qué
- [[Flujo de Usuario]] — Camino del usuario desde login hasta operaciones
- [[Arquitectura General]] — Cómo están conectados los componentes