# Research: Creador de Matriz y Minuta DOCX

**Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

Cada decision registra alternativas evaluadas y la razon de la eleccion.
Fuentes primarias revisadas en codigo: `escritura_readiness.py` (snapshot),
`legal_variable_catalog.py` (catalogo + gates), `document_engine.py`/
`document_generator.py` (MVP de referencia), `lots`/`lot_records` (data
operacional), `labs/labs_escrituras/docs/template-draft.md` (template golden
del abogado, 20 clausulas), handoffs SDD 007/009.

## D1. Formato fuente de clausulas: ProseMirror JSON canonico

**Decision**: ProseMirror JSON es la unica fuente de verdad del contenido de
clausulas. Export a DOCX via pipeline explicito server-side. No hay HTML/Jinja
persistido.

**Rationale**: Los tokens de variables necesitan atributos estructurados
(`variableKey`, `label`, `state`, `evidenceId`) y nodos de bloque para los
textos aprobados de titulo; HTML/Jinja los degrada a strings re-parseables
(la clase de bug que SDD 009 acaba de eliminar con los bloques narrativos).
ProseKit (`@prosekit/*` ya instalado) edita ProseMirror JSON nativamente con
nodos custom. Recomendado por ambos handoffs.

**Alternativas rechazadas**: (a) HTML/Jinja canonico con edicion visual —
re-parseo fragil, sin atributos confiables; (b) almacenamiento dual — dos
fuentes de verdad divergen, costo de sincronizacion permanente.

## D2. Esquema de documento ProseMirror: nodos custom minimos

**Decision**: Schema con cuatro nodos custom sobre la base doc/paragraph/text:

- `variable_token` (inline, atomico): atributos `variableKey`, `label`. El
  estado y la evidencia NUNCA se persisten en el JSON — se resuelven contra
  el snapshot al renderizar (el estado cambia con el caso, no con la
  plantilla).
- `block_token` (bloque, atomico): para `titulo.comparecencia_vendedor_texto`
  y `titulo.clausula_primero_texto`. Texto aprobado, no editable inline.
- `repeat_section` (bloque contenedor): atributo `arrayKey`
  (`titulo.inscripciones[]`, `titulo.propietarios[]`,
  `vendedor.representantes[]`, `transaccion.detalle_pago[]`) e `itemTemplate`
  interno con tokens relativos al item (`item.fojas`, `item.numero`); los
  numeros registrales renderizan en palabras via el conversor compartido.
- `conditional_section` (bloque contenedor): atributo `conditionKey`
  (`servidumbre.aplica`, `personeria.aplica`,
  `clausulas.exencion_eviccion_aprobada`) — la clausula se omite cuando la
  condicion es falsa, con regla declarada (omit | block) para FR de arrays
  vacios.

**Rationale**: Es el conjunto minimo que cubre las 20 clausulas del template
golden. Mas nodos = mas superficie de export DOCX que mantener.

**Alternativas rechazadas**: marks en vez de nodos para tokens (no son
atomicos, se parten al editar); logica condicional en texto Jinja embebido
(invisible para el editor y para la validacion de catalogo).

## D3. Puente de datos operacionales (cierra el gap de produccion)

**Decision**: Nuevo servicio `escritura_operational_bridge.py` en `apps/api`
que corre al crear el caso de escritura (y on-demand al re-evaluar): lee
`lot_records` (cliente_nombre/run/direccion/estado_civil/ocupacion,
valor/abono/saldo), `lots` (numero_lote, area_official_m2,
superficie_neta_m2, area_ha, boundaries_official JSONB {north,south,east,
west}, legal_deslinde_text, servidumbre_m2/ancho/analysis) y
`organization_payment_info`, y **propone** variables via
`LegalVariableResolutionService` (mismo staging de SDD 007/009):

| Variable                                                            | Fuente                                                                    | source_type          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------- |
| `comprador.nombre/rut/domicilio/estado_civil/profesion_giro`        | `lot_records.cliente_*`                                                   | `system`             |
| `transaccion.precio_numeros/moneda`                                 | `lot_records.valor` + moneda org                                          | `system`             |
| `transaccion.precio_letras`                                         | derivada de precio_numeros                                                | `derived`            |
| `transaccion.forma_pago/detalle_pago[]/saldo_pendiente`             | `lot_records.abono/saldo` + `organization_payment_info`                   | `system`             |
| `lote.numero/numero_nombre`                                         | `lots.numero_lote`                                                        | `system`             |
| `lote.superficie_m2`                                                | `lots.area_official_m2` (fallback superficie_neta_m2)                     | `geometry`           |
| `lote.superficie_texto/superficie_ha_texto`                         | derivadas en palabras                                                     | `derived`            |
| `lote.deslindes`                                                    | compuesto desde `boundaries_official` (o `legal_deslinde_text` si existe) | `geometry`           |
| `lote.boundaries_official`                                          | `lots.boundaries_official` (JSON)                                         | `geometry`           |
| `servidumbre.aplica/superficie_m2/superficie_texto/deslindes_tramo` | `lots.servidumbre_*`                                                      | `geometry`/`derived` |

