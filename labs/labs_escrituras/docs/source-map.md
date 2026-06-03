# Escrituras Lab: Source Map

Mapa entre variables canonicas de escritura, fuentes reales/futuras de Plotify y documentos que deben respaldarlas. El criterio base es que la escritura no se renderiza desde inferencia libre: cada variable queda trazada a una tabla, documento, regla juridica o revision humana.

## Prioridad de fuentes

1. **Base operacional verificada**: `lots`, `lot_records`, geometria y estado `verified_status`.
2. **Antecedentes legales del proyecto**: dominio vigente, certificado SAG, plano archivado, certificado de roles SII, gravamenes/prohibiciones y poderes.
3. **Reglas de clausulado**: rule pack juridico chileno y template aprobado.
4. **Revision humana**: notario/abogado/operador cuando hay ausencia, conflicto o decision juridica no automatizable.
5. **LLM**: solo propone extracciones, normalizaciones y redaccion; no es fuente de verdad.

## Mapa operativo

| Variable canonica                  | Fuente actual                       | Fuente dueña recomendada                 | Documento respaldo                 | Gate                | Observacion                                                       |
| ---------------------------------- | ----------------------------------- | ---------------------------------------- | ---------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `documento.ciudad_otorgamiento`    | manual                              | `notarial_config`                        | datos notaria                      | manual_review       | No debe inferirse por comuna del lote.                            |
| `documento.fecha_otorgamiento`     | manual                              | `generated_documents` / notaria          | repertorio/notaria                 | manual_review       | Se completa al otorgamiento.                                      |
| `documento.notario.nombre`         | manual                              | `notarial_config`                        | notaria                            | manual_review       | Parametro por oficio notarial.                                    |
| `vendedor.nombre`                  | parcial                             | `party_legal_profiles`                   | escritura social, dominio          | legal_verified      | En proyectos, normalmente persona juridica.                       |
| `vendedor.rut`                     | parcial                             | `party_legal_profiles`                   | escritura social, dominio          | legal_verified      | Requiere RUT vigente.                                             |
| `vendedor.representantes[]`        | parcial                             | `party_legal_profiles`                   | poderes/personeria                 | legal_verified      | Debe quedar con facultades suficientes.                           |
| `comprador.nombre`                 | `lot_records.cliente_nombre`        | `lot_records`                            | ficha cliente, cedula              | data_verified       | Existe, pero falta normalizacion juridica.                        |
| `comprador.rut`                    | `lot_records.cliente_run`           | `lot_records`                            | cedula/RUT                         | data_verified       | Usar `cliente_run_normalizado` cuando exista.                     |
| `comprador.estado_civil`           | `lot_records.cliente_estado_civil`  | `lot_records`                            | declaracion/cedula                 | manual_review       | Afecta comparecencia y eventual conyuge.                          |
| `comprador.profesion_giro`         | `lot_records.cliente_ocupacion`     | `lot_records`                            | declaracion comprador              | manual_review       | Campo actual sirve, pero debe aceptar giro.                       |
| `comprador.domicilio`              | `lot_records.cliente_direccion`     | `lot_records`                            | declaracion comprador              | manual_review       | Domicilio personal distinto de contractual.                       |
| `matriz.nombre_predio`             | no estructurado                     | `project_legal_data`                     | dominio vigente                    | legal_verified      | Extraido de dominio matriz.                                       |
| `matriz.ubicacion`                 | parcial proyecto                    | `project_legal_data`                     | dominio vigente                    | legal_verified      | Incluye comuna, provincia y region.                               |
| `matriz.superficie_total`          | no estructurado                     | `project_legal_data`                     | dominio/plano                      | legal_verified      | Debe conservar unidad original y normalizada.                     |
| `matriz.deslindes`                 | no estructurado                     | `project_legal_data`                     | dominio vigente                    | legal_verified      | No confundir con deslindes del lote.                              |
| `matriz.inscripcion_fojas`         | no estructurado                     | `project_legal_data`                     | dominio vigente                    | legal_verified      | Necesaria para tradicion.                                         |
| `matriz.inscripcion_numero`        | no estructurado                     | `project_legal_data`                     | dominio vigente                    | legal_verified      | Necesaria para tradicion.                                         |
| `matriz.inscripcion_anio`          | no estructurado                     | `project_legal_data`                     | dominio vigente                    | legal_verified      | Necesaria para tradicion.                                         |
| `matriz.inscripcion_cbr`           | no estructurado                     | `project_legal_data`                     | dominio vigente                    | legal_verified      | Conservador competente.                                           |
| `matriz.rol_avaluo`                | parcial                             | `project_legal_data`                     | SII/dominio                        | legal_verified      | Rol matriz puede diferir de rol lote.                             |
| `sag.certificado_numero`           | no estructurado                     | `legal_documents` / `project_legal_data` | certificado SAG                    | legal_verified      | Ej.: certificados del corpus citan art. 46 Ley 18.755.            |
| `sag.certificado_fecha`            | no estructurado                     | `legal_documents` / `project_legal_data` | certificado SAG                    | legal_verified      | Necesaria para historia de subdivision.                           |
| `sag.plano_cbr_numero`             | no estructurado                     | `project_legal_data`                     | plano archivado CBR                | legal_verified      | Se cita en la escritura.                                          |
| `sag.plano_cbr_anio`               | no estructurado                     | `project_legal_data`                     | plano archivado CBR                | legal_verified      | Se cita junto al numero de plano.                                 |
| `sag.plano_cbr_registro`           | no estructurado                     | `project_legal_data`                     | CBR                                | legal_verified      | Normalmente Registro de Propiedad/archivo de planos.              |
| `sii.certificado_numero`           | no estructurado                     | `legal_documents`                        | certificado roles SII              | legal_verified      | Ej.: `Roles-gaona.pdf`.                                           |
| `sii.certificado_fecha_emision`    | no estructurado                     | `legal_documents`                        | certificado roles SII              | legal_verified      | Fecha de emision del certificado.                                 |
| `sii.rol_matriz`                   | no estructurado                     | `project_legal_data`                     | certificado roles SII              | legal_verified      | Debe coincidir con antecedentes del dominio.                      |
| `sii.rol_asignado_lote`            | no estructurado                     | `lot_legal_data`                         | certificado roles SII              | legal_verified      | Si no existe, usar `rol en tramite` con revision.                 |
| `lote.numero`                      | `lots.numero_lote`                  | `lots`                                   | plano/lots                         | geometry_verified   | Ya existe.                                                        |
| `lote.superficie_m2`               | `lots.area_official_m2` / `lots.m2` | `lots`                                   | plano/SAG/geometria                | geometry_verified   | Prioridad: oficial > calculada.                                   |
| `lote.superficie_texto`            | derivado                            | resolver documental                      | `lote.superficie_m2`               | data_verified       | Convertir numeros a palabras y unidad.                            |
| `lote.deslindes`                   | `generateDeslindeText()`            | `lots.boundaries_official`               | plano/SAG/geometria                | geometry_verified   | Codigo ya lo resuelve; bloquear si falta verificacion.            |
| `lote.boundaries_official`         | `lots.boundaries_official`          | `lots`                                   | plano/geometria                    | geometry_verified   | Fuente estructurada de deslindes.                                 |
| `lote.rol_tramite`                 | parcial                             | `lot_legal_data`                         | SII                                | legal_verified      | Distinguir rol asignado vs en tramite.                            |
| `servidumbre.aplica`               | `lots.servidumbre_m2 > 0`           | `lots`                                   | plano/geometria                    | geometry_verified   | Debe validar si hay servidumbre legalmente constituida.           |
| `servidumbre.superficie_m2`        | `lots.servidumbre_m2`               | `lots`                                   | plano/geometria                    | geometry_verified   | En corpus aparece como superficie afecta a servidumbre.           |
| `servidumbre.deslindes_tramo`      | `generateServidumbreText()`         | geometria/analysis                       | plano/geometria                    | geometry_verified   | Codigo existe, falta gate documental.                             |
| `servidumbre.predio_sirviente`     | derivado lote                       | `lot_legal_data`                         | escritura/plano                    | legal_verified      | Normalmente el lote vendido soporta tramo.                        |
| `servidumbre.predios_dominantes`   | no estructurado                     | `project_legal_data`                     | plano/escritura base               | legal_verified      | No inferir si no hay definicion.                                  |
| `transaccion.precio_numeros`       | `lot_records.valor` / `lots.precio` | `lot_records`                            | ficha negocio/instruccion notarial | commercial_verified | Prioridad: valor de negocio vigente.                              |
| `transaccion.moneda`               | parcial                             | `lot_records`                            | instruccion de pago                | manual_review       | CLP/UF; corpus tiene ambos casos.                                 |
| `transaccion.precio_letras`        | derivado                            | resolver documental                      | precio numerico                    | data_verified       | Debe coincidir con moneda.                                        |
| `transaccion.forma_pago`           | parcial                             | `lot_records` / manual                   | instrucciones pago                 | manual_review       | Efectivo, contado, transferencia, vales vista, custodia.          |
| `transaccion.detalle_pago[]`       | no estructurado                     | `payment_instructions`                   | vales vista/recibos                | manual_review       | Necesario para liquidacion compleja.                              |
| `clausulas.cuerpo_cierto`          | template                            | `legal_rule_pack`                        | Codigo Civil/template              | legal_reviewed      | Clausula recurrente.                                              |
| `clausulas.saneamiento_eviccion`   | template                            | `legal_rule_pack` + manual               | Codigo Civil/instruccion           | legal_reviewed      | Regla por defecto: saneamiento; exencion solo expresa y revisada. |
| `clausulas.entrega_material`       | template/manual                     | `legal_rule_pack`                        | instruccion partes                 | manual_review       | Fecha y estado de entrega.                                        |
| `clausulas.gastos_cargo`           | template/manual                     | `legal_rule_pack`                        | instruccion partes                 | manual_review       | Escritura, impuestos, inscripcion, copias.                        |
| `clausulas.domicilio_contractual`  | manual                              | `notarial_config` / template             | instruccion partes                 | manual_review       | En corpus aparece Santiago en varios cierres.                     |
| `clausulas.tribunales_competentes` | manual                              | `notarial_config` / template             | instruccion partes                 | manual_review       | Debe respetar practica y competencia.                             |
| `clausulas.lguc_destino_suelo`     | template                            | `legal_rule_pack`                        | DL 3.516 / LGUC                    | legal_reviewed      | Advertencia para predios rusticos.                                |
| `clausulas.rnda_declaracion`       | no estructurado                     | `legal_documents` / manual               | consulta RNDA                      | legal_verified      | No usar declaracion historica vencida.                            |
| `mandato.rectificacion_nombre`     | manual                              | `notarial_config` / party                | mandato                            | manual_review       | Opcional, pero recurrente.                                        |
| `mandato.facultades`               | template/manual                     | `legal_rule_pack`                        | mandato                            | legal_reviewed      | Aclarar, rectificar, complementar, inscribir.                     |
| `personeria.constitucion_*`        | no estructurado                     | `party_legal_profiles`                   | constitucion sociedad              | legal_verified      | Para vendedor persona juridica.                                   |
| `personeria.poder_*`               | no estructurado                     | `party_legal_profiles`                   | poder/delegacion                   | legal_verified      | Debe incluir vigencia.                                            |
| `evidencia.estado`                 | no existe                           | `document_evidence`                      | todos                              | system_gate         | `resolved`, `missing`, `conflict`, `manual_review`.               |

