---
description: Orquestacion tecnica para procesar archivos CAD siguiendo la arquitectura satelite de Plotify
---

## Pasos

1. **Sincronizacion de arquitectura**
   - Usa `plotify_memori/Arquitectura General.md` y las notas de CAD/geometria disponibles en memoria.
   - Alinea `CADParser`, transformacion de coordenadas y persistencia con el modelo vigente.

2. **Verificacion de estandares**
   - Consulta documentacion actualizada con `ctx7`/Context7 cuando el cambio dependa de FastAPI, Next.js, librerias CAD o librerias geoespaciales.
   - Revisa `.agents/skills` y selecciona skills aplicables.

3. **Preparacion del entorno**
   - Backend: usa `apps/api/venv`.
   - Frontend: usa scripts `pnpm --filter web`.
   - Valida dependencias como `ezdxf`, `pyproj` y `shapely` cuando el cambio toque parsing o transformacion.

4. **Implementacion por capas**
   - Contratos/schemas: define entradas y salidas estables para GeoJSON/FeatureCollection.
   - Servicios: encapsula parsing, transformacion y simplificacion.
   - API/UI: valida tenant/proyecto y evita exponer datos cross-tenant.

5. **Validacion**
   - Verifica parsing en trabajo no bloqueante cuando sea pesado.
   - Valida simplificacion de geometria antes de responder al visor.
   - Ejecuta typecheck/test del area modificada.
