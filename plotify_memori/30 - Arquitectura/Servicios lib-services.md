# Servicios lib/services

**Tag:** #frontend #servicios
**Relacionado:** [[00 - Home]], [[Estructura de Carpetas Frontend]], [[Patrones de Diseno]]

---

## Vision general

17 archivos en `src/lib/services/` que encapsulan queries a Supabase. Los componentes y Server Actions importan servicios, nunca llaman a `supabase.from()` directamente.

## Lista de servicios

| Servicio | Responsabilidad |
|----------|----------------|
| agent-skills.service.ts | CRUD de habilidades del agente IA |
| approvals.service.ts | Gestion de aprobaciones de reserva |
| audit.service.ts | Consulta de logs de auditoria |
| dashboard.service.ts | KPIs y metricas del dashboard |
| document-generation.service.ts | Generacion de documentos legales |
| documents.service.ts | CRUD de bloques, plantillas, documentos |
| kml-to-geojson.service.ts | Parsing KML a GeoJSON |
| kmz-parser.service.ts | Descompresion y parseo de KMZ |
| lots.service.ts | CRUD de lotes, estados, filtros |
| microservice.client.ts | Puente HTTP a plotify_chat |
| onboarding.service.ts | Wizard de creacion de proyecto |
| operations.service.ts | Vista operaciones, tabla de lotes |
| projects.service.ts | CRUD de proyectos |
| prompt-ops.service.ts | Gestion de prompts del agente |
| vendors.service.ts | Gestion de vendedores |
| viewer.service.ts | Feature collection para mapa |
| workspace.service.ts | Config de workspace/org |

## Patron de uso

```
Server Action → import { getX } from '@/lib/services/X.service'
→ Service llama a Supabase
→ Retorna datos tipados o lanza error
```

## Supabase clients

- **Browser client** (`src/lib/supabase/client.ts`) — Usa anon key, sujeto a RLS.
- **Server client** (`src/lib/supabase/server.ts`) — Usa service role key, bypass RLS.

Los servicios que corren en server usan el server client. Los que corren en browser usan el browser client.

## Relacionado
- [[Patrones de Diseno]] — Service Layer Pattern
- [[Server Actions]] — Quien consume estos servicios
