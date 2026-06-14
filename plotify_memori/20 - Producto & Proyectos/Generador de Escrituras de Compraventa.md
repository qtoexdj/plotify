---
title: Generador de Escrituras de Compraventa
aliases:
  - Gestor de Escrituras Productivo
  - Minuta DOCX de Compraventa
date: 2026-06-03
status: mesa de escritura implementada tecnicamente
tags:
  - producto
  - documentos
  - escrituras
  - legal
related:
  - "[[Generacion de Documentos]]"
  - "[[Texto de Deslinde]]"
  - "[[Servidumbres Legal]]"
  - "[[ADR-004 - Variables Documentales Canonicas Anidadas]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
  - "[[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]"
  - "[[SDD 007 Escrituras Variable Resolution]]"
  - "[[SDD 008 Creador de Matriz - Handoff]]"
  - "[[SDD 010 Mesa de Escritura - Handoff]]"
  - "[[Rol de Avaluo en Tramite - Fuentes SII]]"
  - "[[Variables Escritura Compraventa - Fuentes de Obtencion]]"
  - "[[Plan Logica Productiva Generador Escrituras - Variables y Editor]]"
---

# Generador de Escrituras de Compraventa

## Decision de producto

Plotify debe generar una **minuta DOCX editable** de compraventa de lote o
parcela, usando como forma objetivo el documento inscrito
`COMPRAVENTA LOTE 29.docx`. El producto no debe replicar el PDF final certificado
por notaria o Conservador.

La minuta generada debe acelerar el flujo documental de la inmobiliaria, pero
debe quedar sujeta a revision y aprobacion de abogado redactor/revisor antes de
ser usada como instrumento definitivo o enviada a notaria.

## Alcance del primer generador

- Crear un caso de escritura por proyecto, lote vendido, comprador y template.
- Cargar documentos fuente: dominio vigente, certificado SAG, plano CBR,
  certificado de roles SII, personeria/poderes e instrucciones comerciales.
- Usar el pipeline de conversion/OCR/chunks del laboratorio para proponer
  variables.
- Mostrar una tabla lateral editable con variable, valor, fuente, evidencia,
  confianza, estado y accion.
- Generar DOCX preliminar con la estructura del documento inscrito.
- Requerir revision legal para pasar a `minuta_approved`.

## Template base

El template debe seguir la estructura del DOCX inscrito:

1. Caratula: escritura publica de compraventa, vendedor y comprador.
2. Comparecencia.
3. `PRIMERO`: dominio del predio matriz, adquisiciones, inscripciones y rol.
4. `SEGUNDO`: SAG, plano CBR, individualizacion de lote, superficie, servidumbre
   afecta, deslindes y rol de avaluo en tramite.
5. `TERCERO`: compraventa, cesion y transferencia.
6. `CUARTO`: precio, forma de pago y renuncias incluidas en la minuta inscrita.
7. `QUINTO`: cuerpo cierto, gravamenes/prohibiciones/litigios, contribuciones y
   saneamiento de eviccion conforme a ley.
8. `SEXTO`: servidumbre de transito.
9. `SEPTIMO` a `DECIMO SEXTO`: entrega, gastos, domicilio, finiquito, servicios,
   permisos, CONAF, IVA, mandato, RNDA, destino rural/LGUC, portador de copia y
   cierre.

La logica interna puede separar estas materias en bloques de control, pero el
texto final debe preservar la distribucion de la minuta inscrita cuando sea el
template objetivo.

## Variables principales

