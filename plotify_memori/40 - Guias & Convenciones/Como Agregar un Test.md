# Como Agregar un Test

**Tag:** #guia #testing
**Relacionado:** [[00 - Home]], [[Testing Frontend]], [[Como Agregar un Feature]]

---

## Stack

- **Vitest** ^4.0.17
- Ambiente: node (no jsdom)

## Donde poner los tests

```
tests/
├── *.test.ts              # Tests de nivel raiz (routes, services)
├── fase*-*.test.ts        # Tests por fase de feature
└── lib/
    └── geometry/
        └── engine-e2e.test.ts  # Tests E2E del motor geometrico
```

## Patron para test de servicio

```typescript
import { describe, it, expect } from 'vitest';
import { getLotById } from '@/lib/services/lots.service';

describe('lots.service', () => {
  it('should return lot by id', async () => {
    const result = await getLotById('test-project', 'test-lot');
    expect(result).toBeDefined();
    expect(result?.id).toBe('test-lot');
  });
});
```

## Patron para test de API route

```typescript
import { describe, it, expect } from 'vitest';

describe('GET /api/projects/[id]/lots', () => {
  it('should return lots for a project', async () => {
    // Mock supabase response
    // Call route handler
    // Assert response
  });
});
```

## Patron para test de geometria

```typescript
import { describe, it, expect } from 'vitest';
import { calculateServidumbre } from '@/lib/geometry/servidumbre';

describe('calculateServidumbre', () => {
  it('should calculate area correctly', () => {
    // Usar GeoJSON mock centrado en Santiago
    const result = calculateServidumbre(roadGeojson, lotGeojson);
    expect(result.area_m2).toBeGreaterThan(0);
  });
});
```

## Comandos

```bash
npm run test           # Todos los tests
npm run test -- --watch # Modo watch
```

## Mocks

- Supabase client se mockea para no tocar DB real.
- Geometrias de prueba son GeoJSON mock (Santiago, Chile).
- Usar `vi.mock()` de Vitest para mockear modulos.

## Buenas practicas

- Un test por caso/escenario.
- Nombres descriptivos: `it('should reject double reservation')`.
- Tests atomicos (no dependen de otros tests).
- Mockear dependencias externas (Supabase, APIs).

## Relacionado
- [[Testing Frontend]] — Overview del testing
- [[Motor de Geometrias]] — Lo que testea el E2E de geometria
