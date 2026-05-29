-- Migration: Stabilize Plotify MVP - Sale Approval Support
-- Date: 2026-05-25
-- Path: packages/database/supabase/migrations/20260525000300_mvp_sale_approval.sql

-- ── 1. EXTEND APPROVAL REQUESTS (T074) ──
ALTER TABLE public.approval_requests
    ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'reservation' NOT NULL;

ALTER TABLE public.approval_requests
    DROP CONSTRAINT IF EXISTS approval_requests_request_type_check;

ALTER TABLE public.approval_requests
    ADD CONSTRAINT approval_requests_request_type_check 
    CHECK (request_type = ANY (ARRAY['reservation'::text, 'sale'::text]));

-- Add columns for sale mode and previous lot state
ALTER TABLE public.approval_requests
    ADD COLUMN IF NOT EXISTS sale_mode TEXT CHECK (sale_mode IN ('direct', 'reserved')) NULL,
    ADD COLUMN IF NOT EXISTS previous_lot_state TEXT CHECK (previous_lot_state IN ('disponible', 'reservado')) NULL;

-- Re-create unique index for pending lot (enforces only one pending approval of ANY type per lot)
DROP INDEX IF EXISTS public.idx_approval_requests_pending_lot;
CREATE UNIQUE INDEX idx_approval_requests_pending_lot 
    ON public.approval_requests (lot_id) 
    WHERE (status = 'pending'::text);


-- ── 2. SALE RESOLUTION FUNCTIONS (T075) ──

-- Function: Approve Sale
CREATE OR REPLACE FUNCTION public.approve_sale(p_approval_id UUID, p_admin_phone TEXT) 
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth', 'storage', 'vault'
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

    -- 5. Actualizar lot_records a escritura_firmada
    INSERT INTO public.lot_records (
        lot_id, 
        cliente_nombre, 
        cliente_run, 
        valor,
        etapa_proceso,
        updated_at
    )
    VALUES (
        v_request.lot_id,
        COALESCE(v_payload->>'cliente_nombre', ''),
        COALESCE(v_payload->>'cliente_run', ''),
        COALESCE((v_payload->>'valor_final')::numeric, v_lot.precio),
        'escritura_firmada',
        now()
    )
    ON CONFLICT (lot_id) DO UPDATE SET
        cliente_nombre = COALESCE(EXCLUDED.cliente_nombre, lot_records.cliente_nombre),
        cliente_run = COALESCE(EXCLUDED.cliente_run, lot_records.cliente_run),
        valor = COALESCE(EXCLUDED.valor, lot_records.valor),
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

-- Function: Reject Sale
CREATE OR REPLACE FUNCTION public.reject_sale(p_approval_id UUID, p_admin_phone TEXT DEFAULT NULL::TEXT) 
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth', 'storage', 'vault'
AS $$
DECLARE
    v_request record;
    v_lot record;
BEGIN
    -- 1. Leer y bloquear la solicitud
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

    -- 2. Marcar la solicitud como rechazada
    UPDATE public.approval_requests
    SET status = 'rejected',
        admin_phone = p_admin_phone,
        resolved_at = now()
    WHERE id = p_approval_id;

    -- 3. No mutar el estado del lote en el rechazo (ya que sigue siendo disponible/reservado/el estado que el flujo determine, la aprobación es el único portal a Vendido).
    -- Eliminada la mutación ciega de estado a previous_lot_state.

    -- 4. Insertar en logs de auditoría de forma atómica (T075)
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
        'sale.rejected',
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

-- Grant permissions
GRANT ALL ON FUNCTION public.approve_sale(UUID, TEXT) TO postgres, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.reject_sale(UUID, TEXT) TO postgres, anon, authenticated, service_role;
