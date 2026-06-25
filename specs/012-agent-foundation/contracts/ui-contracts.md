# UI Contracts: Fundacion Operativa del Agente Plotify

Superficie principal: `apps/web/src/app/(dashboard)/agente/skills/`.
Estilo: shadcn/ui + Tailwind 4 + iconografia existente. Esta pantalla es una
herramienta operacional, no landing page.

## 1. Journeys

### J1 - Admin revisa catalogo de skills

Ruta `Agente > Skills` -> lista agrupada por `Integrado`, `MCP`, `Custom` ->
abre detalle -> ve descripcion, roles, tools aprobadas, estado y dependencias.

Contrato:

- Las skills de sistema muestran candado y no permiten desactivar.
- Skills MCP muestran dependencia de conexion.
- Custom skills muestran version activa y ultimo editor.

### J2 - Admin activa/desactiva skill

Toggle de skill -> Server Action valida rol admin -> upsert
`org_skill_configs` -> invalida cache runtime -> feedback visual.

Contrato:

- Error de invalidacion revierte optimistic state o muestra error claro.
- Una organizacion nunca ve configuracion de otra.

### J3 - Admin crea custom skill markdown

CTA "Nueva skill" -> formulario con nombre, slug, descripcion, roles, markdown
y tools aprobadas -> validar -> guardar version -> activar opcionalmente.

Contrato:

- Editor markdown visible, sin JSON crudo.
- Selector de tools muestra solo tools aprobadas disponibles para el rol.
- Si validacion bloquea, muestra razones humanas y no publica.
- Publicar crea version trazable.

### J4 - Vendedor opera por Telegram

Vendedor usa `/lotes` o `disponibles` -> recibe lotes asignados -> envia
`/reserva` con datos -> recibe confirmacion de solicitud pendiente.

Contrato:

- Mensajes cortos, operativos, es-CL.
- No usar terminos internos como tool, prompt, tenant, payload, JSON.
- Respuestas de error dicen que paso y que hacer.

## 2. Componentes esperados

| Componente                   | Responsabilidad                                | data-testid              |
| ---------------------------- | ---------------------------------------------- | ------------------------ |
| `skills-grid.tsx`            | Lista y agrupacion de skills por categoria     | `agent-skills-grid`      |
| `skill-detail-modal.tsx`     | Detalle, roles, parametros, estado y version   | `agent-skill-detail`     |
| `custom-skill-editor.tsx`    | Crear/editar markdown, roles y tools aprobadas | `custom-skill-editor`    |
| `approved-tools-picker.tsx`  | Selector de tools disponibles por rol          | `approved-tools-picker`  |
| `skill-validation-panel.tsx` | Errores/warnings humanos de validacion         | `skill-validation-panel` |

## 3. Estados visuales

| Estado              | UI                                                    |
| ------------------- | ----------------------------------------------------- |
| Sistema obligatoria | Candado, toggle deshabilitado, texto "Siempre activa" |
| Activa              | Toggle on, badge "Activa"                             |
| Desactivada         | Toggle off, opacidad reducida                         |
| Custom borrador     | Badge "Borrador", no ejecutable                       |
| Custom bloqueada    | Badge "Revisar", panel con razones                    |
| MCP pendiente       | Badge "Requiere conexion", CTA a integraciones        |

## 4. Texto prohibido en UI de usuario final

No mostrar a vendedores: `tool`, `payload`, `tenant`, `MCP`, `JSON`,
`LangGraph`, `slug`, `cache`, `schema`.

El admin tecnico puede ver `slug` en detalle de skill, pero no JSON crudo como
forma principal de configuracion.

## 5. Pruebas UI

- Admin puede crear custom skill valida con markdown y tools aprobadas.
- Custom skill bloqueada muestra razon y no se activa.
- Toggle de skill de sistema esta deshabilitado.
- Toggle exitoso llama invalidacion runtime.
- Vocabulario prohibido no aparece en mensajes vendedor.
