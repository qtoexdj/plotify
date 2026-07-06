# Contrato: configuración de la organización (datos de escritura + Telegram)

**Relacionado**: FR-022, FR-023, US4, R2. Archivos: `apps/web/src/app/(dashboard)/settings/…`, endpoints de organización.

## Pantalla "Datos de la organización para escrituras"

Formulario en Configuración que lee/escribe `organization_payment_info` (schema actual suficiente) + defaults de organización:

| Campo                                 | Fuente                                                   | Uso en el pipeline           |
| ------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| Razón social                          | `organization_payment_info.razon_social`                 | forma de pago / detalle      |
| RUT                                   | `organization_payment_info.rut`                          | forma de pago / detalle      |
| Banco                                 | `organization_payment_info.banco`                        | `transaccion.detalle_pago[]` |
| Tipo de cuenta                        | `organization_payment_info.tipo_cuenta`                  | idem                         |
| N° de cuenta                          | `organization_payment_info.numero_cuenta`                | idem                         |
| Mandatario por defecto                | default de org (variable `mandato.*`)                    | comparecencia del mandatario |
| Abogado redactor (nombre, RUT, email) | default de org (variable `documento.abogado_redactor.*`) | gate `legal_review_ready`    |

**Importante**: estos datos son **opcionales para el pipeline** (el puente completa sin ellos, FR-001). La pantalla evita que el usuario tenga que tocar SQL, pero su ausencia no rompe nada.

## Endpoints

- `GET/PUT /api/v1/organizations/{org}/escritura-config` (o rutas proxy web equivalentes) — inferir `org` del JWT (Principio V), no confiar en el frontend.
- El abogado redactor y el mandatario se materializan como variables de proyecto con default de org (reusar `PUT legal-variables/by-key` o el mecanismo de default del catálogo).

## Pantalla "Conectar Telegram" (FR-023)

- Muestra deep link al bot de la organización (`t.me/{bot}?start={token}`), usando `NEXT_PUBLIC_TELEGRAM_BOT_USER`.
- Tras el `/start`, el webhook vincula `profiles.telegram_chat_id` del usuario.
- Estado visible: "Telegram conectado ✓" o "No conectado".
- Para el admin de la org: además configurar el bot de la org (`telegram_bots`) si aún no existe (reusar RPC `register_telegram_bot`).

## Test

- PUT config → `organization_payment_info` persistido; abogado/mandatario como default de proyecto.
- Vincular Telegram → `profiles.telegram_chat_id` poblado → recibe notificación de prueba.
- Pipeline sin config bancaria → completa igual (no regresión).
