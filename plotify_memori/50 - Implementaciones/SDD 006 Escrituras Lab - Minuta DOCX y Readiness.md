---
title: SDD 006 Escrituras Lab - Minuta DOCX y Readiness
aliases:
  - Escrituras Lab Readiness
  - Minuta DOCX Escrituras Lab
date: 2026-06-03
status: respaldado
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - legal
source_repo_file: labs/labs_escrituras/docs/matriz-escritura-compraventa-readiness.md
related:
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
  - "[[Rol de Avaluo en Tramite - Fuentes SII]]"
  - "[[Generacion de Documentos]]"
  - "[[Texto de Deslinde]]"
  - "[[Variables Escritura Compraventa - Fuentes de Obtencion]]"
---

> [!info] Respaldo de laboratorio
> Copia respaldada en Obsidian del documento creado en el repositorio:
> `labs/labs_escrituras/docs/matriz-escritura-compraventa-readiness.md`.
> Esta nota preserva el analisis completo de template, variables, fuentes,
> roles SII, readiness gates, interfaz y proximo paso SDD.

# Minuta DOCX de escritura de compraventa: template, variables y readiness

Estado: documento de planificacion, 2026-06-03.

Alcance: preparar la futura implementacion productiva del generador de minutas
DOCX de compraventa de lotes/parcelas rurales en Plotify. El documento que
Plotify debe entregar se parece a una minuta Word, no al PDF final certificado
por notaria/CBR. Este documento no aprueba juridicamente un template ni habilita
emision productiva.

## Fuentes revisadas

- SDD activo: `specs/006-escrituras-lab/spec.md`, `plan.md`, `tasks.md`.
- Archivos de referencia revisados en esta iteracion:
  - `/Users/matiasburgos/Downloads/COMPRAVENTA LOTE 29.docx`
  - `/Users/matiasburgos/Downloads/escritura.pdf`
- Documentos del laboratorio:
  - `labs/labs_escrituras/docs/escrituras-data-architecture-study.md`
  - `labs/labs_escrituras/docs/variables-catalog.md`
  - `labs/labs_escrituras/docs/source-map.md`
  - `labs/labs_escrituras/docs/template-draft.md`
  - `labs/labs_escrituras/docs/gestor-escrituras-logic.md`
- MCP `plotify-escrituras`: 69 documentos listados al 2026-06-03, con
  escrituras, dominio vigente, planos, certificados SAG y roles SII. El estudio
  del lab registra 901 chunks embebidos.
- CodeGraph del codigo real:
  - `apps/web/src/lib/legal/deslinde-generator.ts`
  - `apps/web/src/lib/legal/servidumbre-generator.ts`
  - `apps/web/src/lib/legal/readiness.ts`
  - `apps/api/services/document_engine.py`
  - `apps/api/services/document_generator.py`
  - `apps/web/src/components/dashboard/documents/generation-wizard.tsx`
  - `apps/web/src/components/projects/detail/legal-tab.tsx`
- Memoria curada:
  - `plotify_memori/10 - Decisiones/ADR-004 - Variables Documentales Canonicas Anidadas.md`
  - `plotify_memori/20 - Producto & Proyectos/Generacion de Documentos.md`
  - `plotify_memori/20 - Producto & Proyectos/Texto de Deslinde.md`
- Fuentes legales oficiales consultadas para reglas de referencia:
  - Codigo Organico de Tribunales, arts. 403 a 413 y 430:
    https://www.bcn.cl/leychile/navegar?idNorma=29603
  - Ley 21.389, Registro Nacional de Deudores de Pensiones de Alimentos,
    art. 31: https://www.bcn.cl/leychile/Navegar?idNorma=1168463
  - Codigo Civil, compraventa, art. 1801 y relacionados:
    https://www.bcn.cl/leychile/navegar?idNorma=172986&idParte=8719795
  - SII, documentos requeridos para solicitudes de bienes raices:
    https://www.sii.cl/servicios_online/1048-doctos_requeridos-2573.html
  - SII, asignacion de numero de rol de avaluo:
    https://www.sii.cl/como_se_hace_para/peticiones_administrativas/asignacion_numero_rol_avaluo.pdf
  - SII, Resolucion Exenta 4553 de 1996, certificado de asignacion de roles de
    avaluo en tramite:
    https://www.sii.cl/documentos/resoluciones/1996/reso4553.htm
  - SII, FAQ actualizada 2026 sobre division de inmueble:
    https://www.sii.cl/preguntas_frecuentes/aval_contrib_bbrr/001_165_2743.htm
  - SII, FAQ actualizada 2026 sobre asignacion de rol:
    https://www.sii.cl/preguntas_frecuentes/aval_contrib_bbrr/001_165_2108.htm
  - SII, Formulario 2890 para notarios y conservadores:
    https://www.sii.cl/preguntas_frecuentes/aval_contrib_bbrr/001_165_8878.htm

## Conclusion ejecutiva

El template del laboratorio es una buena base estructural, pero el entregable de
Plotify debe ser una **minuta DOCX** como `COMPRAVENTA LOTE 29.docx`, no una
replica del PDF final certificado. La notaria y/o el CBR agregan capas que no
corresponden al documento inicial de Plotify: verificacion electronica, sellos,
CVE, caratulas finales, repertorio efectivo, autorizacion final y otras marcas
propias del instrumento ya otorgado o certificado.

Por tanto, el generador debe producir un borrador/minuta con:

- Titulo de compraventa.
- Comparecientes.
- Antecedentes de dominio extraidos desde dominio vigente.
- Subdivision SAG/plano.
- Individualizacion de lote y rol.
- Venta, precio, servidumbre, entrega, gastos, clausulas especiales, mandato,
  RNDA, destino rural/LGUC, portador de copia y firmas.

Y debe excluir del output automatizado base:

