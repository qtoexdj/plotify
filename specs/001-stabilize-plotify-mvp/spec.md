# Feature Specification: Stabilize Plotify MVP

**Feature Branch**: `001-stabilize-plotify-mvp`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "Crea la spec 001-stabilize-plotify-mvp. Usa plotify_memori/ como memoria oficial y CodeGraph para revisar el código actual. Primero entrevístame para cerrar MVP, usuarios, flujos críticos, fuera de alcance y criterios de éxito."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Crear y validar proyecto parcelario (Priority: P1)

Un administrador de una inmobiliaria o gestora de parcelaciones crea un proyecto,
carga un archivo KMZ/KML, revisa los lotes detectados en un mapa, corrige o
confirma datos mínimos, y deja el proyecto listo para operar reservas, ventas y
documentos.

**Why this priority**: Sin proyecto, lotes y geometría confiable no existe base
para gestionar vendedores, reservas, ventas ni documentos legales.

**Independent Test**: Puede probarse creando un proyecto nuevo con un archivo
KMZ/KML de ejemplo, verificando que los lotes aparecen visualmente, que sus
superficies/deslindes quedan disponibles, y que el proyecto puede marcarse como
validado para operación.

**Acceptance Scenarios**:

1. **Given** un administrador autenticado y un archivo KMZ/KML válido, **When**
   crea un proyecto y carga el archivo, **Then** el sistema muestra los lotes en
   un mapa y permite revisar su información base.
2. **Given** un proyecto con lotes importados, **When** el administrador confirma
   o corrige los datos mínimos, **Then** el proyecto queda habilitado para
   reservas, ventas y generación de documentos.
3. **Given** un archivo inválido o corrupto, **When** el administrador intenta
   cargarlo, **Then** el sistema rechaza la carga con un mensaje claro y no deja
   datos parciales como proyecto operativo.

---

### User Story 2 - Solicitar y aprobar una reserva (Priority: P1)

Un vendedor asignado a un proyecto revisa lotes disponibles e ingresa los datos
del comprador desde la plataforma web o desde el bot de Telegram. El
administrador recibe la solicitud como notificación operativa y puede aprobarla
o rechazarla desde Telegram o desde la plataforma web; la primera decisión
válida resuelve la solicitud.

**Why this priority**: La reserva aprobada es el primer flujo comercial completo
del piloto y valida colaboración entre vendedor y administrador.

**Independent Test**: Puede probarse con un proyecto validado, un vendedor
asignado y un lote disponible; el vendedor solicita reserva, el administrador la
aprueba por un canal, y el lote cambia a reservado con historial visible.

**Acceptance Scenarios**:

1. **Given** un lote disponible y un vendedor asignado, **When** el vendedor
   solicita una reserva con datos completos del comprador desde web o Telegram,
   **Then** el administrador recibe la solicitud en Telegram y en sus
   notificaciones web.
2. **Given** una solicitud pendiente visible en ambos canales, **When** el
   administrador aprueba primero desde Telegram, **Then** la solicitud queda
   aprobada, el lote queda reservado y la acción equivalente del frontend queda
   obsoleta o informada como ya resuelta.
3. **Given** una solicitud pendiente visible en ambos canales, **When** el
   administrador aprueba primero desde la plataforma web, **Then** la solicitud
   queda aprobada y cualquier acción posterior desde Telegram no duplica la
   reserva.
4. **Given** un lote reservado, vendido o con solicitud pendiente, **When** un
   vendedor intenta solicitar otra reserva, **Then** el sistema bloquea la acción
   y explica el estado actual del lote.

---

### User Story 3 - Generar documento de reserva trazable (Priority: P1)

Un administrador genera el documento de reserva desde la plantilla activa del
proyecto usando datos del proyecto, lote, comprador y vendedor. El sistema
identifica variables faltantes, permite generar con espacios en blanco solo si
el administrador lo confirma, produce PDF y DOCX, y conserva una versión
trazable del documento.

**Why this priority**: El piloto debe demostrar que Plotify reduce trabajo legal
operativo usando los datos ya capturados por el proyecto y la reserva.

**Independent Test**: Puede probarse con una reserva aprobada; el administrador
revisa variables, genera PDF y DOCX, y confirma que el historial del lote muestra
el documento, su versión, su snapshot de datos y los destinatarios elegidos.

**Acceptance Scenarios**:

1. **Given** una reserva aprobada y una plantilla activa, **When** el
   administrador abre la generación de documento, **Then** el sistema muestra las
   variables disponibles y las faltantes antes de generar.
