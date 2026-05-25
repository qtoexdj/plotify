# Seguridad Backend

**Tag:** #backend #seguridad
**Relacionado:** [[00 - Home]], [[Tech Stack Backend]], [[Comunicacion entre Servicios]], [[Politicas RLS]]

---

## Autenticacion servicio-a-servicio

- Header  en cada request frontend → microservicio.
- Secret generado con fc6c1d51f3a02e1d7525c345c9a9a2f0712761bc69d96ee634d502d41b674712.
- Mismo valor en ambos .
- Middleware FastAPI rechaza requests sin header valido.

## Encriptacion de credenciales

### pgcrypto (PostgreSQL)

- Tabla  almacena credenciales OAuth encriptadas.
- Usa extension  de PostgreSQL.
- Funciones  / .
- Clave de encriptacion en variable de entorno del microservicio.

### Tokens de bot

- Tokens de Telegram almacenados encriptados en la DB.
- Solo el microservicio puede desencriptar.
- El frontend nunca ve los tokens.

## Auth JWT

- PyJWT para generacion y validacion de tokens internos.
- Tokens tienen expiration.

## Rate Limiting

- **slowapi** en FastAPI.
- Handler custom 429 (Too Many Requests).
- Protege contra abuso de endpoints de webhook y generacion.

## CORS

- CORS de FastAPI restringido al URL del frontend.
- Solo el dominio de Next.js puede hacer requests directos.

## RLS desde el microservicio

- El microservicio usa **service role key** de Supabase.
- Puede bypass RLS cuando es necesario (generacion de documentos).
- Para consultas de lectura, respeta el contexto de org.

## Relacionado
- [[Politicas RLS]] — Seguridad a nivel de fila en PostgreSQL
- [[Comunicacion entre Servicios]] — Auth entre servicios
- [[Tablas MCP]] — Credenciales OAuth encriptadas