# Feature Flags

**Tag:** #producto #config
**Relacionado:** [[Variables de Entorno]], [[Vision y Alcance]], [[Setup Local]]

---

## Flags activos

| Variable | Valor | Proposito |
|----------|-------|-----------|
| `NEXT_PUBLIC_ENABLE_CAD_UPLOAD` | `false` | Habilita upload de archivos CAD (DWG/DXF) en el frontend. **Congelado en V2.1.** |
| `ENABLE_CAD_UPLOAD` | `false` | Version server-side del flag anterior. |
| `PLOTIFY_CHAT_BASE_URL` | `http://127.0.0.1:8005` | URL base del microservicio de chat/IA. |
| `NEXT_PUBLIC_TELEGRAM_BOT_USER` | `plotify_chat_bot` | Username del bot de Telegram para deep linking. |
| `INTERNAL_API_SECRET` | *(secreto)* | Secret compartido entre Next.js y el microservicio para auth interna. |
| `LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER` | `false` | Habilita control "four-eyes" en aprobación de matrices (revisor distinto de emisor). |
| `LEGAL_TEXT_VISION_ENABLED` | `false` | Habilita transcripción multimodal por visión para PDFs de CBR escaneados (SDD 009). |
| `LEGAL_TITLE_AGENT_ENABLED` | `false` | Habilita el agente de títulos legal (LLM) a nivel proyecto. |

## Supabase (local)

| Variable | Valor | Proposito |
|----------|-------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:8000` | URL del Supabase local (Docker). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(key)* | Clave anonima para cliente browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | *(key)* | Clave service-role para server-side (bypass RLS). |

## Como usar

1. Copiar `.env.example` → `.env`
2. Ajustar valores para entorno local.
3. Para habilitar CAD upload (experimental): poner ambos flags en `true`.

## Generar secret interno

```bash
openssl rand -hex 32
```

## Notas

- Los flags `NEXT_PUBLIC_*` son expuestos al browser.
- Los flags sin prefijo solo estan disponibles en server-side (Server Components, Server Actions, API routes).
- El microservicio `plotify_chat` tiene su propio `.env` con las mismas credenciales de Supabase + claves de OpenAI/Anthropic.

## Relacionado
- [[Variables de Entorno]] — Guia completa de configuracion
- [[Setup Local]] — Como levantar el entorno de desarrollo
- [[Comunicacion entre Servicios]] — Como se usa el INTERNAL_API_SECRET
