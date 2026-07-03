-- SDD 014: servidumbre precision engine persistence.
-- Stores interpreted road segments and per-lot servitude results for the viewer and legal documents.

CREATE TABLE IF NOT EXISTS public.project_road_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  geometry_id uuid REFERENCES geometries(id) ON DELETE SET NULL,
  name text,
  input_geometry jsonb NOT NULL,
  input_mode text NOT NULL,
  width_m numeric,
  edge_side text,
  footprint_geometry jsonb,
  source_type text NOT NULL DEFAULT 'kmz',
  status text NOT NULL DEFAULT 'needs_review',
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_road_segments_input_mode_check
    CHECK (input_mode = ANY (ARRAY['centerline'::text, 'footprint'::text, 'edge'::text])),
  CONSTRAINT project_road_segments_edge_side_check
    CHECK (edge_side IS NULL OR edge_side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text])),
  CONSTRAINT project_road_segments_source_type_check
    CHECK (source_type = ANY (ARRAY['kmz'::text, 'kml'::text, 'dxf'::text, 'dwg'::text, 'manual'::text])),
  CONSTRAINT project_road_segments_status_check
    CHECK (status = ANY (ARRAY['ready'::text, 'needs_review'::text, 'invalid'::text])),
  CONSTRAINT project_road_segments_width_positive_check
    CHECK (width_m IS NULL OR width_m > 0),
  CONSTRAINT project_road_segments_centerline_width_check
    CHECK (input_mode <> 'centerline'::text OR width_m IS NOT NULL),
  CONSTRAINT project_road_segments_edge_review_check
    CHECK (
      input_mode <> 'edge'::text
      OR status <> 'ready'::text
      OR (width_m IS NOT NULL AND edge_side IS NOT NULL)
    ),
  CONSTRAINT project_road_segments_ready_footprint_check
    CHECK (status <> 'ready'::text OR footprint_geometry IS NOT NULL)
);

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS servidumbre_widths_m numeric[],
  ADD COLUMN IF NOT EXISTS servidumbre_ancho_label text,
  ADD COLUMN IF NOT EXISTS servidumbre_geometry jsonb,
  ADD COLUMN IF NOT EXISTS servidumbre_sources jsonb,
  ADD COLUMN IF NOT EXISTS servidumbre_calculation_status text NOT NULL DEFAULT 'not_calculated',
  ADD COLUMN IF NOT EXISTS servidumbre_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS servidumbre_calculation_version text;

ALTER TABLE public.lots
  DROP CONSTRAINT IF EXISTS lots_servidumbre_calculation_status_check,
  ADD CONSTRAINT lots_servidumbre_calculation_status_check
    CHECK (servidumbre_calculation_status = ANY (ARRAY[
      'not_calculated'::text,
      'calculated'::text,
      'needs_review'::text,
      'official_override'::text,
      'error'::text
    ]));

CREATE INDEX IF NOT EXISTS idx_project_road_segments_project_id
  ON public.project_road_segments (project_id);

CREATE INDEX IF NOT EXISTS idx_project_road_segments_project_ready
  ON public.project_road_segments (project_id, status)
  WHERE status = 'ready'::text;

CREATE INDEX IF NOT EXISTS idx_project_road_segments_geometry_id
  ON public.project_road_segments (geometry_id)
  WHERE geometry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lots_servidumbre_project_overlay
  ON public.lots (project_id, servidumbre_calculation_status)
  WHERE servidumbre_geometry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lots_servidumbre_geometry_gin
  ON public.lots USING gin (servidumbre_geometry)
  WHERE servidumbre_geometry IS NOT NULL;

ALTER TABLE public.project_road_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_road_segments_admin_all ON public.project_road_segments;
DROP POLICY IF EXISTS project_road_segments_member_select ON public.project_road_segments;
DROP POLICY IF EXISTS project_road_segments_service_role ON public.project_road_segments;

CREATE POLICY project_road_segments_admin_all
  ON public.project_road_segments
  FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_road_segments.project_id
        AND public.is_org_admin(p.organization_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_road_segments.project_id
        AND public.is_org_admin(p.organization_id)
    )
  );

CREATE POLICY project_road_segments_member_select
  ON public.project_road_segments
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_road_segments.project_id
        AND (
          public.is_org_user(p.organization_id)
          OR public.is_project_vendor(p.id)
        )
    )
  );

CREATE POLICY project_road_segments_service_role
  ON public.project_road_segments
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_road_segments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_road_segments TO service_role;

COMMENT ON TABLE public.project_road_segments IS
  'SDD14 road or path segments interpreted during onboarding for servitude calculations.';

COMMENT ON COLUMN public.project_road_segments.project_id IS
  'Project that owns this road segment; references projects(id) and scopes tenant access.';

COMMENT ON COLUMN public.project_road_segments.geometry_id IS
  'Optional source geometry row that produced this interpreted road segment; references geometries(id).';

COMMENT ON COLUMN public.project_road_segments.input_geometry IS
  'Original GeoJSON geometry selected as road infrastructure before servitude interpretation.';

COMMENT ON COLUMN public.project_road_segments.input_mode IS
  'Road interpretation mode: centerline buffers by width, footprint uses polygon directly, edge requires review.';

COMMENT ON COLUMN public.project_road_segments.width_m IS
  'Total road or servitude width in meters used to derive the legal footprint for centerline and edge inputs.';

COMMENT ON COLUMN public.project_road_segments.edge_side IS
  'Side selection for edge-derived roads: left, right or both; required before an edge segment can be ready.';

COMMENT ON COLUMN public.project_road_segments.footprint_geometry IS
  'Normalized GeoJSON Polygon or MultiPolygon footprint used for lot x road servitude intersection.';

COMMENT ON COLUMN public.project_road_segments.source_type IS
  'Road segment source: KMZ/KML/DXF/DWG import or manual entry.';

COMMENT ON COLUMN public.project_road_segments.status IS
  'Readiness status for automatic calculation: ready, needs_review or invalid.';

COMMENT ON COLUMN public.project_road_segments.sort_order IS
  'Stable presentation order for multiple road segments in onboarding and review screens.';

COMMENT ON COLUMN public.lots.servidumbre_widths_m IS
  'Unique sorted servitude widths in meters affecting this lot, for example {5,10}.';

COMMENT ON COLUMN public.lots.servidumbre_ancho_label IS
  'Legal display label for servitude widths, for example 5, 10 or 5 y 10.';

COMMENT ON COLUMN public.lots.servidumbre_geometry IS
  'GeoJSON Polygon or MultiPolygon of the affected servitude area rendered in the project viewer.';

COMMENT ON COLUMN public.lots.servidumbre_sources IS
  'JSON traceability of road segment ids and widths that contributed to the persisted servitude result.';

COMMENT ON COLUMN public.lots.servidumbre_calculation_status IS
  'Calculation state for persisted servitude values: not_calculated, calculated, needs_review, official_override or error.';

COMMENT ON COLUMN public.lots.servidumbre_calculated_at IS
  'Timestamp of the latest automatic servitude calculation accepted for this lot.';

COMMENT ON COLUMN public.lots.servidumbre_calculation_version IS
  'Logical version of the servitude calculation engine that produced the persisted result.';
