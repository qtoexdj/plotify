


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";



CREATE TYPE "public"."estado_lote" AS ENUM (
    'disponible',
    'reservado',
    'vendido'
);



CREATE TYPE "public"."geometry_type" AS ENUM (
    'lot',
    'road',
    'common_area'
);



CREATE TYPE "public"."org_role" AS ENUM (
    'admin',
    'user'
);



CREATE TYPE "public"."sale_state" AS ENUM (
    'propuesta',
    'reservado',
    'vendido',
    'cancelado'
);



CREATE TYPE "public"."source_type" AS ENUM (
    'kmz',
    'kml',
    'dxf',
    'dwg'
);



CREATE OR REPLACE FUNCTION "public"."add_mcp_connection"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_credentials" "text", "p_server_url" "text" DEFAULT NULL::"text", "p_scopes" "text"[] DEFAULT NULL::"text"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.mcp_connections (
        organization_id, user_id, provider, display_name,
        credentials_encrypted, server_url, scopes
    )
    VALUES (
        p_org_id, p_user_id, p_provider, p_display_name,
        public.encrypt_credential(p_credentials), p_server_url, p_scopes
    )
    ON CONFLICT (organization_id, user_id, provider) DO UPDATE SET
        display_name          = EXCLUDED.display_name,
        credentials_encrypted = EXCLUDED.credentials_encrypted,
        server_url            = EXCLUDED.server_url,
        scopes                = EXCLUDED.scopes,
        status                = 'active',
        last_error            = NULL,
        updated_at            = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;



COMMENT ON FUNCTION "public"."add_mcp_connection"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_credentials" "text", "p_server_url" "text", "p_scopes" "text"[]) IS 'Inserta o actualiza una conexión MCP cifrando credenciales via vault. Usar siempre en lugar de INSERT directo.';



CREATE OR REPLACE FUNCTION "public"."approve_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    v_request record;
    v_lot record;
    v_payload jsonb;
BEGIN
    -- 1. Leer y bloquear la solicitud
    SELECT * INTO v_request
    FROM public.approval_requests
    WHERE id = p_approval_id AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada o ya procesada.');
    END IF;

    -- 2. Verificar que el lote siga disponible
    SELECT * INTO v_lot
    FROM public.lots
    WHERE id = v_request.lot_id AND estado = 'disponible'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'El lote ya no está disponible.');
    END IF;

    v_payload := v_request.payload;

    -- 3. Marcar solicitud como aprobada
    UPDATE public.approval_requests
    SET status = 'approved',
        admin_phone = p_admin_phone,
        resolved_at = now()
    WHERE id = p_approval_id;

    -- 4. Actualizar lote a reservado
    UPDATE public.lots
    SET estado = 'reservado',
        reserved_at = now(),
        vendedor_id = v_request.vendor_id
    WHERE id = v_request.lot_id;

    -- 5. UPSERT en lot_records con datos del payload
    INSERT INTO public.lot_records (
        lot_id, 
        cliente_nombre, 
        cliente_run, 
        valor, 
        firma_lugar, 
        firma_fecha, 
        etapa_proceso,
        updated_at
    )
    VALUES (
        v_request.lot_id,
        v_payload->>'cliente_nombre',
        v_payload->>'cliente_run',
        (v_payload->>'valor_reserva')::numeric,
        v_payload->>'notaria',
        (v_payload->>'fecha_firma')::date,
        'espera_firma_reserva',
        now()
    )
    ON CONFLICT (lot_id) DO UPDATE SET
        cliente_nombre = EXCLUDED.cliente_nombre,
        cliente_run = EXCLUDED.cliente_run,
        valor = EXCLUDED.valor,
        firma_lugar = EXCLUDED.firma_lugar,
        firma_fecha = EXCLUDED.firma_fecha,
        etapa_proceso = EXCLUDED.etapa_proceso,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'lot_id', v_request.lot_id,
        'vendor_phone', v_request.vendor_phone,
        'vendor_platform', v_request.vendor_platform,
        'vendor_name', v_request.vendor_name
    );
END;
$$;



CREATE OR REPLACE FUNCTION "public"."can_manage_project_files"("project_id_text" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  p_uuid UUID;
BEGIN
  -- Intentar convertir a UUID, si falla ignorar
  BEGIN
    p_uuid := project_id_text::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;

  RETURN EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.organization_members om ON p.organization_id = om.organization_id
    WHERE p.id = p_uuid
      AND om.user_id = auth.uid()
      AND om.role = 'admin'
  );
END;
$$;



CREATE OR REPLACE FUNCTION "public"."can_read_project_files"("project_id_text" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  p_uuid UUID;
BEGIN
  BEGIN
    p_uuid := project_id_text::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;

  RETURN EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.organization_members om ON p.organization_id = om.organization_id AND om.user_id = auth.uid()
    LEFT JOIN public.vendor_projects vp ON p.id = vp.project_id
    LEFT JOIN public.vendors v ON vp.vendor_id = v.id AND v.user_id = auth.uid()
    WHERE p.id = p_uuid
      AND (
        om.user_id IS NOT NULL -- Miembro de la organización
        OR v.id IS NOT NULL -- Usuario actual es un vendedor asignado a este proyecto
      )
  );
END;
$$;



CREATE OR REPLACE FUNCTION "public"."decrypt_credential"("p_encrypted" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'plotify_encryption_key';

    IF v_key IS NULL THEN
        RAISE EXCEPTION 'plotify_encryption_key not found in vault';
    END IF;

    RETURN extensions.pgp_sym_decrypt(p_encrypted::bytea, v_key);
END;
$$;



COMMENT ON FUNCTION "public"."decrypt_credential"("p_encrypted" "text") IS 'Descifra texto con pgp_sym_decrypt usando clave desde vault. Usado para credenciales MCP.';



CREATE OR REPLACE FUNCTION "public"."encrypt_credential"("p_plaintext" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'plotify_encryption_key';

    IF v_key IS NULL THEN
        RAISE EXCEPTION 'plotify_encryption_key not found in vault';
    END IF;

    RETURN extensions.pgp_sym_encrypt(p_plaintext, v_key);
END;
$$;



COMMENT ON FUNCTION "public"."encrypt_credential"("p_plaintext" "text") IS 'Cifra texto con pgp_sym_encrypt usando clave desde vault. Usado para credenciales MCP.';



CREATE OR REPLACE FUNCTION "public"."ensure_single_active_prompt_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
BEGIN
    IF NEW.is_active = true THEN
        UPDATE public.prompt_versions
        SET is_active = false
        WHERE prompt_id = NEW.prompt_id
          AND id != NEW.id
          AND is_active = true;
    END IF;
    RETURN NEW;
END;
$$;



CREATE OR REPLACE FUNCTION "public"."get_decrypted_bot_token"("p_org_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    token_val TEXT;
    v_key     TEXT;
BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'plotify_encryption_key';

    IF v_key IS NULL THEN
        RAISE EXCEPTION 'plotify_encryption_key not found in vault';
    END IF;

    SELECT extensions.pgp_sym_decrypt(bot_token_encrypted::bytea, v_key)
    INTO token_val
    FROM public.telegram_bots
    WHERE organization_id = p_org_id AND is_active = true;

    RETURN token_val;
END;
$$;



CREATE OR REPLACE FUNCTION "public"."get_mcp_credentials"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    v_creds TEXT;
BEGIN
    SELECT public.decrypt_credential(credentials_encrypted)
    INTO v_creds
    FROM public.mcp_connections
    WHERE organization_id = p_org_id
      AND user_id = p_user_id
      AND provider = p_provider
      AND status = 'active';

    RETURN v_creds;
END;
$$;



COMMENT ON FUNCTION "public"."get_mcp_credentials"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text") IS 'Devuelve credenciales MCP descifradas. Solo llamar desde microservicio (service_role).';



CREATE OR REPLACE FUNCTION "public"."guard_legal_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_project_admin(NEW.project_id) THEN
    NEW.area_official_m2    := OLD.area_official_m2;
    NEW.perimeter_official_m := OLD.perimeter_official_m;
    NEW.boundaries_official  := OLD.boundaries_official;
    NEW.verified_status      := OLD.verified_status;
    NEW.verified_at          := OLD.verified_at;
    NEW.verified_by          := OLD.verified_by;
  END IF;
  RETURN NEW;
END;
$$;



COMMENT ON FUNCTION "public"."guard_legal_fields"() IS 'Protege campos legales: solo project_admin puede modificarlos';



CREATE OR REPLACE FUNCTION "public"."handle_lot_records_on_lot_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.lot_records (lot_id)
  VALUES (NEW.id)
  ON CONFLICT (lot_id) DO NOTHING;
  RETURN NEW;
END;
$$;



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, avatar_url)
  values (new.id, new.raw_user_meta_data->>'avatar_url');

  return new;
end;
$$;



CREATE OR REPLACE FUNCTION "public"."is_org_admin"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;



CREATE OR REPLACE FUNCTION "public"."is_org_user"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
  );
$$;



CREATE OR REPLACE FUNCTION "public"."is_project_admin"("target_project_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = target_project_id
    AND is_org_admin(p.organization_id)
  );
$$;



CREATE OR REPLACE FUNCTION "public"."is_project_vendor"("target_project_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM vendor_projects vp
    JOIN vendors v ON v.id = vp.vendor_id
    WHERE vp.project_id = target_project_id
    AND v.user_id = auth.uid()
  );
$$;



CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE((
    SELECT is_super_admin
    FROM public.profiles
    WHERE id = auth.uid()
  ), false);
$$;



CREATE OR REPLACE FUNCTION "public"."notify_stage_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
BEGIN
    IF OLD.etapa_proceso IS DISTINCT FROM NEW.etapa_proceso THEN
        INSERT INTO audit_logs (
            organization_id,
            actor,
            action,
            entity,
            entity_id,
            payload
        )
        SELECT
            l.organization_id,
            'system',
            'STAGE_CHANGE',
            'lot_records',
            NEW.id::text,
            jsonb_build_object(
                'old_stage', OLD.etapa_proceso,
                'new_stage', NEW.etapa_proceso,
                'lot_id',    NEW.lot_id
            )
        FROM lots l
        WHERE l.id = NEW.lot_id;
    END IF;
    RETURN NEW;
END;
$$;



CREATE OR REPLACE FUNCTION "public"."register_telegram_bot"("p_org_id" "uuid", "p_token" "text", "p_username" "text", "p_webhook_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'plotify_encryption_key';

    IF v_key IS NULL THEN
        RAISE EXCEPTION 'plotify_encryption_key not found in vault';
    END IF;

    INSERT INTO public.telegram_bots (organization_id, bot_token_encrypted, bot_username, webhook_url)
    VALUES (
        p_org_id,
        extensions.pgp_sym_encrypt(p_token, v_key),
        p_username,
        p_webhook_url
    )
    ON CONFLICT (organization_id) DO UPDATE SET
        bot_token_encrypted = EXCLUDED.bot_token_encrypted,
        bot_username        = EXCLUDED.bot_username,
        webhook_url         = EXCLUDED.webhook_url,
        updated_at          = now();
END;
$$;



CREATE OR REPLACE FUNCTION "public"."reject_reservation"("p_approval_id" "uuid", "p_admin_phone" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    v_request record;
BEGIN
    SELECT * INTO v_request
    FROM public.approval_requests
    WHERE id = p_approval_id AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada o ya procesada.');
    END IF;

    UPDATE public.approval_requests
    SET status = 'rejected',
        admin_phone = p_admin_phone,
        resolved_at = now()
    WHERE id = p_approval_id;

    RETURN jsonb_build_object(
        'success', true,
        'lot_id', v_request.lot_id,
        'vendor_phone', v_request.vendor_phone,
        'vendor_platform', v_request.vendor_platform,
        'vendor_name', v_request.vendor_name
    );
END;
$$;



COMMENT ON FUNCTION "public"."reject_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") IS 'Rechaza una solicitud de reserva: actualiza solo approval_requests.';



CREATE OR REPLACE FUNCTION "public"."seed_default_document_blocks"("p_org_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $_$
DECLARE
    v_count INT := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM document_blocks WHERE organization_id = p_org_id LIMIT 1) THEN
        RETURN 0;
    END IF;

    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id, 'Encabezado Notarial', 'encabezado',
        '<h1>COMPRAVENTA DE SITIO PARCELADO</h1>
<p>En {{ firma_lugar | default("__________") }}, a {{ firma_fecha | default("__________") }}, comparecen:</p>
<p><strong>PARTE VENDEDORA:</strong> {{ org_nombre | default("__________") }}, RUT {{ org_rut | default("__________") }};</p>
<p><strong>PARTE COMPRADORA:</strong> Don/Doña {{ cliente_nombre | default("__________") }}, RUT {{ cliente_run | default("__________") }}, estado civil {{ cliente_estado_civil | default("soltero/a") }}, de ocupación {{ cliente_ocupacion | default("__________") }}, domiciliado/a en {{ cliente_direccion | default("__________") }}.</p>',
        ARRAY['org_nombre','org_rut','cliente_nombre','cliente_run','cliente_estado_civil','cliente_ocupacion','cliente_direccion','firma_lugar','firma_fecha'],
        ARRAY['encabezado','notarial','partes'], 1, true, p_user_id
    );
    v_count := v_count + 1;

    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id, 'Descripción del Lote', 'objeto',
        '<h2>PRIMERO: OBJETO</h2>
<p>El Vendedor vende al Comprador el <strong>Lote {{ numero_lote }}</strong>, ubicado en el Proyecto {{ proyecto_nombre }}, comuna de {{ proyecto_comuna }}, Región de {{ proyecto_region }}, con una superficie aproximada de <strong>{{ m2 | default(0) }} m²</strong>{% if servidumbre_m2 and servidumbre_m2 > 0 %}, de los cuales {{ servidumbre_m2 }} m² quedan afectos a servidumbre de tránsito, con un ancho de {{ servidumbre_ancho_m | default("__") }} metros{% endif %}, y una superficie neta de {{ superficie_neta_m2 | default(m2) }} m².</p>',
        ARRAY['numero_lote','proyecto_nombre','proyecto_comuna','proyecto_region','m2','servidumbre_m2','servidumbre_ancho_m','superficie_neta_m2'],
        ARRAY['objeto','lote','descripcion'], 1, true, p_user_id
    );
    v_count := v_count + 1;

    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id, 'Precio y Forma de Pago', 'precio',
        '<h2>SEGUNDO: PRECIO</h2>
