# Middleware y Session

**Tag:** #frontend #auth
**Relacionado:** [[00 - Home]], [[Roles y Permisos]], [[Seguridad Backend]]

---

## Vision general

Next.js usa middleware para gestionar sesiones SSR y proteccion de rutas antes de que cualquier pagina se renderice.

---

## proxy.ts

**Ubicacion:** `src/proxy.ts`

Entry point del middleware de Next.js. Delega todo a `updateSession` del modulo de Supabase.

**Exporta:**
- `proxy(request)` — Llama a `updateSession(request)` y retorna la respuesta.
- `config` — Matcher que:
  - Protege: `/dashboard`, `/projects`, `/onboarding`, `/clients`, `/vendors`, `/auth/onboarding`.
  - Excluye: archivos estaticos, imagenes, favicon, API routes.
  - Redirige usuarios no autenticados a `/auth/login`.
  - Redirige usuarios autenticados lejos de `/auth/login` hacia `/projects`.

---

## middleware.ts

**Ubicacion:** `src/lib/supabase/middleware.ts`

Crea un cliente Supabase SSR que gestiona cookies para sesiones de auth.

**Exporta:**
- `updateSession(request)` — Hace lo siguiente:
  1. Refresca el token de auth usando las cookies de la request.
  2. Si la ruta empieza con `/dashboard` y no hay sesion → redirect a `/auth/login`.
  3. Si la ruta es `/auth/login` y hay sesion → redirect a `/projects`.
  4. Retorna la respuesta con cookies actualizadas.

---

## Flujo de autenticacion

```
Usuario llega a /dashboard → proxy.ts → updateSession()
→ refresca token con cookies
→ si no hay sesion → 302 a /auth/login
→ si hay sesion → continua renderizado
```

```
Usuario llega a /auth/login → proxy.ts → updateSession()
→ si ya autenticado → 302 a /projects
→ si no → muestra login
```

---

## Cookies

- `@supabase/ssr` gestiona cookies de sesion automaticamente.
- Las cookies se refrescan en cada request.
- El token expira y se renueva automaticamente.

## Relacionado
- [[Roles y Permisos]] — Que protege el middleware
- [[Seguridad Backend]] — Auth completo del sistema
