-- SDD 019 (camino corto): flag por organización para relajar los gates de
-- readiness heredados del proyecto en la generación de escrituras.
--
-- Cuando `escritura_relaxed_readiness` está en true, la cascada automática
-- NO se detiene por los gates `title_verified`, `sii_verified` y
-- `sag_plano_verified` heredados del proyecto; los trata como advertencias
-- trazables en vez de bloqueantes. La seguridad estricta (extracción legal
-- completa, rol SII, plano SAG) se reintroduce luego sin borrar este flag.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS escritura_relaxed_readiness BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.escritura_relaxed_readiness IS
  'SDD 019 camino corto: true relaja los gates title_verified/sii_verified/sag_plano_verified heredados del proyecto para que la escritura se genere con los datos disponibles; false (default) conserva el gate de readiness estricto.';
