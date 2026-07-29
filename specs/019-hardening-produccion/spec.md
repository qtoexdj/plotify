# Feature Specification: Hardening de producción del pipeline core

**Feature Branch**: `019-hardening-produccion`

**Created**: 2026-07-13

**Status**: Draft

**Input**: Auditoría integral del código, la base conectada y los flujos reales de creación de proyecto, geometría, venta, escritura, entrega y revisión móvil para determinar si Plotify está listo para producción.

## Contexto

Las suites automatizadas y los builds actuales pasan, y el recorrido real venta → escritura logra completar una minuta y sus entregas. Sin embargo, la prueba integral encontró brechas que hacen que el lanzamiento siga en estado **NO-GO**:

- un usuario autenticado puede alcanzar archivos de proyectos ajenos y existen operaciones privilegiadas con permisos más amplios que los roles de negocio;
- una minuta puede figurar como completa y ser entregada con placeholders literales, frases incompletas o cláusulas duplicadas;
- la creación de proyecto, la importación/asignación de geometrías y el cálculo posterior pueden dejar estados parciales o duplicados;
- una venta aprobada depende de un traspaso best-effort al pipeline de escritura, y reintentos concurrentes pueden duplicar generaciones o entregas;
- el estado comercial/legal y el estado visible de entrega pueden afirmar hitos que todavía no ocurrieron;
- la revisión jurídica deja acciones fuera del viewport en tamaños móviles y medianos;
- el historial de migraciones local y el entorno conectado no están completamente reconciliados.

SDD019 no agrega producto nuevo. Convierte el flujo core ya implementado en un sistema aislado por organización, verificable, durable, idempotente y honesto antes de autorizar producción.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Cada organización opera dentro de su frontera (Priority: P1)

Como responsable de una organización, quiero que mis archivos, proyectos, lotes y operaciones privilegiadas solo puedan ser leídos o modificados por actores autorizados de mi organización, para que ningún usuario externo, vendedor no asignado o visitante anónimo pueda acceder a información comercial o legal.

**Why this priority**: Una fuga cross-tenant o una operación privilegiada invocable por un rol incorrecto invalida el lanzamiento aunque el flujo funcional sea correcto.

**Independent Test**: Ejecutar una matriz de autorización con visitante anónimo, capability link vigente/expirado, admin y vendedor con sesión web o Mini App válida, Mini App revocada, vendedor asignado/no asignado, usuario de otra organización, superadmin y proceso interno. Verificar lectura, listado, creación, reemplazo, eliminación y operaciones privilegiadas sobre recursos de A y B; inventariar exactamente rutas FastAPI, Route Handlers, Server Actions y workers que alcanzan service-role/internal secret, y todos los egress runtime. Probar además webhooks firmados/replay, configuración productiva sin defaults inseguros, Prompt Ops y bots por gateway same-origin.

**Acceptance Scenarios**:

1. **Given** un archivo legal perteneciente a un proyecto de la organización A, **When** un usuario de la organización B intenta listarlo, leerlo, reemplazarlo o eliminarlo, **Then** cada intento es rechazado sin revelar existencia, ruta firmada, metadata ni contenido.
2. **Given** un vendedor de A asignado a un proyecto, **When** consulta el dashboard, la lista y el visor de ese proyecto, **Then** obtiene el mismo inventario comercial autorizado en las tres superficies, pero solo ve compradores, reservas, ventas, comisiones y documentos sensibles de sus propias operaciones; un vendedor no asignado no obtiene datos del proyecto.
3. **Given** una operación privilegiada interna, **When** la invoca un visitante anónimo o un usuario autenticado sin el rol requerido, **Then** se rechaza antes de mutar datos, secretos, roles, aprobaciones o integraciones.
4. **Given** una operación legítima iniciada por admin o por el proceso interno, **When** se ejecuta, **Then** deriva organización y permisos desde la sesión y los recursos persistidos, y deja trazabilidad del actor y resultado.
5. **Given** un archivo seleccionado durante onboarding, **When** se carga, reemplaza o elimina, **Then** pasa por el mismo control server-side de tipo, tamaño, proyecto, organización y rol que el resto de los archivos del producto.
6. **Given** una entrega que usa un enlace seguro, **When** el destinatario abre la capacidad vigente, **Then** solo puede leer el documento exacto, sin listar el bucket ni acceder a otro recurso; expiración, revocación, alteración de ruta o reutilización fuera del alcance son rechazadas.
7. **Given** una capacidad de lectura emitida para un destinatario, **When** vence su plazo máximo de siete días, pierde la membresía/asignación que la originó o un admin la revoca, **Then** toda solicitud posterior es rechazada inmediatamente; el endpoint transmite los bytes server-side y nunca expone al cliente una URL firmada reutilizable.
8. **Given** un admin de A y un usuario/vendedor/proyecto de B, **When** invoca directamente una Server Action o ruta interna con IDs/headers de B, **Then** el servidor deriva actor y tenant desde sesión+recurso, rechaza antes del service client y no elimina Auth global ni crea asignaciones cruzadas.
9. **Given** un webhook Meta con HMAC ausente/alterado, un webhook Telegram sin secret productivo válido o un update repetido, **When** llega al endpoint, **Then** se rechaza antes de parsear/encolar o se replaya idempotentemente, sin loguear body, chat, teléfono, token ni PII.
10. **Given** Prompt Ops o configuración de bot visible en la navegación, **When** un superadmin/admin autorizado guarda, activa, prueba, registra o elimina, **Then** la operación usa gateway same-origin y principal server-side, funciona end-to-end y nunca expone base URL/token; un actor no autorizado recibe denegación genérica.
11. **Given** una nueva llamada HTTP/SDK/LLM o superficie privilegiada runtime no clasificada, **When** corre el gate, **Then** el inventario exacto falla con el símbolo/callsite faltante; ninguna allowlist por conteo o lista parcial puede producir GO.

---

### User Story 2 - Ninguna minuta inválida se aprueba o entrega (Priority: P1)