<p>El precio de la compraventa es la suma de <strong>${{ precio | default(0) | int }}</strong>.</p>
<p>a) A título de reserva: ${{ valor_reserva | default(0) | int }}, ya pagados.</p>
<p>b) Saldo: ${{ saldo | default(0) | int }}, según condiciones pactadas.</p>
<p>Pagos mediante transferencia al Banco {{ org_banco | default("__________") }}, Cuenta {{ org_tipo_cuenta | default("Corriente") }} N° {{ org_cuenta | default("__________") }}, a nombre de {{ org_nombre | default("__________") }}, RUT {{ org_rut | default("__________") }}, email {{ org_email | default("__________") }}.</p>',
        ARRAY['precio','valor_reserva','saldo','org_banco','org_tipo_cuenta','org_cuenta','org_nombre','org_rut','org_email'],
        ARRAY['precio','pago','financiero'], 1, true, p_user_id
    );
    v_count := v_count + 1;

    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id, 'Cláusula de Servidumbre', 'servidumbre',
        '<h2>TERCERO: SERVIDUMBRE DE TRÁNSITO</h2>
<p>El lote se vende con una servidumbre de tránsito de {{ servidumbre_m2 }} metros cuadrados, con un ancho de {{ servidumbre_ancho_m }} metros. Las partes aceptan la constitución de la servidumbre de tránsito anteriormente individualizada.</p>',
        ARRAY['servidumbre_m2','servidumbre_ancho_m'],
        ARRAY['servidumbre','transito','legal'], 1, true, p_user_id
    );
    v_count := v_count + 1;

    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id, 'Cláusula de Desistimiento', 'desistimiento',
        '<h2>CUARTO: DESISTIMIENTO</h2>
<p>Si el Comprador desistiere unilateralmente antes de la firma de la escritura pública, perderá en favor del Vendedor la suma de ${{ valor_reserva | default(0) | int }} a título de cláusula penal. Si el Vendedor no pudiere perfeccionar la venta por causa imputable a sí mismo, deberá devolver el doble de la reserva.</p>',
        ARRAY['valor_reserva'],
        ARRAY['desistimiento','reserva','penal'], 1, true, p_user_id
    );
    v_count := v_count + 1;

    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id, 'Pie de Firmas', 'firmas',
        '<div class="firma">
    <div class="firma-line">
        <p>{{ cliente_nombre | default("_______________________") }}</p>
        <p>RUT: {{ cliente_run | default("______________") }}</p>
        <p>COMPRADOR</p>
    </div>
    <div class="firma-line">
        <p>{{ org_nombre | default("_______________________") }}</p>
        <p>RUT: {{ org_rut | default("______________") }}</p>
        <p>VENDEDOR</p>
    </div>
</div>',
        ARRAY['cliente_nombre','cliente_run','org_nombre','org_rut'],
        ARRAY['firmas','pie'], 1, true, p_user_id
    );
    v_count := v_count + 1;

    RETURN v_count;
END;
$_$;



COMMENT ON FUNCTION "public"."seed_default_document_blocks"("p_org_id" "uuid", "p_user_id" "uuid") IS 'Inserta 6 bloques legales base para una organización. Idempotente: retorna 0 si ya existen bloques.
Uso: SELECT seed_default_document_blocks(''<org_uuid>'', ''<user_uuid>'');';