| Grupo | Fuente duena | Nota |
| --- | --- | --- |
| `matriz.*` | dominio vigente y `project_legal_data` | Predio matriz, superficie, deslindes, adquisiciones e inscripcion CBR. |
| `sag.*` | certificado SAG, plano CBR y `project_legal_data` | Resolucion/certificado SAG, fecha, oficina y plano archivado. |
| `sii.*` | certificado SII de roles/preroles y `lot_legal_data` | Rol matriz, pre-rol del lote y texto de rol de avaluo en tramite. |
| `lote.*` | `lots`, geometria y `lot_legal_data` | Numero, superficie, deslindes y rol renderizado. |
| `servidumbre.*` | generador de servidumbre y geometria | Debe usar [[Texto de Deslinde]] y [[Servidumbres Legal]]. |
| `transaccion.*` | ficha de venta e instrucciones comerciales | Precio, moneda, forma de pago y saldos. |
| `revision_juridica.*` | decisiones de revision | Abogado redactor/revisor, estado, fecha y aprobacion. |

## Rol de avaluo en tramite

Para primera transferencia de un lote nacido de subdivision, `Rol de avaluo en
tramite` es un estado/documento valido, no una variable faltante. Ver
[[Rol de Avaluo en Tramite - Fuentes SII]].

## Estado actual post-SDD 010

La arquitectura de escrituras queda en tres capas:

1. **Centro de Control Legal**: resuelve y aprueba datos del expediente.
2. **Creador de matriz SDD 008**: mantiene motor, snapshots, revision legal y
   DOCX server-side.
3. **Mesa de Escritura SDD 010**: reemplaza la cabina tecnica por una
   superficie legal legible, editable en contexto y sin JSON visible.

El cierre de producto aun depende del gate humano de usabilidad de SDD 010
(T023). El siguiente salto es SDD 011: matriz del proyecto antes de la venta y
caso de escritura del lote al validar la venta.

## Flujo recomendado

```text
intake -> collecting_sources -> resolving_variables -> needs_review
-> ready_for_draft -> draft_generated -> legal_review
-> minuta_approved -> sent_to_seller/notary
```

## Cobertura end-to-end SDD 007

El quickstart de `specs/007-escrituras-variable-resolution/quickstart.md`
define la cobertura funcional que debe validar el generador antes de iniciar el
SDD 008. La ruta de producto queda cubierta por estos escenarios:

1. Onboarding sube documentos legales y dispara extraccion sin bloquear la
   creacion del proyecto.
2. Centro de Control Legal muestra variables propuestas, faltantes o en
   conflicto con evidencia documental.
3. Una variable puede corregirse, aprobarse y auditarse con valor anterior,
   nuevo valor, usuario y razon.
4. Certificados SII asignan roles o roles en tramite a lotes sin asignaciones
   silenciosas.
5. Un lote vendido expone readiness de escritura con gates de titulo, SII,
   SAG/plano, geometria, partes, precio y revision legal.
6. El caso de escritura persiste `variable_snapshot`, `evidence_snapshot` y
   `readiness_gates` para que SDD 008 no dependa de OCR bruto ni propuestas
   vivas.
7. La operacion productiva contempla falla de extraccion, reintento,
   superseding documental, idempotencia y preservacion de evidencia historica.

La validacion esperada combina pruebas automaticas y recorrido manual guiado:
`pnpm verify:migrations`, `pnpm contracts:generate`, `pnpm test:api`,
`pnpm test:web`, `pnpm typecheck:web`, `pnpm format:check` y
`pnpm build:web`.

## Pendientes de produccion fase 8

La fase 8 aun debe cerrar regresiones multi-tenant, feature flags, reintentos
idempotentes, observabilidad, acceso seguro a evidencia y guia operacional de
fallas/superseding. Esos pendientes pertenecen a SDD 007 porque protegen la
confiabilidad de los snapshots que consumira el creador de matriz.

## Conexiones

- Respaldo completo: [[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]
- Mesa UX actual: [[SDD 010 Mesa de Escritura - Handoff]]
- Tabla operativa de variables: [[Variables Escritura Compraventa - Fuentes de Obtencion]]
- Plan de flujo/editor: [[Plan Logica Productiva Generador Escrituras - Variables y Editor]]
- Decision tecnica: [[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]
- Sistema documental actual: [[Generacion de Documentos]]
- Variables canonicas: [[ADR-004 - Variables Documentales Canonicas Anidadas]]
- Deslindes: [[Texto de Deslinde]]
