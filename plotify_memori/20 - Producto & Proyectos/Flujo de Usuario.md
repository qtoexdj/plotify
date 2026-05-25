# Flujo de Usuario

**Tag:** #producto
**Relacionado:** [[Vision y Alcance]], [[Roles y Permisos]], [[Setup Local]], [[Rutas y Endpoints API]]

---

## Camino tipico de un Organization Admin

```
Registro/Login → Onboarding → Dashboard → Operaciones → Documentos
```

### 1. Autenticacion `(auth)`

- `/login` — Login con Supabase Auth (email/password o magic link).
- `/callback` — OAuth callback handler que establece sesion SSR.
- Redirect automatico a `/dashboard`.

### 2. Onboarding (primer uso)

- `/onboarding` — Wizard de creacion de proyecto:
  1. Datos del proyecto (nombre, ubicacion, datos SAG).
  2. Upload de archivo KMZ/KML.
  3. Parser KMZ → extrae geometrias como GeoJSON.
  4. **Mapa interactivo** (MapLibre GL) — asignacion visual de poligonos a lotes.
  5. Calculo automatico de m2 con Turf.js.
  6. Guardado → proyecto creado con lotes y geometrias.

### 3. Dashboard

- `/dashboard` — KPIs del proyecto seleccionado:
  - Lotes disponibles / reservados / vendidos.
  - Ingreso proyectado vs confirmado.
  - Estado de firmas (reserva, escritura).

### 4. Operations

- `/operations` — Vista de tabla con todos los lotes, filtros por estado, vendedor, etapa de proceso.
- KPICards en tiempo real.

### 5. Projects

- `/projects` — CRUD de proyectos.
- `/projects/[projectId]` — Detalle con tabs:
  - Mapa (geometry viewer con MapLibre).
  - Lista de lotes.
  - Estado de venta.
  - Asignacion de vendors.

### 6. Clients

- `/clients` — Gestion de compradores (solo Admin).
- Datos de contacto, documentos, estado de pago.

### 7. Documentos

- `/documentos/plantillas` — Template builder con drag-and-drop (dnd-kit).
- `/documentos/generar?lotId=X` — Generar documentos para un lote especifico.
- `/documentos/historial` — Historial de documentos generados.
- `/documentos/bloques` — CRUD de bloques de texto legal reutilizables.

### 8. Agente IA

- `/agente/skills` — Toggle de habilidades del agente.
- `/agente/integrations` — Configuracion de bot de Telegram (deep linking).

### 9. Settings

- `/settings/profile` — Editar perfil, avatar.
- `/settings/workspace` — Configuracion del workspace, invites.

### 10. Super Admin

- `/super-admin/users` — Gestion de usuarios.
- `/super-admin/organizations` — Gestion de orgs.
- `/super-admin/projects` — Todos los proyectos.
- `/super-admin/audit-logs` — Logs de auditoria.
- `/super-admin/prompt-ops` — Gestion de prompts del agente IA.

## Camino de un Vendor (Org User)

```
Login → Dashboard (limitado) → Operations (solo sus lotes) → Projects asignados
```

- NO ve Clients, Documentos/Legal, ni puede crear proyectos.
- Solo ve lotes que el mismo reservo o vendio.

## Relacionado
- [[Rutas y Endpoints API]] — Detalle tecnico de cada ruta
- [[Roles y Permisos]] — Que puede hacer cada rol
