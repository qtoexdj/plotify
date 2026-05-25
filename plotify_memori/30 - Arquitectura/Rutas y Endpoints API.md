# Rutas y Endpoints API

**Tag:** #frontend #api
**Relacionado:** [[00 - Home]], [[Estructura de Carpetas Frontend]], [[Flujo de Usuario]]

---

## Rutas de Pagina (App Router)

### Autenticacion (auth)

| Ruta | Layout | Descripcion |
|------|--------|-------------|
| /login | (auth) | Pagina de login |
| /callback | (auth) | OAuth callback |

### Dashboard protegido

| Ruta | Layout | Descripcion |
|------|--------|-------------|
| /dashboard | (dashboard) | KPIs principales |
| /onboarding | (dashboard) | Wizard creacion proyecto |
| /operations | (dashboard) | Vista operaciones con tabla de lotes |
| /projects | (dashboard) | Lista de proyectos |
| /projects/[projectId] | (dashboard) | Detalle de proyecto con tabs |
| /clients | (dashboard) | Gestion compradores (solo Admin) |
| /vendors | (dashboard) | Gestion vendedores |
| /agente/skills | (dashboard) | Toggle habilidades agente |
| /agente/integrations | (dashboard) | Config bot Telegram |
| /documentos/plantillas | (dashboard) | Template builder |
| /documentos/generar | (dashboard) | Generar doc por lote |
| /documentos/historial | (dashboard) | Historial documentos |
| /documentos/bloques | (dashboard) | CRUD bloques texto |
| /settings/profile | (dashboard) | Editar perfil |
| /settings/workspace | (dashboard) | Config workspace |

### Super Admin

| Ruta | Descripcion |
|------|-------------|
| /super-admin/users | Gestion usuarios |
| /super-admin/organizations | Gestion orgs |
| /super-admin/projects | Todos los proyectos |
| /super-admin/audit-logs | Logs auditoria |
| /super-admin/prompt-ops | Gestion prompts IA |

## API Routes (src/app/api/)

### Proyectos

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | /api/projects | Listar proyectos |
| POST | /api/projects | Crear proyecto |
| GET | /api/projects/[id] | Ver proyecto |
| DELETE | /api/projects/[id] | Eliminar proyecto |
| GET | /api/projects/[id]/lots | Lotes de proyecto |
| POST | /api/projects/[id]/lots | Crear lote |
| PATCH | /api/projects/[id]/lots/[lotId] | Actualizar lote |
| DELETE | /api/projects/[id]/lots/[lotId] | Eliminar lote |

### Uploads

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | /api/uploads/geometry | Upload KMZ/KML |
| POST | /api/uploads/project-files | Upload docs/imagenes |

### Onboarding

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | /api/onboarding/[projectId]/lots | Lotes para onboarding |
| GET | /api/onboarding/[projectId]/geometries | Geometrias |
| POST | /api/onboarding/assign | Asignar geometria a lote |
| POST | /api/onboarding/save-and-assign | Guardar y asignar |
| POST | /api/onboarding/save-infrastructure | Guardar caminos |
| DELETE | /api/onboarding/unassign-geometry | Desasignar geometria |

### Viewer

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | /api/viewer/[projectId]/feature-collection | Feature collection para mapa |

Estado 2026-04-16:

- Este endpoint es obligatorio para `GeometryViewer`.
- Implementacion activa: `apps/web/src/app/api/viewer/[projectId]/feature-collection/route.ts`.
- Servicio usado: `apps/web/src/lib/services/viewer.service.ts#getFeatureCollection`.
- Si falta la route handler, el visor falla con 404 en consola.

### Otros

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | /api/v1/approvals/request-reservation | Endpoint aprobacion agente |
| GET | /api/health | Health check |

## Relacionado
- [[Flujo de Usuario]] — Como navega el usuario por estas rutas
- [[Server Actions]] — Mutaciones que no pasan por API routes