Como administradora o revisora jurídica, quiero que la minuta aprobada y lista para entrega sea validada sobre el texto realmente renderizado antes de promoverse o entregarse, para que “lista” signifique que no contiene huecos, puntuación rota, repeticiones ni datos inventados.

**Why this priority**: El sistema puede entregar hoy un DOCX que los contadores declaran completo aunque el texto sea jurídicamente defectuoso. Es un bloqueo directo del producto documental.

**Independent Test**: Resolver y renderizar transitoriamente la matriz golden con combinaciones completas, faltantes y no aplicables; extraer el texto del DOCX y comprobar que los casos válidos pasan y los defectuosos se detienen antes de upload, persistencia de generación entregable o entrega.

**Acceptance Scenarios**:

1. **Given** que falta la nacionalidad u otro dato requerido del compareciente, **When** se prepara la minuta, **Then** el sistema registra un faltante estructurado y accionable; nunca inserta un placeholder literal ni lo declara resuelto.
2. **Given** una excepción marcada como no aplicable, **When** se resuelve la cláusula, **Then** se omite la unidad gramatical completa y el texto conserva sintaxis y puntuación correctas.
3. **Given** contenido con placeholder, conector huérfano, cláusula duplicada o token sin resolver, **When** se intenta aprobar, generar o entregar, **Then** el flujo queda bloqueado con códigos y mensajes estables, y no persiste un documento entregable.
4. **Given** una matriz previamente aprobada, **When** cambia su snapshot, versión, contenido o procedencia legal, **Then** la aprobación heredada deja de habilitar generación automática hasta una nueva validación.
5. **Given** una generación histórica sin veredicto semántico, **When** un usuario intenta presentarla como lista o volver a entregarla, **Then** se trata como no verificada hasta pasar la nueva validación.
6. **Given** una matriz o borrador interno todavía incompleto, **When** contiene faltantes tipificados, **Then** puede persistir como trabajo en curso con estado no listo; la prohibición de placeholders y texto defectuoso se aplica al documento aprobado o entregable, no a esos gaps estructurados.
7. **Given** una política de revisión por excepciones, **When** el caso intenta heredar aprobación automática, **Then** solo puede hacerlo desde una matriz de proyecto aprobada por un actor jurídico autorizado y una huella inmutable vigente; aceptar un warning técnico no equivale a aprobación jurídica.
8. **Given** una afirmación factual sobre partes, predio, lote, precio o título, **When** se valida el documento, **Then** el valor coincide con el snapshot y evidencia aprobados o queda como issue bloqueante trazable; el validador nunca completa hechos por inferencia no evidenciada.

---

### User Story 3 - Crear un proyecto produce un único estado coherente (Priority: P1)

Como administradora, quiero crear un proyecto, cargar su KMZ/KML y asignar lotes sin duplicados ni estados parciales, para poder confiar en que la geometría visible es la misma que alimentará superficies, servidumbres, deslindes y documentos.

**Why this priority**: La geometría es la fuente física y legal del producto. Duplicarla o dejar un proyecto a medias contamina todo el pipeline posterior.

**Independent Test**: Crear un proyecto con un archivo de cuatro features, repetir solicitudes, forzar fallos en cada frontera y ejecutar asignaciones concurrentes. El resultado válido debe tener un proyecto, el número exacto de lotes, cuatro geometrías canónicas y como máximo una geometría activa por lote.

**Acceptance Scenarios**:

1. **Given** una creación de proyecto con N lotes, **When** falla cualquier escritura del núcleo proyecto+lotes, **Then** no queda proyecto huérfano, lote parcial ni éxito visible.
2. **Given** la misma solicitud reenviada por doble clic o reintento de red, **When** se procesa con la misma identidad de operación, **Then** devuelve el mismo resultado sin crear otro proyecto, lote, archivo o geometría.
3. **Given** un archivo con cuatro features aceptadas, **When** se asignan a lotes o infraestructura, **Then** se actualizan esas cuatro representaciones canónicas; no se clonan otras cuatro filas.
4. **Given** dos asignaciones simultáneas al mismo lote, **When** compiten, **Then** solo una puede confirmarse y la otra recibe un conflicto recuperable.
5. **Given** que falla un cálculo posterior de servidumbre o enriquecimiento, **When** termina la operación, **Then** el proyecto queda explícitamente pendiente o con reparación requerida, muestra la causa y ofrece reintento; nunca aparece listo.
6. **Given** un archivo comprimido, XML o geometría maliciosa o excesiva, **When** llega al sistema, **Then** autenticación y autorización ocurren antes del procesamiento costoso y el archivo se rechaza dentro de límites documentados de recursos.
7. **Given** una edición de proyecto, **When** el cliente envía campos internos, de organización, auditoría o estado no editables, **Then** esos campos se rechazan y no se aplican silenciosamente.
8. **Given** filas históricas duplicadas, claves nulas o estados incompatibles, **When** se ejecuta la reconciliación, **Then** los casos deterministas se corrigen con auditoría y los ambiguos quedan en cuarentena/revisión; nada se borra o fusiona silenciosamente.
9. **Given** que varias features forman una misma infraestructura visual, **When** se combinan para cálculo o presentación, **Then** cada feature fuente se conserva canónica e inmutable y la unión queda como derivación versionada; combinar no altera el conteo ni consume la evidencia importada.

---

### User Story 4 - La venta llega durablemente a escritura y entrega (Priority: P1)

Como administradora y vendedor, quiero que una venta aprobada continúe hacia su caso, minuta y entregas aunque un proceso se reinicie o un proveedor falle, para no perder operaciones ni producir duplicados.

**Why this priority**: La aprobación comercial ya es irreversible para el usuario. Un hook best-effort o una carrera de generación deja la fuente de verdad en un estado que no se puede explicar ni reparar con confianza.

**Independent Test**: Inyectar caídas después de aprobar la venta, durante creación del caso, después del render, antes de registrar el archivo y durante cada entrega; reanudar procesos y lanzar al menos veinte invocaciones concurrentes sobre el mismo caso.

