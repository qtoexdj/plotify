---
title: SDD 008 Creador de Matriz - Handoff
aliases:
  - SDD 008 Creador de Matriz
  - Creador de Matriz Escrituras
date: 2026-06-03
status: futuro
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - legal
  - ux
related:
  - "[[SDD 007 Escrituras Variable Resolution]]"
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[Variables Escritura Compraventa - Fuentes de Obtencion]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
---

# SDD 008 Creador de Matriz - Handoff

## Estado

Futuro SDD. No es el feature activo. El feature activo es
`specs/009-titulo-dominio-vigente` (agente de titulo de dominio vigente).
SDD 008 parte cuando SDD 009 cierre, porque la matriz consume los tokens de
titulo que SDD 009 define.

## Punto de partida

SDD 008 debe partir desde ambos contratos:

- `specs/007-escrituras-variable-resolution/handoff-sdd-008.md` (contrato base)
- `specs/009-titulo-dominio-vigente/handoff-sdd-008-addendum.md` (tokens de
  titulo, bloques narrativos, reglas de clausulas por alertas y lista de los 7
  entregables para cerrar la generacion de documentos)

Cambio de catalogo a tener presente: las claves `matriz.inscripcion_*` y
`matriz.adquisicion_*` ya no existen; todo template debe usar
`titulo.inscripciones[]` y los bloques `titulo.comparecencia_vendedor_texto` /
`titulo.clausula_primero_texto` aprobados. La clausula SEXTO (servidumbre)
renderiza sus referencias registrales desde `titulo.inscripciones[]`.

Despues de SDD 008 queda la consolidacion UX legal en proyectos (redisenar el
Centro de Control Legal conociendo el flujo proyecto -> matriz completo).

## Regla de arquitectura

El creador de matriz no resuelve variables desde documentos fuente. Consume:

- `escritura_cases.variable_snapshot`
- `escritura_cases.evidence_snapshot`
- `escritura_cases.readiness_gates`
- catalogo canonico de variables
- decisiones de revision legal

Si una variable esta mal, el usuario vuelve al Centro de Control Legal del SDD
007, corrige la variable y crea un nuevo snapshot.

## Alcance esperado

- Interfaz profesional nueva de matriz/minuta DOCX, construida desde cero.
- Bloques y clausulas versionadas.
- Tokens de variables estructurados.
- Insercion de variables aprobadas.
- Reordenamiento de clausulas permitido.
- Vistas de template, resuelto y evidencia.
- Generacion DOCX desde snapshot aprobado.
- Flujo de revision juridica antes de uso externo.

## No alcance

- OCR.
- Extraccion de dominio vigente, SII, SAG o plano.
- Matching de roles por lote.
- Correccion/aprobacion de variables extraidas.
- Aprobacion juridica implicita por IA.
- Generacion de sellos, CVE, repertorio final o certificaciones de notaria/CBR.

## Relacion con SDD 007

La visualizacion, correccion y aprobacion de variables extraidas vive en el
Centro de Control Legal del SDD 007. SDD 008 puede mostrar valores, estado y
evidencia dentro de la matriz, pero consume snapshots y no debe mutar
`variable_resolutions` directamente.

Si en la matriz se detecta un dato malo, se vuelve al SDD 007, se corrige la
variable y se crea un nuevo snapshot del caso de escritura.

## Primera decision tecnica del SDD 008

Definir el formato fuente de la matriz:

1. ProseMirror JSON como fuente canonica y export HTML/Jinja/DOCX.
2. HTML/Jinja como fuente canonica con edicion visual.
3. Representacion dual normalizada.

Recomendacion: ProseMirror JSON como fuente canonica, porque los tokens de
variables y la evidencia requieren atributos estructurados.
