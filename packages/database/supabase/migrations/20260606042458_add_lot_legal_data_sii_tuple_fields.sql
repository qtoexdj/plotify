ALTER TABLE public.lot_legal_data
    ADD COLUMN IF NOT EXISTS sii_lot_number_normalized text,
    ADD COLUMN IF NOT EXISTS sii_comuna text,
    ADD COLUMN IF NOT EXISTS sii_role_record jsonb;

COMMENT ON COLUMN public.lot_legal_data.sii_lot_number_normalized IS
    'Normalized lot number extracted from the same SII role certificate row/block as the lot role.';

COMMENT ON COLUMN public.lot_legal_data.sii_comuna IS
    'Comuna extracted from the same SII role certificate row/block as the lot role.';

COMMENT ON COLUMN public.lot_legal_data.sii_role_record IS
    'Normalized SII role tuple metadata, including lot number, role/pre-role, comuna, row/block index and parser.';
