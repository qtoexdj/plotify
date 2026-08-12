-- SDD 019 (camino corto, hardening de producción): las funciones del
-- workflow_outbox no deben esperar indefinidamente locks de fila retenidos
-- por transacciones huérfanas.
--
-- Diagnóstico: una transacción huérfana (cliente httpx abandonado por
-- timeout) retenía locks sobre workflow_outbox; la siguiente llamada a
-- heartbeat/begin/finish/release esperaba ese lock hasta el
-- statement_timeout (2min) y su cliente también abandonaba la petición,
-- generando OTRA transacción huérfana (loop hasta agotar el pool, PGRST003).
--
-- Fix: lock_timeout local de 5s. La función falla rápido (el worker clasifica
-- el error y reintenta con backoff) en vez de quedarse 120s colgada.

create or replace function public.heartbeat_workflow_outbox(
  p_item_id uuid,
  p_worker_id text
)
returns public.workflow_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare result public.workflow_outbox;
begin
  perform pg_catalog.set_config('lock_timeout', '5000', true);
  update public.workflow_outbox
  set heartbeat_at = now(), lease_expires_at = now() + interval '60 seconds', updated_at = now()
  where id = p_item_id and status = 'processing' and lease_owner = p_worker_id
    and lease_expires_at > now()
  returning * into result;
  if result.id is null then
    raise exception using errcode = '40001', message = 'WORKFLOW_LEASE_LOST';
  end if;
  return result;
end;
$$;

create or replace function public.release_workflow_outbox_for_feature_off(
  p_item_id uuid,
  p_worker_id text,
  p_reason text,
  p_control_fingerprint text
)
returns public.workflow_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare result public.workflow_outbox;
begin
  perform pg_catalog.set_config('lock_timeout', '5000', true);
  update public.workflow_outbox
  set status = 'deferred_feature_off',
      available_at = now() + interval '30 seconds',
      lease_owner = null, lease_expires_at = null, heartbeat_at = null,
      deferred_reason = left(coalesce(nullif(btrim(p_reason), ''), 'control_off'), 100),
      deferred_control_fingerprint = p_control_fingerprint,
      updated_at = now()
  where id = p_item_id and status = 'processing' and lease_owner = p_worker_id
  returning * into result;
  if result.id is null then
    raise exception using errcode = '40001', message = 'WORKFLOW_LEASE_LOST';
  end if;
  return result;
end;
$$;

create or replace function public.begin_workflow_outbox_attempt(
  p_item_id uuid,
  p_worker_id text
)
returns public.workflow_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare result public.workflow_outbox;
begin
  perform pg_catalog.set_config('lock_timeout', '5000', true);
  update public.workflow_outbox
  set attempt_count = attempt_count + 1, updated_at = now()
  where id = p_item_id and status = 'processing' and lease_owner = p_worker_id
    and lease_expires_at > now() and attempt_count < max_attempts
  returning * into result;
  if result.id is null then
    raise exception using errcode = '40001', message = 'WORKFLOW_ATTEMPT_NOT_ALLOWED';
  end if;
  return result;
end;
$$;

create or replace function public.finish_workflow_outbox(
  p_item_id uuid,
  p_worker_id text,
  p_status text,
  p_error_code text default null,
  p_error_class text default null,
  p_retry_after_seconds integer default null
)
returns public.workflow_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare result public.workflow_outbox;
begin
  if p_status not in ('completed', 'retry_scheduled', 'dead_letter') then
    raise exception using errcode = '22023', message = 'WORKFLOW_OUTCOME_INVALID';
  end if;
  perform pg_catalog.set_config('lock_timeout', '5000', true);
  update public.workflow_outbox
  set status = p_status,
      available_at = case
        when p_status = 'retry_scheduled'
          then now() + make_interval(secs => greatest(1, least(coalesce(p_retry_after_seconds, 5), 3600)))
        else available_at
      end,
      lease_owner = null, lease_expires_at = null, heartbeat_at = null,
      last_error_code = case when p_status = 'completed' then null else left(p_error_code, 100) end,
      last_error_class = case when p_status = 'completed' then null else p_error_class end,
      completed_at = case when p_status = 'completed' then now() else null end,
      updated_at = now()
  where id = p_item_id and status = 'processing' and lease_owner = p_worker_id
  returning * into result;
  if result.id is null then
    raise exception using errcode = '40001', message = 'WORKFLOW_LEASE_LOST';
  end if;
  return result;
end;
$$;