- CVE/verificacion electronica.
- Timbres, sellos y textos de copia fiel.
- Numeros reales de repertorio cuando aun no han sido asignados.
- Certificaciones finales de notario/CBR que nacen despues del otorgamiento.
- Anexos pegados como certificados completos, salvo que se genere un paquete
  separado de evidencia.

Pero no debe entrar a produccion como un simple template Jinja. La escritura debe
funcionar como expediente con evidencia, variables resueltas y gates:

- El LLM/lab sirve para descubrir estructura y proponer extracciones, no como
  fuente de verdad.
- La geometria existente de Plotify debe seguir siendo la fuente duena de
  superficie, deslindes y servidumbre.
- Las variables juridicas principales deben cargarse desde documentos fuente:
  dominio vigente, certificado de roles SII, certificado SAG, plano y personeria.
- Los roles SII existen en el corpus, pero no estan correctamente conectados al
  modelo productivo ni al resolver actual.
- La variable `documento.abogado_redactor.*` debe existir en el flujo de trabajo
  de revision juridica; no necesariamente debe renderizarse como una clausula
  visible dentro de la minuta base si el formato objetivo no lo pide.
- Falta un estado juridico claro: minuta preliminar, variables en revision,
  minuta aprobada por abogado/redactor, lista para enviar a vendedor, abogado o
  notaria.
- El usuario debe ver que la minuta automatica requiere revision y aprobacion de
  abogado antes de presentarse a notaria o usarse como instrumento final.

Decision recomendada: crear una feature SDD nueva para el gestor productivo de
escrituras. El laboratorio actual queda como insumo de conocimiento, no como
runtime productivo.

## Template base recomendado

Usar como forma objetivo `COMPRAVENTA LOTE 29.docx` y usar
`labs/labs_escrituras/docs/template-draft.md` solo como catalogo de estructura y
clausulas. El template productivo debe parecerse al DOCX: texto continuo de
minuta, sin decoracion notarial/certificada y sin anexos embebidos.

La primera version productiva debe generar `docx` como formato principal. El PDF
puede ser preview o copia interna, pero el valor operacional del flujo es la
minuta Word editable.

Antes de producir un template real:

1. Extraer el texto base desde `COMPRAVENTA LOTE 29.docx` como plantilla de
   estilo/redaccion.
2. Separar placeholders de minuta (`lote`, `comprador`, `dominio`, `sag`,
   `roles`, `precio`) de datos notariales finales que no se generan.
3. Separar el numero SII (`sii.pre_rol_lote` o rol de avaluo en tramite) del
   texto renderizado en minuta (`lote.rol_tramite`).
4. Cambiar placeholders criticos para que no se rendericen vacios; deben quedar
   en corchetes o bloquear la minuta segun gate.
5. Marcar clausulas de riesgo como condicionales con aprobacion:
   `clausulas.exencion_eviccion_*`, renuncias amplias, RNDA, mandato amplio,
   promesa/finiquito y permisos/factibilidad.
6. Mantener `documento.abogado_redactor.*` como variable de workflow/revision,
   no como clausula visible obligatoria de la minuta.
7. Convertir la minuta en bloques versionados, pero no permitir marcarla como
   aprobada si falta evidencia critica.

### Estructura de clausulas

| Orden | Bloque | Estado recomendado |
| --- | --- | --- |
| 1 | Caratula / tipo / partes / lote | Obligatorio |
| 2 | Comparecencia | Obligatorio |
| 3 | Antecedentes de dominio del predio matriz | Obligatorio |
| 4 | Subdivision SAG y plano CBR | Obligatorio |
| 5 | Individualizacion del lote y rol | Obligatorio |
| 6 | Compraventa, cesion y transferencia | Obligatorio |
| 7 | Precio y liquidacion | Obligatorio |
| 8 | Cuerpo cierto/ad-corpus y cabida | Obligatorio |
| 9 | Saneamiento, eviccion y vicios redhibitorios | Obligatorio |
| 10 | Gravamenes, prohibiciones y litigios | Obligatorio |
| 11 | Servidumbre de transito | Condicional, bloqueante si aplica |
| 12 | Entrega material | Obligatorio |
| 13 | Gastos, derechos e impuestos | Obligatorio |
| 14 | Domicilio y competencia | Obligatorio |
| 15 | Promesa/finiquito/acuerdos previos | Condicional, revision legal |
| 16 | Factibilidad de agua/electricidad, construccion y CONAF | Condicional por proyecto |
| 17 | IVA/exencion/no afecto | Condicional, revision legal |
| 18 | Mandato para rectificar/aclarar/complementar | Condicional, revision legal |
| 19 | RNDA Ley 21.389 | Obligatorio antes de envio a notaria |
| 20 | Destino rural/LGUC | Obligatorio para predio rural |
| 21 | Personeria | Condicional, si hay representante |
| 22 | Portador de copia, lectura, firmas y cierre | Obligatorio |

### Comparacion con `COMPRAVENTA LOTE 29.docx`

El DOCX de referencia si contiene la estructura sustantiva propuesta, pero no
la trae separada en 22 capitulos. La minuta real concentra varias materias en
16 clausulas numeradas mas caratula, comparecencia y firmas. La tabla propuesta
separa esos contenidos para que Plotify pueda resolver variables, evidencia,
gates y clausulas condicionales sin depender de texto monolitico.

