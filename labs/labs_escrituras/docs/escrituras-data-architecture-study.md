# Escrituras Lab: Estudio de datos y arquitectura

Estado: cierre de analisis v1, 2026-06-02.

Este estudio consolida el analisis del corpus procesado por el MCP
`plotify-escrituras`, la memoria curada de Plotify, CodeGraph del codigo real y
fuentes normativas oficiales chilenas. No aprueba datos productivos ni reemplaza
revision legal. Su objetivo es definir la estructura inicial del template de
escritura de compraventa, sus variables canonicas, sus fuentes futuras y la
logica del gestor de escrituras.

## Corpus y evidencia usada

- 59 documentos procesados en `lab_escrituras.source_documents`.
- 901 chunks embebidos disponibles para busqueda semantica.
- Documentos revisados por MCP:
  - Escrituras individuales de compraventa de lotes rurales, principalmente
    `CV-BELLA-VISTA-RIQUELME-LT-N250.pdf` y escrituras Galaz.
  - Escritura masiva `escritura-34-lotes-rauco.pdf`, util para lotes multiples.
  - Certificados SAG, roles SII, planos y certificados/inscripciones CBR.
- Calidad: el MCP marco como `analysis_ready=true` los documentos principales y
  separo paginas `low_signal` o de solo certificacion para no inferir variables
  desde ruido.

Evidencia representativa:

| Evidencia MCP                          | Documento                             | Hallazgo                                                                                         |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `34a20711-ca16-4459-8a86-f3918a3ba6c2` | `CV-BELLA-VISTA-RIQUELME-LT-N250.pdf` | Comparecencia, notario, vendedor persona juridica, comprador, fecha y repertorio.                |
| `74f8f76b-685d-4224-8a02-19d853881603` | `CV-BELLA-VISTA-RIQUELME-LT-N250.pdf` | SAG, plano CBR, lote, superficie, superficie afecta a servidumbre y deslindes.                   |
| `8ff1d054-dc26-43b2-bd67-cb39429b6fc8` | `CV-BELLA-VISTA-RIQUELME-LT-N250.pdf` | Precio, pago contado, ad-corpus, saneamiento y servidumbre.                                      |
| `aebc68d4-5946-4d93-a806-e796bf28046c` | `CV-BELLA-VISTA-RIQUELME-LT-N250.pdf` | Servidumbre, entrega, gastos, domicilio y finiquito.                                             |
| `1904a09c-06ae-45a2-be02-968db89e5ac8` | `CV-BELLA-VISTA-RIQUELME-LT-N250.pdf` | LGUC, portador de copia, personeria y RNDA.                                                      |
| `1a1a1bd3-0831-442d-b8aa-9ba499b80ac4` | `escritura-34-lotes-rauco.pdf`        | Precio total de 34 parcelas y desglose por parcela.                                              |
| `f1e2a982-ae1b-4087-8819-00238b50f8fc` | `1468_2024-Certificado.pdf`           | Certificado SAG, DL 3.516, LGUC y advertencias de no validar dominio/georreferencia/servidumbre. |
| `2ab821bd-bd91-4833-8ab3-da1c95172fd7` | `Certificado-Sag-.pdf`                | Certificado SAG art. 46 Ley 18.755 y limites de validacion SAG.                                  |
| `d3439b0d-d91c-4f91-a62c-54bd7846ecd9` | `Roles-gaona.pdf`                     | SII: certificado, F2118, rol matriz y roles asignados por lote.                                  |
| `1da86282-07be-4826-8525-df7624f73d06` | `doc.php.pdf`                         | Dominio CBR, fojas, numero, ano y vigencia.                                                      |
| `94ea86b7-a0b3-4061-9fe2-5564247a904c` | `doc.php.pdf`                         | Notas marginales de transferencias y plano SAG agregado al registro.                             |
| `d5373ee6-1516-431a-9788-35c4fb060cbb` | `PLANO---LAMINA-1-2.pdf`              | Plano: propietario, rol, inscripcion, superficie, servidumbres y origen topografico.             |

## Base normativa operacional

El gestor debe usar un `LegalRulePack` versionado con fuentes oficiales. Para
este estudio se revisaron fuentes Ley Chile/BCN:

- Codigo Civil, LeyChile `idNorma=172986`: compraventa, tradicion por
  inscripcion, escritura publica para venta de inmuebles, precio, cabida/cuerpo
  cierto y saneamiento por eviccion/vicios.
- Ley sobre Efecto Retroactivo de las Leyes, LeyChile `idNorma=225521`: regla de
  conflictos temporales de leyes; se usa como criterio del rule pack, no como
  clausula visible por defecto.
