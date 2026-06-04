---
title: Plan Logica Productiva Generador Escrituras - Variables y Editor
aliases:
  - Plan Variables y Editor Escrituras
  - Centro de Control Legal Escrituras
date: 2026-06-03
status: planificado
tags:
  - producto
  - documentos
  - escrituras
  - ux
  - legal
related:
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[Variables Escritura Compraventa - Fuentes de Obtencion]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
  - "[[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]"
  - "[[SDD 007 Escrituras Variable Resolution]]"
  - "[[Texto de Deslinde]]"
  - "[[Rol de Avaluo en Tramite - Fuentes SII]]"
---

# Plan Logica Productiva Generador Escrituras - Variables y Editor

## Diagnostico del codigo actual

- El onboarding de proyecto ya pide documentos legales:
  `doc_dominio_vigente`, `doc_hipoteca_gravamen`, `doc_roles`,
  `doc_subdivision`, `doc_plano_oficial` y `doc_otros`.
- La carga actual guarda archivos en `project-files` y campos de `projects`,
  pero no crea ingesta, extraccion, evidencia ni variables.
- `project_legal_data` existe, pero solo cubre CBR/SAG/personeria basica y un
  `roles` JSONB sin resolver productivamente.
- El resolver documental actual (`document_engine.py`) toma datos de `lots`,
  `lot_records`, `projects`, `organizations`, `project_legal_data` y
  `organization_payment_info`; no usa documentos fuente ni evidencia.
- El sistema ya tiene ProseKit para editar bloques legales y dnd-kit para ordenar
  plantillas. Esta sera la base del constructor de minuta.
- El sistema ya tiene readiness geometrico de lote:
  `validateLotDocumentReadiness()` exige lote verificado, superficie oficial,
  perimetro oficial y deslindes oficiales.

## Decisiones cerradas

- En el onboarding solo se suben documentos y se dispara extraccion automatica.
- El usuario no revisa variables en onboarding para no volver tediosa la creacion
  del proyecto.
- La revision, correccion y aprobacion de variables ocurre despues, en el
  `Centro de Control Legal`.
- El constructor visual usara ProseKit y dnd-kit.
- La primera fase productiva no es el editor: es extraccion, resolucion,
  trazabilidad y brechas de variables.

## Decision de flujo

El proyecto puede crearse aunque falten documentos. La generacion de escritura
no debe ocurrir durante el onboarding, sino despues, cuando el proyecto tenga:

1. Documentos legales cargados o pendientes identificados.
2. Variables extraidas o marcadas para revision.
3. KMZ/plano revisado por usuario.
4. Lote vendido con comprador y precio.
5. Readiness legal/geometrico suficiente para crear una minuta preliminar.

El onboarding debe capturar antecedentes temprano y procesarlos en segundo
plano; el modulo de escritura debe ser un centro de control legal posterior.

## Pipeline de documentos

Cada documento cargado debe crear un `document_ingestion_job` sin exigir accion
adicional del usuario durante el onboarding:

```text
uploaded -> text_extracted -> variables_proposed -> waiting_control_center_review
-> variables_approved -> used_in_minuta
```

### Dominio vigente

- Convertir/OCR a texto.
- Extraer predio matriz, ubicacion, superficie, deslindes matriz, historial de
  adquisicion, inscripcion CBR, rol matriz y vendedor.
- Poblar `project_legal_data`, `document_evidence` y `variable_resolutions`.
- Mostrar diferencias contra datos del proyecto si comuna/region/nombre no
  coinciden.

### Certificado de roles SII

- Extraer numero de certificado, fecha, solicitud/F2118, rol matriz, unidad/lote
  y pre-rol/rol de avaluo en tramite.
- Hacer matching por lote/unidad con los lotes del proyecto.
- Poblar `lot_legal_data` por lote.
- Si hay respaldo SII, `Rol de avaluo en tramite` es valido y no debe verse como
  dato faltante.

### Certificado SAG y plano CBR