| Bloque propuesto | Existe en DOCX | Ubicacion en DOCX | Nota para template productivo |
| --- | --- | --- | --- |
| Caratula / tipo / partes / lote | Si | Titulo inicial | Mantener como bloque de portada simple: tipo, vendedor, comprador y lote. |
| Comparecencia | Si | Parrafo `Comparecen` | Incluye identidad, nacionalidad, estado civil, oficio/profesion, RUT y domicilio; hay un espacio en blanco para ocupacion de compradora. |
| Antecedentes de dominio del predio matriz | Si | `PRIMERO` | Muy completo: predio matriz, superficie, deslindes matriz, adquisiciones, inscripciones y rol matriz. |
| Subdivision SAG y plano CBR | Si | `SEGUNDO` | Incluye solicitud/plano SAG, certificado, fecha y archivo de plano en CBR. |
| Individualizacion del lote y rol | Si | `SEGUNDO` | Incluye lote 29, superficie, servidumbre afecta, deslindes especiales y `Rol de avaluo en tramite`. |
| Compraventa, cesion y transferencia | Si | `TERCERO` | Clausula limpia de venta, cesion, transferencia, compra, aceptacion y adquisicion. |
| Precio y liquidacion | Si | `CUARTO` | Incluye precio total, pagos, cuotas y declaracion de pago recibido. |
| Cuerpo cierto/ad-corpus y cabida | Si | `QUINTO` | Se vende como cuerpo cierto, con estado conocido y aceptado. |
| Saneamiento, eviccion y vicios redhibitorios | Si parcial | `CUARTO` y `QUINTO` | `CUARTO` renuncia acciones resolutoria/redhibitoria; `QUINTO` mantiene saneamiento de eviccion conforme a ley. Debe ir a revision legal. |
| Gravamenes, prohibiciones y litigios | Si, no separado | `QUINTO` | Declaracion de libre de gravamenes, hipotecas, prohibiciones, embargos, litigios, arrendamientos y contribuciones al dia. |
| Servidumbre de transito | Si | `SEXTO` | Muy detallada: constitucion, predio sirviente, predios dominantes, superficie, plano, deslindes y aceptacion. |
| Entrega material | Si | `SEPTIMO` | Clausula breve: entrega material con la misma fecha. |
| Gastos, derechos e impuestos | Si | `OCTAVO` | Gastos de otorgamiento e inscripcion a cargo de compradora. |
| Domicilio y competencia | Si | `NOVENO` | Domicilio en Santiago y tribunales competentes. |
| Promesa/finiquito/acuerdos previos | Si | `DECIMO` | Finiquito reciproco de cierre de negocio, promesa, oferta o acuerdo previo. |
| Factibilidad agua/electricidad, construccion y CONAF | Si | `DECIMO PRIMERO` | Se divide en tres literales: servicios, permisos de construccion y corta/tala de arboles. |
| IVA/exencion/no afecto | Si | `DECIMO SEGUNDO` | Declaracion no afecta/exenta por predio rural sin construccion; referencia DL 825 y Resolucion 16. |
| Mandato para rectificar/aclarar/complementar | Si | `DECIMO TERCERO` | Mandato amplio a tercero para rectificar, aclarar, complementar y requerir actuaciones CBR. Debe ir a revision legal. |
| RNDA Ley 21.389 | Si | `DECIMO CUARTO` | Declaracion de vendedor y comprador sin publicacion vigente en RNDA. |
| Destino rural/LGUC | Si | `DECIMO QUINTO` | Prohibicion de cambiar destino de uso de suelo, arts. 55 y 56 LGUC. |
| Personeria | No aplica en este DOCX | No hay clausula | No aparece porque vendedor y compradora comparecen personalmente. Debe ser condicional si hay sociedad o representante. |
| Portador de copia, lectura, firmas y cierre | Si | `DECIMO SEXTO` y firmas | Incluye portador de copia, CBR, lectura, firmas, notario, repertorio en blanco, copia y fe. |

Conclusiones de la comparacion:

- La estructura propuesta no agrega una escritura distinta; descompone el DOCX
  en bloques controlables.
- Lo unico propuesto que no existe como clausula en este DOCX es `Personeria`,
  porque no aplica al caso concreto.
- `Abogado redactor/revisor` no existe como clausula visible en el DOCX y debe
  quedar como variable/gate de workflow, no como texto obligatorio del template.
- `Gravamenes/prohibiciones/litigios` existe dentro de `QUINTO`; conviene
  mantenerlo como bloque logico separado en Plotify para exigir evidencia.
- `Saneamiento/eviccion/vicios redhibitorios` necesita revision juridica porque
  el DOCX inscrito concentra la renuncia a acciones en `CUARTO` y el saneamiento
  legal en `QUINTO`; esa estructura debe mantenerse como base, no reordenarse
  por criterio del generador.
- El cierre del DOCX trae campos notariales en blanco; Plotify debe preservar
  esos espacios de minuta cuando correspondan, pero no inventar repertorio,
  notario, sellos, CVE ni certificaciones finales.

### Criterio corregido: rol de avaluo en tramite

En una primera transferencia de un lote nacido de una subdivision, la expresion
`Rol de avaluo en tramite` no debe tratarse como ausencia de rol ni como error
de la minuta. Es la forma correcta de individualizar tributariamente una unidad
vendible nueva cuando el rol definitivo/catastro aun esta en proceso.

Fuentes SII:

- El SII indica que la asignacion de rol procede cuando la propiedad no posee
  rol por provenir de una subdivision simple, loteo o copropiedad.
- Para predios agricolas, la subdivision requiere certificacion SAG.
- El tramite de division puede ser solicitado por el propietario o tercero con
  mandato.
- El SII asigna preroles o roles de avaluo en tramite a las unidades vendibles.
- La Resolucion Exenta 4553/1996 crea el certificado de asignacion de roles de
  avaluo en tramite para, entre otros casos, bienes raices objeto de primera
  transferencia originados por division de roles matriz.
- El Formulario 2890 es la declaracion usada por notarios y conservadores para
  informar al SII las enajenaciones e inscripciones, con el objetivo de mantener
  actualizado el catastro legal de bienes raices.

Regla para Plotify:

- Si existe certificado SII de asignacion de roles/preroles, la minuta debe usar
  la formula del DOCX: `Rol de avaluo en tramite numero [rol] de la comuna de
  [comuna]`.
- `rol_en_tramite` es un estado juridico/documental valido para el lote, no un
  placeholder por falta de dato.
- La fuente duena del numero es SII/certificado de asignacion de roles; el CBR
  informa la inscripcion/enajenacion al SII por el flujo F2890, pero Plotify no
  debe presentar al Conservador como quien "crea" el rol.
