# Research: Mesa de Escritura — Consolidacion UX Legal

**Feature**: `010-mesa-escritura` | **Date**: 2026-06-11

**Input**: [spec.md](./spec.md). Auditoria de codigo real: componentes de
`apps/web/src/components/documents/matriz/`, manifiesto en
`apps/web/src/lib/documents/matriz-types.ts`, catalogo en
`apps/api/services/legal_variable_catalog.py`, labels existentes en
`apps/web/src/lib/legal/variable-resolution-types.ts`, skills del repo
(`ui-ux-pro-max`, `interaction-design`, `accessibility`, `frontend-design`,
`shadcn`, `tailwind-v4-shadcn`).

Formato por decision: **Decision / Rationale / Alternatives considered.**

---

## D1 — Documento continuo sobre el modelo de clausulas existente

**Decision**: La mesa renderiza la escritura completa apilando las clausulas
en orden dentro de una sola superficie desplazable. La lectura usa el
contenido **resuelto** del manifiesto (server-side, ya existente por
clausula en `resolved_content`); la edicion activa un editor ProseKit
montado **in-place sobre la clausula clickeada** (una instancia a la vez),
manteniendo el modelo de guardado por matriz con overrides por clausula y
optimistic locking intactos.

**Rationale**: El contenido canonico vive por clausula
(`escritura_template_clauses.content_json` + overrides en
`escritura_matrices`). Un unico documento ProseMirror exigiria migrar el
modelo de datos y el renderer DOCX — exactamente lo que el feature promete
no tocar (FR-017). Apilar render resuelto es barato, fiel al DOCX (mismo
resolutor) y la edicion in-place da la sensacion de procesador de texto sin
re-arquitectura. Una sola instancia de editor activa evita N editores
ProseKit montados (coste de memoria/foco).

**Alternatives considered**: (a) Documento ProseMirror unico con nodos de
clausula — fidelidad maxima de edicion pero migra modelo, renderer y
guardado: rechazado por riesgo/alcance. (b) Mantener editor por clausula en
panel separado (estado actual) — es el problema a resolver. (c) Iframe/HTML
del DOCX renderizado — solo lectura, rompe la edicion y los chips
interactivos.

## D2 — Una vista por defecto; estructura como modo; evidencia como popover