- SAG: extraer numero, fecha, region/oficina y cumplimiento de subdivision.
- Plano: extraer lo posible, pero asumir baja confianza.
- La UI debe pedir manualmente numero de plano, ano, registro/legajo y archivo
  CBR cuando el extractor no sea confiable.
- Estos datos alimentan `sag.*`, `plano.*` y evidencia.

### KMZ y deslindes

- El KMZ no es fuente juridica final: es geometria operativa.
- El usuario debe verificar que los deslindes derivados reflejen el plano oficial.
- La UI actual ya permite editar vecinos, distancias, servidumbre y deslindes.
- Solo despues de guardar override/verificacion se puede activar
  `geometry_verified`.

### Datos comerciales y comprador

- Comprador, RUT, domicilio, estado civil y ocupacion vienen de `lot_records`
  cuando se vende/reserva la parcela.
- Precio y forma de pago vienen de `lot_records` y futuras
  `payment_instructions`.
- No deben escribirse manualmente dentro del editor si ya existen como variable.

### Variables manuales obligatorias

Algunas variables no deben inferirse:

- Abogado redactor/revisor.
- Mandatario para rectificaciones/reparos.
- Instrucciones especiales de pago/custodia.
- Clausulas excepcionales o de riesgo.
- Correcciones por reparos de notaria/CBR.

Estas variables deben aparecer como pendientes en el panel derecho y resolverse
por formulario/revision, no tipeandolas libremente en el texto.

## UI propuesta: centro de control legal

### Layout

Usar una interfaz de tres zonas:

- Izquierda: navegador de clausulas/bloques.
- Centro: editor de minuta.
- Derecha: inventario de variables y readiness.

Los paneles laterales deben poder colapsarse para dejar mas espacio al editor.

### Panel izquierdo

Funciones:

- Lista de clausulas: caratula, comparecencia, PRIMERO, SEGUNDO, TERCERO, etc.
- Estado por clausula: completa, faltan variables, requiere revision, bloqueada.
- Biblioteca de clausulas condicionales: personeria, reserva de dominio,
  mandato, reparos, anexos.
- Reordenamiento solo para bloques no bloqueados.
- Seleccion de clausula para enfocar el editor.

### Lienzo central

Debe mostrar el template base de la minuta DOCX inscrita. Cada clausula es un
bloque editable y versionado.

Modos recomendados:

- **Template**: muestra variables como tokens.
- **Resuelto**: muestra valores reales.
- **Evidencia**: resalta variables por fuente/estado.

### Panel derecho

Funciones:

- Inventario de variables.
- Filtros: faltantes, conflicto, manual review, aprobado, por documento.
- Edicion de variable con valor, fuente, evidencia, confianza y motivo.
- Vista rapida de documento/pagina/chunk cuando exista evidencia.
- Accion insertar variable en cursor.
- Estado de readiness general: dominio, SII, SAG/plano, geometria, partes,
  precio, RNDA, revision legal.

## UX de variables

El usuario no debe escribir nombres de variables a mano. Las variables deben ser
smart fields:

- Click para insertar en cursor.
- Drag and drop al editor si el editor lo soporta bien.
- Pildoras visuales con color/estado.
- Tooltip o popover con valor actual, fuente, evidencia y estado.
- Doble click abre edicion de variable.
- Alternar entre `{{ comprador.nombre }}` y valor resuelto.

Estados visuales:

| Estado | Visual |
| --- | --- |
| `resolved` | Verde suave, valor aprobado |
| `derived` | Azul, calculado desde otra fuente |
| `manual_review` | Amarillo, requiere revisar |
| `missing` | Rojo, bloquea o deja corchete |
| `conflict` | Rojo fuerte, dos fuentes no coinciden |
| `not_applicable` | Gris, oculto por condicion |

## Editor: decision tecnica

Usar el editor existente basado en ProseKit y extenderlo con:

- Insertar variable en cursor.
- Marca/nodo visual para variables.
- Serializacion HTML/Jinja compatible con el backend actual.
- Panel derecho de variables.
- Bloques/clausulas con dnd-kit.