CREATE OR REPLACE FUNCTION "public"."seed_escritura_blocks"("p_org_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $_$
DECLARE
    v_count INT := 0;
BEGIN

    -- ── BLOQUE: Comparecencia
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'Comparecencia',
        'articulo',
        '<p>En {{ firma_lugar | default("__________") }}, a {{ firma_fecha | default("__________") }}, comparecen:</p>
<p><strong>Por una parte</strong>, {{ vendedor.nombre | default("__________") }},
{%- if vendedor.tipo == "juridica" %} representada por {{ vendedor.representantes[0].nombre | default("__________") }},{%- endif %}
RUT {{ vendedor.rut | default("__________") }}, en adelante <em>"el Vendedor"</em>;</p>
<p><strong>y por la otra</strong>, {{ comprador.nombre | default("__________") }},
RUT {{ comprador.rut | default("__________") }},
{{ comprador.estado_civil | default("soltero/a") }},
{{ comprador.profesion_giro | default("__________") }},
domiciliado/a en {{ comprador.domicilio | default("__________") }},
en adelante <em>"el Comprador"</em>.</p>',
        ARRAY['vendedor.nombre','vendedor.rut','vendedor.tipo','comprador.nombre','comprador.rut',
              'comprador.estado_civil','comprador.profesion_giro','comprador.domicilio',
              'firma_lugar','firma_fecha'],
        ARRAY['comparecencia','partes','escritura'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- ── ART-01: Antecedentes
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'PRIMERO — Antecedentes',
        'articulo',
        '<h2>PRIMERO</h2>
<p>El Vendedor es dueño del predio denominado <strong>{{ matriz.nombre_predio | default("__________") }}</strong>,
ubicado en {{ matriz.ubicacion | default("__________") }},
de una superficie aproximada de {{ matriz.superficie_total | default("__________") }},
que deslinda: al Norte, {{ matriz.deslindes.norte | default("__________") }};
al Sur, {{ matriz.deslindes.sur | default("__________") }};
al Oriente, {{ matriz.deslindes.oriente | default("__________") }};
al Poniente, {{ matriz.deslindes.poniente | default("__________") }}.</p>
<p>El predio fue adquirido {{ matriz.adquisicion_modo | default("__________") }},
según escritura pública otorgada ante {{ matriz.adquisicion_notaria | default("__________") }},
de fecha {{ matriz.adquisicion_fecha | default("__________") }},
Repertorio N° {{ matriz.adquisicion_repertorio | default("__________") }},
inscrita a fojas {{ matriz.inscripcion_fojas | default("__________") }} N° {{ matriz.inscripcion_numero | default("__________") }}
del año {{ matriz.inscripcion_anio | default("__________") }}
del Registro de Propiedad del {{ matriz.inscripcion_cbr | default("Conservador de Bienes Raíces respectivo") }}.
Rol de Avalúo N° {{ matriz.rol_avaluo | default("__________") }}.</p>',
        ARRAY['matriz.nombre_predio','matriz.ubicacion','matriz.superficie_total',
              'matriz.deslindes.norte','matriz.deslindes.sur','matriz.deslindes.oriente','matriz.deslindes.poniente',
              'matriz.adquisicion_modo','matriz.adquisicion_notaria','matriz.adquisicion_fecha',
              'matriz.adquisicion_repertorio','matriz.inscripcion_fojas','matriz.inscripcion_numero',
              'matriz.inscripcion_anio','matriz.inscripcion_cbr','matriz.rol_avaluo'],
        ARRAY['antecedentes','matriz','escritura','art-01'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-02: Subdivisión y Lote
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'SEGUNDO — Subdivisión y Lote',
        'articulo',
        '<h2>SEGUNDO</h2>
<p>El predio matriz fue subdividido según Certificado de Subdivisión N° {{ sag.certificado_numero | default("__________") }},
de fecha {{ sag.certificado_fecha | default("__________") }},
plano inscrito en el Conservador de Bienes Raíces bajo el N° {{ sag.plano_cbr_numero | default("__________") }}
del año {{ sag.plano_cbr_anio | default("__________") }}.</p>
<p>El lote objeto de la presente compraventa corresponde al <strong>{{ lote.numero_nombre | default("__________") }}</strong>,
de una superficie de {{ lote.superficie_total | default("__________") }},
y deslinda: {{ lote.deslindes | default("__________") }}</p>
<p>Rol en trámite: {{ lote.rol_tramite | default("en trámite") }}.</p>',
        ARRAY['sag.certificado_numero','sag.certificado_fecha','sag.plano_cbr_numero','sag.plano_cbr_anio',
              'lote.numero_nombre','lote.superficie_total','lote.deslindes','lote.rol_tramite'],
        ARRAY['subdivision','sag','lote','deslindes','escritura','art-02'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-03: Objeto de Venta
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'TERCERO — Objeto de Venta',
        'articulo',
        '<h2>TERCERO</h2>
<p>El Vendedor por el presente instrumento <strong>vende, cede y transfiere</strong> al Comprador,
quien compra y acepta para sí, el {{ lote.numero_nombre | default("______") }}
individualizado en el artículo anterior, con todo lo que de hecho y por derecho le corresponde.</p>',
        ARRAY['lote.numero_nombre'],
        ARRAY['objeto','venta','escritura','art-03'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-04: Precio y Pago
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'CUARTO — Precio y Pago',
        'articulo',
        '<h2>CUARTO</h2>
<p>El precio de la presente compraventa es la suma de
<strong>${{ transaccion.precio_numeros | default("__________") }}</strong>
({{ transaccion.precio_letras | default("__________") }} pesos),
que el Comprador paga {{ transaccion.forma_pago | default("al contado y en dinero en efectivo") }},
declarando el Vendedor recibirlo a su entera satisfacción,
renunciando expresamente a toda acción resolutoria derivada del no pago del precio.</p>',
        ARRAY['transaccion.precio_numeros','transaccion.precio_letras','transaccion.forma_pago'],
        ARRAY['precio','pago','escritura','art-04'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-05: Venta Ad-Corpus
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'QUINTO — Venta Ad-Corpus',
        'articulo',
        '<h2>QUINTO</h2>
<p>La presente compraventa se hace <em>ad corpus</em>, aceptando el Comprador
la propiedad en el estado en que se encuentra, con todos sus usos, costumbres,
servidumbres activas y pasivas, entradas y salidas y demás anexidades y dependencias.</p>',
        ARRAY[]::TEXT[],
        ARRAY['ad-corpus','estado','escritura','art-05'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-06: Servidumbre (condicional)
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'SEXTO — Servidumbre de Tránsito',
        'articulo',
        '<h2>SEXTO</h2>
<p>Se constituye una <strong>servidumbre de tránsito</strong> de carácter perpetuo y gratuito
sobre una franja de {{ servidumbre.superficie | default("__________") }},
que afecta al {{ lote.numero_nombre | default("______") }} en calidad de predio sirviente,
en beneficio de los demás lotes del proyecto en calidad de predios dominantes.</p>
<p>La franja de servidumbre deslinda: {{ servidumbre.deslindes_tramo | default("__________") }}</p>',
        ARRAY['servidumbre.superficie','servidumbre.deslindes_tramo','lote.numero_nombre'],
        ARRAY['servidumbre','transito','escritura','art-06','condicional'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-07 a ART-16 (contenido fijo)
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES
    (p_org_id, 'SÉPTIMO — Entrega Material', 'articulo',
     '<h2>SÉPTIMO</h2><p>El Vendedor hace entrega material y legal de la propiedad al Comprador en este mismo acto, libre de todo ocupante.</p>',
     ARRAY[]::TEXT[], ARRAY['entrega','escritura','art-07'], 1, true, p_user_id),

    (p_org_id, 'OCTAVO — Gastos', 'articulo',
     '<h2>OCTAVO</h2><p>Serán de cargo del Comprador todos los gastos, honorarios notariales, impuestos y derechos que se deriven de la presente escritura y su inscripción en el Conservador de Bienes Raíces.</p>',
     ARRAY[]::TEXT[], ARRAY['gastos','honorarios','escritura','art-08'], 1, true, p_user_id),

    (p_org_id, 'NOVENO — Domicilio Judicial', 'articulo',
     '<h2>NOVENO</h2><p>Para todos los efectos legales derivados del presente contrato, las partes fijan su domicilio en la ciudad de {{ comprador.domicilio | default("__________") }} y se someten a la competencia de sus Tribunales de Justicia.</p>',
     ARRAY['comprador.domicilio'], ARRAY['domicilio','tribunales','escritura','art-09'], 1, true, p_user_id),

    (p_org_id, 'DÉCIMO — Finiquito', 'articulo',
     '<h2>DÉCIMO</h2><p>La presente escritura deja sin efecto cualquier promesa, compromiso o contrato anterior celebrado entre las partes sobre el inmueble que se enajena, declarándose ambas partes recíprocamente al día en sus obligaciones.</p>',
     ARRAY[]::TEXT[], ARRAY['finiquito','promesa','escritura','art-10'], 1, true, p_user_id),

    (p_org_id, 'UNDÉCIMO — Exoneraciones Especiales', 'articulo',
     '<h2>UNDÉCIMO</h2>
<p>a) <strong>Agua potable y alcantarillado:</strong> El Vendedor no garantiza la disponibilidad de agua potable ni alcantarillado en la propiedad, siendo de exclusiva responsabilidad del Comprador la obtención de dichos servicios.</p>
<p>b) <strong>Energía eléctrica:</strong> El Vendedor no garantiza la provisión de energía eléctrica en la propiedad. El Comprador deberá gestionar la conexión directamente con la empresa distribuidora correspondiente.</p>
<p>c) <strong>CONAF — Tala de árboles:</strong> Toda intervención sobre la vegetación nativa existente en el predio deberá contar con la autorización previa de la Corporación Nacional Forestal (CONAF), siendo el Comprador el único responsable de obtener los permisos correspondientes.</p>',
     ARRAY[]::TEXT[], ARRAY['exoneraciones','agua','luz','conaf','escritura','art-11','opcional'], 1, true, p_user_id),

    (p_org_id, 'DUODÉCIMO — IVA y Exención', 'articulo',
     '<h2>DUODÉCIMO</h2><p>La presente compraventa no queda afecta al Impuesto al Valor Agregado, por tratarse de un predio de carácter rural, de conformidad con lo dispuesto en la Ley N° 825 y sus modificaciones posteriores.</p>',
     ARRAY[]::TEXT[], ARRAY['iva','exencion','rural','escritura','art-12'], 1, true, p_user_id),

    (p_org_id, 'DECIMOTERCERO — Mandato de Rectificación', 'articulo',
     '<h2>DECIMOTERCERO</h2><p>Las partes confieren mandato especial irrevocable a don/doña {{ mandato.nombre_representante | default("__________") }}, RUT {{ mandato.rut_representante | default("__________") }}, para que en nombre y representación de cualquiera de ellas, pueda concurrir ante el Conservador de Bienes Raíces a rectificar, aclarar o complementar la presente escritura en todo cuanto sea necesario para su correcta inscripción.</p>',
     ARRAY['mandato.nombre_representante','mandato.rut_representante'],
     ARRAY['mandato','rectificacion','cbr','escritura','art-13'], 1, true, p_user_id),

    (p_org_id, 'DECIMOCUARTO — Deudores de Alimentos', 'articulo',
     '<h2>DECIMOCUARTO</h2><p>De conformidad a lo establecido en la Ley N° 21.389, las partes declaran, bajo juramento, no tener deudas impagas por concepto de pensiones alimenticias.</p>',
     ARRAY[]::TEXT[], ARRAY['alimentos','ley-21389','escritura','art-14'], 1, true, p_user_id),

    (p_org_id, 'DECIMOQUINTO — Uso de Suelo', 'articulo',
     '<h2>DECIMOQUINTO</h2><p>Las partes declaran que la propiedad objeto de esta compraventa mantiene su destino agrícola, quedando expresamente prohibido modificar su uso de suelo sin contar con las autorizaciones que correspondan según la Ley General de Urbanismo y Construcciones (LGUC) y demás normativas vigentes.</p>',
     ARRAY[]::TEXT[], ARRAY['uso-suelo','agricola','lguc','escritura','art-15'], 1, true, p_user_id),

    (p_org_id, 'DECIMOSEXTO — Facultad de Copia', 'articulo',
     '<h2>DECIMOSEXTO</h2><p>El portador de una copia autorizada de la presente escritura queda facultado para solicitar y gestionar todas las inscripciones, subinscripciones y demás trámites necesarios ante el Conservador de Bienes Raíces y cualquier otro organismo pertinente.</p>',
     ARRAY[]::TEXT[], ARRAY['copia','cbr','tramites','escritura','art-16'], 1, true, p_user_id)

    ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── Personería (condicional)
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'Personería y Poderes',
        'articulo',
        '<p><strong>Personería:</strong> La personería de {{ vendedor.nombre | default("__________") }}
consta de {{ personeria.tipo_documento | default("escritura pública") }}
otorgada ante {{ personeria.notaria | default("Notario Público respectivo") }},
de fecha {{ personeria.fecha | default("__________") }},
inscrita a fojas {{ personeria.inscripcion_fojas | default("__________") }}
N° {{ personeria.inscripcion_numero | default("__________") }}
del año {{ personeria.inscripcion_anio | default("__________") }}
del Registro de Comercio del {{ personeria.inscripcion_cbr | default("Conservador respectivo") }}.</p>',
        ARRAY['vendedor.nombre','personeria.tipo_documento','personeria.notaria','personeria.fecha',
              'personeria.inscripcion_fojas','personeria.inscripcion_numero',
              'personeria.inscripcion_anio','personeria.inscripcion_cbr'],
        ARRAY['personeria','poderes','sociedad','escritura','condicional'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── Cierre y Firmas
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'Cierre y Firmas',
        'articulo',
        '<p>En comprobante, previa lectura, firman:</p>
<div class="firma-vendedor">
<p>___________________________<br>
{{ vendedor.nombre | default("VENDEDOR") }}<br>
RUT: {{ vendedor.rut | default("__________") }}</p>
</div>
<div class="firma-comprador">
<p>___________________________<br>
{{ comprador.nombre | default("COMPRADOR") }}<br>
RUT: {{ comprador.rut | default("__________") }}</p>
</div>',
        ARRAY['vendedor.nombre','vendedor.rut','comprador.nombre','comprador.rut'],
        ARRAY['cierre','firmas','escritura'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    RETURN v_count;
END;
$_$;



COMMENT ON FUNCTION "public"."seed_escritura_blocks"("p_org_id" "uuid", "p_user_id" "uuid") IS 'Siembra los 19 artículos atómicos de la escritura de compraventa rural.
Idempotente: ON CONFLICT (organization_id, name) DO NOTHING.
Retorna 1 si insertó la Comparecencia (primera inserción), 0 si ya existía.';



CREATE OR REPLACE FUNCTION "public"."sync_profile_to_vendor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    v_nombre TEXT;
BEGIN
    -- Determine the new name based on first_name and/or last_name
    IF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
        v_nombre := trim(concat_ws(' ', NEW.first_name, NEW.last_name));
    ELSE
        -- Fallback to the username if both names are null/empty, or 'Usuario' 
        v_nombre := COALESCE(NEW.username, 'Usuario');
    END IF;

    -- Update the vendors table where the user_id matches
    UPDATE public.vendors
    SET 
        nombre = v_nombre,
        phone = NEW.phone,
        updated_at = NOW()
    WHERE user_id = NEW.id;

    RETURN NEW;
END;
$$;



CREATE OR REPLACE FUNCTION "public"."update_organization_payment_info_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_custom_instructions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "instructions" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);



COMMENT ON TABLE "public"."agent_custom_instructions" IS 'Instrucciones personales del admin para su agente IA.';



COMMENT ON COLUMN "public"."agent_custom_instructions"."instructions" IS 'Ej: "Respóndeme siempre formal. Firma como Equipo Plotify."';



CREATE TABLE IF NOT EXISTS "public"."agent_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" DEFAULT 'builtin'::"text" NOT NULL,
    "tool_definition" "jsonb" NOT NULL,
    "requires_mcp" boolean DEFAULT false,
    "mcp_provider" "text",
    "requires_role" "text"[] DEFAULT '{admin}'::"text"[],
    "is_system" boolean DEFAULT false,
    "enabled_by_default" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agent_skills_category_check" CHECK (("category" = ANY (ARRAY['builtin'::"text", 'mcp'::"text", 'custom'::"text"])))
);



COMMENT ON TABLE "public"."agent_skills" IS 'Catálogo global de skills (tools) para agentes LangGraph.';



COMMENT ON COLUMN "public"."agent_skills"."slug" IS 'Ej: search_projects, check_lot_availability, upload_drive';



COMMENT ON COLUMN "public"."agent_skills"."tool_definition" IS 'JSON Schema: {name, description, parameters} para LangChain StructuredTool';



COMMENT ON COLUMN "public"."agent_skills"."requires_mcp" IS 'Si true, necesita mcp_connections activa para funcionar';



COMMENT ON COLUMN "public"."agent_skills"."mcp_provider" IS 'google_drive, gmail, notion, etc. NULL si builtin';



COMMENT ON COLUMN "public"."agent_skills"."requires_role" IS 'Roles mínimos para usar: {admin}, {admin,user}, {super_admin}';



COMMENT ON COLUMN "public"."agent_skills"."is_system" IS 'Skills del sistema no se pueden deshabilitar';



CREATE TABLE IF NOT EXISTS "public"."approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lot_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "vendor_name" "text" NOT NULL,
    "vendor_phone" "text" NOT NULL,
    "vendor_platform" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "approval_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "approval_requests_vendor_platform_check" CHECK (("vendor_platform" = ANY (ARRAY['telegram'::"text", 'whatsapp'::"text"])))
);



COMMENT ON TABLE "public"."approval_requests" IS 'Solicitudes de aprobación de reserva de lotes. El Admin aprueba/rechaza vía Telegram/WhatsApp.';



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor" "text",
    "action" "text",
    "entity" "text",
    "entity_id" "text",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid"
);



CREATE TABLE IF NOT EXISTS "public"."checkpoint_blobs" (
    "thread_id" "text" NOT NULL,
    "checkpoint_ns" "text" DEFAULT ''::"text" NOT NULL,
    "channel" "text" NOT NULL,
    "version" "text" NOT NULL,
    "type" "text" NOT NULL,
    "blob" "bytea"
);


ALTER TABLE "public"."checkpoint_blobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkpoint_migrations" (
    "v" integer NOT NULL
);


ALTER TABLE "public"."checkpoint_migrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkpoint_writes" (
    "thread_id" "text" NOT NULL,
    "checkpoint_ns" "text" DEFAULT ''::"text" NOT NULL,
    "checkpoint_id" "text" NOT NULL,
    "task_id" "text" NOT NULL,
    "idx" integer NOT NULL,
    "channel" "text" NOT NULL,
    "type" "text",
    "blob" "bytea" NOT NULL,
    "task_path" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."checkpoint_writes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkpoints" (
    "thread_id" "text" NOT NULL,
    "checkpoint_ns" "text" DEFAULT ''::"text" NOT NULL,
    "checkpoint_id" "text" NOT NULL,
    "parent_checkpoint_id" "text",
    "type" "text",
    "checkpoint" "jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."checkpoints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dead_letter_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_function" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "traceback" "text",
    "attempts" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);



CREATE TABLE IF NOT EXISTS "public"."document_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "content" "text" NOT NULL,
    "variables" "text"[] DEFAULT '{}'::"text"[],
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "version" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "document_blocks_category_check" CHECK (("category" = ANY (ARRAY['encabezado'::"text", 'clausula'::"text", 'articulo'::"text", 'firma'::"text", 'anexo'::"text", 'variable'::"text"])))
);



COMMENT ON TABLE "public"."document_blocks" IS 'Bloques atómicos de documentos legales con placeholders Jinja2.';



COMMENT ON COLUMN "public"."document_blocks"."content" IS 'Texto con placeholders: "Don/Doña {{comprador_nombre}}, RUT {{comprador_rut}}..."';



COMMENT ON COLUMN "public"."document_blocks"."variables" IS 'Lista de variables requeridas: {comprador_nombre, comprador_rut}';



COMMENT ON COLUMN "public"."document_blocks"."tags" IS 'Etiquetas de búsqueda: {reserva, escritura, legal}';



CREATE TABLE IF NOT EXISTS "public"."document_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "description" "text",
    "header_config" "jsonb" DEFAULT '{}'::"jsonb",
    "footer_config" "jsonb" DEFAULT '{}'::"jsonb",
    "page_config" "jsonb" DEFAULT '{"size": "letter", "margins": {"top": 25, "left": 20, "right": 20, "bottom": 25}}'::"jsonb",
    "is_default" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "document_templates_document_type_check" CHECK (("document_type" = ANY (ARRAY['escritura'::"text", 'reserva'::"text", 'promesa'::"text", 'deslinde'::"text", 'otro'::"text"])))
);



COMMENT ON TABLE "public"."document_templates" IS 'Templates de documentos legales. Secuencia ordenada de bloques.';



COMMENT ON COLUMN "public"."document_templates"."document_type" IS 'escritura, reserva, promesa, deslinde, otro';



COMMENT ON COLUMN "public"."document_templates"."header_config" IS '{"logo_url": "...", "notaria": "...", "ciudad": "..."}';



COMMENT ON COLUMN "public"."document_templates"."page_config" IS 'Configuración de página: size, margins';



CREATE TABLE IF NOT EXISTS "public"."generated_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "lot_id" "uuid",
    "lot_record_id" "uuid",
    "document_type" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_format" "text" DEFAULT 'pdf'::"text" NOT NULL,
    "variables_snapshot" "jsonb" NOT NULL,
    "generated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "generated_documents_file_format_check" CHECK (("file_format" = ANY (ARRAY['pdf'::"text", 'docx'::"text"])))
);



COMMENT ON TABLE "public"."generated_documents" IS 'Historial inmutable de documentos generados.';



COMMENT ON COLUMN "public"."generated_documents"."file_url" IS 'URL en Supabase Storage: /documents/{org_id}/{type}/{timestamp}.pdf';



COMMENT ON COLUMN "public"."generated_documents"."variables_snapshot" IS 'Snapshot de TODAS las variables usadas al generar (inmutable, para trazabilidad legal)';



CREATE TABLE IF NOT EXISTS "public"."geometries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "lot_id" "uuid",
    "geometry" "jsonb" NOT NULL,
    "source_type" "public"."source_type" DEFAULT 'kmz'::"public"."source_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "properties" "jsonb",
    "geometry_type" "public"."geometry_type" DEFAULT 'lot'::"public"."geometry_type" NOT NULL,
    "name" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_assigned" boolean DEFAULT false NOT NULL
);



COMMENT ON TABLE "public"."geometries" IS 'Geometrías espaciales en formato GeoJSON para visualización de parcelas';



COMMENT ON COLUMN "public"."geometries"."geometry_type" IS 'Tipo de geometría: lot (lote), road (camino/calle), common_area (área común)';



CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid",
    "phone" "text" NOT NULL,
    "name" "text",
    "platform" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "leads_platform_check" CHECK (("platform" = ANY (ARRAY['whatsapp'::"text", 'telegram'::"text"])))
);