## Conflictos detectables

- Superficie de `lots.m2` distinta de `lots.area_official_m2` o del certificado SAG.
- Deslindes generados desde geometria no coinciden con plano archivado.
- Rol matriz del dominio no coincide con certificado SII.
- Comprador en `lot_records` no coincide con instrucciones notariales.
- Precio comercial (`lots.precio`) distinto de precio final (`lot_records.valor`) sin justificacion.
- Personeria vencida, incompleta o sin facultad de vender/comprar/constituir servidumbres.
- RNDA ausente para otorgantes que deben consultarse.
- Clausula de exencion/limitacion de eviccion activada sin aprobacion legal.

## Datos nuevos recomendados

| Modelo sugerido        | Responsabilidad                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `project_legal_data`   | Dominio matriz, subdivision SAG, plano CBR, rol matriz, reglas legales del proyecto. |
| `lot_legal_data`       | Rol asignado, referencias del lote en SAG/SII, restricciones y servidumbres propias. |
| `party_legal_profiles` | Comparecientes, sociedades, representantes, poderes y vigencias.                     |
| `legal_documents`      | Metadatos de documentos fuente: dominio, GP, SAG, SII, RNDA, poderes, planos.        |
| `document_evidence`    | Trazabilidad variable -> documento -> chunk/pagina -> confianza -> estado.           |
| `escritura_cases`      | Caso de generacion por lote/comprador con estado de preparacion y revision.          |
