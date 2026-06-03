# Escrituras Lab: Logica del Gestor de Escrituras

Propuesta de arquitectura para pasar desde datos operacionales y documentos legales a un borrador de escritura publica de compraventa de lote rural en Chile. El gestor no sustituye revision legal: organiza evidencia, resuelve variables y bloquea borradores incompletos o juridicamente riesgosos.

## Objetivo

Generar un expediente de escritura por lote/comprador que produzca:

1. `VariableBundle`: variables canonicas listas, faltantes, en conflicto o pendientes de revision.
2. `EvidenceMap`: trazabilidad de cada variable a tabla, documento, pagina/chunk, certificado o decision humana.
3. `LegalChecklist`: cumplimiento minimo para compraventa, subdivision, dominio, roles, servidumbres, precio, RNDA, personeria y cierre notarial.
4. `TemplateDraft`: borrador numerado con datos variables entre corchetes cuando falten o requieran aprobacion.
5. `ReviewPacket`: lista clara de decisiones para abogado/notaria/operador.

## Principios de diseno

- **Fuente antes que redaccion**: el LLM redacta y normaliza, pero no crea hechos juridicos.
- **Trazabilidad obligatoria**: cada variable relevante debe indicar origen, fecha, documento y confianza.
- **Gates por riesgo**: superficie, deslindes, dominio, roles, personeria, precio y RNDA bloquean la emision si no estan verificados.
- **Separacion de dominio**: datos de venta, geometria, antecedentes legales y clausulado son contextos distintos.
- **Versionamiento**: cada borrador conserva `variables_snapshot`, template, rule pack y documentos fuente usados.
- **Revision humana visible**: el sistema debe decir que falta y por que, no esconderlo bajo texto fluido.

## Contextos del dominio

| Contexto                    | Responsabilidad                                      | Entradas principales                                                     |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `SalesContext`              | Comprador, precio, forma de pago, estado comercial   | `lot_records`, `lots.precio`, instrucciones de pago                      |
| `LotGeometryContext`        | Superficie, deslindes, servidumbre, plano operativo  | `lots`, geometria, `generateDeslindeText()`, `generateServidumbreText()` |
| `ProjectLegalContext`       | Dominio matriz, SAG, plano CBR, roles, restricciones | dominio vigente, SAG, SII, GP, planos                                    |
| `PartyLegalContext`         | Vendedor, representantes, poderes, compradores       | fichas juridicas, cedulas, escrituras sociales, poderes                  |
| `ClausePolicyContext`       | Clausulas permitidas, obligatorias y opcionales      | rule pack juridico, template aprobado                                    |
| `DocumentGenerationContext` | Render, snapshot, revisiones, auditoria              | `document_templates`, `generated_documents`, evidence map                |

## Modelo conceptual

