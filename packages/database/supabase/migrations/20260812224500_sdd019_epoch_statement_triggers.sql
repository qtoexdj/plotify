-- Migration: 20260812224500_sdd019_epoch_statement_triggers.sql
-- SDD 019: Optimización de rendimiento — Convertir triggers de epoch de FOR EACH ROW a FOR EACH STATEMENT.
--
-- Problema: Los triggers FOR EACH ROW ejecutaban `UPDATE public.projects SET preparation_epoch = preparation_epoch + 1`
-- N veces en operaciones batch (ej. bulk_verify_lots, ingesta masiva KML/KMZ), causando N UPDATEs redundantes
-- y alta contención de locks en la tabla `projects`.
--
-- Solución: Usar triggers FOR EACH STATEMENT con transition tables (REFERENCING NEW TABLE / OLD TABLE)
-- para ejecutar UN SOLO UPDATE a `projects` por sentencia SQL.
--
-- Restricción PG17: las transition tables NO son compatibles con listas de columnas
-- (`UPDATE OF col1, col2`). Error: `transition tables cannot be specified for triggers with column lists`.
-- Por eso el filtrado por columnas se hace DENTRO de la función, vía JOIN new_table↔old_table sobre la PK.
-- Esta JOIN compara valores old vs new para detectar cambios en las columnas relevantes, preservando la
-- semántica exacta del trigger original con column list.
--
-- Requisito adicional: cada evento (INSERT/UPDATE/DELETE) requiere su propio trigger con la tabla
-- referenciada apropiada (NEW TABLE para INSERT/UPDATE, OLD TABLE para DELETE), porque un mismo trigger
-- no puede referenciar ambas tablas a la vez si no están disponibles en todos los eventos.

-- ============================================================================
-- 1. escritura_matrices
-- ============================================================================
-- Original:
--   trg_matrix_epoch_inc_upd AFTER INSERT OR UPDATE OF status, clause_order, clause_overrides FOR EACH ROW WHEN (NEW.escritura_case_id IS NULL)
--   trg_matrix_epoch_inc_del AFTER DELETE FOR EACH ROW WHEN (OLD.escritura_case_id IS NULL)

CREATE OR REPLACE FUNCTION public.trg_matrix_epoch_inc_ins_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT n.project_id
    FROM new_table n
    WHERE n.project_id IS NOT NULL AND n.escritura_case_id IS NULL
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_matrix_epoch_inc_upd_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT n.project_id
    FROM new_table n
    JOIN old_table o ON o.id = n.id
    WHERE n.project_id IS NOT NULL
      AND n.escritura_case_id IS NULL
      AND (o.status IS DISTINCT FROM n.status
           OR o.clause_order IS DISTINCT FROM n.clause_order
           OR o.clause_overrides IS DISTINCT FROM n.clause_overrides)
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_matrix_epoch_inc_del_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT o.project_id
    FROM old_table o
    WHERE o.project_id IS NOT NULL AND o.escritura_case_id IS NULL
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_matrix_epoch_inc_upd ON public.escritura_matrices;
DROP TRIGGER IF EXISTS trg_matrix_epoch_inc_ins ON public.escritura_matrices;
DROP TRIGGER IF EXISTS trg_matrix_epoch_inc_del ON public.escritura_matrices;
CREATE TRIGGER trg_matrix_epoch_inc_ins
  AFTER INSERT ON public.escritura_matrices
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_matrix_epoch_inc_ins_stmt();
CREATE TRIGGER trg_matrix_epoch_inc_upd
  AFTER UPDATE ON public.escritura_matrices
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_matrix_epoch_inc_upd_stmt();
CREATE TRIGGER trg_matrix_epoch_inc_del
  AFTER DELETE ON public.escritura_matrices
  REFERENCING OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_matrix_epoch_inc_del_stmt();

-- ============================================================================
-- 2. lots (boundaries, area, perimeter)
-- ============================================================================
-- Original: trg_lot_boundary_epoch_inc AFTER UPDATE OF boundaries_official, area_official_m2, perimeter_official_m FOR EACH ROW