- Despues de la inscripcion y actualizacion catastral, el sistema puede pasar el
  lote a `rol_avaluo_definitivo` o mantener trazabilidad entre `pre_rol` y rol
  definitivo segun certificado/actualizacion SII.
- La UI debe mostrar este estado como `Rol de avaluo en tramite`, no como
  advertencia roja, siempre que exista evidencia SII o instruccion legal aprobada.

### Variable de abogado redactor/revisor

No incorporar por defecto una clausula visible de abogado redactor dentro de la
minuta base, porque el DOCX de referencia no la trae como clausula autonoma.
Mantener estas variables en el flujo de revision y en el expediente de salida:

- `documento.abogado_redactor.nombre`
- `documento.abogado_redactor.rut`
- `documento.abogado_redactor.email`
- `revision_juridica.aprobada_at`
- `revision_juridica.estado`

Nota: la redaccion exacta debe ser aprobada por abogado y, si aplica, notaria. El Codigo
Organico de Tribunales exige constancia del nombre del abogado redactor de la
minuta en ciertos actos indicados en el art. 413, y el repertorio debe registrar
el nombre del abogado o abogados si hubieren redactado la escritura (art. 430).
Aunque la omision no necesariamente afecta validez segun esa norma, Plotify debe
tratarlo como gate operacional para evitar minutas sin responsable juridico.

## Extraccion de variables desde documentos cargados

El flujo correcto no es que el usuario escriba todas las variables manualmente.
El flujo correcto es:

1. El usuario carga uno o dos dominios vigentes del proyecto.
2. El sistema usa el mismo pipeline del laboratorio: conversion/OCR, paginas,
   chunks y extraccion asistida.
3. El extractor identifica variables de dominio matriz, historial de titulo,
   CBR, deslindes matriz, rol matriz, gravamenes/prohibiciones si el documento
   los contiene.
4. El usuario carga certificado de roles SII.
5. El extractor identifica rol matriz, solicitud F2118, unidades/lotes y
   preroles o roles de avaluo en tramite.
6. El sistema distribuye esos preroles hacia todos los lotes del proyecto en
   `lot_legal_data`.
7. La interfaz muestra una tabla lateral de variables con valor, fuente,
   confianza y evidencia; el usuario puede corregir cada valor antes de aprobar.
8. La minuta usa las variables aprobadas/editadas, no el texto bruto del OCR.

### Fuentes primarias por documento

| Documento cargado | Variables que debe poblar | Modelo recomendado |
| --- | --- | --- |
| Dominio vigente matriz | `matriz.nombre_predio`, `matriz.ubicacion`, `matriz.superficie_total`, `matriz.deslindes.*`, `matriz.adquisicion_*`, `matriz.inscripcion_*`, `matriz.rol_avaluo` | `project_legal_data` + `document_evidence` |
| Certificado GP/interdicciones/litigios | `evidencia.gravamenes_estado`, `evidencia.prohibiciones_estado`, `evidencia.litigios_estado`, excepciones | `legal_documents` + `document_evidence` |
| Certificado SAG | `sag.certificado_numero`, `sag.certificado_fecha`, `sag.oficina_sectorial`, `sag.region`, advertencias DL 3.516/LGUC | `project_legal_data` + `legal_documents` |
| Plano archivado | `sag.plano_cbr_numero`, `sag.plano_cbr_anio`, `lote.superficie_m2`, `lote.deslindes` como evidencia de corroboracion | `project_legal_data` + `lots` + `document_evidence` |
| Certificado roles SII | `sii.certificado_asignacion_roles_numero`, `sii.certificado_fecha_emision`, `sii.solicitud_numero`, `sii.rol_matriz`, `sii.pre_rol_lote`, `sii.rol_avaluo_en_tramite_texto`, `sii.unidad_nombre` | `legal_documents` + `lot_legal_data` |
| Personeria/poderes | `vendedor.representantes[]`, `personeria.*` | `party_legal_profiles` |
| Instrucciones comerciales | `transaccion.*` | `lot_records` + `payment_instructions` |

### Tabla lateral de edicion

La UI del caso de escritura debe tener una vista tipo:

| Variable | Valor extraido | Fuente | Evidencia | Estado | Accion |
| --- | --- | --- | --- | --- | --- |
| `matriz.inscripcion_fojas` | `4699` | Dominio vigente | Pagina/chunk | `resolved` | Editar/Aprobar |
| `sii.pre_rol_lote` | `08179-00029` | Certificado roles SII | Pagina/chunk | `resolved` | Editar/Aprobar |
| `comprador.estado_civil` | `divorciada` | ficha comprador/manual | lote vendido | `manual_review` | Editar |

Cada correccion manual debe guardar:

- valor anterior.
- valor nuevo.
- usuario.
- motivo opcional.
- fecha.
- variable afectada.
- evidencia reemplazada o comentario de correccion.

## Tabla de variables y fuentes

Leyenda de estado:

- Existente: el codigo actual ya tiene una fuente razonable.
- Parcial: existe algun campo, pero falta normalizacion, evidencia o gate.
- Futura: requiere modelo/campo nuevo.
- Bloqueante: no se debe generar minuta aprobada sin resolver.
- Revision: requiere abogado u operador autorizado; notaria solo si el dato
  corresponde al destino final.

### Documento, revision legal y datos finales

