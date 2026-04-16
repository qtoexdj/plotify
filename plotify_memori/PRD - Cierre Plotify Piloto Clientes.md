---
title: PRD - Cierre Plotify Piloto Clientes
date: 2026-04-14
tags:
  - prd
  - producto
  - documentos
  - ventas
  - telegram
  - roadmap
status: draft
---

# PRD - Cierre Plotify Piloto Clientes

> [!summary]
> Objetivo: llevar Plotify a un producto usable por clientes reales en piloto, priorizando parcelaciones, administracion de reservas y ventas, documentos legales V1, Telegram como canal operacional principal, y una arquitectura estable sobre Supabase, Next.js y FastAPI/LangGraph.

## Objetivo

Plotify debe permitir a una inmobiliaria/loteadora gestionar un proyecto de parcelacion desde la carga inicial del KMZ/KML hasta la reserva, venta, aprobacion administrativa y generacion de documentos legales.

El piloto debe demostrar que una organizacion puede:

- Crear y validar una parcelacion.
- Gestionar lotes, reservas y ventas.
- Capturar datos del comprador desde el flujo del vendedor.
- Notificar al administrador por Telegram.
- Aprobar o rechazar reservas y ventas.
- Generar documentos de reserva y escritura usando datos reales del proyecto.
- Enviar documentos al vendedor, al encargado y opcionalmente al comprador.

## Usuarios

### Admin inmobiliaria

Usuario principal de la plataforma. Puede:

- Crear proyectos.
- Cargar KMZ/KML.
- Validar lotes, deslindes y servidumbres.
- Configurar templates de reserva y escritura.
- Editar bloques legales.
- Aprobar o rechazar reservas, ventas y documentos.
- Operar desde la UI y desde Telegram.

### Vendedor

Usuario operacional. Puede:

- Revisar informacion del proyecto y lotes.
- Ingresar datos del comprador.
- Solicitar reserva o venta.
- Recibir documentos aprobados.

No puede editar templates ni bloques legales.

### Abogado del proyecto

Rol funcional, no necesariamente rol tecnico separado en V1. Participa creando o validando templates legales del proyecto. Puede operar a traves del admin inmobiliaria.

### Comprador

No es usuario principal de la plataforma en V1. Puede recibir documentos si el administrador decide enviarlos.

## Alcance V1

### Parcelaciones

- Cargar KMZ/KML del proyecto.
- Generar lotes y geometria.
- Corroborar deslindes y servidumbres contra plano oficial.
- Permitir edicion/correccion manual antes de usar datos en documentos.
- Marcar proyecto como validado para documentos cuando los datos minimos esten completos.

### Reservas y ventas

- Vendedor ingresa datos del comprador.
- Sistema solicita aprobacion al administrador por Telegram.
- Administrador acepta o rechaza.
- Si acepta, se actualiza el estado del lote.
- Se genera documento asociado segun el flujo:
  - Reserva: plantilla unica de reserva del proyecto.
  - Venta: plantilla unica de escritura del proyecto.
- El administrador revisa el documento y decide destinatarios.

### Documentos legales

- Reserva primero, escritura despues.
- PDF y DOCX obligatorios.
- Templates editables por admin.
- Bloques editables con texto tipo Word simple y variables insertables.
- Variables canonicas anidadas, por ejemplo `cliente.nombre_completo`.
- Soporte de datos faltantes:
  - Mostrar advertencias.
  - Permitir que admin genere con lineas en blanco si acepta explicitamente.
  - Permitir bloquear generacion hasta completar variables.
- Guardar snapshot JSON de variables exactas.
- Guardar version de template usada.
- Registrar version del documento generado, por ejemplo version 1, version 2.
- Historial por lote de eventos, no necesariamente almacenar todos los archivos para siempre.

### Telegram

- Canal operacional trascendental en V1.
- Notificar al admin para aceptar o rechazar reserva/venta.
- Presentar documento generado al admin.
- Permitir que admin elija envio a vendedor o vendedor + comprador.
- Registrar acciones relevantes en auditoria.

### MCP

- Entra en V1 como capacidad habilitante, pero con alcance controlado.
- Debe tener validacion de proveedor, server URL y auditoria antes de uso productivo amplio.

## Fuera de alcance V1

- Prompt Ops como prioridad principal. Queda en segunda prioridad.
- Comparacion visual entre versiones de documentos.
- Firma electronica integrada.
- CRM completo de compradores.
- Automatizacion total sin aprobacion humana.
- WhatsApp como canal principal.
- CAD DWG/DXF productivo.

## Flujo principal: reserva

1. Admin crea proyecto y carga parcelacion.
2. Admin valida lotes, deslindes, vecinos y servidumbres.
3. Admin configura o valida template de reserva.
4. Vendedor selecciona lote e ingresa datos del comprador.
5. Sistema notifica al admin por Telegram.
6. Admin aprueba o rechaza.
7. Si aprueba, el sistema genera reserva en PDF/DOCX.
8. Admin revisa documento generado.
9. Admin decide destinatarios.
10. Sistema registra evento en historial del lote.