2. **Given** variables legales faltantes, **When** el administrador decide
   bloquear la generación, **Then** no se emite documento final y se muestra qué
   información debe completarse.
3. **Given** variables legales faltantes, **When** el administrador confirma
   generar con espacios en blanco, **Then** el documento se genera indicando que
   faltaban datos y conserva el snapshot exacto usado.
4. **Given** un documento generado, **When** el administrador lo regenera tras
   corregir datos, **Then** el sistema conserva la versión previa y crea una
   nueva versión vinculada al mismo lote.

---

### User Story 4 - Preparar escritura desde datos del proyecto y documentos (Priority: P2)

Un administrador o abogado funcional revisa las variables necesarias para una
escritura, completa los datos que no vienen del KMZ/KML, sube documentos del
proyecto como plano, dominio vigente, certificado de roles o certificado SAG, y
usa esa información para preparar una escritura en PDF y DOCX lista para
revisión legal.

**Why this priority**: La escritura es el segundo hito documental del piloto y
requiere cerrar la brecha entre datos geométricos, datos comerciales y datos
legales provenientes de documentos del proyecto.

**Independent Test**: Puede probarse con un lote reservado o vendido y un set de
documentos del proyecto; el administrador identifica qué variables de escritura
se completan automáticamente, cuáles requieren revisión manual y genera una
escritura versionada.

**Acceptance Scenarios**:

1. **Given** un proyecto con lote, comprador y documentos subidos, **When** el
   administrador revisa variables de escritura, **Then** el sistema diferencia
   datos obtenidos del proyecto/lote, datos obtenidos de documentos y datos
   pendientes.
2. **Given** una escritura con datos incompletos, **When** el administrador
   intenta generar el documento, **Then** el sistema aplica la misma política de
   faltantes definida para documentos de reserva.
3. **Given** una escritura generada, **When** se corrigen datos legales y se
   regenera, **Then** la nueva versión no elimina la versión anterior ni su
   snapshot.

---

### User Story 5 - Completar venta con aprobación administrativa (Priority: P2)

Un vendedor solicita venta o el administrador inicia una venta sobre un lote; el
administrador aprueba la operación desde Telegram o la plataforma web, el lote
queda vendido, y el historial conserva reserva, venta, documentos y acciones
relevantes.

**Why this priority**: La venta cierra el ciclo comercial después de reserva y
permite validar que el sistema soporta estados reales del negocio.

**Independent Test**: Puede probarse desde dos puntos de partida: un lote
disponible vendido de forma directa y un lote reservado que avanza a venta. En
ambos casos se solicita venta, el administrador aprueba desde uno de los canales
disponibles, el lote queda vendido y el historial refleja si la venta fue
directa o posterior a una reserva.

**Acceptance Scenarios**:

1. **Given** un lote disponible, **When** se solicita una venta directa con datos
   finales del comprador, **Then** el administrador recibe una solicitud de venta
   directa y puede aprobarla o rechazarla antes de que el lote cambie a vendido.
2. **Given** un lote reservado, **When** se solicita venta con datos finales del
   comprador, **Then** el administrador recibe la solicitud y puede aprobarla o
   rechazarla como continuidad de la reserva.
3. **Given** una venta aprobada, **When** el sistema actualiza el lote, **Then**
   el lote queda vendido y no disponible para nuevas reservas.
4. **Given** una venta rechazada, **When** el vendedor revisa el lote, **Then**
   el estado comercial previo permanece claro (`disponible` para venta directa
   rechazada, `reservado` para venta posterior a reserva rechazada) y no se
   genera documento final de venta sin aprobación.

---

### User Story 6 - Operar el piloto desde distintos dispositivos (Priority: P3)

Administradores y vendedores usan la plataforma desde notebook, tablet o móvil.
Los flujos críticos de carga/revisión, solicitud, aprobación, generación y envío
de documentos son legibles, accionables y no dependen de una única resolución de
pantalla.

**Why this priority**: El piloto tendrá usuarios en terreno y en oficina; la
plataforma debe ser operable desde diferentes dispositivos.

**Independent Test**: Puede probarse ejecutando los flujos P1 en pantallas de
escritorio y móvil, verificando que las acciones principales son visibles y que
no se bloquea el uso por layout.

**Acceptance Scenarios**:

1. **Given** un vendedor en móvil, **When** revisa lotes y solicita reserva,
   **Then** puede completar el flujo sin usar vistas de escritorio.
2. **Given** un administrador en móvil, **When** recibe una solicitud, **Then**
   puede revisar datos suficientes y aprobar o rechazar.
3. **Given** un administrador en escritorio, **When** edita o revisa documentos,
   **Then** puede trabajar con una vista amplia de bloques, variables y preview.

