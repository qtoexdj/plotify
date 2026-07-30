-- Credential encryption is an internal API operation. PostgreSQL grants
-- EXECUTE on new functions to PUBLIC by default, so explicitly close the RPC
-- surface and retain access only for the API's service-role client.

REVOKE ALL ON FUNCTION public.encrypt_credential(text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_credential(text)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.encrypt_credential(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_credential(text) TO service_role;
