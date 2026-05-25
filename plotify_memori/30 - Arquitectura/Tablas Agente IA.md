# Tablas del Agente IA

**Tag:** #db #ia
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Agente IA LangGraph]]

---

## system_prompts

Catalogo de prompts del sistema, versionados.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| key | text | Identificador unico del prompt |
| description | text | Descripcion del proposito |
| is_active | bool | Si esta en uso |

## prompt_versions

Historial de versiones de cada prompt.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| prompt_id | uuid | FK -> system_prompts |
| version | integer | Numero de version |
| content | text | Texto del prompt |
| created_at | timestamptz | Fecha de creacion |
| is_active | bool | Version activa |

## agent_skills

Catalogo global de habilidades/capacidades del agente.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| key | text | Identificador unico |
| label | text | Nombre visible |
| description | text | Que hace esta skill |
| category | text | Categoria (consulta, accion, doc) |

## org_skill_configs

Configuracion por org de que skills estan activas.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK -> organizations |
| skill_id | uuid | FK -> agent_skills |
| is_enabled | bool | Skill activa o no |

## agent_custom_instructions

Instrucciones custom por usuario para el agente.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK -> profiles |
| instructions | text | Texto de instrucciones |

## Flujo de uso

1. Agente lee `system_prompts` → obtiene prompt activo.
2. Lee `org_skill_configs` → filtra skills habilitadas para esa org.
3. Lee `agent_custom_instructions` → agrega instrucciones custom del usuario.
4. Construye el mensaje final para LangGraph.

## Relacionado
- [[Agente IA LangGraph]] — Como usa estas tablas el agente
- [[Tablas Core BD]] — Tablas principales del negocio