CREATE TABLE IF NOT EXISTS "public"."lot_records" (
    "lot_id" "uuid" NOT NULL,
    "cliente_nombre" "text",
    "cliente_run" "text",
    "cliente_run_normalizado" "text" GENERATED ALWAYS AS (NULLIF("regexp_replace"("upper"(COALESCE("cliente_run", ''::"text")), '[^0-9K]'::"text", ''::"text", 'g'::"text"), ''::"text")) STORED,
    "cliente_direccion" "text",
    "cliente_estado_civil" "text",
    "cliente_ocupacion" "text",
    "cliente_telefono" "text",
    "cliente_email" "text",
    "valor" numeric,
    "abono" numeric,
    "saldo" numeric GENERATED ALWAYS AS (
CASE
    WHEN ("valor" IS NULL) THEN NULL::numeric
    ELSE ("valor" - COALESCE("abono", (0)::numeric))
END) STORED,
    "detalle_deuda" "text",
    "firma_estado" "text",
    "firma_fecha" "date",
    "firma_lugar" "text",
    "gasto_notaria" numeric,
    "gasto_cbr" numeric,
    "gasto_abogado" numeric,
    "cbr_estado" "text",
    "cbr_numero_petitorio" "text",
    "cbr_fecha_salida_estimada" "date",
    "cbr_reparo" "text",
    "comision_monto" numeric,
    "comision_pagada_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "etapa_proceso" "text" DEFAULT 'espera_firma_reserva'::"text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "lot_records_etapa_proceso_check" CHECK (("etapa_proceso" = ANY (ARRAY['espera_firma_reserva'::"text", 'reserva_firmada'::"text", 'espera_firma_escritura'::"text", 'escritura_firmada'::"text"])))
);



