# Feature Specification: Venta → Escritura — Matriz del Proyecto y Borrador Automatico

**Feature Branch**: `[011-venta-escritura]`

**Created**: 2026-06-11

**Status**: Draft (especificado; plan/research/tasks se generan al cierre de
SDD 010, del que este feature depende)

**Input**: User description: "La organizacion crea el proyecto con sus
documentos (dominio, roles, SAG, plano, otro), carga el KMZ y ajusta los
lotes. Despues el administrador y el abogado revisan: deslindes, variables
legales (roles/SAG + inscripcion del plano a mano), y la historia del
dominio. Con eso generan la matriz de la escritura del proyecto, que toma
toda esa informacion y deja nombres y valores de venta como huecos
esperando que el lote se venda. El abogado puede modificar variables o
texto, y cuando la da por buena queda esperando ventas. Cuando un vendedor
vende un lote agrega los datos del comprador y los valores; al poner
'vender' le llega una notificacion al administrador para validar la venta;
al validarla el sistema genera el borrador de escritura, el administrador
lo revisa y si esta bien lo acepta, y se le envia al vendedor por Telegram
o queda en sus documentos para compartirlo o descargarlo desde el front."

## Context

SDD 011 cierra el ciclo de producto de toda la linea de escrituras
(SDD 006→010): convierte el motor por caso en el flujo real de negocio
**proyecto → matriz aprobada → venta → borrador automatico → entrega**.

Estado de partida (que ya existe y NO se reconstruye):

- Onboarding de proyecto con los cinco tipos documentales, KMZ y ajuste de
  lotes (core V1).
- Extraccion y revision: CCL (SDD 007), agente de titulo (SDD 009),
  inscripcion del plano como dato manual del catalogo.
- Motor de matriz (SDD 008): plantilla general publicada v1, puente
  operacional desde el registro de venta (`lot_records`), resolutor, DOCX,
  workflow de revision con warning ADR-009.
- Mesa de escritura (SDD 010): documento continuo, chips con evidencia,
  pendientes humanizados, llegada guiada — la superficie que este feature
  reutiliza en ambos niveles.
- Flujo de venta con aprobacion administrativa y centro de notificaciones
  (paneles de aprobaciones existentes).

Los tres vacios que este feature cierra:

1. **No existe la matriz del proyecto**: hoy la matriz nace por lote
   vendido; el abogado tendria que revisar la escritura completa N veces.
2. **El caso de escritura se crea a mano**, y el panel actual exige
   verificaciones en verde _antes_ de crear el caso, aunque los datos de la
   venta se proponen _al_ crearlo (huevo-y-gallina en
   `escritura-readiness-panel.tsx`).
3. **No hay entrega**: el cliente Telegram solo envia texto (`send_text`) y
   no existe la vista de documentos del vendedor.

Reglas de arquitectura heredadas (no negociables):

1. Snapshot-only: nada lee extraccion viva ni muta `variable_resolutions`
   fuera del flujo CCL; el puente operacional es el unico productor de
   datos de venta.
2. Motor SDD 008 y superficie SDD 010 se reutilizan; cero re-arquitectura
   de resolutor/renderer/workflow.
3. Gate humano juridico (ADR-009) intacto: el DOCX siempre lleva marca de
   borrador y aceptacion de warning registrada; ningun envio externo lo
   esquiva.
4. Cero jerga tecnica y cero JSON visibles (diccionario SDD 010 aplica a
   toda superficie nueva).
5. Tenant isolation y auditoria nivel B en todo lo nuevo (quien valido,
   quien acepto, quien recibio, cuando).

**Fuera de alcance explicito**: la revision de calce deslindes↔plano
oficial (mejora futura definida por el usuario — este feature consume los
resultados existentes de deslindes y servidumbre tal cual: `lote.deslindes`,
`servidumbre.*`); el rediseno completo del Centro de Control Legal; firma
electronica y artefactos finales de notaria/CBR (sin cambios respecto a
SDD 008).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Matriz del proyecto aprobada una vez (Priority: P1)

