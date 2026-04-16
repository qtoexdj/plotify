-- Fix Supabase advisor warning: function_search_path_mutable.
--
-- These ALTER FUNCTION statements pin search_path for functions reported by
-- the local Supabase advisors. They intentionally avoid changing function
-- bodies.

ALTER FUNCTION public.add_mcp_connection(uuid, uuid, text, text, text, text, text[])
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.approve_reservation(uuid, text)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.decrypt_credential(text)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.encrypt_credential(text)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.ensure_single_active_prompt_version()
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.get_decrypted_bot_token(uuid)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.get_mcp_credentials(uuid, uuid, text)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.is_org_user(uuid)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.is_project_admin(uuid)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.notify_stage_change()
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.register_telegram_bot(uuid, text, text, text)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.reject_reservation(uuid, text)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.seed_default_document_blocks(uuid, uuid)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.seed_escritura_blocks(uuid, uuid)
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.sync_profile_to_vendor()
  SET search_path = public, extensions, auth, storage, vault;

ALTER FUNCTION public.update_organization_payment_info_updated_at()
  SET search_path = public, extensions, auth, storage, vault;