- Reglamento del Registro Conservatorio de Bienes Raices, LeyChile
  `idNorma=255400`: repertorio, registros, inscripciones, subinscripciones,
  notas marginales y archivo de planos.
- Ley 18.755 art. 46, LeyChile `idNorma=30135`: certificacion SAG de
  subdivisiones de predios rusticos.
- OGUC/DS 47, LeyChile `idNorma=8201`: reconoce que las divisiones de predios
  rusticos requieren certificacion SAG conforme al art. 46 de la Ley 18.755.
- Ley 21.389, LeyChile `idNorma=1168463`: Registro Nacional de Deudores de
  Pensiones de Alimentos y efectos en traspasos sujetos a registro.

Regla practica: el template puede redactar conforme al derecho chileno, pero el
gestor no debe decidir hechos juridicos. Si no hay evidencia vigente, deja el
dato en corchetes y bloquea cuando el riesgo sea material.

## Estructura canonica de una escritura

La estructura recurrente del corpus es:

1. Caratula/certificacion notarial o CBR.
2. Comparecencia: ciudad, fecha, notario, vendedor, comprador, RUT, domicilio,
   estado civil/profesion y representacion.
3. Dominio del predio matriz: nombre, ubicacion, superficie, deslindes,
   adquisicion, repertorio, fojas, numero, ano, CBR y rol matriz.
4. Subdivision: certificado SAG, fecha, oficina, plano, archivo CBR y
   constancia de predio rustico.
5. Individualizacion del lote: numero, superficie, superficie afecta a
   servidumbre, deslindes, rol asignado o rol en tramite.
6. Compraventa: venta, cesion, transferencia, aceptacion y adquisicion.
7. Precio y liquidacion: monto, moneda, forma de pago, recibo/carta de pago,
   saldo o custodia y renuncias pactadas.
8. Cuerpo cierto/ad-corpus, estado material, contribuciones y limitaciones.
9. Gravamenes, prohibiciones, litigios, arrendamientos y GP.
10. Saneamiento de eviccion y vicios redhibitorios; exencion o limitacion solo
    con aprobacion legal expresa.
11. Servidumbre de transito: predio sirviente, predios dominantes, superficie,
    tramos, deslindes y aceptacion.
12. Destino rural, DL 3.516, LGUC 55/56, permisos y factibilidades.
13. Entrega material, gastos, domicilio y tribunales.
14. Mandato para rectificar, aclarar y complementar.
15. RNDA Ley 21.389 o constancia notarial vigente.
16. Personeria: constitucion, registro comercio, delegacion/poder, vigencia y
    suficiencia de facultades.
17. Portador de copia, inscripcion y cierre de lectura/firma.

## Variables y fuente dueña

El modelo actual `EscrituraVariables` existe, pero es insuficiente como fuente
productiva. Mantiene grupos basicos (`vendedor`, `comprador`, `matriz`, `sag`,
`lote`, `servidumbre`, `transaccion`, `mandato`, `personeria`), pero falta
evidencia, vigencia, estados de revision y datos legales de proyecto/lote.

Fuentes dueñas recomendadas:

| Grupo           | Fuente dueña                                                 | Motivo                                                                        |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `documento.*`   | `notarial_config` / `generated_documents` / `manual_review`  | Fecha, repertorio y notaria no se infieren desde el lote.                     |
| `vendedor.*`    | `party_legal_profiles` + dominio/personeria                  | Debe coincidir con dominio y facultades.                                      |
| `comprador.*`   | `lot_records` + ficha/cedula + `manual_review`               | Plotify ya tiene datos comerciales, pero falta normalizacion juridica.        |
| `matriz.*`      | `project_legal_data` + dominio/GP                            | Datos del predio matriz no pertenecen al lote individual.                     |
| `sag.*`         | `legal_documents` + `project_legal_data`                     | Certificado y plano respaldan subdivision, no validan dominio/georreferencia. |
| `sii.*`         | `legal_documents` + `lot_legal_data`                         | Roles son por certificado SII y pueden tener vigencia futura.                 |
| `plano.*`       | `legal_documents` + `geometry`                               | Plano respalda informacion topografica y archivo CBR.                         |
| `lote.*`        | `lots` + `geometry`                                          | Numero, superficie oficial, boundaries y servidumbre ya vienen de codigo.     |
| `servidumbre.*` | `geometry` + `lot_legal_data` + plano                        | Codigo redacta tramo, pero debe validar derecho y predios beneficiados.       |
| `transaccion.*` | `lot_records` + `payment_instructions`                       | Precio real y liquidacion no deben salir solo de template historico.          |
| `clausulas.*`   | `legal_rule_pack` + aprobacion humana                        | Especialmente exencion de eviccion, RNDA, LGUC, permisos y renuncias.         |
| `mandato.*`     | `notarial_config` / `party_legal_profiles` / `manual_review` | Debe ser limitado y no alterar elementos esenciales.                          |
| `personeria.*`  | `party_legal_profiles` + documentos vigentes                 | Debe validar facultades y vigencia.                                           |
| `evidencia.*`   | `document_evidence`                                          | Cada variable necesita source map con pagina/chunk/fecha/confianza.           |

