---
title: Variables Escritura Compraventa - Fuentes de Obtencion
aliases:
  - Variables de Escritura de Compraventa
  - Fuentes de Variables Escritura
date: 2026-06-03
status: referencia-operativa
tags:
  - referencia
  - documentos
  - escrituras
  - variables
  - legal
related:
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
  - "[[Rol de Avaluo en Tramite - Fuentes SII]]"
  - "[[ADR-004 - Variables Documentales Canonicas Anidadas]]"
---

# Variables Escritura Compraventa - Fuentes de Obtencion

## Uso

Esta nota organiza las variables necesarias para generar la minuta DOCX de
compraventa y define de donde debe obtenerlas Plotify. Es la tabla operativa para
disenar el extractor, la interfaz lateral de revision y los readiness gates.

> [!important] Criterio
> La minuta debe usar variables aprobadas/editadas con evidencia. No debe
> renderizar directamente texto bruto de OCR ni inferencias sin fuente.

## Documento y revision

| Variable | Uso en minuta/flujo | Fuente primaria | Modelo recomendado | Obtencion | Gate |
| --- | --- | --- | --- | --- | --- |
| `documento.tipo` | Titulo/tipo de instrumento | Template aprobado | `document_templates` | Seleccion de template | `template_versioned` |
| `documento.ciudad_otorgamiento` | Contexto de cierre si se conoce | Instruccion de otorgamiento | `escritura_cases`/`notarial_context` | Manual | `optional_context` |
| `documento.fecha_otorgamiento` | Fecha real de firma | Notaria/escritura firmada | `generated_documents`/post minuta | Manual/post firma | `post_minuta` |
| `documento.repertorio_numero` | Repertorio real | Notaria | Post minuta | No lo genera Plotify | `post_minuta` |
| `documento.notario.nombre` | Cierre si se conoce | Notaria destino | `notarial_context` | Manual opcional | `optional_context` |
| `documento.notaria.direccion` | Contexto de destino | Notaria destino | `notarial_context` | Manual opcional | `optional_context` |
| `documento.abogado_redactor.nombre` | Responsable juridico | Revision legal | `legal_review_decisions` | Manual/aprobacion abogado | `legal_reviewed` |
| `documento.abogado_redactor.rut` | Responsable juridico | Revision legal | `legal_review_decisions` | Manual/aprobacion abogado | `legal_reviewed` |
| `documento.abogado_redactor.email` | Contacto/revision | Revision legal | `legal_review_decisions` | Manual | `legal_reviewed` |
| `revision_juridica.estado` | Estado del caso | Workflow legal | `escritura_cases` | Sistema | `legal_reviewed` |
| `revision_juridica.aprobada_por` | Auditoria aprobacion | Abogado/operador autorizado | `legal_review_decisions` | Sistema/manual | `legal_reviewed` |
| `revision_juridica.aprobada_at` | Auditoria aprobacion | Workflow | `legal_review_decisions` | Sistema | `legal_reviewed` |

## Partes y personeria