COMMENT ON COLUMN "public"."lot_records"."etapa_proceso" IS 'Current stage of the sales process: espera_firma_reserva, reserva_firmada, espera_firma_escritura, escritura_firmada';



CREATE TABLE IF NOT EXISTS "public"."lots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "numero_lote" "text" NOT NULL,
    "estado" "public"."estado_lote" DEFAULT 'disponible'::"public"."estado_lote" NOT NULL,
    "vendedor_id" "uuid",
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "precio" numeric,
    "reserved_at" timestamp with time zone,
    "sold_at" timestamp with time zone,
    "geometry_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "m2" numeric,
    "area_official_m2" numeric,
    "perimeter_official_m" numeric,
    "boundaries_official" "jsonb",
    "verified_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "valor_reserva" numeric,
    "servidumbre_m2" numeric,
    "superficie_neta_m2" numeric,
    "servidumbre_ancho_m" numeric,
    CONSTRAINT "lots_verified_status_check" CHECK (("verified_status" = ANY (ARRAY['draft'::"text", 'verified_exact'::"text", 'verified_override'::"text"])))
);



COMMENT ON TABLE "public"."lots" IS 'Lotes comerciales vinculados a proyectos';



COMMENT ON COLUMN "public"."lots"."area_official_m2" IS 'Superficie oficial según plano SAG/CBR (m²)';



COMMENT ON COLUMN "public"."lots"."perimeter_official_m" IS 'Perímetro oficial según plano (metros)';



COMMENT ON COLUMN "public"."lots"."boundaries_official" IS 'Deslindes oficiales JSONB: {north, south, east, west}';



COMMENT ON COLUMN "public"."lots"."verified_status" IS 'Estado de verificación: draft | verified_exact | verified_override';



COMMENT ON COLUMN "public"."lots"."verified_at" IS 'Timestamp de última verificación';



COMMENT ON COLUMN "public"."lots"."verified_by" IS 'UUID del usuario que verificó';



COMMENT ON COLUMN "public"."lots"."servidumbre_ancho_m" IS 'Ancho de la servidumbre en metros, usado para calcular servidumbre_m2 junto con las distancias';



CREATE TABLE IF NOT EXISTS "public"."mcp_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "server_url" "text",
    "credentials_encrypted" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_health_check" timestamp with time zone,
    "last_error" "text",
    "scopes" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mcp_connections_provider_check" CHECK (("provider" = ANY (ARRAY['google_drive'::"text", 'gmail'::"text", 'notion'::"text", 'slack'::"text", 'custom'::"text"]))),
    CONSTRAINT "mcp_connections_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text", 'expired'::"text", 'error'::"text"])))
);



COMMENT ON TABLE "public"."mcp_connections" IS 'Conexiones MCP con credenciales cifradas por usuario/org.';



COMMENT ON COLUMN "public"."mcp_connections"."provider" IS 'google_drive, gmail, notion, slack, custom';



COMMENT ON COLUMN "public"."mcp_connections"."server_url" IS 'URL del servidor MCP (solo para provider=custom)';



COMMENT ON COLUMN "public"."mcp_connections"."credentials_encrypted" IS 'Cifrado con encrypt_credential() → pgp_sym_encrypt via vault key';



CREATE TABLE IF NOT EXISTS "public"."org_skill_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "skill_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true,
    "config_overrides" "jsonb" DEFAULT '{}'::"jsonb",
    "enabled_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);



COMMENT ON TABLE "public"."org_skill_configs" IS 'Configuración de skills por organización. Qué tools tiene activas cada org.';



COMMENT ON COLUMN "public"."org_skill_configs"."config_overrides" IS 'Parámetros específicos por org: {"max_results": 10, "language": "es"}';



CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."org_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);



CREATE TABLE IF NOT EXISTS "public"."organization_payment_info" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "razon_social" "text" NOT NULL,
    "rut" "text" NOT NULL,
    "banco" "text" NOT NULL,
    "tipo_cuenta" "text" DEFAULT 'corriente'::"text" NOT NULL,
    "numero_cuenta" "text" NOT NULL,
    "email_transferencia" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_personal" boolean DEFAULT false NOT NULL
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "avatar_url" "text",
    "website" "text",
    "updated_at" timestamp with time zone,
    "is_super_admin" boolean DEFAULT false NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "telegram_chat_id" "text",
    CONSTRAINT "profiles_username_length" CHECK ((("username" IS NULL) OR ("length"("username") >= 3)))
);



COMMENT ON COLUMN "public"."profiles"."telegram_chat_id" IS 'ID numérico del chat de Telegram del usuario. Requerido para enviar mensajes proactivos.';



CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "region" "text",
    "comuna" "text",
    "descripcion" "text",
    "total_lotes" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "estado" "text" DEFAULT 'activo'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "road_geometry" "jsonb",
    "road_width_m" numeric DEFAULT 6,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "doc_dominio_vigente" "text",
    "doc_hipoteca_gravamen" "text",
    "doc_roles" "text",
    "doc_subdivision" "text",
    "doc_plano_oficial" "text",
    "doc_otros" "text" DEFAULT '[]'::"jsonb",
    CONSTRAINT "projects_estado_check" CHECK (("estado" = ANY (ARRAY['activo'::"text", 'inactivo'::"text"]))),
    CONSTRAINT "projects_total_lotes_check" CHECK (("total_lotes" > 0))
);



COMMENT ON TABLE "public"."projects" IS 'Proyectos de parcelación (región, comuna, total de lotes)';



CREATE TABLE IF NOT EXISTS "public"."prompt_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prompt_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "content" "text" NOT NULL,
    "change_note" "text",
    "author_id" "uuid",
    "is_active" boolean DEFAULT false,
    "tested_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);



COMMENT ON TABLE "public"."prompt_versions" IS 'Versiones de un system_prompt. Solo una is_active=true por prompt_id.';



COMMENT ON COLUMN "public"."prompt_versions"."content" IS 'Texto completo del prompt con placeholders {organization_id}, {lead_info}, etc.';



COMMENT ON COLUMN "public"."prompt_versions"."tested_at" IS 'NULL = no testeado en sandbox. Se llena al usar el sandbox.';



CREATE TABLE IF NOT EXISTS "public"."system_prompts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'agent'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "system_prompts_category_check" CHECK (("category" = ANY (ARRAY['agent'::"text", 'tool_instruction'::"text", 'document'::"text"])))
);



COMMENT ON TABLE "public"."system_prompts" IS 'Catálogo de prompts del sistema (sales_agent, admin_intelligence, etc.)';



COMMENT ON COLUMN "public"."system_prompts"."slug" IS 'Identificador legible: sales_agent, admin_intelligence, doc_generator';



COMMENT ON COLUMN "public"."system_prompts"."category" IS 'agent = prompt de agente, tool_instruction = instrucciones para tool, document = prompt de generación de docs';



CREATE TABLE IF NOT EXISTS "public"."telegram_bots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "bot_token_encrypted" "text" NOT NULL,
    "bot_username" "text" NOT NULL,
    "webhook_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);



CREATE TABLE IF NOT EXISTS "public"."template_block_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "block_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "is_optional" boolean DEFAULT false,
    "condition_field" "text",
    "overrides" "jsonb" DEFAULT '{}'::"jsonb"
);



COMMENT ON TABLE "public"."template_block_items" IS 'Relación template↔bloques con orden de ensamblaje.';



COMMENT ON COLUMN "public"."template_block_items"."position" IS 'Orden secuencial: 1, 2, 3...';



COMMENT ON COLUMN "public"."template_block_items"."is_optional" IS 'Si true, el Admin puede excluir este bloque al generar';



COMMENT ON COLUMN "public"."template_block_items"."condition_field" IS 'Variable que controla inclusión: "servidumbre_m2" → solo si > 0';



COMMENT ON COLUMN "public"."template_block_items"."overrides" IS 'Sobreescrituras de variables para este bloque en este template';



CREATE TABLE IF NOT EXISTS "public"."vendor_projects" (
    "vendor_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "rol" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);



CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "active" boolean DEFAULT true NOT NULL,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"(),
    "organization_id" "uuid",
    "user_id" "uuid",
    CONSTRAINT "vendors_owner_org_xor" CHECK ((("owner_id" IS NULL) <> ("organization_id" IS NULL)))
);



ALTER TABLE ONLY "public"."agent_custom_instructions"
    ADD CONSTRAINT "agent_custom_instructions_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."agent_custom_instructions"
    ADD CONSTRAINT "agent_custom_instructions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_skills"
    ADD CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_skills"
    ADD CONSTRAINT "agent_skills_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkpoint_blobs"
    ADD CONSTRAINT "checkpoint_blobs_pkey" PRIMARY KEY ("thread_id", "checkpoint_ns", "channel", "version");



ALTER TABLE ONLY "public"."checkpoint_migrations"
    ADD CONSTRAINT "checkpoint_migrations_pkey" PRIMARY KEY ("v");



ALTER TABLE ONLY "public"."checkpoint_writes"
    ADD CONSTRAINT "checkpoint_writes_pkey" PRIMARY KEY ("thread_id", "checkpoint_ns", "checkpoint_id", "task_id", "idx");



