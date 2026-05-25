# Tech Stack Frontend

**Tag:** #frontend #stack
**Relacionado:** [[00 - Home]], [[Estructura de Carpetas Frontend]], [[Arquitectura General]]

---

## Framework y Runtime

| Tecnologia | Version | Notas |
|-----------|---------|-------|
| Next.js | 16.2.1 | App Router, RSC por defecto |
| React | 19.2.4 | Server/Client components |
| TypeScript | ^5 | Strict mode, path alias @/* |

## Estilos y UI

| Tecnologia | Version | Notas |
|-----------|---------|-------|
| Tailwind CSS | ^4 | Con @tailwindcss/postcss |
| shadcn/ui | radix-maia style | 35 componentes instalados |
| Radix UI | ^1.4.3 | Primitivas accesibles |
| HugeIcons | ^3.3.0 | Iconos core-free |

## Formularios y Validacion

| Tecnologia | Version | Notas |
|-----------|---------|-------|
| Zod | ^4.2.1 | Validacion runtime |
| React Hook Form | ^7.69.0 | Gestion de formularios |
| @hookform/resolvers | ^5.2.2 | Bridge Zod + RHF |

## Mapas y Geoespacial

| Tecnologia | Version | Notas |
|-----------|---------|-------|
| MapLibre GL | ^5.19.0 | Via wrapper mapcn |
| Turf.js | ^7.3.4 | 10 paquetes @turf/* |
| proj4 | ^2.20.2 | Conversion UTM/WGS84 |
| @tmcw/togeojson | ^7.1.2 | KML a GeoJSON |
| JSZip | ^3.10.1 | Descompresion KMZ |

## Base de Datos y Auth

| Tecnologia | Version | Notas |
|-----------|---------|-------|
| @supabase/supabase-js | ^2.89.0 | Cliente JS |
| @supabase/ssr | ^0.8.0 | SSR con cookies |

## Utilidades

| Tecnologia | Uso |
|-----------|-----|
| Pino ^10.3.1 | Logging estructurado |
| jsPDF ^4.2.1 | Export PDF |
| @dnd-kit/* | Drag and drop (template builder) |
| ProseKit ^0.19.0 | Editor de texto enriquecido |
| next-themes | Dark/light mode |
| sonner | Toast notifications |
| react-resizable-panels | Paneles redimensionables |
| embla-carousel-react | Carrusel UI |
| qrcode.react | Generacion QR |
| browser-image-compression | Compresion de imagenes |

## Testing

| Tecnologia | Version | Notas |
|-----------|---------|-------|
| Vitest | ^4.0.17 | Node environment |

## Relacionado
- [[Estructura de Carpetas Frontend]] — Organizacion del codigo
- [[Componentes Clave]] — Componentes UI principales