| Variable canonica | Fuente actual | Fuente duena recomendada | Respaldo | Gate | Estado |
| --- | --- | --- | --- | --- | --- |
| `documento.tipo` | template | `document_templates` | template aprobado | template_version | Parcial |
| `documento.ciudad_otorgamiento` | manual | `escritura_cases`/`notarial_context` | instruccion de otorgamiento | optional_context | Futura, no bloquea minuta |
| `documento.fecha_otorgamiento` | manual | `generated_documents`/notaria | fecha real de firma | post_minuta | Futura, no renderizar si falta |
| `documento.repertorio_numero` | no existe | notaria | repertorio asignado | post_minuta | Excluir de minuta base |
| `documento.notario.nombre` | manual/template | `notarial_context` | notaria destino | optional_context | Futura, no bloquea minuta |
| `documento.notaria.direccion` | manual/template | `notarial_context` | notaria destino | optional_context | Futura, no bloquea minuta |
| `documento.abogado_redactor.nombre` | no existe | `legal_review`/`party_legal_profiles` | abogado aprobador | legal_reviewed | Futura, bloqueante para aprobacion |
| `documento.abogado_redactor.rut` | no existe | `legal_review`/`party_legal_profiles` | abogado aprobador | legal_reviewed | Futura, bloqueante para aprobacion |
| `documento.abogado_redactor.email` | no existe | `legal_review` | abogado aprobador | legal_reviewed | Futura |
| `revision_juridica.estado` | `project_legal_data.review_status` a nivel proyecto | `escritura_cases`/`legal_review_decisions` | aprobacion humana | legal_reviewed | Parcial |
| `revision_juridica.aprobada_por` | `project_legal_data.reviewer_id` parcial | `legal_review_decisions` | usuario/abogado | legal_reviewed | Parcial |
| `revision_juridica.aprobada_at` | `project_legal_data.reviewed_at` parcial | `legal_review_decisions` | timestamp | legal_reviewed | Parcial |

### Vendedor, comprador y personeria

| Variable canonica | Fuente actual | Fuente duena recomendada | Respaldo | Gate | Estado |
| --- | --- | --- | --- | --- | --- |
| `vendedor.tipo` | formulario wizard | `party_legal_profiles` | ficha juridica | party_verified | Parcial |
| `vendedor.nombre` | formulario/manual, org parcial | `party_legal_profiles` + dominio | dominio/personeria | party_verified | Parcial |
| `vendedor.rut` | `organization_payment_info.rut` parcial | `party_legal_profiles` | dominio/personeria | party_verified | Parcial |
| `vendedor.domicilio` | formulario/manual | `party_legal_profiles` | ficha juridica | party_verified | Futura |
| `vendedor.profesion_giro` | formulario/manual | `party_legal_profiles` | ficha juridica | revision | Futura |
| `vendedor.representantes[]` | `project_legal_data.personeria_repre_*` parcial | `party_legal_profiles` | poderes/personeria | party_verified | Parcial |
| `comprador.nombre` | `lot_records.cliente_nombre` | `lot_records` + ficha cliente | cedula/declaracion | party_verified | Existente parcial |
| `comprador.rut` | `lot_records.cliente_run` | `lot_records.cliente_run_normalizado` | cedula/RUT | party_verified | Existente parcial |
| `comprador.domicilio` | `lot_records.cliente_direccion` | `lot_records` | declaracion comprador | revision | Existente parcial |
| `comprador.estado_civil` | `lot_records.cliente_estado_civil` | `lot_records` | declaracion/certificado | revision | Existente parcial |
| `comprador.profesion_giro` | `lot_records.cliente_ocupacion` | `lot_records` | declaracion comprador | revision | Existente parcial |
| `personeria.aplica` | wizard | resolver | tipo vendedor/comparecencia | party_verified | Parcial |
| `personeria.constitucion_texto` | no estructurado | `party_legal_profiles` | escritura social | party_verified | Futura |
| `personeria.poder_texto` | no estructurado | `party_legal_profiles` | poder/delegacion | party_verified | Futura |
| `personeria.estado_revision` | `project_legal_data.review_status` parcial | `legal_review_decisions` | aprobacion abogado | legal_reviewed | Parcial |

### Predio matriz, dominio, SAG, plano y roles SII

| Variable canonica | Fuente actual | Fuente duena recomendada | Respaldo | Gate | Estado |
| --- | --- | --- | --- | --- | --- |
| `matriz.nombre_predio` | no existe | `project_legal_data` | dominio vigente | title_verified | Futura |
| `matriz.ubicacion` | proyecto parcial | `project_legal_data` | dominio vigente | title_verified | Parcial |
| `matriz.comuna` | `projects.comuna` | `project_legal_data`/`projects` | dominio/proyecto | title_verified | Parcial |
| `matriz.provincia` | no existe | `project_legal_data` | dominio vigente | title_verified | Futura |
| `matriz.region` | `projects.region` | `project_legal_data`/`projects` | dominio/proyecto | title_verified | Parcial |
| `matriz.superficie_total` | no existe | `project_legal_data` | dominio/plano | title_verified | Futura |
| `matriz.deslindes.*` | no existe | `project_legal_data` | dominio vigente | title_verified | Futura |
| `matriz.adquisicion_modo` | no existe | `project_legal_data` | titulo anterior | title_verified | Futura |
| `matriz.adquisicion_notaria` | no existe | `project_legal_data` | titulo anterior | title_verified | Futura |
| `matriz.adquisicion_fecha` | no existe | `project_legal_data` | titulo anterior | title_verified | Futura |
| `matriz.adquisicion_repertorio` | no existe | `project_legal_data` | titulo anterior | title_verified | Futura |
| `matriz.inscripcion_fojas` | `project_legal_data.dominio_cbr_fojas`/`matriz_cbr_fojas` | `project_legal_data` | dominio CBR | title_verified | Parcial |
| `matriz.inscripcion_numero` | `project_legal_data.dominio_cbr_numero`/`matriz_cbr_numero` | `project_legal_data` | dominio CBR | title_verified | Parcial |
| `matriz.inscripcion_anio` | `project_legal_data.dominio_cbr_ano`/`matriz_cbr_ano` | `project_legal_data` | dominio CBR | title_verified | Parcial |
| `matriz.inscripcion_cbr` | no existe | `project_legal_data` | dominio CBR | title_verified | Futura |
| `matriz.rol_avaluo` | `project_legal_data.roles` JSONB parcial | `project_legal_data` | SII/dominio | sii_verified | Parcial |
| `sag.certificado_numero` | `project_legal_data.sag_resolucion_numero` | `project_legal_data` + `legal_documents` | certificado SAG | sag_verified | Parcial |
| `sag.certificado_fecha` | no existe exacto; `sag_resolucion_ano` parcial | `project_legal_data` + `legal_documents` | certificado SAG | sag_verified | Futura |
| `sag.oficina_sectorial` | no existe | `legal_documents` | certificado SAG | sag_verified | Futura |
| `sag.plano_cbr_numero` | `project_legal_data.plano_archivo_numero` | `project_legal_data` | CBR/plano | sag_verified | Parcial |
| `sag.plano_cbr_anio` | no existe | `project_legal_data` | CBR/plano | sag_verified | Futura |
| `sag.plano_cbr_registro` | no existe | `project_legal_data` | CBR/plano | sag_verified | Futura |
| `sii.certificado_asignacion_roles_numero` | no mapeado | `legal_documents` | certificado roles/preroles SII | sii_verified | Futura |
| `sii.certificado_fecha_emision` | no mapeado | `legal_documents` | certificado roles/preroles SII | sii_verified | Futura |
| `sii.solicitud_numero` | no mapeado | `legal_documents` | F2118/SII | sii_verified | Futura |
| `sii.rol_matriz` | `project_legal_data.roles` JSONB parcial, no resuelto | `project_legal_data` | certificado roles/preroles SII | sii_verified | Parcial |
| `sii.pre_rol_lote` | no existe | `lot_legal_data` | certificado roles/preroles SII | sii_verified | Futura, bloqueante si falta evidencia |
| `sii.rol_avaluo_en_tramite_texto` | wizard/manual parcial | resolver documental | certificado roles/preroles SII + template | sii_verified | Futura |
| `sii.rol_avaluo_definitivo` | no existe | `lot_legal_data` | actualizacion/certificado SII posterior | post_inscription | Futura, no bloquea primera minuta |
| `sii.unidad_nombre` | no existe | `lot_legal_data` | certificado roles/preroles SII | sii_verified | Futura |

