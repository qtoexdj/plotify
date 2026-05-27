-- Actualizar restricción check de la columna estado en la tabla projects para admitir estados del MVP de Plotify (draft, imported, validated, operational)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_estado_check;

ALTER TABLE public.projects ADD CONSTRAINT projects_estado_check CHECK (
  estado = ANY (ARRAY[
    'draft'::text,
    'imported'::text,
    'validated'::text,
    'operational'::text,
    'activo'::text,
    'inactivo'::text
  ])
);