**Acceptance Scenarios**:

1. **Given** una venta aprobada, **When** API o worker cae inmediatamente después del cambio comercial, **Then** queda una obligación durable única que se retoma automáticamente al volver el worker.
2. **Given** veinte disparos concurrentes para la misma huella inmutable de caso, snapshot y matriz/versión aprobada, **When** todos terminan, **Then** existe una sola generación automática válida y una sola obligación de entrega por destinatario y canal.
3. **Given** un fallo después de crear el archivo pero antes de confirmar la generación, **When** se recupera el flujo, **Then** no queda archivo huérfano ni se genera una segunda minuta indistinguible.
4. **Given** una entrega obligatoria pendiente o fallida, **When** se consulta el caso, **Then** no aparece como completamente entregado; muestra estado, último error, intentos y próximo reintento.
5. **Given** que el documento está disponible por web pero Telegram falla, **When** se calcula el resultado, **Then** el documento puede quedar listo con entrega parcial visible y Telegram reintentable, sin afirmar entrega total.
6. **Given** una venta recién aprobada, **When** se actualizan sus registros, **Then** los timestamps cambian y la etapa indica espera de escritura/firma; “escritura firmada” solo se usa tras un evento real de firma.
7. **Given** una solicitud comercial reenviada desde web, Telegram o mini app, **When** conserva la misma identidad de operación, **Then** produce una sola aprobación y una sola cadena de auditoría.
8. **Given** una venta aprobada, **When** se crean sus obligaciones, **Then** el vendedor de esa solicitud y los admins activos quedan congelados como snapshot de destinatarios; un reintento no selecciona la solicitud “más reciente” ni cambia silenciosamente el conjunto.

---

### User Story 5 - La revisión jurídica funciona en cualquier viewport (Priority: P2)

Como administradora o revisora que trabaja desde notebook, tablet o teléfono, quiero ver el título, contenido y acciones de la revisión jurídica dentro del viewport y operarlos con teclado o táctil, para poder resolver una excepción sin quedar atrapada en un panel.

**Why this priority**: El flujo core existe, pero en viewports reales las acciones pueden quedar fuera de pantalla; eso hace que una venta quede detenida sin salida operable.

**Independent Test**: Abrir la revisión legal y el visor de geometría en navegador real a 320×568, 375×667, 769×880 y desktop; recorrer foco, scroll, cerrar, rechazar y aprobar sin usar herramientas de desarrollo.

**Acceptance Scenarios**:

1. **Given** un viewport soportado, **When** se abre un panel inferior, **Then** su caja permanece dentro del viewport y el título, cierre y acción principal están visibles o alcanzables mediante un único scroll interno.
2. **Given** navegación solo por teclado, **When** se recorre el panel, **Then** el foco permanece contenido, el orden es lógico, Escape cierra y todas las acciones son alcanzables.
3. **Given** un lector de pantalla, **When** abre cada diálogo o panel del flujo, **Then** recibe nombre y descripción accesibles, sin advertencias de semántica ausente.
4. **Given** contenido largo y safe areas móviles, **When** se desplaza, **Then** header y acciones no desaparecen fuera de la superficie ni crean dos scrolls competidores.
5. **Given** cualquiera de los seis consumidores directos del `Sheet` compartido —operaciones, editor de variables jurídicas, lotes, navegación móvil, visor geográfico o mesa—, **When** se prueba a 200% de zoom y 320 CSS px de ancho, **Then** mantiene reflow sin scroll horizontal, foco no oculto y controles táctiles de al menos 44×44 CSS px; 24×24 queda solo como piso AA para controles compactos no táctiles con excepción documentada y espaciado suficiente.

---

### User Story 6 - El lanzamiento tiene un veredicto reproducible (Priority: P2)

Como responsable de lanzamiento, quiero un gate ejecutable que confronte código, migraciones, seguridad, datos de prueba y flujos E2E contra el entorno objetivo, para emitir GO/NO-GO con evidencia y rollback, no por percepción.

**Why this priority**: Los tests aislados verdes no detectaron las brechas encontradas en navegador y base real. Producción necesita una definición de terminado transversal.

**Independent Test**: Levantar un entorno limpio desde las migraciones canónicas, comparar historial con el entorno conectado, ejecutar tests de base/API/web/navegador y simular rollback sin tocar datos productivos.

**Acceptance Scenarios**:

1. **Given** una migración local ausente, duplicada o con historial remoto distinto, **When** corre el gate, **Then** bloquea el despliegue y muestra la divergencia exacta.
2. **Given** un aviso de seguridad explotable, secreto de alta confianza en el repositorio o una prueba cross-tenant fallida, **When** corre el gate, **Then** el resultado es NO-GO.
3. **Given** datos identificados como prueba en el entorno objetivo, **When** se prepara el lanzamiento, **Then** existe inventario, respaldo y decisión humana explícita de limpiar o conservar; el gate no borra datos por sí solo.
4. **Given** todos los criterios satisfechos, **When** finaliza el gate, **Then** produce un reporte sin secretos con versiones, comandos, resultados, métricas, riesgos aceptados, responsable y plan de rollback.

### Edge Cases

