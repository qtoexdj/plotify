# Escrituras Lab: Variables Catalog

Estudio inicial para construir el template base de escrituras de compraventa de predios rusticos/lotes en Chile.

Este catalogo cruza cuatro fuentes: corpus procesado del MCP `plotify-escrituras`, memoria curada `plotify_memori/`, CodeGraph del codigo real y fuentes normativas oficiales. No aprueba variables productivas; define candidatos y reglas de origen para revision juridica/notarial.

## Corpus revisado

- 59 documentos procesados en el laboratorio local al 2026-06-02.
- 31 escrituras de compraventa procesadas como `escritura`, incluyendo escrituras individuales de lote y una escritura masiva de 34 lotes.
- Documentos fuente complementarios: dominio vigente, certificados SAG, certificados de roles SII, planos y otros antecedentes notariales.
- Ejemplos principales usados:
  - `CV-BELLA-VISTA-RIQUELME-LT-N250.pdf`: escritura individual, 10 paginas, buena estructura de matriz, SAG, lote, precio, servidumbre, personeria y cierre.
  - `escritura-34-lotes-rauco.pdf`: escritura masiva, 57 paginas, util para lotes multiples con superficies, servidumbres y roles por parcela.
  - `Roles-gaona.pdf`: certificado SII de asignacion de roles de avaluo.
  - `Certificado-Sag-.pdf` y `1468_2024-Certificado.pdf`: certificados SAG con base en Ley 18.755, art. 46.
  - `dominio-gaona.pdf`: inscripcion conservatoria de dominio con fojas, numero, CBR, rol y precio historico.

## Hallazgos estructurales

La estructura recurrente de las escrituras de compraventa revisadas es:

1. Certificacion/copia electronica y caratula notarial.
2. Comparecencia: ciudad, fecha, notario, vendedor, comprador, individualizacion y domicilio.
3. Antecedente de dominio del predio matriz: nombre, ubicacion, superficie, deslindes, adquisicion, inscripcion CBR y rol.
4. Subdivision SAG y plano archivado: certificado, fecha, plano, archivo al final del Registro de Propiedad y origen del lote.
5. Individualizacion del lote: numero/nombre, superficie, superficie afecta a servidumbre, deslindes y rol.
6. Venta, cesion y transferencia.
7. Precio y liquidacion: monto, moneda, forma de pago, declaracion de recepcion y renuncia de acciones resolutorias/redhibitorias cuando aparece.
8. Cuerpo cierto/ad-corpus, estado material, usos, derechos, servidumbres, gravamenes, prohibiciones, saneamiento de eviccion y vicios redhibitorios.
9. Servidumbre de transito: predio sirviente, predios dominantes, superficie, deslindes y aceptacion.
10. Entrega material, gastos, domicilio y competencia.
11. Clausulas complementarias: promesas/finiquitos, factibilidad de agua/electricidad, permisos, tala/bosques, LGUC 55/56, RNDA Ley 21.389, mandato de rectificacion, portador de copia y personeria.
12. Lectura, aceptacion, firmas y certificados anexos.

## Validacion del codigo actual

CodeGraph confirma que el sistema ya tiene:

- `EscrituraVariables` en `apps/web/src/types/documents.ts`, con grupos `vendedor`, `comprador`, `matriz`, `sag`, `lote`, `servidumbre`, `transaccion`, `mandato`, `personeria`.
- `DocumentVariablesGroup` en `apps/api/api/v1/endpoints/documents.py`, compatible con los mismos grupos.
- `generateDeslindeText()` en `apps/web/src/lib/legal/deslinde-generator.ts`, que genera numero de lote, superficie, superficie afecta a servidumbre y deslindes desde `lots.area_official_m2`, `lots.m2`, `lots.servidumbre_m2` y `lots.boundaries_official`.
- `generateServidumbreText()` en `apps/web/src/lib/legal/servidumbre-generator.ts`, para texto de servidumbre a partir del analisis geometrico.

Conclusion: deslindes y superficie estan cubiertos en el codigo, pero deben quedar bajo un gate de verificacion antes de renderizar escritura. El modelo actual es insuficiente para personeria, antecedentes legales del proyecto, certificado SAG, roles SII, gravamenes, RNDA, clausulas de cierre e instrucciones notariales.

## Variables canonicas candidatas