Como abogado, despues de cerrar la revision del proyecto (deslindes,
variables legales, historia del dominio), quiero generar la matriz de la
escritura del proyecto desde la plantilla general, verla con los datos del
proyecto ya resueltos y los datos de venta como huecos senalizados
(`______`), editar texto o clausulas para este proyecto, y aprobarla una
sola vez para que quede esperando ventas.

**Why this priority**: Es la pieza que convierte el trabajo del abogado de
N lotes a 1 proyecto. Sin matriz del proyecto aprobada, ningun borrador
automatico tiene base juridica.

**Independent Test**: Con el proyecto Teno revisado (titulo aprobado,
variables SII/SAG aprobadas, inscripcion del plano ingresada), generar la
matriz del proyecto, verificar que la mesa la muestra con
vendedor/predio/titulo resueltos y comprador/precio/lote como huecos con
nombre humano, editar una clausula, aprobarla y verificar que queda en
estado "esperando ventas" sin ningun caso de lote creado.

**Acceptance Scenarios**:

1. **Given** un proyecto con la revision legal cerrada, **When** el abogado
   genera la matriz del proyecto, **Then** se crea desde la plantilla
   general vigente como matriz propia del proyecto, y la mesa la muestra
   resuelta contra los datos aprobados del proyecto, con los datos de venta
   como huecos senalizados con su nombre humano, nunca vacios silenciosos.
2. **Given** la matriz del proyecto en borrador, **When** el abogado edita
   texto de una clausula o ajusta clausulas (mesa SDD 010), **Then** los
   cambios quedan en la matriz del proyecto sin afectar la plantilla
   general ni otros proyectos.
3. **Given** la matriz del proyecto lista, **When** el abogado la aprueba,
   **Then** queda inmutable en estado "esperando ventas" (cambiarla exige
   nueva version con nueva aprobacion) y la aprobacion queda auditada.
4. **Given** un proyecto con revision incompleta (p. ej. titulo no
   aprobado), **When** se intenta aprobar la matriz del proyecto, **Then**
   la aprobacion se bloquea listando los pendientes de proyecto en lenguaje
   humano con su accion (mismo patron de pendientes de SDD 010).

---

### User Story 2 - La venta validada genera el borrador sola (Priority: P1)

Como administrador, cuando un vendedor vende un lote (datos del comprador +
valores) y yo valido esa venta, quiero que el sistema cree el expediente de
escritura del lote y genere el borrador automaticamente desde la matriz del
proyecto aprobada, para que nadie tenga que saber "crear un caso" ni
digitar datos que el formulario de venta ya tiene.

**Why this priority**: Es el corazon del flujo pedido: "al validar la
venta, se genera la escritura". Sin esto, el resto es manual.

**Independent Test**: Con la matriz del proyecto Teno aprobada y un lote
con registro de venta completo, validar la venta y verificar que: el caso
de escritura del lote existe sin intervencion manual, los datos del
comprador/precio/lote quedaron propuestos desde el formulario (puente
operacional), el borrador del lote existe instanciado desde la matriz del
proyecto, y el administrador recibio la notificacion con acceso directo.

**Acceptance Scenarios**:

1. **Given** una venta pendiente de validacion, **When** el administrador
   la valida, **Then** el sistema crea el caso de escritura del lote
   automaticamente, el puente operacional propone comprador/precio/lote
   desde el registro de venta, y el borrador del lote se instancia desde la
   matriz del proyecto aprobada (no desde la plantilla general).
2. **Given** la creacion automatica del caso, **When** el flujo corre,
   **Then** ya no existe el orden invertido actual: el caso se crea primero
   y las verificaciones se evaluan despues sobre los datos propuestos
   (correccion del huevo-y-gallina del panel de readiness).
3. **Given** un proyecto SIN matriz del proyecto aprobada, **When** se
   valida una venta, **Then** la venta se valida igual (el flujo comercial
   nunca se bloquea por lo legal) y la escritura queda en preparacion
   explicando que falta la matriz del proyecto, con accion para el abogado.
4. **Given** datos faltantes en el formulario de venta (p. ej. estado
   civil), **When** se genera el borrador, **Then** el borrador existe en
   preparacion con los pendientes humanizados apuntando al registro de
   venta (pantalla de llegada guiada de SDD 010).