ALTER TABLE ONLY "public"."checkpoints"
    ADD CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("thread_id", "checkpoint_ns", "checkpoint_id");



ALTER TABLE ONLY "public"."dead_letter_queue"
    ADD CONSTRAINT "dead_letter_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_blocks"
    ADD CONSTRAINT "document_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geometries"
    ADD CONSTRAINT "geometries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lot_records"
    ADD CONSTRAINT "lot_records_lot_id_key" UNIQUE ("lot_id");



ALTER TABLE ONLY "public"."lot_records"
    ADD CONSTRAINT "lot_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lots"
    ADD CONSTRAINT "lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mcp_connections"
    ADD CONSTRAINT "mcp_connections_organization_id_user_id_provider_key" UNIQUE ("organization_id", "user_id", "provider");



ALTER TABLE ONLY "public"."mcp_connections"
    ADD CONSTRAINT "mcp_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_skill_configs"
    ADD CONSTRAINT "org_skill_configs_organization_id_skill_id_key" UNIQUE ("organization_id", "skill_id");



ALTER TABLE ONLY "public"."org_skill_configs"
    ADD CONSTRAINT "org_skill_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_payment_info"
    ADD CONSTRAINT "organization_payment_info_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."organization_payment_info"
    ADD CONSTRAINT "organization_payment_info_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prompt_versions"
    ADD CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prompt_versions"
    ADD CONSTRAINT "prompt_versions_prompt_id_version_key" UNIQUE ("prompt_id", "version");



ALTER TABLE ONLY "public"."system_prompts"
    ADD CONSTRAINT "system_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_prompts"
    ADD CONSTRAINT "system_prompts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."telegram_bots"
    ADD CONSTRAINT "telegram_bots_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."telegram_bots"
    ADD CONSTRAINT "telegram_bots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_block_items"
    ADD CONSTRAINT "template_block_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_block_items"
    ADD CONSTRAINT "template_block_items_template_id_position_key" UNIQUE ("template_id", "position");



ALTER TABLE ONLY "public"."document_blocks"
    ADD CONSTRAINT "uq_doc_blocks_org_name" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."vendor_projects"
    ADD CONSTRAINT "vendor_projects_pkey" PRIMARY KEY ("vendor_id", "project_id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



CREATE INDEX "checkpoint_blobs_thread_id_idx" ON "public"."checkpoint_blobs" USING "btree" ("thread_id");



CREATE INDEX "checkpoint_writes_thread_id_idx" ON "public"."checkpoint_writes" USING "btree" ("thread_id");



CREATE INDEX "checkpoints_thread_id_idx" ON "public"."checkpoints" USING "btree" ("thread_id");



CREATE INDEX "idx_agent_custom_instructions_user_id" ON "public"."agent_custom_instructions" USING "btree" ("user_id");



CREATE INDEX "idx_approval_requests_organization_id" ON "public"."approval_requests" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "idx_approval_requests_pending_lot" ON "public"."approval_requests" USING "btree" ("lot_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_approval_requests_vendor_id" ON "public"."approval_requests" USING "btree" ("vendor_id");



CREATE INDEX "idx_audit_logs_organization_id" ON "public"."audit_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_doc_blocks_org_category" ON "public"."document_blocks" USING "btree" ("organization_id", "category");



CREATE INDEX "idx_document_blocks_created_by" ON "public"."document_blocks" USING "btree" ("created_by");



CREATE INDEX "idx_document_templates_created_by" ON "public"."document_templates" USING "btree" ("created_by");



CREATE INDEX "idx_generated_docs_lot" ON "public"."generated_documents" USING "btree" ("lot_id") WHERE ("lot_id" IS NOT NULL);



CREATE INDEX "idx_generated_docs_org" ON "public"."generated_documents" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_generated_documents_generated_by" ON "public"."generated_documents" USING "btree" ("generated_by");



CREATE INDEX "idx_generated_documents_lot_record_id" ON "public"."generated_documents" USING "btree" ("lot_record_id");



CREATE INDEX "idx_generated_documents_template_id" ON "public"."generated_documents" USING "btree" ("template_id");



CREATE INDEX "idx_geometries_lot" ON "public"."geometries" USING "btree" ("lot_id");



CREATE INDEX "idx_geometries_project" ON "public"."geometries" USING "btree" ("project_id");



CREATE INDEX "idx_geometries_properties" ON "public"."geometries" USING "gin" ("properties");



CREATE INDEX "idx_geometries_type" ON "public"."geometries" USING "btree" ("geometry_type");



CREATE INDEX "idx_leads_organization_id" ON "public"."leads" USING "btree" ("organization_id");



CREATE INDEX "idx_lot_records_run" ON "public"."lot_records" USING "btree" ("cliente_run_normalizado");



CREATE INDEX "idx_lots_boundaries_official" ON "public"."lots" USING "gin" ("boundaries_official");



CREATE INDEX "idx_lots_estado" ON "public"."lots" USING "btree" ("estado");



CREATE INDEX "idx_lots_geometry_id" ON "public"."lots" USING "btree" ("geometry_id");



CREATE INDEX "idx_lots_project" ON "public"."lots" USING "btree" ("project_id");



CREATE INDEX "idx_lots_vendedor" ON "public"."lots" USING "btree" ("vendedor_id");



CREATE INDEX "idx_lots_vendedor_id_project_id" ON "public"."lots" USING "btree" ("vendedor_id", "project_id");



CREATE INDEX "idx_lots_verified_by" ON "public"."lots" USING "btree" ("verified_by");



CREATE INDEX "idx_lots_verified_status" ON "public"."lots" USING "btree" ("verified_status");



CREATE INDEX "idx_mcp_connections_user_id" ON "public"."mcp_connections" USING "btree" ("user_id");



CREATE INDEX "idx_org_skill_configs_enabled_by" ON "public"."org_skill_configs" USING "btree" ("enabled_by");



CREATE INDEX "idx_org_skill_configs_skill_id" ON "public"."org_skill_configs" USING "btree" ("skill_id");



CREATE INDEX "idx_organization_members_user_id" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_organizations_created_by" ON "public"."organizations" USING "btree" ("created_by");



CREATE INDEX "idx_projects_estado" ON "public"."projects" USING "btree" ("estado");



CREATE INDEX "idx_prompt_versions_active" ON "public"."prompt_versions" USING "btree" ("prompt_id") WHERE ("is_active" = true);



CREATE INDEX "idx_prompt_versions_author_id" ON "public"."prompt_versions" USING "btree" ("author_id");



CREATE INDEX "idx_telegram_bots_created_by" ON "public"."telegram_bots" USING "btree" ("created_by");



CREATE INDEX "idx_telegram_bots_org" ON "public"."telegram_bots" USING "btree" ("organization_id");



CREATE INDEX "idx_template_block_items_block_id" ON "public"."template_block_items" USING "btree" ("block_id");



CREATE INDEX "idx_vendor_projects_project" ON "public"."vendor_projects" USING "btree" ("project_id");



CREATE INDEX "idx_vendor_projects_vendor" ON "public"."vendor_projects" USING "btree" ("vendor_id");



CREATE INDEX "idx_vendors_organization_id_user_id" ON "public"."vendors" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_vendors_owner_id" ON "public"."vendors" USING "btree" ("owner_id");



CREATE INDEX "organization_members_org_id_idx" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "organizations_slug_key" ON "public"."organizations" USING "btree" ("slug");



CREATE UNIQUE INDEX "profiles_username_key" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "projects_org_id_idx" ON "public"."projects" USING "btree" ("organization_id");



CREATE INDEX "vendors_org_id_idx" ON "public"."vendors" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "vendors_user_id_key" ON "public"."vendors" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "lot_records_on_lot_insert" AFTER INSERT ON "public"."lots" FOR EACH ROW EXECUTE FUNCTION "public"."handle_lot_records_on_lot_insert"();



CREATE OR REPLACE TRIGGER "trg_guard_legal_fields" BEFORE UPDATE ON "public"."lots" FOR EACH ROW EXECUTE FUNCTION "public"."guard_legal_fields"();



CREATE OR REPLACE TRIGGER "trg_notify_stage_change" AFTER UPDATE ON "public"."lot_records" FOR EACH ROW EXECUTE FUNCTION "public"."notify_stage_change"();



CREATE OR REPLACE TRIGGER "trg_organization_payment_info_updated_at" BEFORE UPDATE ON "public"."organization_payment_info" FOR EACH ROW EXECUTE FUNCTION "public"."update_organization_payment_info_updated_at"();



CREATE OR REPLACE TRIGGER "trg_single_active_prompt" BEFORE INSERT OR UPDATE ON "public"."prompt_versions" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_single_active_prompt_version"();



CREATE OR REPLACE TRIGGER "trg_sync_profile_to_vendor" AFTER UPDATE OF "first_name", "last_name", "phone", "username" ON "public"."profiles" FOR EACH ROW WHEN ((("old"."first_name" IS DISTINCT FROM "new"."first_name") OR ("old"."last_name" IS DISTINCT FROM "new"."last_name") OR ("old"."phone" IS DISTINCT FROM "new"."phone") OR ("old"."username" IS DISTINCT FROM "new"."username"))) EXECUTE FUNCTION "public"."sync_profile_to_vendor"();



ALTER TABLE ONLY "public"."agent_custom_instructions"
    ADD CONSTRAINT "agent_custom_instructions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_custom_instructions"
    ADD CONSTRAINT "agent_custom_instructions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_blocks"
    ADD CONSTRAINT "document_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."document_blocks"
    ADD CONSTRAINT "document_blocks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id");



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_lot_record_id_fkey" FOREIGN KEY ("lot_record_id") REFERENCES "public"."lot_records"("id");



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id");



ALTER TABLE ONLY "public"."geometries"
    ADD CONSTRAINT "geometries_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id");



ALTER TABLE ONLY "public"."geometries"
    ADD CONSTRAINT "geometries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lot_records"
    ADD CONSTRAINT "lot_records_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lots"
    ADD CONSTRAINT "lots_geometry_fk" FOREIGN KEY ("geometry_id") REFERENCES "public"."geometries"("id");



ALTER TABLE ONLY "public"."lots"
    ADD CONSTRAINT "lots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lots"
    ADD CONSTRAINT "lots_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."lots"
    ADD CONSTRAINT "lots_vendor_project_fkey" FOREIGN KEY ("vendedor_id", "project_id") REFERENCES "public"."vendor_projects"("vendor_id", "project_id");



