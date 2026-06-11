# Quickstart: Mesa de Escritura — Validacion E2E y de Usabilidad

**Feature**: `010-mesa-escritura`

Dos validaciones de cierre: (A) E2E tecnico con el corpus Teno (sin
regresion del motor) y (B) sesion de usabilidad observada (SC-001, SC-004,
SC-008). Ambas se documentan aqui con resultados antes de cerrar el feature.

## Prerequisitos

- Caso Teno con titulo aprobado y snapshot completo (fixture/datos de
  SDD 008 quickstart pasos 1-3).
- Un segundo caso con gates bloqueados (sin estado civil de compradora y
  alerta `derechos_aguas` resuelta `clause_added` sin clausula) para la
  llegada guiada.
- `pnpm dev` (web + api) con la rama `010-mesa-escritura`.

## A. E2E tecnico (Teno)

1. **Llegada guiada**: abrir la mesa del caso bloqueado. Esperado: estado de
   preparacion con pendientes en espanol, cada uno con accion navegable;
   cero terminos vetados. Click en "Completar dato" navega al CCL con la
   variable enfocada.
2. **Mesa en lectura**: abrir el caso Teno completo. Esperado: escritura
   completa continua (20 clausulas, orden correcto), valores reales en el
   texto, bloque PRIMERO verbatim marcado como aprobado, referencias del
   SEXTO en palabras identicas al DOCX de SDD 008.
3. **Evidencia 2 clicks**: click en el RUT de la compradora → popover con
   etiqueta humana, valor, snippet/pagina o "Registro de venta del Lote 12",
   CTA "Corregir en Centro de Control Legal". Maximo 1 click desde el texto
   (+1 para abrir documento completo = 2).
4. **Edicion in-place**: en borrador, editar texto de una clausula
   editable, insertar "Precio en palabras" via `@` → chip con estado;
   guardar; verificar persistencia y que un guardado concurrente produce el
   mensaje humano de conflicto.
5. **Bloque protegido**: intentar editar la comparecencia del vendedor →
   bloqueado con explicacion y link al panel de titulo.
6. **Workflow**: enviar a revision → aprobar (revisor autorizado) → generar
   minuta → resumen humano + warning ADR-009 → descarga. Verificar registro
   de aceptacion y entrada en historial con descripcion humana.
7. **No regresion DOCX**: generar minuta del mismo caso/snapshot y comparar
   estructuralmente con la generacion de referencia de SDD 008 (parrafos,
   orden, textos verbatim): identicas.
8. **Supersesion**: corregir un dato en CCL (nuevo snapshot) con la mesa
   abierta → aviso humano de expediente cambiado; la generacion vieja queda
   en historial; la matriz vuelve a borrador.
9. **Plantillas sin JSON**: en `/documentos/plantillas`, clonar la v1 a
   borrador, editar una clausula (texto + dato insertado + condicion como
   frase), guardar con un dato invalido → error con texto visible y
   sugerencia; en ningun momento aparece JSON.
10. **Auditoria de vocabulario**: recorrer todas las pantallas del flujo con
    el checklist SC-002 (terminos vetados) — cero hallazgos; correr el test
    de vocabulario prohibido.
11. **Presupuesto de carga (SC-007)**: medir el tiempo desde la navegacion
    hasta que la mesa del caso Teno queda legible (pestaña
    Network/Performance del navegador, 3 mediciones, mediana registrada en
    la tabla de resultados); esperado < 2 segundos desde datos persistidos.
12. **Accesibilidad (FR-016)**: recorrido completo por teclado — chips,
    popover de evidencia (Enter abre, Esc cierra y devuelve foco), picker de
    insercion, indice y workflow — con focus visible en todo momento, mas
    verificacion de contraste AA de los tres estados de chip en modo claro y
    oscuro; cero bloqueos de teclado.

Gates tecnicos: `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`,
`pnpm --filter web lint`, `pnpm format:check`, `pnpm build:web`,
`pnpm contracts:generate` (sin diff manual).

## B. Sesion de usabilidad observada (gate de cierre, research D10)

**Participante**: una persona del perfil real (abogado o administrador de
proyecto) que no haya participado del desarrollo. **Moderador**: no ayuda
salvo bloqueo total; cronometra y registra.

Tareas (exito = completada sin ayuda):

| #   | Tarea                                                                                           | Criterio                                      | SC         |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------- |
| 1   | Llegar desde el CCL del proyecto a la escritura del caso                                        | Encuentra el CTA sin ayuda                    | SC-004     |
| 2   | Leer la escritura y decir que datos faltan                                                      | Identifica los faltantes en < 1 min c/u       | SC-001/004 |
| 3   | Mostrar de que documento sale el RUT de la compradora                                           | Llega a la evidencia en ≤ 2 clicks            | SC-001     |
| 4   | Destrabar un pendiente (estado civil)                                                           | Navega al lugar correcto desde el pendiente   | SC-004     |
| 5   | Aprobar y generar la minuta                                                                     | Completa el flujo y explica que descargo      | SC-008     |
| 6   | (Perfil admin) Crear una clausula en una copia de plantilla: texto + dato insertado + condicion | Completa sin ayuda, sin ver JSON, en < 10 min | SC-003     |

**Aprobacion**: ≥ 4/5 en las tareas 1-5 sin ayuda y revision del caso limpio
en < 15 min. La tarea 6 (SC-003) se ejecuta con un participante de perfil
administrador en la misma sesion o en una mini-sesion aparte despues de
T018, y es gate propio de SC-003. Si una tarea falla, se itera la pantalla
implicada y se repite la sesion (las veces necesarias; el feature no cierra
sin este gate).

## Registro de resultados

| Fecha       | Validacion     | Resultado | Notas |
| ----------- | -------------- | --------- | ----- |
| _pendiente_ | A. E2E tecnico | —         | —     |
| _pendiente_ | B. Usabilidad  | —         | —     |