- Un usuario pertenece a más de una organización: toda operación exige un workspace seleccionado explícitamente y vuelve a validar su membresía y el recurso; si falta o es ambiguo, rechaza en vez de elegir la membresía más reciente u otra arbitraria.
- Una ruta de archivo contiene segmentos ausentes, UUID inválido, traversal, encoding ambiguo o bucket no permitido.
- Un usuario cambia de rol o pierde membresía mientras conserva una sesión o URL firmada anterior.
- Un enlace opaco se filtra, expira, se revoca o se intenta reutilizar para enumerar o sustituir la ruta autorizada.
- Dos admins aprueban, rechazan, asignan o regeneran el mismo recurso al mismo tiempo.
- La misma carga llega con distinto nombre pero contenido idéntico, o el mismo nombre con contenido distinto.
- Un KMZ contiene muchas entradas, ratio de expansión extremo, KML anidado, XML malformado, demasiadas features o demasiadas coordenadas.
- Storage confirma upload y luego falla la escritura transaccional, o sucede lo contrario.
- Una generación histórica no tiene manifiesto semántico o apunta a un archivo faltante.
- La matriz cambia mientras otra ejecución está renderizando.
- No existe ningún destinatario obligatorio, un usuario no tiene Telegram vinculado o el proveedor queda fuera de servicio.
- El worker pierde el lease, reinicia o procesa dos veces el mismo evento.
- Una clave de idempotencia legacy es nula.
- El entorno remoto ya contiene el DDL de una migración, pero no su versión en historial.
- El panel tiene contenido mayor que la altura disponible, zoom de texto alto o safe area.
- Un valor que parece secreto en documentación resulta ser antiguo o de prueba: se trata como comprometido hasta verificar y rotar, sin imprimirlo en logs ni reportes.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Todo acceso a archivos privados DEBE aplicar default-deny. Listar, crear, reemplazar y eliminar siempre exige sesión, organización, proyecto, rol y operación válidos; una lectura sin sesión solo puede ocurrir mediante una capacidad opaca, expirable y revocable que autoriza un documento exacto y ninguna enumeración. Cada emisión/renovación usa 32 bytes CSPRNG (256 bits), entrega el plaintext una sola vez, persiste solo su hash y rota transaccionalmente sin reutilizar tokens. Ninguna superficie web, FastAPI, Mini App, Telegram o generador legacy puede devolver bucket, path ni URL Storage firmada; las referencias públicas son `fileId`, `generationId`, `deliveryId` o la ruta Plotify de capacidad.
- **FR-002**: La autorización de vendedores DEBE ser consistente en dashboard, listados, visor, descargas y APIs. Solo una fila activa `vendor_projects` del mismo tenant concede inventario del proyecto; `lots.vendedor_id`/la solicitud comercial limitan datos sensibles a operaciones propias pero nunca conceden ni restauran inventario después de desasignar. Revocar o reasignar produce el mismo resultado en web, Mini App y RLS.
- **FR-003**: Toda operación privilegiada DEBE tener una clasificación documentada de actor permitido, tenant derivado desde recurso persistido, alcance, capability de servicio, auditoría, idempotencia, callers y prueba negativa. El universo combina catálogo/ACL/triggers/policies de Postgres con las rutas FastAPI, Route Handlers, Server Actions y workers que alcanzan service-role, admin Auth o internal-secret; exige igualdad exacta de firmas/método-path/símbolos: cero superficies nuevas sin clasificar y cero entradas obsoletas.
- **FR-004**: Ninguna operación privilegiada interna o de secretos DEBE ser invocable por visitante anónimo ni por un usuario autenticado sin autorización de negocio.
- **FR-005**: Las operaciones que permanezcan disponibles para usuarios DEBEN validar internamente identidad, rol, workspace seleccionado, target y pertenencia usando sesión confiable más estado persistido; los identificadores/body/headers enviados por cliente nunca son autoridad y una membresía no puede escogerse implícitamente por orden temporal. Un shared/internal secret autentica al servicio, no autoriza por sí solo al actor ni al tenant de negocio.
- **FR-006**: Los permisos de nuevos objetos de base DEBEN ser explícitos, mínimos y reproducibles en entornos donde tablas y funciones no se exponen automáticamente.
- **FR-007**: Cargas y eliminaciones de archivos de proyecto DEBEN usar un único contrato server-side con allowlist versionada de categoría, extensión/MIME, magic bytes, tamaño, conteo, visibilidad y retención. Imágenes, documentos y fuentes geográficas reciben metadata autoritativa `fileId`; archivo, metadata y referencia de negocio deben converger mediante compensación o reparación durable, nunca mediante paths cliente o éxito parcial silencioso. Los writers nuevos de onboarding y registro legal aceptan `fileId`, no `storage_bucket`/`storage_path`, y una referencia legal fallida impide responder éxito aunque los bytes ya hayan sido aceptados.
- **FR-008**: Intentos denegados y mutaciones críticas DEBEN producir auditoría estructurada sin registrar tokens, URLs firmadas, documentos ni secretos. La auditoría de una mutación crítica se confirma o revierte en la misma transacción que el cambio de negocio. Una denegación nunca se convierte en permiso por falla de auditoría: con la base disponible, su evento durable se confirma antes de responder; si la dependencia de auditoría no está disponible, la operación sigue denegada, responde de forma genérica y emite una señal local de alta severidad que bloquea GO hasta reconciliar el intento.
- **FR-009**: El repositorio y la memoria oficial DEBEN quedar libres de secretos activos o de alta confianza; cualquier valor potencialmente expuesto DEBE verificarse y rotarse antes del GO. En producción, secretos de Mini App, webhooks, cifrado y servicios internos son obligatorios y no pueden estar vacíos, usar placeholders/defaults conocidos ni viajar al browser; endpoints/base URLs deben ser HTTPS allowlisted y el gate registra solo fingerprints/presencia, nunca valores.
- **FR-010**: El sistema DEBE producir un veredicto semántico determinista tanto sobre el contenido estructurado resuelto como sobre los bytes DOCX renderizados antes de aprobar la minuta, persistirla como generación entregable o enviarla. La aprobación humana y la heredada por sistema usan el mismo intento inmutable y ninguna cambia estado antes del PASS. El veredicto queda ligado a snapshot, matriz/versión, template/versión, hashes de contenido y artefacto, renderer y ruleset.
- **FR-011**: El veredicto DEBE detectar al menos placeholders literales, tokens remanentes, líneas de relleno no autorizadas, sustituciones vacías que rompen gramática, puntuación huérfana, cláusulas/párrafos duplicados y afirmaciones factuales que no coinciden con snapshot/evidencia aprobados. La taxonomía, normalización y excepciones permitidas son versionadas y cubiertas por fixtures golden.
- **FR-012**: Los datos legales faltantes DEBEN conservarse como faltantes estructurados con productor, evidencia, acción y causa. La individualización de cada vendedor conserva nacionalidad, estado civil y tratamiento como hechos evidenciados dentro de `vendedor.comparecientes[]`; si cualquiera requerido falta, queda `missing` y la comparecencia no se materializa como texto aprobado. Una matriz o borrador interno puede persistir esos gaps con estado no listo, pero no puede convertirlos en texto placeholder considerado resuelto ni promoverlos a documento entregable.
- **FR-013**: El estado no aplicable DEBE omitir una unidad gramatical completa y auditable; no puede resolverse mediante reemplazo ciego por cadena vacía dentro de prosa obligatoria.
- **FR-014**: Una matriz automática solo PUEDE heredar aprobación legal si la matriz de proyecto fue aprobada por un actor con un grant jurídico persistido, vigente y auditado, cuyo otorgamiento/revocación, grantor, razón y evidencia son trazables y cuya identidad queda en el snapshot de aprobación. Su procedencia, versión, snapshot y política deben seguir vigentes y el artefacto debe obtener veredicto semántico satisfactorio; ser admin o aceptar un warning no equivale por sí solo a aprobación legal.
- **FR-015**: Generaciones históricas sin veredicto DEBEN quedar no verificadas. Inspeccionar bytes existentes puede detectar fallas, pero solo puede producir un veredicto satisfactorio y habilitar una nueva entrega cuando se reconstruyen y verifican el snapshot aprobado, AST/manifiesto resuelto, matriz y template versionados, renderer/ruleset, evidencia y aprobación jurídica originales, y los bytes coinciden con esa procedencia. Si falta cualquier elemento permanecen no verificadas; regenerar desde fuentes vigentes crea una generación nueva.
- **FR-016**: La UI DEBE derivar sus contadores, blockers y estado listo del mismo veredicto canónico que usa la generación.
- **FR-017**: La creación de proyecto y sus lotes DEBE ser all-or-nothing y aceptar una identidad de operación obligatoria para reintentos. En el piloto `total_lotes` DEBE ser un entero entre 1 y 100 y rechazarse antes de asignar memoria o escribir si queda fuera de ese rango.
- **FR-018**: Cada feature geográfica aceptada DEBE tener una sola representación canónica dentro de una importación y cada lote DEBE tener como máximo una geometría activa. Uniones o footprints usados para infraestructura son derivados versionados que referencian features fuente y no las reemplazan.
- **FR-019**: Asignar geometría DEBE confirmar atómicamente la geometría canónica, `lot_id`/`geometry_id`, flag de asignación, superficie base, hash y timestamps bajo concurrencia. Deslindes, servidumbres y otros enriquecimientos posteriores usan esa fuente y quedan pendientes/reparables hasta completar.
- **FR-020**: Las repeticiones de importación y asignación con la misma identidad y payload canónico DEBEN devolver el resultado anterior; reutilizar la identidad con payload distinto devuelve conflicto. El mismo contenido con otro nombre reutiliza la importación. Un reemplazo explícito archiva la versión previa, conserva su evidencia, invalida derivados/readiness/documentos dependientes y exige recalcular antes de volver a promover el proyecto.
- **FR-021**: El procesamiento de KMZ/KML DEBE autenticar y autorizar antes de leer el cuerpo completo o descomprimir, aplicar límites configurables de bytes, ratio, entradas, estructura XML, features, coordenadas y tiempo, y controlar tasa/concurrencia por actor y organización para impedir abuso autenticado.
- **FR-022**: Para el piloto de 50–100 lotes, los límites iniciales DEBEN admitir hasta 20 MB comprimidos, 100 MB expandidos, 2.000 features y 250.000 posiciones de coordenadas; superar cualquier límite devuelve un error específico sin persistencia parcial.
- **FR-023**: Los fallos de servidumbre o enriquecimientos posteriores DEBEN persistir estado pendiente/reparable, causa, intentos y acción; bloquean readiness documental hasta completarse.
- **FR-024**: Crear o editar proyecto DEBE usar esquemas estrictos y allowlists; campos de tenant, auditoría, relaciones internas y estados protegidos son rechazados.
- **FR-025**: Aprobar una venta DEBE registrar en la misma unidad comercial una obligación durable y única de continuar el pipeline de escritura.
- **FR-026**: Los workers DEBEN resolver `automatic_escritura` antes del lease y revalidarlo antes del primer efecto. OFF/hard-off difiere la misma obligación durable, libera cualquier lease, no incrementa intento ni crea retry/dead-letter/hot-loop; al volver elegible reanuda esa fila. Solo entonces aplican exclusión mutua, lease, heartbeat, backoff, máximo de intentos y camino a reparación/dead-letter sin perder la identidad original. Los jobs ARQ generales fuera del outbox también DEBEN clasificar errores, solicitar retry explícito con backoff acotado y persistir un dead-letter redactado; ningún hook de fin puede inferir éxito desde campos inexistentes del contexto ni perder una excepción normal. Edad de cola, diferidos, leases vencidos, retries, dead-letter y errores terminales deben exponer métricas y alertas con dueño.
- **FR-027**: La generación automática DEBE ser única por una huella inmutable de organización, caso, snapshot, matriz/template y sus versiones, renderer, ruleset, schema, normalización, aprobación/procedencia y política de revisión, independiente del número de intento. Regeneraciones humanas requieren identidad no nula, motivo obligatorio y trazabilidad propios.
- **FR-028**: Archivo, fila de generación y estado semántico DEBEN converger sin huérfanos; una caída en cualquier frontera debe ser compensable o reanudable.
- **FR-029**: Cada obligación de entrega DEBE ser única por generación, destinatario y canal, y registrar por separado estado histórico de obligación, disponibilidad de capability, acceso, intentos, último error, próxima ejecución y timestamps. El snapshot se fija al aprobar la venta con el vendedor usuario de esa solicitud y los admins activos; un vendedor sin `user_id` vinculado bloquea la aprobación con una acción explícita. Cambios posteriores de membresía revocan acceso y exigen reasignación auditada, no una selección implícita distinta.
- **FR-030**: El sistema DEBE mantener ejes separados de validez semántica, generación, entrega histórica y capability actual. El caso solo PUEDE figurar completamente entregado cuando existe evidencia inmutable de que el documento válido estuvo disponible por el canal web obligatorio y las obligaciones requeridas fueron satisfechas; expiración/revocación posterior se muestra aparte y habilita renovación sin borrar historia. Telegram y notificaciones admin configuradas son secundarias y sus fallos producen entrega parcial visible y reintentable, nunca invalidan el artefacto.
- **FR-031**: Venta, caso, generación y entrega DEBEN usar estados y timestamps veraces. La única transición a “escritura firmada” exige registrar un evento inmutable e idempotente con actor autenticado, fecha real y evidencia privada aceptada del mismo caso/proyecto; `signed_at` debe quedar entre `max(generation.ready_at, approval/finalization_at) - 5 minutos` y tiempo servidor + 5 minutos. Generación o delivery nunca producen esa transición. Esto registra una firma ocurrida fuera de Plotify y no integra un proveedor de firma electrónica.
- **FR-032**: Toda solicitud comercial reintentable, independientemente del canal, DEBE llevar identidad de operación no nula, acotada por organización, actor, tipo y recurso. Para Telegram/Meta, el borde deriva esa identidad del `provider + bot/account + update/message_id`, la liga al hash canónico y la propaga sin reemplazar hasta reserva, aprobación, outbox y notificaciones; claim, crash o replay posterior al enqueue no puede crear una segunda aprobación ni cadena de efectos. La misma identidad y payload canónico devuelve el resultado original; la misma identidad con payload distinto devuelve conflicto durante toda la retención operativa y legal definida.
- **FR-033**: Los seis consumidores directos del `Sheet` compartido —operaciones, editor de variables jurídicas, lotes, navegación móvil, visor geográfico y mesa— DEBEN permanecer contenidos en viewports desde 320×568 hasta desktop, con un único cuerpo desplazable y acciones alcanzables.
- **FR-034**: Diálogos y paneles DEBEN cumplir WCAG 2.2 AA: nombre y descripción accesibles, foco contenido y no oculto, orden lógico, cierre por Escape, reflow a 320 CSS px y 200% de zoom, contraste y safe area. Los controles destinados a interacción táctil DEBEN medir al menos 44×44 CSS px; 24×24 es solo el piso para un control compacto no táctil cuando existe una excepción documentada con espaciado suficiente.
- **FR-035**: El gate de lanzamiento DEBE comparar archivos de migración, historial aplicado y forma real del esquema antes de desplegar; una divergencia bloquea aunque el DDL ya exista remotamente, y solo puede resolverse mediante el proceso canónico y auditado de reparación de historial.
- **FR-036**: Cambios de esquema DEBEN ser append-only en la carpeta canónica, incluir prueba y estrategia de rollback/forward-fix, y regenerar tipos/contratos cuando corresponda. El rollback o restore se ensaya en un entorno descartable con seeds/fixtures controlados después de existir la migración final de enforcement y se refresca sobre el SHA candidato exacto antes del GO; una nota de irreversibilidad o un ensayo que no reproduzca todas las migraciones no basta.
- **FR-037**: Seguridad de base DEBE probarse automáticamente con una matriz real de roles y tenants; los tests con mocks no son evidencia suficiente.
- **FR-038**: Concurrencia, fallos inyectados, recuperación de worker y E2E de navegador real DEBEN formar parte del gate reproducible.
- **FR-039**: Avisos de seguridad explotables DEBEN llegar a cero; avisos no bloqueantes restantes requieren fingerprint, baseline, dueño, impacto, justificación, presupuesto y fecha de revisión. La visibilidad de `avatars` permite como máximo lectura por clave de objeto ya conocida: listar globalmente o mutar el avatar de otra persona queda denegado y probado, no asumido por el conteo del advisor.
- **FR-040**: El reporte final DEBE declarar GO/NO-GO, evidencia, riesgos aceptados, inventario de datos de prueba, plan de rollback, responsables y estado de gates humanos/quickstarts pendientes de SDD010, SDD011, SDD016, SDD017 y SDD018, sin realizar limpieza destructiva automática. Puede reemplazar un gate previo solo con evidencia equivalente o superior explícitamente vinculada. Los controles `automatic_escritura`, `canonical_geometry_import` y `document_capabilities` son estado versionado default-off, compartido por web/API/worker, acotable por organización/proyecto y mutable solo con compare-and-set, actor, razón y auditoría; resolverlos mal falla cerrado y apagarlos nunca reactiva un writer o acceso legacy inseguro. Los hard-off de despliegue usan las tres claves exactas `PLOTIFY_HARD_OFF_*` más `PLOTIFY_RELEASE_CONFIG_VERSION`, faltante/inválido equivale a activado, y web/API/worker DEBEN publicar attestations frescas de SHA, digest inmutable del artefacto realmente ejecutado, config y fingerprint. El SHA, deployment/epoch, roster de slots y digests esperados provienen de un manifiesto autenticado emitido independientemente por CI/deployer y no de los propios heartbeats; reemplazo o scale-down retira un slot mediante evento auditado, y filas históricas de otro deployment no cuentan como extras. Ausencia, manipulación, staleness, slot activo inesperado, digest no coincidente o desacuerdo fuerza OFF y bloquea expansión. El gate final se ejecuta una sola vez sobre un `releaseSha` limpio y explícito y archiva el bundle redactado completo en almacenamiento inmutable, con hash, locator, procedencia, readback y retención mínima de 365 días. Después solo se permite un `handoffSha` hijo directo cuyo diff contiene el recibo documental SDD019 y el cambio de checkbox T120, sin otra fuente/tarea; la validación post-handoff DEBE derivar `releaseSha` desde el reporte, comprobar parentesco/diff/hashes/archivo y nunca volver a ejecutar el gate contra el `HEAD` documental. El cierre de rollout usa luego un `rolloutReceiptSha` documental con recibo/summary derivados y solo el checkbox T121, siempre ligado al `releaseSha` desplegado.
- **FR-040a**: Para interpretar FR-040, solo una attestation explícitamente retirada o stale de otro deployment se considera histórica. Cualquier runtime fresco y no retirado del mismo environment —aunque declare otro deployment— es un slot extra bloqueante; un heartbeat posterior al evento de retiro invalida ese retiro y vuelve a bloquear el gate.
- **FR-041**: Antes de activar restricciones nuevas, el sistema DEBE detectar geometrías duplicadas, identidades nulas, generaciones/entregas repetidas, timestamps obsoletos y estados comerciales o legales incompatibles. La remediación determinista es auditable; los casos ambiguos quedan en cuarentena y bloquean readiness hasta revisión humana.
- **FR-042**: Toda integración externa del pipeline DEBE usar allowlist de destinos, sanitización de URL/host, revalidación de redirects, timeout total máximo de 10 segundos por intento, errores redactados y reintentos idempotentes; ningún proveedor puede mantener abierta una transacción de base ni convertir un fallo secundario en éxito silencioso. Un inventario derivado de código cubre todos los `fetch`/clientes HTTP/SDK/LLM de web, API y worker —incluidos browser e indirectos— y falla ante callsites missing/stale/duplicados; cada fila clasifica destino, datos/secretos, frontera transaccional, timeout, retry e IDs de prueba.
- **FR-043**: El gate DEBE ejecutar análisis de dependencias y secretos con reglas versionadas. Vulnerabilidades críticas/altas alcanzables, secretos activos o coincidencias de alta confianza bloquean; solo falsos positivos demostrados pueden entrar a una allowlist con huella, dueño y expiración, nunca con el valor sensible. En el proyecto Supabase vinculado, la protección contra passwords filtrados DEBE estar habilitada y probada mediante evidencia de configuración redactada antes del GO; detectarla deshabilitada o no verificable es bloqueante.
- **FR-044**: La operación DEBE alertar por obligación de workflow mayor a 2 minutos después de recuperar worker y dependencias, lease vencido, dead-letter, entrega requerida fallida o rechazo semántico repetido, con runbook, responsable y datos suficientes para reparar sin exponer PII.