ALTER TABLE ONLY "public"."lots"
    ADD CONSTRAINT "lots_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mcp_connections"
    ADD CONSTRAINT "mcp_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mcp_connections"
    ADD CONSTRAINT "mcp_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_skill_configs"
    ADD CONSTRAINT "org_skill_configs_enabled_by_fkey" FOREIGN KEY ("enabled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."org_skill_configs"
    ADD CONSTRAINT "org_skill_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_skill_configs"
    ADD CONSTRAINT "org_skill_configs_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."organization_payment_info"
    ADD CONSTRAINT "organization_payment_info_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."prompt_versions"
    ADD CONSTRAINT "prompt_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."prompt_versions"
    ADD CONSTRAINT "prompt_versions_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "public"."system_prompts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_bots"
    ADD CONSTRAINT "telegram_bots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."telegram_bots"
    ADD CONSTRAINT "telegram_bots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_block_items"
    ADD CONSTRAINT "template_block_items_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."document_blocks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."template_block_items"
    ADD CONSTRAINT "template_block_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_projects"
    ADD CONSTRAINT "vendor_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_projects"
    ADD CONSTRAINT "vendor_projects_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_org_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "public"."organization_members"("organization_id", "user_id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can delete their organization's bot" ON "public"."telegram_bots" FOR DELETE USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "Admins can insert their organization's bot" ON "public"."telegram_bots" FOR INSERT WITH CHECK ("public"."is_org_admin"("organization_id"));



CREATE POLICY "Admins can update their organization's bot" ON "public"."telegram_bots" FOR UPDATE USING ("public"."is_org_admin"("organization_id")) WITH CHECK ("public"."is_org_admin"("organization_id"));



CREATE POLICY "Leads are viewable by everyone in the organization" ON "public"."leads" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Members can view their organization's bot" ON "public"."telegram_bots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "telegram_bots"."organization_id") AND ("organization_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Service Role can full access leads" ON "public"."leads" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."agent_custom_instructions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_insert" ON "public"."audit_logs" FOR INSERT WITH CHECK (("actor" = ("auth"."uid"())::"text"));



CREATE POLICY "audit_logs_select" ON "public"."audit_logs" FOR SELECT USING (("actor" = ("auth"."uid"())::"text"));



CREATE POLICY "audit_logs_super_admin_insert" ON "public"."audit_logs" FOR INSERT WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "audit_logs_super_admin_select" ON "public"."audit_logs" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "authenticated_read" ON "public"."agent_skills" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."document_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geometries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "geometries_delete" ON "public"."geometries" FOR DELETE USING ("public"."is_project_admin"("project_id"));



CREATE POLICY "geometries_insert" ON "public"."geometries" FOR INSERT WITH CHECK ("public"."is_project_admin"("project_id"));



CREATE POLICY "geometries_select" ON "public"."geometries" FOR SELECT USING (("public"."is_project_admin"("project_id") OR "public"."is_project_vendor"("project_id")));



CREATE POLICY "geometries_super_admin_all" ON "public"."geometries" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "geometries_update" ON "public"."geometries" FOR UPDATE USING ("public"."is_project_admin"("project_id"));



ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lot_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lot_records_delete" ON "public"."lot_records" FOR DELETE USING ("public"."is_project_admin"(( SELECT "l"."project_id"
   FROM "public"."lots" "l"
  WHERE ("l"."id" = "lot_records"."lot_id"))));



CREATE POLICY "lot_records_insert" ON "public"."lot_records" FOR INSERT WITH CHECK ("public"."is_project_admin"(( SELECT "l"."project_id"
   FROM "public"."lots" "l"
  WHERE ("l"."id" = "lot_records"."lot_id"))));



CREATE POLICY "lot_records_select" ON "public"."lot_records" FOR SELECT USING (("public"."is_project_admin"(( SELECT "l"."project_id"
   FROM "public"."lots" "l"
  WHERE ("l"."id" = "lot_records"."lot_id"))) OR (EXISTS ( SELECT 1
   FROM ("public"."lots" "l"
     JOIN "public"."vendors" "v" ON (("v"."id" = "l"."vendedor_id")))
  WHERE (("l"."id" = "lot_records"."lot_id") AND ("v"."user_id" = "auth"."uid"()))))));



CREATE POLICY "lot_records_super_admin_all" ON "public"."lot_records" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "lot_records_update" ON "public"."lot_records" FOR UPDATE USING (("public"."is_project_admin"(( SELECT "l"."project_id"
   FROM "public"."lots" "l"
  WHERE ("l"."id" = "lot_records"."lot_id"))) OR (EXISTS ( SELECT 1
   FROM ("public"."lots" "l"
     JOIN "public"."vendors" "v" ON (("v"."id" = "l"."vendedor_id")))
  WHERE (("l"."id" = "lot_records"."lot_id") AND ("v"."user_id" = "auth"."uid"())))))) WITH CHECK (("public"."is_project_admin"(( SELECT "l"."project_id"
   FROM "public"."lots" "l"
  WHERE ("l"."id" = "lot_records"."lot_id"))) OR (EXISTS ( SELECT 1
   FROM ("public"."lots" "l"
     JOIN "public"."vendors" "v" ON (("v"."id" = "l"."vendedor_id")))
  WHERE (("l"."id" = "lot_records"."lot_id") AND ("v"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."lots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lots_delete" ON "public"."lots" FOR DELETE USING ("public"."is_project_admin"("project_id"));



CREATE POLICY "lots_insert" ON "public"."lots" FOR INSERT WITH CHECK ("public"."is_project_admin"("project_id"));



CREATE POLICY "lots_select" ON "public"."lots" FOR SELECT USING (("public"."is_project_admin"("project_id") OR "public"."is_project_vendor"("project_id")));



CREATE POLICY "lots_super_admin_all" ON "public"."lots" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "lots_update" ON "public"."lots" FOR UPDATE USING (("public"."is_super_admin"() OR "public"."is_project_admin"("project_id") OR ("public"."is_project_vendor"("project_id") AND (("vendedor_id" IS NULL) OR ("vendedor_id" = ( SELECT "vendors"."id"
   FROM "public"."vendors"
  WHERE ("vendors"."user_id" = "auth"."uid"())
 LIMIT 1))))));



ALTER TABLE "public"."mcp_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_admin_all" ON "public"."document_blocks" USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "org_admin_all" ON "public"."document_templates" USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "org_admin_all" ON "public"."org_skill_configs" USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "org_admin_read" ON "public"."generated_documents" FOR SELECT USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "org_admin_via_template" ON "public"."template_block_items" USING ((EXISTS ( SELECT 1
   FROM "public"."document_templates" "dt"
  WHERE (("dt"."id" = "template_block_items"."template_id") AND "public"."is_org_admin"("dt"."organization_id")))));



CREATE POLICY "org_admins_read_audit" ON "public"."audit_logs" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'admin'::"public"."org_role")))));



CREATE POLICY "org_admins_write_payment_info" ON "public"."organization_payment_info" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'admin'::"public"."org_role")))));



CREATE POLICY "org_member_read" ON "public"."document_blocks" FOR SELECT USING ("public"."is_org_user"("organization_id"));



CREATE POLICY "org_member_read" ON "public"."document_templates" FOR SELECT USING ("public"."is_org_user"("organization_id"));



CREATE POLICY "org_member_read" ON "public"."org_skill_configs" FOR SELECT USING ("public"."is_org_user"("organization_id"));



CREATE POLICY "org_member_read_via_template" ON "public"."template_block_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."document_templates" "dt"
  WHERE (("dt"."id" = "template_block_items"."template_id") AND "public"."is_org_user"("dt"."organization_id")))));



CREATE POLICY "org_members_can_insert_approvals" ON "public"."approval_requests" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE ("om"."user_id" = "auth"."uid"()))));



CREATE POLICY "org_members_can_view_approvals" ON "public"."approval_requests" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "org_members_delete" ON "public"."organization_members" FOR DELETE USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "org_members_insert" ON "public"."organization_members" FOR INSERT WITH CHECK (((("user_id" = "auth"."uid"()) AND ("role" = 'admin'::"public"."org_role") AND (EXISTS ( SELECT 1
   FROM "public"."organizations" "o"
  WHERE (("o"."id" = "organization_members"."organization_id") AND ("o"."created_by" = "auth"."uid"()))))) OR "public"."is_org_admin"("organization_id")));



CREATE POLICY "org_members_insert_audit" ON "public"."audit_logs" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "org_members_read_payment_info" ON "public"."organization_payment_info" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "org_members_select" ON "public"."organization_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_org_admin"("organization_id")));



CREATE POLICY "org_members_update" ON "public"."organization_members" FOR UPDATE USING ("public"."is_org_admin"("organization_id")) WITH CHECK ("public"."is_org_admin"("organization_id"));



ALTER TABLE "public"."org_skill_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_members_super_admin_all" ON "public"."organization_members" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."organization_payment_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_delete" ON "public"."organizations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organizations"."id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = 'admin'::"public"."org_role")))));



CREATE POLICY "organizations_insert" ON "public"."organizations" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "organizations_select" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organizations"."id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "organizations_super_admin_all" ON "public"."organizations" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "organizations_update" ON "public"."organizations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organizations"."id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = 'admin'::"public"."org_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organizations"."id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = 'admin'::"public"."org_role")))));



CREATE POLICY "own_connections" ON "public"."mcp_connections" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own_instructions" ON "public"."agent_custom_instructions" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("public"."is_super_admin"() OR (("auth"."uid"() = "id") AND ("is_super_admin" IS NOT TRUE))));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_super_admin"()));



CREATE POLICY "profiles_select_org_members" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."organization_members" "my_membership"
     JOIN "public"."organization_members" "their_membership" ON (("my_membership"."organization_id" = "their_membership"."organization_id")))
  WHERE (("my_membership"."user_id" = "auth"."uid"()) AND ("their_membership"."user_id" = "profiles"."id")))));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING ((("auth"."uid"() = "id") OR "public"."is_super_admin"())) WITH CHECK (("public"."is_super_admin"() OR (("auth"."uid"() = "id") AND ("is_super_admin" IS NOT TRUE))));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete" ON "public"."projects" FOR DELETE USING (("public"."is_super_admin"() OR "public"."is_org_admin"("organization_id")));



CREATE POLICY "projects_insert" ON "public"."projects" FOR INSERT WITH CHECK (("public"."is_super_admin"() OR "public"."is_org_admin"("organization_id")));