**Decision**: Se eliminan los tabs Template/Resuelto/Evidencia. La vista por
defecto es la resuelta (valores reales resaltados como chips de dato). Un
toggle "Mostrar estructura" (para redactores) muestra los huecos de datos
con su nombre humano. La evidencia deja de ser una vista: es un popover
anclado al chip clickeado (nombre humano, valor, snippet + pagina +
documento o descripcion de origen operacional, CTA "Corregir en Centro de
Control Legal"), reutilizando `legal-evidence-viewer.tsx` en modo compacto.

**Rationale**: Los tres tabs espejan el manifiesto (modelo del API), no el
modelo mental del abogado, que es "leer el texto y preguntar por un dato
puntual" (spec US1; estandar 2-clicks de SC-001). El popover mantiene el
contexto de lectura — cambiar de vista completa para ver un snippet rompe el
flujo de revision.

**Alternatives considered**: (a) Mantener tabs con mejores nombres —
maquilla el problema estructural. (b) Panel lateral fijo de evidencia que
reacciona al click — valido como complemento (el panel de datos lo cubre),
pero como unico mecanismo aleja la evidencia del texto.

## D3 — Humanizacion server-side del manifiesto (extension aditiva)

**Decision**: El API extiende el manifiesto y los blockers con campos
humanos, sin remover ninguno: cada token gana `label` y `category` +
`category_label`; cada blocker gana `title`, `description`, `action_label` y
`action_href` (el `fix_url` existente se conserva). Los estados siguen
siendo codigos (`resolved`/`missing`/`blocked`) en el contrato — la web los
mapea con el diccionario — pero todo texto compuesto (causas de bloqueo,
nombres de gate, tipos de alerta) llega ya redactado en espanol desde el
servidor.

**Rationale**: FR-005/FR-006: la UI no traduce codigos compuestos porque
cada punto de traduccion en cliente es un lugar donde se filtra jerga
(exactamente lo que paso en SDD 008 con `formatApprovalBlocker`). El
servidor ya conoce gate, causa y destino; redactar ahi garantiza un solo
texto para web presente y futura (Telegram, PDF de pendientes, etc.).
Aditivo = cero breaking changes y `pnpm contracts:generate` regenera tipos.

**Alternatives considered**: (a) Diccionario 100% en el front — duplicaria
la logica causa→texto y divergiria del API. (b) Reescribir el contrato de
blockers (breaking) — innecesario, los campos viejos no estorban.

## D4 — Inventario de etiquetas por variable en el catalogo canonico

**Decision**: `legal_variable_catalog.py` gana un mapa aditivo
`VARIABLE_LABELS: dict[str, str]` (etiqueta humana por clave, es-CL) y
reutiliza `VARIABLE_KEYS_BY_GROUP` como categoria; los grupos toman su
etiqueta del equivalente Python de `LEGAL_VARIABLE_GROUP_LABELS`. La copia
web existente de esas etiquetas queda para el CCL (SDD 007, fuera de alcance
aqui): la mesa consume siempre las del manifiesto, y un test de paridad
Python↔TS (en T002) evita divergencia hasta que el rediseno futuro del CCL
unifique la fuente. Claves sin etiqueta hacen fallar un test de inventario
(cobertura 100% obligatoria).

**Rationale**: Hallazgo de auditoria: el catalogo NO tiene etiqueta por
variable (solo grupos), y las etiquetas por token viven dispersas en el
`content_json` de las plantillas (autoria manual, inconsistente). La fuente
unica en el catalogo alimenta manifiesto, picker de insercion, panel de
datos y mensajes de pendientes con el mismo nombre humano (FR-004, FR-009).

**Alternatives considered**: (a) Etiquetas en DB (tabla/columna) — mas
flexible pero exige migracion y UI de administracion fuera de alcance; el
catalogo ya es codigo versionado y testeado. (b) Seguir usando el `label`
del token en la plantilla — queda como override puntual valido en el texto,
pero la fuente por defecto es el catalogo.

## D5 — Diccionario de microcopy: fuente y auditoria

**Decision**: Nuevo modulo API `apps/api/services/legal_microcopy.py` como
fuente unica de vocabulario que nace en el servidor (gates, causas, tipos de
alerta `dl_3516`→"Declaracion DL 3.516", acciones), consumido por el
manifiesto (D3). Para textos puramente de UI (botones, titulos de pantalla,
estados del workflow) la web mantiene constantes en
`apps/web/src/lib/documents/matriz-microcopy.ts`, documentadas como tabla en
[contracts/ui-contracts.md](./contracts/ui-contracts.md). La auditoria
SC-002 se ejecuta con un checklist pantalla-por-pantalla + un test de lint
de vocabulario prohibido sobre los componentes de la mesa (grep de terminos
vetados en strings JSX).

**Rationale**: Un diccionario partido en dos con fuentes claras (server =
todo lo derivado de datos; web = todo lo estatico de pantalla) evita tanto
el doble mantenimiento como el anti-patron de traducir codigos en cliente.
El test de vocabulario hace el SC-002 ejecutable y permanente, no una
revision unica.

**Alternatives considered**: (a) i18n framework completo (next-intl) — la
plataforma es monolingue es-CL; infraestructura sin retorno ahora.
(b) Todo en web — ver D3.

## D6 — Picker "Insertar dato" con nombres humanos

**Decision**: Menu de insercion ProseKit (boton "Insertar dato" + atajo `@`)
con buscador sobre el catalogo humanizado agrupado por categoria. La fuente
de datos llega en la respuesta GET del caso (catalogo humanizado embebido en
el manifiesto/payload), sin endpoint nuevo. Al insertar, el nodo
`variable_token` se crea con `variableKey` + `label` del catalogo y el chip
muestra estado segun el manifiesto.

**Rationale**: ProseKit ya soporta autocomplete/slash menus (capa instalada,
sin dependencia nueva). Embeber el catalogo en la respuesta del caso evita
un fetch extra y garantiza coherencia con el snapshot mostrado. FR-009 exige
busqueda por nombre humano: el catalogo etiquetado (D4) es prerequisito.

**Alternatives considered**: (a) Endpoint dedicado de catalogo — valido,
pero suma round-trip y cache sin necesidad (el catalogo cabe en el payload).
(b) Dialogo modal con arbol de claves — patron desarrollador, rechazado.

## D7 — Llegada guiada con la respuesta existente

**Decision**: La ruta de la mesa decide entre "estado de preparacion" y
"mesa" con datos que el GET del caso ya entrega (readiness gates +
blockers); con los campos humanos de D3, la pantalla de preparacion lista
pendientes accionables sin endpoint nuevo. El CTA desde el CCL usa el
`escritura_case_id` ya disponible en el contexto del caso (handoff SDD 008).

**Rationale**: FR-007/FR-015 se cumplen con composicion de lo existente; el
handoff de SDD 008 dejo explicitamente este puente como siguiente paso.

**Alternatives considered**: endpoint resumen dedicado — sin justificacion
mientras el GET del caso responda < 2s (SC-007, presupuesto ya vigente).

## D8 — Autoria de plantillas sin JSON

**Decision**: El formulario de clausula se reescribe: titulo + editor
ProseKit (mismo de la mesa, con picker D6) + seccion "Cuando aparece esta
clausula" con dos selects en lenguaje humano (dato del catalogo +
presente/ausente/verdadero) que mapean 1:1 a `condition_key`/
`condition_mode`, + select "Alerta que la exige" con descripciones humanas
de los `alert_tipo` del contrato SDD 009. La posicion se maneja arrastrando
en la lista de clausulas (no input numerico). El `clause_key` se autogenera
desde el titulo (slug) con edicion avanzada oculta tras "Opciones
avanzadas". Los errores de validacion de catalogo se muestran con el texto
visible del dato + sugerencia (FR-014); el JSON no aparece en ninguna parte.

