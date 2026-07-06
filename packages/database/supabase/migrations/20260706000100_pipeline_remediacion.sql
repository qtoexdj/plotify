-- Migration: SDD16 pipeline remediación — datos de comprador (nacionalidad/región/comuna)
-- Date: 2026-07-06
-- Path: packages/database/supabase/migrations/20260706000100_pipeline_remediacion.sql
--
-- FR-003/FR-004: approve_sale/approve_reservation descartaban nacionalidad,
-- región y comuna del comprador aunque el formulario ya los pedía (SDD15),
-- y approve_sale nunca copiaba firma_lugar/firma_fecha (notaria/fecha_firma
-- del payload) a lot_records. Esto dejaba comprador.nacionalidad permanentemente
-- ausente en el puente operacional de escrituras.
--
-- Solo la parte segura (data-model.md §1 y §3). NO incluye los REVOKE de
-- seguridad ni el bucket privado (data-model.md §4/§5): esos requieren HG-2
-- y van en una migración separada (T060/T061).

-- §1. Columnas nuevas en lot_records (nullable, sin default)
ALTER TABLE public.lot_records
  ADD COLUMN IF NOT EXISTS cliente_nacionalidad text,
  ADD COLUMN IF NOT EXISTS cliente_region       text,
  ADD COLUMN IF NOT EXISTS cliente_comuna        text;

-- §3. approve_reservation: copiar cliente_nacionalidad/region/comuna
-- (mismo patrón COALESCE que cliente_direccion/estado_civil/ocupacion/etc.
-- de la migración 20260701000100_sale_approval_full_buyer_data.sql).
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

    -- 5. UPSERT en lot_records con datos del payload (incluye datos del
    -- comprador que antes se descartaban)
    INSERT INTO public.lot_records (
        lot_id,
        cliente_nombre,
        cliente_run,
        cliente_direccion,
        cliente_estado_civil,
        cliente_ocupacion,
        cliente_telefono,
        cliente_email,
        cliente_nacionalidad,
        cliente_region,
        cliente_comuna,
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
        v_payload->>'cliente_direccion',
        v_payload->>'cliente_estado_civil',
        v_payload->>'cliente_ocupacion',
        v_payload->>'cliente_telefono',
        v_payload->>'cliente_email',
        v_payload->>'cliente_nacionalidad',
        v_payload->>'cliente_region',
        v_payload->>'cliente_comuna',
        (v_payload->>'valor_reserva')::numeric,
        v_payload->>'notaria',
        (v_payload->>'fecha_firma')::date,
        'espera_firma_reserva',
        now()
    )
    ON CONFLICT (lot_id) DO UPDATE SET
        cliente_nombre = EXCLUDED.cliente_nombre,
        cliente_run = EXCLUDED.cliente_run,
        cliente_direccion = COALESCE(EXCLUDED.cliente_direccion, lot_records.cliente_direccion),
        cliente_estado_civil = COALESCE(EXCLUDED.cliente_estado_civil, lot_records.cliente_estado_civil),
        cliente_ocupacion = COALESCE(EXCLUDED.cliente_ocupacion, lot_records.cliente_ocupacion),
        cliente_telefono = COALESCE(EXCLUDED.cliente_telefono, lot_records.cliente_telefono),
        cliente_email = COALESCE(EXCLUDED.cliente_email, lot_records.cliente_email),
        cliente_nacionalidad = COALESCE(EXCLUDED.cliente_nacionalidad, lot_records.cliente_nacionalidad),
        cliente_region = COALESCE(EXCLUDED.cliente_region, lot_records.cliente_region),
        cliente_comuna = COALESCE(EXCLUDED.cliente_comuna, lot_records.cliente_comuna),
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

