# Tablas MCP (Model Context Protocol)

**Tag:** #db #integraciones
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Seguridad Backend]]

---

## mcp_connections

Conexiones OAuth encriptadas a servicios externos.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK -> organizations |
| provider | text | google_drive, gmail, notion, slack |
| encrypted_credentials | bytea | Credenciales encriptadas con pgcrypto |
| connected_at | timestamptz | Fecha de conexion |
| is_active | bool | Conexion activa |

## Seguridad

- Credenciales encriptadas con `pgp_sym_encrypt` (pgcrypto).
- Solo el microservicio puede desencriptar con la clave en variable de entorno.
- El frontend nunca ve las credenciales crudas.
- RLS bloquea acceso directo a esta tabla.

## Proposito

Permitir que el agente IA acceda a contexto externo:
- Google Drive: documentos del proyecto.
- Gmail: correos relacionados.
- Notion: notas y documentacion.
- Slack: comunicacion del equipo.

## Relacionado
- [[Seguridad Backend]] — Encriptacion pgcrypto
- [[Agente IA LangGraph]] — Como el agente usa estas conexiones