## Flujo principal: venta/escritura

1. Proyecto ya tiene datos legales suficientes.
2. Template de escritura ya fue creado o validado por admin/abogado.
3. Vendedor ingresa o confirma datos finales del comprador.
4. Sistema notifica al admin por Telegram.
5. Admin aprueba venta.
6. Sistema genera escritura en PDF/DOCX.
7. Admin revisa documento.
8. Admin decide envio.
9. Sistema registra venta y version documental en historial del lote.

## Datos legales requeridos

Fuentes esperadas:

- Formulario del vendedor: datos del comprador.
- Motor geometrico: deslindes y servidumbres.
- Certificado de dominio vigente: datos del predio matriz y propiedad.
- Certificado de roles: rol, avalúo y datos tributarios necesarios.
- Certificado SAG: subdivisión, certificado, plano y autorizaciones.
- Plano oficial: validacion de deslindes, vecinos y superficies.
- Datos de organizacion: vendedor, banco, representante y datos comerciales si aplican.

## Reglas de negocio

- Solo admin puede generar documentos finales.
- Solo admin puede editar templates y bloques legales.
- Vendedor no edita templates.
- El documento de reserva y la escritura deben usar la plantilla unica activa del proyecto.
- Si faltan variables, el admin decide si bloquea o genera con espacios para completar.
- Todo documento generado debe registrar snapshot de variables.
- Toda regeneracion debe quedar como nueva version.
- Todo cambio comercial/legal relevante debe quedar auditado.

## Auditoria minima

Eventos obligatorios:

- Documento generado.
- Documento regenerado.
- Plantilla modificada.
- Bloque legal modificado.
- Cambio de precio de lote.
- Reserva solicitada.
- Reserva aprobada.
- Reserva rechazada.
- Reserva levantada.
- Venta solicitada.
- Venta aprobada.
- Venta rechazada.
- Lote liberado.
- Deslindes/servidumbres validados.
- Documento enviado y destinatarios.

## Requisitos UX

- Plataforma responsiva, con prioridad en revision movil.
- Constructor de documentos con bloques a la izquierda y preview a la derecha en desktop.
- En movil, flujo por pestañas o pasos para no forzar dos columnas.
- Bloques editables como texto enriquecido simple.
- Insercion guiada de variables.
- Lista clara de variables faltantes.
- Lenguaje equilibrado: suficientemente legal para confianza, suficientemente simple para operacion diaria.

## Requisitos tecnicos

- Supabase es fuente transaccional de verdad.
- FastAPI/LangGraph es motor de IA, documentos y mensajeria.
- Next.js es app principal.
- `organization_id` se deriva en servidor desde recursos y usuario; no se confia en el frontend.
- FastAPI expone contrato OpenAPI y el frontend consume tipos generados.
- Monorepo con pnpm workspaces despues de baseline DB y contratos.
- Mantener LangGraph en Python para V1 por madurez del codigo existente, tests existentes y librerias documentales.

## Criterios de exito

- Un admin puede crear un proyecto, cargar parcelacion y validar datos de lotes.
- Un vendedor puede solicitar una reserva con datos de comprador.
- Un admin recibe solicitud por Telegram y puede aprobar/rechazar.
- Al aprobar reserva, se genera PDF y DOCX desde plantilla del proyecto.
- El documento generado usa variables reales y snapshot auditable.
- Se puede regenerar como version 2 sin perder trazabilidad.
- El historial del lote muestra reserva, venta, liberacion y documentos generados.
- Un entorno limpio puede levantarse desde migraciones versionadas.
- Los contratos Next.js/FastAPI estan tipados desde OpenAPI.
- Los tests principales y build pasan con comandos documentados.

## Comandos de verificacion

Frontend:

```bash
cd plotify
npm run lint
npm test
npm run build
```

Backend:

```bash
cd plotify_chat
./venv/bin/pytest -q
```

DB:

```bash
# Usar la DB Supabase Docker existente. No levantar un stack nuevo.
# db reset es destructivo: solo ejecutar con confirmacion explicita.
supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > packages/database/types/database.generated.ts
```

Monorepo futuro:

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

## Preguntas abiertas

- Definir lista exacta de variables legales para reserva V1.
- Definir lista exacta de variables legales para escritura V1.
- Definir si el preview real sera siempre backend o modo hibrido con cache local.
- Definir formato final del editor enriquecido de bloques.
- Definir si abogado sera rol propio en V2.

## Relacionado

- [[Hoja de Ruta - Cierre Plotify Piloto Clientes]]
- [[Backlog Implementable - Cierre Plotify]]
- [[Revision Base de Datos Supabase 2026-04-14]]
- [[Generacion de Documentos]]
- [[Riesgos y Brechas Tecnicas]]
- [[ADR-001 - Adoptar Monorepo pnpm]]
- [[ADR-004 - Variables Documentales Canonicas Anidadas]]
