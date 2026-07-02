# Tipografía de marca — Plotify

## Wordmark

- Fuente: **Bricolage Grotesque**
- Peso: **SemiBold (600)**
- Tracking: normal (no condensar ni expandir)
- Caja: "Plotify" siempre con P mayúscula, resto minúscula

## Jerarquía en piezas de marca

| Nivel     | Fuente              | Peso | Uso                          |
| --------- | ------------------- | ---- | ---------------------------- |
| Display   | Bricolage Grotesque | 600  | Wordmark, titulares grandes  |
| Título    | Bricolage Grotesque | 500  | Subtítulos, cifras           |
| Cuerpo    | Onest               | 400  | Texto corrido                |
| Etiqueta  | Onest               | 500  | Labels, botones              |
| Datos     | Geist Mono          | 400  | ROL, folios, montos, códigos |

## Nota sobre los SVG con texto

`logo-horizontal.svg` y `logo-vertical.svg` usan `<text>` con Bricolage Grotesque: se ven correctos **dentro de la web app** (la fuente ya está cargada). Para usos externos (imprenta, redes, letreros) hay que convertir el texto a curvas: abrir el SVG en Affinity Designer → seleccionar texto → Capa → Convertir a curvas → exportar como `logo-horizontal-outlined.svg`.
