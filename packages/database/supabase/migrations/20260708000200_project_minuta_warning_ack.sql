-- SDD 017 (T002, US4 FR-009): el aviso legal de borrador se confirma UNA vez
-- por proyecto, no en cada generación de minuta. `escritura_minuta_
-- generations.warning_acknowledged_by/_at` (SDD 008) se conservan intactas y
-- pasan a copiar el amparo vigente del proyecto al generar (registro
-- auto-contenido, FR-010) en vez de exigir una confirmación nueva por click.

ALTER TABLE public.projects
  ADD COLUMN minuta_warning_acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN minuta_warning_acknowledged_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.projects.minuta_warning_acknowledged_by IS
  'SDD 017: quien confirmo el aviso legal de borrador para este proyecto (una vez, ampara todas las minutas del proyecto).';
COMMENT ON COLUMN public.projects.minuta_warning_acknowledged_at IS
  'SDD 017: cuando se confirmo el aviso legal de borrador para este proyecto.';