### Edge Cases

- Archivo KMZ/KML inválido, corrupto, demasiado grande o sin lotes detectables.
- Lotes con geometría incompleta, superficie inconsistente o deslindes que
  requieren corrección manual antes de usar documentos.
- Vendedor no asignado al proyecto o intentando operar un lote fuera de su
  alcance.
- Dos aprobaciones concurrentes desde Telegram y web para la misma solicitud.
- Lote que cambia de estado mientras un vendedor completa una solicitud.
- Variables legales faltantes o contradictorias entre proyecto, lote, comprador
  y documentos subidos.
- Documento del proyecto inválido, no permitido o que no corresponde al tipo
  esperado.
- Error al enviar notificaciones o documentos; la operación principal debe
  conservar estado trazable y permitir reintento.
- Regeneración de documentos tras cambio de datos comerciales o legales.
- Acceso desde móvil con poco espacio disponible para revisar documentos largos.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema MUST permitir que un administrador cree un proyecto de
  parcelación a partir de un archivo KMZ/KML válido.
- **FR-002**: El sistema MUST mostrar visualmente los lotes importados y sus
  datos base para revisión del administrador.
- **FR-003**: El sistema MUST permitir corregir o confirmar datos mínimos del
  proyecto y lote antes de habilitar reservas, ventas o documentos.
- **FR-004**: El sistema MUST permitir que el administrador gestione vendedores
  asignados a proyectos.
- **FR-005**: El sistema MUST restringir a vendedores para que solo operen
  proyectos y lotes asignados.
- **FR-006**: El sistema MUST permitir que un vendedor solicite reserva sobre un
  lote disponible ingresando datos del comprador desde la plataforma web o desde
  el bot de Telegram.
- **FR-007**: El sistema MUST impedir reservas duplicadas, reservas sobre lotes
  no disponibles y solicitudes simultáneas que dejen estados ambiguos.
- **FR-008**: El sistema MUST notificar al administrador una solicitud de reserva
  por Telegram y en la plataforma web.
- **FR-008A**: El sistema MUST permitir que un vendedor vinculado por Telegram
  consulte lotes asignados y solicite reservas solo sobre proyectos/lotes
  asignados.
- **FR-009**: El administrador MUST poder aprobar o rechazar una reserva desde
  Telegram o desde la plataforma web; la primera decisión válida MUST resolver la
  solicitud.
- **FR-010**: El sistema MUST registrar un historial legible del lote con
  reservas, rechazos, liberaciones, ventas, documentos generados y envíos.
- **FR-011**: El sistema MUST permitir generar documentos de reserva en PDF y
  DOCX desde una plantilla activa del proyecto.
- **FR-012**: El sistema MUST mostrar variables disponibles y faltantes antes de
  emitir un documento final.
- **FR-013**: El sistema MUST permitir generar con espacios en blanco solo cuando
  el administrador confirme explícitamente que acepta los datos faltantes.
- **FR-014**: Todo documento generado MUST conservar la versión, el lote, la
  plantilla usada, el usuario que generó el documento y el snapshot exacto de
  variables.
- **FR-015**: El sistema MUST permitir regenerar documentos sin sobrescribir
  versiones anteriores.
- **FR-016**: El sistema MUST permitir subir y clasificar documentos del proyecto
  relevantes para escritura, incluyendo plano, dominio vigente, certificado de
  roles y certificado SAG.
- **FR-017**: El sistema MUST identificar qué variables de escritura provienen
  del proyecto/lote, cuáles provienen de documentos subidos y cuáles requieren
  completarse manualmente.
- **FR-018**: El sistema MUST permitir generar una escritura en PDF y DOCX cuando
  las variables mínimas estén completas o el administrador acepte explícitamente
  espacios en blanco.
- **FR-019**: El sistema MUST permitir que el administrador elija destinatarios
  para documentos aprobados, incluyendo vendedor y comprador cuando corresponda.
- **FR-020**: El sistema MUST permitir solicitar y aprobar venta con la misma
  política de aprobación administrativa usada para reservas.
- **FR-021**: El sistema MUST impedir que una venta se finalice sin aprobación
  explícita del administrador.
- **FR-022**: El sistema MUST conservar trazabilidad de cambios comerciales,
  legales y documentales relevantes para que un administrador pueda responder
  quién hizo qué, cuándo, sobre qué lote/documento y con qué resultado.
- **FR-023**: El sistema MUST ser usable en escritorio, tablet y móvil para los
  flujos críticos de vendedor y administrador.