### Lote, deslindes y servidumbre

| Variable canonica | Fuente actual | Fuente duena recomendada | Respaldo | Gate | Estado |
| --- | --- | --- | --- | --- | --- |
| `lote.numero` | `lots.numero_lote` | `lots` | lote/proyecto | geometry_verified | Existente |
| `lote.numero_nombre` | derivado en wizard | resolver documental | `lots.numero_lote` | data_verified | Parcial |
| `lote.superficie_m2` | `lots.area_official_m2` o `lots.m2` | `lots` | plano/SAG/geometria | geometry_verified | Existente |
| `lote.superficie_texto` | derivado en wizard | resolver documental | superficie numerica | data_verified | Parcial |
| `lote.superficie_ha_texto` | no existe | resolver documental | superficie numerica | data_verified | Futura |
| `lote.boundaries_official` | `lots.boundaries_official` | `lots` | plano/geometria | geometry_verified | Existente |
| `lote.deslindes` | `generateDeslindeText()`/`legal_deslinde_text` | geometry/lots | plano/geometria | geometry_verified | Existente |
| `lote.rol_tramite` | wizard/manual | `lot_legal_data`/`sii.pre_rol_lote` | SII/revision abogado | sii_verified | Parcial, nombre legado |
| `servidumbre.aplica` | `lots.servidumbre_m2 > 0` | `lots` | plano/geometria | geometry_verified | Existente |
| `servidumbre.superficie_m2` | `lots.servidumbre_m2` | `lots` | plano/geometria | geometry_verified | Existente |
| `servidumbre.superficie_texto` | derivado en wizard | resolver documental | superficie numerica | data_verified | Parcial |
| `servidumbre.deslindes_tramo` | `generateServidumbreText()` | geometry/analysis | plano/geometria | geometry_verified | Existente parcial |
| `servidumbre.predio_sirviente` | derivado lote | `lot_legal_data` | escritura/plano | legal_verified | Parcial |
| `servidumbre.predios_dominantes` | no existe | `project_legal_data`/`lot_legal_data` | plano/escritura base | legal_verified | Futura |

### Precio, clausulas y cierre

| Variable canonica | Fuente actual | Fuente duena recomendada | Respaldo | Gate | Estado |
| --- | --- | --- | --- | --- | --- |
| `transaccion.precio_numeros` | `lots.precio`/`lot_records.valor` | `lot_records` | ficha negocio/instruccion | price_verified | Parcial |
| `transaccion.precio_letras` | derivado en wizard | resolver documental | precio numerico | price_verified | Parcial |
| `transaccion.moneda` | no estructurado | `payment_instructions` | instruccion de pago | price_verified | Futura |
| `transaccion.forma_pago` | wizard/manual | `payment_instructions` | instrucciones pago | price_verified | Parcial |
| `transaccion.detalle_pago[]` | no existe | `payment_instructions` | vales vista/custodia/recibos | price_verified | Futura |
| `transaccion.saldo_pendiente` | `lot_records.saldo` parcial | `payment_instructions` | instrucciones pago | price_verified | Parcial |
| `clausulas.cuerpo_cierto` | template | `legal_rule_pack` | template aprobado | legal_reviewed | Futura |
| `clausulas.saneamiento_eviccion` | template | `legal_rule_pack` + revision | template/aprobacion | legal_reviewed | Futura |
| `clausulas.exencion_eviccion_aprobada` | no existe | `legal_review_decisions` | instruccion partes/abogado | legal_reviewed | Futura, bloqueante si se activa |
| `clausulas.entrega_material` | template/manual | `legal_rule_pack` | instrucciones partes | revision | Futura |
| `clausulas.gastos_cargo` | template/manual | `legal_rule_pack` | instrucciones partes | revision | Futura |
| `clausulas.domicilio_contractual` | manual/template | `legal_rule_pack`/instrucciones | instrucciones partes | revision | Futura |
| `clausulas.tribunales_competentes` | manual/template | `legal_rule_pack`/instrucciones | instrucciones partes | revision | Futura |
| `clausulas.promesa_finiquito` | template/manual | `legal_rule_pack`/`lot_records` | promesa/finiquito | legal_reviewed | Futura |
| `clausulas.factibilidad_servicios` | template/manual | `legal_rule_pack`/`project_legal_data` | instrucciones/proyecto | legal_reviewed | Futura |
| `clausulas.lguc_destino_suelo` | template | `legal_rule_pack` | DL 3.516/LGUC | legal_reviewed | Futura |
| `clausulas.rnda_declaracion` | no estructurado | `legal_documents`/`legal_review_decisions` | consulta RNDA vigente | rnda_verified | Futura, bloqueante para aprobacion |
| `mandato.rectificacion_nombre` | wizard/manual | `party_legal_profiles`/revision | mandato | revision | Parcial |
| `mandato.rectificacion_rut` | wizard/manual | `party_legal_profiles`/revision | mandato | revision | Parcial |
| `mandato.facultades` | template/manual | `legal_rule_pack` | mandato aprobado | legal_reviewed | Futura |
| `evidencia.documentos_fuente[]` | lab-only | `document_evidence` | documentos/chunks | system_gate | Futura |
| `evidencia.estado` | no existe | `document_evidence` | todos | system_gate | Futura |

