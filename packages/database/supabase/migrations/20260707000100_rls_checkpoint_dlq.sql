-- Migración de Seguridad T062 (Fase 8 - US6)
-- Habilita RLS en tablas internas de LangGraph checkpoint y dead_letter_queue.
-- Estas tablas son exclusivas del backend (service_role); ningún rol de cliente
-- (anon, authenticated) debe leer ni escribir en ellas directamente.
--
-- Nota: search_path ya está configurado en las 3 funciones críticas
-- (decrypt_credential, get_decrypted_bot_token, get_mcp_credentials),
-- por lo que no se requiere ALTER FUNCTION aquí.

-- ── 1. Habilitar RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.checkpoints           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_blobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_writes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letter_queue     ENABLE ROW LEVEL SECURITY;

-- ── 2. Política de acceso exclusivo a service_role ────────────────────────────
-- Con RLS habilitado y sin políticas para anon/authenticated, esos roles
-- quedan bloqueados por defecto (DENY by default). Solo service_role pasa
-- porque está exento de RLS en Supabase (bypass_rls = true).
-- Añadimos políticas permisivas explícitas para service_role y postgres por
-- claridad y para no depender del bypass implícito.

CREATE POLICY "service_role_full_access" ON public.checkpoints
    AS PERMISSIVE FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON public.checkpoint_blobs
    AS PERMISSIVE FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON public.checkpoint_writes
    AS PERMISSIVE FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON public.checkpoint_migrations
    AS PERMISSIVE FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON public.dead_letter_queue
    AS PERMISSIVE FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
