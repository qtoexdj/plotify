# Colores de marca — Plotify

Paleta mínima. Nada fuera de esto en piezas de marca.

| Rol               | Hex       | Uso                                                         |
| ----------------- | --------- | ----------------------------------------------------------- |
| Verde Plotify     | `#16A34A` | El plano (rombo superior del isotipo). Único color de marca |
| Verde oscuro (AA) | `#15803D` | Verde sobre blanco cuando hay texto pequeño (contraste AA)  |
| Tinta             | `#111111` | Símbolo y wordmark en fondo claro; fondo de app icon        |
| Blanco            | `#FFFFFF` | Símbolo y wordmark en fondo oscuro                          |
| Gris medio        | `#6B7280` | Texto secundario en piezas de marca                         |
| Gris claro        | `#E5E7EB` | Fondos y divisores                                          |
| Gris fondo        | `#F8FAFC` | Fondo claro alternativo                                     |

## Reglas

- El verde `#16A34A` se usa **solo en el rombo superior** del isotipo y en acentos puntuales; las capas inferiores siempre van en tinta o blanco.
- Sobre fondo verde pleno, símbolo y texto van en blanco.
- Contraste: `#16A34A` sobre blanco da ~3.3:1 — sirve para el símbolo y texto grande, **no** para texto pequeño; usar `#15803D` (4.5:1) en ese caso.
- **Decisión resuelta (2026-07-03)**: el acento de la interfaz **se mantiene carmesí** `#A93439`/`#C24444` (claro/oscuro); el verde `#16A34A` **se mantiene** como único color de marca del isotipo. No se mezclan: el verde nunca aparece en botones/badges/estados de la UI, y el carmesí nunca aparece en el logo. Ambos conviven en el mismo sidebar (fondo oscuro fijo) sin conflicto porque ocupan roles distintos. El verde AA (`#15803D` de esta tabla) es además el valor que usa el token `--success` de la UI para estados "disponible" — coincidencia útil, no acoplamiento: si este verde de marca cambiara, `--success` en `globals.css` no se vería afectado (son tokens independientes).
- Flujo de recolor a futuro (si el usuario decide cambiar el verde de marca): editar los SVG maestros de `brand/*.svg` → correr `brand/scripts/generate_assets.py` (regenera favicons/app icons/manifest) → actualizar `PLANE_FILL`/`--brand` en `apps/web/src/components/ui/brand-mark-paths.tsx` y `globals.css`. Cero cambios adicionales de código porque el color del plano ya está tokenizado.