## Hallazgo especifico: roles SII

Tu sospecha es correcta: los roles existen como documentos y como hallazgo en el
laboratorio, pero no estan bien cerrados como variables productivas.

Evidencia:

- El MCP encuentra certificados de roles como `Roles-gaona.pdf`,
  `4.--Certificado-de-Roles---Gaona-7.pdf`,
  `4.--Certificado-de-Roles---Gaona-8.pdf`, `4---Certificado-roles.pdf` y
  `ROL-67-23-CERT-922575-TENO.pdf`.
- En el corpus aparecen rol matriz, solicitud F2118, unidad/lote y pre-rol o
  rol de avaluo en tramite.
- En escrituras tambien aparece a veces `Rol de avaluo en tramite`.
- La tabla productiva `project_legal_data` tiene `roles JSONB`, pero el resolver
  `apps/api/services/document_engine.py` no lo transforma en variables
  `sii.*` ni en `sii.pre_rol_lote`.
- `EscrituraVariables` solo tiene `lote.rol_tramite`, no un grupo `sii`.

Decision recomendada:

- `sii.rol_matriz` vive en `project_legal_data`.
- `sii.pre_rol_lote`, `sii.rol_avaluo_en_tramite_texto`,
  `sii.unidad_nombre` y `lote.rol_tramite` viven en `lot_legal_data`.
- `sii.certificado_asignacion_roles_numero`,
  `sii.certificado_fecha_emision` y `sii.solicitud_numero` viven en
  `legal_documents` y se referencian desde `document_evidence`.
- Si existe pre-rol/rol de avaluo en tramite respaldado por certificado SII, la
  minuta puede renderizarlo como lo hace el DOCX inscrito. No debe marcarse como
  faltante.
- Si no existe evidencia SII para el rol/pre-rol, el caso queda en
  `manual_review` o bloqueado hasta que abogado/operador autorizado apruebe la
  formula excepcional.

## Alineacion con generador de deslindes

El codigo actual ya resuelve una parte critica:

- `generateDeslindeText()` usa `lots.numero_lote`, `area_official_m2`, `m2`,
  `servidumbre_m2` y `boundaries_official`.
- `generateServidumbreText()` usa `ServidumbreAnalysis`, superficie, tramos,
  direccion y consolidacion de aristas.
- `validateLotDocumentReadiness()` exige `verified_status`,
  `area_official_m2`, `perimeter_official_m` y `boundaries_official`.

Decision:

- El LLM no debe extraer ni inventar deslindes desde escrituras historicas.
- La fuente duena de deslindes es geometria/lots.
- El LLM o el modulo de evidencia puede comparar el texto generado contra
  plano/SAG/escritura base, pero solo como corroboracion.
- Una matriz de escritura no debe pasar a `ready_for_draft` si el lote esta en
  `verified_status = draft` o si faltan `boundaries_official`.

## Readiness gates

| Gate | Bloquea | Reglas minimas |
| --- | --- | --- |
| `geometry_verified` | Si | Lote verificado, superficie oficial, perimetro, deslindes, servidumbre si aplica |
| `title_verified` | Si | Dominio vigente, vendedor coincide, CBR/fojas/numero/ano/CBR resueltos |
| `sag_verified` | Si | Certificado SAG y plano CBR identificados |
| `sii_verified` | Si | Rol matriz y pre-rol/rol de avaluo en tramite del lote respaldados por SII |
| `party_verified` | Si | Vendedor/comprador, RUT, domicilio, estado civil/capacidad minima |
| `personeria_verified` | Si aplica | Poderes vigentes y facultades suficientes |
| `price_verified` | Si | Precio, moneda, forma de pago y detalle conciliados |
| `rnda_verified` | Antes de aprobar o enviar a notaria | Consulta/constancia vigente, no historica |
| `legal_reviewed` | Antes de aprobar minuta | Abogado redactor identificado y aprobacion juridica registrada |
| `template_versioned` | Si | Template y rule pack versionados en snapshot |
| `evidence_mapped` | Si | Variables criticas con documento/tabla/pagina/chunk/estado |

Estados recomendados para `EscrituraCase`:

```text
intake -> collecting_sources -> resolving_variables -> needs_review
-> ready_for_draft -> draft_generated -> legal_review
-> minuta_approved -> sent_to_seller/notary
```

Estados de variable:

```text
resolved | derived | missing | conflict | manual_review | not_applicable
```

## Flujo de interfaz recomendado

### 1. Crear caso de escritura

Entrada minima:

- Proyecto.
- Lote vendido.
- Registro de venta/comprador.
- Template objetivo.

Salida:

- `escritura_case` en estado `intake`.
- Snapshot inicial de lote, comprador, precio y documentos disponibles.