- **FR-024**: El sistema MUST excluir del MVP productivo CAD DWG/DXF, Prompt Ops,
  WhatsApp como canal principal, firma electrónica, CRM completo, comparación
  visual de documentos y automatización final sin aprobación humana.

### Key Entities _(include if feature involves data)_

- **Organización**: Inmobiliaria o gestora de parcelaciones que opera proyectos,
  usuarios, vendedores, documentos y configuraciones propias.
- **Usuario administrador**: Persona con permisos para crear proyectos, validar
  datos, gestionar vendedores, aprobar operaciones y emitir documentos finales.
- **Vendedor**: Usuario asignado a proyectos que puede consultar lotes y solicitar
  reservas o ventas con datos del comprador.
- **Comprador**: Persona cuyos datos alimentan reservas, ventas y documentos; en
  V1 no requiere acceso propio a la plataforma.
- **Proyecto**: Parcelación administrada por una organización, con geometría,
  lotes, documentos subidos y datos legales/comerciales.
- **Lote**: Unidad vendible con estado comercial, geometría, superficie,
  deslindes, precio, historial y documentos relacionados.
- **Documento del proyecto**: Archivo subido por el administrador, como plano,
  dominio vigente, certificado de roles o certificado SAG, usado como fuente de
  datos legales.
- **Variable legal**: Dato requerido por una reserva o escritura, obtenido desde
  proyecto, lote, comprador, vendedor, organización, geometría o documento
  subido.
- **Plantilla documental**: Estructura aprobada por proyecto para generar reserva
  o escritura mediante bloques y variables.
- **Documento generado**: PDF o DOCX emitido desde una plantilla, con versión,
  snapshot de variables, lote asociado y destinatarios.
- **Solicitud de aprobación**: Pedido de reserva o venta pendiente de decisión
  del administrador.
- **Evento de historial**: Registro visible y trazable de acciones comerciales,
  legales o documentales relevantes.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Un administrador puede crear o usar un proyecto con KMZ/KML,
  validar lotes y dejarlo operativo para reservas en una sesión de prueba sin
  asistencia técnica.
- **SC-002**: Un vendedor puede solicitar una reserva con datos completos del
  comprador en menos de 5 minutos.
- **SC-003**: Un administrador puede aprobar o rechazar una reserva en menos de 2
  minutos desde que recibe la notificación.
- **SC-004**: Al aprobar una reserva, el lote queda reservado, el historial se
  actualiza y el documento de reserva PDF/DOCX puede generarse en el mismo flujo.
- **SC-005**: El 100% de documentos generados conserva versión, plantilla usada,
  lote asociado y snapshot de variables.
- **SC-006**: El sistema detecta y muestra el 100% de variables obligatorias
  faltantes antes de emitir documentos finales.
- **SC-007**: Ninguna prueba de acceso entre organizaciones debe permitir ver,
  aprobar, vender o generar documentos de un proyecto ajeno.
- **SC-008**: Un piloto puede operar al menos 20 lotes con reserva, venta,
  documentos e historial sin intervención técnica directa.
- **SC-009**: Los flujos críticos de vendedor y administrador son completables en
  móvil y escritorio sin pérdida de acciones principales.
- **SC-010**: Las opciones fuera de alcance del MVP no bloquean el flujo de
  reserva, venta, documentos y piloto.

## Assumptions

- El piloto inicial se orienta a inmobiliarias o gestoras de parcelaciones en
  Chile.
- KMZ/KML es el formato productivo de entrada para geometrías; CAD DWG/DXF queda
  para una etapa futura.
- El administrador es responsable de aprobar reservas, ventas y documentos
  finales; la IA no toma decisiones finales en V1.
- Telegram y la plataforma web son canales válidos para aprobar solicitudes; si
  ambos canales intentan resolver la misma solicitud, gana la primera decisión
  válida registrada.
- Telegram y la plataforma web son canales válidos para operación de vendedores
  en terreno; la web sigue siendo la superficie principal para revisión completa
  y administración.
- El comprador no tiene cuenta propia en V1, pero sus datos y destinatarios de
  documentos son gestionados por vendedor o administrador.
- La trazabilidad mencionada en esta spec equivale a historial/auditoría: poder
  saber quién hizo qué, cuándo, sobre qué lote o documento, con qué datos y con
  qué resultado.
- Los documentos subidos del proyecto pueden alimentar variables de escritura,
  pero la extracción automática completa puede requerir revisión humana durante
  el piloto.
- La escritura V1 puede quedar como segundo hito dentro del MVP si la reserva
  PDF/DOCX y el flujo comercial P1 se cierran primero.