| Variable | Uso en minuta | Fuente primaria | Modelo recomendado | Obtencion | Gate |
| --- | --- | --- | --- | --- | --- |
| `vendedor.tipo` | Comparecencia/personeria | Dominio vigente/ficha juridica | `party_legal_profiles` | Extraccion + manual | `party_verified` |
| `vendedor.nombre` | Comparecencia y clausulas | Dominio vigente/personeria | `party_legal_profiles` | Extraccion dominio + ficha | `party_verified` |
| `vendedor.rut` | Comparecencia | Dominio/personeria/RUT | `party_legal_profiles` | Extraccion + normalizacion | `party_verified` |
| `vendedor.domicilio` | Comparecencia | Ficha juridica/instruccion | `party_legal_profiles` | Manual/extraccion | `party_verified` |
| `vendedor.profesion_giro` | Comparecencia | Ficha juridica | `party_legal_profiles` | Manual | `revision` |
| `vendedor.representantes[]` | Comparecencia si hay sociedad | Poder/personeria | `party_legal_profiles` | Extraccion poderes | `personeria_verified` |
| `comprador.nombre` | Comparecencia | Venta/lote vendido | `lot_records` | Sistema + revision | `party_verified` |
| `comprador.rut` | Comparecencia | Venta/ficha comprador | `lot_records` | Sistema + normalizacion RUT | `party_verified` |
| `comprador.domicilio` | Comparecencia | Ficha comprador | `lot_records` | Manual/sistema | `revision` |
| `comprador.estado_civil` | Comparecencia | Declaracion comprador | `lot_records` | Manual/sistema | `revision` |
| `comprador.profesion_giro` | Comparecencia | Declaracion comprador | `lot_records` | Manual/sistema | `revision` |
| `personeria.aplica` | Clausula/personeria | Tipo de parte | Resolver | Sistema | `party_verified` |
| `personeria.constitucion_texto` | Personeria sociedad | Escritura social | `party_legal_profiles` | OCR/extraccion | `personeria_verified` |
| `personeria.poder_texto` | Facultades representante | Poder/personeria | `party_legal_profiles` | OCR/extraccion | `personeria_verified` |
| `personeria.estado_revision` | Aprobacion de facultades | Revision legal | `legal_review_decisions` | Abogado | `legal_reviewed` |

## Predio matriz, dominio, SAG, plano y roles SII

| Variable | Uso en minuta | Fuente primaria | Modelo recomendado | Obtencion | Gate |
| --- | --- | --- | --- | --- | --- |
| `matriz.nombre_predio` | Clausula PRIMERO | Dominio vigente | `project_legal_data` | OCR/extraccion dominio | `title_verified` |
| `matriz.ubicacion` | Clausula PRIMERO | Dominio vigente/proyecto | `project_legal_data` | OCR + proyecto | `title_verified` |
| `matriz.comuna` | Clausulas dominio/SII | Dominio/proyecto | `project_legal_data`/`projects` | OCR + proyecto | `title_verified` |
| `matriz.provincia` | Individualizacion | Dominio vigente | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.region` | Individualizacion | Dominio/proyecto | `project_legal_data`/`projects` | OCR + proyecto | `title_verified` |
| `matriz.superficie_total` | Dominio matriz | Dominio/plano | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.deslindes.*` | Dominio matriz | Dominio vigente | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.adquisicion_modo` | Historial titulo | Dominio vigente | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.adquisicion_notaria` | Historial titulo | Dominio vigente/titulo anterior | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.adquisicion_fecha` | Historial titulo | Dominio vigente/titulo anterior | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.adquisicion_repertorio` | Historial titulo | Dominio vigente/titulo anterior | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.inscripcion_fojas` | Inscripcion dominio | Dominio vigente/CBR | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.inscripcion_numero` | Inscripcion dominio | Dominio vigente/CBR | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.inscripcion_anio` | Inscripcion dominio | Dominio vigente/CBR | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.inscripcion_cbr` | Conservador | Dominio vigente/CBR | `project_legal_data` | OCR/extraccion | `title_verified` |
| `matriz.rol_avaluo` | Rol matriz | Dominio/SII | `project_legal_data` | OCR/extraccion roles | `sii_verified` |
| `sag.certificado_numero` | Clausula SEGUNDO | Certificado SAG | `project_legal_data` + `legal_documents` | OCR/extraccion | `sag_verified` |
| `sag.certificado_fecha` | Clausula SEGUNDO | Certificado SAG | `project_legal_data` + `legal_documents` | OCR/extraccion | `sag_verified` |
| `sag.oficina_sectorial` | Clausula SEGUNDO | Certificado SAG | `legal_documents` | OCR/extraccion | `sag_verified` |
| `sag.plano_cbr_numero` | Plano archivado | Plano/CBR | `project_legal_data` | OCR/extraccion | `sag_verified` |
| `sag.plano_cbr_anio` | Plano archivado | Plano/CBR | `project_legal_data` | OCR/extraccion | `sag_verified` |
| `sag.plano_cbr_registro` | Plano archivado | Plano/CBR | `project_legal_data` | OCR/extraccion | `sag_verified` |
| `sii.certificado_asignacion_roles_numero` | Evidencia roles | Certificado SII | `legal_documents` | OCR/extraccion | `sii_verified` |
| `sii.certificado_fecha_emision` | Evidencia roles | Certificado SII | `legal_documents` | OCR/extraccion | `sii_verified` |
| `sii.solicitud_numero` | F2118/SII | Certificado SII/F2118 | `legal_documents` | OCR/extraccion | `sii_verified` |
| `sii.rol_matriz` | Rol matriz | Certificado SII/dominio | `project_legal_data` | OCR/extraccion | `sii_verified` |
| `sii.pre_rol_lote` | Rol/pre-rol lote | Certificado SII | `lot_legal_data` | OCR/extraccion + match lote | `sii_verified` |
| `sii.rol_avaluo_en_tramite_texto` | Texto renderizado | Resolver + certificado SII | `lot_legal_data` | Generado desde pre-rol/comuna | `sii_verified` |
| `sii.rol_avaluo_definitivo` | Post inscripcion | SII actualizado | `lot_legal_data` | Post escritura | `post_inscription` |
| `sii.unidad_nombre` | Unidad/lote SII | Certificado SII | `lot_legal_data` | OCR/extraccion + match lote | `sii_verified` |

