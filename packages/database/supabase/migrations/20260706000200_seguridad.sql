-- Migración de Seguridad (Fase 8 - US6 - T060)
-- Revoca permisos de ejecución a los roles anon y authenticated de funciones críticas.

-- 1. Revocar de public.decrypt_credential
REVOKE EXECUTE ON FUNCTION public.decrypt_credential(text) FROM anon, authenticated, public;

-- 2. Revocar de public.get_decrypted_bot_token
REVOKE EXECUTE ON FUNCTION public.get_decrypted_bot_token(uuid) FROM anon, authenticated, public;

-- 3. Revocar de public.get_mcp_credentials
REVOKE EXECUTE ON FUNCTION public.get_mcp_credentials(uuid, uuid, text) FROM anon, authenticated, public;

-- 4. Pasar bucket project-files a privado
UPDATE storage.buckets SET public = false WHERE id = 'project-files';