### Key Entities

- **Clasificación de operación privilegiada**: inventario de funciones y acciones sensibles con actor permitido, tenant derivado, exposición, auditoría y decisión de acceso.
- **Objeto privado de proyecto**: archivo identificado por bucket y ruta canónica, ligado a una organización y proyecto, con operaciones autorizadas por separado.
- **Capacidad de lectura**: token opaco, acotado a un documento y propósito, con expiración, revocación y auditoría; nunca concede listado ni mutación.
- **Importación geográfica**: intento idempotente de procesar un archivo, con hash, límites, conteos, estado, errores y features canónicas.
- **Asignación geográfica**: vínculo único entre una feature canónica y un lote o infraestructura, con métricas y estado de cálculo.
- **Veredicto semántico**: resultado versionado de validar contenido resuelto y documento renderizado; contiene estado, issues estables, snapshot y timestamp.
- **Snapshot de destinatarios**: vendedor de la solicitud aprobada y admins activos al commit comercial, con obligaciones por canal congeladas para reintentos y revocación ante pérdida de acceso.
- **Obligación durable de workflow**: evento único creado junto a la mutación comercial, reclamable y reintentable por worker.
- **Generación de minuta**: documento versionado ligado a caso, snapshot, matriz y veredicto satisfactorio, con identidad de operación.
- **Obligación de entrega**: envío único por generación, destinatario y canal, con ciclo de reintentos independiente.
- **Evidencia de lanzamiento**: reporte inmutable de versiones, migraciones, pruebas, advisors, E2E, datos de prueba, riesgos y rollback.
- **Intento de aprobación semántica**: candidato inmutable que liga actor/origen, grant, matriz, snapshot, policy y hashes antes de que una aprobación humana o automática pueda hacerse efectiva.
- **Evento de firma de escritura**: registro administrativo e inmutable de una firma externa real con actor, fecha, evidencia privada e identidad idempotente; es la única autoridad para la etapa `escritura_firmada`.
- **Control de rollout**: estado versionado y auditado por feature/organización/proyecto cuya ausencia equivale a OFF y que nunca relaja fronteras de seguridad.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El 100% de la matriz de autorización (anónimo, capability vigente/expirada/revocada, admin A, vendedor A asignado/no asignado, usuario B, Mini App admin/vendedor vigente y sesión expirada/revocada, superadmin y proceso interno) permite solo las operaciones esperadas y registra cero lecturas o mutaciones cross-tenant.
- **SC-002**: El entorno objetivo reporta cero avisos de seguridad por operaciones privilegiadas ejecutables por anónimo, cero operaciones internas ejecutables por usuarios no autorizados y cero políticas amplias sobre archivos privados.
- **SC-003**: El 100% de las combinaciones golden y de regresión promovidas a documento entregable genera texto sin placeholders, tokens, conectores huérfanos ni duplicados; cada fixture defectuoso falla antes de upload, fila de generación entregable y entrega, mientras conserva sus gaps estructurados en el borrador.
- **SC-004**: El 100% de las generaciones históricas conservadas queda clasificado como validado o no verificado; una no verificada permanece visible para auditoría interna, pero nunca aparece como lista ni permite una nueva entrega externa.
- **SC-005**: En fallos inyectados en cada escritura de creación, quedan 0 proyectos y 0 lotes parciales; veinte reintentos con la misma identidad dejan exactamente 1 proyecto y N lotes.
- **SC-006**: Un archivo de cuatro features produce exactamente cuatro geometrías canónicas; veinte asignaciones concurrentes al mismo lote dejan exactamente una geometría activa y una referencia coherente.
- **SC-007**: El 100% de archivos que excede cualquiera de los límites o cuotas definidos se rechaza antes de persistir datos parciales; las pruebas de carga demuestran el presupuesto documentado de memoria, tiempo y concurrencia por actor/organización.
- **SC-008**: Una venta confirmada seguida de caída se retoma automáticamente y alcanza caso o excepción accionable dentro de 2 minutos desde que el worker vuelve a estar disponible.
- **SC-009**: Veinte cascadas concurrentes sobre la misma huella de caso/snapshot/matriz-versión dejan exactamente una generación automática y una obligación por destinatario/canal; reintentos posteriores mantienen esos conteos.
- **SC-010**: Ningún caso con entrega obligatoria fallida figura como totalmente entregado; al recuperarse el canal, el retry cambia el estado sin duplicar archivo, auditoría comercial ni entrega.
- **SC-011**: El 100% de ventas nuevas actualiza timestamps y queda en espera de escritura/firma; cero registros nuevos usan “escritura firmada” sin evidencia real.
- **SC-012**: En 320×568, 375×667, 769×880, desktop y 200% de zoom, los seis consumidores directos del panel compartido cumplen reflow WCAG 2.2 AA, targets táctiles de 44×44 CSS px —o excepción compacta no táctil documentada nunca menor a 24×24—, foco/teclado y cero violaciones críticas o serias de axe por nombre, descripción, rol o contraste.
- **SC-013**: Un vendedor asignado ve el mismo inventario del proyecto en dashboard, lista y visor y solo datos sensibles de operaciones propias; uno no asignado o de otra organización obtiene cero datos del proyecto en el 100% de pruebas E2E.
- **SC-014**: Archivos locales, historial remoto y esquema objetivo coinciden; un entorno limpio se reconstruye desde migraciones canónicas más seeds/fixtures controlados, supera las pruebas de base y completa un ensayo documentado de rollback/restore o forward-fix en entorno descartable.
- **SC-015**: Los gates completos de API, web, tipos, lint, formato, build, migraciones, contratos, base real, concurrencia y navegador quedan verdes en una misma revisión.
- **SC-016**: El escaneo final contiene cero secretos activos o de alta confianza; cualquier credencial potencialmente expuesta tiene evidencia de rotación sin registrar su valor.
- **SC-017**: El reporte de cierre contiene un veredicto único GO/NO-GO y evidencia reproducible de cada SC. Son no dispensables todas las historias P1, la paridad de migraciones, la ausencia de secretos activos y la recuperación durable; solo un hallazgo P2 no crítico puede aceptarse mediante excepción humana explícita, temporal y documentada.
- **SC-018**: El inventario legacy clasifica el 100% de geometrías duplicadas, claves nulas, generaciones/entregas repetidas y estados `escritura_firmada` sin evidencia; cero caso ambiguo queda promovido como listo y toda remediación conserva auditoría.