## Lote, deslindes y servidumbre

| Variable | Uso en minuta | Fuente primaria | Modelo recomendado | Obtencion | Gate |
| --- | --- | --- | --- | --- | --- |
| `lote.numero` | Individualizacion | Proyecto/lote | `lots` | Sistema | `geometry_verified` |
| `lote.numero_nombre` | Texto legal | Resolver | `lots` + resolver | Derivado | `data_verified` |
| `lote.superficie_m2` | Individualizacion | Geometria/plano/SAG | `lots` | Sistema/verificacion | `geometry_verified` |
| `lote.superficie_texto` | Texto legal | Resolver | `lots` + resolver | Derivado | `data_verified` |
| `lote.superficie_ha_texto` | Texto legal si aplica | Resolver | `lots` + resolver | Derivado | `data_verified` |
| `lote.boundaries_official` | Deslindes | Geometria verificada | `lots` | Sistema | `geometry_verified` |
| `lote.deslindes` | Clausula SEGUNDO | [[Texto de Deslinde]] | `lots` + generador | Generado | `geometry_verified` |
| `lote.rol_tramite` | Rol de avaluo en tramite | `sii.pre_rol_lote` | `lot_legal_data` | Derivado/legado | `sii_verified` |
| `servidumbre.aplica` | Clausula SEXTO | Geometria/lote | `lots` | Sistema | `geometry_verified` |
| `servidumbre.superficie_m2` | Clausula SEXTO | Geometria/lote | `lots` | Sistema | `geometry_verified` |
| `servidumbre.superficie_texto` | Texto legal | Resolver | `lots` + resolver | Derivado | `data_verified` |
| `servidumbre.deslindes_tramo` | Clausula SEXTO | Generador servidumbre | `geometry/analysis` | Generado | `geometry_verified` |
| `servidumbre.predio_sirviente` | Clausula SEXTO | Lote vendido/escritura | `lot_legal_data` | Derivado + revision | `legal_verified` |
| `servidumbre.predios_dominantes` | Clausula SEXTO | Plano/escritura base | `project_legal_data`/`lot_legal_data` | Extraccion/manual | `legal_verified` |

## Precio, clausulas y cierre