**Rationale**: FR-013: misma superficie de edicion que la mesa = un solo
editor que mantener y cero curva de aprendizaje extra. El mapeo declarativo
no cambia la semantica del modelo (Key Entity "Regla de clausula
declarativa").

**Alternatives considered**: (a) Mantener textarea JSON tras un toggle
"modo desarrollador" — viola FR-006/FR-018 como camino de usuario; si se
necesita debug, vive en herramientas internas de super-admin, no aqui.
(b) Builder de condiciones tipo query-builder generico — sobredimensionado
para un modelo de una condicion por clausula.

## D9 — Reemplazo de superficies y estrategia de tests

**Decision**: `matriz-builder.tsx`, `matriz-view-switch.tsx`,
`matriz-clause-editor.tsx` y `template-clause-form.tsx` se reemplazan por
los componentes de la mesa (nuevos archivos bajo
`apps/web/src/components/documents/mesa/`); `matriz-approval-bar.tsx` y
`generation-history.tsx` se reescriben con microcopy y resumenes humanos
conservando su logica de cliente. Los tests de
`apps/web/tests/matriz-builder.test.ts` migran a la mesa: se conservan los
casos de logica pura (reorder, blockers, optimistic locking) y se reescriben
los de presentacion. Los componentes viejos se eliminan al final (fase
polish), nunca conviven dos caminos de produccion (FR-018).

**Rationale**: Carpeta nueva = diff legible y rollback simple por rama; los
tests de logica pura son el contrato de no-regresion (SC-006).

**Alternatives considered**: refactor in-place de los componentes actuales —
historial git mas sucio y riesgo de heredar estructura de tres columnas y
vocabulario por inercia.

## D10 — Wireframes y validacion humana como gates de proceso

**Decision**: Dos gates explicitos en tasks.md: (1) antes de la fase de
implementacion web, wireframes de las 5 pantallas clave (preparacion, mesa
lectura, popover evidencia, edicion + picker, workflow de generacion)
aprobados por el usuario — partiendo del mockup de la sesion 2026-06-11;
(2) antes de cerrar el feature, sesion de usabilidad observada con persona
del perfil real ejecutando las 5 tareas de SC-008, con resultados
registrados en quickstart.md.

**Rationale**: La causa raiz del fallo de SDD 008 fue proceso, no codigo:
tasks de UI de una linea sin journey ni criterio de usabilidad. Los gates
convierten SC-001/SC-008 en condiciones de cierre verificables por humano.

**Alternatives considered**: validar solo con tests automatizados — es
exactamente el mecanismo que dejo pasar la UI actual; rechazado.

## D11 — Accesibilidad y patrones visuales

**Decision**: Chips de dato con contraste AA en ambos modos (paleta de
estados ya usada: verde verificado / ambar falta / azul por revisar, con
texto del mismo color-familia oscuro), navegacion por teclado completa
(popover de evidencia y picker operables sin mouse, focus visible), targets
de 44px en controles, y patrones shadcn/ui + Tailwind 4 existentes
(`Popover`, `Command` para el buscador, `Sheet` para panel colapsado en
anchos menores). Tipografia del documento: serif para el cuerpo de la
escritura (lectura legal), sans para UI.

**Rationale**: Regla constitucional VI (estandar shadcn/ui) + skills
`accessibility`/`ui-ux-pro-max` (prioridad 1-2: contraste, teclado,
targets). `Command` de shadcn ya implementa el buscador con teclado que el
picker necesita.

**Alternatives considered**: libreria de popovers/menus nueva — prohibida
por estandar visual del repo.

---

## Resumen de incognitas resueltas

| Incognita                                        | Resolucion                                                  |
| ------------------------------------------------ | ----------------------------------------------------------- |
| Como ser documento continuo sin migrar el modelo | D1: render resuelto apilado + edicion in-place por clausula |
| Donde viven las etiquetas humanas                | D4: catalogo canonico (inventario nuevo, test de cobertura) |
| Quien redacta los pendientes                     | D3/D5: servidor; la web nunca traduce codigos compuestos    |
| Evidencia: vista o interaccion                   | D2: popover en contexto, 1 click                            |
| Insertar dato sin claves                         | D6: picker ProseKit + catalogo embebido                     |
| Plantillas sin JSON                              | D8: editor + condiciones declarativas + slug autogenerado   |
| Como evitar repetir el fallo de proceso          | D10: gates de wireframe y usabilidad en tasks               |
| Cambios de DB                                    | Ninguno; todo aditivo en codigo/contratos                   |
