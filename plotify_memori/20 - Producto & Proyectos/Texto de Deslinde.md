# Texto de Deslinde

**Tag:** #legal #geometria
**Relacionado:** [[00 - Home]], [[Generacion de Documentos]], [[Motor de Geometrias]], [[Servidumbres Legal]]

---

## Vision general

Genera descripciones legales de limites (deslindes) en el formato oficial de escrituras chilenas.

## Archivo

`src/lib/legal/deslinde-generator.ts`

## Funciones principales

### generateDeslindeText

Produce un string legal formateado como:

> LOTE UNO, de una superficie aproximada de CINCO MIL TRESCIENTOS TREINTA Y TRES METROS CUADRADOS, de los cuales DIECISIETE METROS CUADRADOS quedan afectas a servidumbre de transito, y deslinda: ...

### formatGroupedBoundaries

- Agrupa deslindes por direccion cardinal (Norte, Sur, Este, Oeste).
- Consolida segmentos repetidos.
- Maneja pluralizacion automatica.
- Agrega sufijos legales (todos de la misma subdivision, servidumbre de por medio).

### convertLotNumbersInText

Convierte numeros de lote en texto a palabras en espanol:

> Lote 31 → lote treinta y uno

## Dependencias

- `numberToWords()` y `numberToWordsLower()` — Conversion numeros a palabras (formato legal chileno).
- Datos del lote: area, servidumbre, limites (distancia, colinda, tipo).

## Fallbacks

Cuando falta data, usa placeholders `___________` en el texto legal para que el usuario complete manualmente.

## Formato legal chileno

El formato sigue las convenciones de las escrituras publicas en Chile:
- Numeros en mayusculas y palabras.
- Referencias a colindas por nombre y numero de lote.
- Agrupacion por puntos cardinales.
- Sufijos legales estandarizados.

## Relacionado
- [[Motor de Geometrias]] — De donde vienen los datos geometricos
- [[Servidumbres Legal]] — Texto de servidumbre complementario
- [[Generacion de Documentos]] — Como se integra en el pipeline
