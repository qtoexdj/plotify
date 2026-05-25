# Generacion de Documentos Legales

**Tag:** #documentos #legal
**Relacionado:** [[00 - Home]], [[Tablas Documentos BD]], [[Texto de Deslinde]], [[Servidumbres Legal]]

---

## Vision general

Sistema de generacion de documentos legales (escrituras, deslindes) basado en bloques reutilizables con plantillas Jinja2.

## Arquitectura

### 1. Bloques (document_blocks)

- Texto legal atomico con placeholders Jinja2.
- 18 articulos de escritura seedeados.
- Cada bloque declara variables requeridas.
- Se gestionan desde `/documentos/bloques`.

### 2. Plantillas (document_templates)

- Secuencia ordenada de bloques.
- Cada item tiene posicion y condicion opcional.
- Se construyen con drag-and-drop en `/documentos/plantillas`.

### 3. Documentos generados (generated_documents)

- Historial inmutable.
- Cada registro guarda la URL del PDF y las variables usadas.

## Variables de escritura (EscrituraVariables)

Secciones de datos que se inyectan:

- **Comparecientes**: personas naturales o juridicas que firman.
- **Matriz**: datos de la propiedad original.
- **Subdivision SAG**: datos de la subdivision agricola.
- **Lote**: datos del lote especifico (m2, numero, ubicacion).
- **Servidumbre**: analisis de servidumbre de transito.
- **Transaccion**: precio, condiciones de pago.
- **Mandate**: datos del mandatario.
- **Personeria**: representacion legal.

## Pipeline

```
1. Usuario selecciona lote → genera variables EscrituraVariables
2. Carga plantilla → ensambla bloques en orden
3. Jinja2 renderiza (microservicio) → WeasyPrint → PDF
4. Guarda en Supabase Storage → registro en generated_documents
5. Retorna URL de descarga al frontend
```

## Tecnologias

| Capa | Tecnologia |
|------|-----------|
| Templates | Jinja2 (Python) |
| PDF | WeasyPrint |
| DOCX | python-docx |
| Frontend | dnd-kit (drag-and-drop), ProseKit (editor) |

## Articulos de escritura (18)

1. Comparecencia
2. Matriz (propiedad original)
3. Subdivision SAG
4. Identificacion del lote
5. Servidumbre de transito
6. Transaccion y precio
7. Mandato
8. Personeria
9-18. Articulos adicionales (declaraciones, condiciones, cierre, etc.)

## Relacionado
- [[Texto de Deslinde]] — Generacion de boundary descriptions
- [[Servidumbres Legal]] — Analisis geometrico que alimenta el documento
- [[Tablas Documentos BD]] — Schema de las tablas
