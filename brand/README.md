# Brand kit — Plotify

Repositorio de marca. Los SVG de esta carpeta son los **maestros**; todo lo rasterizado (PNG, ICO) se genera con el script, nunca a mano.

## Concepto

Tres capas isométricas: la superior (verde, trazo sólido) es **el plano**; las dos inferiores (trazo discontinuo) son las **capas de información** — catastro, escrituras, historial. La geometría vive en una grilla de 64 unidades, trazos de 3 u, dash 6/5.

## Archivos

| Archivo                       | Uso                                                       |
| ----------------------------- | --------------------------------------------------------- |
| `mark.svg`                    | Símbolo solo, fondo claro (sidebar, loading, splash)      |
| `mark-dark.svg`               | Símbolo solo, fondo oscuro                                |
| `logo-horizontal[-dark].svg`  | Lockup símbolo + wordmark (headers, docs)                 |
| `logo-vertical[-dark].svg`    | Lockup vertical (portadas, pantallas de carga)            |
| `favicon.svg`                 | Versión simplificada en tile oscuro (2 capas, sin dashes) |
| `colors.md` / `typography.md` | Especificación                                            |
| `scripts/generate_assets.py`  | Genera `dist/` y los assets de la web                     |
| `dist/`                       | Generado — no editar                                      |

## Regla de simplificación

Bajo 64 px el símbolo completo se rompe (los dashes se empastan). Por eso el favicon y los tamaños ≤48 px usan la **versión simplificada**: rombo + una sola capa, trazos sólidos y más gruesos. Nunca escalar el mark completo a favicon.

## Zona de protección y tamaños mínimos

- Protección: un "rombo" de margen (¼ del ancho del símbolo) por cada lado; nada de texto ni bordes dentro.
- Logo completo: mínimo 80 px de ancho (48 px en contextos densos).
- Símbolo: mínimo 20 px; bajo eso, usar la versión simplificada.

## Regenerar assets

```bash
cd apps/api && ./.venv/bin/python ../../brand/scripts/generate_assets.py
```

Genera `brand/dist/` y copia a la web: `apps/web/src/app/favicon.ico`, `icon.svg`, `apple-icon.png`, `manifest.webmanifest` (Next.js los sirve automáticamente por convención de nombres) y `apps/web/public/icons/`.