| Entidad              | Descripcion                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EscrituraCase`      | Caso por proyecto/lote/comprador; contiene estado, prioridad, lote, comprador y template objetivo.                                                                          |
| `VariableBundle`     | Variables canonicas agrupadas por `documento`, `vendedor`, `comprador`, `matriz`, `sag`, `sii`, `lote`, `servidumbre`, `transaccion`, `clausulas`, `mandato`, `personeria`. |
| `VariableResolution` | Resultado por variable: valor, fuente, confianza, estado, fecha, evidencia y mensajes.                                                                                      |
| `EvidenceItem`       | Documento o dato fuente con `source_type`, `source_id`, pagina/chunk, fecha de emision, vigencia y texto relevante.                                                         |
| `LegalRulePack`      | Reglas chilenas de compraventa, tradicion por inscripcion, subdivision rural, clausulas notariales y warnings.                                                              |
| `ReadinessGate`      | Validacion bloqueante o advertencia para pasar a borrador.                                                                                                                  |
| `ReviewDecision`     | Aprobacion/rechazo/correccion humana con motivo y usuario responsable.                                                                                                      |
| `GeneratedEscritura` | Borrador renderizado con snapshots y version de template/rule pack.                                                                                                         |

## Estados del caso

| Estado                | Significado                                                |
| --------------------- | ---------------------------------------------------------- |
| `intake`              | Caso creado con lote/comprador, sin resolver antecedentes. |
| `collecting_sources`  | Se estan cargando dominio, SAG, SII, poderes, GP y pagos.  |
| `resolving_variables` | El gestor normaliza fuentes y propone variables.           |
| `needs_review`        | Hay datos faltantes, conflicto o decision juridica.        |
| `ready_for_draft`     | Todos los gates bloqueantes pasaron.                       |
| `draft_generated`     | Existe borrador con snapshot y evidencia.                  |
| `legal_review`        | Abogado/notaria revisa clausulas y datos.                  |
| `approved_for_notary` | Borrador listo para flujo notarial.                        |
| `blocked`             | Falta fuente critica o hay inconsistencia no resuelta.     |

## Pipeline de resolucion

1. **Crear caso**
   - Entrada minima: `project_id`, `lot_id`, `lot_record_id`, `template_id`.
   - Snapshot inicial: estado comercial, lote, geometria y documentos disponibles.

2. **Recolectar fuentes**
   - Consultar `lots` y `lot_records`.
   - Adjuntar dominio vigente, certificado de gravamenes/prohibiciones, certificado SAG, plano archivado, roles SII, poderes/personeria, RNDA e instrucciones de pago.
   - Asociar cada fuente a `legal_documents` con fecha, tipo, vigencia y archivo.

3. **Resolver variables**
   - Usar resolvers deterministicos para campos estructurados.
   - Usar LLM solo para extraccion asistida desde documentos procesados y para proponer redaccion.
   - Guardar `VariableResolution` por cada variable con estado:
     - `resolved`
     - `missing`
     - `conflict`
     - `manual_review`
     - `derived`

4. **Validar gates**
   - Ejecutar gates tecnicos, juridicos y comerciales.
   - Cualquier gate bloqueante deja el caso en `needs_review` o `blocked`.

5. **Renderizar borrador**
   - Solo si gates bloqueantes pasaron.
   - Las variables no bloqueantes pendientes se dejan en corchetes `[ ]`.
   - Guardar `variables_snapshot`, `evidence_snapshot`, `template_version` y `rule_pack_version`.

6. **Revision legal**
   - Abogado/notaria revisa personeria, precio, clausulas especiales, exencion/limitacion de eviccion, RNDA, mandato y cierre.
   - Toda correccion humana se guarda como `ReviewDecision`.

7. **Cierre**
   - El gestor emite paquete final para notaria y CBR: borrador, evidencia, certificados, checklist y observaciones.

## Resolvers principales

| Resolver               | Entradas                                      | Salidas                              | Bloquea si                                   |
| ---------------------- | --------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `LotIdentityResolver`  | `lots.numero_lote`, proyecto                  | `lote.numero`, `lote.numero_nombre`  | no hay lote o numero.                        |
| `SurfaceResolver`      | `lots.area_official_m2`, `lots.m2`, SAG/plano | `lote.superficie_m2`, textos         | difiere de certificado/plano sin aprobacion. |
| `BoundaryResolver`     | `lots.boundaries_official`, geometria         | `lote.deslindes`                     | no hay `verified_status` suficiente.         |
| `ServidumbreResolver`  | `lots.servidumbre_m2`, geometria              | `servidumbre.*`                      | area/trazado no coincide con plano.          |
| `BuyerResolver`        | `lot_records.cliente_*`                       | `comprador.*`                        | falta nombre o RUT.                          |
| `SellerResolver`       | `party_legal_profiles`, dominio               | `vendedor.*`                         | vendedor no coincide con dominio.            |
| `TitleResolver`        | dominio vigente, GP                           | `matriz.*`, `evidencia.gravamenes_*` | dominio/GP ausente o vencido.                |
| `SagResolver`          | certificado SAG, plano CBR                    | `sag.*`, warnings DL 3.516/LGUC      | certificado/plano ausente.                   |
| `SiiRolesResolver`     | certificado roles                             | `sii.*`, `lote.rol_tramite`          | rol requerido ausente o contradictorio.      |
| `PaymentResolver`      | `lot_records.valor`, pagos                    | `transaccion.*`                      | precio/forma pago no conciliado.             |
| `PersoneriaResolver`   | poderes/escrituras sociales                   | `personeria.*`                       | facultades insuficientes o no vigentes.      |
| `ClausePolicyResolver` | rule pack + decisiones                        | `clausulas.*`                        | clausula de riesgo sin aprobacion.           |

## Gates bloqueantes

### Geometria y lote

- `lots.verified_status` debe permitir uso documental.
- `lote.superficie_m2` debe provenir de `area_official_m2` o estar conciliada con plano/SAG.
- `lote.deslindes` debe existir para todos los rumbos juridicamente requeridos.
- Si `servidumbre.aplica`, debe existir superficie, trazado y descripcion del tramo.

### Titulos y antecedentes

- Dominio del vendedor debe estar vigente y coincidir con el predio matriz.
- Certificado de gravamenes/prohibiciones/litigios debe estar vigente o marcado para revision.
- Certificado SAG y plano archivado deben respaldar la subdivision.
- Certificado SII debe respaldar rol matriz y rol asignado o dejar `rol en tramite` con decision expresa.

### Partes y personeria

- Comprador y vendedor deben tener nombre, RUT, domicilio y capacidad basica.
- Si hay sociedad, la personeria debe acreditar representacion y facultad para vender, comprar, constituir servidumbres, recibir precio y suscribir rectificaciones.
- Estado civil del comprador debe estar resuelto o revisado.

### Precio y pago

- Precio numerico, moneda, precio en palabras y forma de pago deben coincidir.
- Los pagos con UF, vales vista, custodia o saldo pendiente requieren detalle estructurado.
- Renuncias resolutorias/redhibitorias o finiquitos deben tener instruccion expresa.

### Clausulas de riesgo

- Exencion o limitacion de eviccion no puede activarse automaticamente.
- Clausulas de destino rural, LGUC/DL 3.516 y permisos deben estar presentes cuando el predio sea rustico.
- RNDA debe consultarse o dejarse como requisito pendiente antes del otorgamiento.

## Rule pack juridico minimo

El `LegalRulePack` debe contener reglas y textos aprobados para:

- Compraventa de inmueble por escritura publica.
- Tradicion por inscripcion conservatoria.
- Precio cierto y liquidacion.
- Venta como cuerpo cierto/ad-corpus y tratamiento de cabida.
- Saneamiento de eviccion y vicios redhibitorios.
- Clausula opcional de exencion o limitacion de eviccion con revision legal obligatoria.
- Servidumbres activas y pasivas.
- Predios rusticos, DL 3.516, Ley 18.755 art. 46, LGUC arts. 55 y 56.
- Reglamento del Registro Conservatorio de Bienes Raices.
- RNDA Ley 21.389 cuando corresponda.
- Domicilio contractual y tribunales chilenos.
- Mandato de rectificacion limitado.
- Ley sobre Efecto Retroactivo y Codigo Civil art. 9 como criterio temporal del rule pack.

## Integracion con el codigo actual

El codigo existente ya entrega piezas clave:

- `EscrituraVariables` define una primera estructura de variables documentales.
- `DocumentVariablesGroup` acepta grupos de variables anidados para generacion.
- `generateDeslindeText()` resuelve texto legal de lote desde `lots`.
- `generateServidumbreText()` resuelve texto de servidumbre desde analisis geometrico.
- `generated_documents.variables_snapshot` ya permite versionar variables usadas.

La brecha esta en el expediente legal y la evidencia:

- Falta modelo persistente para antecedentes legales del proyecto y lote.
- Falta trazabilidad variable -> documento -> pagina/chunk.
- Falta resolver/gate para personeria, dominio, SAG, SII, RNDA y precio complejo.
- Falta estado de preparacion de escritura por lote.

## Cambios de arquitectura recomendados

### Capa de dominio

- `EscrituraCaseService`: orquesta caso y estados.
- `VariableResolutionService`: ejecuta resolvers y consolida bundle.
- `EvidenceService`: administra documentos fuente y trazabilidad.
- `ReadinessGateService`: aplica validaciones bloqueantes y advertencias.
- `LegalClausePolicyService`: decide clausulas por jurisdiccion, tipo de lote y aprobaciones.

### Puertos

- `LotRepository`
- `LotRecordRepository`
- `LegalDocumentRepository`
- `PartyLegalProfileRepository`
- `TemplateRepository`
- `GeneratedDocumentRepository`
- `LLMExtractionPort`
- `LegalReviewPort`

### Adaptadores

- Supabase/Postgres para datos productivos.
- MCP Plotify Escrituras para laboratorio y analisis de PDFs.
- Motor actual de documentos para render.
- Parser/OCR/vector store para documentos legales.
- UI web para revision y aprobacion.

## Esquema sugerido de readiness

```json
{
  "case_id": "[escritura_case.id]",
  "status": "needs_review",
  "blocking": [
    {
      "code": "missing_personeria",
      "message": "Falta poder vigente del representante del vendedor",
      "variables": ["personeria.poder_texto", "vendedor.representantes"]
    }
  ],
  "warnings": [
    {
      "code": "rol_in_tramite",
      "message": "El lote no tiene rol SII asignado; se renderizara como rol en tramite si abogado aprueba"
    }
  ],
  "verified": ["lote.superficie_m2", "lote.deslindes", "servidumbre.superficie_m2"]
}
```

## Mision del template

El template inicial no debe ser solo un texto bonito. Debe ser una pieza gobernada por evidencia:

- Si el dato existe y esta verificado, se renderiza.
- Si falta, queda en `[variable]` y el caso no pasa gate cuando es critico.
- Si hay conflicto, se bloquea y muestra fuentes contradictorias.
- Si es una decision juridica, se pide aprobacion humana.
- Si el LLM propone, el sistema exige fuente y no lo convierte en verdad sin validacion.

Con esta logica, Plotify puede convertir su motor de deslindes/superficie en un gestor integral de escrituras de compraventa: operativo, trazable y compatible con practica notarial chilena.