Variables bloqueantes minimas:

- `vendedor.nombre`, `vendedor.rut`, `vendedor.representantes[]`,
  `personeria.estado_revision`.
- `comprador.nombre`, `comprador.rut`, `comprador.domicilio`,
  `comprador.estado_civil`.
- `matriz.inscripcion_fojas`, `matriz.inscripcion_numero`,
  `matriz.inscripcion_anio`, `matriz.inscripcion_cbr`,
  `evidencia.gravamenes_estado`.
- `sag.certificado_numero`, `sag.certificado_fecha`, `sag.plano_cbr_numero`,
  `sag.plano_cbr_anio`.
- `sii.rol_matriz`, `sii.rol_asignado_lote` o decision `rol_en_tramite`.
- `lote.numero`, `lote.superficie_m2`, `lote.deslindes`,
  `lote.boundaries_official`.
- `servidumbre.aplica`, `servidumbre.superficie_m2`,
  `servidumbre.deslindes_tramo`, `servidumbre.predios_dominantes`.
- `transaccion.precio_numeros`, `transaccion.moneda`,
  `transaccion.forma_pago`, `transaccion.detalle_pago[]`.
- `clausulas.rnda_declaracion`, `clausulas.domicilio_contractual`,
  `clausulas.tribunales_competentes`.

## Deslindes y superficie: corroboracion de codigo

CodeGraph confirma:

- `generateDeslindeText()` usa `numero_lote`, `area_official_m2`, `m2`,
  `servidumbre_m2` y `boundaries_official`.
- La prioridad de superficie es `area_official_m2` si existe y es mayor que
  cero; si no, usa `m2`.
- Cuando no hay boundaries, devuelve placeholders; por tanto la escritura no
  debe pasar gate juridico si faltan deslindes.
- `generateServidumbreText()` usa `ServidumbreAnalysis`, superficie, tramos,
  direccion y consolidacion de edges. Soporta uno o multiples tramos.

Conclusion: deslindes, superficie del lote y texto de servidumbre no deben ser
extraidos por LLM desde escrituras historicas. El LLM puede comparar contra
evidencia, pero la fuente dueña es `geometry`/`lots`.

## Gates del gestor

### Gates bloqueantes

- `geometry_verified`: lote tiene numero, superficie oficial, deslindes y
  servidumbre coherentes.
- `title_verified`: dominio vigente/GP respaldan vendedor y matriz.
- `sag_verified`: certificado SAG y plano archivado existen, sin usar SAG para
  validar dominio ni derecho de servidumbre.
- `sii_verified`: rol matriz y rol lote estan resueltos, o existe decision
  aprobada de `rol_en_tramite`.
- `party_verified`: partes, RUT, domicilios, estado civil y personeria pasan.
- `price_verified`: precio, moneda, forma de pago, recibo y saldos cuadran.
- `rnda_verified`: consulta/constancia vigente existe para comparecientes
  obligados.
- `legal_reviewed`: clausulas de exencion/limitacion de eviccion, renuncias,
  mandato amplio o permisos especiales estan aprobadas por abogado/notaria.

### Conflictos que deben bloquear

- `lots.m2` difiere de `area_official_m2` o de SAG/plano sin decision.
- Deslindes generados no coinciden con plano o escritura base.
- Vendedor no coincide con dominio vigente.
- Rol SII de lote no coincide con certificado o se usa rol matriz por error.
- Precio comercial no coincide con precio final.
- Personeria no acredita facultad de vender/comprar/constituir servidumbre.
- Exencion de eviccion activada sin instruccion expresa.
- RNDA historico usado como si fuera vigente.

## Arquitectura recomendada

### Bounded contexts

- `EscrituraCaseContext`: caso por lote/comprador/template, estado y readiness.
- `EvidenceContext`: documentos fuente, paginas, chunks, vigencia y source map.
- `VariableResolutionContext`: resolvers deterministicos y extraccion asistida.
- `LegalRulePackContext`: reglas chilenas versionadas y clausulas permitidas.
- `DocumentGenerationContext`: render, snapshots, historial y revision.