| Variable canonica                     | Significado                                                      | Fuente candidata                          | Estado            |
| ------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- | ----------------- |
| `documento.tipo`                      | Tipo de instrumento, usualmente escritura publica de compraventa | template/notarial_config                  | futura            |
| `documento.ciudad_otorgamiento`       | Ciudad de otorgamiento                                           | notarial_config o manual_review           | futura            |
| `documento.fecha_otorgamiento`        | Fecha de otorgamiento                                            | manual_review                             | futura            |
| `documento.repertorio_numero`         | Repertorio notarial                                              | manual_review                             | futura            |
| `documento.notario.nombre`            | Nombre del notario autorizante                                   | notarial_config                           | futura            |
| `documento.notaria.direccion`         | Oficio/direccion de la notaria                                   | notarial_config                           | futura            |
| `vendedor.tipo`                       | Natural o juridica                                               | party_legal_profiles                      | futura            |
| `vendedor.nombre`                     | Nombre o razon social                                            | project_legal_data / party_legal_profiles | futura            |
| `vendedor.rut`                        | RUT vendedor                                                     | project_legal_data / party_legal_profiles | futura            |
| `vendedor.nacionalidad`               | Nacionalidad persona natural                                     | party_legal_profiles                      | futura            |
| `vendedor.estado_civil`               | Estado civil                                                     | party_legal_profiles / manual_review      | futura            |
| `vendedor.profesion_giro`             | Profesion u objeto/giro                                          | party_legal_profiles                      | futura            |
| `vendedor.domicilio`                  | Domicilio compareciente                                          | party_legal_profiles                      | futura            |
| `vendedor.representantes[]`           | Representantes de persona juridica                               | party_legal_profiles                      | futura            |
| `comprador.nombre`                    | Nombre comprador                                                 | `lot_records.cliente_nombre`              | existente parcial |
| `comprador.rut`                       | RUN/RUT comprador                                                | `lot_records.cliente_run`                 | existente parcial |
| `comprador.domicilio`                 | Domicilio comprador                                              | `lot_records.cliente_direccion`           | existente parcial |
| `comprador.estado_civil`              | Estado civil comprador                                           | `lot_records.cliente_estado_civil`        | existente parcial |
| `comprador.profesion_giro`            | Ocupacion/profesion comprador                                    | `lot_records.cliente_ocupacion`           | existente parcial |
| `matriz.nombre_predio`                | Nombre del predio matriz                                         | project_legal_data                        | futura            |
| `matriz.ubicacion`                    | Ubicacion legal del predio matriz                                | project_legal_data                        | futura            |
| `matriz.comuna`                       | Comuna del predio matriz                                         | projects/location o project_legal_data    | parcial           |
| `matriz.provincia`                    | Provincia                                                        | project_legal_data                        | futura            |
| `matriz.region`                       | Region                                                           | project_legal_data                        | futura            |
| `matriz.superficie_total`             | Superficie del predio matriz                                     | project_legal_data / plano                | futura            |
| `matriz.deslindes.*`                  | Deslindes generales del predio matriz                            | project_legal_data / dominio              | futura            |
| `matriz.adquisicion_modo`             | Compra, adjudicacion u otro titulo                               | project_legal_data                        | futura            |
| `matriz.adquisicion_notaria`          | Notaria del titulo anterior                                      | project_legal_data                        | futura            |
| `matriz.adquisicion_fecha`            | Fecha del titulo anterior                                        | project_legal_data                        | futura            |
| `matriz.adquisicion_repertorio`       | Repertorio del titulo anterior                                   | project_legal_data                        | futura            |
| `matriz.inscripcion_fojas`            | Fojas CBR dominio matriz                                         | project_legal_data                        | futura            |
| `matriz.inscripcion_numero`           | Numero CBR dominio matriz                                        | project_legal_data                        | futura            |
| `matriz.inscripcion_anio`             | Año CBR dominio matriz                                           | project_legal_data                        | futura            |
| `matriz.inscripcion_cbr`              | Conservador competente                                           | project_legal_data                        | futura            |
| `matriz.rol_avaluo`                   | Rol matriz                                                       | project_legal_data / roles_sii            | futura            |
| `sag.certificado_numero`              | Numero certificado SAG                                           | project_legal_data / legal_documents      | futura            |
| `sag.certificado_fecha`               | Fecha certificado SAG                                            | project_legal_data / legal_documents      | futura            |
| `sag.oficina_sectorial`               | Oficina SAG emisora                                              | legal_documents                           | futura            |
| `sag.region`                          | Region SAG                                                       | legal_documents                           | futura            |
| `sag.plano_cbr_numero`                | Numero de archivo del plano en CBR                               | project_legal_data                        | futura            |
| `sag.plano_cbr_anio`                  | Año archivo del plano                                            | project_legal_data                        | futura            |
| `sag.plano_cbr_registro`              | Registro donde se agrego el plano                                | project_legal_data                        | futura            |
| `sag.prohibicion_cambio_destino`      | Clave para clausula LGUC/DL 3.516                                | legal_rule_pack                           | futura            |
| `sii.certificado_numero`              | Certificado de asignacion de roles                               | legal_documents                           | futura            |
| `sii.certificado_fecha_emision`       | Fecha de emision                                                 | legal_documents                           | futura            |
| `sii.solicitud_numero`                | F2118/Solicitud SII                                              | legal_documents                           | futura            |
| `sii.rol_matriz`                      | Rol matriz declarado por SII                                     | project_legal_data / roles_sii            | futura            |
| `sii.rol_asignado_lote`               | Rol asignado al lote                                             | lot_legal_data                            | futura            |
| `sii.unidad_nombre`                   | Direccion o nombre de la unidad                                  | lot_legal_data                            | futura            |
| `lote.numero`                         | Numero del lote                                                  | `lots.numero_lote`                        | existente         |
| `lote.numero_nombre`                  | Numero en palabras/formato legal                                 | resolver derivado                         | existente parcial |
| `lote.superficie_m2`                  | Superficie oficial m2                                            | `lots.area_official_m2` o `lots.m2`       | existente         |
| `lote.superficie_texto`               | Superficie en palabras                                           | resolver derivado                         | existente parcial |
| `lote.superficie_ha_texto`            | Superficie en hectareas cuando escritura usa ha                  | resolver derivado                         | futura            |
| `lote.deslindes`                      | Texto legal del lote                                             | `generateDeslindeText()`                  | existente         |
| `lote.boundaries_official`            | Estructura de deslindes                                          | `lots.boundaries_official`                | existente         |
| `lote.rol_tramite`                    | Rol en tramite o rol asignado                                    | `lots`/lot_legal_data                     | parcial           |
| `servidumbre.aplica`                  | Si existe servidumbre                                            | `lots.servidumbre_m2 > 0`                 | existente         |
| `servidumbre.superficie_m2`           | Superficie afecta                                                | `lots.servidumbre_m2`                     | existente         |
| `servidumbre.superficie_texto`        | Superficie en palabras                                           | resolver derivado                         | existente parcial |
| `servidumbre.deslindes_tramo`         | Texto de deslindes de servidumbre                                | `generateServidumbreText()`               | existente parcial |
| `servidumbre.predio_sirviente`        | Lote gravado                                                     | derivado de lote                          | existente parcial |
| `servidumbre.predios_dominantes`      | Resto del predio/lotes beneficiados                              | project_legal_data / manual_review        | futura            |
| `transaccion.precio_numeros`          | Precio numerico                                                  | `lots.precio` o `lot_records.valor`       | existente parcial |
| `transaccion.precio_letras`           | Precio en palabras                                               | resolver derivado                         | existente parcial |
| `transaccion.moneda`                  | CLP, UF u otra                                                   | lot_records/future_model                  | parcial           |
| `transaccion.forma_pago`              | Contado, efectivo, transferencia, vales vista, custodia          | lot_records/manual_review                 | parcial           |
| `transaccion.detalle_pago[]`          | Tramos de pago, UF/pesos, custodias e instrucciones              | future_model                              | futura            |
| `transaccion.renuncia_acciones`       | Renuncia resolutoria/redhibitoria si procede                     | template/manual_review                    | futura            |
| `clausulas.cuerpo_cierto`             | Venta como cuerpo cierto/ad-corpus                               | template                                  | futura            |
| `clausulas.saneamiento_eviccion`      | Respuesta o limitacion de eviccion/vicios                        | template/manual_review                    | futura            |
| `clausulas.entrega_material`          | Entrega material misma fecha u otra                              | template/manual_review                    | futura            |
| `clausulas.gastos_cargo`              | Gastos de escritura/inscripcion                                  | template/manual_review                    | futura            |
| `clausulas.domicilio_contractual`     | Ciudad de domicilio                                              | notarial_config/manual_review             | futura            |
| `clausulas.tribunales_competentes`    | Tribunales competentes                                           | notarial_config/manual_review             | futura            |
| `clausulas.promesa_finiquito`         | Cierre de promesa/oferta/acuerdo previo                          | lot_records/manual_review                 | futura            |
| `clausulas.factibilidad_servicios`    | Agua/electricidad bajo responsabilidad comprador                 | project_legal_data/manual_review          | futura            |
| `clausulas.permisos_construccion`     | Responsabilidad de permisos                                      | legal_rule_pack/template                  | futura            |
| `clausulas.tala_bosques`              | Permisos de corta/tala si aplica                                 | project_legal_data/manual_review          | futura            |
| `clausulas.lguc_destino_suelo`        | Prohibicion cambio de destino LGUC 55/56                         | legal_rule_pack                           | futura            |
| `clausulas.rnda_declaracion`          | Declaracion Registro Nacional Deudores Alimentos                 | manual_review/legal_documents             | futura            |
| `mandato.rectificacion_nombre`        | Mandatario para rectificaciones                                  | manual_review                             | futura            |
| `mandato.rectificacion_rut`           | RUT mandatario                                                   | manual_review                             | futura            |
| `mandato.facultades`                  | Alcance de rectificar/aclarar/complementar                       | template/manual_review                    | futura            |
| `personeria.aplica`                   | Si vendedor/comprador actua por representante                    | resolver                                  | existente parcial |
| `personeria.constitucion_fecha`       | Fecha escritura constitucion sociedad                            | party_legal_profiles/manual_review        | futura            |
| `personeria.constitucion_notaria`     | Notaria de constitucion                                          | party_legal_profiles/manual_review        | futura            |
| `personeria.registro_comercio_fojas`  | Fojas Registro Comercio                                          | party_legal_profiles/manual_review        | futura            |
| `personeria.registro_comercio_numero` | Numero Registro Comercio                                         | party_legal_profiles/manual_review        | futura            |
| `personeria.registro_comercio_anio`   | Año Registro Comercio                                            | party_legal_profiles/manual_review        | futura            |
| `personeria.delegacion_facultades`    | Datos de delegacion/poder                                        | party_legal_profiles/manual_review        | futura            |
| `evidencia.documentos_fuente[]`       | Documentos que respaldan cada variable                           | legal_documents/document_evidence         | futura            |
| `evidencia.estado`                    | resolved/missing/conflict/manual_review                          | resolver                                  | futura            |

