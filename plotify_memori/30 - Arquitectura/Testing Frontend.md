# Testing Frontend

**Tag:** #frontend #testing
**Relacionado:** [[00 - Home]], [[Tech Stack Frontend]], [[Como Agregar un Test]]

---

## Stack

| Herramienta | Version | Notas |
|-----------|---------|-------|
| Vitest | ^4.0.17 | Runner de tests |
| Ambiente | node | No jsdom, tests de unidad/integracion |

## Estructura de tests

18 archivos de test en :

| Archivo | Tipo | Descripcion |
|---------|------|-------------|
| lot-routes.test.ts | Integracion | API routes de lotes |
| lots.service.test.ts | Unidad | Servicio de lotes |
| fase1-*.test.ts | Feature | Tests fase 1 |
| fase2-*.test.ts | Feature | Tests fase 2 |
| fase3-*.test.ts | Feature | Tests fase 3 |
| fase4-*.test.ts | Feature | Tests fase 4 (documentos) |
| geometry/engine-e2e.test.ts | E2E | 27 tests del motor geometrico |

## Test de geometria E2E

Ubicacion: 

- 27 tests que cubren el motor geometrico completo.
- Usa mocks de datos centrados en Santiago, Chile (WGS84).
- Prueba: calculo de areas, servidumbre, deslindes, conversion UTM.

## Comandos



## Mocks

- Supabase client se mockea para no tocar la DB real.
- Geometrias de prueba son GeoJSON mock centrado en Santiago.

## Relacionado
- [[Como Agregar un Test]] — Guia paso a paso
- [[Motor de Geometrias]] — Lo que testea engine-e2e