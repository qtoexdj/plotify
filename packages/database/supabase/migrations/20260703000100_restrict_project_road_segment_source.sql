-- SDD 014: restrict accepted project road segment sources.
-- Existing projects must be reloaded or transformed into explicit canonical segments.

ALTER TABLE public.project_road_segments
  DROP CONSTRAINT IF EXISTS project_road_segments_source_type_check,
  ADD CONSTRAINT project_road_segments_source_type_check
    CHECK (source_type = ANY (ARRAY[
      'kmz'::text,
      'kml'::text,
      'dxf'::text,
      'dwg'::text,
      'manual'::text
    ]));

COMMENT ON COLUMN public.project_road_segments.source_type IS
  'Road segment source: KMZ/KML/DXF/DWG import or manual entry.';