### 2. Recolectar antecedentes

Pantalla tipo checklist:

- Dominio vigente / GP.
- Certificado SAG.
- Plano archivado CBR.
- Certificado de roles SII.
- Poderes/personeria.
- RNDA/constancia vigente.
- Instrucciones de pago.
- Contexto de destino/notaria si ya existe.
- Abogado redactor.

### 3. Resolver variables

Mostrar tabla con:

- Variable.
- Valor propuesto.
- Fuente.
- Documento/pagina/chunk.
- Estado.
- Confianza.
- Accion requerida.

La UI debe permitir corregir manualmente, pero toda correccion debe quedar como
`ReviewDecision`, no como reemplazo silencioso de la fuente.

### 4. Readiness

Vista de semaforo por gate:

- Bloqueante.
- Advertencia.
- Listo.

En esta etapa se debe mostrar el mensaje al cliente/operador:

```text
Plotify genera una minuta preliminar de escritura usando datos operacionales,
geometricos y documentos fuente. Esta minuta debe ser revisada y aprobada por un
abogado redactor antes de ser presentada en notaria o utilizada como instrumento
definitivo. La generacion automatica no reemplaza asesoria ni responsabilidad
legal profesional.
```

### 5. Generar minuta DOCX preliminar

Permitir generar DOCX editable como minuta preliminar:

- Texto con formato de minuta como `COMPRAVENTA LOTE 29.docx`.
- Estado `Borrador para revision legal` visible en UI, metadatos o nombre de
  archivo, no como sello notarial dentro del texto base.
- Variables faltantes en corchetes.
- Evidence snapshot adjunto.
- Rule pack/template version.
- PDF solo como preview o copia interna, no como producto principal.

No usar el flujo actual de `missing_variables_accepted` como aprobacion para
escrituras. Para escritura, aceptar faltantes debe producir solo borrador
interno, no minuta aprobada.

### 6. Revision legal

El abogado debe:

- Revisar personeria y facultades.
- Revisar dominio, gravamenes y prohibiciones.
- Revisar roles SII, pre-rol/rol de avaluo en tramite y respaldo documental.
- Revisar precio/liquidacion.
- Aprobar o rechazar clausulas de riesgo.
- Quedar registrado como abogado redactor/revisor.

### 7. Minuta aprobada para envio

Solo despues de `legal_reviewed`:

- Se desbloquea `minuta_approved`.
- Se genera DOCX de minuta aprobada.
- Se prepara envio al vendedor, abogado o notaria con paquete de evidencia.

## Modelos productivos sugeridos

| Modelo | Responsabilidad |
| --- | --- |
| `escritura_cases` | Caso por proyecto/lote/comprador/template, estado y readiness |
| `document_ingestion_jobs` | Pipeline de carga, OCR/conversion, paginas, chunks y extracciones |
| `legal_documents` | Documento fuente, tipo, emisor, fecha, vigencia, hash, archivo |
| `document_evidence` | Variable -> documento/tabla -> pagina/chunk -> confianza -> estado |
| `variable_resolutions` | Valor propuesto/aprobado por variable, fuente, confianza y auditoria |
| `project_legal_data` | Dominio matriz, SAG, plano CBR, rol matriz, reglas legales del proyecto |
| `lot_legal_data` | Rol lote, unidad SII, restricciones, servidumbres juridicas, notas CBR |
| `party_legal_profiles` | Personas, sociedades, representantes, poderes y vigencias |
| `payment_instructions` | Precio final, moneda, tramos, custodia, vales vista y saldo |
| `notarial_context` | Datos opcionales de destino si ya existen: notaria, ciudad y oficio |
| `legal_rule_packs` | Version de normas/clausulas y fecha de vigencia |
| `legal_review_decisions` | Aprobaciones, rechazos y correcciones de abogado u operador autorizado |

## Cambios concretos que faltan antes de implementar

1. Crear SDD productivo nuevo, separado del lab, para `escritura_cases`.
2. Definir contrato de datos de `VariableResolution` y `EvidenceItem`.
3. Extender el modelo de variables de escritura con grupos:
   - `documento`
   - `notarial_context`
   - `sii`
   - `plano`
   - `evidencia`
   - `revision_juridica`
4. Agregar `documento.abogado_redactor.*` y gate `legal_reviewed`.
5. Implementar `SiiRolesResolver`.
6. Cambiar el wizard de escritura para mostrar expediente/readiness, no solo
   formulario de variables.
7. Separar `generar borrador` de `aprobar minuta`.
8. Persistir snapshots:
   - variables.
   - evidencia.
   - template.
   - rule pack.
   - decisiones de revision.
9. Crear tests de gates:
   - rol SII ausente.
   - lote no verificado.
   - personeria incompleta.
   - abogado redactor ausente.
   - RNDA no vigente.
   - clausula de riesgo sin aprobacion.

## Preguntas abiertas

- Quien sera el abogado redactor por defecto: abogado de Plotify, abogado de la
  inmobiliaria, notaria o abogado externo por proyecto?
- La minuta se enviara al vendedor, a la notaria o a ambos?
- El vendedor puede editar datos juridicos o solo revisar/descargar?
- Los roles SII se cargaran por certificado completo del proyecto o por lote?
- Si se conoce la notaria, sera fija por organizacion/proyecto o elegida por caso?
- Se aceptara `rol en tramite` como flujo normal o solo como excepcion aprobada?

## Proximo paso SDD sugerido

Crear una nueva feature, por ejemplo:

```text
specs/007-gestor-escrituras-productivo/
```

Objetivo de la primera tarea: modelar `escritura_cases`,
`document_ingestion_jobs`, `legal_documents`, `document_evidence`,
`variable_resolutions`, `lot_legal_data`, `notarial_context` opcional y
`legal_review_decisions`, sin tocar todavia el render final. La primera entrega
deberia permitir crear un caso, adjuntar fuentes, resolver variables basicas y
ver readiness antes de generar una minuta DOCX.
