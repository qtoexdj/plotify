-- Migration: permitir converter='vision' en document_ingestion_jobs
-- Date: 2026-06-18
-- Path: packages/database/supabase/migrations/20260618000100_ingestion_converter_vision.sql
--
-- SDD 009: la transcripción por VISIÓN (gpt-5.5 lee el PDF escaneado directo,
-- ver services/legal_text_vision.py) es un converter distinto del OCR clásico
-- (tesseract). Para registrar honestamente qué corrió, agregamos 'vision' al
-- set permitido del CHECK. Cambio aditivo y reversible.
ALTER TABLE public.document_ingestion_jobs
    DROP CONSTRAINT IF EXISTS document_ingestion_jobs_converter_check;

ALTER TABLE public.document_ingestion_jobs
    ADD CONSTRAINT document_ingestion_jobs_converter_check
    CHECK (
        converter IS NULL
        OR converter = ANY (
            ARRAY[
                'pdf_text'::text,
                'ocr'::text,
                'vision'::text,
                'docx'::text,
                'textutil_doc'::text,
                'manual'::text
            ]
        )
    );
