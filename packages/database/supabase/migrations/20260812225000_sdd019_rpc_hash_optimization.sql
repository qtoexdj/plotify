-- Migration: 20260812225000_sdd019_rpc_hash_optimization.sql
-- SDD 019: Optimización de rendimiento — Usar md5() para fingerprints internos de dedup/auditoría en approve_sale.

CREATE OR REPLACE FUNCTION public.approve_sale(
  p_approval_id uuid,
  p_admin_user_id uuid DEFAULT NULL,
  p_admin_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_row public.approval_requests;
  lot_row public.lots;
  vendor_row public.vendors;
  project_row public.projects;
  v_payload jsonb;
  v_admin_user_ids uuid[];
  v_transition_version integer;
  v_event_fingerprint text;
  v_audit_event_key text;
  v_outbox_id uuid;
  v_caller_admin_id uuid;
BEGIN
  -- Lock and fetch request
  SELECT * INTO request_row
  FROM public.approval_requests
  WHERE id = p_approval_id AND request_type = 'sale'
  FOR UPDATE;

  IF request_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada.');
  END IF;

  -- Idempotent replay check (md5 fingerprint)
  IF request_row.status = 'approved' THEN
    SELECT id INTO v_outbox_id FROM public.workflow_outbox
    WHERE aggregate_id = request_row.id
      AND event_fingerprint = md5(
        concat_ws(
          '|', 'outbox-v1', 'sale_approved', request_row.organization_id::text,
          request_row.id::text, request_row.approved_transition_version::text
        )
      );
    RETURN jsonb_build_object(
      'success', true, 'lot_id', request_row.lot_id,
      'workflow_outbox_id', v_outbox_id, 'replayed', true
    );
  END IF;

  IF request_row.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud ya procesada.');
  END IF;

  -- Permission Check: Auth user or service role MUST be org admin
  v_caller_admin_id := coalesce(p_admin_user_id, (select auth.uid()));
  IF auth.role() <> 'service_role' AND NOT public.is_org_admin(request_row.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado.');
  END IF;

  -- Verify Vendor Link
  SELECT * INTO vendor_row
  FROM public.vendors
  WHERE id = request_row.vendor_id
    AND organization_id = request_row.organization_id
    AND active
  FOR SHARE;

  IF vendor_row.id IS NULL OR vendor_row.user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'VENDOR_USER_LINK_REQUIRED';
  END IF;

  -- Lock lot row
  SELECT * INTO lot_row
  FROM public.lots
  WHERE id = request_row.lot_id
    AND estado::text = coalesce(request_row.previous_lot_state, 'reservado')
  FOR UPDATE;

  IF lot_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El estado actual del lote no coincide.');
  END IF;

  -- Verify project is vendible
  SELECT * INTO project_row
  FROM public.projects
  WHERE id = lot_row.project_id AND organization_id = request_row.organization_id;

  IF project_row.id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'SALE_TENANT_MISMATCH';
  END IF;

  IF NOT public.is_project_vendible(project_row.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El proyecto no cumple las condiciones de habilitación para ventas.');
  END IF;

  IF request_row.operation_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'SALE_OPERATION_REQUIRED';
  END IF;

  -- Fetch Active Admins
  SELECT coalesce(array_agg(member.user_id ORDER BY member.user_id), '{}'::uuid[])
  INTO v_admin_user_ids
  FROM public.organization_members member
  WHERE member.organization_id = request_row.organization_id
    AND member.role = 'admin';

  IF array_length(v_admin_user_ids, 1) IS NULL OR array_length(v_admin_user_ids, 1) = 0 THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'RECIPIENT_IDENTITY_REQUIRED';
  END IF;

  v_payload := request_row.payload;
  v_transition_version := request_row.approved_transition_version + 1;

  -- md5 para fingerprints internos en vez de digest(..., 'sha256')
  v_event_fingerprint := md5(
    concat_ws(
      '|', 'outbox-v1', 'sale_approved', request_row.organization_id::text,
      request_row.id::text, v_transition_version::text
    )
  );
  v_audit_event_key := md5(
    concat_ws(
      '|', 'audit-v1', request_row.organization_id::text,
      'approval_requests', request_row.id::text, 'sale.approved', v_transition_version::text
    )
  );

  UPDATE public.approval_requests
  SET status = 'approved', admin_phone = p_admin_phone, resolved_at = now(),
      approved_transition_version = v_transition_version
  WHERE id = request_row.id;

  UPDATE public.lots
  SET estado = 'vendido', sold_at = now(), updated_at = now(),
      vendedor_id = CASE WHEN request_row.sale_mode = 'direct' THEN request_row.vendor_id ELSE vendedor_id END
  WHERE id = request_row.lot_id;

  INSERT INTO public.lot_records (
    lot_id, cliente_nombre, cliente_run, cliente_direccion,
    cliente_estado_civil, cliente_ocupacion, cliente_telefono, cliente_email,
    cliente_nacionalidad, cliente_region, cliente_comuna, valor,
    etapa_proceso, updated_at
  ) VALUES (
    request_row.lot_id, coalesce(v_payload->>'cliente_nombre', ''),
    coalesce(v_payload->>'cliente_run', ''), v_payload->>'cliente_direccion',
    v_payload->>'cliente_estado_civil', v_payload->>'cliente_ocupacion',
    v_payload->>'cliente_telefono', v_payload->>'cliente_email',
    v_payload->>'cliente_nacionalidad', v_payload->>'cliente_region',
    v_payload->>'cliente_comuna',
    coalesce((v_payload->>'valor_final')::numeric, lot_row.precio),
    'espera_firma_escritura', now()
  )
  ON CONFLICT (lot_id) DO UPDATE SET
    cliente_nombre = coalesce(excluded.cliente_nombre, public.lot_records.cliente_nombre),
    cliente_run = coalesce(excluded.cliente_run, public.lot_records.cliente_run),
    cliente_direccion = coalesce(excluded.cliente_direccion, public.lot_records.cliente_direccion),
    cliente_estado_civil = coalesce(excluded.cliente_estado_civil, public.lot_records.cliente_estado_civil),
    cliente_ocupacion = coalesce(excluded.cliente_ocupacion, public.lot_records.cliente_ocupacion),
    cliente_telefono = coalesce(excluded.cliente_telefono, public.lot_records.cliente_telefono),
    cliente_email = coalesce(excluded.cliente_email, public.lot_records.cliente_email),
    cliente_nacionalidad = coalesce(excluded.cliente_nacionalidad, public.lot_records.cliente_nacionalidad),
    cliente_region = coalesce(excluded.cliente_region, public.lot_records.cliente_region),
    cliente_comuna = coalesce(excluded.cliente_comuna, public.lot_records.cliente_comuna),
    valor = coalesce(excluded.valor, public.lot_records.valor),
    firma_fecha = null,
    etapa_proceso = 'espera_firma_escritura',
    updated_at = now();

  INSERT INTO public.audit_logs (
    organization_id, actor, action, entity, entity_id, payload,
    operation_id, event_key, result
  ) VALUES (
    request_row.organization_id, coalesce(p_admin_phone, v_caller_admin_id::text, 'admin'),
    'sale.approved', 'approval_requests', request_row.id::text,
    jsonb_build_object(
      'lot_id', request_row.lot_id, 'approval_id', request_row.id,
      'vendor_id', request_row.vendor_id,
      'approved_transition_version', v_transition_version
    ),
    request_row.operation_id, v_audit_event_key, 'succeeded'
  );

  INSERT INTO public.workflow_outbox (
    organization_id, aggregate_type, aggregate_id, event_type,
    event_fingerprint, operation_id, payload
  ) VALUES (
    request_row.organization_id, 'sale_approval', request_row.id, 'sale_approved',
    v_event_fingerprint, request_row.operation_id,
    jsonb_build_object(
      'schema_version', 'outbox-v1',
      'approval_request_id', request_row.id,
      'approved_transition_version', v_transition_version,
      'project_id', project_row.id,
      'lot_id', request_row.lot_id,
      'sale_vendor_user_id', vendor_row.user_id,
      'admin_user_ids', to_jsonb(v_admin_user_ids),
      'channels', jsonb_build_object(
        'vendor_web_required', true,
        'vendor_telegram_configured', request_row.vendor_platform = 'telegram',
        'admin_telegram_user_ids', to_jsonb(v_admin_user_ids)
      )
    )
  )
  ON CONFLICT (event_fingerprint) DO UPDATE
    SET event_fingerprint = excluded.event_fingerprint
  RETURNING id INTO v_outbox_id;

  UPDATE public.idempotency_operations
  SET status = 'succeeded', resource_type = 'approval_requests',
      resource_id = request_row.id,
      response_summary = jsonb_build_object(
        'approval_id', request_row.id, 'workflow_outbox_id', v_outbox_id
      ),
      completed_at = now(), updated_at = now()
  WHERE id = request_row.operation_id;

  RETURN jsonb_build_object(
    'success', true, 'lot_id', request_row.lot_id,
    'vendor_phone', request_row.vendor_phone,
    'vendor_platform', request_row.vendor_platform,
    'vendor_name', request_row.vendor_name,
    'workflow_outbox_id', v_outbox_id
  );
END;
$$;