### Servicios de dominio

- `EscrituraCaseService`: crea caso, cambia estado y coordina resolucion.
- `EvidenceService`: adjunta documentos y mantiene `document_evidence`.
- `VariableResolutionService`: arma `VariableBundle` con estados.
- `ReadinessGateService`: aplica gates bloqueantes/advertencias.
- `LegalClausePolicyService`: decide clausulas por rule pack y aprobaciones.
- `TemplateAssemblyService`: renderiza solo despues de readiness.

### Modelos nuevos sugeridos

| Modelo                 | Responsabilidad                                                  |
| ---------------------- | ---------------------------------------------------------------- |
| `escritura_cases`      | Caso por proyecto/lote/comprador/template y estado.              |
| `legal_documents`      | Documento fuente, tipo, fecha, vigencia, hash, archivo, emisor.  |
| `document_evidence`    | Variable -> documento -> pagina/chunk -> confianza -> estado.    |
| `project_legal_data`   | Dominio matriz, SAG, plano CBR, rol matriz y reglas de proyecto. |
| `lot_legal_data`       | Rol lote, estado SII, restricciones, servidumbres y notas CBR.   |
| `party_legal_profiles` | Personas, sociedades, representantes, poderes y vigencias.       |
| `payment_instructions` | Precio final, moneda, tramos, custodia, vales vista y saldo.     |
| `notarial_config`      | Notaria, ciudad, domicilio contractual, mandatario y estilo.     |
| `legal_rule_packs`     | Version de normas/clausulas y fecha de vigencia.                 |

## Contrato de resolucion

```json
{
  "canonical_variable": "lote.deslindes",
  "value": "[texto legal]",
  "status": "resolved",
  "future_source": "geometry",
  "source_table": "lots",
  "source_field": "boundaries_official",
  "evidence": [
    {
      "source_type": "code",
      "source_id": "generateDeslindeText",
      "status": "geometry_verified"
    },
    {
      "source_type": "legal_document",
      "document_type": "plano",
      "page_number": 1,
      "chunk_id": "[chunk_id]",
      "status": "corroborated"
    }
  ],
  "confidence": 0.95,
  "blocking": true
}
```

Estados validos:

- `resolved`: valor listo.
- `derived`: valor derivado deterministicamente.
- `missing`: falta fuente.
- `conflict`: fuentes contradictorias.
- `manual_review`: decision juridica u operativa.
- `not_applicable`: no aplica al caso.

## Logica del template inicial

El template debe obedecer tres reglas:

1. Redaccion juridica sobria, formal y numerada.
2. Todo dato no resuelto queda en corchetes `[variable]`.
3. Ninguna clausula juridicamente riesgosa se renderiza como aprobada por
   defecto.

El prompt base del motor debe incorporar:

```text
Actua como abogado senior especialista en Derecho Civil chileno y practica
notarial. Todo borrador debe regirse por el Codigo Civil de Chile, la Ley sobre
Efecto Retroactivo de las Leyes y normativa de Conservadores de Bienes Raices.
Aplica clausulas de estilo para tribunales chilenos. Incluye comparecencia,
personeria, liquidacion de precio, saneamiento/exencion de eviccion segun
aprobacion, y determinacion de domicilio. Redacta en lenguaje juridico formal,
claro, sobrio y estructurado en parrafos numerados. Deja en corchetes [ ] los
datos variables que requieran ser llenados o aprobados.
```

## Decision de arquitectura

El gestor no debe ser "un LLM que redacta escrituras". Debe ser un sistema de
expediente, evidencia y gates:

- El codigo actual conserva la responsabilidad de geometria, deslindes y
  servidumbre.
- El MCP/lab sirve para descubrir estructura, variables y evidencia, no como
  fuente productiva directa.
- La produccion futura debe crear modelos legales propios antes de generar
  escrituras reales.
- El template inicial se puede generar desde bloques, pero solo con snapshots de
  variables y evidencia.

## Proximos pasos implementables

1. Convertir este estudio en una tarea SDD separada para modelo productivo de
   `escritura_cases` y `document_evidence`.
2. Crear `LegalRulePack` versionado con referencias LeyChile y clausulas
   aprobadas.
3. Implementar resolvers deterministicos para `lote`, `servidumbre`, `comprador`
   y `transaccion`.
4. Definir ingestion productiva de documentos legales del proyecto/lote.
5. Probar el template con un caso real de lote usando datos con evidencia y
   gates, no solo texto historico.
