-- Migration: 20260806000000_sdd019_fix_outbox_and_vendible_rpc.sql
-- SDD 019: Fix outbox PL/pgSQL variable bug, vendor/admin identity derivation, project vendible readiness, atomic request RPCs, and epoching.

-- 1. Add epoch and approved matrix metadata columns to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS preparation_epoch integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS approved_preparation_epoch integer,
  ADD COLUMN IF NOT EXISTS approved_matrix_id uuid REFERENCES public.escritura_matrices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_matrix_version integer,
  ADD COLUMN IF NOT EXISTS approved_matrix_snapshot_hash text;

-- Register operation types for idempotency
INSERT INTO public.idempotency_operation_types (operation_type, contract_version, enabled)
VALUES 
  ('sale.request', 'sdd019-foundation-v1', true),
  ('reservation.request', 'sdd019-foundation-v1', true)
ON CONFLICT (operation_type) DO NOTHING;


-- 2. Function: can_activate_project_sales(p_project_id)
CREATE OR REPLACE FUNCTION public.can_activate_project_sales(p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.projects;
  v_matrix_approved boolean;
  v_blocking_vars_count integer;
  v_unverified_lots_count integer;
  v_required_docs_count integer;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Must have an approved project-level matrix (escritura_case_id IS NULL)
  SELECT EXISTS (
    SELECT 1 FROM public.escritura_matrices
    WHERE project_id = p_project_id
      AND escritura_case_id IS NULL
      AND status = 'approved'
  ) INTO v_matrix_approved;

  IF NOT v_matrix_approved THEN
    RETURN false;
  END IF;

  -- 2. Must have active legal documents with completed extraction (text_extracted / variables_proposed)
  SELECT count(*) INTO v_required_docs_count
  FROM public.legal_documents
  WHERE project_id = p_project_id
    AND document_type IN ('dominio_vigente', 'certificado_roles_sii', 'plano_oficial')
    AND extraction_status IN ('text_extracted', 'variables_proposed');

  IF v_required_docs_count = 0 THEN
    RETURN false;
  END IF;

  -- 3. Must have 0 blocking variables in missing or conflict state for the project (using variable_resolutions)
  SELECT count(*) INTO v_blocking_vars_count
  FROM public.variable_resolutions
  WHERE project_id = p_project_id
    AND escritura_case_id IS NULL
    AND state IN ('missing', 'conflict')
    AND variable_key NOT LIKE 'comprador.%'
    AND variable_key NOT LIKE 'transaccion.%';

  IF v_blocking_vars_count > 0 THEN
    RETURN false;
  END IF;

  -- 4. All commercializable lots must have verified_status = 'verified', area_official_m2, perimeter_official_m, and boundaries_official
  SELECT count(*) INTO v_unverified_lots_count
  FROM public.lots
  WHERE project_id = p_project_id
    AND estado::text <> 'deshabilitado'
    AND (
      verified_status IS NULL
      OR verified_status NOT LIKE 'verified%'
      OR boundaries_official IS NULL
      OR area_official_m2 IS NULL
      OR area_official_m2 <= 0
      OR perimeter_official_m IS NULL
      OR perimeter_official_m <= 0
    );

  IF v_unverified_lots_count > 0 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 3. Function: activate_project_sales(p_project_id)
CREATE OR REPLACE FUNCTION public.activate_project_sales(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_can_activate boolean;
  v_matrix_row public.escritura_matrices;
  v_snapshot_hash text;
  v_current_epoch integer;
BEGIN
  -- Permission check: caller must be org admin or service role
  IF auth.role() <> 'service_role' AND NOT public.is_org_admin((SELECT organization_id FROM public.projects WHERE id = p_project_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado.');
  END IF;

  v_can_activate := public.can_activate_project_sales(p_project_id);
  IF NOT v_can_activate THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El proyecto no cumple las condiciones para habilitar ventas (matriz aprobada, variables resueltas, documentos con extracción completada y lotes verificados requeridos).'
    );
  END IF;

  SELECT * INTO v_matrix_row
  FROM public.escritura_matrices
  WHERE project_id = p_project_id
    AND escritura_case_id IS NULL
    AND status = 'approved'
  ORDER BY approved_at DESC NULLS LAST, version DESC
  LIMIT 1;

  IF v_matrix_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró matriz de proyecto aprobada.');
  END IF;

  SELECT coalesce(preparation_epoch, 1) INTO v_current_epoch
  FROM public.projects
  WHERE id = p_project_id;

  v_snapshot_hash := encode(
    extensions.digest(
      concat_ws('|', v_matrix_row.id::text, v_matrix_row.version::text, v_current_epoch::text),
      'sha256'
    ),
    'hex'
  );

  UPDATE public.projects
  SET estado = 'operational',
      approved_preparation_epoch = v_current_epoch,
      approved_matrix_id = v_matrix_row.id,
      approved_matrix_version = v_matrix_row.version,
      approved_matrix_snapshot_hash = v_snapshot_hash,
      updated_at = now()
  WHERE id = p_project_id;

  RETURN jsonb_build_object(
    'success', true,
    'project_id', p_project_id,
    'estado', 'operational',
    'approved_preparation_epoch', v_current_epoch,
    'approved_matrix_id', v_matrix_row.id
  );
END;
$$;

-- 4. Function: is_project_vendible(p_project_id)
-- Camino corto SDD019: si la org activa `escritura_relaxed_readiness`, basta
-- una matriz de proyecto aprobada vigente para vender; sin el flag se exige
-- el pipeline estricto (operational + epoch + matriz ligada).
CREATE OR REPLACE FUNCTION public.is_project_vendible(p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.projects;
  v_current_approved_matrix_id uuid;
  v_relaxed boolean;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL THEN
    RETURN false;
  END IF;

  -- Camino corto SDD019: si la organización activa `escritura_relaxed_readiness`,
  -- basta una matriz de proyecto aprobada vigente para vender (la cascada de
  -- escritura ya relaja los gates heredados en la generación). Sin el flag,
  -- se exige el pipeline estricto: proyecto operational + epoch y matriz ligada.
  SELECT escritura_relaxed_readiness INTO v_relaxed
  FROM public.organizations WHERE id = v_project.organization_id;
  IF v_relaxed THEN
    SELECT id INTO v_current_approved_matrix_id
    FROM public.escritura_matrices
    WHERE project_id = p_project_id
      AND escritura_case_id IS NULL
      AND status = 'approved'
    ORDER BY approved_at DESC NULLS LAST, version DESC
    LIMIT 1;
    RETURN v_current_approved_matrix_id IS NOT NULL;
  END IF;

  IF v_project.estado <> 'operational' THEN
    RETURN false;
  END IF;

  -- Verify preparation epoch matches
  IF v_project.preparation_epoch IS NULL
     OR v_project.approved_preparation_epoch IS NULL
     OR v_project.preparation_epoch <> v_project.approved_preparation_epoch THEN
    RETURN false;
  END IF;

  -- Verify active approved matrix matches approved_matrix_id
  SELECT id INTO v_current_approved_matrix_id
  FROM public.escritura_matrices
  WHERE project_id = p_project_id
    AND escritura_case_id IS NULL
    AND status = 'approved'
  ORDER BY approved_at DESC NULLS LAST, version DESC
  LIMIT 1;

  IF v_current_approved_matrix_id IS NULL OR v_current_approved_matrix_id <> v_project.approved_matrix_id THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 5. Function: is_lot_operable(p_lot_id, p_vendor_id, p_operation_type)
CREATE OR REPLACE FUNCTION public.is_lot_operable(
  p_lot_id uuid,
  p_vendor_id uuid DEFAULT NULL,
  p_operation_type text DEFAULT 'sale'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lot public.lots;
  v_pending_request boolean;
BEGIN
  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id;
  IF v_lot.id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if project is vendible
  IF NOT public.is_project_vendible(v_lot.project_id) THEN
    RETURN false;
  END IF;

  -- Check lot state
  IF p_operation_type = 'sale' AND v_lot.estado::text NOT IN ('disponible', 'reservado') THEN
    RETURN false;
  END IF;
  IF p_operation_type = 'reservation' AND v_lot.estado::text <> 'disponible' THEN
    RETURN false;
  END IF;

  -- If reserved, check that the vendor matches the reservation holder (if provided)
  IF v_lot.estado::text = 'reservado' AND p_vendor_id IS NOT NULL AND v_lot.vendedor_id IS NOT NULL THEN
    IF v_lot.vendedor_id <> p_vendor_id AND NOT public.is_org_admin((SELECT organization_id FROM public.projects WHERE id = v_lot.project_id)) THEN
      RETURN false;
    END IF;
  END IF;

  -- Check no pending request exists
  SELECT EXISTS (
    SELECT 1 FROM public.approval_requests
    WHERE lot_id = p_lot_id AND status = 'pending'
  ) INTO v_pending_request;

  IF v_pending_request THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 6. Epoch Invalidation Triggers
CREATE OR REPLACE FUNCTION public.trg_increment_project_epoch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  IF v_project_id IS NOT NULL THEN
    UPDATE public.projects
    SET preparation_epoch = preparation_epoch + 1,
        updated_at = now()
    WHERE id = v_project_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers for matrix updates and deletes
DROP TRIGGER IF EXISTS trg_matrix_epoch_inc_upd ON public.escritura_matrices;
CREATE TRIGGER trg_matrix_epoch_inc_upd
  AFTER INSERT OR UPDATE OF status, clause_order, clause_overrides
  ON public.escritura_matrices
  FOR EACH ROW
  WHEN (NEW.escritura_case_id IS NULL)
  EXECUTE FUNCTION public.trg_increment_project_epoch();

DROP TRIGGER IF EXISTS trg_matrix_epoch_inc_del ON public.escritura_matrices;
CREATE TRIGGER trg_matrix_epoch_inc_del
  AFTER DELETE
  ON public.escritura_matrices
  FOR EACH ROW
  WHEN (OLD.escritura_case_id IS NULL)
  EXECUTE FUNCTION public.trg_increment_project_epoch();

-- Trigger on lot boundary changes
DROP TRIGGER IF EXISTS trg_lot_boundary_epoch_inc ON public.lots;
CREATE TRIGGER trg_lot_boundary_epoch_inc
  AFTER UPDATE OF boundaries_official, area_official_m2, perimeter_official_m
  ON public.lots
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_increment_project_epoch();

-- Trigger on legal document changes (only completed extractions or file modifications, excluding transient processing)
CREATE OR REPLACE FUNCTION public.trg_doc_epoch_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (TG_OP = 'DELETE') OR
     (TG_OP = 'UPDATE' AND OLD.extraction_status <> NEW.extraction_status AND NEW.extraction_status IN ('text_extracted', 'variables_proposed', 'needs_review')) THEN
    UPDATE public.projects
    SET preparation_epoch = preparation_epoch + 1,
        updated_at = now()
    WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doc_epoch_inc ON public.legal_documents;
CREATE TRIGGER trg_doc_epoch_inc
  AFTER INSERT OR UPDATE OR DELETE
  ON public.legal_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_doc_epoch_check();

-- Trigger on geometry imports (KML/KMZ)
DROP TRIGGER IF EXISTS trg_geometry_epoch_inc ON public.geometry_imports;
CREATE TRIGGER trg_geometry_epoch_inc
  AFTER INSERT OR UPDATE OR DELETE
  ON public.geometry_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_increment_project_epoch();

-- 7. Atomic RPC: create_sale_request_db
CREATE OR REPLACE FUNCTION public.create_sale_request_db(
  p_lot_id uuid,
  p_organization_id uuid,
  p_vendor_id uuid,
  p_vendor_name text,
  p_vendor_phone text,
  p_vendor_platform text,
  p_payload jsonb,
  p_sale_mode text DEFAULT 'direct',
  p_previous_lot_state text DEFAULT 'disponible',
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lot public.lots;
  v_vendor public.vendors;
  v_project public.projects;
  v_request_hash text;
  v_operation_id uuid;
  v_existing_op public.idempotency_operations;
  v_approval_id uuid;
  v_effective_idempotency_key text;
BEGIN
  -- 1. Compute request hash
  v_request_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
  v_effective_idempotency_key := coalesce(p_idempotency_key, concat('sale_req_', p_lot_id::text, '_', left(v_request_hash, 12)));

  -- 2. Lock Lot
  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id FOR UPDATE;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'LOT_NOT_FOUND';
  END IF;

  -- 3. Verify Project Tenant & Vendibility
  SELECT * INTO v_project FROM public.projects WHERE id = v_lot.project_id AND organization_id = p_organization_id;
  IF v_project.id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'TENANT_MISMATCH';
  END IF;

  IF NOT public.is_project_vendible(v_project.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El proyecto no cumple las condiciones de habilitación (matriz aprobada, variables y deslindes verificados).');
  END IF;

  -- 4. Verify Vendor Link & Active Status
  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_organization_id AND active FOR SHARE;
  IF v_vendor.id IS NULL OR v_vendor.user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'VENDOR_USER_LINK_REQUIRED';
  END IF;

  -- 5. Check Idempotency Key & Hash Mismatch
  SELECT * INTO v_existing_op FROM public.idempotency_operations
  WHERE idempotency_key = v_effective_idempotency_key AND organization_id = p_organization_id;
  IF v_existing_op.id IS NOT NULL THEN
    IF v_existing_op.request_hash IS DISTINCT FROM v_request_hash THEN
      RETURN jsonb_build_object('success', false, 'error', 'Idempotency key reusada con payload distinto.', 'code', 409);
    END IF;
    IF v_existing_op.resource_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'approval_id', v_existing_op.resource_id, 'replayed', true);
    END IF;
  END IF;

  -- 6. Check Lot Operable / State
  IF v_lot.estado::text NOT IN ('disponible', 'reservado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'El lote no está disponible ni reservado.');
  END IF;

  -- 7. Insert Idempotency Operation
  v_operation_id := gen_random_uuid();
  INSERT INTO public.idempotency_operations (
    id, organization_id, principal_type, principal_subject, operation_type,
    resource_scope, idempotency_key, request_hash, status, source_kind
  ) VALUES (
    v_operation_id, p_organization_id, 'user', p_vendor_id::text, 'sale.request',
    concat('approval_request:', p_lot_id::text), v_effective_idempotency_key,
    v_request_hash, 'processing', 'web'
  );

  -- 8. Insert Approval Request
  v_approval_id := gen_random_uuid();
  INSERT INTO public.approval_requests (
    id, lot_id, organization_id, vendor_id, vendor_name, vendor_phone, vendor_platform,
    payload, status, request_type, sale_mode, previous_lot_state, operation_id, request_hash, idempotency_key
  ) VALUES (
    v_approval_id, p_lot_id, p_organization_id, p_vendor_id, p_vendor_name, p_vendor_phone, p_vendor_platform,
    p_payload, 'pending', 'sale', p_sale_mode, v_lot.estado::text, v_operation_id, v_request_hash, v_effective_idempotency_key
  );

  -- Update Idempotency Op
  UPDATE public.idempotency_operations
  SET resource_type = 'approval_requests', resource_id = v_approval_id
  WHERE id = v_operation_id;

  RETURN jsonb_build_object('success', true, 'approval_id', v_approval_id);
END;
$$;

-- 8. Atomic RPC: create_reservation_request_db
CREATE OR REPLACE FUNCTION public.create_reservation_request_db(
  p_lot_id uuid,
  p_organization_id uuid,
  p_vendor_id uuid,
  p_vendor_name text,
  p_vendor_phone text,
  p_vendor_platform text,
  p_payload jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lot public.lots;
  v_vendor public.vendors;
  v_project public.projects;
  v_request_hash text;
  v_operation_id uuid;
  v_existing_op public.idempotency_operations;
  v_approval_id uuid;
  v_effective_idempotency_key text;
BEGIN
  v_request_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
  v_effective_idempotency_key := coalesce(p_idempotency_key, concat('res_req_', p_lot_id::text, '_', left(v_request_hash, 12)));

  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id FOR UPDATE;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'LOT_NOT_FOUND';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = v_lot.project_id AND organization_id = p_organization_id;
  IF v_project.id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'TENANT_MISMATCH';
  END IF;

  IF NOT public.is_project_vendible(v_project.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El proyecto no cumple las condiciones de habilitación para ventas.');
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id AND organization_id = p_organization_id AND active FOR SHARE;
  IF v_vendor.id IS NULL OR v_vendor.user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'VENDOR_USER_LINK_REQUIRED';
  END IF;

  IF v_lot.estado::text <> 'disponible' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El lote no está disponible para reserva.');
  END IF;

  SELECT * INTO v_existing_op FROM public.idempotency_operations
  WHERE idempotency_key = v_effective_idempotency_key AND organization_id = p_organization_id;
  IF v_existing_op.id IS NOT NULL THEN
    IF v_existing_op.request_hash IS DISTINCT FROM v_request_hash THEN
      RETURN jsonb_build_object('success', false, 'error', 'Idempotency key reusada con payload distinto.', 'code', 409);
    END IF;
    IF v_existing_op.resource_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'approval_id', v_existing_op.resource_id, 'replayed', true);
    END IF;
  END IF;

  v_operation_id := gen_random_uuid();
  INSERT INTO public.idempotency_operations (
    id, organization_id, principal_type, principal_subject, operation_type,
    resource_scope, idempotency_key, request_hash, status, source_kind
  ) VALUES (
    v_operation_id, p_organization_id, 'user', p_vendor_id::text, 'reservation.request',
    concat('approval_request:', p_lot_id::text), v_effective_idempotency_key,
    v_request_hash, 'processing', 'web'
  );

  v_approval_id := gen_random_uuid();
  INSERT INTO public.approval_requests (
    id, lot_id, organization_id, vendor_id, vendor_name, vendor_phone, vendor_platform,
    payload, status, request_type, sale_mode, previous_lot_state, operation_id, request_hash, idempotency_key
  ) VALUES (
    v_approval_id, p_lot_id, p_organization_id, p_vendor_id, p_vendor_name, p_vendor_phone, p_vendor_platform,
    p_payload, 'pending', 'reservation', null, 'disponible', v_operation_id, v_request_hash, v_effective_idempotency_key
  );

  UPDATE public.idempotency_operations
  SET resource_type = 'approval_requests', resource_id = v_approval_id
  WHERE id = v_operation_id;

  RETURN jsonb_build_object('success', true, 'approval_id', v_approval_id);
END;
$$;

-- 9. Atomic approve_sale Function Fix
DROP FUNCTION IF EXISTS public.approve_sale(uuid, text);
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

  -- Idempotent replay check
  IF request_row.status = 'approved' THEN
    SELECT id INTO v_outbox_id FROM public.workflow_outbox
    WHERE aggregate_id = request_row.id
      AND event_fingerprint = encode(
        extensions.digest(
          concat_ws(
            '|', 'outbox-v1', 'sale_approved', request_row.organization_id::text,
            request_row.id::text, request_row.approved_transition_version::text
          ),
          'sha256'
        ),
        'hex'
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
  v_caller_admin_id := coalesce(p_admin_user_id, auth.uid());
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

  v_event_fingerprint := encode(
    extensions.digest(
      concat_ws(
        '|', 'outbox-v1', 'sale_approved', request_row.organization_id::text,
        request_row.id::text, v_transition_version::text
      ),
      'sha256'
    ),
    'hex'
  );
  v_audit_event_key := encode(
    extensions.digest(
      concat_ws(
        '|', 'audit-v1', request_row.organization_id::text,
        'approval_requests', request_row.id::text, 'sale.approved', v_transition_version::text
      ),
      'sha256'
    ),
    'hex'
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

-- 10. Grants for RPC execution
GRANT EXECUTE ON FUNCTION public.can_activate_project_sales(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.activate_project_sales(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.is_project_vendible(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.is_lot_operable(uuid, uuid, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.create_sale_request_db(uuid, uuid, uuid, text, text, text, jsonb, text, text, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.create_reservation_request_db(uuid, uuid, uuid, text, text, text, jsonb, text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.approve_sale(uuid, uuid, text) TO authenticated, service_role, anon;