Razon: ProseKit ya esta instalado, ya existe `ProseKitEditor`, ya existe
`TemplateBuilder` con dnd-kit y el backend actual renderiza HTML/Jinja.

### Persistencia recomendada

No guardar solo texto plano. Guardar:

```json
{
  "templateVersionId": "...",
  "blocks": [
    {
      "id": "clause-primero",
      "kind": "clause",
      "ordinal": "PRIMERO",
      "title": "Dominio del predio matriz",
      "content": "... HTML/Jinja ...",
      "requiredVariables": ["matriz.nombre_predio", "matriz.inscripcion_fojas"],
      "condition": null,
      "locked": true
    }
  ],
  "variableSnapshot": {
    "matriz.nombre_predio": {
      "value": "LOTE NUMERO TRES...",
      "status": "resolved",
      "source": "dominio_vigente",
      "evidenceId": "..."
    }
  }
}
```

El render final debe generar DOCX desde snapshot aprobado, no desde variables
vivas que puedan cambiar despues.

## LLM bajo la extraccion

Usar LLM es razonable, pero con frontera estricta:

- OCR/conversion primero.
- Extractor estructurado despues.
- LLM propone valores y evidencia, no aprueba juridicamente.
- Cada salida debe tener schema, confidence y referencia a pagina/chunk.
- Nunca usar LLM para inventar deslindes o roles.
- Si no hay evidencia, estado `missing` o `manual_review`.

## Primera fase productiva: variables y extraccion

El primer SDD productivo debe centrarse en responder tres preguntas:

1. Que variables existen para la minuta de compraventa.
2. De donde se obtiene cada variable.
3. Que variable falta, queda en conflicto o requiere revision humana.

La matriz editable viene despues de tener resuelto este contrato de variables.

### Objetivo de fase 1

- Procesar documentos subidos en onboarding o en documentos del proyecto.
- Extraer texto y variables candidatas.
- Guardar evidencia por variable.
- Permitir revisar variables en el centro de control legal.
- Resolver readiness de variables antes de construir la minuta.

### Entregable de fase 1

Una pantalla de `Centro de Control Legal` enfocada solo en variables:

- Lista de documentos fuente y estado de extraccion.
- Tabla de variables por grupo.
- Estados `resolved`, `missing`, `conflict`, `manual_review`, `derived`.
- Edicion manual con auditoria.
- Evidencia documento/pagina/chunk.
- Readiness por dominio, SII, SAG/plano, geometria, partes y precio.

## Secuencia de implementacion propuesta

1. Crear SDD productivo `007-escrituras-variable-resolution`.
2. Modelar `legal_documents`, `document_ingestion_jobs`, `document_evidence`,
   `variable_resolutions`, `lot_legal_data` y `escritura_cases`.
3. Conectar uploads actuales de onboarding/documentos de proyecto a
   `legal_documents`.
4. Reutilizar la conversion del laboratorio para extraer texto en segundo plano.
5. Implementar extractores por tipo: dominio, roles SII, SAG/plano.
6. Crear UI de revision de variables por proyecto.
7. Integrar readiness legal con readiness geometrico existente.
8. Identificar brechas de variables por lote vendido.
9. Crear caso de escritura por lote vendido.
10. Construir editor V1 con ProseKit extendido.
11. Generar DOCX preliminar desde snapshot.
12. Agregar revision legal y gate `minuta_approved`.

## Riesgos

- Plano oficial: extraccion automatica sera incompleta; requiere UI manual.
- Variables sin evidencia: deben bloquear o quedar claramente en revision.
- Si se guarda HTML sin estructura, sera dificil auditar variables.
- Si el onboarding bloquea demasiado, la creacion de proyecto se vuelve lenta.

## Recomendacion final

Capturar documentos en onboarding, procesarlos inmediatamente en segundo plano y
mover toda revision al `Centro de Control Legal`. La primera implementacion debe
cerrar variables, fuentes, evidencia y brechas; la matriz editable se construye
sobre ese contrato cuando el readiness este claro.
