-- Durable idempotency for Mini App reservation submissions.
-- NULL preserves compatibility for legacy and non-Mini-App reservation rows.
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_org_vendor_idempotency_key_key;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_org_vendor_idempotency_key_key
  UNIQUE (organization_id, vendor_id, idempotency_key);
