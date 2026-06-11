# Feature Specification: Mesa de Escritura — Consolidacion UX Legal

**Feature Branch**: `[010-mesa-escritura]`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "El backend del SDD 008 funciona, pero la
interfaz del creador de matriz es tecnicista e inusable para los usuarios
reales (duenos de proyecto, administradores y abogados): exige editar JSON,
habla de tokens/blockers/gates/snapshots, muestra claves crudas y estados en
ingles, y fragmenta la escritura en clausulas aisladas. Replantear la capa de
presentacion como una 'mesa de escritura': la escritura completa como un
documento continuo y legible, datos resaltados con su estado, evidencia a un
click, pendientes en lenguaje humano con accion directa, edicion de texto en
contexto, e insercion de datos mediante un buscador con nombres humanos —
sin JSON visible en ninguna pantalla, jamas."

## Context

SDD 008 quedo implementado completo (37/37 tareas, commit `04974d3`): cuatro
tablas, puente operacional, resolutor de tokens, render DOCX, workflow de
revision juridica, RLS y suites verdes. El veredicto de producto (2026-06-11)
es que **el motor sirve y la cabina no**: la capa de presentacion en
`apps/web/src/components/documents/matriz/` se construyo como espejo del API
y es inusable para los tres perfiles que operan Plotify.

Evidencia concreta del problema:

- `template-clause-form.tsx` exige escribir ProseMirror JSON crudo en un
  textarea, mas campos `condition_key`/`condition_mode`/`alert_tipo`.
- El builder muestra jerga del API: "Blockers", "Tokens resueltos", claves
  crudas (`comprador.nombre`), estados en ingles (`resolved`), tipos de
  alerta crudos (`dl_3516`), mensajes tipo "Gate party_verified".
- El editor presenta una clausula a la vez; el abogado piensa en la
  escritura completa y la lee de corrido como leeria el papel.
- Las vistas Template/Resuelto/Evidencia son tabs que espejan el manifiesto
  de resolucion; el modelo mental del abogado es una sola vista (el texto
  real) con "ver de donde salio este dato" a un click.

