# Como Agregar un Feature

**Tag:** #guia
**Relacionado:** [[00 - Home]], [[Convenciones de Codigo]], [[Servicios lib-services]], [[Server Actions]]

---

## Checklist general

### 1. Base de Datos (si aplica)

- Crear migracion SQL si hay cambios de schema.
- Agregar enums si hay nuevos estados.
- Agregar politicas RLS para nuevas tablas.
- Actualizar tipos TypeScript con Supabase CLI.

### 2. Service Layer

- Crear o modificar `src/lib/services/nuevo-feature.service.ts`.
- Encapsular todas las queries a Supabase.
- Usar el server client para server-side, browser client para client-side.
- Retornar datos tipados.

### 3. Validacion

- Crear schema Zod en `src/lib/validations/nuevo-feature.schema.ts`.
- Definir tipos de input y output.

### 4. Server Action o API Route

- Si es mutacion desde formulario → Server Action en `src/actions/`.
- Si es endpoint REST → API Route en `src/app/api/`.
- Validar input con Zod al inicio.
- Llamar al servicio.
- Manejar errores y retornar resultado.

### 5. Componentes UI

- Crear componentes en la carpeta correspondiente.
- Server Component por defecto.
- Client Component solo si necesita interactividad.
- Usar shadcn/ui como base.

### 6. Rutas (si aplica)

- Crear carpeta en `src/app/(dashboard)/nueva-ruta/`.
- Agregar link al sidebar si corresponde.
- Respetar route groups para layout correcto.

### 7. Tests

- Escribir tests unitarios para el servicio.
- Escribir tests de integracion para la API route.
- Correr `npm run test` y verificar que todo pase.

### 8. Lint y Type Check

```bash
npm run lint
npx tsc --noEmit
npm run test
```

## Ejemplo: Agregar campo nuevo a Lot

1. Migracion SQL: `ALTER TABLE lots ADD COLUMN nuevo_campo text;`
2. Regenerar tipos desde la DB Docker existente: `supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > packages/database/types/database.generated.ts`
3. Schema Zod: agregar `nuevo_campo: z.string()` al validation schema.
4. Service: agregar funcion `updateNuevoCampo()` al `lots.service.ts`.
5. Server Action: crear o modificar action que llame al servicio.
6. UI: agregar input en el componente de detalle de lote.
7. Tests: test unitario del servicio + test del componente.

## Relacionado
- [[Como Agregar un Test]] — Escribir tests para el feature
- [[Servicios lib-services]] — Patron de servicios
- [[Server Actions]] — Patron de acciones