## Assumptions

- Los datos actualmente conectados son de prueba. SDD019 inventaría y propone limpieza, pero ninguna eliminación se ejecuta sin aprobación humana explícita y respaldo.
- Se reutilizan autenticación, workspaces, roles admin/vendedor, worker y canales existentes; no se introduce un sistema de identidad nuevo.
- La minuta DOCX editable sigue siendo el producto documental canónico. Un renderer PDF final, firma electrónica y certificación notarial/CBR permanecen fuera de alcance.
- La disponibilidad web del documento es la entrega obligatoria base. Telegram es un canal operacional requerido cuando está configurado, pero su falla produce entrega parcial visible y retry, no invalida el DOCX ya validado.
- La política de revisión jurídica y el flag four-eyes existentes no cambian por defecto; su valor productivo debe quedar explícito y probado.
- El piloto objetivo mantiene proyectos de aproximadamente 50–100 lotes. Los límites de FR-022 son el baseline inicial y pueden elevarse solo con evidencia de carga y presupuesto.
- El objetivo de recuperación de 2 minutos de SC-008 es un baseline del piloto que debe medirse bajo fallos inyectados y ajustarse antes del GO si la capacidad real exige un objetivo más estricto; nunca puede reemplazarse por un proceso manual silencioso.
- Las remediaciones de base son incrementales; no se reescribe la migración baseline ni se aplica DDL manual sin archivo e historial.
- La excepción usada durante SDD018 para aceptar DDL remoto sin registrar su migración queda revocada: una forma equivalente con historial divergente sigue siendo drift y bloquea producción.
- El código y la base auditados prevalecen sobre notas de memoria obsoletas. La memoria debe actualizarse al cerrar la implementación.
- SDD016, SDD017 y SDD018 permanecen como dependencias: se endurecen sus contratos sin crear una segunda máquina de estados.
- SDD010 T023 ya fue aprobado y SDD017 T036 completado; SDD019 reutiliza su evidencia y comprueba regresión sin reabrirlos. Los gates aún abiertos SDD011 T026, SDD016 T082 y SDD018 T044 deben ejecutarse con sus criterios exactos o sustituirse por evidencia explícitamente equivalente trazada en el reporte final.
- Se dispondrá de cuentas de prueba admin y vendedor para el quickstart; las credenciales se ingresan de forma interactiva y nunca se guardan en los artefactos.

## Out of Scope

- Nuevas funciones comerciales, CRM, pagos, integración con un proveedor de firma electrónica/FEA, comparador visual de documentos o rediseño amplio de navegación. Sí permanece en alcance el registro administrativo, privado y auditable de una firma ya realizada fuera de Plotify, porque es la única evidencia que autoriza `escritura_firmada`.
- Corregir todos los avisos de rendimiento históricos sin relación con los caminos core; sí se exige no empeorar el baseline y resolver los que afecten las historias de SDD019.
- Cambiar la política comercial de aprobación humana de ventas o activar four-eyes por decisión implícita.
- Certificar jurídicamente documentos históricos o reemplazar la revisión de un profesional.
- Limpiar datos de prueba, rotar credenciales o desplegar migraciones durante la generación de este SDD.
- Sustituir Supabase, el worker, el renderer DOCX o el stack actual.