---

### User Story 3 - Validar la venta viendo el borrador (Priority: P2)

Como administrador, quiero revisar el borrador generado con los datos
nuevos del comprador resaltados como "Por revisar" (todo lo demas ya venia
aprobado a nivel proyecto), y aceptarlo para producir el DOCX con el
warning legal registrado, para que la revision por venta tome minutos y no
repita la revision juridica del proyecto.

**Acceptance Scenarios**:

1. **Given** un borrador recien generado, **When** el administrador lo abre
   desde la notificacion, **Then** la mesa muestra el documento con SOLO los
   datos provenientes de la venta resaltados como "Por revisar"; el
   contenido aprobado a nivel proyecto se distingue como ya revisado.
2. **Given** el administrador conforme, **When** acepta el borrador,
   **Then** se genera el DOCX desde el flujo existente (matriz aprobada +
   expediente vigente + warning ADR-009 aceptado y registrado) con marca
   visible de borrador que requiere revision legal.
3. **Given** un dato de la venta incorrecto, **When** el administrador lo
   detecta, **Then** corrige en el registro de venta / CCL via la accion
   del dato (la mesa no edita valores) y el borrador se re-evalua.

---

### User Story 4 - Entrega al vendedor (Priority: P2)

Como vendedor, cuando el administrador acepta el borrador de la escritura
de mi venta, quiero recibirlo por Telegram y verlo en "mis documentos" en
la web, para compartirlo o descargarlo sin pedirle nada a nadie.

**Acceptance Scenarios**:

1. **Given** un borrador aceptado, **When** se completa la aceptacion,
   **Then** el vendedor asignado recibe por Telegram el aviso con acceso al
   documento (enlace seguro con vencimiento; envio del archivo si el canal
   lo permite), y el envio queda auditado (quien, a quien, cuando, canal).
2. **Given** el vendedor en la web, **When** abre sus documentos, **Then**
   ve los borradores de SUS ventas (y solo los suyos) con estado, descarga
   y opcion de compartir; ningun documento de otros vendedores o proyectos
   no asignados es visible.
3. **Given** cualquier entrega, **When** el documento sale de Plotify,
   **Then** lleva la marca de borrador sujeto a revision legal; ninguna via
   de entrega omite el registro del warning.

---

### User Story 5 - Estado del flujo visible para todos (Priority: P3)

Como administrador o vendedor, quiero ver en que paso esta cada escritura
(esperando matriz del proyecto / en preparacion / borrador por revisar /
aceptada / entregada), con el mismo vocabulario en notificaciones, CCL,
mesa y documentos del vendedor.

**Acceptance Scenarios**:

1. **Given** cualquier superficie del flujo, **When** muestra el estado de
   una escritura, **Then** usa el diccionario unico (SDD 010) — los estados
   son frases humanas identicas en notificacion, panel y mesa.
2. **Given** un vendedor con ventas en distintos pasos, **When** consulta
   sus documentos, **Then** distingue de un vistazo cuales borradores estan
   listos y cuales siguen en preparacion, sin terminos tecnicos.

---

### Edge Cases

- Venta validada con matriz del proyecto en borrador (no aprobada): la
  escritura del lote queda en preparacion con el pendiente "Falta aprobar
  la matriz del proyecto" accionable para el abogado; al aprobarse, los
  borradores pendientes se instancian.
- Nueva version de la matriz del proyecto con ventas ya entregadas: los
  borradores aceptados/entregados NO se regeneran (inmutabilidad de
  generaciones); los borradores aun en preparacion/revision usan la nueva
  version, con aviso humano del cambio.
- Venta rechazada o anulada por el administrador: no se crea caso; si ya
  existia, el expediente queda cancelado con su historial (nunca se
  borra).
- Correccion del registro de venta despues del borrador: el puente
  re-propone (supersede) como hoy; el borrador vuelve a preparacion si ya
  estaba en revision, conservando historial.
- Vendedor sin Telegram vinculado: la entrega cae a "mis documentos" web +
  notificacion interna; el envio Telegram queda registrado como no
  disponible, jamas falla silencioso.
