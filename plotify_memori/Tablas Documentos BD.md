# Tablas de Documentos

**Tag:** #db #documentos
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Generacion de Documentos]]

---

## document_blocks

Bloques de texto legal reutilizables con placeholders Jinja2.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK -> organizations |
| name | text | Nombre descriptivo |
| content | text | Texto legal con placeholders |
| variables_required | jsonb | Variables necesarias |
| created_at | timestamptz | Fecha |

## document_templates

Plantillas de documentos (secuencias de bloques).

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK -> organizations |
| name | text | Tipo de documento (escritura, deslinde) |
| description | text | Descripcion |

## template_block_items

Mapeo template -> bloques con ordenamiento.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| template_id | uuid | FK -> document_templates |
| block_id | uuid | FK -> document_blocks |
| position | integer | Orden del bloque |
| condition | text | Condicion Jinja2 para incluir/excluir |

## generated_documents

Historial inmutable de documentos generados.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| lot_id | uuid | FK -> lots |
| template_id | uuid | FK -> document_templates |
| file_url | text | URL en Supabase Storage |
| variables_used | jsonb | Variables con las que se genero |
| generated_at | timestamptz | Fecha de generacion |
| generated_by | uuid | FK -> profiles |

## Pipeline de generacion

```
Bloques (content con Jinja2 placeholders)
→ se ensamblan en Template (orden + condiciones)
→ se inyectan variables del lote (EscrituraVariables)
→ Jinja2 renderiza → WeasyPrint genera PDF
→ se guarda en Storage → registro en generated_documents
```

## Articulos de escritura

18 articulos atomicos seedeados:
comparecencia, matriz, subdivision SAG, lote, servidumbre, transaccion, mandato, personeria, cierre, etc.

## Relacionado
- [[Generacion de Documentos]] — Pipeline completo
- [[Tablas Core BD]] — Referencia a lots y organizations