-- §3. approve_sale: copiar cliente_nacionalidad/region/comuna y, por primera
-- vez, firma_lugar/firma_fecha (payload.notaria/payload.fecha_firma). COALESCE
-- en el ON CONFLICT para no borrar datos ya cargados durante la reserva
-- cuando la venta no reenvía el mismo campo.
CREATE OR REPLACE FUNCTION "public"."approve_sale"("p_approval_id" "uuid", "p_admin_phone" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $$
DECLARE
    v_request record;
    v_lot record;
    v_payload jsonb;
BEGIN
    -- 1. Leer y bloquear la solicitud de aprobación de venta
    SELECT * INTO v_request
    FROM public.approval_requests
    WHERE id = p_approval_id AND status = 'pending' AND request_type = 'sale'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada o ya procesada.');
    END IF;

    -- Validar permisos: solo service_role o administrador de la organización
    IF auth.role() <> 'service_role' AND NOT public.is_org_admin(v_request.organization_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado: Se requiere rol de servicio o administrador de la organización.');
    END IF;

    -- 2. Verificar que el lote esté en el estado previo capturado
    SELECT * INTO v_lot
    FROM public.lots
    WHERE id = v_request.lot_id AND estado::text = COALESCE(v_request.previous_lot_state, 'reservado')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'El estado actual del lote no coincide con el estado original de la solicitud.');
    END IF;

    v_payload := v_request.payload;

    -- 3. Marcar solicitud como aprobada
    UPDATE public.approval_requests
    SET status = 'approved',
        admin_phone = p_admin_phone,
        resolved_at = now()
    WHERE id = p_approval_id;

    -- 4. Actualizar lote a vendido
    UPDATE public.lots
    SET estado = 'vendido',
        sold_at = now(),
        vendedor_id = CASE WHEN v_request.sale_mode = 'direct' THEN v_request.vendor_id ELSE vendedor_id END
    WHERE id = v_request.lot_id;

    -- 5. Actualizar lot_records a escritura_firmada (incluye datos del
    -- comprador que antes se descartaban)
    INSERT INTO public.lot_records (
        lot_id,
        cliente_nombre,
        cliente_run,
        cliente_direccion,
        cliente_estado_civil,
        cliente_ocupacion,
        cliente_telefono,
        cliente_email,
        cliente_nacionalidad,
        cliente_region,
        cliente_comuna,
        valor,
        firma_lugar,
        firma_fecha,
        etapa_proceso,
        updated_at
    )
    VALUES (
        v_request.lot_id,
        COALESCE(v_payload->>'cliente_nombre', ''),
        COALESCE(v_payload->>'cliente_run', ''),
        v_payload->>'cliente_direccion',
        v_payload->>'cliente_estado_civil',
        v_payload->>'cliente_ocupacion',
        v_payload->>'cliente_telefono',
        v_payload->>'cliente_email',
        v_payload->>'cliente_nacionalidad',
        v_payload->>'cliente_region',
        v_payload->>'cliente_comuna',
        COALESCE((v_payload->>'valor_final')::numeric, v_lot.precio),
        v_payload->>'notaria',
        (v_payload->>'fecha_firma')::date,
        'escritura_firmada',
        now()
    )
    ON CONFLICT (lot_id) DO UPDATE SET
        cliente_nombre = COALESCE(EXCLUDED.cliente_nombre, lot_records.cliente_nombre),
        cliente_run = COALESCE(EXCLUDED.cliente_run, lot_records.cliente_run),
        cliente_direccion = COALESCE(EXCLUDED.cliente_direccion, lot_records.cliente_direccion),
        cliente_estado_civil = COALESCE(EXCLUDED.cliente_estado_civil, lot_records.cliente_estado_civil),
        cliente_ocupacion = COALESCE(EXCLUDED.cliente_ocupacion, lot_records.cliente_ocupacion),
        cliente_telefono = COALESCE(EXCLUDED.cliente_telefono, lot_records.cliente_telefono),
        cliente_email = COALESCE(EXCLUDED.cliente_email, lot_records.cliente_email),
        cliente_nacionalidad = COALESCE(EXCLUDED.cliente_nacionalidad, lot_records.cliente_nacionalidad),
        cliente_region = COALESCE(EXCLUDED.cliente_region, lot_records.cliente_region),
        cliente_comuna = COALESCE(EXCLUDED.cliente_comuna, lot_records.cliente_comuna),
        valor = COALESCE(EXCLUDED.valor, lot_records.valor),
        firma_lugar = COALESCE(EXCLUDED.firma_lugar, lot_records.firma_lugar),
        firma_fecha = COALESCE(EXCLUDED.firma_fecha, lot_records.firma_fecha),
        etapa_proceso = EXCLUDED.etapa_proceso,
        updated_at = now();

    -- 6. Insertar en logs de auditoría de forma atómica (T075)
    INSERT INTO public.audit_logs (
        organization_id,
        actor,
        action,
        entity,
        entity_id,
        payload
    )
    VALUES (
        v_request.organization_id,
        COALESCE(p_admin_phone, 'admin'),
        'sale.approved',
        'approval_requests',
        p_approval_id::text,
        jsonb_build_object(
            'lot_id', v_request.lot_id,
            'approval_id', p_approval_id,
            'request_type', 'sale',
            'sale_mode', v_request.sale_mode,
            'previous_lot_state', v_request.previous_lot_state,
            'actor_phone', p_admin_phone,
            'vendor_id', v_request.vendor_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'lot_id', v_request.lot_id,
        'vendor_phone', v_request.vendor_phone,
        'vendor_platform', v_request.vendor_platform,
        'vendor_name', v_request.vendor_name
    );
END;
$$;