CREATE OR REPLACE FUNCTION public.trg_lot_epoch_inc_upd_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT n.project_id
    FROM new_table n
    JOIN old_table o ON o.id = n.id
    WHERE n.project_id IS NOT NULL
      AND (o.boundaries_official IS DISTINCT FROM n.boundaries_official
           OR o.area_official_m2 IS DISTINCT FROM n.area_official_m2
           OR o.perimeter_official_m IS DISTINCT FROM n.perimeter_official_m)
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lot_boundary_epoch_inc ON public.lots;
CREATE TRIGGER trg_lot_boundary_epoch_inc
  AFTER UPDATE ON public.lots
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_lot_epoch_inc_upd_stmt();

-- ============================================================================
-- 3. legal_documents
-- ============================================================================
-- Original: trg_doc_epoch_inc AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW, function:
--   IF (TG_OP = 'INSERT') OR (TG_OP = 'DELETE') OR
--      (TG_OP = 'UPDATE' AND OLD.extraction_status <> NEW.extraction_status AND NEW.extraction_status IN ('text_extracted','variables_proposed','needs_review'))

CREATE OR REPLACE FUNCTION public.trg_doc_epoch_inc_ins_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT n.project_id
    FROM new_table n
    WHERE n.project_id IS NOT NULL
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_doc_epoch_inc_upd_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT n.project_id
    FROM new_table n
    JOIN old_table o ON o.id = n.id
    WHERE n.project_id IS NOT NULL
      AND o.extraction_status IS DISTINCT FROM n.extraction_status
      AND n.extraction_status IN ('text_extracted', 'variables_proposed', 'needs_review')
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_doc_epoch_inc_del_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT o.project_id
    FROM old_table o
    WHERE o.project_id IS NOT NULL
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_doc_epoch_inc ON public.legal_documents;
DROP TRIGGER IF EXISTS trg_doc_epoch_inc_ins ON public.legal_documents;
DROP TRIGGER IF EXISTS trg_doc_epoch_inc_upd ON public.legal_documents;
DROP TRIGGER IF EXISTS trg_doc_epoch_inc_del ON public.legal_documents;
CREATE TRIGGER trg_doc_epoch_inc_ins
  AFTER INSERT ON public.legal_documents
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_doc_epoch_inc_ins_stmt();
CREATE TRIGGER trg_doc_epoch_inc_upd
  AFTER UPDATE ON public.legal_documents
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_doc_epoch_inc_upd_stmt();
CREATE TRIGGER trg_doc_epoch_inc_del
  AFTER DELETE ON public.legal_documents
  REFERENCING OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_doc_epoch_inc_del_stmt();

-- ============================================================================
-- 4. geometry_imports (KML/KMZ)
-- ============================================================================
-- Original: trg_geometry_epoch_inc AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW (no column list, no WHEN)

CREATE OR REPLACE FUNCTION public.trg_geometry_epoch_inc_ins_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT n.project_id
    FROM new_table n
    WHERE n.project_id IS NOT NULL
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_geometry_epoch_inc_upd_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT n.project_id
    FROM new_table n
    WHERE n.project_id IS NOT NULL
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_geometry_epoch_inc_del_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.projects
  SET preparation_epoch = preparation_epoch + 1,
      updated_at = now()
  WHERE id IN (
    SELECT DISTINCT o.project_id
    FROM old_table o
    WHERE o.project_id IS NOT NULL
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_geometry_epoch_inc ON public.geometry_imports;
DROP TRIGGER IF EXISTS trg_geometry_epoch_inc_ins ON public.geometry_imports;
DROP TRIGGER IF EXISTS trg_geometry_epoch_inc_upd ON public.geometry_imports;
DROP TRIGGER IF EXISTS trg_geometry_epoch_inc_del ON public.geometry_imports;
CREATE TRIGGER trg_geometry_epoch_inc_ins
  AFTER INSERT ON public.geometry_imports
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_geometry_epoch_inc_ins_stmt();
CREATE TRIGGER trg_geometry_epoch_inc_upd
  AFTER UPDATE ON public.geometry_imports
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_geometry_epoch_inc_upd_stmt();
CREATE TRIGGER trg_geometry_epoch_inc_del
  AFTER DELETE ON public.geometry_imports
  REFERENCING OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_geometry_epoch_inc_del_stmt();