| Variable | Uso en minuta | Fuente primaria | Modelo recomendado | Obtencion | Gate |
| --- | --- | --- | --- | --- | --- |
| `transaccion.precio_numeros` | Clausula CUARTO | Venta/ficha comercial | `lot_records` | Sistema | `price_verified` |
| `transaccion.precio_letras` | Clausula CUARTO | Resolver | `lot_records` + resolver | Derivado | `price_verified` |
| `transaccion.moneda` | Clausula CUARTO | Instruccion comercial | `payment_instructions` | Manual/sistema | `price_verified` |
| `transaccion.forma_pago` | Clausula CUARTO | Instrucciones pago | `payment_instructions` | Manual/sistema | `price_verified` |
| `transaccion.detalle_pago[]` | Clausula CUARTO | Vales vista/recibos/custodia | `payment_instructions` | Manual/extraccion | `price_verified` |
| `transaccion.saldo_pendiente` | Clausula CUARTO | Ficha venta | `payment_instructions` | Sistema | `price_verified` |
| `clausulas.cuerpo_cierto` | Clausula QUINTO | Template aprobado | `legal_rule_pack` | Template | `legal_reviewed` |
| `clausulas.saneamiento_eviccion` | Clausula QUINTO | Template aprobado | `legal_rule_pack` | Template + revision | `legal_reviewed` |
| `clausulas.exencion_eviccion_aprobada` | Riesgo legal | Instruccion abogado | `legal_review_decisions` | Revision legal | `legal_reviewed` |
| `clausulas.entrega_material` | Clausula SEPTIMO | Template/instruccion | `legal_rule_pack` | Template/manual | `revision` |
| `clausulas.gastos_cargo` | Clausula OCTAVO | Template/instruccion | `legal_rule_pack` | Template/manual | `revision` |
| `clausulas.domicilio_contractual` | Clausula NOVENO | Template/instruccion | `legal_rule_pack` | Template/manual | `revision` |
| `clausulas.tribunales_competentes` | Clausula NOVENO | Template/instruccion | `legal_rule_pack` | Template/manual | `revision` |
| `clausulas.promesa_finiquito` | Clausula DECIMO | Promesa/cierre negocio | `legal_rule_pack`/`lot_records` | Template + revision | `legal_reviewed` |
| `clausulas.factibilidad_servicios` | Clausula DECIMO PRIMERO | Instrucciones proyecto | `legal_rule_pack`/`project_legal_data` | Template + revision | `legal_reviewed` |
| `clausulas.lguc_destino_suelo` | Clausula DECIMO QUINTO | Template/legal rule | `legal_rule_pack` | Template + revision | `legal_reviewed` |
| `clausulas.rnda_declaracion` | Clausula DECIMO CUARTO | Consulta RNDA vigente | `legal_documents`/`legal_review_decisions` | Documento/manual | `rnda_verified` |
| `mandato.rectificacion_nombre` | Clausula DECIMO TERCERO | Instruccion/persona mandataria | `party_legal_profiles` | Manual/revision | `revision` |
| `mandato.rectificacion_rut` | Clausula DECIMO TERCERO | Instruccion/persona mandataria | `party_legal_profiles` | Manual/revision | `revision` |
| `mandato.facultades` | Clausula DECIMO TERCERO | Template aprobado | `legal_rule_pack` | Template + revision | `legal_reviewed` |
| `evidencia.documentos_fuente[]` | Expediente | Documentos cargados | `document_evidence` | Sistema | `system_gate` |
| `evidencia.estado` | Readiness | Evidencia consolidada | `document_evidence` | Sistema | `system_gate` |

## Estados de obtencion

| Estado | Significado |
| --- | --- |
| `Sistema` | Ya existe en datos operacionales de Plotify. |
| `OCR/extraccion` | Se obtiene desde PDF/DOCX/imagen cargada y debe quedar con evidencia. |
| `Derivado` | Se calcula desde un valor fuente, por ejemplo numeros a palabras. |
| `Manual` | Debe ingresarlo usuario, abogado u operador. |
| `Revision legal` | No basta con extraerlo; debe ser aprobado por abogado/revisor. |
| `Post minuta` | No corresponde a Plotify al generar la minuta inicial. |

## Notas

- Esta tabla es mas operativa que [[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]:
  sirve para disenar la UI lateral de variables.
- El template final debe seguir [[Generador de Escrituras de Compraventa]].
- Para roles/preroles ver [[Rol de Avaluo en Tramite - Fuentes SII]].