SDD 010 reemplaza la capa de presentacion **sin tocar el motor**: mismas
tablas, mismo resolutor, mismo renderer DOCX, mismo workflow. El API solo se
extiende de forma aditiva (etiquetas y mensajes humanos en el manifiesto).
El SDD 008 ya anticipaba esta fase en sus Assumptions ("Post-SDD 008 queda
la consolidacion UX legal").

**Encuadre de producto (sesion 2026-06-11)**: la matriz vive en dos
niveles. La organizacion mantiene una plantilla general (la actual v1); cada
proyecto tendra una **matriz del proyecto** revisada y aprobada una vez por
el abogado, con los datos de venta como huecos senalizados esperando que un
lote se venda; y cada venta validada por el administrador generara el
**borrador del lote** automaticamente. Ese flujo completo (matriz del
proyecto, creacion automatica del caso al validar la venta, entrega al
vendedor) se especifica en **SDD 011** (`specs/011-venta-escritura/`).
SDD 010 construye la superficie comun a ambos niveles: la mesa que aqui se
especifica por caso es la misma que SDD 011 reutiliza a nivel proyecto.

Reglas de arquitectura heredadas (no negociables):

1. **Snapshot-only**: la mesa consume snapshots, nunca extraccion viva, y
   jamas muta `variable_resolutions`. Toda correccion de datos navega al
   Centro de Control Legal (CCL) y re-snapshotea.
2. **Templates publicados inmutables**; edicion siempre sobre draft/clon.
3. **Generacion DOCX solo server-side** desde matriz aprobada + snapshot
   vigente + warning legal aceptado (ADR-009).
4. **Tenant isolation total** en todo lo nuevo.

Reglas nuevas de este feature (igual de no negociables):

5. **Cero jerga tecnica visible**: ninguna pantalla del flujo de escrituras
   muestra claves crudas, las palabras "token", "blocker", "snapshot",
   "gate", estados en ingles, ni codigos de alerta. Un diccionario de
   microcopy unico gobierna todos los textos.
6. **Cero JSON visible**: ningun usuario ve, escribe o pega JSON en ninguna
   superficie del flujo, incluida la autoria de plantillas.
7. **Los journeys y wireframes se aprueban antes de codificar** y los
   criterios de usabilidad se validan con una persona real, no solo con
   tests automatizados.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Leer y revisar la escritura como documento continuo (Priority: P1)

Como abogado revisor, quiero abrir el caso y leer la escritura completa como
un documento continuo con los valores reales ya puestos en el texto y cada
dato resaltado con su estado, para revisar el borrador igual que revisaria
el papel, sin aprender conceptos tecnicos.

**Why this priority**: Es el uso diario dominante y el que hoy esta roto.
Sin lectura fluida no hay revision juridica, y sin revision no hay minuta.
Todo lo demas (edicion, plantillas) es secundario frente a poder leer.

**Independent Test**: Con el corpus Teno (caso aprobado + snapshot
completo), un usuario sin contexto tecnico abre la mesa, lee la escritura de
corrido de la comparecencia a las firmas, hace click en el RUT de la
compradora y llega al snippet del documento fuente en un click, todo sin ver
una clave tecnica ni una palabra en ingles.

**Acceptance Scenarios**:

1. **Given** un caso de escritura con snapshot completo, **When** el abogado
   abre la mesa, **Then** ve la escritura completa en una sola superficie
   continua, con clausulas numeradas en orden y los valores reales en el
   texto (vista resuelta por defecto, nunca claves entre corchetes).
2. **Given** la vista por defecto, **When** el abogado observa un dato,
   **Then** distingue visualmente verificado / por revisar / falta sin leer
   ninguna clave tecnica, y los estados estan escritos en espanol.
3. **Given** cualquier dato del texto, **When** el abogado hace click,
   **Then** ve en contexto (popover/panel) el valor, el nombre humano del
   dato, el snippet del documento fuente con su pagina, y un boton "Corregir
   en Centro de Control Legal" — maximo 1 click desde el texto.
4. **Given** un bloque aprobado del estudio de titulo (comparecencia del
   vendedor, clausula PRIMERO), **When** se muestra en la mesa, **Then** se
   distingue como contenido aprobado no editable, con explicacion de por que
   esta bloqueado y enlace al panel de titulo.
5. **Given** una clausula condicional que no aplica (ej. sin servidumbre),
   **When** el abogado revisa el documento, **Then** puede ver por que la
   clausula no aparece, explicado en lenguaje humano.

---

### User Story 2 - Llegada guiada y pendientes accionables (Priority: P1)

Como administrador de proyecto u operador legal, quiero que al abrir un caso
que aun no esta listo la pantalla me diga que falta y donde se corrige, en
mi idioma, para destrabar el caso sin pedir ayuda a soporte ni al
desarrollador.

**Why this priority**: Es la primera pantalla que ve cualquier usuario con
un caso real (los casos nacen incompletos). Si la llegada asusta o no se
entiende, el resto de la mesa nunca se usa.

**Independent Test**: Con un caso con gates bloqueados (ej. falta estado
civil de la compradora y falta la clausula de derechos de aguas), abrir la
ruta de la mesa y verificar que aparece el estado de preparacion con cada
pendiente redactado en lenguaje humano, su explicacion de donde se corrige y
un enlace directo que navega al lugar correcto.

**Acceptance Scenarios**:

1. **Given** un caso con verificaciones bloqueadas, **When** el usuario abre
   la mesa, **Then** no ve un builder roto ni una matriz parcial: ve un
   estado de preparacion que lista cada pendiente como frase humana
   ("Falta el estado civil de la compradora"), con su causa y un enlace
   "Completar dato" / "Agregar clausula" que navega al destino correcto.
2. **Given** la mesa abierta con pendientes menores, **When** el usuario
   revisa el panel lateral, **Then** ve "Para aprobar falta" con los
   pendientes humanizados y accionables, y un contador visible en el
   encabezado.
3. **Given** el Centro de Control Legal de un proyecto con caso de
   escritura activo, **When** el usuario lo visita, **Then** ve el estado
   del caso (preparacion / borrador / en revision / aprobada / minuta
   generada) y un acceso directo a la mesa de ese caso.
4. **Given** que el expediente cambio mientras la mesa estaba abierta
   (snapshot supersedido), **When** el sistema lo detecta, **Then** el aviso
   explica en lenguaje humano que cambio y ofrece recargar, sin la palabra
   "snapshot".

---

### User Story 3 - Editar el texto y agregar datos en contexto (Priority: P2)

Como redactor legal, quiero editar el texto de las clausulas directamente
dentro del documento y agregar datos del expediente buscandolos por su
nombre ("Nombre de la compradora", "Precio en palabras"), para redactar como
en un procesador de texto sin conocer claves ni estructuras internas.

**Why this priority**: La edicion es frecuente pero ocurre despues de poder
leer (US1) y llegar bien (US2). Sin esto la mesa es de solo lectura, lo que
ya seria mejor que lo actual.

**Acceptance Scenarios**:

1. **Given** una matriz editable, **When** el redactor hace click en el
   texto de una clausula editable, **Then** puede escribir en el lugar, con
   los datos resaltados intactos, y el guardado conserva la deteccion de
   conflictos de version existente.
2. **Given** el redactor escribiendo, **When** invoca "Insertar dato"
   (boton o atajo), **Then** se abre un buscador con los datos del
   expediente listados por nombre humano y agrupados por categoria
   (Compradora, Vendedor, Precio, Lote, Inscripciones), nunca por clave; al
   elegir, el dato queda en el texto con su valor y estado.
3. **Given** un bloque aprobado de titulo, **When** el redactor intenta
   editarlo, **Then** la mesa lo impide y explica donde se corrige ese
   contenido.
4. **Given** clausulas reordenables, **When** el redactor las arrastra desde
   el indice, **Then** el orden persiste y las clausulas fijas no se mueven,
   igual que hoy.

---

### User Story 4 - Aprobar y generar la minuta con lenguaje humano (Priority: P2)

Como abogado, quiero enviar a revision, aprobar y generar la minuta con
pantallas que digan exactamente que va a pasar y que falta, para ejercer el
gate juridico con confianza y sin interpretar codigos.

**Acceptance Scenarios**:

1. **Given** una matriz con pendientes, **When** el usuario intenta enviar a
   revision o generar, **Then** la accion se bloquea mostrando los
   pendientes humanizados y accionables (mismo formato de US2), nunca un
   codigo de error.
2. **Given** una matriz aprobada y vigente, **When** el abogado genera la
   minuta, **Then** ve un resumen previo (caso, version de plantilla, fecha
   del expediente), acepta el warning de revision legal obligatoria y
   descarga el DOCX; la aceptacion queda registrada igual que hoy.
3. **Given** el historial de generaciones, **When** el usuario lo consulta,
   **Then** cada generacion se describe en lenguaje humano (quien, cuando,
   desde que version) con descarga disponible.

---

### User Story 5 - Crear y ajustar plantillas sin JSON (Priority: P3)

Como administrador legal, quiero crear y ajustar las clausulas de una
plantilla escribiendo en un editor de texto e insertando datos desde el
buscador, con condiciones expresadas como frases ("Esta clausula aparece
solo si el lote tiene servidumbre"), para mantener las plantillas sin saber
que existe un formato interno.

**Why this priority**: La autoria de plantillas se usa pocas veces (la v1
publicada ya reproduce el golden del abogado), pero es la superficie con la
peor deuda (JSON en textarea) y debe quedar al nivel del resto.

**Acceptance Scenarios**:

1. **Given** una plantilla en borrador, **When** el administrador edita una
   clausula, **Then** escribe en el mismo editor de texto de la mesa, con
   "Insertar dato" disponible, y en ningun momento ve o escribe JSON.
2. **Given** una clausula condicional, **When** el administrador define su
   regla, **Then** la expresa eligiendo opciones en lenguaje humano (dato +
   condicion) y la regla queda guardada con el mismo efecto que hoy.
3. **Given** una clausula con un dato que no existe en el catalogo, **When**
   intenta guardar, **Then** el error nombra el dato por su texto visible y
   sugiere el dato correcto del catalogo, sin mostrar claves crudas como
   unico identificador.
4. **Given** una plantilla publicada, **When** el administrador quiere
   cambiarla, **Then** el flujo lo lleva a clonar a borrador, explicando que
   las plantillas publicadas no se modifican.

---

### Edge Cases

- Caso sin matriz creada aun: la ruta crea/carga la matriz como hoy (lazy) y
  la llegada guiada decide si mostrar preparacion o mesa.
- Snapshot supersedido con la mesa abierta o a mitad de una edicion: aviso
  humano + recarga; nunca se guarda ni genera desde expediente viejo
  (regla server-side existente intacta).
- Dato resuelto sin evidencia documental (origen operacional, ej. registro
  de venta): el popover muestra el origen ("Registro de venta del Lote 12")
  en lugar de snippet, con su accion de correccion correspondiente.
- Dato faltante dentro del texto: se muestra como hueco senalizado con el
  nombre humano del dato ("estado civil — falta"), contabilizado en
  pendientes; nunca un espacio vacio silencioso.
- Usuario sin permiso de revisor: ve la mesa en lectura y el boton de
  aprobar explica quien puede aprobar.
- Arrays repetibles (N inscripciones, multiples propietarios): el documento
  continuo los muestra ya expandidos como texto real; si el array esta
  vacio donde la clausula lo exige, aparece como pendiente humano.
- Matriz aprobada: toda la mesa queda en lectura con su estado visible;
  editar exige volver a borrador segun el workflow existente.
- Pantallas chicas: la mesa es desktop-first; en anchos menores el panel
  lateral colapsa a un acceso, el documento nunca se corta.
- Dos redactores simultaneos: el conflicto de version se comunica en
  lenguaje humano con opcion de recargar (deteccion existente intacta).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST presentar la matriz como un documento continuo
  unico (todas las clausulas en orden, en una sola superficie desplazable)
  con la vista de valores resueltos por defecto; la vista de estructura con
  huecos de datos existe solo como modo secundario para redaccion.
- **FR-002**: System MUST resaltar cada dato del texto con su estado en
  espanol (verificado / por revisar / falta) de forma visualmente
  distinguible, sin exponer claves tecnicas en ninguna superficie.
- **FR-003**: System MUST mostrar, a un click desde cualquier dato del
  texto, su nombre humano, valor, origen (snippet + pagina + documento
  cuando hay evidencia documental; descripcion del origen operacional
  cuando no), y la accion "Corregir en Centro de Control Legal" — la mesa
  nunca edita el valor de un dato.
- **FR-004**: System MUST ofrecer un panel "Datos de la escritura" agrupado
  por categorias humanas (partes, precio, lote, inscripciones, etc.) usando
  las etiquetas del catalogo canonico, con el estado de cada dato y acceso a
  su evidencia.
- **FR-005**: System MUST entregar los pendientes de aprobacion/generacion
  ya humanizados desde el servidor: cada pendiente con titulo en espanol,
  explicacion de causa, etiqueta de accion y destino navegable (deep link);
  la UI no traduce codigos.
- **FR-006**: System MUST aplicar un diccionario de microcopy unico y
  versionado a todas las superficies del flujo de escrituras (mesa, panel,
  pendientes, workflow, plantillas, historial); las palabras "token",
  "blocker", "snapshot", "gate", claves crudas, codigos de alerta y estados
  en ingles quedan prohibidas en pantalla.
- **FR-007**: System MUST mostrar un estado de preparacion cuando el caso
  tiene verificaciones bloqueadas: lista humana de pendientes con acciones,
  sin renderizar una mesa parcial ni un builder vacio.
- **FR-008**: System MUST permitir editar el texto de las clausulas
  editables directamente dentro del documento continuo, conservando el
  guardado con deteccion de conflictos de version y el limite de edicion
  segun estado del workflow (aprobada = lectura).
- **FR-009**: System MUST ofrecer "Insertar dato" como buscador con nombres
  humanos del catalogo agrupados por categoria, accesible por boton y atajo
  de teclado dentro del editor; el dato insertado queda ligado al expediente
  con su estado visible.
- **FR-010**: System MUST distinguir los bloques aprobados del estudio de
  titulo como contenido bloqueado con explicacion y enlace al panel de
  titulo; las clausulas condicionales omitidas son consultables con su regla
  explicada en lenguaje humano.
- **FR-011**: System MUST conservar el reordenamiento de clausulas con
  posiciones fijas intactas, operable desde el indice del documento.
- **FR-012**: System MUST conducir el workflow (enviar a revision, aprobar,
  rechazar, generar minuta) con resumenes y confirmaciones en lenguaje
  humano, manteniendo el warning legal obligatorio (ADR-009), su registro de
  aceptacion y el gate de revisor autorizado existentes.
- **FR-013**: System MUST permitir la autoria completa de clausulas de
  plantilla sin ver ni escribir JSON: editor de texto rico, insercion de
  datos por buscador, condiciones declaradas eligiendo dato + condicion en
  lenguaje humano, y tipo de alerta elegido de una lista descrita en
  espanol.
- **FR-014**: System MUST expresar los errores de validacion de plantillas
  (datos fuera de catalogo, claves removidas) nombrando el dato por su
  texto visible con sugerencia de reemplazo en lenguaje humano.
- **FR-015**: System MUST integrar la navegacion: acceso directo a la mesa
  desde el caso de escritura en el Centro de Control Legal, contexto de
  proyecto/lote/comprador visible en el encabezado de la mesa, y estados del
  caso unificados (preparacion, borrador, en revision, aprobada, minuta
  generada) con el mismo vocabulario en ambas superficies.
- **FR-016**: System MUST cumplir accesibilidad base: contraste AA en chips
  y estados, navegacion completa por teclado (incluido el popover de
  evidencia y el buscador de datos), focus visible y objetivos tactiles
  adecuados.
- **FR-017**: System MUST mantener sin regresion las reglas del motor:
  consumo exclusivo de snapshots, cero mutacion de variables desde la mesa,
  templates publicados inmutables, generacion server-side con precondiciones
  y aislamiento de tenant; las extensiones de API son exclusivamente
  aditivas.
- **FR-018**: System MUST reemplazar las superficies tecnicas actuales
  (builder de tres columnas, tabs template/resuelto/evidencia, formulario de
  clausula con JSON) como camino de produccion; no queda ninguna ruta de
  usuario final que exponga la UI anterior.

### Key Entities _(include if feature involves data)_

- **Manifiesto humanizado (view-model)**: extension aditiva del manifiesto
  de resolucion existente: por dato, nombre humano, categoria y etiqueta de
  categoria; por pendiente, titulo, causa, etiqueta de accion y destino. No
  es una tabla nueva: es contrato de respuesta.
- **Diccionario de microcopy**: fuente unica versionada de vocabulario del
  flujo de escrituras (estados, acciones, tipos de alerta, mensajes de
  bloqueo), con origen en el servidor para todo lo que nace en el API.
- **Regla de clausula declarativa (presentacion)**: representacion humana de
  la condicion existente de una clausula (dato + condicion), mapeada 1:1 al
  modelo vigente sin cambiar su semantica.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Una persona del perfil real (abogado o administrador, sin
  participacion en el desarrollo) completa la revision del caso Teno limpio
  en menos de 15 minutos sin asistencia, llegando a la evidencia de
  cualquier dato en maximo 2 clicks desde el documento. Se valida en sesion
  observada y queda registrada en el quickstart.
- **SC-002**: Cero apariciones de jerga tecnica en pantalla en todo el flujo
  de escrituras: claves crudas, "token", "blocker", "snapshot", "gate",
  codigos de alerta y estados en ingles. Se audita con una revision pantalla
  por pantalla contra el diccionario de microcopy y queda en checklist.
- **SC-003**: Un administrador crea una clausula nueva con un dato insertado
  y una condicion, de punta a punta, sin ver ni escribir JSON, en menos de
  10 minutos en su primer intento.
- **SC-004**: Con un caso bloqueado, el 100% de los pendientes mostrados
  tiene accion navegable que lleva al lugar correcto de correccion, y un
  usuario de perfil real identifica que falta y donde se corrige en menos
  de 1 minuto por pendiente.
- **SC-005**: La escritura completa del template v1 (20 clausulas) se lee de
  corrido en una sola superficie sin cambiar de pantalla, con los textos de
  bloques aprobados verbatim y las referencias registrales en palabras
  identicas a las del DOCX.
- **SC-006**: Cero regresion funcional: para el mismo caso y snapshot, el
  DOCX generado es estructuralmente identico al de SDD 008; las suites de
  API y web quedan verdes; las reglas snapshot-only y de inmutabilidad se
  verifican con los tests existentes mas los nuevos.
- **SC-007**: La mesa carga lista para leer en menos de 2 segundos desde
  datos persistidos (mismo presupuesto que SDD 008).
- **SC-008**: La prueba de usabilidad guiada (5 tareas: llegar al caso, leer
  la escritura, encontrar la evidencia de un dato, destrabar un pendiente,
  generar la minuta) se completa con al menos 4 de 5 tareas sin ayuda.

## Assumptions

- Los tres perfiles usan la plataforma en escritorio (oficina legal); la
  mesa es desktop-first y en anchos menores degrada sin perder lectura.
- Hoy existen etiquetas humanas por grupo de variables, por estado y por
  gate (capa web del CCL), y por token dentro de las plantillas, pero el
  catalogo canonico NO tiene etiqueta por variable individual; crear ese
  inventario de etiquetas y categorias en la fuente unica es parte de este
  feature (cambio aditivo de catalogo/codigo, sin migracion de DB).
- No hay cambios de esquema de base de datos: el feature es capa de
  presentacion + extensiones aditivas de contratos de respuesta.
- El rediseno completo del Centro de Control Legal queda fuera de alcance
  (futuro SDD); aqui solo entran el acceso directo al caso, el CTA a la mesa
  y la unificacion de vocabulario/estados en lo que ya existe.
- La autoria de plantillas sigue siendo una superficie de administradores;
  no se abre a otros roles en este feature.
- El mockup aprobado en la sesion de consultoria del 2026-06-11 es la
  referencia visual de partida; los wireframes definitivos se validan con el
  usuario antes de implementar (gate de proceso en plan/tasks).
- El flujo venta→escritura (matriz del proyecto aprobada por el abogado,
  creacion automatica del caso al validar la venta, revision liviana del
  administrador y entrega al vendedor) se especifica en SDD 011
  (`specs/011-venta-escritura/`); la mesa de SDD 010 se construye para ser
  reutilizada alli sin reescritura — documento continuo, chips, panel y
  pendientes son agnosticos del nivel proyecto/lote.
- La revision de calce deslindes↔plano oficial queda explicitamente fuera
  de SDD 010 y SDD 011 (mejora futura): la mesa consume los resultados
  existentes de deslindes y servidumbre (`lote.deslindes`,
  `servidumbre.*`) tal cual los produce el motor actual.
- ProseKit sigue siendo la capa de edicion; el documento continuo se
  construye sobre el modelo de clausulas existente sin migrar contenido.