## Variables que no deben salir solo del LLM

- Superficie y deslindes del lote: deben salir de geometria/lots y pasar por `verified_status`.
- Rol SII: debe salir del certificado de roles o de un modelo legal del lote, no de inferencia.
- Dominio, fojas, numero, año, CBR y gravamenes: deben salir de certificado de dominio/GP vigente.
- Personeria y poderes: requieren documento corporativo vigente o revision humana.
- RNDA: debe provenir de certificado o consulta vigente, no de escrituras historicas.
- Exencion o limitacion de eviccion: solo con opcion juridica explicita y revision humana.

## Base normativa a usar por el motor

- Codigo Civil: compraventa, precio, solemnidad por escritura publica, tradicion por inscripcion, cuerpo cierto/cabida, saneamiento de eviccion y vicios redhibitorios.
- Reglamento del Registro Conservatorio de Bienes Raices: anotacion en repertorio, registros de propiedad/hipotecas/prohibiciones, archivo de planos y designaciones legales.
- Ley 21.389: constancia/notaria y efectos para deudores de alimentos en traspasos sujetos a registro.
- Ley 18.755, art. 46; DL 3.516; LGUC arts. 55 y 56: subdivision de predios rusticos, prohibicion de cambio de destino y advertencias de uso de suelo.
- Ley sobre Efecto Retroactivo de las Leyes y Codigo Civil art. 9: criterio de aplicacion temporal y estabilidad de derechos adquiridos; debe quedar en el rule pack, no necesariamente como clausula visible en todas las escrituras.
