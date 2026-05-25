-- Ensure project deletion can cascade through lots without being blocked by
-- approval/document records that still reference those lots.

ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_lot_id_fkey;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_lot_id_fkey
  FOREIGN KEY (lot_id)
  REFERENCES public.lots(id)
  ON DELETE CASCADE;

ALTER TABLE public.generated_documents
  DROP CONSTRAINT IF EXISTS generated_documents_lot_id_fkey;

ALTER TABLE public.generated_documents
  ADD CONSTRAINT generated_documents_lot_id_fkey
  FOREIGN KEY (lot_id)
  REFERENCES public.lots(id)
  ON DELETE CASCADE;