Reglas: idempotente por hash de fila fuente (mismo patron que el agente de
titulo); cambio en fila fuente ⇒ supersede + nueva propuesta; jamas toca
valores `approved`; faltantes quedan `missing` listados por su gate.

**Rationale**: Es el unico camino a produccion para `party/price/
geometry_verified` (hoy sin productor); reusa la maquinaria de estados y
auditoria existente en vez de que la matriz lea tablas operacionales en
caliente (lo que romperia la regla snapshot-only). El MVP
(`document_engine.resolve_variables`) ya demostraba el mapeo campo a campo —
esto lo formaliza con auditoria.

**Alternativas rechazadas**: (a) leer lots/lot_records directo en el builder
— viola la frontera de snapshots y elude revision; (b) exigir digitacion
manual — inviable operacionalmente, fuente de errores de transcripcion (la
clase de error que todo el sistema combate).

## D4. Conversor de palabras compartido

**Decision**: `services/legal_title_words.py` (SDD 009) es el unico motor
numero/fecha/RUT→palabras del dominio legal. SDD 008 lo consume para:
`transaccion.precio_letras`, `lote.superficie_texto/ha_texto`,
`servidumbre.superficie_texto` y las referencias registrales de
`repeat_section` sobre `titulo.inscripciones[]`. Si una clausula necesita un
formato nuevo (p. ej. pesos chilenos con "pesos"), se agrega como funcion
nueva en ese modulo con tests, no como copia local.

**Rationale**: El usuario pidio explicitamente aprovechar lo construido por
el agente; un solo motor evita divergencias "mil trescientos" vs "1.300" en
el mismo documento. El fact-checker de bloques (SDD 009) ya valida contra ese
mismo motor.

## D5. Pipeline DOCX: ProseMirror JSON → python-docx, server-side

**Decision**: Nuevo `services/matriz_docx_renderer.py`: recibe el ProseMirror
JSON **ya resuelto** (tokens sustituidos desde el snapshot por un paso previo
de resolucion en el API) y lo convierte a DOCX con python-docx (estilos:
titulo de clausula en negrita corrida, numeracion legal "PRIMERO:",
parrafos justificados, sin tablas). Nodos desconocidos ⇒ error explicito con
lista de nodos (edge case del spec). El DOCX nunca se construye en el
frontend.

**Rationale**: python-docx ya esta en requirements y el formato minuta es
tipograficamente simple (parrafos numerados); el MVP `generate_docx` (texto
plano linea a linea) confirma viabilidad pero es insuficiente en fidelidad —
se reemplaza, no se extiende. Server-side garantiza que la generacion sale
del snapshot + version aprobada (FR-011) y no del estado vivo del editor.

**Alternativas rechazadas**: (a) docx desde HTML (html2docx/pandoc) — nueva
dependencia pesada y pierde atributos; (b) front-end docx (docx.js) — no
puede garantizarse generacion solo-desde-snapshot; (c) WeasyPrint PDF — la
notaria exige DOCX editable (ADR-009).

## D6. Resolucion de tokens y trazabilidad

**Decision**: Un solo resolutor server-side `matriz_token_resolution.py`:
entrada = ProseMirror JSON de la version de matriz + `variable_snapshot` +
`evidence_snapshot`; salida = JSON resuelto + manifiesto de resolucion
`[{variableKey, status: resolved|missing|blocked, evidenceRef?}]`. El mismo
resolutor alimenta (a) la vista "resuelto" del builder, (b) la vista
evidencia, (c) la generacion DOCX y (d) el bloqueo de aprobacion (FR-007).

**Rationale**: Cuatro consumidores, una sola semantica de resolucion. Si el
builder web resolviera por su cuenta, la vista previa y el DOCX podrian
divergir — el bug clasico de los generadores de documentos.

## D7. Modelo de plantillas y matriz por caso

**Decision**: Tres niveles (detalle en data-model.md):

1. `escritura_templates` + `escritura_template_clauses`: biblioteca por
   organizacion, versionada por publicacion (publicar = nueva version
   inmutable; draft editable). Clausulas con `fixed_position`,
   `condition_key`, `alert_tipo` (contrato de alertas) y `orden`.