CREATE POLICY "projects_select" ON "public"."projects" FOR SELECT USING (("public"."is_super_admin"() OR "public"."is_org_admin"("organization_id") OR "public"."is_project_vendor"("id")));



CREATE POLICY "projects_super_admin_all" ON "public"."projects" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "projects_update" ON "public"."projects" FOR UPDATE USING (("public"."is_super_admin"() OR "public"."is_org_admin"("organization_id")));



ALTER TABLE "public"."prompt_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super_admin_all" ON "public"."prompt_versions" USING ("public"."is_super_admin"());



CREATE POLICY "super_admin_all" ON "public"."system_prompts" USING ("public"."is_super_admin"());



CREATE POLICY "super_admin_all_blocks" ON "public"."document_blocks" USING ("public"."is_super_admin"());



CREATE POLICY "super_admin_all_gen_docs" ON "public"."generated_documents" USING ("public"."is_super_admin"());



CREATE POLICY "super_admin_all_templates" ON "public"."document_templates" USING ("public"."is_super_admin"());



CREATE POLICY "super_admin_write" ON "public"."agent_skills" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."system_prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_bots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_block_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendor_projects_delete" ON "public"."vendor_projects" FOR DELETE USING ("public"."is_project_admin"("project_id"));



CREATE POLICY "vendor_projects_insert" ON "public"."vendor_projects" FOR INSERT WITH CHECK ("public"."is_project_admin"("project_id"));



CREATE POLICY "vendor_projects_select" ON "public"."vendor_projects" FOR SELECT USING (("public"."is_project_admin"("project_id") OR (EXISTS ( SELECT 1
   FROM "public"."vendors" "v"
  WHERE (("v"."id" = "vendor_projects"."vendor_id") AND ("v"."user_id" = "auth"."uid"()))))));



CREATE POLICY "vendor_projects_super_admin_all" ON "public"."vendor_projects" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "vendor_projects_update" ON "public"."vendor_projects" FOR UPDATE USING ("public"."is_project_admin"("project_id"));



ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendors_delete" ON "public"."vendors" FOR DELETE USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "vendors_insert" ON "public"."vendors" FOR INSERT WITH CHECK ("public"."is_org_admin"("organization_id"));



CREATE POLICY "vendors_select" ON "public"."vendors" FOR SELECT USING (("public"."is_org_admin"("organization_id") OR ("user_id" = "auth"."uid"())));



CREATE POLICY "vendors_super_admin_all" ON "public"."vendors" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "vendors_update" ON "public"."vendors" FOR UPDATE USING (("public"."is_org_admin"("organization_id") OR ("user_id" = "auth"."uid"())));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_mcp_connection"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_credentials" "text", "p_server_url" "text", "p_scopes" "text"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."add_mcp_connection"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_credentials" "text", "p_server_url" "text", "p_scopes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."add_mcp_connection"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_credentials" "text", "p_server_url" "text", "p_scopes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_mcp_connection"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text", "p_display_name" "text", "p_credentials" "text", "p_server_url" "text", "p_scopes" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."approve_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_project_files"("project_id_text" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."can_manage_project_files"("project_id_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_project_files"("project_id_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_project_files"("project_id_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_read_project_files"("project_id_text" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."can_read_project_files"("project_id_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_project_files"("project_id_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_project_files"("project_id_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrypt_credential"("p_encrypted" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."decrypt_credential"("p_encrypted" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."decrypt_credential"("p_encrypted" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrypt_credential"("p_encrypted" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."encrypt_credential"("p_plaintext" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."encrypt_credential"("p_plaintext" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."encrypt_credential"("p_plaintext" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."encrypt_credential"("p_plaintext" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_single_active_prompt_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."ensure_single_active_prompt_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_active_prompt_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_active_prompt_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_decrypted_bot_token"("p_org_id" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_decrypted_bot_token"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_decrypted_bot_token"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_decrypted_bot_token"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_mcp_credentials"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_mcp_credentials"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_mcp_credentials"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_mcp_credentials"("p_org_id" "uuid", "p_user_id" "uuid", "p_provider" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_legal_fields"() TO "postgres";
GRANT ALL ON FUNCTION "public"."guard_legal_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_legal_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_legal_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_lot_records_on_lot_insert"() TO "postgres";
GRANT ALL ON FUNCTION "public"."handle_lot_records_on_lot_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_lot_records_on_lot_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_lot_records_on_lot_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "postgres";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_user"("org_id" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_org_user"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_user"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_user"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_project_admin"("target_project_id" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_project_admin"("target_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_project_admin"("target_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_project_admin"("target_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_project_vendor"("target_project_id" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_project_vendor"("target_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_project_vendor"("target_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_project_vendor"("target_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "postgres";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_stage_change"() TO "postgres";
GRANT ALL ON FUNCTION "public"."notify_stage_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_stage_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_stage_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."register_telegram_bot"("p_org_id" "uuid", "p_token" "text", "p_username" "text", "p_webhook_url" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."register_telegram_bot"("p_org_id" "uuid", "p_token" "text", "p_username" "text", "p_webhook_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_telegram_bot"("p_org_id" "uuid", "p_token" "text", "p_username" "text", "p_webhook_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_telegram_bot"("p_org_id" "uuid", "p_token" "text", "p_username" "text", "p_webhook_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."reject_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_reservation"("p_approval_id" "uuid", "p_admin_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_document_blocks"("p_org_id" "uuid", "p_user_id" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."seed_default_document_blocks"("p_org_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_document_blocks"("p_org_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_document_blocks"("p_org_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_escritura_blocks"("p_org_id" "uuid", "p_user_id" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."seed_escritura_blocks"("p_org_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_escritura_blocks"("p_org_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_escritura_blocks"("p_org_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_to_vendor"() TO "postgres";
GRANT ALL ON FUNCTION "public"."sync_profile_to_vendor"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_to_vendor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_to_vendor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_organization_payment_info_updated_at"() TO "postgres";
GRANT ALL ON FUNCTION "public"."update_organization_payment_info_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_organization_payment_info_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_organization_payment_info_updated_at"() TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agent_custom_instructions" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agent_custom_instructions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agent_custom_instructions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agent_custom_instructions" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agent_skills" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agent_skills" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agent_skills" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agent_skills" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."approval_requests" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."approval_requests" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."approval_requests" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."approval_requests" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoint_blobs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoint_blobs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoint_blobs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoint_migrations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoint_migrations" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoint_migrations" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoint_writes" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoint_writes" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoint_writes" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoints" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoints" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."checkpoints" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."dead_letter_queue" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."dead_letter_queue" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."dead_letter_queue" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."dead_letter_queue" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."document_blocks" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."document_blocks" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."document_blocks" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."document_blocks" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."document_templates" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."document_templates" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."document_templates" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."document_templates" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_documents" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_documents" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_documents" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_documents" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."geometries" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."geometries" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."geometries" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."geometries" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."leads" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."leads" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."leads" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."leads" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."lot_records" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."lot_records" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."lot_records" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."lot_records" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."lots" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."lots" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."lots" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."lots" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."mcp_connections" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."mcp_connections" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."mcp_connections" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."mcp_connections" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."org_skill_configs" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."org_skill_configs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."org_skill_configs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."org_skill_configs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organization_members" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organization_members" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organization_members" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organization_members" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organization_payment_info" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organization_payment_info" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organization_payment_info" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organization_payment_info" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organizations" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organizations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organizations" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organizations" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."projects" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."projects" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."projects" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."projects" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."prompt_versions" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."prompt_versions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."prompt_versions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."prompt_versions" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_prompts" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_prompts" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_prompts" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_prompts" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."telegram_bots" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."telegram_bots" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."telegram_bots" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."telegram_bots" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."template_block_items" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."template_block_items" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."template_block_items" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."template_block_items" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."vendor_projects" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."vendor_projects" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."vendor_projects" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."vendor_projects" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."vendors" TO "postgres";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."vendors" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."vendors" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."vendors" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "service_role";





INSERT INTO "storage"."buckets" (
    "id",
    "name",
    "public",
    "file_size_limit",
    "allowed_mime_types"
)
VALUES
    ('avatars', 'avatars', true, NULL, NULL),
    ('project-files', 'project-files', true, NULL, NULL),
    (
        'documents',
        'documents',
        false,
        10485760,
        ARRAY[
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
    )
ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "public" = EXCLUDED."public",
    "file_size_limit" = EXCLUDED."file_size_limit",
    "allowed_mime_types" = EXCLUDED."allowed_mime_types";


CREATE POLICY "Public Access for avatars"
ON "storage"."objects"
FOR SELECT
USING (("bucket_id" = 'avatars'::"text"));


CREATE POLICY "Users can upload their own avatar"
ON "storage"."objects"
FOR INSERT
TO "authenticated"
WITH CHECK ((("bucket_id" = 'avatars'::"text") AND ("auth"."uid"() = "owner")));


CREATE POLICY "Users can update their own avatar"
ON "storage"."objects"
FOR UPDATE
TO "authenticated"
USING ((("bucket_id" = 'avatars'::"text") AND ("auth"."uid"() = "owner")));


CREATE POLICY "Users can delete their own avatar"
ON "storage"."objects"
FOR DELETE
TO "authenticated"
USING ((("bucket_id" = 'avatars'::"text") AND ("auth"."uid"() = "owner")));


CREATE POLICY "Lectura selectiva project-files"
ON "storage"."objects"
FOR SELECT
TO "authenticated"
USING (("bucket_id" = 'project-files'::"text"));


CREATE POLICY "Gestion miembros project-files"
ON "storage"."objects"
TO "authenticated"
USING (
    ("bucket_id" = 'project-files'::"text")
    AND (EXISTS (
        SELECT 1
        FROM "public"."organization_members"
        WHERE ("organization_members"."user_id" = "auth"."uid"())
    ))
)
WITH CHECK (
    ("bucket_id" = 'project-files'::"text")
    AND (EXISTS (
        SELECT 1
        FROM "public"."organization_members"
        WHERE ("organization_members"."user_id" = "auth"."uid"())
    ))
);


CREATE POLICY "org_admin_read_documents"
ON "storage"."objects"
FOR SELECT
USING (
    ("bucket_id" = 'documents'::"text")
    AND "public"."is_org_admin"((("string_to_array"("name", '/'::"text"))[1])::"uuid")
);


CREATE POLICY "super_admin_read_documents"
ON "storage"."objects"
FOR SELECT
USING (
    ("bucket_id" = 'documents'::"text")
    AND "public"."is_super_admin"()
);




