-- SDD 017 (T001, US2 FR-003): política de revisión jurídica por
-- organización. 'every_sale' (default) exige aprobar la revisión jurídica de
-- cada caso; 'exceptions_only' deja correr la cascada sin ese acto humano
-- salvo que algo la detenga (ver escritura_cascade_runs). El cambio lo hace
-- un admin vía Server Action (patrón casa, apps/web/settings/actions.ts) que
-- audita el valor anterior->nuevo en audit_logs; esta columna es la única
-- fuente de verdad que lee la cascada al correr (research D4).

ALTER TABLE public.organizations
  ADD COLUMN escritura_review_policy TEXT NOT NULL DEFAULT 'every_sale',
  ADD CONSTRAINT organizations_escritura_review_policy_check
    CHECK (escritura_review_policy = ANY (ARRAY['every_sale'::text, 'exceptions_only'::text]));

COMMENT ON COLUMN public.organizations.escritura_review_policy IS
  'SDD 017: every_sale (default) exige revision juridica humana por caso; exceptions_only deja correr la cascada de aprobacion sin ese acto salvo que haya una excepcion real.';