- Dos ventas del mismo lote (re-venta tras anulacion): cada venta validada
  produce su propio expediente versionado; el anterior queda en historial.
- Proyecto sin servidumbre o sin datos de servidumbre: las clausulas
  condicionales se omiten/bloquean segun la regla existente del motor; este
  feature no agrega logica de deslindes (fuera de alcance).
- Enlace de entrega vencido: el vendedor lo renueva desde "mis documentos"
  sin intervencion del administrador.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST permitir generar una matriz del proyecto desde la
  plantilla general vigente: copia propia del proyecto, editable en la mesa
  (texto y clausulas), sin afectar la plantilla general ni otros proyectos.
- **FR-002**: System MUST mostrar la matriz del proyecto resuelta contra
  los datos aprobados del proyecto, con los datos de venta
  (comprador/precio/lote especificos) como huecos senalizados con nombre
  humano — nunca espacios vacios sin explicacion.
- **FR-003**: System MUST exigir aprobacion del abogado para la matriz del
  proyecto, bloqueada mientras la revision del proyecto tenga pendientes
  (titulo, variables legales), con pendientes humanizados accionables;
  aprobada queda inmutable y "esperando ventas" (cambios = nueva version
  con nueva aprobacion, historial conservado).
- **FR-004**: System MUST crear el caso de escritura del lote
  automaticamente al validarse la venta, ejecutando el puente operacional
  (comprador/precio/lote desde el registro de venta) sin digitacion ni
  pasos manuales de "crear caso".
- **FR-005**: System MUST instanciar el borrador del lote desde la matriz
  del proyecto aprobada (no desde la plantilla general); sin matriz
  aprobada, la escritura queda en preparacion con pendiente accionable y la
  validacion comercial de la venta nunca se bloquea por ello.
- **FR-006**: System MUST eliminar el orden invertido del panel actual: el
  caso existe primero y las verificaciones se evaluan sobre los datos
  propuestos; ninguna superficie exige verificaciones en verde como
  precondicion para crear el expediente.
- **FR-007**: System MUST presentar al administrador el borrador con los
  datos provenientes de la venta resaltados "Por revisar" y el contenido
  aprobado a nivel proyecto distinguible como ya revisado, en la mesa de
  SDD 010 sin componentes nuevos de documento.
- **FR-008**: System MUST conservar el flujo de generacion DOCX existente
  (matriz aprobada + expediente vigente + warning ADR-009 aceptado y
  registrado) y agregar marca visible de "borrador sujeto a revision
  legal" en el documento entregable.
- **FR-009**: System MUST notificar: al administrador cuando hay venta por
  validar y cuando el borrador esta listo para revision; al vendedor cuando
  su borrador fue aceptado/entregado — todo con el vocabulario del
  diccionario unico y deep links a la superficie correcta.
