# Comunicacion entre Servicios

**Tag:** #arquitectura #backend
**Relacionado:** [[Arquitectura General]], [[Tech Stack Backend]], [[Seguridad Backend]], [[Feature Flags]]

---

## Arquitectura

```
Next.js (:3000) ──HTTP POST──→ plotify_chat (:8005)
  Frontend        X-Internal-Secret   FastAPI + LangGraph
                 ←── JSON response ──
```

## Archivo puente

`src/lib/services/microservice.client.ts`

Clase cliente delgada que:

1. Lee `PLOTIFY_CHAT_BASE_URL` del `.env` (default: `http://127.0.0.1:8005`).
2. Adjunta header `X-Internal-Secret` en cada request.
3. Opcionalmente pasa `Authorization: Bearer <token>` para superadmin.
4. Retorna `MicroserviceResponse<T>` estandarizada: `{data, error, status}`.
5. Maneja errores de red (retorna 503) y HTTP errors.
6. Loguea errores via Pino logger.

## Endpoints del microservicio

El microservicio expone endpoints REST bajo `/api/v1/`:

- **Consulta de lotes** — El agente pregunta disponibilidad.
- **Requisitos de reserva** — Que necesita un comprador para reservar.
- **Generacion de documentos** — Solicita PDF/DOCX.
- **Webhook Telegram** — Recibe mensajes del bot y los procesa.

## Autenticacion servicio-a-servicio

1. `INTERNAL_API_SECRET` generado con `openssl rand -hex 32`.
2. Mismo valor en `.env` del frontend y del microservicio.
3. Middleware en FastAPI verifica el header antes de procesar.

## Notas

- La comunicacion es **sincrona** (HTTP REST).
- Para tareas pesadas (generacion de PDF), el microservicio usa cola **arq + Redis** asincrona.
- No hay message queue entre frontend y microservicio.

## Relacionado
- [[Seguridad Backend]] — Detalles de encriptacion y auth
- [[Tech Stack Backend]] — Stack completo del microservicio
- [[Feature Flags]] — Variables de configuracion relevantes