2. `escritura_matrices`: instancia por caso de escritura — referencia a
   template version + snapshot id + overrides (orden, clausulas
   agregadas/quitadas, texto local de clausulas editadas), estado
   draft/legal_review_pending/approved/superseded, `version` entera para
   optimistic locking.
3. `escritura_minuta_generations`: registro inmutable por generacion (matriz
   version, snapshot id, template version, hash, storage ref, warning ack).

**Rationale**: Separa la biblioteca legal reutilizable (cambia poco, la
gobierna el abogado) de la instancia por caso (cambia por venta). La
inmutabilidad por publicacion da el FR-002 sin copias defensivas.

**Alternativas rechazadas**: extender `generated_documents`/`templates` del
MVP — esquema plano Jinja sin versionado ni RLS coherente con SDD 007;
queda como referencia y se retira de la UI.

## D8. Contrato de alertas → clausulas obligatorias

**Decision**: La tabla del addendum SDD 009 se materializa como columna
`alert_tipo` en `escritura_template_clauses`. Al validar aprobacion de la
matriz: para cada alerta `clause_added` del snapshot
(`titulo.alertas_resueltas[]`), debe existir en la matriz al menos una
clausula activa con ese `alert_tipo`; si falta, blocker con nombre de
clausula y tipo. `dismissed_with_reason` muestra la razon en el sidebar;
`acknowledged` no obliga.

## D9. Concurrencia y supersesion de snapshot

**Decision**: `escritura_matrices.version` (entero) con compare-and-swap en
cada guardado (HTTP 409 al perder la carrera). El snapshot id vigente del
caso se compara en cada guardado y generacion: si el caso re-snapshoteo, el
guardado avisa (reload requerido) y la generacion se rechaza server-side
(FR-014). La aprobacion previa queda en historial (status superseded en la
fila de aprobacion, no se borra).

## D10. Disposicion de las paginas MVP `/documentos`

**Decision**: `plantillas/`, `bloques/` y `generar/` se reemplazan por la
nueva ruta `matriz/` (builder) + `plantillas/` nueva (biblioteca de clausulas
versionada). `historial/` se conserva y pasa a listar
`escritura_minuta_generations`. `document_engine.py`/`document_generator.py`
quedan sin rutas que los invoquen y se eliminan al final (tarea de limpieza),
manteniendo `generated_documents` como tabla legacy de solo lectura.

## D11. Claves de catalogo nuevas requeridas por el template golden

**Decision**: Agregar al catalogo (grupo, clave): `comprador.nacionalidad`;
`documento.notaria.jurisdiccion`; `clausulas.ocupantes_excepciones`;
`clausulas.exencion_eviccion_texto`; `clausulas.entrega_fecha`;
`clausulas.gastos_excepciones`; `evidencia.gravamenes_excepciones`;
`evidencia.certificado_gp_referencia`; `personeria.delegacion_facultades`.
**Claves de presentacion** (NO se agregan al catalogo, NO se almacenan): son
redacciones en prosa de datos que YA existen aprobados en el snapshot; el
resolutor (`matriz_token_resolution`) las compone deterministicamente en el
momento del render, con el motor de palabras compartido (D4):

- `vendedor.representantes_texto` ← compuesta desde el arreglo aprobado
  `vendedor.representantes[]` (nombre + RUT en palabras por representante).
  Almacenarla como variable propia crearia dos fuentes de verdad para el
  mismo hecho: si el abogado corrige un RUT en el arreglo, el texto
  almacenado quedaria desactualizado en silencio — la misma clase de
  divergencia que SDD 009 elimino en los bloques narrativos. Derivada,
  siempre refleja el arreglo vigente.
- `proyecto.nombre` ← dato operacional trivial resuelto desde el contexto
  del caso (fila del proyecto); no es una variable juridica revisable.

Mapeos (tampoco crean clave): `sii.rol_asignado_lote` del template se mapea
a la clave existente `sii.rol_avaluo_definitivo` (con fallback al texto en
tramite).

**Rationale**: El template golden es el contrato legal; el catalogo es el
contrato tecnico — esta lista es su reconciliacion exacta, validada por
FR-015 en tiempo de autoria. Criterio de la division: si el dato es una
verdad independiente que un humano debe revisar/aprobar ⇒ catalogo; si es
formato/redaccion de verdades ya aprobadas ⇒ derivada del resolutor (mismo
principio que `transaccion.precio_letras` desde `precio_numeros` y las
referencias registrales desde `titulo.inscripciones[]`).
