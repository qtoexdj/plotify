-- Migration: SDD 009 phase 5 - title review decisions
-- Date: 2026-06-10
-- Extends legal_review_decisions for title narrative edits, approvals and
-- alert resolutions (decision types title_block_edited, title_case_approved,
-- title_alert_resolved) with the analysis reference and the
-- generated-vs-edited payload required by the audit contract.

ALTER TABLE public.legal_review_decisions
    ADD COLUMN IF NOT EXISTS title_analysis_id UUID REFERENCES public.title_analyses(id) ON DELETE CASCADE;

ALTER TABLE public.legal_review_decisions
    ADD COLUMN IF NOT EXISTS decision_payload JSONB;

ALTER TABLE public.legal_review_decisions
    DROP CONSTRAINT IF EXISTS legal_review_decisions_decision_type_check;

ALTER TABLE public.legal_review_decisions
    ADD CONSTRAINT legal_review_decisions_decision_type_check CHECK (decision_type = ANY (ARRAY[
        'approve_variable'::text,
        'reject_variable'::text,
        'manual_override'::text,
        'approve_case'::text,
        'reject_case'::text,
        'assign_lawyer'::text,
        'mark_not_applicable'::text,
        'title_block_edited'::text,
        'title_case_approved'::text,
        'title_alert_resolved'::text
    ]));

CREATE INDEX IF NOT EXISTS legal_review_decisions_title_analysis_idx
    ON public.legal_review_decisions (title_analysis_id);