- **FR-010**: System MUST entregar el borrador aceptado al vendedor por
  Telegram (enlace seguro con vencimiento de 7 dias, renovable desde "mis
  documentos"; archivo adjunto si el canal lo soporta) y en una vista web
  "documentos del vendedor" con descarga y compartir; cada entrega auditada
  (quien, a quien, canal, cuando).
- **FR-011**: System MUST aislar por vendedor la vista de documentos: cada
  vendedor ve exclusivamente los borradores de sus ventas en proyectos
  asignados (regla de asignacion constitucional V).
- **FR-012**: System MUST mantener la trazabilidad completa del flujo por
  escritura: matriz del proyecto (version y aprobador), venta (validador),
  borrador (generacion e inputs), aceptacion (quien/cuando) y entregas —
  consultable desde la mesa y el historial.
- **FR-013**: System MUST consumir los deslindes y la servidumbre
  existentes (`lote.deslindes`, `servidumbre.*`) tal cual los produce el
  motor actual; este feature no agrega ni modifica logica de calce
  deslindes↔plano (mejora futura explicita).
- **FR-014**: System MUST aplicar el diccionario de microcopy de SDD 010 a
  toda superficie nueva (matriz del proyecto, validacion con borrador,
  documentos del vendedor, notificaciones): cero jerga tecnica, cero JSON,
  estados identicos entre superficies.
- **FR-015**: System MUST permitir consultar el historial de documentos
  generados filtrable por proyecto: las escrituras ejercidas por lote
  (quien, cuando, desde que version de la matriz) agrupadas/filtrables por
  proyecto, para que el administrador vea de un vistazo lo ejercido en cada
  loteo. Reutiliza el historial existente; solo agrega el filtro por
  proyecto.

### Key Entities _(include if feature involves data)_

- **Matriz del Proyecto**: la escritura aprobada del proyecto: derivada de
  la plantilla general, propia del proyecto, con version, estado (borrador
  / esperando ventas / reemplazada), aprobador y fecha. El modelado fisico
  (alcance de proyecto sobre el modelo de plantillas existente) se decide
  en research/plan de este feature — unica posible excepcion acotada a la
  regla de cero migraciones.
- **Expediente de escritura del lote (existente, nuevo origen)**: el caso
  SDD 007/008 actual; gana un origen automatico (venta validada) y la
  referencia a la matriz del proyecto que lo instancio.
- **Entrega de borrador**: registro auditable de cada entrega: generacion
  referida, destinatario (vendedor), canal (Telegram/web), enlace y
  vencimiento, estado del envio, timestamps.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El abogado aprueba la escritura del proyecto UNA vez: en un
  proyecto con la matriz aprobada, el 100% de las ventas validadas produce
  borrador sin requerir nueva revision juridica del texto de proyecto (solo
  datos de la venta quedan "Por revisar").
- **SC-002**: Desde "validar venta" hasta "borrador aceptado", un
  administrador completa el caso limpio en menos de 5 minutos, sin digitar
  ningun dato del comprador (cero digitacion: todo viene del formulario de
  venta).
- **SC-003**: El 100% de los borradores generados traza a: matriz del
  proyecto aprobada + venta validada + expediente vigente; ningun borrador
  se genera desde la plantilla general directamente ni desde expediente
  obsoleto.
- **SC-004**: El vendedor accede a su borrador (Telegram o "mis
  documentos") en menos de 1 minuto desde la aceptacion, y el 100% de las
  entregas lleva marca de borrador y warning registrado.
- **SC-005**: Cero filtraciones entre vendedores: las pruebas de
  aislamiento confirman que un vendedor jamas ve documentos de ventas
  ajenas (mismo estandar de regresion tenant de SDD 007/008).
- **SC-006**: La validacion comercial de la venta nunca espera a lo legal:
  el 100% de las ventas se valida aunque la matriz del proyecto no exista,
  y la escritura comunica su preparacion con pendientes accionables.
- **SC-007**: Cero regresion del motor: las suites de SDD 008/010 siguen
  verdes; el DOCX de un caso equivalente es estructuralmente identico al
  de SDD 010 salvo la marca de borrador.

## Assumptions

- **Dependencia dura de SDD 010**: la mesa (documento continuo, chips,
  pendientes, llegada guiada) es la superficie de la matriz del proyecto y
  del borrador del lote; este feature no construye superficie de documento
  propia. Plan/research/tasks de SDD 011 se generan cuando SDD 010 cierre.
- La matriz del proyecto se modela sobre el sistema de plantillas/matrices
  existente (clon con alcance de proyecto); si exige migracion, sera minima
  y aditiva (decision en research D1 de este feature, unica excepcion
  permitida a cero migraciones).
- El flujo de venta del vendedor (formulario con datos del comprador y
  valores) y la validacion administrativa existen y no cambian de
  semantica; este feature se engancha al momento "venta validada".
- La entrega Telegram parte con enlace seguro via `send_text` existente; el
  envio de archivo adjunto es mejora dentro del mismo feature si el tiempo
  lo permite (decision en plan).
- La revision deslindes↔plano oficial es mejora futura definida por el
  usuario: fuera de alcance aqui y en SDD 010; se consumen los resultados
  vigentes de deslindes y servidumbre sin cambios.
- El warning ADR-009 y su registro cubren tambien la entrega al vendedor
  (distribucion de borrador con marca); no se crea un gate juridico nuevo
  por venta — el gate juridico vive en la matriz del proyecto.
