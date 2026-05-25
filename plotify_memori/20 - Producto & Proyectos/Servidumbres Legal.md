# Servidumbres Legal

**Tag:** #legal #geometria
**Relacionado:** [[00 - Home]], [[Generacion de Documentos]], [[Texto de Deslinde]], [[Motor de Geometrias]]

---

## Vision general

La servidumbre de transito es el derecho de paso por un lote para acceder a otros. Plotify calcula automaticamente el area afectada y genera el texto legal correspondiente.

## Calculo geometrico

Archivo: 

### calculateServidumbre

1. Toma la geometria del camino (road).
2. Hace buffer con radio = ancho/2.
3. Intersecta con la geometria del lote.
4. Retorna: area en m2 afectada + poligono de interseccion.

### analyzeServidumbreBoundaries

Clasifica cada arista del poligono de servidumbre:

- **internal**: limita con area util del propio lote.
- **neighbor**: limita con servidumbre de lote vecino.
- **external**: limita con algo fuera de la subdivision.

Usa:
- **Guardrail #1**: Micro ray-casting (proyeccion 0.1m en normal outward).
- **Guardrail #2**: Fusion de segmentos colineales (3 grados tolerancia).

### Deteccion de vecinos

Algoritmo que detecta que lotes son vecinos:
- Proyecta longitud de cara sobre lote vecino.
- Determina cual lote colinda con la servidumbre.

## Texto legal

El texto de servidumbre se genera en el deslinde:



Se integra como un articulo de la escritura (articulo 5).

## Variables de servidumbre en EscrituraVariables



## Relacionado
- [[Motor de Geometrias]] — Calculo geometrico completo
- [[Texto de Deslinde]] — Como se integra en el deslinde
- [[Generacion de Documentos]] — Pipeline completo